// Tile importer: cut pieces out of a third-party sheet into the sprite editor's palette-key format.
//
// A manifest (sprites/import/<pack>.json) names the sheet, its grid, which colours mean "empty", and the pieces:
//
//   { "id": "asphalt", "kind": "texture", "cell": [col, row] }          one grid cell
//   { "id": "door", "kind": "deco", "cells": [c0, r0, c1, r1] }          a block of cells (inclusive)
//   { "id": "sign", "kind": "deco", "px": [x, y, w, h] }                  a pixel rectangle (free-form sheets)
//
// Each piece becomes <pack>-<id>.json with its source and licence recorded, ready for the builder (as a texture,
// deco or tile) and for skins that swap it in for one of ours. palette "snap" maps every colour to the nearest one
// in our master palette; "keep" leaves the pack's own colours.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Image, decodePng } from "./pngread.js";

/** `trim`: crop to the visible pixels (for sprites that sit loosely in their cells). */
export interface Piece { id: string; kind: "texture" | "deco" | "tile" | "prop"; name?: string; cell?: [number, number]; cells?: [number, number, number, number]; px?: [number, number, number, number]; trim?: boolean }
export interface ImportManifest {
  pack: string;
  source: string;
  licence: string;
  /** False when the pack's licence forbids redistributing the asset (keep its output out of a public repo). */
  redistributable: boolean;
  grid: { tile: number; spacing?: number; margin?: number };
  /** Colours that mean "empty" (a colour-key background), as #rrggbb. */
  transparent?: string[];
  palette?: "keep" | "snap";
  pieces: Piece[];
}

const KEYS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** The pixel rectangle a piece covers on the sheet. */
export function pieceRect(m: ImportManifest, p: Piece): [number, number, number, number] {
  if (p.px) return p.px;
  const { tile, spacing = 0, margin = 0 } = m.grid, step = tile + spacing;
  const [c0, r0, c1, r1] = p.cells ?? [p.cell![0], p.cell![1], p.cell![0], p.cell![1]];
  return [margin + c0 * step, margin + r0 * step, (c1 - c0 + 1) * tile + (c1 - c0) * spacing, (r1 - r0 + 1) * tile + (r1 - r0) * spacing];
}

/** Cut one piece into a palette-key sprite document. */
export function cutPiece(img: Image, m: ImportManifest, p: Piece, master?: string[]) {
  const [x0, y0, w, h] = pieceRect(m, p);
  if (x0 < 0 || y0 < 0 || x0 + w > img.width || y0 + h > img.height) throw new Error(`${m.pack}/${p.id}: outside the sheet`);
  const empty = new Set((m.transparent ?? []).map((c) => c.toLowerCase()));
  const masterRgb = master?.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  const snap = (r: number, g: number, b: number) => {
    if (!masterRgb) return hex(r, g, b);
    let best = 0, d = Infinity;
    masterRgb.forEach(([R, G, B], i) => { const e = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (e < d) { d = e; best = i; } });
    return master![best];
  };
  const palette: Record<string, string> = {}, keyOf: Record<string, string> = {};
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const o = ((y0 + y) * img.width + x0 + x) * 4, [r, g, b, a] = img.pixels.subarray(o, o + 4);
      const c = hex(r, g, b);
      if (a < 128 || empty.has(c)) { row += "."; continue; }
      const col = snap(r, g, b);
      if (!keyOf[col]) {
        const k = KEYS[Object.keys(palette).length];
        if (!k) throw new Error(`${m.pack}/${p.id}: more than ${KEYS.length} colours`);
        keyOf[col] = k; palette[k] = col;
      }
      row += keyOf[col];
    }
    rows.push(row);
  }
  let out = rows, W = w;
  if (p.trim) {
    const used = (r: string) => /[^.]/.test(r);
    const top = rows.findIndex(used), bottom = rows.length - 1 - [...rows].reverse().findIndex(used);
    if (top < 0) throw new Error(`${m.pack}/${p.id}: the piece is empty`);
    const left = Math.min(...rows.filter(used).map((r) => r.search(/[^.]/)));
    const right = Math.max(...rows.filter(used).map((r) => r.length - 1 - [...r].reverse().findIndex((c) => c !== ".")));
    out = rows.slice(top, bottom + 1).map((r) => r.slice(left, right + 1));
    W = right - left + 1;
  }
  return { kind: p.kind, name: p.name ?? `${m.pack}: ${p.id}`, w: W, h: out.length, palette, frames: { 0: [out.join("/")] }, source: m.pack, licence: m.licence };
}

/** Import every piece of a manifest into outDir/<pack>/. Returns the ids written. */
export function importPack(manifestFile: string, outDir = "sprites/env/imported"): string[] {
  const m = JSON.parse(readFileSync(manifestFile, "utf8")) as ImportManifest;
  const img = decodePng(readFileSync(m.source));
  const master = m.palette === "snap"
    ? Object.values(JSON.parse(readFileSync("sprites/env/data/palette-street.json", "utf8")).master as Record<string, string>) : undefined;
  const dir = join(outDir, m.pack);
  mkdirSync(dir, { recursive: true });
  const ids: string[] = [];
  for (const p of m.pieces) {
    const id = `${m.pack}-${p.id}`;
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(cutPiece(img, m, p, master)) + "\n");
    ids.push(id);
  }
  return ids;
}
