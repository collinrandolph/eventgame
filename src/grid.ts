// Conceptual 3D layer: a layered grid of 2 m cells that compiles down to the
// kernel's location/connection graph. Nothing is rendered; the grid exists so
// that every place and link the solver reasons about physically exists.
//
//   grid (cells x layers)  ->  zones (named groups of floor cells, one layer each)
//                          ->  links (open boundaries, portals, vertical access)
//                          ->  WorldDef locations + connections (ticks from distance)
//
// Cell characters (per layer):
//   ' ' '.'     void / solid ground          '%'  solid building (not enterable)
//   '~'         water (impassable)           '#'  wall of an enterable building
//   '+'         portal (door, gate, fence gap, street blocker); a run of '+' is one portal
//   'S' 'L' 'M' stairs / ladder / manhole: links the same char at the same x,y
//               on the layer above or below; belongs to the zone around it
//   streets.char  street surface, split automatically into intersections and segments
//   other       floor; the layer's legend maps the char to a zone id
//
// Streets: every street cell must lie inside at least one named street rectangle.
// Cells under two or more names are intersections; the rest are segments. To keep
// the solver's graph small, a segment or intersection with nothing on it and exactly
// two plain links is folded into a single connection, and an empty dead end is dropped.

import type { ConnectionDef, Deduction, EndingDef, GoalTemplate, PersonDef, Props, Rule, ThingDef, TriggerDef, WorldDef } from "./types.js";

export type Cell = [x: number, y: number, z: number];

export interface GridZone {
  id: string;
  name: string;
  /** Vehicles may drive here. */
  road?: boolean;
  /** Pass-through space (a stairwell floor): folds away like an empty street when nothing is on it. */
  transit?: boolean;
  /** Starting location props (e.g. dark, lightCircuit). */
  props?: Props;
  desc?: string;
}

export interface GridLinkSpec {
  /** Any cell belonging to the link: a portal cell, a vertical-access cell, or a floor cell on an open boundary. */
  at: Cell;
  id?: string;
  barrier?: string;
  /** Force foot-only (e.g. a fence gap between two road zones). */
  road?: boolean;
}

export interface StreetName {
  name: string;
  /** Inclusive [x0, y0, x1, y1]. */
  rect: [number, number, number, number];
}

export interface GridSpec {
  cellMeters: number;
  ticksPerCell: number;
  /** Extra path length, in cells, for changing layers. */
  floorChangeCells: number;
  layers: Record<string, string[]>;
  legend: Record<string, Record<string, string>>;
  zones: GridZone[];
  streets?: { layer: number; char: string; names: StreetName[] };
  links?: GridLinkSpec[];
  /**
   * Links that don't come from cells: lifts that join a lobby straight to chosen floors.
   * Several can share one barrier (one elevator car serves many floors).
   */
  extraLinks?: { id: string; a: string; b: string; ticks: number; barrier?: string }[];
  /**
   * Zone pairs the author intends to be linked; "@street" matches any street zone.
   * Missing = error; any other link touching an authored zone = warning.
   */
  expect?: [string, string][];
}

type Placed<T> = Omit<T, "location"> & { location?: string | null; at?: Cell };

export interface GridWorldFile {
  id: string;
  name: string;
  grid: GridSpec;
  things: Placed<ThingDef>[];
  people: Placed<PersonDef>[];
  /** Shared rule libraries, loaded from rules/<name>.json. */
  ruleSets?: string[];
  rules: Rule[];
  triggers: TriggerDef[];
  deductions?: Deduction[];
  milestones?: import("./types.js").Milestone[];
  optionals?: import("./types.js").Optional[];
  deadline?: number;
  endings: EndingDef[];
  fallbackGoals: GoalTemplate[];
}

export interface SpatialLink {
  id: string;
  a: string;
  b: string;
  /** "street" = a run of empty street (or stairwell) folded into one connection; "lift" = an extra link. */
  kind: "open" | "portal" | "vertical" | "street" | "lift";
  width: number;
  cells: number;
  ticks: number;
  road: boolean;
  barrier?: string;
  /** Cells that make up the link: portal cells, both vertical-access cells, or both sides of an open boundary. */
  where: Cell[];
}

export interface SpatialZone {
  id: string;
  name: string;
  z: number;
  cells: number;
  rooms: number;
  anchor: Cell;
  /** Set for automatic street zones. */
  street?: "intersection" | "segment";
  /** Folded into a connection or dropped as an empty dead end: not a kernel location. */
  folded?: boolean;
}

export interface SpatialReport {
  cellMeters: number;
  zones: SpatialZone[];
  links: SpatialLink[];
  /** Zone id of every floor cell, per layer: zoneGrid[z][y][x]. */
  zoneGrid: Record<string, (string | null)[][]>;
  warnings: string[];
}

const VOID = new Set([" ", ".", "%", "~"]);
const VERTICAL = new Set(["S", "L", "M"]);
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const unkey = (k: string) => k.split(",").map(Number) as Cell;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

interface ZoneDef extends GridZone {
  street?: "intersection" | "segment";
  /** Street names covering this zone's cells. */
  names?: string[];
}

interface LinkRec {
  id?: string;
  a: string;
  b: string;
  kind: SpatialLink["kind"];
  width: number;
  /** Entry cells inside zone a / zone b. */
  sideA: Cell[];
  sideB: Cell[];
  cells: Set<string>;
  /** Cells between the two entry cells (crossing a door, a boundary, a folded street). */
  cross: number;
  spec?: GridLinkSpec;
}

export function compileGrid(file: GridWorldFile): { def: WorldDef; report: SpatialReport } {
  const g = file.grid;
  const errors: string[] = [];
  const warnings: string[] = [];
  const layers = new Map(Object.entries(g.layers).map(([z, rows]) => [Number(z), rows]));
  const ch = (x: number, y: number, z: number): string => layers.get(z)?.[y]?.[x] ?? " ";
  const legendFor = (z: number) => g.legend[String(z)] ?? {};

  // ---- streets: split street cells into intersections and segments ----
  const streetZoneAt = new Map<string, string>();
  const streetZones: ZoneDef[] = [];
  if (g.streets) {
    const { layer: sz, char: sc, names } = g.streets;
    const rows = layers.get(sz) ?? [];
    const namesAt = (x: number, y: number) =>
      names.filter((n) => x >= n.rect[0] && x <= n.rect[2] && y >= n.rect[1] && y <= n.rect[3]).map((n) => n.name);
    const sig = new Map<string, string>();
    rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== sc) return;
        const ns = namesAt(x, y);
        if (!ns.length) errors.push(`street cell at ${key(x, y, sz)} is not inside any named street`);
        sig.set(key(x, y, sz), ns.sort().join("|"));
      }),
    );
    const used = new Map<string, number>();
    for (const [start, s] of sig) {
      if (streetZoneAt.has(start) || !s) continue;
      const ns = s.split("|");
      const base = ns.length > 1 ? `x:${ns.map(slug).join("/")}` : `s:${slug(ns[0])}`;
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      const id = ns.length > 1 && n === 1 ? base : `${base}:${n}`;
      streetZones.push({ id, name: ns.join(" & "), road: true, street: ns.length > 1 ? "intersection" : "segment", names: ns });
      const queue = [start];
      streetZoneAt.set(start, id);
      while (queue.length) {
        const [x, y, z] = unkey(queue.pop()!);
        for (const [dx, dy] of DIRS) {
          const k = key(x + dx, y + dy, z);
          if (sig.get(k) === s && !streetZoneAt.has(k)) {
            streetZoneAt.set(k, id);
            queue.push(k);
          }
        }
      }
    }
  }
  const allZones: ZoneDef[] = [...g.zones, ...streetZones];
  const zoneDefs = new Map(allZones.map((z) => [z.id, z]));

  // ---- classify cells and assign floor cells to zones ----
  const zoneOf = new Map<string, string>();
  const zoneCells = new Map<string, Cell[]>();
  const zoneLayer = new Map<string, number>();
  const portals: Cell[] = [];
  const verticals: Cell[] = [];

  const addToZone = (zid: string, c: Cell) => {
    zoneOf.set(key(...c), zid);
    if (!zoneCells.has(zid)) zoneCells.set(zid, []);
    zoneCells.get(zid)!.push(c);
    const prev = zoneLayer.get(zid);
    if (prev !== undefined && prev !== c[2]) errors.push(`zone ${zid} appears on layers ${prev} and ${c[2]}; a zone lives on one layer`);
    zoneLayer.set(zid, c[2]);
  };

  for (const [z, rows] of layers) {
    const legend = legendFor(z);
    rows.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (VOID.has(c) || c === "#") return;
        if (c === "+") return void portals.push([x, y, z]);
        if (VERTICAL.has(c)) return void verticals.push([x, y, z]);
        const street = streetZoneAt.get(key(x, y, z));
        if (street) return addToZone(street, [x, y, z]);
        if (g.streets && z === g.streets.layer && c === g.streets.char) return; // unnamed street, already reported
        const zid = legend[c];
        if (!zid) return void errors.push(`unknown char '${c}' at ${key(x, y, z)}`);
        if (!zoneDefs.has(zid)) return void errors.push(`legend maps '${c}' to unknown zone ${zid}`);
        addToZone(zid, [x, y, z]);
      });
    });
  }

  // Vertical access cells belong to the single zone around them.
  for (const [x, y, z] of verticals) {
    const around = new Set(DIRS.map(([dx, dy]) => zoneOf.get(key(x + dx, y + dy, z))).filter((v): v is string => !!v));
    if (around.size !== 1) errors.push(`${ch(x, y, z)} at ${key(x, y, z)} must touch exactly one zone (touches ${[...around].join(", ") || "none"})`);
    else addToZone([...around][0], [x, y, z]);
  }

  // ---- links ----
  const raw: LinkRec[] = [];
  const internalPortals = new Set<string>();

  // Open boundaries: floor cells of different zones touching directly.
  const open = new Map<string, LinkRec>();
  for (const [zid, cells] of zoneCells) {
    for (const [x, y, z] of cells) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const other = zoneOf.get(key(x + dx, y + dy, z));
        if (!other || other === zid) continue;
        const [a, b] = zid < other ? [zid, other] : [other, zid];
        const here: Cell = [x, y, z];
        const there: Cell = [x + dx, y + dy, z];
        const pair = `${a}|${b}`;
        let l = open.get(pair);
        if (!l) open.set(pair, (l = { a, b, kind: "open", width: 0, sideA: [], sideB: [], cells: new Set(), cross: 1 }));
        l.width++;
        (zid === a ? l.sideA : l.sideB).push(here);
        (zid === a ? l.sideB : l.sideA).push(there);
        l.cells.add(key(...here)).add(key(...there));
      }
    }
  }
  raw.push(...open.values());

  // Portals: 4-connected runs of '+'. Each run links the zones on its two sides.
  const portalSet = new Set(portals.map((c) => key(...c)));
  const seenPortal = new Set<string>();
  for (const start of portals) {
    if (seenPortal.has(key(...start))) continue;
    const run: Cell[] = [];
    const queue = [start];
    seenPortal.add(key(...start));
    while (queue.length) {
      const c = queue.pop()!;
      run.push(c);
      for (const [dx, dy] of DIRS) {
        const n: Cell = [c[0] + dx, c[1] + dy, c[2]];
        if (portalSet.has(key(...n)) && !seenPortal.has(key(...n))) {
          seenPortal.add(key(...n));
          queue.push(n);
        }
      }
    }
    const sides: { zone: string; cell: Cell }[] = [];
    for (const [x, y, z] of run) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const p = zoneOf.get(key(x - dx, y - dy, z));
        const q = zoneOf.get(key(x + dx, y + dy, z));
        if (p && q) sides.push({ zone: p, cell: [x - dx, y - dy, z] }, { zone: q, cell: [x + dx, y + dy, z] });
      }
    }
    const zones = [...new Set(sides.map((s) => s.zone))];
    const where = key(...start);
    if (zones.length === 0) errors.push(`portal at ${where} has no floor on opposite sides`);
    else if (zones.length > 2) errors.push(`portal at ${where} touches more than two zones (${zones.join(", ")})`);
    else if (zones.length === 1) for (const c of run) internalPortals.add(key(...c));
    else {
      const [a, b] = zones.sort();
      raw.push({
        a,
        b,
        kind: "portal",
        width: run.length,
        sideA: sides.filter((s) => s.zone === a).map((s) => s.cell),
        sideB: sides.filter((s) => s.zone === b).map((s) => s.cell),
        cells: new Set(run.map((c) => key(...c))),
        cross: 2,
      });
    }
  }

  // Vertical access: the same char directly above.
  for (const [x, y, z] of verticals) {
    const c = ch(x, y, z);
    const up = ch(x, y, z + 1);
    const down = ch(x, y, z - 1);
    if (up !== c && down !== c) errors.push(`${c} at ${key(x, y, z)} has no matching ${c} above or below`);
    if (up !== c) continue;
    const lo = zoneOf.get(key(x, y, z));
    const hi = zoneOf.get(key(x, y, z + 1));
    if (!lo || !hi) continue;
    if (lo === hi) {
      errors.push(`${c} at ${key(x, y, z)} links a zone to itself`);
      continue;
    }
    const [a, b] = lo < hi ? [lo, hi] : [hi, lo];
    const loCell: Cell = [x, y, z];
    const hiCell: Cell = [x, y, z + 1];
    raw.push({
      a,
      b,
      kind: "vertical",
      width: 1,
      sideA: [a === lo ? loCell : hiCell],
      sideB: [a === lo ? hiCell : loCell],
      cells: new Set([key(...loCell), key(...hiCell)]),
      cross: g.floorChangeCells,
    });
  }

  // ---- zones: anchors, in-zone distances, connectivity, rooms ----
  const anchors = new Map<string, Cell>();
  const zonesReport: SpatialZone[] = [];
  const bfsIn = (zid: string, from: Cell[]): Map<string, number> => {
    const d = new Map<string, number>();
    const queue: Cell[] = [];
    for (const c of from) if (!d.has(key(...c))) d.set(key(...c), 0), queue.push(c);
    for (let i = 0; i < queue.length; i++) {
      const [x, y, z] = queue[i];
      for (const [dx, dy] of DIRS) {
        const k = key(x + dx, y + dy, z);
        if (d.has(k)) continue;
        if (zoneOf.get(k) === zid || internalPortals.has(k)) {
          d.set(k, d.get(key(x, y, z))! + 1);
          queue.push([x + dx, y + dy, z]);
        }
      }
    }
    return d;
  };
  const anchorDist = new Map<string, Map<string, number>>();
  for (const zd of allZones) {
    const cells = zoneCells.get(zd.id);
    if (!cells?.length) {
      if (!zd.street) errors.push(`zone ${zd.id} has no cells`);
      continue;
    }
    const cx = cells.reduce((s, c) => s + c[0], 0) / cells.length;
    const cy = cells.reduce((s, c) => s + c[1], 0) / cells.length;
    const anchor = cells.reduce((best, c) => (Math.hypot(c[0] - cx, c[1] - cy) < Math.hypot(best[0] - cx, best[1] - cy) ? c : best));
    anchors.set(zd.id, anchor);
    const d = bfsIn(zd.id, [anchor]);
    anchorDist.set(zd.id, d);
    const unreached = cells.filter((c) => !d.has(key(...c)));
    if (unreached.length) errors.push(`zone ${zd.id} is split: ${unreached.length} cells unreachable from its center (first at ${key(...unreached[0])})`);

    // Rooms: wall-bounded pieces of the zone (internal doors separate rooms).
    const inZone = new Set(cells.map((c) => key(...c)));
    const seen = new Set<string>();
    let rooms = 0;
    for (const c of cells) {
      if (seen.has(key(...c))) continue;
      rooms++;
      const q: Cell[] = [c];
      seen.add(key(...c));
      while (q.length) {
        const [x, y, z] = q.pop()!;
        for (const [dx, dy] of DIRS) {
          const k = key(x + dx, y + dy, z);
          if (inZone.has(k) && !seen.has(k)) {
            seen.add(k);
            q.push([x + dx, y + dy, z]);
          }
        }
      }
    }
    zonesReport.push({ id: zd.id, name: zd.name, z: zoneLayer.get(zd.id)!, cells: cells.length, rooms, anchor, ...(zd.street ? { street: zd.street } : {}) });
  }

  // ---- lifts and other links that don't come from cells ----
  for (const x of g.extraLinks ?? []) {
    const [a, b] = x.a < x.b ? [x.a, x.b] : [x.b, x.a];
    const ea = anchors.get(a), eb = anchors.get(b);
    if (!ea || !eb) {
      errors.push(`extra link ${x.id}: unknown zone ${!ea ? a : b}`);
      continue;
    }
    raw.push({ a, b, kind: "lift", width: 1, sideA: [ea], sideB: [eb], cells: new Set(), cross: Math.round(x.ticks / g.ticksPerCell), spec: { at: ea, id: x.id, barrier: x.barrier } });
  }

  // ---- link specs (ids, barriers, road overrides) ----
  for (const spec of g.links ?? []) {
    const k = key(...spec.at);
    const hit = raw.filter((l) => l.cells.has(k));
    if (hit.length !== 1) errors.push(`link spec at ${k} matches ${hit.length} links (needs exactly 1)`);
    else if (hit[0].spec) errors.push(`two link specs for ${hit[0].a}~${hit[0].b}`);
    else {
      hit[0].spec = spec;
      if (spec.barrier && hit[0].kind === "open") errors.push(`barrier ${spec.barrier} on an open boundary (${hit[0].a}~${hit[0].b}); barriers need a portal or vertical access`);
    }
  }

  // ---- street segment names, from the intersections they touch ----
  for (const zd of streetZones) {
    if (zd.street !== "segment") continue;
    const own = zd.names![0];
    const cross = new Set<string>();
    for (const l of raw) {
      const other = l.a === zd.id ? l.b : l.b === zd.id ? l.a : null;
      const od = other ? zoneDefs.get(other) : undefined;
      if (od?.street === "intersection") for (const n of od.names!) if (n !== own) cross.add(n);
    }
    const c = [...cross].sort();
    zd.name = c.length >= 2 ? `${own}, ${c[0]} to ${c[1]}` : c.length === 1 ? `${own} off ${c[0]}` : own;
    const rep = zonesReport.find((z) => z.id === zd.id);
    if (rep) rep.name = zd.name;
  }

  // ---- things and people ----
  const place = (what: string, at: Cell | undefined, location: string | null | undefined): string | null => {
    if (!at) return location ?? null;
    const zid = zoneOf.get(key(...at));
    if (!zid) errors.push(`${what} is placed at ${key(...at)}, which is not floor in any zone`);
    return zid ?? null;
  };
  const occupied = new Set<string>();
  for (const x of [...file.things, ...file.people]) if (x.at) occupied.add(zoneOf.get(key(...x.at)) ?? "");

  // ---- fold empty streets ----
  // Distances inside each zone from every link's entry cells.
  const entry = (l: LinkRec, zid: string) => (l.a === zid ? l.sideA : l.sideB);
  const toAnchor = (l: LinkRec, zid: string) => Math.min(...entry(l, zid).map((c) => anchorDist.get(zid)?.get(key(...c)) ?? Infinity));
  const dists = new Map<LinkRec, { a: number; b: number }>(raw.map((l) => [l, { a: toAnchor(l, l.a), b: toAnchor(l, l.b) }]));
  let links = raw;
  const folded = new Set<string>();
  // Stairwell floors (transit zones) also fold through their stairs.
  const plain = (zd: ZoneDef) => (l: LinkRec) => !l.spec && (l.kind === "open" || l.kind === "street" || (!!zd.transit && l.kind === "vertical"));
  const foldable = [...streetZones, ...allZones.filter((z) => z.transit)];
  for (let changed = true; changed; ) {
    changed = false;
    for (const zd of foldable) {
      if (folded.has(zd.id) || occupied.has(zd.id) || !zoneCells.has(zd.id)) continue;
      const mine = links.filter((l) => l.a === zd.id || l.b === zd.id);
      if (!mine.every(plain(zd))) continue;
      if (mine.length === 1) {
        // Empty dead end: nothing to do there, so drop it.
        links = links.filter((l) => l !== mine[0]);
      } else if (mine.length === 2) {
        const [l1, l2] = mine;
        const p = l1.a === zd.id ? l1.b : l1.a;
        const q = l2.a === zd.id ? l2.b : l2.a;
        if (p === q) continue;
        const through = Math.min(...entry(l2, zd.id).map((c) => bfsIn(zd.id, entry(l1, zd.id)).get(key(...c)) ?? Infinity));
        const dp = l1.a === p ? dists.get(l1)!.a : dists.get(l1)!.b;
        const dq = l2.a === q ? dists.get(l2)!.a : dists.get(l2)!.b;
        const [a, b] = p < q ? [p, q] : [q, p];
        const merged: LinkRec = {
          a,
          b,
          kind: "street",
          width: Math.min(l1.width, l2.width),
          sideA: a === p ? entry(l1, p) : entry(l2, q),
          sideB: a === p ? entry(l2, q) : entry(l1, p),
          cells: new Set([...l1.cells, ...l2.cells, ...(zoneCells.get(zd.id) ?? []).map((c) => key(...c))]),
          cross: l1.cross + l2.cross + through,
        };
        dists.set(merged, { a: a === p ? dp : dq, b: a === p ? dq : dp });
        links = [...links.filter((l) => l !== l1 && l !== l2), merged];
      } else continue;
      folded.add(zd.id);
      changed = true;
    }
  }
  for (const z of zonesReport) if (folded.has(z.id)) z.folded = true;

  // ---- final links ----
  const usedIds = new Set<string>();
  const finalLinks: SpatialLink[] = links.map((l) => {
    let id = l.spec?.id ?? `${l.a}~${l.b}`;
    for (let n = 2; usedIds.has(id); n++) id = `${l.spec?.id ?? `${l.a}~${l.b}`}#${n}`;
    usedIds.add(id);
    const d = dists.get(l)!;
    const cells = d.a + d.b + l.cross;
    const bothRoad = !!zoneDefs.get(l.a)?.road && !!zoneDefs.get(l.b)?.road;
    return {
      id,
      a: l.a,
      b: l.b,
      kind: l.kind,
      width: l.width,
      cells,
      ticks: Math.max(1, Math.round(cells * g.ticksPerCell)),
      road: l.kind !== "vertical" && bothRoad && l.width >= 2 && l.spec?.road !== false,
      barrier: l.spec?.barrier,
      where: [...l.cells].map(unkey),
    };
  });

  // ---- intended vs actual links ----
  // Checked against the drawing itself (before folding), so folded stairwells and streets still count.
  if (g.expect) {
    const isStreet = (id: string) => !!zoneDefs.get(id)?.street;
    const pair = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`);
    const expected = new Set(g.expect.map(([a, b]) => pair(a, b)));
    const satisfied = new Set<string>();
    for (const l of raw) {
      const sa = isStreet(l.a), sb = isStreet(l.b);
      if (sa && sb) continue;
      const k = sa || sb ? pair(sa ? l.b : l.a, "@street") : pair(l.a, l.b);
      if (expected.has(k)) satisfied.add(k);
      else warnings.push(`unplanned link ${l.spec?.id ?? pair(l.a, l.b)} (${l.kind}${l.cells.size ? ` at ${[...l.cells][0]}` : ""})`);
    }
    for (const e of expected) if (!satisfied.has(e)) errors.push(`expected link ${e} is missing from the grid`);
  }

  const barrierConn = new Map(finalLinks.filter((l) => l.barrier).map((l) => [l.barrier!, l.id]));
  const things: ThingDef[] = file.things.map(({ at, ...t }) => ({
    ...t,
    location: t.kind === "barrier" ? (barrierConn.get(t.id) ?? null) : place(t.id, at, t.location),
  }));
  for (const t of things) if (t.kind === "barrier" && !t.location) errors.push(`barrier ${t.id} is not on any link`);
  const people: PersonDef[] = file.people.map(({ at, ...p }) => ({ ...p, location: place(p.id, at, p.location) ?? "" }));

  if (errors.length) throw new Error(`Grid for ${file.id} is invalid:\n  ${errors.join("\n  ")}`);

  const zoneGrid: SpatialReport["zoneGrid"] = {};
  for (const [z, rows] of layers) {
    const w = Math.max(...rows.map((r) => r.length));
    zoneGrid[String(z)] = rows.map((_, y) => Array.from({ length: w }, (_, x) => zoneOf.get(key(x, y, z)) ?? null));
  }

  const live = allZones.filter((z) => zoneCells.has(z.id) && !folded.has(z.id));
  const connections: ConnectionDef[] = finalLinks.map((l) => ({
    id: l.id,
    a: l.a,
    b: l.b,
    ticks: l.ticks,
    road: l.road,
    ...(l.barrier ? { barrier: l.barrier } : {}),
  }));

  return {
    def: {
      id: file.id,
      name: file.name,
      locations: live.map((z) => ({
        id: z.id,
        name: z.name,
        ...(z.desc ? { desc: z.desc } : {}),
        ...(z.props ? { props: z.props } : {}),
        layer: zoneLayer.get(z.id)!,
        ...(z.street ? { street: z.street } : {}),
      })),
      connections,
      things,
      people,
      rules: file.rules,
      triggers: file.triggers,
      endings: file.endings,
      fallbackGoals: file.fallbackGoals,
    },
    report: { cellMeters: g.cellMeters, zones: zonesReport, links: finalLinks, zoneGrid, warnings },
  };
}
