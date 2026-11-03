// A building in 3D, from its shell plan: each mass a prism of its storeys (3 m each), roofed the way its type is
// (flat behind a parapet, a gable along its long side, a hip on small or angled masses, a spire on a tower), with
// windows and doors as decals on the walls. Every face is textured along its own plane, so brick rows run along
// their wall and shingles along their eave. Drawn with oblique.ts in the game's projection, this is the building's
// sprite.

import type { Corner } from "../city/shells.js";
import type { ShellPlan } from "../city/shells.js";
import type { Archetypes } from "./build.js";
import { type TexTri, type Texture, type V3, footprint, nextFace } from "./oblique.js";

const BAND = 0.5; // wall thickness, the same 4 px the collision mask uses
const CELL = 2, STOREY = 3, PITCH: Record<string, number> = { "church-nave": 50, "house-shingle": 40 };
type P2 = [number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export interface BuildingInput {
  plan: ShellPlan;
  /** The plan's top-left cell on the map. */
  origin: [number, number];
  archetype: string;
  /** Outside doors, as map cells. */
  doors: [number, number][];
}

export function buildingTris(b: BuildingInput, arch: Archetypes, tex: (id: string) => Texture | null): TexTri[] {
  const out: TexTri[] = [];
  // layers: each mass is its own, keyed by the y in pixels where its south wall meets the ground, so a person in
  // front of the main wall isn't hidden by a porch or bay further south
  let grp = 0;
  const T = (id: string | undefined, fallback: string) => tex(id ?? fallback) ?? tex(fallback)!;
  /** A flat polygon face, textured along `uDir` (metres to texture pixels at 8 px per metre). */
  const face = (pts: V3[], t: Texture, uDir: V3) => {
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))), u = norm(uDir), v = norm(cross(n, u)), f = nextFace();
    const uv = (p: V3): [number, number] => [dot(sub(p, pts[0]), u) * 8, -dot(sub(p, pts[0]), v) * 8];
    for (let k = 1; k < pts.length - 1; k++) out.push({ p: [pts[0], pts[k], pts[k + 1]], uv: [uv(pts[0]), uv(pts[k]), uv(pts[k + 1])], tex: t, face: f, group: grp });
  };
  /** A decal: a texture laid flat on a wall, its own size at 8 px per metre, centred at `t` along a -> b. */
  const decal = (a: P2, b: P2, along: number, y: number, t: Texture) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const ox = dz * 0.04, oz = -dx * 0.04, w = t.w / 8, h = t.h / 8, s0 = along - w / 2, s1 = along + w / 2;
    const P = (s: number, yy: number): V3 => [a[0] + dx * s + ox, yy, a[1] + dz * s + oz];
    const f = nextFace(), p = [P(s0, y), P(s1, y), P(s1, y + h), P(s0, y + h)];
    // seen from outside, the texture's left is the far end of the edge
    const uv: [number, number][] = [[t.w, t.h], [0, t.h], [0, 0], [t.w, 0]];
    out.push({ p: [p[0], p[1], p[2]], uv: [uv[0], uv[1], uv[2]], tex: t, face: f, decal: true, group: grp }, { p: [p[0], p[2], p[3]], uv: [uv[0], uv[2], uv[3]], tex: t, face: f, decal: true, group: grp });
  };

  const A0 = arch.types[b.archetype], baseStoreys = A0?.storeys?.[0] ?? 1;
  const [ox, oy] = b.origin;
  // walls stand on their cells' centre lines, inside and out, so a mass's outer face is IN metres in from its cells,
  // and a one-cell cut's face meets the straight walls where their centre lines end
  const IN = (CELL - BAND) / 2;
  const rects = b.plan.masses.map((ms) => [(ox + ms.rect[0]) * CELL + IN, (oy + ms.rect[1]) * CELL + IN, (ox + ms.rect[2] + 1) * CELL - IN, (oy + ms.rect[3] + 1) * CELL - IN] as [number, number, number, number]);
  const insideOther = (k: number, x: number, z: number) => rects.some((r, j) => j !== k && x > r[0] && x < r[2] && z > r[1] && z < r[3]);
  const courts = b.plan.courts.map(([x, y]) => [(ox + x) * CELL, (oy + y) * CELL]);
  const court = courts.length ? [Math.min(...courts.map((c) => c[0])) - IN, Math.min(...courts.map((c) => c[1])) - IN, Math.max(...courts.map((c) => c[0])) + CELL + IN, Math.max(...courts.map((c) => c[1])) + CELL + IN] : null;
  const doors = b.doors.map(([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL] as P2);

  b.plan.masses.forEach((ms, k) => {
    grp = Math.round(rects[k][3] * 8);
    const r = rects[k], cuts = ms.cuts.map((c) => ({ corner: c.corner as Corner, n: c.n * CELL + CELL / 2 - 2 * IN - (BAND / 2) * Math.SQRT2 })), poly = footprint(r, cuts);
    const look = ms.arch ?? b.archetype, A = arch.types[look] ?? A0;
    const storeys = ms.storeys ?? baseStoreys, H = storeys * (ms.rise ? 3.5 : STOREY), w = r[2] - r[0], d = r[3] - r[1];
    const wallT = T(A?.wall, "tex-wall-brick"), roofT = T(A?.roofTex, "tex-roof-flat"), flat = !ms.rise && A?.roof === "flat";
    const top = flat ? H + 0.6 : H;
    // walls, and their windows and doors where the wall faces outside
    for (let e = 0; e < poly.length; e++) {
      const a = poly[e], c = poly[(e + 1) % poly.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      face([[a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], top, c[1]], [a[0], top, a[1]]], wallT, [c[0] - a[0], 0, c[1] - a[1]]);
      const nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len, mx = (a[0] + c[0]) / 2 + nx * 0.5, mz = (a[1] + c[1]) / 2 + nz * 0.5;
      if (insideOther(k, mx, mz) || len < 1.5) continue;
      const along = (p: P2) => ((p[0] - a[0]) * (c[0] - a[0]) + (p[1] - a[1]) * (c[1] - a[1])) / len;
      const off = (p: P2) => Math.abs((p[0] - a[0]) * nx + (p[1] - a[1]) * nz);
      const here = doors.filter((p) => off(p) < 1.6 && along(p) > 0 && along(p) < len).map(along);
      const doorT = T(A?.door, "deco-door");
      for (const s of here) decal(a, c, s, 0, doorT);
      const count = Math.max(1, Math.floor(len / 3));
      for (let i = 0; i < count; i++) {
        const s = ((i + 0.5) * len) / count;
        if (here.some((q) => Math.abs(q - s) < 1.4)) continue;
        for (let st = 0; st < storeys; st++) {
          const winT = T(st === 0 && A?.ground ? A.ground : A?.window, "deco-window");
          decal(a, c, s, st * STOREY + Math.max(0.3, (STOREY - winT.h / 8) / 2), winT);
        }
      }
    }
    // the roof
    if (ms.rise) {
      const xm = (r[0] + r[2]) / 2, zm = (r[1] + r[3]) / 2, apex: V3 = [xm, H + Math.min(w, d) * 1.6, zm], spT = T(A?.roofTex, "tex-roof-slate");
      for (let e = 0; e < poly.length; e++) { const a = poly[e], c = poly[(e + 1) % poly.length]; face([[a[0], H, a[1]], [c[0], H, c[1]], apex], spT, [c[0] - a[0], 0, c[1] - a[1]]); }
      return;
    }
    if (flat) {
      const cap = (q: [number, number, number, number]) => face([[q[0], H, q[1]], [q[2], H, q[1]], [q[2], H, q[3]], [q[0], H, q[3]]], roofT, [1, 0, 0]);
      if (court && court[0] >= r[0] && court[2] <= r[2] && court[1] >= r[1] && court[3] <= r[3]) {
        const [cx0, cz0, cx1, cz1] = court;
        cap([r[0], r[1], r[2], cz0]); cap([r[0], cz1, r[2], r[3]]); cap([r[0], cz0, cx0, cz1]); cap([cx1, cz0, r[2], cz1]);
        const ring: P2[] = [[cx0, cz0], [cx0, cz1], [cx1, cz1], [cx1, cz0]];
        for (let e = 0; e < 4; e++) { const a = ring[e], c = ring[(e + 1) % 4]; face([[a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], top, c[1]], [a[0], top, a[1]]], wallT, [c[0] - a[0], 0, c[1] - a[1]]); }
      } else {
        const pts = poly.map((p) => [p[0], H, p[1]] as V3);
        face(pts, roofT, [1, 0, 0]);
      }
      return;
    }
    const pitch = ((PITCH[look] ?? 38) * Math.PI) / 180, tn = Math.tan(pitch), o = 0.4;
    if (cuts.length || (w <= 6 && d <= 6)) {
      // a hip: every edge slopes up to a ridge along the long side, or a point if square
      const xm = (r[0] + r[2]) / 2, zm = (r[1] + r[3]) / 2, R = H + (Math.min(w, d) / 2) * tn;
      const ridge: V3[] = w > d ? [[r[0] + d / 2, R, zm], [r[2] - d / 2, R, zm]] : d > w ? [[xm, R, r[1] + w / 2], [xm, R, r[3] - w / 2]] : [[xm, R, zm]];
      const near = (p: P2) => ridge.reduce((best, q) => (Math.hypot(q[0] - p[0], q[2] - p[1]) < Math.hypot(best[0] - p[0], best[2] - p[1]) ? q : best));
      for (let e = 0; e < poly.length; e++) {
        const a = poly[e], c = poly[(e + 1) % poly.length], ra = near(a), rc = near(c), dir: V3 = [c[0] - a[0], 0, c[1] - a[1]];
        face(ra === rc ? [[a[0], H, a[1]], [c[0], H, c[1]], ra] : [[a[0], H, a[1]], [c[0], H, c[1]], rc, ra], roofT, dir);
      }
      return;
    }
    // a gable along the long side; its ends are wall
    const [x0, z0, x1, z1] = r;
    if (w >= d) {
      const zm = (z0 + z1) / 2, R = H + (d / 2) * tn;
      face([[x0 - o, H, z0 - o], [x1 + o, H, z0 - o], [x1 + o, R, zm], [x0 - o, R, zm]], roofT, [1, 0, 0]);
      face([[x1 + o, H, z1 + o], [x0 - o, H, z1 + o], [x0 - o, R, zm], [x1 + o, R, zm]], roofT, [-1, 0, 0]);
      face([[x0, H, z1], [x0, H, z0], [x0, R, zm]], wallT, [0, 0, -1]);
      face([[x1, H, z0], [x1, H, z1], [x1, R, zm]], wallT, [0, 0, 1]);
    } else {
      const xm = (x0 + x1) / 2, R = H + (w / 2) * tn;
      face([[x0 - o, H, z1 + o], [x0 - o, H, z0 - o], [xm, R, z0 - o], [xm, R, z1 + o]], roofT, [0, 0, -1]);
      face([[x1 + o, H, z0 - o], [x1 + o, H, z1 + o], [xm, R, z1 + o], [xm, R, z0 - o]], roofT, [0, 0, 1]);
      face([[x0, H, z0], [x1, H, z0], [xm, R, z0]], wallT, [1, 0, 0]);
      face([[x1, H, z1], [x0, H, z1], [xm, R, z1]], wallT, [-1, 0, 0]);
    }
  });
  return out;
}

// ---- the inside: a cutaway, for when you're in the building ----

/** How high the walls are cut, in metres: low enough to see into every room, high enough to read as walls. */
export const CUTAWAY = 1.2;

/**
 * The building with its roof and upper walls taken off: each room's floor in its theme's tiles, and every wall a
 * thin slab where the collision mask puts it (along its cell's centre line, inside and out), joined to its neighbours,
 * with gaps for doorways. A one-cell cut runs between the midpoints of the two edges it joins.
 */
export function interiorTris(b: BuildingInput, floorTex: (theme: string) => Texture, wallTex: (theme: string) => Texture, outsideTex: Texture): TexTri[] {
  const out: TexTri[] = [];
  // layers: -1 the floor, otherwise the y in pixels where a wall meets the floor on its south face, so walls can be
  // sorted with people
  let grp = -1;
  const { cells, rooms } = b.plan, [ox, oy] = b.origin, theme = new Map(rooms.map((r) => [r.id, r.theme]));
  const cut = new Map(b.plan.cuts.map(([x, y, c]) => [`${x},${y}`, c]));
  const at = (x: number, y: number) => cells[y]?.[x] ?? ".";
  const wallish = (c: string) => c === "#" || c === "+";
  const floorish = (c: string) => c !== "." && !wallish(c);
  const face = (pts: V3[], t: Texture, uDir: V3, f = nextFace()) => {
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))), u = norm(uDir), v = norm(cross(n, u));
    // floors tile in map space so neighbouring cells line up; walls along their own faces
    const flat = Math.abs(n[1]) > 0.99;
    const uv = (p: V3): [number, number] => (flat ? [p[0] * 8, p[2] * 8] : [dot(sub(p, pts[0]), u) * 8, -dot(sub(p, pts[0]), v) * 8]);
    for (let k = 1; k < pts.length - 1; k++) out.push({ p: [pts[0], pts[k], pts[k + 1]], uv: [uv(pts[0]), uv(pts[k]), uv(pts[k + 1])], tex: t, face: f, group: grp });
  };
  // one cap colour for every wall top in the building; each side face takes the room it faces, or the building's
  // outside material where it faces out, so a wall never changes material partway along a room
  const CAP: Texture = { w: 1, h: 1, px: [[86, 86, 98]] };
  const facing = (px: number, pz: number): Texture => {
    const c = at(Math.floor(px / CELL) - ox, Math.floor(pz / CELL) - oy);
    return c === "." ? outsideTex : floorish(c) ? wallTex(theme.get(c)!) : CAP;
  };
  /** A slab standing on a footprint polygon, CUTAWAY metres tall. */
  const slab = (poly: P2[]) => {
    const f = nextFace(), was = grp;
    grp = Math.round(Math.max(...poly.map((p) => p[1])) * 8);
    face(poly.map((p) => [p[0], CUTAWAY, p[1]] as V3), CAP, [1, 0, 0], f);
    const cx = poly.reduce((t, p) => t + p[0], 0) / poly.length, cz = poly.reduce((t, p) => t + p[1], 0) / poly.length;
    for (let e = 0; e < poly.length; e++) {
      const a = poly[e], c = poly[(e + 1) % poly.length], mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      let nx = c[1] - a[1], nz = -(c[0] - a[0]);
      const len = Math.hypot(nx, nz) || 1;
      if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
      face([[a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], CUTAWAY, c[1]], [a[0], CUTAWAY, a[1]]], facing(mx + (nx / len) * 0.6, mz + (nz / len) * 0.6), [c[0] - a[0], 0, c[1] - a[1]]);
    }
    grp = was;
  };
  // the nearest room's theme, for a wall or door cell's floor and colour
  const near = (x: number, y: number) => {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const c = at(x + dx, y + dy); if (floorish(c)) return theme.get(c)!; }
    return rooms[0].theme;
  };

  for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
    const c = at(x, y);
    if (c === ".") continue;
    const X0 = (ox + x) * CELL, Z0 = (oy + y) * CELL, th = floorish(c) ? theme.get(c)! : near(x, y);
    const corner = cut.get(`${x},${y}`);
    grp = -1;
    const H = CELL / 2, M = (CELL - BAND) / 2; // every wall runs along its cell's centre line, outer walls too
    if (corner) {
      // a one-cell cut: floor on the inside of the diagonal, open ground outside, and the wall from the midpoint of
      // one edge to the midpoint of the other, where the straight walls' centre lines end
      const sx = corner.endsWith("w") ? 1 : -1, sz = corner.startsWith("n") ? 1 : -1;
      const cx = corner.endsWith("w") ? X0 : X0 + CELL, cz = corner.startsWith("n") ? Z0 : Z0 + CELL; // the cut corner
      const e1: P2 = [cx + sx * CELL, cz + sz * H], e2: P2 = [cx + sx * H, cz + sz * CELL];
      face([e1, [cx + sx * CELL, cz + sz * CELL], e2].map((p) => [p[0], 0.001, p[1]] as V3), floorTex(th), [1, 0, 0]);
      const b2 = BAND / 2;
      slab(hull([[e1[0], e1[1] - b2], [e1[0], e1[1] + b2], [e2[0] - b2, e2[1]], [e2[0] + b2, e2[1]]]));
      continue;
    }
    // floor: a room's cell is all its own; a wall's or doorway's cell is split at the centre line into quarters, each
    // taking the room on its own side (open ground if that side is outside), so no room's floor shows in another
    if (floorish(c)) face([[X0, 0, Z0], [X0 + CELL, 0, Z0], [X0 + CELL, 0, Z0 + CELL], [X0, 0, Z0 + CELL]], floorTex(th), [1, 0, 0]);
    else for (const qy of [0, 1]) for (const qx of [0, 1]) {
      const dx = qx ? 1 : -1, dy = qy ? 1 : -1, sides = [at(x + dx, y), at(x, y + dy), at(x + dx, y + dy)];
      const room = sides.find(floorish);
      if (!room && sides.includes(".")) continue;
      const q0 = X0 + qx * H, r0 = Z0 + qy * H;
      face([[q0, 0, r0], [q0 + H, 0, r0], [q0 + H, 0, r0 + H], [q0, 0, r0 + H]], floorTex(room ? theme.get(room)! : th), [1, 0, 0]);
    }
    if (c !== "#") continue; // doorways stand open
    // a wall: a band along the centre line, with arms out to the walls beside it
    const W = wallish(at(x - 1, y)), E = wallish(at(x + 1, y)), N = wallish(at(x, y - 1)), S = wallish(at(x, y + 1));
    const rect = (x0: number, z0: number, x1: number, z1: number) => { if (x1 - x0 > 0.01 && z1 - z0 > 0.01) slab([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]); };
    if (W || E) rect(X0 + (W ? 0 : M), Z0 + M, X0 + (E ? CELL : M + BAND), Z0 + M + BAND);
    if (N || S) rect(X0 + M, Z0 + (N ? 0 : M), X0 + M + BAND, Z0 + (S ? CELL : M + BAND));
    if (!W && !E && !N && !S) rect(X0 + M, Z0 + M, X0 + M + BAND, Z0 + M + BAND);
  }
  return out;
}

/** The convex hull of some points, in order around it. */
function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [], upper: P2[] = [];
  for (const q of p) { while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
