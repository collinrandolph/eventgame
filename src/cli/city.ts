// City generator.
//
//   npm run city -- cities/<id>.json [--seed=N]
//       writes worlds/<id>.json (the grid world) and sprites/env/worlds/<id>.json (how to dress it),
//       then `npm run env -- worlds/<id>.json --walk` draws it and makes it walkable.

import { readFileSync, writeFileSync } from "node:fs";
import { type CityBrief, generateCity } from "../city/generate.js";
import { loadWorld } from "../world.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "cities/millbrook.json";
const brief = JSON.parse(readFileSync(file, "utf8")) as CityBrief;
const seed = args.find((a) => a.startsWith("--seed="));
if (seed) brief.seed = Number(seed.slice(7));

const { world, env } = generateCity(brief);
const worldFile = `worlds/${brief.id}.json`;
writeFileSync(worldFile, JSON.stringify(world) + "\n");
writeFileSync(`sprites/env/worlds/${brief.id}.json`, JSON.stringify(env, null, 1) + "\n");

// it has to compile like any hand-made world
const w = loadWorld(worldFile);
const sp = w.spatial!;
console.log(`${brief.name}: ${brief.w}x${brief.h} cells (${brief.w * 2} x ${brief.h * 2} m), seed ${brief.seed}`);
console.log(`  ${sp.zones.length} zones (${sp.zones.filter((z) => !z.folded).length} solver locations), ${sp.links.length} links`);
console.log(`  ${world.grid.zones.length} of ${brief.landmarks.length} landmarks placed: ${world.grid.zones.map((z) => z.name).join(", ")}`);
for (const warn of sp.warnings) console.log(`  WARN ${warn}`);
console.log(`wrote ${worldFile} and sprites/env/worlds/${brief.id}.json`);
