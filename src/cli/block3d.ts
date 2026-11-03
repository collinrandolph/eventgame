// Shells as 3D shapes in the game's 3/4 projection, to check what the 2D builder should draw.
//
//   npm run block3d -- [--seeds=1,2]
//       writes sprites/maps/shell-block-3d-seed<N>.png: the same block as `npm run block -- --seed=N`, each mass
//       extruded to its storeys (3 m each) and roofed the way its type intends, drawn at 8 px per metre exactly like
//       the 2D renderer, so the two can be laid over each other. Also sprites/maps/shell-block-3d.json (the shapes).
//
// Roofs: a flat archetype gets a flat roof behind a 0.6 m parapet (courtyards cut out); a pitched one gets a gable
// with its ridge along each mass's long side, a hip on small or angled masses (bays, apses), and a tower a spire.

import { readFileSync, writeFileSync } from "node:fs";
import { generateBlock } from "../city/block.js";
import { CELL_M } from "../city/generate.js";
import { loadShells } from "../city/shells.js";
import { type Tri, footprint, gable, hip, rasterize, slab, spire, walls } from "../env/oblique.js";
import { encodePng } from "../sprites/png.js";

type RGB = [number, number, number];
const seeds = (process.argv.find((a) => a.startsWith("--seeds="))?.slice(8) ?? "1,2").split(",").map(Number);
const arch = JSON.parse(readFileSync("sprites/env/archetypes.json", "utf8")).types;
const metres = (r: [number, number, number, number]): [number, number, number, number] => [r[0] * CELL_M, r[1] * CELL_M, (r[2] + 1) * CELL_M, (r[3] + 1) * CELL_M];
const STOREY = 3;
const WALL: Record<string, RGB> = { storefront: [168, 74, 58], school: [199, 120, 63], clinic: [179, 90, 72], "church-nave": [185, 180, 168], "bell-tower": [170, 165, 150], "house-shingle": [232, 226, 208] };
const ROOF: Record<string, RGB> = { flat: [143, 143, 153], "church-nave": [90, 107, 128], "bell-tower": [80, 96, 116], "house-shingle": [138, 74, 46] };
const PITCH: Record<string, number> = { "church-nave": 50, "house-shingle": 35 };

const dump: unknown[] = [];
for (const seed of seeds) {
  const { placed, streets, size } = generateBlock({ id: "shell-block", name: "Shell Block", seed, shells: ["storefront", "hall", "dwelling", "block", "ward"] }, loadShells());
  const W = size[0] * CELL_M, D = size[1] * CELL_M, tris: Tri[] = [];
  // ground: sidewalk everywhere, streets, lawns
  slab(tris, [[0, 0], [W, 0], [W, D], [0, D]], 0, [200, 200, 196]);
  for (const s of streets) { const [x0, z0, x1, z1] = metres(s.rect); slab(tris, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0.01, [70, 70, 76]); }
  const shapes = [];
  for (const b of placed) {
    const [lx0, lz0, lx1, lz1] = metres(b.lot);
    slab(tris, [[lx0, lz0], [lx1, lz0], [lx1, lz1], [lx0, lz1]], 0.02, [92, 150, 72]);
    const A = arch[b.archetype] ?? {}, baseStoreys = A.storeys?.[0] ?? 1;
    // the courtyard, as one rectangle in metres
    const court = b.courts.length ? metres([Math.min(...b.courts.map((c) => c[0])), Math.min(...b.courts.map((c) => c[1])), Math.max(...b.courts.map((c) => c[0])), Math.max(...b.courts.map((c) => c[1]))]) : null;
    for (const ms of b.masses) {
      const r = metres(ms.rect), cuts = ms.cuts.map((c) => ({ corner: c.corner, n: c.n * CELL_M })), poly = footprint(r, cuts);
      const look = ms.arch ?? b.archetype, L = arch[look] ?? A, wall = WALL[look] ?? [200, 200, 200];
      const storeys = ms.storeys ?? baseStoreys, H = storeys * (ms.rise ? 3.5 : STOREY), w = r[2] - r[0], d = r[3] - r[1];
      shapes.push({ building: b.name, mass: ms.id, rect: r, cuts, storeys, H, roof: ms.rise ? "spire" : L.roof });
      if (ms.rise) { walls(tris, poly, 0, H, wall); spire(tris, poly, H, Math.min(w, d) * 1.6, ROOF[look] ?? [80, 90, 110]); continue; }
      if (L.roof === "flat") {
        walls(tris, poly, 0, H + 0.6, wall);
        // the roof inside the parapet, around any courtyard (whose walls face in)
        if (court && court[0] >= r[0] && court[2] <= r[2] && court[1] >= r[1] && court[3] <= r[3]) {
          const [cx0, cz0, cx1, cz1] = court, gray = ROOF.flat;
          for (const p of [[r[0], r[1], r[2], cz0], [r[0], cz1, r[2], r[3]], [r[0], cz0, cx0, cz1], [cx1, cz0, r[2], cz1]] as [number, number, number, number][]) slab(tris, [[p[0], p[1]], [p[2], p[1]], [p[2], p[3]], [p[0], p[3]]], H, gray);
          walls(tris, [[cx0, cz0], [cx0, cz1], [cx1, cz1], [cx1, cz0]], 0, H + 0.6, wall);
          slab(tris, [[cx0, cz0], [cx1, cz0], [cx1, cz1], [cx0, cz1]], 0.03, [92, 150, 72]);
        } else slab(tris, poly, H, ROOF.flat);
        continue;
      }
      walls(tris, poly, 0, H, wall);
      const pitch = PITCH[look] ?? 35, roofC = ROOF[look] ?? [120, 80, 60];
      // small or angled masses get a hip; the rest a gable along their long side
      if (cuts.length || (w <= 6 && d <= 6)) hip(tris, poly, H, pitch, roofC);
      else gable(tris, r, H, pitch, roofC, wall);
    }
  }
  dump.push({ seed, shapes });
  const Wpx = Math.round(W * 8), Hpx = Math.round(D * 8);
  writeFileSync(`sprites/maps/shell-block-3d-seed${seed}.png`, encodePng(Wpx, Hpx, rasterize(tris, Wpx, Hpx)));
  console.log(`sprites/maps/shell-block-3d-seed${seed}.png  ${Wpx}x${Hpx}`);
}
writeFileSync("sprites/maps/shell-block-3d.json", JSON.stringify(dump));
