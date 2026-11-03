// Placeholder architecture: facade modules (windows, doors, awnings, columns), roof and street features, and the
// extra wall and roof materials the archetypes use. Master palette only; flat fills, black outlines.
// Usage: node 3-architecture.mjs <out dir>   (run after 2-textures-8bit.mjs)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
const P = JSON.parse(readFileSync(join(out, "palette-street.json"), "utf8")).master;
const KEYS = "abcdefghijklmnopqrstuvwxyz";
function sprite(id, name, w, h, fn, kind = "deco") {
  const palette = {}, keyOf = {};
  const key = (c) => { if (!c) return "."; const hex = P[c] ?? c; if (!keyOf[hex]) { const k = KEYS[Object.keys(palette).length]; keyOf[hex] = k; palette[k] = hex; } return keyOf[hex]; };
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => key(fn(x, y))).join("")).join("/");
  if (kind === "texture" && Object.keys(palette).length > 4) throw new Error(`${id}: more than 4 colours`);
  writeFileSync(join(out, `${id}.json`), JSON.stringify({ kind, name, w, h, palette, frames: { 0: [rows] } }, null, 2) + "\n");
}
const box = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const rim = (x, y, x0, y0, x1, y1) => box(x, y, x0, y0, x1, y1) && (x === x0 || x === x1 || y === y0 || y === y1);
const disc = (x, y, cx, cy, r) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;

// ---------- wall and roof materials ----------
sprite("tex-wall-stone", "Wall: dressed stone", 16, 8, (x, y) => (y === 3 || y === 7 || (x + (y > 3 ? 8 : 0)) % 16 === 0 ? "grey2" : "grey1"), "texture");
sprite("tex-wall-white", "Wall: white render", 16, 16, (x, y) => (y === 15 ? "grey1" : "white"), "texture");
sprite("tex-wall-corrugated", "Wall: corrugated metal", 4, 4, (x) => (x === 0 ? "grey3" : x === 1 ? "grey1" : "grey2"), "texture");
sprite("tex-roof-sawtooth", "Roof: sawtooth (north lights)", 16, 8, (x, y) => (y === 7 ? "black" : y < 2 ? "blueLight" : y === 2 ? "white" : "grey2"), "texture");

// ---------- facade modules ----------
sprite("deco-window-arched", "Window: arched", 10, 14, (x, y) => {
  const top = y < 5 && !disc(x, y, 5, 5, 5); if (top) return null;
  const edge = x === 0 || x === 9 || y === 13 || (y < 5 && !disc(x, y, 5, 5, 4));
  return edge ? "black" : x === 5 || y === 7 ? "white" : x === 2 && y < 7 ? "blueLight" : "blueDark";
});
sprite("deco-window-shop", "Window: shopfront", 14, 14, (x, y) => (rim(x, y, 0, 0, 13, 13) ? "black" : y === 12 ? "brown" : x === 7 ? "black" : x - y > 2 && x - y < 5 ? "sky" : "blueDark"));
sprite("deco-window-barred", "Window: barred", 10, 12, (x, y) => (rim(x, y, 0, 0, 9, 11) ? "black" : x % 3 === 1 ? "grey1" : "blueDark"));
sprite("deco-window-ribbon", "Window: ribbon band", 16, 8, (x, y) => (y === 0 || y === 7 ? "black" : x === 15 ? "grey3" : y === 2 && x < 6 ? "blueLight" : "blueDark"));
sprite("deco-door-double", "Door: double glass", 14, 16, (x, y) => (rim(x, y, 0, 0, 13, 15) && y !== 15 ? "black" : x === 7 ? "black" : y === 8 ? "grey1" : x - y > 0 && x - y < 3 ? "sky" : "blueDark"));
sprite("deco-door-arched", "Door: arched timber", 12, 16, (x, y) => {
  if (y < 6 && !disc(x, y, 6, 6, 6)) return null;
  return (y < 6 && !disc(x, y, 6, 6, 5)) || x === 0 || x === 11 ? "black" : x === 6 ? "brownDark" : (x === 8 && y === 9) ? "yellow" : "brown";
});
sprite("deco-door-rollup", "Door: roll-up", 14, 16, (x, y) => (rim(x, y, 0, 0, 13, 15) && y !== 15 ? "black" : y % 3 === 0 ? "grey3" : "grey1"));
sprite("deco-lock", "Lock (on a locked door)", 3, 4, (x, y) => (y === 0 ? (x === 1 ? null : "black") : rim(x, y, 0, 1, 2, 3) ? "black" : "yellow"));
const awning = (a, b) => (x, y) => (y === 0 ? "black" : y < 5 ? (Math.floor(x / 4) % 2 ? a : b) : y === 5 && x % 4 !== 3 ? (Math.floor(x / 4) % 2 ? a : b) : null);
sprite("deco-awning-red", "Awning: red stripes", 16, 6, awning("red", "white"));
sprite("deco-awning-green", "Awning: green stripes", 16, 6, awning("greenDark", "cream"));
sprite("deco-canopy", "Entrance canopy", 22, 6, (x, y) => (rim(x, y, 0, 0, 21, 4) ? "black" : y === 5 ? (x === 2 || x === 19 ? "grey3" : null) : y === 1 ? "white" : "grey1"));
sprite("deco-columns", "Portico columns (one bay)", 16, 20, (x, y) => {
  const col = (x >= 2 && x <= 5) || (x >= 10 && x <= 13);
  if (y < 2) return y === 0 ? "black" : "white";
  if (!col) return null;
  return x === 2 || x === 5 || x === 10 || x === 13 ? "grey2" : "white";
});

// ---------- roof features ----------
sprite("deco-helipad", "Helipad", 30, 30, (x, y) => {
  if (!disc(x, y, 15, 15, 15)) return null;
  if (!disc(x, y, 15, 15, 13.5)) return "yellow";
  const h = (x >= 9 && x <= 11 || x >= 18 && x <= 20) && y >= 8 && y <= 21 || (y >= 14 && y <= 15 && x >= 9 && x <= 20);
  return h ? "white" : "grey3";
});
sprite("deco-redcross", "Red cross", 12, 12, (x, y) => (rim(x, y, 0, 0, 11, 11) ? "black" : (box(x, y, 4, 2, 7, 9) || box(x, y, 2, 4, 9, 7)) ? "red" : "white"));
sprite("deco-steeple", "Church tower and spire", 18, 52, (x, y) => {
  // spire (y 0-17), belfry with an opening (18-33), tower base (34-51)
  if (y < 4) return x === 9 && y < 4 || (y === 1 && x >= 8 && x <= 10) ? "yellow" : null;
  if (y < 18) { const half = Math.floor((y - 4) / 2) + 1; if (Math.abs(x - 9) > half) return null; return Math.abs(x - 9) === half ? "black" : x < 9 ? "sky" : "slate"; }
  if (x < 2 || x > 15) return null;
  if (x === 2 || x === 15 || y === 18 || y === 51 || y === 33) return "black";
  if (y > 21 && y < 31 && x > 5 && x < 12) return (y < 24 && !disc(x, y, 9, 25, 3.5)) ? "grey1" : y === 30 ? "grey2" : "grey4";
  return (y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0) ? "grey2" : "grey1";
});
sprite("deco-clock", "Clock face", 12, 12, (x, y) => {
  if (!disc(x, y, 6, 6, 6)) return null;
  if (!disc(x, y, 6, 6, 5)) return "black";
  return (x === 6 && y >= 3 && y <= 6) || (y === 6 && x >= 6 && x <= 8) ? "black" : "white";
});
sprite("deco-flagpole", "Flagpole", 12, 32, (x, y) => (x === 1 && y > 0 ? (y === 31 ? "black" : "grey1") : y === 0 && x <= 2 ? "yellow" : box(x, y, 2, 2, 11, 8) ? (rim(x, y, 2, 2, 11, 8) ? "black" : y === 5 ? "white" : "blueDark") : null));
sprite("deco-dish", "Satellite dish", 14, 14, (x, y) => {
  if (y >= 10) return x >= 5 && x <= 8 ? (y === 13 ? "black" : "grey2") : null;
  if (!disc(x, y, 7, 5, 6)) return null;
  return !disc(x, y, 7, 5, 5) ? "black" : disc(x, y, 7, 5, 1.5) ? "grey2" : x + y < 9 ? "white" : "grey1";
});
sprite("deco-antenna", "Antenna mast", 7, 26, (x, y) => (y < 2 && x >= 2 && x <= 4 ? "red" : x === 3 ? "grey3" : y % 6 === 4 && x >= 1 && x <= 5 ? "grey2" : null));
sprite("deco-chimney", "Chimney", 8, 12, (x, y) => (rim(x, y, 0, 0, 7, 11) ? "black" : y < 3 ? "grey3" : (y % 3 === 0 || (x + Math.floor(y / 3)) % 4 === 0) ? "redDark" : "red"));

// ---------- street and yard dressing ----------
sprite("deco-ambulance", "Ambulance", 30, 18, (x, y) => {
  if (y < 2) return x >= 6 && x <= 9 ? (x < 8 ? "red" : "blueLight") : null;
  if (y > 15) return (x >= 3 && x <= 7) || (x >= 21 && x <= 25) ? "black" : null;
  if (rim(x, y, 0, 2, 29, 15)) return "black";
  if (x > 22 && y < 8) return "blueDark";
  return y === 9 || y === 10 ? "red" : (box(x, y, 12, 4, 15, 8) ? "red" : "white");
});
sprite("deco-police-car", "Patrol car", 28, 16, (x, y) => {
  if (y < 2) return x >= 11 && x <= 16 ? (x < 14 ? "red" : "blue") : null;
  if (y > 13) return (x >= 3 && x <= 7) || (x >= 19 && x <= 23) ? "black" : null;
  if (rim(x, y, 0, 2, 27, 13)) return "black";
  if (y < 7 && x > 6 && x < 21) return x === 14 ? "black" : "sky";
  return x < 7 || x > 20 ? "grey4" : "white";
});
sprite("deco-transformer", "Transformer", 16, 16, (x, y) => {
  if (y < 4) return x === 4 || x === 11 ? (y === 0 ? "black" : "orange") : null;
  if (rim(x, y, 1, 4, 14, 15)) return "black";
  return x % 3 === 0 ? "grey3" : "grey2";
});
sprite("deco-lamp", "Street lamp", 7, 22, (x, y) => (y < 3 ? (rim(x, y, 0, 0, 6, 2) ? "black" : "yellow") : x === 3 ? (y === 21 ? "black" : "grey3") : y === 21 && x >= 2 && x <= 4 ? "black" : null));
sprite("deco-tree", "Street tree", 16, 22, (x, y) => {
  if (y >= 14) return x >= 7 && x <= 8 ? (y === 21 ? "black" : "brownDark") : null;
  if (!disc(x, y, 8, 7.5, 7.5)) return null;
  if (!disc(x, y, 8, 7.5, 6.5)) return "black";
  return disc(x, y, 6, 5, 2.5) ? "greenLight" : (x + y * 3) % 7 === 0 ? "greenDark" : "green";
});
sprite("deco-hydrant", "Fire hydrant", 6, 8, (x, y) => (y === 0 ? (x >= 2 && x <= 3 ? "black" : null) : rim(x, y, 1, 1, 4, 7) ? "black" : y === 3 ? (x === 0 || x === 5 ? "black" : "red") : "red"));
sprite("deco-bench", "Bench", 16, 8, (x, y) => (y === 0 || y === 4 ? "black" : y < 4 ? (y === 2 ? "brownDark" : "brown") : (x === 2 || x === 13) ? "black" : null));
sprite("deco-bike-rack", "Bike rack", 14, 7, (x, y) => (y === 6 ? (x % 4 === 1 ? "black" : null) : x % 4 === 1 || (y === 0 && x % 4 < 3) ? "grey3" : null));
sprite("deco-hedge", "Hedge / yard planting", 16, 16, (x, y) => (rim(x, y, 0, 0, 15, 15) ? "greenDark" : (x * 7 + y * 3) % 11 === 0 ? "greenLight" : "green"));
console.log("wrote architecture to", out);
