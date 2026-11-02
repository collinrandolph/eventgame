// Environment maps.
//
//   npm run env -- [world.json]   write sprites/maps/<world>-L<z>.png (one per layer) and <world>.map.json
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
const art = loadArt();
mkdirSync("sprites/maps", { recursive: true });

const layers: Record<string, unknown> = {};
for (const z of Object.keys(raw.grid.layers).map(Number).sort((a, b) => a - b)) {
  const m = buildLayer(w, raw, cfg, art, z);
  // the ground floor from the street (roofs on) and with every roof lifted; other floors are only seen from inside
  for (const view of z === 0 ? (["exterior", "interior"] as const) : (["interior"] as const)) {
    const img = renderLayer(m, art, view);
    const png = `sprites/maps/${raw.id}-L${z}${z === 0 ? `-${view}` : ""}.png`;
    writeFileSync(png, encodePng(img.width, img.height, img.pixels));
    console.log(`${png}  ${img.width}x${img.height}`);
  }
  layers[String(z)] = compact(m);
  console.log(`  ${m.buildings.length} buildings, ${m.lots.length} roof lots, ${m.props.length} props, ${m.people.length} people`);
}
writeFileSync(`sprites/maps/${raw.id}.map.json`, JSON.stringify({ world: raw.id, tile: 16, layers }) + "\n");
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
