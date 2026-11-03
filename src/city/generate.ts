// City generator: an urban layout at real scale, as a grid world plus the environment config that dresses it.
//
// Everything is measured in metres and converted to 2 m cells, so streets, blocks, setbacks and storeys keep real
// proportions next to a 1.75 m person:
//
//   local street   3 m sidewalk + 8 m road (two lanes) + 3 m sidewalk
//   avenue         3 m sidewalk + 14 m road (four lanes) + 3 m sidewalk
//   boulevard      4 m sidewalk + 7 m carriageway + 4 m planted median + 7 m carriageway + 4 m sidewalk
//   alley          2 m concrete apron + 6 m service lane + 2 m apron, through the middle of deep blocks
//
// Blocks between the streets are cut into halves (north and south of the alley) and then into parcels along the
// frontage. Land use, in order:
//   - one park block (lawns, paths, a knoll, a fountain, trees, benches);
//   - a plaza facing the boulevard (pavers, a fountain, planters);
//   - the brief's landmarks (enterable buildings), in south-facing halves so their entrances show in 3/4 view,
//     set back behind an entry plaza with planters;
//   - parking lots (stalls, parked cars, a curb cut across the sidewalk);
//   - everything else unenterable buildings, by district: downtown flush to the sidewalk, residential behind
//     front yards, industrial along one edge.
// Buildings whose south face looks onto an alley get fire escapes, and dumpsters stand in the alleys.
//
// The grid world compiles like any other (zones, links, streets). Open ground (sidewalks, plazas, parks, parking) is
// sidewalk, which belongs to the street it touches, so it's walkable without adding zones.

import type { EnvConfig } from "../env/build.js";
import type { GridWorldFile } from "../grid.js";

export const CELL_M = 2;
const m = (metres: number) => Math.max(1, Math.round(metres / CELL_M));

export interface Landmark {
  id: string;
  name: string;
  /** An archetype in sprites/env/archetypes.json. */
  type: string;
  /** Footprint in metres. */
  w: number;
  d: number;
  theme: string;
  /** Character recipe for the person standing at the entrance. */
  person?: string;
}
export interface CityBrief {
  id: string;
  name: string;
  seed: number;
  /** Size in cells (2 m). */
  w: number;
  h: number;
  landmarks: Landmark[];
}

type Rect = [number, number, number, number];
interface Street { name: string; vertical: boolean; road: Rect[]; oneWay?: boolean; alley?: boolean; kind: "local" | "avenue" | "boulevard" | "alley" }

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function generateCity(brief: CityBrief): { world: GridWorldFile; env: EnvConfig } {
  const R = rng(brief.seed), W = brief.w, H = brief.h;
  const grid: string[][] = Array.from({ length: H }, () => Array<string>(W).fill("%"));
  const fill = (r: Rect, c: string, only?: string) => {
    for (let y = Math.max(0, r[1]); y <= Math.min(H - 1, r[3]); y++) for (let x = Math.max(0, r[0]); x <= Math.min(W - 1, r[2]); x++) if (!only || only.includes(grid[y][x])) grid[y][x] = c;
  };
  const areas: NonNullable<EnvConfig["areas"]> = [];
  const features: NonNullable<EnvConfig["features"]> = [];
  const parcels: NonNullable<EnvConfig["parcels"]> = [];
  const streets: Street[] = [];
  const feature = (deco: string, x: number, y: number, ox = 0, oy = 0) => features.push({ deco, at: [x, y], ox, oy });

  // ---- streets: cross-sections in metres ----
  const SECTIONS = {
    local: { sw: m(3), road: m(8) },
    avenue: { sw: m(3), road: m(14) },
    boulevard: { sw: m(4), road: m(7), median: m(4) },
  };
  const width = (k: keyof typeof SECTIONS) => { const s = SECTIONS[k] as { sw: number; road: number; median?: number }; return 2 * s.sw + (s.median ? 2 * s.road + s.median : s.road); };
  const nV = Math.max(2, Math.round(W / 48)), nH = Math.max(2, Math.round(H / 40));
  const AVE = ["1st Ave", "2nd Ave", "3rd Ave", "4th Ave", "5th Ave", "6th Ave", "7th Ave", "8th Ave"];
  const ST = ["Elm St", "Grand Blvd", "Oak St", "Harbor St", "Mill St", "Cedar St", "Pine St"];
  const vBands: [number, number][] = [], hBands: [number, number][] = [];
  const avenueAt = Math.floor(nV / 2), boulevardAt = Math.floor(nH / 2);
  for (let i = 0; i < nV; i++) {
    const kind = i === avenueAt ? "avenue" : "local", wd = width(kind), s = SECTIONS[kind];
    const cx = Math.round(((i + 0.5) * W) / nV + (R() - 0.5) * 6), x0 = cx - (wd >> 1), x1 = x0 + wd - 1;
    vBands.push([x0, x1]);
    fill([x0, 0, x1, H - 1], "_");
    streets.push({ name: AVE[i] ?? `Ave ${i + 1}`, vertical: true, kind, road: [[x0 + s.sw, 0, x1 - s.sw, H - 1]] });
  }
  for (let j = 0; j < nH; j++) {
    const kind = j === boulevardAt ? "boulevard" : "local", wd = width(kind);
    const cy = Math.round(((j + 0.5) * H) / nH + (R() - 0.5) * 6), y0 = cy - (wd >> 1), y1 = y0 + wd - 1;
    hBands.push([y0, y1]);
    fill([0, y0, W - 1, y1], "_");
    if (kind === "boulevard") {
      const s = SECTIONS.boulevard, name = j < ST.length ? ST[1] : `Blvd ${j}`;
      const a: Rect = [0, y0 + s.sw, W - 1, y0 + s.sw + s.road - 1], b: Rect = [0, a[3] + s.median + 1, W - 1, a[3] + s.median + s.road];
      streets.push({ name: `${name} (westbound)`, vertical: false, kind, oneWay: true, road: [a] }, { name: `${name} (eastbound)`, vertical: false, kind, oneWay: true, road: [b] });
      areas.push({ kind: "median", rect: [0, a[3] + 1, W - 1, b[1] - 1] });
    } else {
      const s = SECTIONS.local, names = ST.filter((n) => n !== ST[1]);
      streets.push({ name: names[j] ?? `St ${j}`, vertical: false, kind, road: [[0, y0 + s.sw, W - 1, y1 - s.sw]] });
    }
  }
  for (const s of streets) for (const r of s.road) fill(r, "=");

  // ---- blocks: what lies between the street bands ----
  const between = (bands: [number, number][], max: number) => {
    const out: [number, number][] = [];
    let at = 0;
    for (const [a, b] of [...bands].sort((p, q) => p[0] - q[0])) { if (a - 1 >= at) out.push([at, a - 1]); at = b + 1; }
    if (at <= max - 1) out.push([at, max - 1]);
    return out;
  };
  const xs = between(vBands, W), ys = between(hBands, H);
  const blocks: { r: Rect; i: number; j: number }[] = [];
  xs.forEach(([x0, x1], i) => ys.forEach(([y0, y1], j) => blocks.push({ r: [x0, y0, x1, y1], i, j })));
  const mapCentre = [W / 2, H / 2];
  const dist = (r: Rect) => Math.hypot((r[0] + r[2]) / 2 - mapCentre[0], (r[1] + r[3]) / 2 - mapCentre[1]);
  const districtOf = (r: Rect) => ((r[0] + r[2]) / 2 > W * 0.78 ? "industrial" : dist(r) < Math.min(W, H) * 0.32 ? "downtown" : "residential");
  const districts: NonNullable<EnvConfig["districts"]> = blocks.map((b) => ({ kind: districtOf(b.r), rect: b.r }));

  // one park block: interior, not the most central (that's downtown), not industrial
  const interior = blocks.filter((b) => b.r[0] > 0 && b.r[1] > 0 && b.r[2] < W - 1 && b.r[3] < H - 1 && districtOf(b.r) !== "industrial");
  const park = interior.sort((a, b) => dist(a.r) - dist(b.r))[Math.min(interior.length - 1, 2)];

  // ---- halves: an alley through deep blocks; the halves are what parcels face ----
  interface Half { r: Rect; facesAlley: boolean; district: string; cursor: number }
  const halves: Half[] = [];
  let alleyNo = 0;
  // an alley: a 6 m lane between 2 m concrete aprons, so no building ever stands on the road
  const ALLEY = m(6), APRON = m(2);
  for (const b of blocks) {
    const [x0, y0, x1, y1] = b.r, district = districtOf(b.r);
    if (b === park) continue;
    if (y1 - y0 + 1 >= 26) {
      const a0 = Math.floor((y0 + y1) / 2) - (ALLEY >> 1), a1 = a0 + ALLEY - 1;
      // the lane runs out across the sidewalks to the road on either side
      const left = vBands.find(([, bx1]) => bx1 + 1 === x0), right = vBands.find(([bx0]) => bx0 - 1 === x1);
      const ax0 = left ? left[1] - SECTIONS[left === vBands[avenueAt] ? "avenue" : "local"].sw + 1 : x0;
      const ax1 = right ? right[0] + SECTIONS[right === vBands[avenueAt] ? "avenue" : "local"].sw - 1 : x1;
      fill([x0, a0 - APRON, x1, a1 + APRON], "_");
      areas.push({ kind: "apron", rect: [x0, a0 - APRON, x1, a0 - 1] }, { kind: "apron", rect: [x0, a1 + 1, x1, a1 + APRON] });
      fill([ax0, a0, ax1, a1], "=");
      streets.push({ name: `Alley ${++alleyNo}`, vertical: false, kind: "alley", alley: true, road: [[ax0, a0, ax1, a1]] });
      halves.push({ r: [x0, y0, x1, a0 - APRON - 1], facesAlley: true, district, cursor: x0 }, { r: [x0, a1 + APRON + 1, x1, y1], facesAlley: false, district, cursor: x0 });
    } else halves.push({ r: [x0, y0, x1, y1], facesAlley: false, district, cursor: x0 });
  }

  // ---- the park ----
  if (park) {
    const [x0, y0, x1, y1] = park.r, cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
    fill(park.r, "_");
    areas.push({ kind: "park", rect: park.r });
    areas.push({ kind: "path", rect: [cx - 1, y0, cx + 1, y1] }, { kind: "path", rect: [x0, cy - 1, x1, cy + 1] });
    feature("deco-fountain", cx, cy + 1, 8, 0);
    feature("deco-knoll", x0 + 5, y0 + 6);
    feature("deco-knoll", x1 - 8, y1 - 4);
    for (let k = 0; k < 14; k++) {
      const tx = x0 + 2 + Math.floor(R() * (x1 - x0 - 3)), ty = y0 + 3 + Math.floor(R() * (y1 - y0 - 3));
      if (Math.abs(tx - cx) > 2 && Math.abs(ty - cy) > 2) feature("deco-tree", tx, ty);
    }
    feature("deco-bench", cx - 4, cy - 2); feature("deco-bench", cx + 3, cy + 3);
    feature("deco-picnic", x0 + 4, y1 - 3); feature("deco-flowerbed", cx - 1, y0 + 2);
  }

  // ---- parcels ----
  const zones: GridWorldFile["grid"]["zones"] = [];
  const legend: Record<string, string> = {};
  const CHARS = "abcdefghijklmnopqrstuvwxyz";
  const people: GridWorldFile["people"] = [];
  const envPeople: Record<string, string> = {}, envZones: Record<string, string> = {}, envBuildings: Record<string, string> = {};
  const take = (h: Half, w: number) => { if (h.cursor + w - 1 > h.r[2]) return null; const x0 = h.cursor; h.cursor += w; return x0; };

  // a plaza facing the boulevard, downtown
  const blvd = hBands[boulevardAt];
  const plazaHalf = halves.filter((h) => h.r[3] + 1 === blvd[0] && h.district === "downtown").sort((a, b) => dist(a.r) - dist(b.r))[0];
  if (plazaHalf) {
    const pw = Math.min(m(28), plazaHalf.r[2] - plazaHalf.r[0] + 1), x0 = take(plazaHalf, pw)!;
    const r: Rect = [x0, plazaHalf.r[1] + Math.floor((plazaHalf.r[3] - plazaHalf.r[1]) / 3), x0 + pw - 1, plazaHalf.r[3]];
    fill(r, "_");
    areas.push({ kind: "plaza", rect: r });
    feature("deco-fountain", (r[0] + r[2]) >> 1, (r[1] + r[3]) >> 1, 8, 0);
    for (let x = r[0] + 1; x <= r[2] - 1; x += 4) feature("deco-planter", x, r[1] + 1);
    feature("deco-bench", r[0] + 2, r[3] - 2); feature("deco-bench", r[2] - 3, r[3] - 2);
    parcels.push([x0, plazaHalf.r[1], x0 + pw - 1, r[1] - 1, "office-panel"]);
  }

  // landmarks: south-facing halves (not the alley side), nearest the centre first; entry plaza in front
  const SETBACK = m(5), SIDE = m(2);
  // street-facing halves first; a landmark too deep for any of them faces the alley apron instead (still south)
  const usable = [...halves].sort((a, b) => Number(a.facesAlley) - Number(b.facesAlley) || dist(a.r) - dist(b.r));
  const RECIPE: Record<string, string> = { hospital: "recipe-nurse", precinct: "recipe-officer", school: "recipe-teacher", library: "recipe-librarian", church: "recipe-priest", hotel: "recipe-night-clerk", cafe: "recipe-barista", lab: "recipe-scientist", control: "recipe-utility-tech", sluice: "recipe-water-treatment" };
  brief.landmarks.forEach((L, n) => {
    const fw = m(L.w);
    // full depth if anywhere fits it; otherwise as shallow as 70% of the brief rather than leave it out
    let fd = m(L.d), h: Half | undefined;
    for (; fd >= Math.ceil(m(L.d) * 0.7) && !h; fd--) h = usable.find((u) => u.r[3] - u.r[1] + 1 >= fd + SETBACK + 1 && u.r[2] - u.cursor + 1 >= fw + 2 * SIDE);
    if (!h) return;
    fd++;
    const x0 = take(h, fw + 2 * SIDE)!, fx0 = x0 + SIDE, fx1 = fx0 + fw - 1, fy1 = h.r[3] - SETBACK, fy0 = fy1 - fd + 1;
    const ch = CHARS[n];
    legend[ch] = L.id;
    zones.push({ id: L.id, name: L.name });
    envZones[L.id] = L.theme;
    envBuildings[L.id] = L.type;
    // open ground around the building: an entry plaza in front, lawn at the sides
    fill([x0, fy0, x0 + fw + 2 * SIDE - 1, h.r[3]], "_");
    areas.push({ kind: "lawn", rect: [x0, fy0, x0 + fw + 2 * SIDE - 1, h.r[3]] });
    areas.push({ kind: "entry", rect: [fx0 - 1, fy1 + 1, fx1 + 1, h.r[3]] });
    for (let x = fx0; x <= fx1; x++) for (let y = fy0; y <= fy1; y++) grid[y][x] = x === fx0 || x === fx1 || y === fy0 || y === fy1 ? "#" : ch;
    const door = (fx0 + fx1) >> 1;
    grid[fy1][door] = "+";
    if (fw >= 10) grid[fy1][door + 1] = "+";
    if (fy0 - 1 >= h.r[1]) { grid[fy0][fx0 + 2] = "+"; fill([fx0 + 2, h.r[1], fx0 + 2, fy0 - 1], "_"); } // a back door and a path to it
    parcels.push([x0, h.r[1], x0 + fw + 2 * SIDE - 1, fy0 - 2, "yard"]);
    feature("deco-planter", fx0 - 1, fy1 + 2); feature("deco-planter", fx1 + 1, fy1 + 2);
    const pid = `${L.id}-staff`;
    people.push({ id: pid, name: L.name.split(",")[0], role: L.type, playable: true, at: [door, fy1 + 2, 0] } as never);
    envPeople[pid] = L.person ?? RECIPE[L.type] ?? "recipe-civilian";
  });

  // everything else: parking lots and buildings, parcel by parcel
  let lotNo = 0;
  for (const h of halves) {
    while (h.cursor <= h.r[2]) {
      const rest = h.r[2] - h.cursor + 1;
      const w = rest < 14 ? rest : Math.min(rest, 6 + Math.floor(R() * 9));
      const x0 = take(h, w)!, x1 = x0 + w - 1, [, y0, , y1] = h.r;
      const depth = y1 - y0 + 1;
      if (!h.facesAlley && h.district !== "residential" && w >= 10 && R() < 0.18) {
        // a parking lot, entered across the sidewalk
        fill([x0, y0, x1, y1], "_");
        areas.push({ kind: "parking", rect: [x0, y0, x1, y1] });
        const ex = x0 + 1, swY = y1 + 1;
        areas.push({ kind: "driveway", rect: [ex, swY, ex + 2, swY + SECTIONS.local.sw - 1] });
        for (let x = x0 + 4; x <= x1 - 1; x++) if (R() < 0.45) feature(["deco-car-red", "deco-car-blue", "deco-car-yellow"][Math.floor(R() * 3)], x, y0 + 2 + (x % 2) * 0);
        continue;
      }
      if (h.district === "residential" && !h.facesAlley && depth > 8) {
        // a house behind a front yard
        const yard = m(5);
        parcels.push([x0, y0, x1, y1 - yard, undefined, false]);
        fill([x0, y1 - yard + 1, x1, y1], "_");
        areas.push({ kind: "yard", rect: [x0, y1 - yard + 1, x1, y1] });
        if (R() < 0.6) feature("deco-tree", x0 + 1 + Math.floor(R() * Math.max(1, w - 2)), y1 - 1);
        if (R() < 0.5) feature("deco-flowerbed", x0 + 1, y1 - yard + 2);
        continue;
      }
      // a building to the sidewalk; on the alley side its south face gets a fire escape
      parcels.push([x0, y0, x1, y1, undefined, h.facesAlley]);
      if (h.facesAlley && R() < 0.5) feature("deco-dumpster", x0 + 1 + Math.floor(R() * Math.max(1, w - 3)), y1 + 1);
      lotNo++;
    }
  }

  // ---- street furniture: bus stops on the avenue and the boulevard, planters downtown ----
  for (const s of streets) {
    if (s.kind === "local" || s.kind === "alley") continue;
    const r = s.road[0];
    for (let t = 20; t < (s.vertical ? H : W) - 10; t += 44) {
      const [x, y] = s.vertical ? [r[2] + 2, t] : [t, r[3] + 2];
      if (grid[y]?.[x] === "_") { feature("deco-bus-shelter", x, y); feature("deco-bus-sign", x + (s.vertical ? 0 : 2), y + (s.vertical ? 2 : 0)); }
    }
  }

  const world = {
    id: brief.id,
    name: brief.name,
    ruleSets: ["core"],
    rules: [],
    grid: {
      cellMeters: CELL_M, ticksPerCell: 0.25, floorChangeCells: 4,
      layers: { "0": grid.map((r) => r.join("")) },
      legend: { "0": legend },
      zones,
      streets: { layer: 0, char: "=", sidewalk: "_", names: streets.flatMap((s) => s.road.map((r) => ({ name: s.name, rect: r, ...(s.oneWay ? { oneWay: true } : {}), ...(s.alley ? { alley: true } : {}) }))) },
    },
    things: [],
    people,
    triggers: [],
    endings: [],
    fallbackGoals: [],
  } as unknown as GridWorldFile;
  const env: EnvConfig = {
    world: brief.id, zones: envZones, outdoor: [], buildings: envBuildings, districts, areas, features, parcels, barriers: {}, people: envPeople,
  };
  return { world, env };
}
