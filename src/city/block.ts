// One block of shells: the shells in kits/shells.json on their lots, side by side along a street, with plain lawns
// around them and local streets on all four sides. It's the test bed for shells before towns: one block in the
// playable view, walkable, every room enterable.
//
// Lots run west to east along the south street, so every main entrance faces it. Each lot is its card's width (or
// wider, if the building came out wider), the building sits at the card's front setback, centred across the lot,
// and a path runs from the entrance to the sidewalk. Everything else on the lot is lawn.

import type { EnvConfig } from "../env/build.js";
import type { GridWorldFile } from "../grid.js";
import { CELL_M } from "./generate.js";
import { type ShellCard, type ShellPlan, planShell } from "./shells.js";

const m = (metres: number) => Math.max(1, Math.round(metres / CELL_M));
type Rect = [number, number, number, number];

export interface BlockBrief {
  id: string;
  name: string;
  seed: number;
  /** Shell ids from kits/shells.json, west to east. */
  shells: string[];
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// legend characters for rooms: anything the grid doesn't reserve
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKNOPQRTUVWXYZ0123456789";

export function generateBlock(brief: BlockBrief, cards: Record<string, ShellCard>) {
  const R = rng(brief.seed);
  const pick = ([lo, hi]: [number, number]) => m(lo + R() * (hi - lo));

  // ---- the lots and the buildings on them ----
  const lots = brief.shells.map((id) => {
    const card = cards[id];
    if (!card) throw new Error(`no shell ${id} in kits/shells.json`);
    const plan = planShell(card, R);
    return { id, card, plan, lw: Math.max(pick(card.lot.w), plan.w + 4), front: pick(card.lot.front) };
  });
  const REAR = m(4);
  const blockW = lots.reduce((s, l) => s + l.lw, 0), blockD = Math.max(...lots.map((l) => l.front + l.plan.d + REAR));

  // ---- the map: the block with a local street on every side (3 m sidewalk, 8 m road, 3 m sidewalk) ----
  const SW = m(3), ROAD = m(8), BAND = 2 * SW + ROAD;
  const W = blockW + 2 * BAND, H = blockD + 2 * BAND;
  const grid: string[][] = Array.from({ length: H }, () => Array<string>(W).fill("_"));
  const streets = [
    { name: "Front St", rect: [0, H - BAND + SW, W - 1, H - SW - 1] as Rect },
    { name: "Back St", rect: [0, SW, W - 1, SW + ROAD - 1] as Rect },
    { name: "West Ave", rect: [SW, 0, SW + ROAD - 1, H - 1] as Rect },
    { name: "East Ave", rect: [W - BAND + SW, 0, W - SW - 1, H - 1] as Rect },
  ];
  for (const s of streets) for (let y = s.rect[1]; y <= s.rect[3]; y++) for (let x = s.rect[0]; x <= s.rect[2]; x++) grid[y][x] = "=";

  const zones: GridWorldFile["grid"]["zones"] = [];
  const legend: Record<string, string> = {};
  const envZones: Record<string, string> = {}, envBuildings: Record<string, string> = {};
  const areas: NonNullable<EnvConfig["areas"]> = [], cuts: NonNullable<EnvConfig["cuts"]> = [], masses: NonNullable<EnvConfig["masses"]> = [], outdoor: string[] = [];
  let next = 0, x0 = BAND;
  const by = BAND, front = BAND + blockD - 1; // the block's north and south rows
  const placed: { id: string; name: string; archetype: string; rect: Rect; lot: Rect; entrance: [number, number]; rooms: number; masses: ShellPlan["masses"]; courts: ShellPlan["courts"] }[] = [];

  for (const lot of lots) {
    const { plan, card } = lot;
    areas.push({ kind: "lawn", rect: [x0, by, x0 + lot.lw - 1, front] });
    const bx = x0 + Math.floor((lot.lw - plan.w) / 2), byy = front - lot.front - plan.d + 1;
    // each room is its own zone, named after its building; courtyards are open to the sky
    const charOf: Record<string, string> = {};
    for (const room of plan.rooms) {
      const ch = CHARS[next++];
      if (!ch) throw new Error("ran out of legend characters");
      const zid = `${lot.id}-${room.id}`;
      charOf[room.id] = ch;
      legend[ch] = zid;
      zones.push({ id: zid, name: `${card.name}: ${room.name}` });
      envZones[zid] = room.theme;
      envBuildings[zid] = card.archetype;
      if (room.court) outdoor.push(zid);
    }
    plan.cells.forEach((row, y) => row.forEach((c, x) => { if (c !== ".") grid[byy + y][bx + x] = c === "#" || c === "+" ? c : charOf[c]; }));
    for (const [x, y, corner] of plan.cuts) cuts.push([bx + x, byy + y, corner]);
    for (const l of plan.looks) masses.push({ rect: [bx + l.rect[0], byy + l.rect[1], bx + l.rect[2], byy + l.rect[3]], ...(l.arch ? { arch: l.arch } : {}), ...(l.storeys ? { storeys: l.storeys } : {}), ...(l.rise ? { rise: true } : {}) });

    // the walk from the entrance to the sidewalk, and a porch deck where the card has one
    const ex0 = bx + Math.min(...plan.entrance), ex1 = bx + Math.max(...plan.entrance);
    let below = byy;
    for (let y = plan.d - 1; y >= 0; y--) if (plan.cells[y][ex0 - bx] === "+") { below = byy + y + 1; break; }
    if (card.porch) {
      const full = R() < (card.porch.full ?? 0);
      // the porch runs along the front wall the entrance is in, the whole wall or a few cells around the door
      let px0 = ex0 - 2, px1 = ex1 + 2;
      if (full) { px0 = ex0; px1 = ex1; while (grid[below - 1][px0 - 1] === "#" || grid[below - 1][px0 - 1] === "+") px0--; while (grid[below - 1][px1 + 1] === "#" || grid[below - 1][px1 + 1] === "+") px1++; }
      areas.push({ kind: "entry", rect: [px0, below, px1, Math.min(front, below + m(card.porch.d) - 1)] });
    }
    areas.push({ kind: "path", rect: [ex0, below, ex1, front] });
    placed.push({
      id: lot.id, name: card.name, archetype: card.archetype, rect: [bx, byy, bx + plan.w - 1, byy + plan.d - 1], lot: [x0, by, x0 + lot.lw - 1, front], entrance: [ex0, below], rooms: plan.rooms.length,
      masses: plan.masses.map((ms) => ({ ...ms, rect: [bx + ms.rect[0], byy + ms.rect[1], bx + ms.rect[2], byy + ms.rect[3]] as Rect })),
      courts: plan.courts.map(([x, y]) => [bx + x, byy + y] as [number, number]),
    });
    x0 += lot.lw;
  }

  // someone to walk around with, on the sidewalk in front of the first lot
  const start: [number, number, number] = [placed[0].entrance[0], front + 1, 0];
  const world = {
    id: brief.id, name: brief.name, ruleSets: ["core"], rules: [],
    grid: {
      cellMeters: CELL_M, ticksPerCell: 0.25, floorChangeCells: 4,
      layers: { "0": grid.map((r) => r.join("")) },
      legend: { "0": legend },
      zones,
      streets: { layer: 0, char: "=", sidewalk: "_", names: streets },
    },
    things: [],
    people: [{ id: "walker", name: "Walker", role: "civilian", playable: true, at: start }],
    triggers: [], endings: [], fallbackGoals: [],
  } as unknown as GridWorldFile;
  const env: EnvConfig = { world: brief.id, zones: envZones, outdoor, buildings: envBuildings, areas, features: [], parcels: [], cuts, masses, barriers: {}, people: { walker: "recipe-civilian" } };
  return { world, env, placed, streets, size: [W, H] as [number, number] };
}
