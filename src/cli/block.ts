// One block of building shells.
//
//   npm run block -- [--seed=N] [--shells=storefront,hall,dwelling,block,ward]
//       writes worlds/shell-block.json and sprites/env/worlds/shell-block.json,
//       then `npm run env -- worlds/shell-block.json --walk` draws it and makes it walkable.

import { writeFileSync } from "node:fs";
import { generateBlock } from "../city/block.js";
import { loadShells } from "../city/shells.js";
import { loadWorld } from "../world.js";

const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const brief = {
  id: "shell-block",
  name: "Shell Block",
  seed: Number(opt("seed") ?? 1),
  shells: (opt("shells") ?? "storefront,hall,dwelling,block,ward").split(","),
};

const { world, env, placed, size } = generateBlock(brief, loadShells());
const worldFile = `worlds/${brief.id}.json`;
writeFileSync(worldFile, JSON.stringify(world) + "\n");
writeFileSync(`sprites/env/worlds/${brief.id}.json`, JSON.stringify(env, null, 1) + "\n");

// it has to compile like any hand-made world
const w = loadWorld(worldFile);
const sp = w.spatial!;
console.log(`${brief.name}: ${size[0]}x${size[1]} cells (${size[0] * 2} x ${size[1] * 2} m), seed ${brief.seed}`);
for (const p of placed) console.log(`  ${p.name.padEnd(11)} ${(p.rect[2] - p.rect[0] + 1) * 2} x ${(p.rect[3] - p.rect[1] + 1) * 2} m overall, ${p.rooms} rooms`);
console.log(`  ${sp.zones.length} zones, ${sp.links.length} links`);
for (const warn of sp.warnings) console.log(`  WARN ${warn}`);
console.log(`wrote ${worldFile} and sprites/env/worlds/${brief.id}.json`);
