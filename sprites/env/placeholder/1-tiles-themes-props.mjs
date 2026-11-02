// Placeholder environment art in the sprite editor's format (palette keys, rows joined with "/").
// Usage: node gen-env-art.mjs <out dir>   (writes sprites/env/data/*.json)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const N = 16;
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const draw = (fn, s = 0) => Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => fn(x, y, s)).join("")).join("/");
const variants = (fn, n = 3) => Object.fromEntries(Array.from({ length: n }, (_, s) => [String(s), [draw(fn, s)]]));
const save = (id, doc) => writeFileSync(join(out, `${id}.json`), JSON.stringify({ w: N, h: N, ...doc }, null, 2) + "\n");

// ---------- tiles: f/g/F are floor colours and w/W/v/x wall colours, all set by the theme ----------
const floorPal = { f: "#888888", g: "#6e6e6e", F: "#a0a0a0" };
const tile = (id, name, fn, palette = floorPal, n = 3) => save(id, { kind: "tile", name, palette, frames: variants(fn, n) });

tile("tile-floor-tile", "Floor: tiles", (x, y) => (x % 8 === 0 || y % 8 === 0 ? "g" : (x % 8 === 1 && y % 8 === 1 ? "F" : "f")));
tile("tile-floor-plank", "Floor: planks", (x, y, s) => (y % 4 === 0 || x === ((Math.floor(y / 4) * 7 + s * 3) % 16) ? "g" : x === ((Math.floor(y / 4) * 7 + s * 3 + 3) % 16) && y % 4 === 1 ? "F" : "f"));
tile("tile-floor-carpet", "Floor: carpet", (x, y, s) => ((x % 4 === 0 && y % 4 === 0) ? "g" : (x % 4 === 2 && y % 4 === 2 && hash(x, y, s) < 0.5) ? "F" : "f"));
tile("tile-floor-concrete", "Floor: concrete", (x, y, s) => (hash(x, y, s) < 0.02 ? "g" : "f"));
tile("tile-floor-grass", "Ground: grass", (x, y, s) => (hash(x, y, s) < 0.22 ? "g" : hash(x, y, s + 9) < 0.08 ? "F" : "f"));
tile("tile-floor-stone", "Floor: flagstones", (x, y, s) => ((y % 8 === 0) || (x + (Math.floor(y / 8) % 2) * 4) % 8 === 0 ? "g" : hash(x, y, s) < 0.05 ? "F" : "f"));

tile("tile-wall-top", "Wall: top", (x, y, s) => (hash(x, y, s) < 0.08 ? "W" : "w"), { w: "#5a5a66", W: "#6a6a76" });
tile("tile-wall-front", "Wall: front face", (x, y) => {
  if (y === 0) return "k";
  const row = Math.floor((y - 1) / 4);
  if ((y - 1) % 4 === 3) return "x";
  return (x + (row % 2) * 4) % 8 === 0 ? "x" : "v";
}, { k: "#000000", v: "#9a7b6a", x: "#7a5b4a" }, 1);
tile("tile-roof", "Roof (unenterable building)", (x, y, s) => (hash(x, y, s) < 0.15 ? "R" : "r"), { r: "#7a6658", R: "#8a7566" });
tile("tile-roof-front", "Roof: front face", (x, y) => (y === 0 ? "k" : y % 5 === 0 ? "x" : x % 6 === 3 && y > 2 && y < 13 ? "W" : "v"),
  { k: "#000000", v: "#9a8878", x: "#6e5e52", W: "#a8c4d8" }, 1);
tile("tile-street", "Street", (x, y, s) => (hash(x, y, s) < 0.1 ? "A" : "a"), { a: "#34343a", A: "#3e3e45" });
tile("tile-water", "Water", (x, y, s) => ((y + s) % 5 === 0 && (x + y * 2 + s) % 7 < 3 ? "B" : "b"), { b: "#2d5b8a", B: "#4f7fae" });
tile("tile-stairs", "Stairs", (x, y) => (x === 0 || x === 15 ? "k" : y % 4 === 3 ? "S" : "s"), { k: "#000000", s: "#b5a58f", S: "#7d6f5c" }, 1);
tile("tile-ladder", "Ladder", (x, y) => (x === 4 || x === 11 ? "l" : x > 4 && x < 11 && y % 4 === 1 ? "l" : "."), { l: "#c08a3e" }, 1);
tile("tile-manhole", "Manhole", (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  return d > 6.5 ? "." : d > 5.5 ? "k" : (x + y) % 3 === 0 ? "M" : "m";
}, { k: "#1d1d20", m: "#55555c", M: "#66666e" }, 1);

// ---------- themes: colours for the floor pattern and the walls around it ----------
const theme = (id, name, floor, f, g, F, walls = {}) =>
  save(id, { kind: "theme", name, floor, colors: { f, g, F, ...walls } });
theme("theme-clinic", "Clinic tile", "tile-floor-tile", "#d8dde0", "#b7c0c6", "#eef2f4", { v: "#c9cfd4", x: "#a3abb2", w: "#6d7a84", W: "#7c8992" });
theme("theme-lab", "Lab", "tile-floor-tile", "#c6d3dc", "#9fb2bf", "#e0e9ef", { v: "#b0bcc6", x: "#8a97a2", w: "#56636e", W: "#65727c" });
theme("theme-office", "Office linoleum", "tile-floor-tile", "#a7a28f", "#8d8875", "#bcb7a3", { v: "#8e8a7a", x: "#6f6b5d", w: "#4d4a42", W: "#5a574e" });
theme("theme-wood", "Wood floor", "tile-floor-plank", "#9c6b3f", "#7a512d", "#b07c4d", { v: "#a4795c", x: "#7e5a42" });
theme("theme-carpet", "Carpet", "tile-floor-carpet", "#7a2f3a", "#64242e", "#92404b", { v: "#b59a7a", x: "#8f775b" });
theme("theme-stone", "Stone", "tile-floor-stone", "#8f8a80", "#6d6960", "#a39e93", { v: "#8a857a", x: "#68645b", w: "#4b4842", W: "#57534c" });
theme("theme-concrete", "Concrete", "tile-floor-concrete", "#8a8a86", "#727270", "#9c9c98", { v: "#8a8a86", x: "#6a6a67" });
theme("theme-pavement", "Pavement", "tile-floor-stone", "#9a978f", "#7e7b74", "#aaa79f");
theme("theme-grass", "Grass", "tile-floor-grass", "#4f7a3a", "#3f6630", "#6a9450");
theme("theme-gravel", "Gravel", "tile-floor-carpet", "#7d766a", "#655f55", "#958e81");
theme("theme-sewer", "Sewer", "tile-floor-stone", "#4a4f48", "#383c37", "#5a6057", { v: "#4f5550", x: "#3a3f3b", w: "#2c302d", W: "#353a36" });
theme("theme-bridge", "Bridge deck", "tile-floor-plank", "#6d6a64", "#55524d", "#7d7a73");

// ---------- props: one frame per engine state ----------
const prop = (id, name, palette, states) =>
  save(id, { kind: "prop", name, palette, frames: Object.fromEntries(Object.entries(states).map(([k, fn]) => [k, [draw(fn)]])) });
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const edge = (x, y, x0, y0, x1, y1) => inRect(x, y, x0, y0, x1, y1) && (x === x0 || x === x1 || y === y0 || y === y1);

const doorClosed = (x, y) => edge(x, y, 2, 1, 13, 15) ? "k" : inRect(x, y, 3, 2, 12, 15) ? (x === 10 && y === 8 ? "h" : (x === 7 || y === 5) ? "D" : "d") : ".";
prop("prop-door", "Door", { k: "#000000", d: "#8a5a32", D: "#6e4626", h: "#e0c060", o: "#151518", l: "#f0d040", L: "#a08020", s: "#c9a27a" }, {
  closed: doorClosed,
  open: (x, y) => edge(x, y, 2, 1, 13, 15) && !(y === 15 && x > 2 && x < 13) ? "k" : inRect(x, y, 3, 2, 12, 15) ? (x <= 4 ? "D" : "o") : ".",
  locked: (x, y) => inRect(x, y, 9, 7, 11, 10) ? (edge(x, y, 9, 7, 11, 10) ? "L" : "l") : doorClosed(x, y),
  broken: (x, y) => { const c = doorClosed(x, y); return c !== "." && c !== "k" && inRect(x, y, 5, 4, 10, 11) && hash(x, y, 3) < 0.7 ? "o" : c === "d" && hash(x, y, 4) < 0.1 ? "s" : c; },
});
const bars = (x, y) => (y === 2 || y === 14) && x >= 1 && x <= 14 ? "r" : y > 2 && y < 14 && x >= 1 && x <= 14 && x % 3 === 1 ? "b" : ".";
prop("prop-gate", "Gate", { b: "#6f7780", r: "#4b525a", l: "#f0d040" }, {
  closed: bars,
  open: (x, y) => (y === 2 || y === 14) && x >= 1 && x <= 4 ? "r" : y > 2 && y < 14 && (x === 1 || x === 3) ? "b" : ".",
  locked: (x, y) => inRect(x, y, 7, 7, 9, 9) ? "l" : bars(x, y),
});
const chain = (x, y) => x === 0 || x === 15 ? "p" : y >= 1 && y <= 14 && ((x + y) % 4 === 0 || (x - y + 16) % 4 === 0) ? "c" : ".";
prop("prop-fence", "Chain-link fence", { c: "#a8b0b8", p: "#5d646b" }, {
  closed: chain,
  cut: (x, y) => inRect(x, y, 5, 4, 10, 13) ? "." : chain(x, y),
  open: (x, y) => (x === 0 || x === 15 ? "p" : "."),
});
const boards = (x, y) => (inRect(x, y, 0, 4, 15, 7) || inRect(x, y, 0, 9, 15, 12)) ? ((x + y) % 6 < 3 ? "r" : "W") : (x === 3 || x === 12) && y > 2 && y < 15 ? "k" : ".";
prop("prop-barricade", "Barricade", { r: "#c23b2e", W: "#eeeeee", k: "#2a2a2a" }, {
  closed: boards,
  open: (x, y) => inRect(x, y, 1, 12, 6, 14) || inRect(x, y, 9, 13, 14, 15) ? ((x + y) % 6 < 3 ? "r" : "W") : ".",
});
const grate = (x, y) => edge(x, y, 2, 2, 13, 13) ? "k" : inRect(x, y, 3, 3, 12, 12) && (x % 3 === 0 || y % 3 === 0) ? "g" : ".";
prop("prop-hatch", "Grate or hatch", { k: "#1d1d20", g: "#6d727a", o: "#0b0b0d" }, {
  closed: grate,
  open: (x, y) => edge(x, y, 2, 2, 13, 13) ? "k" : inRect(x, y, 3, 3, 12, 12) ? "o" : ".",
});
console.log("wrote", out);
