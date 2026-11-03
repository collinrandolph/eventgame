// Environment builder: every cell, prop and person on Ash River's map points at art that exists.
import { readFileSync } from "node:fs";
import { describe as group, expect, it } from "vitest";
import { barrierState, buildLayer, loadArt, loadEnvConfig, renderLayer } from "../src/env/build.js";
import type { GridWorldFile } from "../src/grid.js";
import { initialState, loadWorld } from "../src/world.js";

const file = "worlds/ash-river.json";
const raw = JSON.parse(readFileSync(file, "utf8")) as GridWorldFile;
const w = loadWorld(file);
const art = loadArt();
const cfg = loadEnvConfig(raw.id);

group("environment builder (Ash River)", () => {
  for (const z of Object.keys(raw.grid.layers).map(Number)) {
    it(`layer ${z}: every tile, theme, prop state and character exists`, () => {
      const m = buildLayer(w, raw, cfg, art, z);
      expect(m.h).toBe(raw.grid.layers[String(z)].length);
      for (const row of [...m.ground, ...m.overlay]) for (const l of row) {
        if (!l) continue;
        expect(art.tiles.get(l[0])?.kind, l[0]).toBe("tile");
        if (l[1]) expect(art.tiles.get(l[1])?.kind, l[1]).toBe("theme");
      }
      for (const p of m.props) expect(art.tiles.get(p.prop)?.frames[p.state], `${p.prop}:${p.state}`).toBeDefined();
      for (const p of m.people) expect(art.chars.has(p.sprite), p.sprite).toBe(true);
      for (const view of ["exterior", "interior"] as const) {
        const img = renderLayer(m, art, view);
        expect(img.pixels.length).toBe(m.w * 16 * m.h * 16 * 4);
      }
      for (const l of m.lots) for (const t of [l.roof, l.wall, ...(l.back ? [l.back] : [])]) expect(art.tiles.get(t)?.kind, t).toBe("texture");
    });
  }

  it("indoor zones are inside buildings (roofed); streets and open areas aren't", () => {
    const m = buildLayer(w, raw, cfg, art, 0);
    const zonesIn = new Set(m.buildings.flatMap((b) => b.zones));
    for (const z of ["school", "hospital", "police", "evidence", "lab", "church", "hotel", "library"]) expect(zonesIn.has(z), z).toBe(true);
    for (const z of ["plaza", "checkpoint", "hill", "yard"]) expect(zonesIn.has(z), z).toBe(false);
    // every street cell is road or sidewalk, and the roads carry centre lines and crosswalks
    expect(m.lines.length).toBeGreaterThan(50);
    expect(m.crosswalks.length).toBeGreaterThan(10);
  });

  it("8-bit rule: textures use at most 4 colours, all environment art from the master palette", () => {
    const master = new Set(Object.values((art.tiles.get("palette-street") as unknown as { master: Record<string, string> }).master));
    for (const [id, doc] of art.tiles) {
      if ((doc as { source?: string }).source) continue; // imported packs keep their own palette
      const kind = doc.kind as string | undefined;
      if (kind === "texture") expect(Object.keys(doc.palette).length, id).toBeLessThanOrEqual(4);
      const colours = kind === "theme" ? Object.values(doc.colors ?? {}) : kind === "palette" ? [] : Object.values(doc.palette ?? {});
      for (const c of colours) expect(master.has(c), `${id}: ${c}`).toBe(true);
    }
  });

  it("every zone has a theme and every playable character a sprite", () => {
    for (const zone of raw.grid.zones) expect(cfg.zones[zone.id], zone.id).toBeDefined();
    for (const p of raw.people) expect(cfg.people?.[p.id], p.id).toBeDefined();
  });

  it("barriers start in their world state and follow it", () => {
    const m = buildLayer(w, raw, cfg, art, 0);
    const state = (id: string) => m.props.find((p) => p.barrier === id)?.state;
    expect(state("evidence_door")).toBe("locked");
    expect(state("yard_fence")).toBe("closed");
    expect(state("barricade")).toBe("closed");
    const s = initialState(w, "timed");
    s.things.yard_fence.props.blocks = "none";
    s.things.evidence_door.props.locked = false;
    const later = buildLayer(w, raw, cfg, art, 0, s);
    expect(later.props.find((p) => p.barrier === "yard_fence")?.state).toBe("cut");
    expect(later.props.find((p) => p.barrier === "evidence_door")?.state).toBe("closed");
    expect(barrierState("prop-barricade", { blocks: "none" })).toBe("open");
  });
});
