// Environment builder: a compiled grid world -> a 3/4 top-down map: surfaces, buildings with roofs, props, people.
//
// One 2 m grid cell is one 16 px tile (characters are 16 px tall).
//
//   Streets    street cells next to a building, and the edge of every unenterable block, are sidewalk; the rest is
//              road. Sidewalk corners facing a road on two sides are rounded (a quarter circle carved per cell
//              quadrant, the same idea as dual-grid autotiling). Curbs are drawn where sidewalk meets road. Centre
//              lines and crosswalks come from the named street rectangles.
//   Buildings  every enterable building (walls, doors and the indoor floors they enclose) is one roof object. Seen
//              from outside it's a roof with a facade along its south edge; the game lifts the roof of the building
//              the player is in. Inside, walls are drawn thin (4 px on the cell's outer edge), and north walls show
//              their inside face.
//   Blocks     unenterable blocks are split into lots, each with its own roof material, tint and rooftop clutter.
//   Materials  tileable textures (sprites/env/data/tex-*.json) sampled in world pixels, so they never line up
//              with the cell grid; interior floors use the theme's floor tile.
//
// sprites/env/worlds/<world>.json maps zones to themes, barriers to props and people to character recipes.
// Barrier state comes from the world state, so the same map draws any moment of a run.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GridWorldFile } from "../grid.js";
import { type Frames, type SpriteDoc, composeWalk, drawnWalk, loadSprites, recipeParts } from "../sprites/compose.js";
import type { State } from "../types.js";
import { type World, initialState } from "../world.js";

export const TILE = 16;
/** Height of one storey of front wall, in pixels (characters are 16 px tall). */
export const WALL = 20;

export interface EnvConfig {
  world: string;
  zones: Record<string, string>;
  /** Walled zones that are still open to the sky (a fenced compound, a courtyard). */
  outdoor?: string[];
  barriers?: Record<string, string>;
  people?: Record<string, string>;
}
/** A cell's floor look: tile id, theme id (or null), variant. */
export type CellLook = [tile: string, theme: string | null, variant: number];
/** What a cell is, for drawing. */
export type CellKind = "road" | "sidewalk" | "water" | "grass" | "outdoor" | "floor" | "wall" | "portal" | "roof" | "void";
export interface PlacedProp { prop: string; state: string; at: [number, number]; barrier?: string }
export interface PlacedPerson { id: string; sprite: string; at: [number, number] }
/** `roofed`: false for walls around open ground (a fenced compound): drawn as walls from outside too. */
export interface Building { id: number; zones: string[]; bbox: [number, number, number, number]; roofed: boolean }
/** A roofed structure: roof textures (back slope for a gable), front wall texture, height in storeys. */
export interface Lot { roof: string; back: string | null; wall: string; storeys: number; style: "gable" | "flat" }
export interface Line { x0: number; y0: number; x1: number; y1: number; color: "yellow" | "white" }
export interface LayerMap {
  z: number;
  w: number;
  h: number;
  /** Floor looks (interior floors, outdoor zones), and an overlay drawn on top (stairs, ladders, manholes). */
  ground: (CellLook | null)[][];
  overlay: (CellLook | null)[][];
  kind: CellKind[][];
  /** Enterable building id per cell (-1: none): the cells whose roof the game lifts when the player is inside. */
  building: number[][];
  buildings: Building[];
  /** Roof lot per cell (-1: none): an enterable building or a piece of an unenterable block. */
  lot: number[][];
  lots: Lot[];
  props: PlacedProp[];
  people: PlacedPerson[];
  /** Road markings, in pixels. */
  lines: Line[];
  crosswalks: [x: number, y: number, w: number, h: number, vertical: boolean][];
}

export interface EnvArt { tiles: Map<string, SpriteDoc>; chars: Map<string, SpriteDoc> }
export const loadArt = (envDir = "sprites/env/data", charDir = "sprites/data"): EnvArt =>
  ({ tiles: loadSprites(envDir), chars: loadSprites(charDir) });
export const loadEnvConfig = (worldId: string, dir = "sprites/env/worlds"): EnvConfig =>
  JSON.parse(readFileSync(join(dir, `${worldId}.json`), "utf8"));

const hash = (a: number, b: number, s = 0) => {
  let h = (a * 374761393 + b * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const DEFAULT_THEME = "theme-concrete";
const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
type ThemeDoc = SpriteDoc & { floor?: string; texture?: string };

/** Lay out one layer of a grid world. `s` is the moment to draw (barrier states); the start by default. */
export function buildLayer(w: World, file: GridWorldFile, cfg: EnvConfig, art: EnvArt, z: number, s: State = initialState(w, "timed")): LayerMap {
  const g = file.grid;
  const rows = g.layers[String(z)] ?? [];
  const W = Math.max(...rows.map((r) => r.length)), H = rows.length;
  const zones = w.spatial!.zoneGrid[String(z)];
  const ch = (x: number, y: number) => rows[y]?.[x] ?? " ";
  const zoneAt = (x: number, y: number) => zones[y]?.[x] ?? null;
  const isStreet = (x: number, y: number) => z === g.streets?.layer && ch(x, y) === g.streets.char;
  const isFloor = (c: string) => !" .%~#+".includes(c);
  const theme = (zone: string | null) => (zone && cfg.zones[zone]) || DEFAULT_THEME;
  const variants = (tile: string) => Object.keys(art.tiles.get(tile)?.frames ?? { 0: 1 }).length;
  const look = (tile: string, th: string | null, x: number, y: number): CellLook => [tile, th, Math.floor(hash(x, y, 1) * variants(tile))];
  const floorLook = (zone: string | null, x: number, y: number): CellLook => {
    const t = theme(zone);
    return look((art.tiles.get(t) as ThemeDoc | undefined)?.floor ?? "tile-floor-concrete", t, x, y);
  };
  const grid = <T,>(v: T) => Array.from({ length: H }, () => Array<T>(W).fill(v));

  // ---- indoor zones: floor that never touches the street, open ground, a block or water except through a wall ----
  const zoneIds = new Set<string>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const zz = zoneAt(x, y); if (zz && isFloor(ch(x, y)) && !isStreet(x, y)) zoneIds.add(zz); }
  const outdoor = new Set<string>(cfg.outdoor ?? []);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const zz = zoneAt(x, y);
    if (!zz || !zoneIds.has(zz) || !isFloor(ch(x, y))) continue;
    if (N4.some(([dx, dy]) => { const c = ch(x + dx, y + dy); return " .%~".includes(c) || isStreet(x + dx, y + dy); })) outdoor.add(zz);
  }
  for (let grew = true; grew;) {
    grew = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const zz = zoneAt(x, y);
      if (!zz || outdoor.has(zz) || !zoneIds.has(zz) || !isFloor(ch(x, y))) continue;
      if (N4.some(([dx, dy]) => { const o = zoneAt(x + dx, y + dy); return !!o && outdoor.has(o) && isFloor(ch(x + dx, y + dy)); })) { outdoor.add(zz); grew = true; }
    }
  }
  const indoorCell = (x: number, y: number) => { const zz = zoneAt(x, y); return !!zz && zoneIds.has(zz) && !outdoor.has(zz) && isFloor(ch(x, y)); };

  // ---- buildings: walls, portals in walls and indoor floor, 4-connected ----
  const building = grid(-1), buildings: Building[] = [];
  const inBuildingCell = (x: number, y: number) => {
    const c = ch(x, y);
    if (c === "#") return true;
    if (c === "+") return N4.some(([dx, dy]) => ch(x + dx, y + dy) === "#");
    return indoorCell(x, y);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (building[y][x] >= 0 || !inBuildingCell(x, y)) continue;
    const id = buildings.length, stack: [number, number][] = [[x, y]], zs = new Set<string>();
    const bbox: Building["bbox"] = [x, y, x, y];
    building[y][x] = id;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      const zz = zoneAt(cx, cy);
      if (zz && indoorCell(cx, cy)) zs.add(zz);
      bbox[0] = Math.min(bbox[0], cx); bbox[1] = Math.min(bbox[1], cy); bbox[2] = Math.max(bbox[2], cx); bbox[3] = Math.max(bbox[3], cy);
      for (const [dx, dy] of N4) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || building[ny][nx] >= 0 || !inBuildingCell(nx, ny)) continue;
        building[ny][nx] = id;
        stack.push([nx, ny]);
      }
    }
    buildings.push({ id, zones: [...zs], bbox, roofed: zs.size > 0 });
  }

  // ---- what each cell is ----
  const kind = grid<CellKind>("void"), ground = grid<CellLook | null>(null), overlay = grid<CellLook | null>(null);
  const nearStreet8 = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isStreet(x + dx, y + dy)) return true; return false; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = ch(x, y), b = building[y][x];
    if (b >= 0) {
      if (c === "#" || c === "+") kind[y][x] = c === "#" ? "wall" : "portal";
      else { kind[y][x] = "floor"; ground[y][x] = floorLook(zoneAt(x, y), x, y); }
    } else if (isStreet(x, y)) kind[y][x] = N4.some(([dx, dy]) => building[y + dy]?.[x + dx] >= 0) ? "sidewalk" : "road";
    else if (c === "%") kind[y][x] = z === 0 && nearStreet8(x, y) ? "sidewalk" : "roof";
    else if (c === "~") kind[y][x] = "water";
    else if (c === " " || c === ".") kind[y][x] = z === 0 ? "grass" : "void";
    else if (c === "+") {
      // a portal outside any building: a gate or blocker on a street or between outdoor areas
      const n = N4.map(([dx, dy]) => [x + dx, y + dy] as const).find(([nx, ny]) => isStreet(nx, ny) || zoneAt(nx, ny));
      if (n && isStreet(n[0], n[1])) kind[y][x] = "road";
      else { kind[y][x] = "outdoor"; ground[y][x] = floorLook(n ? zoneAt(n[0], n[1]) : null, x, y); }
    } else { kind[y][x] = "outdoor"; ground[y][x] = floorLook(zoneAt(x, y), x, y); }
    if (c === "S") overlay[y][x] = look("tile-stairs", null, x, y);
    else if (c === "L") overlay[y][x] = look("tile-ladder", null, x, y);
    else if (c === "M") overlay[y][x] = look("tile-manhole", null, x, y);
  }
  // ---- roof lots: each enterable building is one; unenterable blocks are split into lots ----
  // Small buildings get a gable roof (a back slope, a ridge, a front slope); big ones a flat roof with a parapet.
  const lot = grid(-1), lots: Lot[] = [];
  const pickOf = <T,>(xs: T[], seed: number, salt: number) => xs[Math.floor(hash(seed, salt) * xs.length)];
  const newLot = (seed: number, area: number, storeys: number) => {
    const gable = area <= 140 && storeys <= 2 && hash(seed, 3) < 0.7;
    const [roof, back] = gable ? pickOf([["tex-roof-shingle", "tex-roof-shingle-back"], ["tex-roof-slate", "tex-roof-slate-back"]], seed, 7)
      : [pickOf(["tex-roof-flat", "tex-roof-flat", "tex-roof-flat-light", "tex-roof-metal"], seed, 7), null];
    const wall = pickOf(gable ? ["tex-wall-brick", "tex-wall-tan", "tex-wall-siding"] : ["tex-wall-brick", "tex-wall-panel", "tex-wall-tan"], seed, 8);
    lots.push({ roof, back, wall, storeys, style: gable ? "gable" : "flat" });
    return lots.length - 1;
  };
  // storeys: the ground floor plus every layer above that has walls or floor over the footprint
  const storeysOf = (b: Building) => {
    let n = 1;
    for (let zz = z + 1; g.layers[String(zz)]; zz++) {
      const r = g.layers[String(zz)];
      let any = false;
      for (let y = b.bbox[1]; y <= b.bbox[3] && !any; y++) for (let x = b.bbox[0]; x <= b.bbox[2] && !any; x++) if (building[y][x] === b.id && !" .%~".includes(r[y]?.[x] ?? " ")) any = true;
      if (!any) break;
      n++;
    }
    return n;
  };
  const buildingLot = buildings.map((b) => newLot(b.id * 31 + 5, (b.bbox[2] - b.bbox[0] + 1) * (b.bbox[3] - b.bbox[1] + 1), storeysOf(b)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (building[y][x] >= 0) lot[y][x] = buildingLot[building[y][x]];
  const seen = grid(false);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (seen[y][x] || kind[y][x] !== "roof") continue;
    const cells: [number, number][] = [], stack: [number, number][] = [[x, y]];
    seen[y][x] = true;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      cells.push([cx, cy]);
      for (const [dx, dy] of N4) {
        const nx = cx + dx, ny = cy + dy;
        if (seen[ny]?.[nx] === false && kind[ny][nx] === "roof") { seen[ny][nx] = true; stack.push([nx, ny]); }
      }
    }
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const leaves: [number, number, number, number][] = [];
    const split = (r: [number, number, number, number], d: number) => {
      const [x0, y0, x1, y1] = r, rw = x1 - x0 + 1, rh = y1 - y0 + 1;
      if (Math.max(rw, rh) <= 12 || d > 6) { leaves.push(r); return; }
      const t = 0.35 + hash(x0 * 7 + y0, x1 * 3 + y1, d) * 0.3;
      if (rw >= rh) { const m = x0 + Math.max(4, Math.floor(rw * t)); split([x0, y0, m - 1, y1], d + 1); split([m, y0, x1, y1], d + 1); }
      else { const m = y0 + Math.max(4, Math.floor(rh * t)); split([x0, y0, x1, m - 1], d + 1); split([x0, m, x1, y1], d + 1); }
    };
    split([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 0);
    const ids = leaves.map((l) => newLot(l[0] * 131 + l[1] * 17 + l[2], (l[2] - l[0] + 1) * (l[3] - l[1] + 1), 1 + Math.floor(hash(l[0], l[1], 4) * 4)));
    for (const [cx, cy] of cells) lot[cy][cx] = ids[leaves.findIndex(([x0, y0, x1, y1]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1)];
  }

  // ---- props: barriers on their link cells; other doorways in walls stand open ----
  const props: PlacedProp[] = [];
  const barrierAt = new Map<string, string>();
  for (const l of w.spatial!.links) {
    if (!l.barrier) continue;
    for (const [x, y, zz] of l.where) if (zz === z) barrierAt.set(`${x},${y}`, l.barrier);
  }
  for (const [k, id] of barrierAt) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    const prop = cfg.barriers?.[id] ?? "prop-door";
    props.push({ prop, state: barrierState(prop, s.things[id]?.props ?? {}), at: [x, y], barrier: id });
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ch(x, y) === "+" && !barrierAt.has(`${x},${y}`) && kind[y][x] === "portal") props.push({ prop: "prop-door", state: "open", at: [x, y] });
  }

  // ---- people where they start (future lives wait there until played) ----
  const people: PlacedPerson[] = [];
  for (const p of file.people as { id: string; at?: [number, number, number] }[]) {
    if (p.at && p.at[2] === z) people.push({ id: p.id, sprite: cfg.people?.[p.id] ?? "recipe-civilian", at: [p.at[0], p.at[1]] });
  }

  // ---- road markings from the named street rectangles ----
  const lines: Line[] = [], crosswalks: LayerMap["crosswalks"] = [];
  if (z === g.streets?.layer) {
    const cover = grid(0);
    for (const n of g.streets.names) { const [x0, y0, x1, y1] = n.rect; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (cover[y]?.[x] !== undefined) cover[y][x]++; }
    for (const n of g.streets.names) {
      const [x0, y0, x1, y1] = n.rect, vertical = y1 - y0 > x1 - x0;
      const [a0, a1, b0, b1] = vertical ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
      const at = (t: number, u: number) => (vertical ? [u, t] : [t, u]) as [number, number];
      const crossing = (t: number) => { for (let u = b0; u <= b1; u++) { const [x, y] = at(t, u); if ((cover[y]?.[x] ?? 0) > 1 && isStreet(x, y)) return true; } return false; };
      for (let t = a0; t <= a1; t++) {
        const road: number[] = [];
        for (let u = b0 - 1; u <= b1 + 1; u++) { const [x, y] = at(t, u); if (kind[y]?.[x] === "road") road.push(u); }
        if (!road.length || crossing(t)) continue;
        const u0 = Math.min(...road), u1 = Math.max(...road);
        if (crossing(t - 1) || crossing(t + 1)) {
          // a crosswalk across the road, just outside the intersection
          const [cx, cy] = at(t, u0);
          crosswalks.push(vertical ? [cx * TILE, cy * TILE + 3, (u1 - u0 + 1) * TILE, TILE - 6, true] : [cx * TILE + 3, cy * TILE, TILE - 6, (u1 - u0 + 1) * TILE, false]);
          continue;
        }
        if (u1 - u0 < 1) continue; // one lane: no centre line
        const mid = ((u0 + u1 + 1) * TILE) / 2;
        for (const off of [-2, 1]) {
          const c = mid + off;
          lines.push(vertical ? { x0: c, y0: t * TILE, x1: c, y1: t * TILE + TILE - 1, color: "yellow" } : { x0: t * TILE, y0: c, x1: t * TILE + TILE - 1, y1: c, color: "yellow" });
        }
      }
    }
  }
  return { z, w: W, h: H, ground, overlay, kind, building, buildings, lot, lots, props, people, lines, crosswalks };
}

/** The frame a barrier shows for its current props. */
export function barrierState(prop: string, p: Record<string, unknown>): string {
  if (p.blocks === "none") return prop === "prop-fence" ? "cut" : "open";
  if (p.locked && prop !== "prop-barricade" && prop !== "prop-fence" && prop !== "prop-hatch") return "locked";
  return "closed";
}

// ---------- drawing ----------

type RGB = [number, number, number];
const rgb = (hex: string): RGB =>
  /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB : [255, 0, 255];

interface Tex { w: number; h: number; px: (RGB | null)[] }
function decode(doc: SpriteDoc, frame = "0", extra: Record<string, string> = {}): Tex {
  const pal = { ...doc.palette, ...extra };
  const rows = (doc.frames[frame]?.[0] ?? Object.values(doc.frames)[0]![0]).split("/");
  const px: (RGB | null)[] = [];
  for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) { const k = rows[y]?.[x] ?? "."; px.push(k === "." || !pal[k] ? null : rgb(pal[k])); }
  return { w: doc.w, h: doc.h, px };
}

/**
 * Draw a layer to RGBA pixels (w*16 by h*16).
 * "exterior": every building shows its roof (the view from the street). "interior": roofs lifted, floors and thin
 * walls shown. The game shows the exterior and lifts one building's roof (the `building` grid) when the player is in it.
 */
export function renderLayer(m: LayerMap, art: EnvArt, view: "exterior" | "interior" = "exterior"): { width: number; height: number; pixels: Uint8Array } {
  const width = m.w * TILE, height = m.h * TILE, px = new Uint8Array(width * height * 4);
  // per pixel: 1 road, 2 sidewalk, 3 structure, 5 water
  const mat = new Uint8Array(width * height);
  const put = (X: number, Y: number, c: RGB | null, scale = 1) => {
    if (!c || X < 0 || Y < 0 || X >= width || Y >= height) return;
    const i = (Y * width + X) * 4;
    px[i] = Math.min(255, c[0] * scale); px[i + 1] = Math.min(255, c[1] * scale); px[i + 2] = Math.min(255, c[2] * scale); px[i + 3] = 255;
  };
  const texCache = new Map<string, Tex>();
  const tex = (id: string, frame = "0", theme: string | null = null) => {
    const k = `${id}|${frame}|${theme}`;
    if (!texCache.has(k)) {
      const doc = art.tiles.get(id), th = theme ? art.tiles.get(theme) : undefined;
      texCache.set(k, doc ? decode(doc, frame, (th as ThemeDoc | undefined)?.colors ?? {}) : { w: 1, h: 1, px: [[255, 0, 255]] });
    }
    return texCache.get(k)!;
  };
  const sample = (t: Tex, X: number, Y: number) => t.px[(((Y % t.h) + t.h) % t.h) * t.w + (((X % t.w) + t.w) % t.w)];
  const pal = (art.tiles.get("palette-street") as (SpriteDoc & { colors?: Record<string, string> }) | undefined)?.colors ?? {};
  const C = (k: string, d: string) => rgb(pal[k] ?? d);
  // a cell is visible unless a roof covers it
  const roofed = (x: number, y: number) => m.building[y]?.[x] >= 0 && m.buildings[m.building[y][x]].roofed;
  const visible = (x: number, y: number) => view === "interior" || !roofed(x, y);
  const lookTex = (l: CellLook) => tex(l[0], String(l[2]), l[1]);
  const themeTex = (l: CellLook) => {
    const th = l[1] ? (art.tiles.get(l[1]) as ThemeDoc | undefined) : undefined;
    return th?.texture ? tex(th.texture, "0", l[1]) : null;
  };

  // cells drawn as structures (a roof over a front wall) instead of ground: unenterable lots always, enterable
  // buildings from outside
  const structure = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return -1;
    if (m.kind[y][x] === "roof") return m.lot[y][x];
    return view === "exterior" && roofed(x, y) ? m.lot[y][x] : -1;
  };

  // ---- surfaces ----
  const asphalt = tex("tex-asphalt"), sidewalk = tex("tex-sidewalk"), water = tex("tex-water"), bank = tex("tex-bank"), grass = tex("tex-grass");
  const k = (x: number, y: number) => m.kind[y]?.[x];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const kd = m.kind[y][x], X0 = x * TILE, Y0 = y * TILE;
    const fill = (t: Tex, code = 0, scale = 1) => { for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { put(X0 + i, Y0 + j, sample(t, X0 + i, Y0 + j), scale); mat[(Y0 + j) * width + X0 + i] = code; } };
    if (structure(x, y) >= 0) continue; // drawn below as a roof over a front wall
    switch (kd) {
      case "road": fill(asphalt, 1); break;
      case "sidewalk": {
        fill(sidewalk, 2);
        // round the corners that face road on both sides
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          if (k(x + dx, y) !== "road" || k(x, y + dy) !== "road" || k(x + dx, y + dy) !== "road") continue;
          for (let j = 0; j < TILE / 2; j++) for (let i = 0; i < TILE / 2; i++) {
            const lx = dx > 0 ? TILE / 2 + i : i, ly = dy > 0 ? TILE / 2 + j : j;
            const fx = dx > 0 ? lx + 0.5 - TILE / 2 : TILE / 2 - (lx + 0.5), fy = dy > 0 ? ly + 0.5 - TILE / 2 : TILE / 2 - (ly + 0.5);
            if (Math.hypot(fx, fy) > TILE / 2) { put(X0 + lx, Y0 + ly, sample(asphalt, X0 + lx, Y0 + ly)); mat[(Y0 + ly) * width + X0 + lx] = 1; }
          }
        }
        break;
      }
      case "water": {
        fill(water, 5);
        // the bank's stone face shows below land to the north; other edges are a line
        const land = (dx: number, dy: number) => k(x + dx, y + dy) !== "water" && k(x + dx, y + dy) !== undefined;
        for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
          if (land(0, -1) && j < 8) put(X0 + i, Y0 + j, sample(bank, X0 + i, j));
          else if ((land(-1, 0) && i === 0) || (land(1, 0) && i === TILE - 1) || (land(0, 1) && j === TILE - 1)) put(X0 + i, Y0 + j, [0, 0, 0]);
        }
        break;
      }
      case "grass": fill(grass); break;
      case "outdoor": { const l = m.ground[y][x]!; fill(themeTex(l) ?? lookTex(l)); break; }
      case "floor": fill(lookTex(m.ground[y][x]!)); break;
      case "wall": case "portal": drawWall(x, y); break;
      default: for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) put(X0 + i, Y0 + j, [16, 16, 20]);
    }
  }

  // ---- thin walls (interior view): a 4 px line on the cell's outer edge, arms toward neighbouring walls ----
  function drawWall(x: number, y: number) {
    const b = m.building[y][x], X0 = x * TILE, Y0 = y * TILE;
    const inB = (dx: number, dy: number) => m.building[y + dy]?.[x + dx] === b;
    const wallish = (dx: number, dy: number) => inB(dx, dy) && (k(x + dx, y + dy) === "wall" || k(x + dx, y + dy) === "portal");
    const floor = (dx: number, dy: number) => inB(dx, dy) && k(x + dx, y + dy) === "floor";
    const out = (dx: number, dy: number) => !inB(dx, dy);
    // the rest of the cell is the nearest indoor floor
    let under: CellLook | null = null;
    for (const [dx, dy] of [...N4, [1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) if (!under && floor(dx, dy)) under = m.ground[y + dy][x + dx];
    const theme = under?.[1] ?? null;
    // walls around open ground (a fenced compound) sit on that ground
    if (!under) for (const [dx, dy] of [...N4, [1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) if (!under && m.ground[y + dy]?.[x + dx] && (k(x + dx, y + dy) === "outdoor" || k(x + dx, y + dy) === "floor")) under = m.ground[y + dy][x + dx];
    if (under) { const t = themeTex(under) ?? lookTex(under); for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) put(X0 + i, Y0 + j, sample(t, X0 + i, Y0 + j)); }
    const hOff = out(0, -1) ? 0 : out(0, 1) ? 12 : 6, vOff = out(-1, 0) ? 0 : out(1, 0) ? 12 : 6;
    const E = wallish(1, 0), Wd = wallish(-1, 0), Nd = wallish(0, -1), S = wallish(0, 1);
    const hasH = E || Wd, hasV = Nd || S;
    const band = Array.from({ length: TILE }, () => Array<boolean>(TILE).fill(false));
    if (hasH) { const a = Wd ? 0 : hasV ? vOff : 0, z2 = E ? TILE - 1 : hasV ? vOff + 3 : TILE - 1; for (let i = a; i <= z2; i++) for (let j = hOff; j < hOff + 4; j++) band[j][i] = true; }
    if (hasV) { const a = Nd ? 0 : hasH ? hOff : 0, z2 = S ? TILE - 1 : hasH ? hOff + 3 : TILE - 1; for (let j = a; j <= z2; j++) for (let i = vOff; i < vOff + 4; i++) band[j][i] = true; }
    if (!hasH && !hasV) for (let j = hOff; j < hOff + 4; j++) for (let i = vOff; i < vOff + 4; i++) band[j][i] = true;
    // the inside face of a north wall, seen in 3/4 view
    if (hasH && floor(0, 1) && hOff === 0) {
      const face = tex("tile-wall-front", "0", theme);
      for (let j = 4; j < TILE; j++) for (let i = 0; i < TILE; i++) if (!band[j][i]) put(X0 + i, Y0 + j, sample(face, i, j - 3));
    }
    const prop = k(x, y) === "portal" ? m.props.find((p) => p.at[0] === x && p.at[1] === y) : undefined;
    const door = prop?.prop === "prop-door" ? prop.state : null;
    const th = theme ? (art.tiles.get(theme) as ThemeDoc | undefined) : undefined;
    const top = rgb(th?.colors?.w ?? "#5a5a66"), edge: RGB = [22, 22, 26];
    const wood: RGB = [138, 90, 50], lock: RGB = [240, 208, 64];
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      if (!band[j][i]) continue;
      const rim = (i > 0 && !band[j][i - 1]) || (i < TILE - 1 && !band[j][i + 1]) || (j > 0 && !band[j - 1][i]) || (j < TILE - 1 && !band[j + 1][i]);
      if (door === "open") continue; // an open doorway: a gap in the wall
      if (door) {
        if (door === "broken" && hash(X0 + i, Y0 + j, 5) < 0.4) continue;
        const centre = Math.abs(i - 7.5) < 1.5 && Math.abs(j - 7.5) < 1.5;
        put(X0 + i, Y0 + j, door === "locked" && centre ? lock : rim ? edge : wood);
      } else put(X0 + i, Y0 + j, rim ? edge : top);
    }
  }

  // ---- structures in 3/4 view: per column, a roof slab over a front wall as tall as the storeys ----
  const black: RGB = [0, 0, 0], eave = C("eave", "#242424"), parapet = C("parapet", "#bcbcbc"), parapetFace = C("parapetFace", "#7c7c7c");
  const stamp = (t: Tex, X0: number, Y0: number) => { for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) put(X0 + i, Y0 + j, t.px[j * t.w + i]); };
  const decos: [string, number, number][] = [];
  const DECOS = ["deco-ac", "deco-vent", "deco-vent", "deco-skylight"];
  for (let x = 0; x < m.w; x++) for (let y = 0; y < m.h; y++) {
    const L = structure(x, y);
    if (L < 0 || structure(x, y - 1) === L) continue; // runs start at their north end
    let yb = y;
    while (structure(x, yb + 1) === L) yb++;
    const lot = m.lots[L], south = structure(x, yb + 1);
    const Yn = y * TILE, Ys = yb * TILE + TILE - 1;
    // a structure behind a shorter one shows only the part of its wall that rises above it
    const show = Math.max(0, Math.min(lot.storeys * WALL - (south >= 0 ? m.lots[south].storeys * WALL : 0), Ys - Yn + 1 - 8));
    const wallTop = Ys - show + 1, ridge = Yn + Math.floor((wallTop - Yn) * 0.4);
    const roofT = tex(lot.roof), backT = lot.back ? tex(lot.back) : roofT, wallT = tex(lot.wall);
    for (let i = 0; i < TILE; i++) {
      const X = x * TILE + i;
      for (let Y = Yn; Y <= Ys; Y++) {
        const cy = Math.floor(Y / TILE);
        const edge = (i === 0 && structure(x - 1, cy) !== L) || (i === TILE - 1 && structure(x + 1, cy) !== L);
        mat[Y * width + X] = 3;
        let c: RGB | null;
        if (Y >= wallTop) c = edge || Y === Ys ? black : Y < wallTop + 2 ? eave : sample(wallT, X, Y - wallTop);
        else if ((Y === wallTop - 1 && show > 0) || edge || Y === Yn) c = black; // eave line and outline
        else if (lot.style === "gable") c = Y === ridge ? black : Y < ridge ? sample(backT, X, Y - Yn) : sample(roofT, X, Y - ridge - 1);
        else {
          // flat roof: a parapet rim, with the inner face of the north parapet showing
          const nearEdge = (i < 2 && structure(x - 1, cy) !== L) || (i > TILE - 3 && structure(x + 1, cy) !== L);
          c = Y - Yn < 3 || nearEdge ? parapet : Y - Yn < 6 ? parapetFace : sample(roofT, X, Y);
        }
        put(X, Y, c);
      }
    }
    // windows on each storey of the front wall; the ground floor of a building has its doors
    for (let st = 0; show >= 16; st++) {
      const bottom = Ys - st * WALL, top = bottom - WALL + 1;
      if (top < wallTop + 2) break;
      const door = st === 0 && m.building[yb][x] >= 0 ? m.props.find((p) => p.at[0] === x && p.at[1] === yb) : undefined;
      if (door) stamp(tex(door.state === "locked" ? "deco-door-locked" : door.state === "closed" ? "deco-door" : "deco-door-open"), x * TILE + 2, bottom - 16);
      else if ((x + L) % 2 === 0) stamp(tex("deco-window"), x * TILE + 3, top + 4);
    }
    if (lot.style === "flat") for (let cy = y + 1; cy < yb; cy++) {
      if ((cy + 1) * TILE > wallTop - 4 || structure(x - 1, cy) !== L || structure(x + 1, cy) !== L || hash(x, cy, 11) > 0.05) continue;
      decos.push([DECOS[Math.floor(hash(x, cy, 12) * DECOS.length)], x * TILE + 2, cy * TILE + 3]);
    }
  }
  for (const [d, X, Y] of decos) stamp(tex(d), X, Y);

  // ---- curbs (the sidewalk is raised: a light edge, and a 2 px face on the road below it), road markings ----
  const at = (X: number, Y: number) => (X < 0 || Y < 0 || X >= width || Y >= height ? 0 : mat[Y * width + X]);
  const curb = C("curb", "#fcfcfc"), curbFace = C("curbFace", "#7c7c7c");
  for (let Y = 0; Y < height; Y++) for (let X = 0; X < width; X++) {
    const v = mat[Y * width + X];
    if (v === 2 && (at(X + 1, Y) === 1 || at(X - 1, Y) === 1 || at(X, Y - 1) === 1)) put(X, Y, curb);
    else if (v === 1 && (at(X, Y - 1) === 2 || at(X, Y - 2) === 2)) put(X, Y, curbFace);
  }
  const yellow = C("yellow", "#d9b43c"), white = C("white", "#e4e4de");
  for (const l of m.lines) for (let Y = l.y0; Y <= l.y1; Y++) for (let X = l.x0; X <= l.x1; X++) if (at(X, Y) === 1) put(X, Y, l.color === "yellow" ? yellow : white);
  for (const [cx, cy, cw, chh, vertical] of m.crosswalks) for (let Y = cy; Y < cy + chh; Y++) for (let X = cx; X < cx + cw; X++) {
    const u = vertical ? X - cx : Y - cy;
    if (u % 4 < 2 && at(X, Y) === 1) put(X, Y, white);
  }

  // ---- overlays, rooftop clutter, props, people ----
  const blit = (t: Tex, X0: number, Y0: number) => { for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) put(X0 + i, Y0 + j, t.px[j * t.w + i]); };
  m.overlay.forEach((row, y) => row.forEach((l, x) => { if (l && visible(x, y)) blit(lookTex(l), x * TILE, y * TILE); }));
  for (const p of m.props) {
    const [x, y] = p.at, kd = m.kind[y][x], inside = m.building[y][x] >= 0;
    if (inside && p.prop === "prop-door" && (view === "interior" || !roofed(x, y))) continue; // drawn into the thin wall
    if (view === "exterior" && roofed(x, y)) continue; // under the roof, or a door already drawn in the front wall
    if (kd === undefined) continue;
    const doc = art.tiles.get(p.prop);
    if (doc?.frames[p.state]) blit(tex(p.prop, p.state), x * TILE, y * TILE);
  }
  for (const p of m.people) {
    const [x, y] = p.at;
    if (!visible(x, y)) continue;
    const f = personIdle(art, p.sprite), rows = f?.frames.S?.[0];
    if (!f || !rows) continue;
    // feet on the bottom of the cell, centred across it
    const X0 = x * TILE + Math.floor((TILE - f.w) / 2), Y0 = (y + 1) * TILE - f.h;
    rows.forEach((row, j) => [...row].forEach((key, i) => { if (key !== "." && f.palette[key]) put(X0 + i, Y0 + j, rgb(f.palette[key])); }));
  }
  return { width, height, pixels: px };
}

const idleCache = new Map<string, Frames | null>();
function personIdle(art: EnvArt, id: string): Frames | null {
  if (idleCache.has(id)) return idleCache.get(id)!;
  const doc = art.chars.get(id);
  let f: Frames | null = null;
  if (doc?.kind === "recipe") { const { base, layers } = recipeParts(art.chars, doc); f = composeWalk(doc, base, layers); }
  else if (doc) f = drawnWalk(doc);
  idleCache.set(id, f);
  return f;
}
