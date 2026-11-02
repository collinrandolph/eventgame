// Sprite data and the recipe assembly, the same rules the sprite editor uses.
//
// Every sprite is drawn in palette keys: one character per pixel, "." empty, rows joined with "/". The keys on a
// base are body parts (k outline, a head, y eyes, n neck, t torso, p hips, U/u upper arm, O/o forearm, H/h hand,
// Q/q thigh, L/l shin; capitals are his right), so a recipe can colour each part.
//
//   character  hand-drawn: walk frames plus attack / hurt / death on their own bigger canvases
//   layer      one drawing per direction (hair, a hat, a collar), drawn over a base's idle
//   recipe     a base + a colour per body part + layers (+ per-recipe layer recolours): assembled, never drawn
//
// Recipe rules:
// - the base sits oy rows down the canvas (room above for hats and big hair); each body part takes the recipe's colour
// - a layer pixel paints where that frame has the same body part it was drawn over in the idle, or one of the parts
//   in the layer's `covers` (long hair over the shoulders, a coat over the hips)
// - on the walk's bounce frames (3 and 6) the head and chest rise a row; a layer with rise "all" (a coat hem) rises
//   entirely
// - recipe.tints {layerId: {key: hex}} recolours a layer for that recipe (a green cap from the police cap); "part:a"
//   in a layer's palette means the recipe's colour for that body part (ears in the skin tone)
// - a layer drawn for a different oy moves down (or up) to the recipe's
// - layers go on back to front by where they sit (`stack`, see STACK), whatever order the recipe lists them in:
//   a collar under hair, hair under a raised hood, a hat on top
// - the canvas has room above for whatever the layers draw, and for it rising a row on the walk's bounce (fitOy)
// - in attack / hurt / death the head, chest and hips move about, so each frame finds where each one went (see
//   findRegions) and moves that part's layer pixels with it

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const DIRS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"] as const;
export type Dir = (typeof DIRS)[number];
export const ANIMS = ["attack", "hurt", "death"] as const;
export type Anim = (typeof ANIMS)[number];
/** Directions each animation is played in (all 8 unless listed). Death is side views only. */
export const ANIM_DIRS: Partial<Record<Anim, Dir[]>> = { death: ["E", "W"] };
/** The direction a missing one plays. */
export const FALLBACK: Partial<Record<Anim, Partial<Record<Dir, Dir>>>> = {
  death: { S: "E", SE: "E", NE: "E", N: "W", SW: "W", NW: "W" },
};
export const WALK_FPS = 8;
export const ANIM_FPS: Record<Anim, number> = { attack: 12, hurt: 10, death: 8 };

/**
 * Where a layer sits, back to front; later slots cover earlier ones. A lowered hood is "outer" (the hair falls over
 * it), a raised one is "hood" (it covers the hair).
 */
export const STACK = ["skin", "shirt", "lower", "outer", "hair", "hood", "face", "glasses", "hat"] as const;
export type StackSlot = (typeof STACK)[number];

export type Palette = Record<string, string>;
export interface AnimDoc { w: number; h: number; ox: number; oy: number; frames: Partial<Record<string, string[]>> }
export interface SpriteDoc {
  kind?: "layer" | "recipe";
  name: string;
  w: number;
  h: number;
  palette: Palette;
  paletteNames?: Record<string, string>;
  frames: Partial<Record<string, string[]>>;
  attack?: AnimDoc;
  hurt?: AnimDoc;
  death?: AnimDoc;
  // layers
  base?: string;
  oy?: number;
  covers?: string;
  rise?: string;
  stack?: StackSlot;
  // recipes
  colors?: Palette;
  layers?: string[];
  tints?: Record<string, Palette>;
  group?: string;
  needs?: string[];
}
export interface Layer extends SpriteDoc { id: string }

/** Every sprite document in a folder (one JSON file per id). */
export function loadSprites(dir: string): Map<string, SpriteDoc> {
  const out = new Map<string, SpriteDoc>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    out.set(f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), "utf8")) as SpriteDoc);
  }
  return out;
}

/** Assembled frames: rows of keys into `palette`, plus which layer painted each pixel ("" = the base). */
export interface Frames {
  w: number;
  h: number;
  ox: number;
  oy: number;
  palette: Palette;
  frames: Partial<Record<Dir, string[][]>>;
  painter: Partial<Record<Dir, string[][][]>>;
}

const KEYS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const BOB = [0, 0, 0, 1, 0, 0, 1];

function paletteBuilder() {
  const palette: Palette = {}, keyOf: Record<string, string> = {};
  const keyFor = (hex: string) => {
    if (!keyOf[hex]) { const k = KEYS[Object.keys(palette).length] ?? "?"; keyOf[hex] = k; palette[k] = hex; }
    return keyOf[hex];
  };
  return { palette, keyFor };
}

function layerRows(l: Layer, dir: string, oy: number): string[] {
  const r = (l.frames[dir]?.[0] ?? "").split("/"), d = oy - (l.oy ?? 0);
  return d > 0 ? [...Array<string>(d).fill(""), ...r] : r.slice(-d);
}

function colourOf(recipe: SpriteDoc, base: SpriteDoc, l: Layer, c: string): string {
  const col = recipe.tints?.[l.id]?.[c] ?? l.palette[c] ?? "#ff00ff";
  if (!col.startsWith("part:")) return col;
  const part = col.slice(5);
  return recipe.colors?.[part] ?? base.palette[part] ?? "#ff00ff";
}

const partColour = (recipe: SpriteDoc, base: SpriteDoc, c: string) => recipe.colors?.[c] ?? base.palette[c] ?? "#ff00ff";

/** How far down the canvas the base sits: the recipe's oy, more if a layer would otherwise rise off the top. */
export function fitOy(recipe: SpriteDoc, layers: Layer[]): number {
  const oy0 = recipe.oy ?? 0;
  let top = Infinity;
  for (const l of layers) for (const fr of Object.values(l.frames)) {
    if (!fr?.[0]) continue;
    fr[0].split("/").forEach((row, y) => {
      const Y = y + oy0 - (l.oy ?? 0);
      if (/[^.]/.test(row) && (l.rise === "all" || Y - oy0 <= 11)) top = Math.min(top, Y);
    });
  }
  return top < 1 ? oy0 + 1 - top : oy0;
}

/** A recipe's walk (idle + 6 frames) in every direction the base has. */
export function composeWalk(recipe: SpriteDoc, base: SpriteDoc, layers: Layer[]): Frames {
  layers = stacked(layers);
  const oy = fitOy(recipe, layers), W = base.w, H = base.h + oy;
  const pad = (s: string) => [...Array<string>(oy).fill(".".repeat(W)), ...s.split("/").map((r) => r.slice(0, W).padEnd(W, "."))].slice(0, H);
  const { palette, keyFor } = paletteBuilder();
  const frames: Frames["frames"] = {}, painter: Frames["painter"] = {};
  for (const dir of DIRS) {
    const drawn = base.frames[dir];
    if (!drawn) continue;
    const idle = pad(drawn[0]);
    frames[dir] = [];
    painter[dir] = [];
    drawn.forEach((s, i) => {
      const parts = pad(s);
      const out = parts.map((row) => [...row].map((c) => (c === "." ? "." : keyFor(partColour(recipe, base, c)))));
      const by = parts.map((row) => [...row].map(() => ""));
      for (const l of layers) {
        const covers = l.covers ?? "";
        layerRows(l, dir, oy).forEach((row, y) => [...row].forEach((c, x) => {
          if (c === "." || x >= W || y >= H) return;
          const ty = l.rise === "all" || y - oy <= 11 ? y - (BOB[i] ?? 0) : y;
          if (ty < 0 || ty >= H) return;
          const here = parts[ty][x];
          if (here !== idle[y][x] && !covers.includes(here)) return;
          out[ty][x] = keyFor(colourOf(recipe, base, l, c));
          by[ty][x] = l.id;
        }));
      }
      frames[dir]!.push(out.map((r) => r.join("")));
      painter[dir]!.push(by);
    });
  }
  return { w: W, h: H, ox: 0, oy: 0, palette, frames, painter };
}

// ---------- where the head, chest and hips went in an animation frame ----------

type Px = [number, number, string];
interface Offset { dx: number; dy: number; fit?: number; squash?: number; turn?: 1 | 2 | 3; cx?: number; cy?: number }
const REGION = (by: number) => (by <= 8 ? "head" : by <= 11 ? "chest" : "hips");

/**
 * The offset of the idle's head (rows 1-8), chest (torso) and hips/legs in a frame: the one with the most matching
 * body-part pixels. The head counts its outline too (the back of the head has no eyes, so its outline pins the row),
 * but how well it fits is judged on the skin alone, at least 60% (a bat or a raised hand can cover part of it).
 * A head that doesn't fit as drawn may be squashed (drawn a row or two shorter) or turned (lying down).
 */
function findRegions(idle: string[], parts: string[], ox: number, aoy: number, roy: number) {
  const sets: Record<string, Px[]> = { head: [], chest: [], hips: [] };
  idle.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === ".") return;
    const by = y - roy;
    if (by >= 1 && by <= 8) sets.head.push([x, y, c]);
    else if (c === "k") return;
    else if (c === "t") sets.chest.push([x, y, c]);
    else if ("pQqLl".includes(c)) sets.hips.push([x, y, c]);
  }));
  const at: Record<string, Offset | null> = {};
  for (const [name, px] of Object.entries(sets)) {
    let best = { m: -1, dx: 0, dy: 0 };
    for (let dy = -4; dy <= 4; dy++) for (let dx = -5; dx <= 5; dx++) {
      let m = 0;
      for (const [x, y, c] of px) if (parts[y + aoy + dy]?.[x + ox + dx] === c) m++;
      if (m > best.m || (m === best.m && Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.dy))) best = { m, dx, dy };
    }
    const skin = px.filter((p) => p[2] !== "k");
    let fm = 0;
    for (const [x, y, c] of skin) if (parts[y + aoy + best.dy]?.[x + ox + best.dx] === c) fm++;
    const fit = skin.length ? fm / skin.length : 0;
    at[name] = px.length && fit >= 0.6 ? { dx: best.dx, dy: best.dy, fit } : null;
  }
  if (!at.head || (at.head.fit ?? 0) < 0.8) at.head = squashedHead(idle, parts, ox, aoy, roy) ?? at.head;
  if (!at.head) at.head = turnedHead(idle, parts, roy);
  return at;
}

// a squashed head: rows taken out from the top of the skull (from row 3); hair on those rows is left out
const squashRow = (by: number, s: number) => (by >= 3 && by < 3 + s ? null : by >= 3 + s ? by - s : by);
function squashedHead(idle: string[], parts: string[], ox: number, aoy: number, roy: number): Offset | null {
  let best: (Offset & { r: number }) | null = null;
  for (const s of [1, 2]) {
    const head: Px[] = [];
    idle.forEach((row, y) => {
      const by = y - roy, sy = squashRow(by, s);
      if (by >= 1 && by <= 8 && sy !== null) [...row].forEach((c, x) => { if (c !== ".") head.push([x, roy + sy, c]); });
    });
    for (let dy = -4; dy <= 8; dy++) for (let dx = -5; dx <= 5; dx++) {
      let m = 0;
      for (const [x, y, c] of head) if (parts[y + aoy + dy]?.[x + ox + dx] === c) m++;
      const r = m / head.length;
      if (r >= 0.9 && (!best || r > best.r)) best = { r, dx, dy, squash: s, fit: 1 };
    }
  }
  return best;
}

// a head lying down or upside down: the idle's head turned a quarter, half or three quarters about its middle
const TURNS = { 1: (x: number, y: number) => [-y, x], 2: (x: number, y: number) => [-x, -y], 3: (x: number, y: number) => [y, -x] } as const;
function turnedHead(idle: string[], parts: string[], roy: number): Offset | null {
  const head: Px[] = [];
  idle.forEach((row, y) => { const by = y - roy; if (by >= 1 && by <= 8) [...row].forEach((c, x) => { if (c !== ".") head.push([x - 6, by - 5, c]); }); });
  let best: Offset & { m: number } = { m: -1, dx: 0, dy: 0 };
  for (const turn of [1, 2, 3] as const) for (let cy = 0; cy < parts.length; cy++) for (let cx = 0; cx < parts[0].length; cx++) {
    let m = 0;
    for (const [x, y, c] of head) { const [X, Y] = TURNS[turn](x, y); if (parts[cy + Y]?.[cx + X] === c) m++; }
    if (m > best.m) best = { m, dx: 0, dy: 0, turn, cx, cy };
  }
  return best.m / head.length >= 0.7 ? best : null;
}

// where a layer pixel (x, y on the recipe's walk canvas) lands in an animation frame, or null (a squashed-out row)
function place(off: Offset, x: number, y: number, ox: number, aoy: number, roy: number): [number, number] | null {
  if (off.squash) { const by = squashRow(y - roy, off.squash); return by === null ? null : [x + ox + off.dx, by + roy + aoy + off.dy]; }
  if (!off.turn) return [x + ox + off.dx, y + aoy + off.dy];
  const [X, Y] = TURNS[off.turn](x - 6, y - roy - 5);
  return [off.cx! + X, off.cy! + Y];
}

/** A recipe's attack, hurt or death: the base's frames with the layers following the head, chest and hips. */
export function composeAnim(recipe: SpriteDoc, base: SpriteDoc, layers: Layer[], kind: Anim): Frames | null {
  layers = stacked(layers);
  const A = base[kind];
  if (!A) return null;
  const oy = fitOy(recipe, layers), W = A.w, H = A.h + oy;
  const padIdle = (s: string) => [...Array<string>(oy).fill(".".repeat(base.w)), ...s.split("/")];
  const padAnim = (s: string) => [...Array<string>(oy).fill(".".repeat(W)), ...s.split("/").map((r) => r.slice(0, W).padEnd(W, "."))].slice(0, H);
  const { palette, keyFor } = paletteBuilder();
  const frames: Frames["frames"] = {}, painter: Frames["painter"] = {};
  for (const dir of animDirs(kind, A)) {
    const idle = padIdle(base.frames[dir]![0]);
    frames[dir] = [];
    painter[dir] = [];
    for (const s of A.frames[dir]!) {
      const parts = padAnim(s);
      const out = parts.map((row) => [...row].map((c) => (c === "." ? "." : keyFor(partColour(recipe, base, c)))));
      const by = parts.map((row) => [...row].map(() => ""));
      const at = findRegions(idle, parts, A.ox, A.oy, oy);
      for (const l of layers) {
        const covers = l.covers ?? "";
        layerRows(l, dir, oy).forEach((row, y) => [...row].forEach((c, x) => {
          if (c === ".") return;
          const off = at[l.rise === "all" ? "chest" : REGION(y - oy)];
          if (!off) return;
          const p = place(off, x, y, A.ox, A.oy, oy);
          if (!p) return;
          const [X, Y] = p;
          if (Y < 0 || Y >= H || X < 0 || X >= W) return;
          const here = parts[Y][X];
          if (here !== idle[y]?.[x] && !covers.includes(here)) return;
          out[Y][X] = keyFor(colourOf(recipe, base, l, c));
          by[Y][X] = l.id;
        }));
      }
      frames[dir]!.push(out.map((r) => r.join("")));
      painter[dir]!.push(by);
    }
  }
  return { w: W, h: H, ox: A.ox, oy: A.oy + oy, palette, frames, painter };
}

/** The directions an animation is played in that it has frames for. */
export function animDirs(kind: Anim, a: AnimDoc): Dir[] {
  return DIRS.filter((d) => a.frames[d] && (!ANIM_DIRS[kind] || ANIM_DIRS[kind]!.includes(d)));
}

/** A hand-drawn character's or base's frames in the same shape (nothing painted by layers). */
export function drawnWalk(doc: SpriteDoc): Frames {
  const frames: Frames["frames"] = {}, painter: Frames["painter"] = {};
  for (const dir of DIRS) {
    const f = doc.frames[dir];
    if (!f) continue;
    frames[dir] = f.map((s) => s.split("/").map((r) => r.slice(0, doc.w).padEnd(doc.w, ".")));
    painter[dir] = frames[dir]!.map((g) => g.map((r) => [...r].map(() => "")));
  }
  return { w: doc.w, h: doc.h, ox: 0, oy: 0, palette: doc.palette, frames, painter };
}
export function drawnAnim(doc: SpriteDoc, kind: Anim): Frames | null {
  const A = doc[kind];
  if (!A) return null;
  const frames: Frames["frames"] = {}, painter: Frames["painter"] = {};
  for (const dir of animDirs(kind, A)) {
    frames[dir] = A.frames[dir]!.map((s) => s.split("/").map((r) => r.slice(0, A.w).padEnd(A.w, ".")));
    painter[dir] = frames[dir]!.map((g) => g.map((r) => [...r].map(() => "")));
  }
  return { w: A.w, h: A.h, ox: A.ox, oy: A.oy, palette: doc.palette, frames, painter };
}

/** Layers back to front by their stack slot (a layer without one counts as "shirt"); within a slot, as listed. */
export function stacked(layers: Layer[]): Layer[] {
  const at = (l: Layer) => { const i = STACK.indexOf(l.stack as StackSlot); return i < 0 ? 1 : i; };
  return layers.map((l, i) => [l, i] as const).sort((a, b) => at(a[0]) - at(b[0]) || a[1] - b[1]).map(([l]) => l);
}

/** Everything a recipe needs, looked up by id. */
export function recipeParts(all: Map<string, SpriteDoc>, recipe: SpriteDoc) {
  const base = all.get(recipe.base ?? "");
  if (!base) throw new Error(`${recipe.name}: base ${recipe.base} is missing`);
  const layers = (recipe.layers ?? []).map((id) => {
    const l = all.get(id);
    if (!l || l.kind !== "layer") throw new Error(`${recipe.name}: layer ${id} is missing`);
    return { ...l, id };
  });
  return { base, layers };
}
