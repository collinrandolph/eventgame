// 8-bit environment art: one fixed master palette, flat fills, at most 4 colours per texture, patterns placed
// deliberately (joints, seams, tufts, waves) instead of noise. Overwrites tex-*, deco-*, palette and theme colours.
// Usage: node gen-env-8bit.mjs <out dir>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
// NES-inspired master palette: every environment colour comes from here
const P = {
  black: "#000000", white: "#fcfcfc", grey1: "#bcbcbc", grey2: "#7c7c7c", grey3: "#3c3c3c", grey4: "#242424",
  red: "#a81000", redDark: "#581800", orange: "#e45c10", tan: "#f8b878", brown: "#ac7c00", brownDark: "#503000",
  yellow: "#f8b800", cream: "#fcd8a8", green: "#00a800", greenDark: "#005800", greenLight: "#58d854",
  blue: "#0058f8", blueDark: "#0000bc", blueLight: "#3cbcfc", sky: "#a4e4fc", slate: "#6888fc", plum: "#6844fc",
};
// small deterministic scatter with a minimum spacing, so patterns read as placed, not noisy
const rnd = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function scatter(w, h, n, gap, seed) {
  const pts = [];
  for (let t = 0; pts.length < n && t < n * 50; t++) {
    const x = Math.floor(rnd(t, 1, seed) * w), y = Math.floor(rnd(t, 2, seed) * h);
    if (pts.every(([a, b]) => Math.min(Math.abs(a - x), w - Math.abs(a - x)) + Math.min(Math.abs(b - y), h - Math.abs(b - y)) >= gap)) pts.push([x, y]);
  }
  return pts;
}
const KEYS = "abcdefghijklmnopqrstuvwxyz";
function texture(id, name, w, h, fn, kind = "texture") {
  const palette = {}, keyOf = {};
  const key = (c) => { if (!c) return "."; const hex = P[c] ?? c; if (!keyOf[hex]) { const k = KEYS[Object.keys(palette).length]; keyOf[hex] = k; palette[k] = hex; } return keyOf[hex]; };
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => key(fn(x, y))).join("")).join("/");
  if (kind === "texture" && Object.keys(palette).length > 4) throw new Error(`${id}: ${Object.keys(palette).length} colours (max 4)`);
  writeFileSync(join(out, `${id}.json`), JSON.stringify({ kind, name, w, h, palette, frames: { 0: [rows] } }, null, 2) + "\n");
}
const at = (pts, x, y) => pts.some(([a, b]) => a === x && b === y);
const glyph = (pts, x, y, shape) => pts.some(([a, b]) => shape.some(([dx, dy]) => a + dx === x && b + dy === y));

// ---------- ground ----------
{ const sp = scatter(32, 32, 10, 6, 1), cr = scatter(32, 32, 3, 12, 2);
  texture("tex-asphalt", "Asphalt", 32, 32, (x, y) => glyph(cr, x, y, [[0, 0], [1, 0], [1, 1], [2, 1]]) ? "grey4" : at(sp, x, y) ? "grey2" : "grey3"); }
texture("tex-sidewalk", "Sidewalk slabs", 16, 16, (x, y) => (x === 15 || y === 15 ? "grey2" : x === 0 || y === 0 ? "white" : "grey1"));
texture("tex-pavers", "Plaza stone squares", 16, 16, (x, y) => (x % 8 === 7 || y % 8 === 7 ? "tan" : (x % 8 === 0 || y % 8 === 0) && (x + y) % 16 < 8 ? "white" : "cream"));
texture("tex-concrete", "Poured concrete", 32, 32, (x, y) => (x % 32 === 31 || y % 32 === 31 ? "grey2" : at(scatter(32, 32, 4, 10, 3), x, y) ? "grey2" : "grey1"));
{ const tufts = scatter(32, 32, 9, 8, 4);
  texture("tex-grass", "Grass", 32, 32, (x, y) => glyph(tufts, x, y, [[0, 0], [2, 0]]) ? "greenDark" : glyph(tufts, x, y, [[1, -1]]) ? "greenLight" : "green"); }
{ const g = scatter(16, 16, 12, 3, 5);
  texture("tex-gravel", "Gravel", 16, 16, (x, y) => (at(g.slice(0, 6), x, y) ? "brownDark" : at(g.slice(6), x, y) ? "grey1" : "grey2")); }
{ const waves = scatter(32, 32, 6, 10, 6);
  texture("tex-water", "Water", 32, 32, (x, y) => glyph(waves, x, y, [[0, 0], [1, 0], [2, 0]]) ? "blueLight" : glyph(waves, x, y, [[1, 1], [2, 1], [3, 1]]) ? "blueDark" : "blue"); }
texture("tex-bank", "Embankment stone (wall face)", 16, 8, (x, y) => (y === 7 || (x + (y > 3 ? 4 : 0)) % 8 === 0 || y === 3 ? "black" : "grey2"));

// ---------- roofs (front slope / flat) and back slopes ----------
// shingles: overlapping rows, each tab with a notch and a lit top edge, so a roof never reads as a brick wall
const shingle = (lit, base, dark) => (x, y) => { const r = Math.floor(y / 4), o = (r % 2) * 2, t = y % 4; return t === 3 || (t === 2 && (x + o) % 4 === 0) ? dark : t === 0 && (x + o) % 4 !== 0 ? lit : base; };
texture("tex-roof-shingle", "Roof: shingles", 16, 8, shingle("orange", "red", "redDark"));
texture("tex-roof-shingle-back", "Roof: shingles, back slope", 16, 8, shingle("tan", "orange", "red"));
texture("tex-roof-slate", "Roof: slate", 16, 8, shingle("sky", "slate", "grey4"));
texture("tex-roof-slate-back", "Roof: slate, back slope", 16, 8, shingle("white", "sky", "slate"));
{ const d = scatter(16, 16, 5, 5, 7);
  texture("tex-roof-flat", "Roof: flat (tar and gravel)", 16, 16, (x, y) => (at(d, x, y) ? "grey2" : "grey3")); }
texture("tex-roof-flat-light", "Roof: flat (membrane)", 16, 16, (x, y) => (x === 15 ? "grey2" : "grey1"));
texture("tex-roof-metal", "Roof: standing-seam metal", 8, 8, (x, y) => (x === 0 ? "white" : x === 1 ? "grey3" : "grey2"));

// ---------- walls (front faces) ----------
texture("tex-wall-brick", "Wall: brick", 16, 8, (x, y) => (y === 3 || y === 7 || (x + (y > 3 ? 4 : 0)) % 8 === 0 ? "redDark" : "red"));
texture("tex-wall-tan", "Wall: stucco", 16, 8, (x, y) => (y === 7 && x % 4 === 0 ? "brown" : "tan"));
texture("tex-wall-panel", "Wall: concrete panel", 16, 16, (x, y) => (x === 15 || y === 15 ? "grey2" : "grey1"));
texture("tex-wall-siding", "Wall: siding", 16, 4, (x, y) => (y === 3 ? "grey2" : "white"));

// ---------- facade details and rooftop clutter (transparent around) ----------
texture("deco-window", "Window", 10, 12, (x, y) => (x === 0 || x === 9 || y === 0 || y === 11 ? "black" : y === 6 ? "white" : x === 2 && y < 5 ? "blueLight" : "blueDark"), "deco");
texture("deco-door", "Door (front wall)", 12, 16, (x, y) => (x === 0 || x === 11 || y === 0 ? "black" : x === 9 && y === 8 ? "yellow" : x === 6 ? "brownDark" : "brown"), "deco");
texture("deco-door-locked", "Door, locked", 12, 16, (x, y) => (x === 0 || x === 11 || y === 0 ? "black" : (x === 8 || x === 9) && (y === 7 || y === 8) ? "yellow" : x === 6 ? "brownDark" : "brown"), "deco");
texture("deco-door-open", "Doorway", 12, 16, (x, y) => (x === 0 || x === 11 || y === 0 ? "black" : x <= 2 ? "brown" : "grey4"), "deco");
texture("deco-ac", "Rooftop AC unit", 12, 10, (x, y) => (x === 0 || x === 11 || y === 0 || y === 9 ? "black" : y === 8 ? "grey2" : (x + y) % 2 === 0 && x > 2 && x < 9 && y > 2 && y < 7 ? "grey3" : "grey1"), "deco");
texture("deco-vent", "Rooftop vent", 6, 6, (x, y) => (x === 0 || x === 5 || y === 0 || y === 5 ? "black" : y === 1 ? "grey1" : "grey2"), "deco");
texture("deco-skylight", "Skylight", 14, 8, (x, y) => (x === 0 || x === 13 || y === 0 || y === 7 ? "black" : x === y + 2 ? "white" : "blueLight"), "deco");

writeFileSync(join(out, "palette-street.json"), JSON.stringify({
  kind: "palette", name: "Master palette and line colours",
  master: P,
  colors: { curb: P.white, curbFace: P.grey2, outline: P.black, eave: P.grey4, yellow: P.yellow, white: P.white, parapet: P.grey1, parapetFace: P.grey2 },
}, null, 2) + "\n");

// themes: floor and wall colours from the master palette (3 floor colours, 2 face colours, 2 wall-top colours)
const T = {
  "theme-clinic": ["white", "grey1", "white", "grey1", "grey2", "grey2", "grey1"],
  "theme-lab": ["sky", "blueLight", "white", "grey1", "grey2", "grey3", "grey2"],
  "theme-office": ["cream", "tan", "white", "tan", "brown", "grey3", "grey2"],
  "theme-wood": ["brown", "brownDark", "tan", "cream", "tan", "brownDark", "brown"],
  "theme-carpet": ["red", "redDark", "orange", "cream", "tan", "brownDark", "brown"],
  "theme-stone": ["grey1", "grey2", "white", "grey1", "grey2", "grey3", "grey2"],
  "theme-concrete": ["grey1", "grey2", "white", "grey1", "grey2", "grey3", "grey2"],
  "theme-pavement": ["orange", "redDark", "tan", "grey1", "grey2", "grey3", "grey2"],
  "theme-grass": ["green", "greenDark", "greenLight", "grey1", "grey2", "grey3", "grey2"],
  "theme-gravel": ["grey2", "brownDark", "grey1", "grey1", "grey2", "grey3", "grey2"],
  "theme-sewer": ["grey3", "grey4", "greenDark", "grey3", "grey4", "black", "grey4"],
  "theme-bridge": ["grey2", "grey3", "grey1", "grey1", "grey2", "grey3", "grey2"],
};
for (const [id, [f, g, F, v, x, w, W]] of Object.entries(T)) {
  const p = join(out, `${id}.json`), doc = JSON.parse(readFileSync(p, "utf8"));
  const tex = { "theme-pavement": "tex-pavers", "theme-concrete": "tex-concrete", "theme-grass": "tex-grass", "theme-gravel": "tex-gravel" }[id];
  if (tex) doc.texture = tex;
  doc.colors = { f: P[f], g: P[g], F: P[F], v: P[v], x: P[x], w: P[w], W: P[W] };
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
}
// fixed-colour tiles and props onto the master palette
const snap = (hex) => { const c = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const a = c(hex); let best = P.black, d = 1e9;
  for (const v of Object.values(P)) { const b = c(v), e = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (e < d) { d = e; best = v; } } return best; };
for (const f of readdirSync(out).filter((f) => /^(tile|prop)-/.test(f))) {
  const p = join(out, f), doc = JSON.parse(readFileSync(p, "utf8"));
  for (const k of Object.keys(doc.palette)) doc.palette[k] = snap(doc.palette[k]);
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
}
console.log("wrote 8-bit art to", out);
