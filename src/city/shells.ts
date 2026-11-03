// Building shells: a North American building type (kits/shells.json) laid out as a ground floor of 2 m cells.
//
// A shell is built from masses, the way real buildings are: a main mass, then wings, ells, vestibules, towers,
// apses and bays attached to its sides. Each mass is a rectangle of cells; the building's outline comes from how
// they combine, and from corners cut at 45 degrees (a bay window's sides, a polygonal apse, a corner shop's door).
// Cards give choices (which side, where along it, whether it's there at all), so the same type comes out in
// different shapes on different seeds.
//
// Inside, each mass carries its own floor plan as nested splits ('y' runs front, south, to back; 'x' west to east),
// with a one-cell wall between parts; a room may be a courtyard, open to the sky. A mass can instead join a room of
// another mass (a bay is part of the living room). Interior doors are cut on shared walls; outside doors on the
// front-most wall of a side. Each room becomes its own zone, so every room is a place the engine knows.
//
// At 2 m cells a wall costs a whole cell (it's drawn 4 px thin), so shells come out somewhat larger than their real
// references to fit their rooms.

import { readFileSync } from "node:fs";

export type Side = "north" | "south" | "east" | "west";
export type Corner = "ne" | "nw" | "se" | "sw";
type Range = [number, number];

/** min: the fewest cells across (default 2; 1 suits a restroom or a corridor). court: open to the sky. */
export interface RoomNode { room: string; name: string; theme: string; share?: number; min?: number; court?: boolean }
export interface SplitNode { split: "x" | "y"; parts: PlanNode[]; share?: number }
export type PlanNode = RoomNode | SplitNode;

export interface MassCard {
  id: string;
  /** The main mass: its size in metres (w along the street, d deep). */
  size?: { w: Range; d: Range };
  /**
   * Any other mass: attached to a side of an earlier one, overlapping its wall. along: its length on that side;
   * out: how far it reaches out, counting the shared wall. at: where along the side, 0 (west or north end) to 1, or
   * a list to choose from; between: anywhere in a range instead. A list of sides is a choice.
   */
  attach?: { to: string; side: Side | Side[]; along: Range; out: Range; at?: number | number[]; between?: Range };
  /** Chance it's there at all (default 1). */
  chance?: number;
  plan?: PlanNode;
  /** A mass with no plan of its own, part of this room (a bay of the living room). */
  joins?: string;
  /** Corners cut at 45 degrees, n cells along each wall. A list of corners is a choice; "outer" cuts both corners on the side away from the mass it's attached to (a bay, an apse). */
  cut?: { corner: Corner | Corner[] | "outer"; n: number; chance?: number }[];
  /** How the mass looks from outside, if not like the building: an archetype and its height. */
  arch?: string;
  storeys?: number;
  /** Rises above its footprint in the 3/4 view (a tower). */
  rise?: boolean;
}

export interface ShellCard {
  name: string;
  reference: string;
  keep: string[];
  masses: MassCard[];
  lot: { w: Range; front: Range };
  archetype: string;
  connect: [string, string, number?][];
  entrance: { room: string; width?: number };
  doors?: { room: string; side: Side; width?: number }[];
  /** Mirror west to east half the time. */
  mirror?: boolean;
  /** Yard pieces in front of the entrance: a porch deck n metres deep, or a drive to one side. */
  porch?: { d: number; full?: number };
}

export interface ShellPlan {
  w: number;
  d: number;
  /** '#' wall, '+' door, '.' outside, otherwise a room id. */
  cells: string[][];
  rooms: { id: string; name: string; theme: string; court: boolean }[];
  entrance: number[];
  /** Wall cells cut at 45 degrees: the corner of the cell that's outside. */
  cuts: [number, number, Corner][];
  /** Masses drawn with their own look, in local cells. */
  looks: { rect: [number, number, number, number]; arch?: string; storeys?: number; rise?: boolean }[];
  /** Every mass as placed, with the corners cut off it: the building's shape in 3D terms. */
  masses: { id: string; rect: [number, number, number, number]; side?: Side; cuts: { corner: Corner; n: number }[]; storeys?: number; rise?: boolean; arch?: string }[];
  /** Courtyards, in local cells (every court cell). */
  courts: [number, number][];
}

export const loadShells = (file = "kits/shells.json") => JSON.parse(readFileSync(file, "utf8")).shells as Record<string, ShellCard>;

const CELL_M = 2;
const cellsOf = (metres: number) => Math.max(1, Math.round(metres / CELL_M));

/** The fewest cells a plan node needs along an axis. */
function minOf(node: PlanNode, axis: "x" | "y"): number {
  if ("room" in node) return node.min ?? 2;
  const mins = node.parts.map((p) => minOf(p, axis));
  return node.split === axis ? mins.reduce((s, v) => s + v, 0) + node.parts.length - 1 : Math.max(...mins);
}

export function planShell(card: ShellCard, R: () => number): ShellPlan {
  const pick = <T,>(xs: T | T[]) => (Array.isArray(xs) ? xs[Math.floor(R() * xs.length)] : xs);
  const inRange = ([lo, hi]: Range) => cellsOf(lo + R() * (hi - lo));

  // ---- place the masses ----
  type Rect = [number, number, number, number];
  const placed = new Map<string, { card: MassCard; rect: Rect; side?: Side }>();
  for (const mc of card.masses) {
    if (mc.chance !== undefined && R() >= mc.chance) continue;
    if (mc.size) { placed.set(mc.id, { card: mc, rect: [0, 0, inRange(mc.size.w) - 1, inRange(mc.size.d) - 1] }); continue; }
    const a = mc.attach!, parent = placed.get(a.to);
    if (!parent) continue;
    // a part with rooms keeps at least two cells inside its walls along the side (four with them), so it never
    // comes out as a 2 m sliver; a bay's one-cell depth opens into the room it joins
    const side = pick(a.side), along = Math.max(mc.plan || mc.joins ? 4 : 2, inRange(a.along)), out = Math.max(mc.plan ? 4 : mc.joins ? 3 : 2, inRange(a.out));
    const [px0, py0, px1, py1] = parent.rect;
    const span = side === "north" || side === "south" ? px1 - px0 + 1 : py1 - py0 + 1;
    const at = a.between ? a.between[0] + R() * (a.between[1] - a.between[0]) : a.at === undefined ? 0.5 : pick(a.at);
    const s0 = Math.round(at * Math.max(0, span - along));
    const r: Rect = side === "south" ? [px0 + s0, py1, px0 + s0 + along - 1, py1 + out - 1]
      : side === "north" ? [px0 + s0, py0 - out + 1, px0 + s0 + along - 1, py0]
      : side === "east" ? [px1, py0 + s0, px1 + out - 1, py0 + s0 + along - 1]
      : [px0 - out + 1, py0 + s0, px0, py0 + s0 + along - 1];
    placed.set(mc.id, { card: mc, rect: r, side });
  }
  const OUTER: Record<Side, Corner[]> = { south: ["sw", "se"], north: ["nw", "ne"], east: ["ne", "se"], west: ["nw", "sw"] };
  const masses = [...placed.values()];
  const minX = Math.min(...masses.map((p) => p.rect[0])), minY = Math.min(...masses.map((p) => p.rect[1]));
  for (const p of masses) p.rect = [p.rect[0] - minX, p.rect[1] - minY, p.rect[2] - minX, p.rect[3] - minY];
  const w = Math.max(...masses.map((p) => p.rect[2])) + 1, d = Math.max(...masses.map((p) => p.rect[3])) + 1;

  // ---- the footprint, with corners cut ----
  const inRect = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
  const inside = Array.from({ length: d }, () => Array<boolean>(w).fill(false));
  for (const p of masses) for (let y = p.rect[1]; y <= p.rect[3]; y++) for (let x = p.rect[0]; x <= p.rect[2]; x++) inside[y][x] = true;
  const diag = new Map<string, Corner>();
  const applied = new Map<(typeof masses)[number], { corner: Corner; n: number }[]>();
  for (const p of masses) for (const c of p.card.cut ?? []) {
    if (c.chance !== undefined && R() >= c.chance) continue;
    const corners = c.corner === "outer" ? (p.side ? OUTER[p.side] : []) : [pick(c.corner)];
    for (const corner of corners) cutCorner(p, corner, c.n);
  }
  function cutCorner(p: (typeof masses)[number], corner: Corner, n: number) {
    applied.set(p, [...(applied.get(p) ?? []), { corner, n }]);
    const [x0, y0, x1, y1] = p.rect;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      // distance in from the corner along both walls
      const u = corner.endsWith("e") ? x1 - x : x - x0, v = corner.startsWith("s") ? y1 - y : y - y0;
      if (u + v > n - 1) continue;
      const other = masses.some((q) => q !== p && inRect(q.rect, x, y));
      if (other) continue;
      if (u + v < n - 1) inside[y][x] = false; else diag.set(`${x},${y}`, corner);
    }
  }
  const F = (x: number, y: number) => inside[y]?.[x] === true;

  // ---- rooms: each mass's plan inside its own walls ----
  const cells = Array.from({ length: d }, (_, y) => Array.from({ length: w }, (_, x): string => (F(x, y) ? "#" : ".")));
  const rooms: ShellPlan["rooms"] = [];
  const lay = (node: PlanNode, x0: number, y0: number, x1: number, y1: number) => {
    if ("room" in node) {
      rooms.push({ id: node.room, name: node.name, theme: node.theme, court: !!node.court });
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (F(x, y)) cells[y][x] = node.room;
      return;
    }
    const n = node.parts.length, along = node.split === "x" ? x1 - x0 + 1 : y1 - y0 + 1, room = along - (n - 1);
    const mins = node.parts.map((p) => minOf(p, node.split));
    if (room < mins.reduce((s, v) => s + v, 0)) throw new Error(`${card.name}: ${along} cells is too small for its ${node.split} split (needs ${mins.reduce((s, v) => s + v, 0) + n - 1})`);
    const total = node.parts.reduce((s, p) => s + (p.share ?? 1), 0);
    const sizes = node.parts.map((p, i) => Math.max(mins[i], Math.round(((p.share ?? 1) / total) * room)));
    let over = sizes.reduce((s, v) => s + v, 0) - room;
    for (const i of sizes.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a])) { const give = Math.min(over, sizes[i] - mins[i]); sizes[i] -= give; over -= give; }
    if (over < 0) sizes[sizes.indexOf(Math.max(...sizes))] -= over;
    let at = 0;
    node.parts.forEach((p, i) => {
      if (node.split === "x") lay(p, x0 + at, y0, x0 + at + sizes[i] - 1, y1);
      else lay(p, x0, y1 - at - sizes[i] + 1, x1, y1 - at);
      at += sizes[i] + 1;
    });
  };
  for (const p of masses) {
    const [x0, y0, x1, y1] = p.rect;
    if (p.card.plan) lay(p.card.plan, x0 + 1, y0 + 1, x1 - 1, y1 - 1);
    else if (p.card.joins) {
      // a bay belongs to the room it actually stands against: the card's room if it's there, otherwise the one it
      // meets most across the shared wall
      const [dx, dy] = p.side === "south" ? [0, -2] : p.side === "north" ? [0, 2] : p.side === "east" ? [-2, 0] : [2, 0];
      const met = new Map<string, number>();
      for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
        const c = cells[y + dy]?.[x + dx];
        if (c && c !== "#" && c !== ".") met.set(c, (met.get(c) ?? 0) + 1);
      }
      const room = met.has(p.card.joins) ? p.card.joins : [...met].sort((a2, b2) => b2[1] - a2[1])[0]?.[0] ?? p.card.joins;
      for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) if (F(x, y)) cells[y][x] = room;
    }
  }
  // the outer wall: any footprint cell beside the outside, and every cut cell (cut cells meet corner to corner, so
  // a cell that only touches the outside diagonally, behind a cut, stays inside)
  const outerWall = (x: number, y: number) => diag.has(`${x},${y}`) || [[0, -1], [-1, 0], [1, 0], [0, 1]].some(([dx, dy]) => !F(x + dx, y + dy));
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) if (F(x, y) && outerWall(x, y)) cells[y][x] = "#";
  for (const r of rooms) if (!cells.some((row) => row.includes(r.id))) throw new Error(`${card.name}: ${r.name} came out with no floor`);
  // a wall with the same room on both sides opens up (a bay joins its room)
  for (let y = 1; y < d - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (cells[y][x] !== "#" || outerWall(x, y)) continue;
    const [l, r, u, b] = [cells[y][x - 1], cells[y][x + 1], cells[y - 1][x], cells[y + 1][x]];
    const same = (a: string, c: string) => a === c && a !== "#" && a !== "." && a !== "+";
    if (same(l, r)) cells[y][x] = l; else if (same(u, b)) cells[y][x] = u;
  }

  // stubs and pillars: an inside wall cell with one room all around it (diagonals included) separates nothing, so
  // it's floor; peel until none are left (an outer wall, a cut, a door frame or a wall between rooms stays)
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 1; y < d - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (cells[y][x] !== "#" || outerWall(x, y)) continue;
      const around = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].map(([dx, dy]) => cells[y + dy][x + dx]);
      if (around.some((c) => c === "+" || c === ".")) continue;
      const rs = new Set(around.filter((c) => c !== "#"));
      if (rs.size === 1) { cells[y][x] = [...rs][0]; changed = true; }
    }
  }

  // a room in pieces (a bay that couldn't open onto its room) keeps its largest piece; the rest is wall
  for (const r of rooms) {
    const seen = new Set<string>(), pieces: [number, number][][] = [];
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      if (cells[y][x] !== r.id || seen.has(`${x},${y}`)) continue;
      const piece: [number, number][] = [], stack: [number, number][] = [[x, y]];
      seen.add(`${x},${y}`);
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        piece.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (cells[ny]?.[nx] === r.id && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); stack.push([nx, ny]); }
        }
      }
      pieces.push(piece);
    }
    pieces.sort((a, b) => b.length - a.length);
    for (const piece of pieces.slice(1)) for (const [x, y] of piece) cells[y][x] = "#";
  }

  // ---- doors ----
  const ids = new Set(rooms.map((r) => r.id));
  const at = (x: number, y: number) => cells[y]?.[x];
  const cut = (cands: [number, number][], width: number, what: string) => {
    if (!cands.length) throw new Error(`${card.name}: no wall for ${what}`);
    const runs: [number, number][][] = [];
    for (const c of cands) {
      const run = runs[runs.length - 1], prev = run?.[run.length - 1];
      if (prev && Math.abs(prev[0] - c[0]) + Math.abs(prev[1] - c[1]) === 1) run.push(c); else runs.push([c]);
    }
    const run = runs.sort((a, b) => b.length - a.length)[0], k = Math.min(width, run.length), s = Math.floor((run.length - k) / 2);
    const out = run.slice(s, s + k);
    for (const [x, y] of out) cells[y][x] = "+";
    return out;
  };
  for (const [a, b, width = 1] of card.connect) {
    if (!ids.has(a) || !ids.has(b)) continue; // a room whose mass isn't there this time
    const cands: [number, number][] = [];
    for (let y = 1; y < d - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (at(x, y) !== "#" || diag.has(`${x},${y}`)) continue;
      const lr = [at(x - 1, y), at(x + 1, y)], ud = [at(x, y - 1), at(x, y + 1)];
      if ((lr.includes(a) && lr.includes(b)) || (ud.includes(a) && ud.includes(b))) cands.push([x, y]);
    }
    if (cands.length) cut(cands, width, `${a} to ${b}`);
  }
  const outside = (room: string, side: Side, width: number) => {
    const [dx, dy] = side === "south" ? [0, 1] : side === "north" ? [0, -1] : side === "east" ? [1, 0] : [-1, 0];
    let cands: [number, number][] = [];
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      if (at(x, y) !== "#" || diag.has(`${x},${y}`)) continue;
      if (at(x - dx, y - dy) === room && !F(x + dx, y + dy)) cands.push([x, y]);
    }
    // the front-most stretch of that side
    if (!cands.length && room !== card.entrance.room) return []; // another mass covers that wall this time
    const key = ([x, y]: [number, number]) => dx * x + dy * y;
    const best = Math.max(...cands.map(key));
    cands = cands.filter((c) => key(c) === best);
    return cut(cands, width, `the ${side} door of ${room}`);
  };
  const entrance = outside(card.entrance.room, "south", card.entrance.width ?? 1).map(([x]) => x);
  for (const door of card.doors ?? []) if (ids.has(door.room)) outside(door.room, door.side, door.width ?? 1);

  const plan: ShellPlan = {
    w, d, cells, rooms, entrance,
    cuts: [...diag].map(([k, c]) => { const [x, y] = k.split(",").map(Number); return [x, y, c] as [number, number, Corner]; }),
    looks: masses.filter((p) => p.card.arch || p.card.storeys || p.card.rise).map((p) => ({ rect: p.rect, arch: p.card.arch, storeys: p.card.storeys, rise: p.card.rise })),
    masses: masses.map((p) => ({ id: p.card.id, rect: p.rect, side: p.side, cuts: applied.get(p) ?? [], storeys: p.card.storeys, rise: p.card.rise, arch: p.card.arch })),
    courts: cells.flatMap((row, y) => row.flatMap((c, x) => (rooms.find((r) => r.id === c)?.court ? [[x, y] as [number, number]] : []))),
  };
  return card.mirror && R() < 0.5 ? mirror(plan) : plan;
}

/** West becomes east: cells, doors, cut corners and mass rects. */
function mirror(p: ShellPlan): ShellPlan {
  const fx = (x: number) => p.w - 1 - x;
  const flip: Record<Corner, Corner> = { ne: "nw", nw: "ne", se: "sw", sw: "se" };
  return {
    ...p,
    cells: p.cells.map((row) => [...row].reverse()),
    entrance: p.entrance.map(fx).sort((a, b) => a - b),
    cuts: p.cuts.map(([x, y, c]) => [fx(x), y, flip[c]]),
    looks: p.looks.map((l) => ({ ...l, rect: [fx(l.rect[2]), l.rect[1], fx(l.rect[0]), l.rect[3]] })),
    masses: p.masses.map((ms) => ({ ...ms, rect: [fx(ms.rect[2]), ms.rect[1], fx(ms.rect[0]), ms.rect[3]], side: ms.side === "east" ? "west" : ms.side === "west" ? "east" : ms.side, cuts: ms.cuts.map((c) => ({ ...c, corner: flip[c.corner] })) })),
    courts: p.courts.map(([x, y]) => [fx(x), y]),
  };
}

/** Turned to face north: the front (and its entrance) on the north side, everything else turned with it. */
export function faceNorth(p: ShellPlan): ShellPlan {
  const fx = (x: number) => p.w - 1 - x, fy = (y: number) => p.d - 1 - y;
  const turn: Record<Corner, Corner> = { ne: "sw", nw: "se", se: "nw", sw: "ne" };
  const side: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };
  return {
    ...p,
    cells: [...p.cells].reverse().map((row) => [...row].reverse()),
    entrance: p.entrance.map(fx).sort((a, b) => a - b),
    cuts: p.cuts.map(([x, y, c]) => [fx(x), fy(y), turn[c]]),
    looks: p.looks.map((l) => ({ ...l, rect: [fx(l.rect[2]), fy(l.rect[3]), fx(l.rect[0]), fy(l.rect[1])] })),
    masses: p.masses.map((ms) => ({ ...ms, rect: [fx(ms.rect[2]), fy(ms.rect[3]), fx(ms.rect[0]), fy(ms.rect[1])], side: ms.side ? side[ms.side] : undefined, cuts: ms.cuts.map((c) => ({ ...c, corner: turn[c.corner] })) })),
    courts: p.courts.map(([x, y]) => [fx(x), fy(y)]),
  };
}
