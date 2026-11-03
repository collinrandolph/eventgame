// Tile importer: third-party sheets into palette-key sprites, and skins that swap them in.
import { readFileSync } from "node:fs";
import { describe as group, expect, it } from "vitest";
import { loadArt } from "../src/env/build.js";
import { type ImportManifest, cutPiece, pieceRect } from "../src/sprites/importer.js";
import { decodePng } from "../src/sprites/pngread.js";

const manifest = JSON.parse(readFileSync("sprites/import/kenney.json", "utf8")) as ImportManifest;
const sheet = decodePng(readFileSync(manifest.source));

group("tile importer (Kenney RPG Urban Pack, CC0)", () => {
  it("reads the indexed-colour sheet: 27 x 18 tiles of 16 px", () => {
    expect([sheet.width, sheet.height]).toEqual([432, 288]);
  });

  it("cuts cells, blocks and trims to the visible pixels, recording source and licence", () => {
    expect(pieceRect(manifest, { id: "a", kind: "texture", cell: [9, 16] })).toEqual([144, 256, 16, 16]);
    expect(pieceRect(manifest, { id: "b", kind: "deco", cells: [1, 6, 1, 7] })).toEqual([16, 96, 16, 32]);
    for (const p of manifest.pieces) {
      const doc = cutPiece(sheet, manifest, p);
      expect(doc.source).toBe("kenney");
      expect(doc.licence).toMatch(/CC0/);
      expect(doc.frames[0][0], p.id).toMatch(/[^./]/); // not empty
      if (p.kind === "texture") expect([doc.w, doc.h], p.id).toEqual([16, 16]);
      const [, , w, h] = pieceRect(manifest, p);
      if (p.trim) expect(doc.w <= w && doc.h <= h, p.id).toBe(true);
    }
    const lamp = cutPiece(sheet, manifest, manifest.pieces.find((p) => p.id === "lamp")!);
    expect(lamp.w).toBeLessThan(16); // trimmed to the post
  });

  it("can snap a piece to our master palette", () => {
    const master = Object.values(JSON.parse(readFileSync("sprites/env/data/palette-street.json", "utf8")).master as Record<string, string>);
    const doc = cutPiece(sheet, manifest, { id: "brick", kind: "texture", cell: [18, 2] }, master);
    for (const c of Object.values(doc.palette)) expect(master).toContain(c);
  });

  it("a skin swaps imported pieces in for ours", () => {
    const plain = loadArt(), skinned = loadArt(undefined, undefined, undefined, "kenney");
    expect((plain.tiles.get("tex-asphalt") as { source?: string }).source).toBeUndefined();
    expect((skinned.tiles.get("tex-asphalt") as { source?: string }).source).toBe("kenney");
    expect(skinned.tiles.get("deco-lamp")?.name).toMatch(/kenney/);
  });
});
