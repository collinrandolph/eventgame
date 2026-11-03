// Tile importer.
//
//   npm run import-tiles -- sprites/import/<pack>.json            cut the manifest's pieces into sprites/env/imported/<pack>/
//   npm run import-tiles -- sprites/import/<pack>.json --sheet    write a numbered contact sheet next to the source image
//
// The contact sheet is the source sheet at 3x with grid lines and column/row numbers along the edges, for picking
// pieces by cell when writing a manifest.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type ImportManifest, importPack } from "../sprites/importer.js";
import { encodePng } from "../sprites/png.js";
import { decodePng } from "../sprites/pngread.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) throw new Error("usage: import-tiles <manifest.json> [--sheet]");
const m = JSON.parse(readFileSync(file, "utf8")) as ImportManifest;

if (args.includes("--sheet")) {
  const img = decodePng(readFileSync(m.source));
  const S = 3, M = 18, { tile, spacing = 0, margin = 0 } = m.grid, step = tile + spacing;
  const W = img.width * S + M, H = img.height * S + M, px = new Uint8Array(W * H * 4);
  const put = (x: number, y: number, r: number, g: number, b: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 40, 40, 48);
  for (let y = 0; y < img.height * S; y++) for (let x = 0; x < img.width * S; x++) {
    const o = (Math.floor(y / S) * img.width + Math.floor(x / S)) * 4, a = img.pixels[o + 3];
    // transparent pixels show as a checker so pieces stand out
    const chk = ((x >> 3) + (y >> 3)) % 2 ? 70 : 90;
    put(x + M, y + M, a ? img.pixels[o] : chk, a ? img.pixels[o + 1] : chk, a ? img.pixels[o + 2] : chk);
  }
  // grid lines
  for (let c = 0; margin + c * step <= img.width; c++) for (let y = 0; y < img.height * S; y++) put(M + (margin + c * step) * S - 1, y + M, 255, 255, 0);
  for (let r = 0; margin + r * step <= img.height; r++) for (let x = 0; x < img.width * S; x++) put(x + M, M + (margin + r * step) * S - 1, 255, 255, 0);
  // column and row numbers in a 3x5 digit font
  const DIG = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];
  const num = (n: number, x0: number, y0: number) => [...String(n)].forEach((d, i) => {
    for (let k = 0; k < 15; k++) if (DIG[+d][k] === "1") for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(x0 + i * 8 + (k % 3) * 2 + a, y0 + Math.floor(k / 3) * 2 + b, 255, 255, 255);
  });
  for (let c = 0; margin + c * step < img.width; c++) num(c, M + (margin + c * step) * S + 2, 3);
  for (let r = 0; margin + r * step < img.height; r++) num(r, 1, M + (margin + r * step) * S + 3);
  const out = join(dirname(m.source), `${m.pack}-contact.png`);
  writeFileSync(out, encodePng(W, H, px));
  console.log(`contact sheet: ${out} (${Math.floor(img.width / step)} x ${Math.floor(img.height / step)} cells of ${tile} px)`);
} else {
  const ids = importPack(file);
  console.log(`${m.pack}: imported ${ids.length} pieces into sprites/env/imported/${m.pack}/ (${m.licence}${m.redistributable ? "" : "; NOT redistributable: keep it out of public repos"})`);
}
