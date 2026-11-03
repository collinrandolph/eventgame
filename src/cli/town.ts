// A walkable town of shells, its buildings drawn from 3D.
//
//   npm run town -- cities/<id>.json [--seed=N]
//       writes worlds/<id>.json and sprites/env/worlds/<id>.json (the town), then sprites/maps/walk/<id>/:
//       ground.png (streets, lawns and every interior, roofs off), b<N>.png (each building's sprite from 3D, see
//       src/env/massing.ts) and walk.json (collision, the building grid, where each sprite sits, the people).
//       sprites/maps/walk/town.html walks it: the ground, then buildings and people from north to south, and the
//       building you're in drawn without its sprite so you see inside.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateTown, type TownBrief } from "../city/town.js";
import { loadShells } from "../city/shells.js";
import { buildLayer, loadArt, renderLayer, textureOf } from "../env/build.js";
import { buildingTris, interiorTris } from "../env/massing.js";
import { renderSprite } from "../env/oblique.js";
import { encodePng } from "../sprites/png.js";
import { loadWorld } from "../world.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "cities/mischief-night.json";
const brief = JSON.parse(readFileSync(file, "utf8")) as TownBrief;
const seed = args.find((a) => a.startsWith("--seed="));
if (seed) brief.seed = Number(seed.slice(7));

const { world, env, placed, size } = generateTown(brief, loadShells());
const worldFile = `worlds/${brief.id}.json`;
writeFileSync(worldFile, JSON.stringify(world) + "\n");
writeFileSync(`sprites/env/worlds/${brief.id}.json`, JSON.stringify(env, null, 1) + "\n");
const w = loadWorld(worldFile), sp = w.spatial!;
console.log(`${brief.name}: ${size[0]}x${size[1]} cells (${size[0] * 2} x ${size[1] * 2} m), ${placed.length} sites, ${sp.zones.length} zones, ${sp.links.length} links`);
for (const warn of sp.warnings) console.log(`  WARN ${warn}`);

const art = loadArt(), m = buildLayer(w, world, env, art, 0);
const dir = `sprites/maps/walk/${brief.id}`;
mkdirSync(dir, { recursive: true });
// the ground: everything with every roof off; buildings stand on it as sprites
const ground = renderLayer(m, art, "interior", { people: false });
writeFileSync(`${dir}/ground.png`, encodePng(ground.width, ground.height, ground.pixels));
// collision at 2 px, from the same view: thin walls, doors, water
const RES = 2, cw = ground.width / RES, ch = ground.height / RES, bits = new Uint8Array(Math.ceil((cw * ch) / 8));
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
  let hit = 0;
  for (let j = 0; j < RES && !hit; j++) for (let i = 0; i < RES && !hit; i++) hit = ground.solid[(y * RES + j) * ground.width + x * RES + i];
  if (hit) { const k = y * cw + x; bits[k >> 3] |= 1 << (k & 7); }
}

// each building from 3D
const grid = world.grid.layers["0"];
type Strip = { sx: number; sy: number; w: number; h: number; x: number; y: number; base: number };
/** Layers of tris, each rendered on its own and stacked into one image: the strips the page sorts with people. */
const layered = (tris: ReturnType<typeof buildingTris>, keys: number[]) => {
  const parts = keys.map((k) => ({ base: k, spr: renderSprite(tris.filter((t) => t.group === k)) }));
  const AW = Math.max(1, ...parts.map((p) => p.spr.w)), AH = Math.max(1, parts.reduce((t, p) => t + p.spr.h, 0)), atlas = new Uint8Array(AW * AH * 4);
  const strips: Strip[] = [];
  let ay = 0;
  for (const p of parts) {
    for (let y = 0; y < p.spr.h; y++) atlas.set(p.spr.px.subarray(y * p.spr.w * 4, (y + 1) * p.spr.w * 4), (ay + y) * AW * 4);
    strips.push({ sx: 0, sy: ay, w: p.spr.w, h: p.spr.h, x: p.spr.x0, y: p.spr.y0, base: p.base });
    ay += p.spr.h;
  }
  return { png: encodePng(AW, AH, atlas), strips };
};
const sprites: Record<number, { file: string; strips: Strip[]; base: number; inside: { file: string; x: number; y: number; walls: string; strips: Strip[] } }> = {};
// the inside: floors in their theme's tiles, walls in the theme's wall colour
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const themeDoc = (t: string) => art.tiles.get(t) as unknown as { floor?: string; colors?: Record<string, string> } | undefined;
const floorTex = (t: string) => textureOf(art, themeDoc(t)?.floor ?? "tile-floor-concrete", "0", t) ?? { w: 1, h: 1, px: [[120, 120, 120]] };
const wallTex = (t: string) => ({ w: 1, h: 1, px: [rgb(themeDoc(t)?.colors?.w ?? "#5a5a66")] });
for (const s of placed) {
  let id = -1;
  for (let y = s.rect[1]; y <= s.rect[3] && id < 0; y++) for (let x = s.rect[0]; x <= s.rect[2] && id < 0; x++) if (m.building[y][x] >= 0) id = m.building[y][x];
  if (id < 0) continue;
  const doors: [number, number][] = [];
  for (let y = s.rect[1]; y <= s.rect[3]; y++) for (let x = s.rect[0]; x <= s.rect[2]; x++) {
    if (grid[y][x] !== "+") continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => "_=".includes(grid[y + dy]?.[x + dx] ?? "."))) doors.push([x, y]);
  }
  // the outside, a layer per mass so each is sorted with people by where its own south wall meets the ground
  const exTris = buildingTris({ plan: s.plan, origin: s.origin, archetype: s.archetype, doors }, art.arch, (t) => textureOf(art, t));
  const ex = layered(exTris, [...new Set(exTris.map((t) => t.group ?? 0))].sort((a, b) => a - b));
  const name = `b${id}.png`, inName = `i${id}.png`;
  writeFileSync(`${dir}/${name}`, ex.png);
  // the cutaway in layers: the floor, then each row of walls as a strip, stacked into one image (walls.png) so the
  // page can sort the strips with the people and a wall in front of you covers you
  const outsideTex = textureOf(art, art.arch.types[s.archetype]?.wall ?? "tex-wall-brick") ?? wallTex("");
  const inTris = interiorTris({ plan: s.plan, origin: s.origin, archetype: s.archetype, doors }, floorTex, wallTex, outsideTex);
  const ins = renderSprite(inTris.filter((t) => t.group === -1));
  writeFileSync(`${dir}/${inName}`, encodePng(ins.w, ins.h, ins.px));
  const rows = [...new Set(inTris.map((t) => t.group ?? -1).filter((g) => g >= 0))].sort((a, b) => a - b);
  const parts = rows.map((row) => ({ row, spr: renderSprite(inTris.filter((t) => t.group === row)) }));
  const AW = Math.max(1, ...parts.map((p) => p.spr.w)), AH = Math.max(1, parts.reduce((t, p) => t + p.spr.h, 0)), atlas = new Uint8Array(AW * AH * 4);
  const strips: Strip[] = [];
  let ay = 0;
  for (const p of parts) {
    for (let y = 0; y < p.spr.h; y++) atlas.set(p.spr.px.subarray(y * p.spr.w * 4, (y + 1) * p.spr.w * 4), ((ay + y) * AW) * 4);
    // a strip is sorted by where its walls meet the floor on their south face
    strips.push({ sx: 0, sy: ay, w: p.spr.w, h: p.spr.h, x: p.spr.x0, y: p.spr.y0, base: p.row });
    ay += p.spr.h;
  }
  const wallsName = `w${id}.png`;
  writeFileSync(`${dir}/${wallsName}`, encodePng(AW, AH, atlas));
  sprites[id] = { file: name, strips: ex.strips, base: Math.max(...ex.strips.map((q) => q.base)), inside: { file: inName, x: ins.x0, y: ins.y0, walls: wallsName, strips } };
}

const index = JSON.parse(readFileSync("sprites/sheets/index.json", "utf8"));
const ids = [...new Set(m.people.map((p) => p.sprite))];
writeFileSync(`${dir}/walk.json`, JSON.stringify({
  world: brief.id, name: brief.name, tile: 16, w: m.w, h: m.h, res: RES, cw, ch, solid: Buffer.from(bits).toString("base64"),
  building: m.building.map((r) => r.map((b) => (b >= 0 && m.buildings[b].roofed ? b : -1))),
  // walls stand on their cells' centre lines, so part of an outer wall's cell is outside: per wall cell, which sides
  // face outside (1 north, 2 east, 4 south, 8 west), or the cut corner (16 + 0 nw, 1 ne, 2 se, 3 sw)
  edge: m.building.map((r, y) => r.map((b, x) => {
    if (b < 0 || (m.kind[y][x] !== "wall" && m.kind[y][x] !== "portal")) return 0;
    const c = m.cut[y][x];
    if (c) return 16 + ["nw", "ne", "se", "sw"].indexOf(c);
    const out = (dx: number, dy: number) => m.building[y + dy]?.[x + dx] !== b;
    return (out(0, -1) ? 1 : 0) | (out(1, 0) ? 2 : 0) | (out(0, 1) ? 4 : 0) | (out(-1, 0) ? 8 : 0);
  })),
  buildings: m.buildings.map((b) => ({ id: b.id, roofed: b.roofed, names: b.zones.map((z) => world.grid.zones.find((q) => q.id === z)?.name ?? z), sprite: sprites[b.id] })),
  people: m.people.map((p) => ({ ...p, name: w.people.get(p.id)?.name ?? p.id, playable: true })),
  sheets: Object.fromEntries(ids.map((id) => [id, index[id]?.animations?.walk]).filter(([, a]) => a)),
}) + "\n");
console.log(`${dir}/  ground.png, ${Object.keys(sprites).length} building sprites, walk.json`);
console.log(`sheets: ${ids.map((id) => index[id]?.animations?.walk?.file).filter(Boolean).join(" ")}`);
