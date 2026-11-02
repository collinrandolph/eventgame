import { describe as group, expect, it } from "vitest";
import { addedProblems, missingPixels } from "../src/sprites/check.js";
import { type SpriteDoc, composeWalk, loadSprites, recipeParts } from "../src/sprites/compose.js";

const pal = { k: "#000000", a: "#ffcc80", h: "#6d4c41" };

group("missing-pixel check", () => {
  it("passes an outlined shape", () => {
    expect(missingPixels(["kkk", "kak", "kkk"], pal)).toEqual([]);
  });

  it("finds a hole inside the sprite", () => {
    expect(missingPixels(["kkk", "k.k", "kkk"], pal)).toEqual([{ kind: "gap", x: 1, y: 1 }]);
  });

  it("finds a coloured pixel touching the outside with no outline", () => {
    expect(missingPixels(["kkk", "kak", "kak"], pal)).toEqual([{ kind: "no outline", x: 1, y: 2 }]);
  });

  it("only reports what the layers add to the bare base, and names the layer", () => {
    const bare = ["kkk.", "kak.", "kak."];                  // the base's own open edge at (1,2) is on purpose
    const built = ["kkkh", "kak.", "kak."];                 // a layer pixel with no outline at (3,0)
    const painter = [["", "", "", "layer-hair"], ["", "", "", ""], ["", "", "", ""]];
    expect(addedProblems(built, pal, painter, bare, pal)).toEqual([{ kind: "no outline", x: 3, y: 0, layer: "layer-hair" }]);
  });
});

group("recipe assembly", () => {
  const base: SpriteDoc = { name: "base", w: 3, h: 3, palette: pal, frames: { S: ["kkk/kak/kkk"] } };
  const hat = { id: "hat", kind: "layer" as const, name: "hat", w: 3, h: 3, palette: { h: "#ff0000" }, frames: { S: ["hhh/.../..."] } };

  it("colours body parts and paints layers over the part they were drawn on", () => {
    const r: SpriteDoc = { kind: "recipe", name: "r", w: 3, h: 3, palette: {}, frames: {}, colors: { a: "#123456" } };
    const f = composeWalk(r, base, [hat]);
    const rows = f.frames.S![0].map((row) => [...row].map((c) => f.palette[c]));
    expect(rows[0]).toEqual(["#ff0000", "#ff0000", "#ff0000"]);
    expect(rows[1][1]).toBe("#123456");
    expect(f.painter.S![0][0]).toEqual(["hat", "hat", "hat"]);
  });

  it("stacks layers back to front whatever order the recipe lists them in", () => {
    const collar = { id: "collar", kind: "layer" as const, name: "collar", w: 3, h: 3, palette: { c: "#ffffff" }, frames: { S: ["ccc/.../..."] }, stack: "shirt" as const };
    const hair = { ...hat, id: "hair", stack: "hair" as const };
    const r: SpriteDoc = { kind: "recipe", name: "r", w: 3, h: 3, palette: {}, frames: {} };
    const f = composeWalk(r, base, [hair, collar]);
    expect(f.palette[f.frames.S![0][0][0]]).toBe("#ff0000");
    expect(f.painter.S![0][0]).toEqual(["hair", "hair", "hair"]);
  });

  it("recolours a layer per recipe with tints", () => {
    const r: SpriteDoc = { kind: "recipe", name: "r", w: 3, h: 3, palette: {}, frames: {}, tints: { hat: { h: "#00ff00" } } };
    const f = composeWalk(r, base, [hat]);
    expect(f.palette[f.frames.S![0][0][0]]).toBe("#00ff00");
  });
});

group("sprite data", () => {
  const all = loadSprites("sprites/data");

  it("every recipe's base and layers exist", () => {
    for (const doc of all.values()) if (doc.kind === "recipe") expect(() => recipeParts(all, doc)).not.toThrow();
  });

  it("every pixel key is in its sprite's palette", () => {
    for (const [id, doc] of all) {
      if (doc.kind === "recipe") continue;
      const keys = new Set(Object.keys(doc.palette));
      const drawings = [doc.frames, doc.attack?.frames, doc.hurt?.frames, doc.death?.frames].flatMap((f) => Object.values(f ?? {}).flat());
      const unknown = new Set(drawings.flatMap((s) => [...(s ?? "")].filter((c) => c !== "." && c !== "/" && !keys.has(c))));
      expect([...unknown], id).toEqual([]);
    }
  });
});
