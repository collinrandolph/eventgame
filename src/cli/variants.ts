// Recoloured variants of existing recipes, for the combat arena.
//
//   npm run arena:sprites     write sprites/maps/arena/variants/: one atlas.png of every sheet, plus index.json
//
// A variant keeps its recipe's clothes, hats and shape and swaps only skin, hair and eye colour, so a crowd of the
// same few recipes doesn't read as clones. Zombies get grey-green skin and pale or red eyes. Nothing in
// sprites/data/ changes; the variants live with the arena. Seeded, so the same command writes the same sprites.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANIMS, ANIM_FPS, type Anim, DIRS, FALLBACK, type Frames, type SpriteDoc, WALK_FPS,
  composeAnim, composeWalk, loadSprites, recipeParts,
} from "../sprites/compose.js";
import { encodePng, hexRgb } from "../sprites/png.js";

const all = loadSprites("sprites/data");
const out = "sprites/maps/arena/variants";

// who the arena needs, by the recipes they're made from
const GROUPS = {
  player: ["bartender"],
  lone: ["gang-member", "inmate", "smuggler", "construction", "janitor", "office", "delivery", "warehouse", "dock-worker", "taxi",
    "cook", "tourist", "jogger", "dad", "grandpa", "elderly-woman", "student", "teenager", "nurse", "postal"],
  pack: ["thief", "urbex", "unhoused", "hipster", "conspiracy"],
  wary: ["soldier", "security", "corrections", "officer", "ex-military", "containment"],
  civ: ["civilian", "tourist", "office", "jogger", "dog-walker", "student", "teenager", "dad", "grandpa", "elderly-woman",
    "shopkeeper", "librarian", "barista", "reporter", "teacher", "social-worker", "daycare", "vet", "pharmacist", "hipster", "red-jacket"],
  civilians: ["construction", "firefighter", "chef", "dock-worker"],
  military: ["ex-military", "officer", "coast-guard", "guard-medic"],
};
// how aggressive each ally is, 0 hangs back, 1 charges in (SYSTEMS.md §1)
const AGGR: Record<string, number> = {
  construction: 0.5, firefighter: 0.6, chef: 0.25, "dock-worker": 0.45,
  "ex-military": 0.9, officer: 0.8, "coast-guard": 0.85, "guard-medic": 0.6,
};
// variants per recipe, by group (the player is the recipe as drawn)
const COPIES: Record<keyof typeof GROUPS, number> = { player: 0, lone: 2, pack: 2, wary: 2, civ: 2, civilians: 1, military: 1 };

const SKIN = ["#ffdbac", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a1e", "#ffcc80", "#d9a066"];
const HAIR = ["#262626", "#3b2a20", "#6d4c41", "#8d6e63", "#a1662f", "#d4a656", "#e6cf8b", "#9e9e9e", "#b03a2e"];
const EYES = ["#3b2a20", "#1b3b6f", "#2e5d32", "#000000", "#5d4037"];
const ZSKIN = ["#b8c4a0", "#a8b490", "#9aa88c", "#b0b8a8", "#8f9c7c", "#c4c8b4"];
const ZHAIR = ["#4a4a40", "#5c5446", "#6b6b5e", "#3a3a32", "#7a7468"];
const ZEYES = ["#c62828", "#e0e0c0", "#ffeb3b", "#8e0000"];

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

/** The recipe with new skin, hair and eyes. Clothes, hats and everything else stay as drawn. */
function recolour(doc: SpriteDoc, skin: string, hair: string, eyes: string): SpriteDoc {
  const old = doc.colors?.a;
  const colors = Object.fromEntries(Object.entries(doc.colors ?? {}).map(([k, v]) => [k, old && v === old ? skin : v]));
  colors.a = skin; colors.y = eyes;
  const tints: Record<string, Record<string, string>> = JSON.parse(JSON.stringify(doc.tints ?? {}));
  for (const id of doc.layers ?? []) {
    if (!id.includes("hair")) continue;
    // only the hair itself: a hair layer can also draw ears or a hairline in the skin colour, and those follow the skin
    const layer = all.get(id), t = (tints[id] ??= {});
    for (const [k, v] of Object.entries(layer?.palette ?? {})) {
      const now = String(t[k] ?? v);
      if (k === "k" || now.startsWith("part:")) continue;
      t[k] = old && now === old ? skin : hair; // skin drawn in the layer's own colour gets the new skin

    }
  }
  return { ...doc, colors, tints };
}

/** One sheet per animation, a row per direction, a column per frame (as `npm run sprites` writes them). */
function sheet(f: Frames): { W: number; H: number; px: Uint8Array; dirs: string[]; count: number } {
  const dirs = DIRS.filter((d) => f.frames[d]);
  const count = Math.max(...dirs.map((d) => f.frames[d]!.length));
  const W = f.w * count, H = f.h * dirs.length, px = new Uint8Array(W * H * 4);
  dirs.forEach((d, r) => f.frames[d]!.forEach((rows, c) => rows.forEach((row, y) => [...row].forEach((k, x) => {
    if (k === ".") return;
    const [R, G, B] = hexRgb(f.palette[k] ?? ""), i = ((r * f.h + y) * W + c * f.w + x) * 4;
    px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = 255;
  }))));
  return { W, H, px, dirs, count };
}

rmSync(out, { recursive: true, force: true });
const sprites: Record<string, unknown> = {}, groups: Record<string, string[]> = {}, aggr: Record<string, number> = {};
// every sheet goes in one atlas, packed in shelves; the index says where each one sits
const placed: { s: ReturnType<typeof sheet>; at: { sx: number; sy: number } }[] = [];
const write = (id: string, doc: SpriteDoc) => {
  const { base, layers } = recipeParts(all, doc);
  const anims: Record<string, unknown> = {};
  const list: { anim: string; frames: Frames }[] = [{ anim: "walk", frames: composeWalk(doc, base, layers) }];
  for (const k of ANIMS) { const f = composeAnim(doc, base, layers, k); if (f) list.push({ anim: k, frames: f }); }
  for (const { anim, frames } of list) {
    const s = sheet(frames);
    const at = { sx: 0, sy: 0 };
    placed.push({ s, at });
    anims[anim] = {
      at, frame: { w: frames.w, h: frames.h }, walkAt: { x: frames.ox, y: frames.oy },
      rows: s.dirs, frames: s.count, fps: anim === "walk" ? WALK_FPS : ANIM_FPS[anim as Anim],
      ...(anim === "walk" ? { idle: 0, loop: [1, 2, 3, 4, 5, 6] } : {}),
      ...(FALLBACK[anim as Anim] ? { fallback: FALLBACK[anim as Anim] } : {}),
    };
  }
  sprites[id] = { name: doc.name, animations: anims };
};
for (const [group, names] of Object.entries(GROUPS) as [keyof typeof GROUPS, string[]][]) {
  groups[group] = [];
  const zombie = group === "lone" || group === "pack" || group === "wary";
  for (const name of names) {
    const doc = all.get(`recipe-${name}`);
    if (!doc) { console.warn(`no recipe-${name}, skipped`); continue; }
    const copies = COPIES[group];
    if (!copies) { const id = `${group}-${name}`; write(id, doc); groups[group].push(id); continue; }
    for (let i = 0; i < copies; i++) {
      const id = `${group}-${name}-${i + 1}`;
      write(id, zombie ? recolour(doc, pick(ZSKIN), pick(ZHAIR), pick(ZEYES)) : recolour(doc, pick(SKIN), pick(HAIR), pick(EYES)));
      groups[group].push(id);
      if (AGGR[name] !== undefined && (group === "civilians" || group === "military")) aggr[id] = AGGR[name];
    }
  }
  // shuffled, so neighbours in a wave don't share a recipe
  groups[group].sort(() => rand() - 0.5);
}
const AW = 2048;
let x = 0, y = 0, shelf = 0;
for (const p of [...placed].sort((a, b) => b.s.H - a.s.H)) {
  if (x + p.s.W > AW) { x = 0; y += shelf; shelf = 0; }
  p.at.sx = x; p.at.sy = y; x += p.s.W; shelf = Math.max(shelf, p.s.H);
}
const AH = y + shelf, atlas = new Uint8Array(AW * AH * 4);
for (const { s: sh, at } of placed) for (let r = 0; r < sh.H; r++) atlas.set(sh.px.subarray(r * sh.W * 4, (r + 1) * sh.W * 4), ((at.sy + r) * AW + at.sx) * 4);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "atlas.png"), encodePng(AW, AH, atlas));
writeFileSync(join(out, "index.json"), JSON.stringify({ atlas: "atlas.png", sprites, groups, aggr }, null, 1) + "\n");
console.log(`${placed.length} sheets for ${Object.keys(sprites).length} sprites in ${out}/atlas.png (${AW} x ${AH})`);
