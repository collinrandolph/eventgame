// Starter base meshes for creatures, in the sprite editor's format: a palette key per body part, like the human
// bases, so they can be recoloured and dressed the same way.
//
//   npm run creature-bases     write sprites/data/base-quadruped.json and base-winged.json
//
// Drawn from rectangles per part, then outlined, so they're a rough start to correct in the Creature Frame Editor,
// not finished art. Side views (E, W mirrored) have a walk cycle and, for the winged base, a fly cycle; front and
// back (S, N) have an idle and a simple walk; the diagonals start as copies of the side views. Keys follow the
// human base: lowercase the left side, capitals the right. Medium size (a wolf or large dog; an eagle), next to a
// 13 x 16 person.

import { writeFileSync } from "node:fs";

type Rect = [key: string, x0: number, y0: number, x1: number, y1: number];
const DIRS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"] as const;

/** Rectangles (inclusive), later ones over earlier ones, then a one-pixel outline round everything. */
function draw(w: number, h: number, rects: Rect[]): string[] {
  const g = Array.from({ length: h }, () => Array<string>(w).fill("."));
  for (const [k, x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = k;
  const out = g.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] !== ".") continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] && g[y + dy][x + dx] !== ".")) out[y][x] = "k";
  }
  return out.map((r) => r.join(""));
}
const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""));
const up = (rects: Rect[], dy: number): Rect[] => rects.map(([k, a, b, c, d]) => [k, a, b - dy, c, d - dy]);

// ---- the quadruped: 32 x 24, standing on row 20, facing east in the side view ----
const QW = 32, QH = 24, QG = 20;
function quadSide(phase: number | null): string[] {
  // a leg: upper from the hip, then lower and paw, swung forward by `off` and lifted by `lift`
  const leg = (x: number, U: string, O: string, H: string, p: number | null): Rect[] => {
    const off = p === null ? 0 : [0, 1, 1, 0, -1, -1][p % 6], lift = p !== null && p % 6 < 2 ? 1 : 0;
    return [[U, x, 15, x + 1, 17], [O, x + off, 18 - lift, x + off + 1, QG - 1 - lift], [H, x + off, QG - lift, x + off + 2, QG - lift]];
  };
  const p = phase, q = phase === null ? null : phase + 3, bob = phase === null ? 0 : [0, 1, 0, 0, 1, 0][phase];
  const body: Rect[] = [
    ["t", 6, 10, 8, 11], ["T", 4, 8, 5, 9],
    ["b", 9, 10, 18, 12], ["v", 10, 13, 17, 14], ["c", 18, 10, 21, 14],
    ["n", 20, 7, 22, 9], ["e", 22, 3, 22, 4], ["a", 22, 5, 26, 8], ["j", 27, 7, 29, 8], ["E", 24, 3, 24, 4], ["y", 25, 6, 25, 6],
  ];
  return draw(QW, QH, [
    ...leg(17, "u", "o", "h", q), ...leg(9, "q", "l", "f", p),     // far legs first
    ...up(body, bob),
    ...leg(19, "U", "O", "H", p), ...leg(11, "Q", "L", "F", q),     // near legs over the body
  ]);
}
function quadFront(phase: number | null): string[] {
  const lift = (side: number) => (phase !== null && (phase + side * 3) % 6 < 2 ? 1 : 0);
  return draw(QW, QH, [
    ["F", 12, QG - lift(1), 13, QG - lift(1)], ["f", 18, QG - lift(0), 19, QG - lift(0)],      // back paws, behind
    ["c", 13, 12, 19, 16], ["n", 15, 11, 17, 12],
    ["E", 13, 5, 13, 6], ["e", 19, 5, 19, 6], ["a", 14, 6, 18, 10], ["j", 15, 10, 17, 11], ["y", 15, 8, 15, 8], ["y", 17, 8, 17, 8],
    ["U", 13, 17, 14, 17], ["O", 13, 18, 14, QG - 1 - lift(0)], ["H", 13, QG - lift(0), 14, QG - lift(0)],
    ["u", 18, 17, 19, 17], ["o", 18, 18, 19, QG - 1 - lift(1)], ["h", 18, QG - lift(1), 19, QG - lift(1)],
  ]);
}
function quadBack(phase: number | null): string[] {
  const lift = (side: number) => (phase !== null && (phase + side * 3) % 6 < 2 ? 1 : 0);
  return draw(QW, QH, [
    ["e", 14, 4, 14, 5], ["E", 18, 4, 18, 5], ["a", 14, 5, 18, 8],
    ["b", 13, 9, 19, 15], ["t", 16, 7, 16, 9], ["T", 16, 5, 16, 6],
    ["q", 13, 15, 14, 17], ["l", 13, 18, 14, QG - 1 - lift(0)], ["f", 13, QG - lift(0), 14, QG - lift(0)],
    ["Q", 18, 15, 19, 17], ["L", 18, 18, 19, QG - 1 - lift(1)], ["F", 18, QG - lift(1), 19, QG - lift(1)],
  ]);
}

// ---- the winged creature: 32 x 28, standing on row 24, facing east in the side view ----
const WW = 32, WH = 28, WG = 24;
type Wing = "folded" | "up" | "midup" | "level" | "down";
const sideWing = (pos: Wing, [I, M, T]: string[], dx = 0, dy = 0): Rect[] => {
  const r: Record<Wing, Rect[]> = {
    folded: [[I, 13, 15, 17, 16], [M, 11, 17, 14, 18], [T, 9, 19, 11, 19]],
    up: [[I, 14, 11, 17, 14], [M, 13, 7, 16, 10], [T, 12, 4, 14, 6]],
    midup: [[I, 12, 13, 16, 14], [M, 8, 11, 12, 12], [T, 5, 10, 8, 10]],
    level: [[I, 13, 14, 17, 15], [M, 10, 13, 13, 14], [T, 8, 13, 10, 13]],
    down: [[I, 14, 17, 17, 19], [M, 13, 20, 16, 22], [T, 12, 23, 14, 25]],
  };
  return r[pos].map(([k, a, b, c, d]) => [k, a + dx, b + dy, c + dx, d + dy]);
};
function wingSide(phase: number | null, fly: Wing | null): string[] {
  const off = phase === null ? 0 : [0, 1, 1, 0, -1, -1][phase];
  const legs: Rect[] = fly
    ? [["l", 12, 20, 13, 20], ["L", 13, 21, 14, 21], ["f", 10, 20, 11, 20], ["F", 11, 21, 12, 21]]     // tucked back in flight
    : [["l", 14 - off, 20, 14 - off, WG - 1], ["f", 14 - off, WG, 16 - off, WG], ["L", 16 + off, 20, 16 + off, WG - 1], ["F", 16 + off, WG, 18 + off, WG]];
  const far: Rect[] = fly ? sideWing(fly, ["w", "x", "z"], -2, -1) : [];
  const near: Rect[] = sideWing(fly ?? "folded", ["W", "X", "Z"]);
  const lift = fly ? 0 : phase !== null && phase % 3 === 1 ? 1 : 0;
  return draw(WW, WH, [
    ...far, ["t", 7, 18, 11, 19], ["T", 5, 18, 6, 19],
    ...legs,
    ...up([["b", 12, 15, 19, 19], ["v", 13, 18, 18, 19], ["n", 18, 15, 19, 15], ["a", 18, 11, 21, 14], ["j", 22, 13, 23, 13], ["y", 20, 12, 20, 12]], lift),
    ...up(near, lift),
  ]);
}
const frontWing = (pos: Wing, [I, M, T]: string[], flip: boolean): Rect[] => {
  const r: Record<Wing, Rect[]> = {
    folded: [[I, 12, 15, 12, 19]],
    up: [[I, 9, 12, 12, 14], [M, 6, 9, 9, 11], [T, 3, 7, 6, 8]],
    midup: [[I, 9, 13, 12, 15], [M, 5, 12, 9, 13], [T, 2, 11, 5, 12]],
    level: [[I, 9, 15, 12, 16], [M, 5, 15, 9, 16], [T, 2, 15, 5, 16]],
    down: [[I, 9, 16, 12, 18], [M, 6, 18, 9, 20], [T, 3, 20, 6, 21]],
  };
  return r[pos].map(([k, a, b, c, d]) => (flip ? [k, WW - 1 - c, b, WW - 1 - a, d] : [k, a, b, c, d]));
};
function wingFront(phase: number | null, fly: Wing | null, back: boolean): string[] {
  const lift = (side: number) => (!fly && phase !== null && (phase + side * 3) % 6 < 2 ? 1 : 0);
  // facing south the right wing is on the viewer's left; from behind it's on the viewer's right
  const R = frontWing(fly ?? "folded", ["W", "X", "Z"], back), Lw = frontWing(fly ?? "folded", ["w", "x", "z"], !back);
  const legs: Rect[] = fly ? [] : [
    ["L", back ? 17 : 15, 21, back ? 17 : 15, WG - 1 - lift(0)], ["F", back ? 17 : 14, WG - lift(0), back ? 18 : 15, WG - lift(0)],
    ["l", back ? 15 : 17, 21, back ? 15 : 17, WG - 1 - lift(1)], ["f", back ? 14 : 17, WG - lift(1), back ? 15 : 18, WG - lift(1)],
  ];
  const head: Rect[] = back
    ? [["a", 14, 10, 18, 13]]
    : [["a", 14, 10, 18, 14], ["j", 16, 13, 16, 14], ["y", 15, 12, 15, 12], ["y", 17, 12, 17, 12]];
  return draw(WW, WH, [
    ...legs,
    ...(back ? [] : R), ...(back ? [] : Lw),
    ["b", 13, 15, 19, 20], ...(back ? ([["t", 15, 20, 17, 21], ["T", 15, 22, 17, 22]] as Rect[]) : ([["v", 14, 17, 18, 20]] as Rect[])),
    ...head,
    ...(back ? R : []), ...(back ? Lw : []),
  ]);
}

// ---- assembling a base ----
const walk = (fn: (p: number | null) => string[]) => [fn(null), ...[0, 1, 2, 3, 4, 5].map((p) => fn(p))];
function framesFrom(side: string[][], front: string[][], back: string[][]) {
  const f: Record<string, string[]> = {};
  f.E = side.map((r) => r.join("/")); f.W = side.map((r) => mirror(r).join("/"));
  f.S = front.map((r) => r.join("/")); f.N = back.map((r) => r.join("/"));
  f.SE = f.E; f.NE = f.E; f.SW = f.W; f.NW = f.W;
  return Object.fromEntries(DIRS.map((d) => [d, f[d]]));
}

const QUAD = {
  name: "Base · Quadruped", body: "quadruped", size: "medium", ground: QG, w: QW, h: QH,
  palette: { k: "#000000", a: "#f2c9a0", j: "#e0884a", y: "#3b2a20", e: "#8d6e63", E: "#bcaaa4", n: "#e0b088", c: "#9e9e9e", b: "#757575", v: "#d7ccc8",
    u: "#ef9a9a", U: "#64b5f6", o: "#e53935", O: "#1e88e5", h: "#ffab91", H: "#ffcc80",
    q: "#ce93d8", Q: "#81c784", l: "#8e24aa", L: "#388e3c", f: "#b39ddb", F: "#c5e1a5", t: "#a1887f", T: "#5d4037" },
  paletteNames: { k: "Outline", a: "Head", j: "Muzzle / jaw", y: "Eyes", e: "Left ear", E: "Right ear", n: "Neck", c: "Chest", b: "Back", v: "Belly",
    u: "Left front upper leg", U: "Right front upper leg", o: "Left front lower leg", O: "Right front lower leg", h: "Left front paw", H: "Right front paw",
    q: "Left back thigh", Q: "Right back thigh", l: "Left back shin", L: "Right back shin", f: "Left back paw", F: "Right back paw", t: "Tail", T: "Tail tip" },
  frames: framesFrom(walk(quadSide), walk(quadFront), walk(quadBack)),
};

const FLAP: Wing[] = ["up", "midup", "level", "down", "level", "midup"];
const flyFrames = (dir: "side" | "front" | "back") => FLAP.map((w) => (dir === "side" ? wingSide(null, w) : wingFront(null, w, dir === "back")));
const flySide = flyFrames("side");
const WING = {
  name: "Base · Winged", body: "winged", size: "medium", ground: WG, w: WW, h: WH,
  palette: { k: "#000000", a: "#f2c9a0", j: "#f8b800", y: "#3b2a20", n: "#e0b088", b: "#757575", v: "#d7ccc8",
    W: "#64b5f6", X: "#1e88e5", Z: "#0d47a1", w: "#ef9a9a", x: "#e53935", z: "#b71c1c", t: "#a1887f", T: "#5d4037",
    L: "#388e3c", l: "#8e24aa", F: "#c5e1a5", f: "#ce93d8" },
  paletteNames: { k: "Outline", a: "Head", j: "Beak / jaw", y: "Eyes", n: "Neck", b: "Body", v: "Belly",
    W: "Right inner wing", X: "Right outer wing", Z: "Right wing tip", w: "Left inner wing", x: "Left outer wing", z: "Left wing tip",
    t: "Tail", T: "Tail tip", L: "Right leg", l: "Left leg", F: "Right talons", f: "Left talons" },
  frames: framesFrom(walk((p) => wingSide(p, null)), walk((p) => wingFront(p, null, false)), walk((p) => wingFront(p, null, true))),
  // the fly cycle: the same canvas, so it lines up with the walk; it's drawn lifted off the ground in the field
  fly: { w: WW, h: WH, ox: 0, oy: 0, frames: framesFrom(flySide, flyFrames("front"), flyFrames("back")) },
};

for (const [file, doc] of [["sprites/data/base-quadruped.json", QUAD], ["sprites/data/base-winged.json", WING]] as const) {
  writeFileSync(file, JSON.stringify({ ...doc, by: "claude", savedAt: Date.now() }) + "\n");
  console.log(`${file}: ${doc.w} x ${doc.h}, ground row ${doc.ground}`);
}
