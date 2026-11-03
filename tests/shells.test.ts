// Building shells: every card plans at every seed, every room has floor and can be walked to from the entrance,
// and a block of them compiles and draws.
import { describe as group, expect, it } from "vitest";
import { generateBlock } from "../src/city/block.js";
import { loadShells, planShell } from "../src/city/shells.js";
import { buildLayer, loadArt, renderLayer } from "../src/env/build.js";
import { loadWorld } from "../src/world.js";
import { writeFileSync } from "node:fs";

const cards = loadShells();
const seeded = (seed: number) => { let a = seed; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; };

group("building shells", () => {
  it("every card plans at 200 seeds, with every room reachable from the entrance", () => {
    for (const [id, card] of Object.entries(cards)) for (let seed = 1; seed <= 200; seed++) {
      const p = planShell(card, seeded(seed));
      // walk from the entrance through rooms and doors
      const ey = p.cells.map((row) => row[p.entrance[0]]).lastIndexOf("+"), seen = new Set<string>(), stack: [number, number][] = [[p.entrance[0], ey]];
      while (stack.length) {
        const [x, y] = stack.pop()!, c = p.cells[y]?.[x];
        if (c === undefined || c === "#" || c === "." || seen.has(`${x},${y}`)) continue;
        seen.add(`${x},${y}`);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      const reached = new Set([...seen].map((k) => { const [x, y] = k.split(",").map(Number); return p.cells[y][x]; }));
      for (const r of p.rooms) expect(reached.has(r.id), `${id} seed ${seed}: ${r.name}`).toBe(true);
    }
  });

  it("a block of the five compiles as a world and draws, cut corners and all", () => {
    const { world, env } = generateBlock({ id: "shell-block-test", name: "Shell Block Test", seed: 3, shells: Object.keys(cards) }, cards);
    writeFileSync("worlds/shell-block-test.json", JSON.stringify(world)); // git-ignored; worlds load from worlds/
    const w = loadWorld("worlds/shell-block-test.json");
    expect(w.spatial!.zones.length).toBeGreaterThan(30);
    const art = loadArt(), m = buildLayer(w, world, env, art, 0);
    expect(m.buildings.filter((b) => b.roofed).length).toBe(5);
    for (const view of ["exterior", "interior"] as const) expect(renderLayer(m, art, view).pixels.length).toBe(m.w * 16 * m.h * 16 * 4);
  });
});
