// A small grid town of shells: blocks between streets, each block two rows of lots back to back, the front row
// facing the street south of it and the back row facing the street north of it (its shells turned to face north).
//
// The town is described as data (cities/<id>-town.json): street names, and per block its two rows of sites, each a
// shell from kits/shells.json with a name. Lots take their card's width and spread out to fill the block; buildings
// sit at their card's setback from the street they face, with a path from the entrance to the sidewalk and lawn
// around them. Every room is its own zone, named after its site.

import type { EnvConfig } from "../env/build.js";
import type { GridWorldFile } from "../grid.js";
import { CELL_M } from "./generate.js";
import { type ShellCard, type ShellPlan, faceNorth, planShell } from "./shells.js";

const m = (metres: number) => Math.max(1, Math.round(metres / CELL_M));
type Rect = [number, number, number, number];

export interface Site { shell: string; name: string }
export interface TownBrief {
  id: string;
  name: string;
  seed: number;
  /** Streets running east-west, north to south; the blocks lie between consecutive ones. */
  streets: string[];
  /** Streets running north-south, west to east. */
  avenues: string[];
  /** blocks[row][col]: the sites facing north (onto the street above) and south (onto the street below), west to east. */
  blocks: { north: Site[]; south: Site[] }[][];
  /** People: who, which character recipe, and the site they start in front of. */
  people: { id: string; name: string; role: string; sprite: string; at: string }[];
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// legend characters for rooms: anything the grid does not reserve, Greek and Cyrillic letters once Latin runs out
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKNOPQRTUVWXYZ0123456789!$&()*,-/:;<>?@[]^{|}αβγδεζηθικλμνξοπρστυφχψωΓΔΘΛΞΠΣΦΨΩбвгдежзийклмнпрстуфцчшщъыьэюя";

export interface PlacedSite {
  id: string; name: string; shell: string; archetype: string; facing: "north" | "south";
  rect: Rect; lot: Rect; entrance: [number, number]; plan: ShellPlan; origin: [number, number];
}

export function generateTown(brief: TownBrief, cards: Record<string, ShellCard>) {
  const R = rng(brief.seed);
  const pick = ([lo, hi]: [number, number]) => m(lo + R() * (hi - lo));
  const REAR = m(3);

  // ---- plan every site, then size rows and blocks ----
  type Lot = { site: Site; id: string; card: ShellCard; plan: ShellPlan; lw: number; front: number; facing: "north" | "south" };
  let n = 0;
  const lotOf = (site: Site, facing: "north" | "south"): Lot => {
    const card = cards[site.shell];
    if (!card) throw new Error(`no shell ${site.shell}`);
    const plan0 = planShell(card, R), plan = facing === "north" ? faceNorth(plan0) : plan0;
    return { site, id: `${site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${n++}`, card, plan, lw: Math.max(pick(card.lot.w), plan.w + 4), front: pick(card.lot.front), facing };
  };
  const blocks = brief.blocks.map((row) => row.map((b) => ({ north: b.north.map((s) => lotOf(s, "north")), south: b.south.map((s) => lotOf(s, "south")) })));
  const rowDepth = (lots: Lot[]) => (lots.length ? Math.max(...lots.map((l) => l.front + l.plan.d + REAR)) : 0);
  const colW = brief.blocks[0].map((_, c) => Math.max(...blocks.map((row) => Math.max(row[c].north.reduce((s, l) => s + l.lw, 0), row[c].south.reduce((s, l) => s + l.lw, 0)))));
  const rowD = blocks.map((row) => Math.max(...row.map((b) => rowDepth(b.north) + rowDepth(b.south))));

  // ---- streets: 3 m sidewalk, 8 m road, 3 m sidewalk ----
  const SW = m(3), ROAD = m(8), BAND = 2 * SW + ROAD;
  const W = colW.reduce((s, v) => s + v, 0) + (colW.length + 1) * BAND, H = rowD.reduce((s, v) => s + v, 0) + (rowD.length + 1) * BAND;
  const grid: string[][] = Array.from({ length: H }, () => Array<string>(W).fill("_"));
  const streets: { name: string; rect: Rect }[] = [];
  let at = 0;
  for (let i = 0; i <= rowD.length; i++) { streets.push({ name: brief.streets[i] ?? `Street ${i + 1}`, rect: [0, at + SW, W - 1, at + SW + ROAD - 1] }); at += BAND + (rowD[i] ?? 0); }
  at = 0;
  for (let i = 0; i <= colW.length; i++) { streets.push({ name: brief.avenues[i] ?? `Avenue ${i + 1}`, rect: [at + SW, 0, at + SW + ROAD - 1, H - 1] }); at += BAND + (colW[i] ?? 0); }
  for (const s of streets) for (let y = s.rect[1]; y <= s.rect[3]; y++) for (let x = s.rect[0]; x <= s.rect[2]; x++) grid[y][x] = "=";

  const zones: GridWorldFile["grid"]["zones"] = [], legend: Record<string, string> = {};
  const envZones: Record<string, string> = {}, envBuildings: Record<string, string> = {};
  const areas: NonNullable<EnvConfig["areas"]> = [], cuts: NonNullable<EnvConfig["cuts"]> = [], masses: NonNullable<EnvConfig["masses"]> = [], outdoor: string[] = [];
  const placed: PlacedSite[] = [];
  let next = 0;

  // ---- lay each row: lots west to east, spread to fill the block ----
  const layRow = (lots: Lot[], x0: number, width: number, y0: number, y1: number) => {
    const spare = width - lots.reduce((s, l) => s + l.lw, 0), each = lots.length ? Math.floor(spare / lots.length) : 0;
    let x = x0;
    lots.forEach((lot, i) => {
      const lw = lot.lw + each + (i === lots.length - 1 ? spare - each * lots.length : 0), { plan, card } = lot;
      areas.push({ kind: "lawn", rect: [x, y0, x + lw - 1, y1] });
      const bx = x + Math.floor((lw - plan.w) / 2), by = lot.facing === "south" ? y1 - lot.front - plan.d + 1 : y0 + lot.front;
      const charOf: Record<string, string> = {};
      for (const room of plan.rooms) {
        const ch = CHARS[next++];
        if (!ch) throw new Error("ran out of legend characters");
        const zid = `${lot.id}-${room.id}`;
        charOf[room.id] = ch; legend[ch] = zid;
        zones.push({ id: zid, name: `${lot.site.name}: ${room.name}` });
        envZones[zid] = room.theme; envBuildings[zid] = card.archetype;
        if (room.court) outdoor.push(zid);
      }
      plan.cells.forEach((row, y) => row.forEach((c, cx) => { if (c !== ".") grid[by + y][bx + cx] = c === "#" || c === "+" ? c : charOf[c]; }));
      for (const [cx, cy, corner] of plan.cuts) cuts.push([bx + cx, by + cy, corner]);
      for (const l of plan.looks) masses.push({ rect: [bx + l.rect[0], by + l.rect[1], bx + l.rect[2], by + l.rect[3]], ...(l.arch ? { arch: l.arch } : {}), ...(l.storeys ? { storeys: l.storeys } : {}), ...(l.rise ? { rise: true } : {}) });
      // the walk from the entrance to the sidewalk
      const ex0 = bx + Math.min(...plan.entrance), ex1 = bx + Math.max(...plan.entrance);
      let door = lot.facing === "south" ? by + plan.d - 1 : by;
      for (let y = 0; y < plan.d; y++) {
        const yy = lot.facing === "south" ? plan.d - 1 - y : y;
        if (plan.cells[yy][ex0 - bx] === "+") { door = by + yy; break; }
      }
      const path: Rect = lot.facing === "south" ? [ex0, door + 1, ex1, y1] : [ex0, y0, ex1, door - 1];
      if (path[1] <= path[3]) areas.push({ kind: "path", rect: path });
      placed.push({ id: lot.id, name: lot.site.name, shell: lot.site.shell, archetype: card.archetype, facing: lot.facing, rect: [bx, by, bx + plan.w - 1, by + plan.d - 1], lot: [x, y0, x + lw - 1, y1], entrance: [ex0, lot.facing === "south" ? y1 + 1 : y0 - 1], plan, origin: [bx, by] });
      x += lw;
    });
  };
  let by0 = BAND;
  blocks.forEach((row, r) => {
    let bx0 = BAND;
    row.forEach((b, c) => {
      const dN = rowDepth(b.north), dTotal = rowD[r];
      layRow(b.north, bx0, colW[c], by0, by0 + dN - 1);
      layRow(b.south, bx0, colW[c], by0 + dN, by0 + dTotal - 1);
      bx0 += colW[c] + BAND;
    });
    by0 += rowD[r] + BAND;
  });

  // ---- the people: on the sidewalk in front of their site ----
  const people = brief.people.map((p) => {
    const site = placed.find((s) => s.name === p.at) ?? placed[0];
    return { id: p.id, name: p.name, role: p.role, playable: true, at: [site.entrance[0], site.entrance[1], 0] as [number, number, number] };
  });
  const world = {
    id: brief.id, name: brief.name, ruleSets: ["core"], rules: [],
    grid: { cellMeters: CELL_M, ticksPerCell: 0.25, floorChangeCells: 4, layers: { "0": grid.map((r) => r.join("")) }, legend: { "0": legend }, zones, streets: { layer: 0, char: "=", sidewalk: "_", names: streets } },
    things: [], people, triggers: [], endings: [], fallbackGoals: [],
  } as unknown as GridWorldFile;
  const env: EnvConfig = {
    world: brief.id, zones: envZones, outdoor, buildings: envBuildings, areas, features: [], parcels: [], cuts, masses, barriers: {},
    people: Object.fromEntries(brief.people.map((p) => [p.id, p.sprite])), districts: [{ kind: "residential", rect: [0, 0, W - 1, H - 1] }],
  };
  return { world, env, placed, streets, size: [W, H] as [number, number] };
}
