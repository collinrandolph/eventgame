// Urban landscape at real scale (8 px per metre; a 16 px character is about 1.9 m): parks, plazas, parking,
// transit, alleys. Also redraws the earlier pieces that were undersized (doors, lamps, trees, vehicles).
// Usage: node 4-landscape-scale.mjs <out dir>   (run after 3-architecture.mjs)
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
const ell = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

// ---------- ground materials ----------
sprite("tex-path", "Park path (fine gravel)", 16, 16, (x, y) => ((x * 7 + y * 13) % 17 === 0 ? "brown" : (x * 3 + y * 5) % 23 === 0 ? "cream" : "tan"), "texture");

// ---------- doors at 0.9-1.8 m x 2.1 m ----------
const door = (x, y, open, locked) => {
  if (x === 0 || x === 7 || y === 0) return "black";
  if (open) return x <= 1 ? "brown" : "grey4";
  if (locked && x === 5 && (y === 8 || y === 9)) return "yellow";
  return x === 5 && y === 9 ? "yellow" : y === 5 || y === 11 ? "brownDark" : "brown";
};
sprite("deco-door", "Door (0.9 m)", 8, 17, (x, y) => door(x, y, false, false));
sprite("deco-door-locked", "Door, locked", 8, 17, (x, y) => door(x, y, false, true));
sprite("deco-door-open", "Doorway", 8, 17, (x, y) => door(x, y, true, false));
sprite("deco-door-double", "Door: double glass (1.8 m)", 15, 17, (x, y) => (rim(x, y, 0, 0, 14, 16) && y !== 16 ? "black" : x === 7 ? "black" : y === 9 ? "grey1" : x - y > 0 && x - y < 3 ? "sky" : "blueDark"));
sprite("deco-door-arched", "Door: arched timber", 10, 18, (x, y) => {
  if (y < 5 && !ell(x, y, 5, 5, 5, 5)) return null;
  return (y < 5 && !ell(x, y, 5, 5, 4, 4)) || x === 0 || x === 9 ? "black" : x === 5 ? "brownDark" : x === 7 && y === 10 ? "yellow" : "brown";
});

// ---------- street furniture ----------
sprite("deco-lamp", "Street lamp (5.5 m)", 9, 44, (x, y) => {
  if (y < 4) return rim(x, y, 0, 0, 8, 3) ? "black" : "yellow";
  if (y === 43) return x >= 2 && x <= 6 ? "black" : null;
  return x === 4 ? "grey3" : x === 3 ? (y > 38 ? "grey3" : null) : null;
});
sprite("deco-tree", "Street tree (5.5 m, 4 m crown)", 32, 44, (x, y) => {
  if (y >= 28) return x >= 14 && x <= 17 ? (y === 43 ? "black" : x === 14 ? "brownDark" : "brown") : y === 43 && x >= 12 && x <= 19 ? "black" : null;
  if (!ell(x, y, 16, 15, 15.5, 14.5)) return null;
  if (!ell(x, y, 16, 15, 14.5, 13.5)) return "black";
  if (ell(x, y, 11, 9, 5, 4)) return "greenLight";
  return (x * 5 + y * 3) % 11 === 0 ? "greenDark" : y > 22 ? "greenDark" : "green";
});
sprite("deco-planter", "Planter box (1.5 m)", 12, 12, (x, y) => {
  if (y < 6) return ell(x, y, 6, 5, 6, 5) ? ((x + y) % 4 === 0 ? "greenLight" : (x * 3 + y) % 5 === 0 ? "red" : "green") : null;
  return rim(x, y, 0, 6, 11, 11) ? "black" : y === 7 ? "grey1" : "grey2";
});
sprite("deco-flowerbed", "Flower bed", 16, 8, (x, y) => (rim(x, y, 0, 2, 15, 7) ? "brownDark" : y < 2 ? null : (x * 5 + y * 3) % 7 === 0 ? "red" : (x * 3 + y) % 5 === 0 ? "yellow" : "green"));
sprite("deco-bench", "Bench (1.8 m)", 15, 9, (x, y) => (y === 0 || y === 4 ? "black" : y < 4 ? (y === 2 ? "brownDark" : "brown") : (x === 2 || x === 12) ? "black" : null));
sprite("deco-picnic", "Picnic table", 16, 12, (x, y) => (rim(x, y, 0, 3, 15, 7) ? "black" : box(x, y, 0, 3, 15, 7) ? "brown" : y > 7 && (x === 2 || x === 13) ? "brownDark" : y < 3 && y > 0 && x > 1 && x < 14 ? (y === 1 ? "black" : "brown") : null));
sprite("deco-fountain", "Fountain (5 m basin)", 40, 30, (x, y) => {
  if (ell(x, y, 20, 3.5, 2.5, 3.5)) return "white";
  if (box(x, y, 18, 4, 21, 14)) return x === 18 || x === 21 ? "black" : "grey1";
  if (!ell(x, y, 20, 19, 20, 11)) return null;
  if (!ell(x, y, 20, 19, 19, 10)) return "black";
  if (!ell(x, y, 20, 18, 16, 7.5)) return y > 22 ? "grey2" : "grey1";
  return (x + y * 2) % 9 === 0 ? "blueLight" : "blue";
});
sprite("deco-knoll", "Grass knoll", 56, 30, (x, y) => {
  if (!ell(x, y, 28, 18, 28, 12)) return null;
  if (!ell(x, y, 28, 18, 27, 11)) return y > 18 ? "greenDark" : "black";
  if (ell(x, y, 22, 13, 14, 5)) return "greenLight";
  return (x * 7 + y * 3) % 13 === 0 ? "greenDark" : "green";
});
sprite("deco-bus-shelter", "Bus shelter (4 m)", 34, 24, (x, y) => {
  if (y < 3) return rim(x, y, 0, 0, 33, 2) ? "black" : "grey2";
  if (x === 1 || x === 32) return y === 23 ? "black" : "grey3";
  if (y >= 4 && y <= 17 && x >= 3 && x <= 30) return x === 3 || x === 30 || y === 4 || y === 17 ? "grey3" : x - y > 6 && x - y < 9 ? "white" : "sky";
  if (y >= 18 && y <= 19 && x >= 6 && x <= 27) return y === 18 ? "brown" : "black";
  return null;
});
sprite("deco-bus-sign", "Bus stop sign", 9, 30, (x, y) => (y < 9 ? (rim(x, y, 0, 0, 8, 8) ? "black" : box(x, y, 2, 3, 6, 5) ? "white" : "blue") : x === 4 ? (y === 29 ? "black" : "grey3") : null));
const car = (body, dark) => (x, y) => {
  if (y > 14) return (x >= 5 && x <= 10) || (x >= 25 && x <= 30) ? (y === 17 ? null : "black") : null;
  if (y < 3) return null;
  if (y < 8) { if (x < 8 || x > 27) return null; return x === 8 || x === 27 || y === 3 ? "black" : x === 17 ? dark : "sky"; }
  return rim(x, y, 0, 7, 35, 14) ? "black" : y === 10 ? dark : x > 32 && y < 10 ? "yellow" : body;
};
sprite("deco-car-red", "Parked car (4.5 m), red", 36, 18, car("red", "redDark"));
sprite("deco-car-blue", "Parked car, blue", 36, 18, car("blue", "blueDark"));
sprite("deco-car-yellow", "Parked car, yellow", 36, 18, car("yellow", "brown"));
sprite("deco-police-car", "Patrol car (4.8 m)", 38, 20, (x, y) => {
  if (y < 2) return x >= 15 && x <= 22 ? (x < 19 ? "red" : "blue") : null;
  if (y > 16) return (x >= 5 && x <= 10) || (x >= 27 && x <= 32) ? (y === 19 ? null : "black") : null;
  if (y < 9) { if (x < 9 || x > 28) return y >= 2 ? null : null; return x === 9 || x === 28 || y === 2 ? "black" : x === 18 ? "black" : "sky"; }
  return rim(x, y, 0, 8, 37, 16) ? "black" : x < 9 || x > 28 ? "grey4" : "white";
});
sprite("deco-ambulance", "Ambulance (6 m)", 48, 26, (x, y) => {
  if (y < 3) return x >= 8 && x <= 15 ? (x < 12 ? "red" : "blueLight") : null;
  if (y > 22) return (x >= 6 && x <= 12) || (x >= 35 && x <= 41) ? (y === 25 ? null : "black") : null;
  if (rim(x, y, 0, 3, 47, 22)) return "black";
  if (x > 36 && y < 12) return "blueDark";
  return y === 14 || y === 15 ? "red" : box(x, y, 16, 6, 22, 12) ? (box(x, y, 18, 6, 20, 12) || box(x, y, 16, 8, 22, 10) ? "red" : "white") : "white";
});
sprite("deco-dumpster", "Dumpster (1.8 m) - climbable", 18, 14, (x, y) => {
  if (y < 3) return rim(x, y, 0, 0, 17, 2) ? "black" : "greenDark";
  if (y === 13) return x === 2 || x === 15 ? "black" : null;
  return rim(x, y, 0, 3, 17, 12) ? "black" : y === 4 && x > 2 && x < 15 ? "yellow" : x % 5 === 2 ? "greenDark" : "green";
});

// ---------- fire escapes (one storey, 3 m), drawn over a facade bay ----------
sprite("deco-fire-escape", "Fire escape (one storey)", 16, 24, (x, y) => {
  if (y >= 18 && y <= 19) return "black"; // landing
  if (y >= 15 && y <= 17) return x % 3 === 0 ? "grey4" : null; // railing
  const sx = Math.round(13 - (y / 15) * 11); // stair from the landing below up to the next
  if (y < 15 && (x === sx || x === sx + 1)) return "black";
  if (y < 15 && x === sx - 1 && y % 2 === 0) return "grey3";
  return null;
});
sprite("deco-fire-escape-ladder", "Fire escape drop ladder (raised)", 16, 24, (x, y) => {
  if (y >= 18 && y <= 19) return "black";
  if (y >= 15 && y <= 17) return x % 3 === 0 ? "grey4" : null;
  if ((x === 11 || x === 14) && y >= 4 && y <= 14) return "black";
  if (x > 11 && x < 14 && y % 3 === 1 && y >= 4 && y <= 14) return "yellow";
  return null;
});
console.log("wrote landscape and real-scale art to", out);
