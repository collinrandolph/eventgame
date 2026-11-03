// Environment maps.
//
//   npm run env -- [world.json]   write sprites/maps/<world>-L<z>.png (one per layer) and <world>.map.json
//   npm run env -- [world.json] --walk
//                                 also write sprites/maps/walk/<world>/: the ground floor without people (exterior
//                                 and interior), a 2 px collision mask, the building grid and who starts where
//
// The map JSON is what the game reads: per layer, the tile legend and grid, the props with their state, and the
// people with their sprite. Art comes from sprites/env/data (tiles, themes, props) and sprites/data (characters);
// sprites/env/worlds/<world>.json says which theme each zone uses.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type LayerMap, buildLayer, loadArt, loadEnvConfig, renderLayer } from "../env/build.js";
import type { GridWorldFile } from "../grid.js";
import { encodePng } from "../sprites/png.js";
import { loadWorld } from "../world.js";

const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "worlds/ash-river.json";
const raw = JSON.parse(readFileSync(file, "utf8")) as GridWorldFile;
if (!raw.grid) throw new Error(`${file} isn't a grid world`);
const w = loadWorld(file);
const cfg = loadEnvConfig(raw.id);
// --skin=<name>: draw with imported pieces (sprites/env/skins/<name>.json); outputs get a -<name> suffix
const skin = process.argv.find((a) => a.startsWith("--skin="))?.slice(7);
const art = loadArt(undefined, undefined, undefined, skin);
const sfx = skin ? `-${skin}` : "";
mkdirSync("sprites/maps", { recursive: true });

const layers: Record<string, unknown> = {};
for (const z of Object.keys(raw.grid.layers).map(Number).sort((a, b) => a - b)) {
  const m = buildLayer(w, raw, cfg, art, z);
  // the ground floor from the street (roofs on) and with every roof lifted; other floors are only seen from inside
  for (const view of z === 0 ? (["exterior", "interior"] as const) : (["interior"] as const)) {
    const img = renderLayer(m, art, view);
    const png = `sprites/maps/${raw.id}-L${z}${z === 0 ? `-${view}` : ""}${sfx}.png`;
    writeFileSync(png, encodePng(img.width, img.height, img.pixels));
    console.log(`${png}  ${img.width}x${img.height}`);
  }
  layers[String(z)] = compact(m);
  console.log(`  ${m.buildings.length} buildings, ${m.lots.length} roof lots, ${m.props.length} props, ${m.people.length} people`);
}
if (!skin) writeFileSync(`sprites/maps/${raw.id}.map.json`, JSON.stringify({ world: raw.id, tile: 16, layers }) + "\n");

if (process.argv.includes("--walk")) {
  const dir = `sprites/maps/walk/${raw.id}${sfx}`, m = buildLayer(w, raw, cfg, art, 0);
  mkdirSync(dir, { recursive: true });
  const ext = renderLayer(m, art, "exterior", { people: false }), int = renderLayer(m, art, "interior", { people: false });
  writeFileSync(`${dir}/exterior.png`, encodePng(ext.width, ext.height, ext.pixels));
  writeFileSync(`${dir}/interior.png`, encodePng(int.width, int.height, int.pixels));
  // collision at 2 px: a block is solid if any of its pixels is
  const R = 2, cw = int.width / R, chh = int.height / R, bits = new Uint8Array(Math.ceil((cw * chh) / 8));
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
    let hit = 0;
    for (let j = 0; j < R && !hit; j++) for (let i = 0; i < R && !hit; i++) hit = int.solid[(y * R + j) * int.width + x * R + i];
    if (hit) { const k = y * cw + x; bits[k >> 3] |= 1 << (k & 7); }
  }
  const sprites = [...new Set(m.people.map((p) => p.sprite))];
  writeFileSync(`${dir}/walk.json`, JSON.stringify({
    world: raw.id, name: raw.name, tile: 16, w: m.w, h: m.h, res: R, cw, ch: chh, solid: Buffer.from(bits).toString("base64"),
    building: m.building.map((r) => r.map((b) => (b >= 0 && m.buildings[b].roofed ? b : -1))),
    buildings: m.buildings.map((b) => ({ id: b.id, roofed: b.roofed, names: b.zones.map((z) => raw.grid.zones.find((q) => q.id === z)?.name ?? z) })),
    people: m.people.map((p) => ({ ...p, name: w.people.get(p.id)?.name ?? p.id, playable: !!raw.people.find((q) => q.id === p.id && (q as { playable?: boolean }).playable) })),
    sheets: Object.fromEntries(sprites.map((id) => [id, JSON.parse(readFileSync("sprites/sheets/index.json", "utf8"))[id]?.animations?.walk]).filter(([, a]) => a)),
  }) + "\n");
  console.log(`${dir}/  exterior.png, interior.png, walk.json`);
}
console.log(`sprites/maps/${raw.id}.map.json`);

/** Tiles as a legend of looks plus rows of indices (-1 = nothing), so the file stays small. */
function compact(m: LayerMap) {
  const legend: string[] = [], index = new Map<string, number>();
  const grid = (g: LayerMap["ground"]) => g.map((row) => row.map((l) => {
    if (!l) return -1;
    const k = l.join("|");
    if (!index.has(k)) { index.set(k, legend.length); legend.push(k); }
    return index.get(k)!;
  }));
  return {
    w: m.w, h: m.h, legend, ground: grid(m.ground), overlay: grid(m.overlay),
    kind: m.kind.map((r) => r.join(",")), building: m.building, buildings: m.buildings, lot: m.lot, lots: m.lots,
    props: m.props, people: m.people, lines: m.lines, crosswalks: m.crosswalks,
  };
}
