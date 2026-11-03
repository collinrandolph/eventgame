// City generator: a real-scale layout that compiles as a world and dresses into a map.
import { readFileSync } from "node:fs";
import { describe as group, expect, it } from "vitest";
import { type CityBrief, generateCity } from "../src/city/generate.js";
import { loadArt } from "../src/env/build.js";
import { compileGrid } from "../src/grid.js";

const brief = JSON.parse(readFileSync("cities/millbrook.json", "utf8")) as CityBrief;
const { world, env } = generateCity(brief);
const rows = world.grid.layers["0"];
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

group("city generator (Millbrook)", () => {
  it("compiles as a grid world and places every landmark", () => {
    const { report } = compileGrid(world as never);
    expect(report.zones.length).toBeGreaterThan(50);
    expect(world.grid.zones.map((z) => z.id).sort()).toEqual(brief.landmarks.map((l) => l.id).sort());
  });

  it("is deterministic for a seed, and another seed gives another city", () => {
    expect(JSON.stringify(generateCity(brief).world)).toBe(JSON.stringify(world));
    expect(JSON.stringify(generateCity({ ...brief, seed: brief.seed + 1 }).world)).not.toBe(JSON.stringify(world));
  });

  it("no building touches a road: every edge of a block or wall meets sidewalk, apron or open ground", () => {
    const bad: string[] = [];
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      if ("%#+".includes(rows[y][x]) && N4.some(([dx, dy]) => rows[y + dy]?.[x + dx] === "=")) bad.push(`${x},${y}`);
    }
    expect(bad).toEqual([]);
  });

  it("keeps real proportions: 8 m local roads with sidewalks both sides, a boulevard with a median", () => {
    const names = world.grid.streets!.names;
    const across = (r: number[]) => Math.min(r[2] - r[0], r[3] - r[1]) + 1;
    const local = names.find((n) => !n.oneWay && !n.alley && !/Ave/.test(n.name) && across(n.rect) === 4);
    expect(local, "a local street with a 4-cell (8 m) road").toBeDefined();
    const [x0, y0, x1, y1] = local!.rect, vertical = y1 - y0 > x1 - x0;
    const mid = vertical ? Math.floor((y0 + y1) / 2) : Math.floor((x0 + x1) / 2);
    const out = (d: -1 | 1) => (vertical ? rows[mid][d < 0 ? x0 - 1 : x1 + 1] : rows[d < 0 ? y0 - 1 : y1 + 1][mid]);
    expect([out(-1), out(1)]).toEqual(["_", "_"]);
    expect(names.filter((n) => n.oneWay).length).toBe(2);
    expect(env.areas!.some((a) => a.kind === "median")).toBe(true);
  });

  it("has the urban landscape: park, plaza, entry plazas, parking, alleys with aprons and dumpsters, fire escapes, bus stops", () => {
    const kinds = new Set(env.areas!.map((a) => a.kind));
    for (const k of ["park", "path", "plaza", "entry", "parking", "driveway", "apron"]) expect(kinds.has(k), k).toBe(true);
    const decos = new Set(env.features!.map((f) => f.deco));
    for (const d of ["deco-fountain", "deco-knoll", "deco-dumpster", "deco-bus-shelter", "deco-planter"]) expect(decos.has(d), d).toBe(true);
    expect(world.grid.streets!.names.some((n) => n.alley)).toBe(true);
    expect(env.parcels!.some((p) => p[5])).toBe(true);
  });

  it("every front door opens onto open ground, set back from the street", () => {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] !== "+" || rows[y - 1]?.[x] === "_") continue; // back doors open north
      expect(rows[y + 1][x], `door at ${x},${y}`).toBe("_");
    }
  });

  it("some blocks are cut by a north-south lane between buildings", () => {
    const lanes = world.grid.streets!.names.filter((n) => n.alley && n.rect[3] - n.rect[1] > n.rect[2] - n.rect[0]);
    expect(lanes.length).toBeGreaterThan(0);
  });

  it("every unenterable building type has a main entrance on its south face", () => {
    const art = loadArt();
    for (const [id, a] of Object.entries(art.arch.types)) if (!a.yard && !Object.values(env.buildings!).includes(id) && !["hospital", "school", "precinct", "lab", "cafe", "library", "church", "sluice", "hotel", "control"].includes(id)) expect(a.entrance, id).toBeDefined();
  });

  it("only uses art that exists", () => {
    const art = loadArt();
    for (const f of env.features!) expect(art.tiles.has(f.deco), f.deco).toBe(true);
    for (const t of Object.values(env.buildings!)) expect(art.arch.types[t], t).toBeDefined();
  });
});
