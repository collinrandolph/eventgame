// Writes a self-contained grid viewer page (2D layer plans + 3D layer stack)
// for a grid world. The world data is embedded, so the page always matches the file.
// Usage: npm run viz -- [world.json] [--out viz/<id>-viewer.html]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Cell, type GridWorldFile, compileGrid } from "../grid.js";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out") ?? "worlds/ash-river.json";
const raw = JSON.parse(readFileSync(file, "utf8")) as GridWorldFile;
if (!raw.grid) throw new Error(`${file} is not a grid world`);
const { def, report } = compileGrid(raw);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : `viz/${raw.id}-viewer.html`;

const g = raw.grid;
const zs = Object.keys(g.layers).map(Number).sort((a, b) => b - a);
const width = Math.max(...zs.flatMap((z) => g.layers[String(z)].map((r) => r.length)));
const height = Math.max(...zs.map((z) => g.layers[String(z)].length));

// Zone colours by kind: streets in two greys (intersections darker), lots and yards in cool
// greys, buildings in distinct hues, underground in greens.
const zoneIndex = new Map(report.zones.map((z, i) => [z.id, i]));
const kinds = report.zones.map((z) =>
  z.street ? z.street : z.z < 0 ? "under" : g.zones.find((d) => d.id === z.id)!.road ? "road" : "building",
);
const counters: Record<string, number> = { road: 0, building: 0, under: 0 };
const BUILDING_HUES = [14, 42, 205, 268, 330, 172, 95, 300];
const colors = kinds.map((k) => {
  if (k === "intersection") return "hsl(215, 12%, 52%)";
  if (k === "segment") return "hsl(215, 10%, 63%)";
  const i = counters[k]++;
  if (k === "road") return `hsl(${188 + ((i * 11) % 40)}, ${22 + (i % 3) * 8}%, ${58 + (i % 4) * 4}%)`;
  if (k === "under") return `hsl(${140 + i * 28}, 34%, 44%)`;
  return `hsl(${BUILDING_HUES[i % BUILDING_HUES.length]}, 52%, 56%)`;
});

// Zone index for every cell (-1 = none), straight from the compiler.
const zoneAt = new Map<string, number>();
for (const z of zs) {
  (report.zoneGrid[String(z)] ?? []).forEach((row, y) =>
    row.forEach((zid, x) => {
      if (zid) zoneAt.set(`${x},${y},${z}`, zoneIndex.get(zid)!);
    }),
  );
}

const layers = zs.map((z) => {
  const rows = g.layers[String(z)].map((r) => r.padEnd(width, " "));
  while (rows.length < height) rows.push(" ".repeat(width));
  const zone = rows.map((r, y) => [...r].map((_, x) => zoneAt.get(`${x},${y},${z}`) ?? -1));
  return { z, rows, zone };
});

// Markers: people, items (carried items sit with their carrier), fixtures, vehicles.
const placed = new Map<string, Cell>();
for (const p of raw.people) if (p.at) placed.set(p.id, p.at);
for (const t of raw.things) if (t.at) placed.set(t.id, t.at);
const markers = [
  ...raw.people.map((p) => ({ id: p.id, name: p.name, kind: p.playable ? "life" : "npc", note: p.role ?? "", at: placed.get(p.id)! })),
  ...raw.things
    .filter((t) => t.kind !== "barrier")
    .map((t) => {
      const carrier = !t.at && t.location ? def.people.find((p) => p.id === t.location) : undefined;
      return {
        id: t.id,
        name: t.name,
        kind: t.kind,
        note: carrier ? `carried by ${carrier.name}` : "",
        at: t.at ?? (carrier ? placed.get(carrier.id) : undefined),
      };
    })
    .filter((m) => m.at),
];

const barrierName = new Map(raw.things.filter((t) => t.kind === "barrier").map((t) => [t.id, t.name]));
const data = {
  name: raw.name,
  cellMeters: g.cellMeters,
  ticksPerCell: g.ticksPerCell,
  width,
  height,
  layers,
  zones: report.zones.map((z, i) => ({
    id: z.id,
    name: z.name,
    street: z.street ?? null,
    folded: !!z.folded,
    z: z.z,
    kind: kinds[i],
    rooms: z.rooms,
    cells: z.cells,
    anchor: z.anchor,
    color: colors[i],
  })),
  links: report.links.map((l) => ({
    id: l.id,
    a: l.a,
    b: l.b,
    kind: l.kind,
    width: l.width,
    ticks: l.ticks,
    road: l.road,
    barrier: l.barrier ? barrierName.get(l.barrier) ?? l.barrier : null,
    where: l.where,
  })),
  markers,
  warnings: report.warnings,
};

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, "..", "viz", "viewer.html"), "utf8");
const html = template.replace("__EVENT_TITLE__", `${raw.name.replace(/\s*\(.*\)$/, "")} Grid`).replace("/*__EVENT_DATA__*/null", JSON.stringify(data));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB): ${layers.length} layers, ${data.zones.length} zones, ${data.links.length} links, ${markers.length} markers`);
