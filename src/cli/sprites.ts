// Character sprites.
//
//   npm run sprites           write sprites/sheets/: one PNG per character or recipe and animation, plus index.json
//   npm run check:sprites     missing-pixel check on every recipe (exit 1 if anything turns up)
//
// The data in sprites/data/ comes from the sprite editor, one JSON file per character, layer or recipe.
// Options: --data=<dir> (default sprites/data), --all (check: list every recipe, not just the first few)

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type FrameReport, checkFrames } from "../sprites/check.js";
import {
  ANIMS, ANIM_FPS, type Anim, DIRS, FALLBACK, type Frames, type SpriteDoc, WALK_FPS,
  composeAnim, composeWalk, drawnAnim, drawnWalk, loadSprites, recipeParts,
} from "../sprites/compose.js";
import { encodePng, hexRgb } from "../sprites/png.js";

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith("--")) ?? "export";
const dataDir = args.find((a) => a.startsWith("--data="))?.slice(7) ?? "sprites/data";
const all = loadSprites(dataDir);

/** Every sprite that has frames to show: hand-drawn characters (bases included) and recipes, in their animations. */
function built(doc: SpriteDoc): { anim: string; frames: Frames }[] {
  if (doc.kind === "recipe") {
    const { base, layers } = recipeParts(all, doc);
    const out = [{ anim: "walk", frames: composeWalk(doc, base, layers) }];
    for (const k of ANIMS) { const f = composeAnim(doc, base, layers, k); if (f) out.push({ anim: k, frames: f }); }
    return out;
  }
  const out = [{ anim: "walk", frames: drawnWalk(doc) }];
  for (const k of ANIMS) { const f = drawnAnim(doc, k); if (f) out.push({ anim: k, frames: f }); }
  return out;
}

function sheet(f: Frames): { png: Buffer; dirs: string[]; count: number } {
  const dirs = DIRS.filter((d) => f.frames[d]);
  const count = Math.max(...dirs.map((d) => f.frames[d]!.length));
  const W = f.w * count, H = f.h * dirs.length, px = new Uint8Array(W * H * 4);
  dirs.forEach((d, r) => f.frames[d]!.forEach((rows, c) => rows.forEach((row, y) => [...row].forEach((k, x) => {
    if (k === ".") return;
    const [R, G, B] = hexRgb(f.palette[k] ?? ""), i = ((r * f.h + y) * W + c * f.w + x) * 4;
    px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = 255;
  }))));
  return { png: encodePng(W, H, px), dirs, count };
}

if (cmd === "export") {
  const out = "sprites/sheets";
  rmSync(out, { recursive: true, force: true });
  const index: Record<string, unknown> = {};
  let files = 0;
  for (const [id, doc] of all) {
    if (doc.kind === "layer") continue;
    mkdirSync(join(out, id), { recursive: true });
    const anims: Record<string, unknown> = {};
    for (const { anim, frames } of built(doc)) {
      const s = sheet(frames);
      writeFileSync(join(out, id, `${anim}.png`), s.png);
      files++;
      anims[anim] = {
        file: `${id}/${anim}.png`,
        frame: { w: frames.w, h: frames.h },
        // where the walk frame's top-left sits in this animation's frame, so the feet line up
        walkAt: { x: frames.ox, y: frames.oy },
        rows: s.dirs,
        frames: s.count,
        fps: anim === "walk" ? WALK_FPS : ANIM_FPS[anim as Anim],
        ...(anim === "walk" ? { idle: 0, loop: [1, 2, 3, 4, 5, 6] } : {}),
        ...(FALLBACK[anim as Anim] ? { fallback: FALLBACK[anim as Anim] } : {}),
      };
    }
    index[id] = {
      name: doc.name,
      kind: doc.kind === "recipe" ? "recipe" : id.startsWith("base-") ? "base" : "character",
      ...(doc.group ? { group: doc.group } : {}),
      ...(doc.needs?.length ? { needs: doc.needs } : {}),
      animations: anims,
    };
  }
  writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(`${files} sheets for ${Object.keys(index).length} sprites in ${out}/ (index.json lists them)`);
} else if (cmd === "check") {
  const reports: FrameReport[] = [];
  for (const doc of all.values()) {
    if (doc.kind !== "recipe") continue;
    const { base, layers } = recipeParts(all, doc);
    const bare = { ...doc, layers: [], tints: {} };
    reports.push(...checkFrames(doc.name, "walk", composeWalk(doc, base, layers), composeWalk(bare, base, [])));
    for (const k of ANIMS) {
      const a = composeAnim(doc, base, layers, k), b = composeAnim(bare, base, [], k);
      if (a && b) reports.push(...checkFrames(doc.name, k, a, b));
    }
  }
  // one line per layer and frame, with every recipe it happens in
  const byCause = new Map<string, { gap: number; outline: number; sprites: Set<string> }>();
  for (const r of reports) for (const p of r.problems) {
    const key = `${p.layer.padEnd(28)} ${r.anim} ${r.dir} ${r.frame}`;
    const e = byCause.get(key) ?? { gap: 0, outline: 0, sprites: new Set<string>() };
    if (p.kind === "gap") e.gap++; else e.outline++;
    e.sprites.add(r.sprite);
    byCause.set(key, e);
  }
  const full = args.includes("--all");
  const lines = [...byCause].sort((a, b) => a[0].localeCompare(b[0])).map(([k, e]) => {
    const what = [e.gap ? `${e.gap} gap` : "", e.outline ? `${e.outline} no outline` : ""].filter(Boolean).join(", ");
    const names = [...e.sprites];
    return `${k.padEnd(48)} ${what.padEnd(26)} ${names.length} recipe(s): ${(full ? names : names.slice(0, 4)).join(", ")}${!full && names.length > 4 ? ", ..." : ""}`;
  });
  console.log(lines.join("\n"));
  // and a total per layer, worst first
  const perLayer = new Map<string, { frames: number; pixels: number }>();
  for (const [k, e] of byCause) {
    const layer = k.split(" ")[0], t = perLayer.get(layer) ?? { frames: 0, pixels: 0 };
    t.frames++; t.pixels += e.gap + e.outline;
    perLayer.set(layer, t);
  }
  console.log("\nBy layer (frames of its own art affected, missing pixels across all recipes):");
  for (const [layer, t] of [...perLayer].sort((a, b) => b[1].frames - a[1].frames)) console.log(`  ${layer.padEnd(28)} ${String(t.frames).padStart(4)} frames  ${String(t.pixels).padStart(5)} pixels`);
  const recipes = new Set(reports.map((r) => r.sprite)).size;
  console.log(`\n${reports.length} frames in ${recipes} recipes have missing pixels (${byCause.size} layer/frame causes).`);
  process.exitCode = reports.length ? 1 : 0;
} else {
  console.error(`unknown command ${cmd}: use export or check`);
  process.exitCode = 2;
}
