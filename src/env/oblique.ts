// A small 3D renderer in the game's own 3/4 projection, for checking what the 2D builder should draw.
//
// The game's view is an oblique projection: a point (x east, y up, z south), in metres, lands on screen at
// (x * 8, (z - y) * 8). Ground depth and height both cost 8 px per metre, so a 3 m storey is 24 px of wall and a
// 2 m cell is 16 px of ground. The viewer looks along (0, -1, -1), so of two points on the same pixel the one with
// the larger y + z is in front. Triangles are filled flat, lit from the south-west and above, with a depth buffer;
// face edges are darkened so shapes read.

export type V3 = [number, number, number];
export interface Tri { p: [V3, V3, V3]; color: [number, number, number]; face: number }

const PX = 8;
const LIGHT = (() => { const l: V3 = [-0.45, 0.8, 0.55], n = Math.hypot(...l); return l.map((v) => v / n) as V3; })();

export function rasterize(tris: Tri[], width: number, height: number, ground: [number, number, number] = [96, 120, 80]) {
  const px = new Uint8Array(width * height * 4), depth = new Float32Array(width * height).fill(-Infinity), face = new Int32Array(width * height).fill(-1);
  for (let i = 0; i < width * height; i++) px.set([...ground, 255], i * 4);
  for (const t of tris) {
    const [a, b, c] = t.p;
    // flat shading from the face normal
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    n = n.map((k) => k / len) as V3;
    if (n[1] < 0 || (n[1] === 0 && n[2] < 0)) n = n.map((k) => -k) as V3; // face the viewer's side
    const lit = 0.55 + 0.45 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const col = t.color.map((k) => Math.min(255, Math.round(k * lit)));
    const S = t.p.map(([x, y, z]) => [x * PX, (z - y) * PX, y + z]);
    const minX = Math.max(0, Math.floor(Math.min(S[0][0], S[1][0], S[2][0]))), maxX = Math.min(width - 1, Math.ceil(Math.max(S[0][0], S[1][0], S[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(S[0][1], S[1][1], S[2][1]))), maxY = Math.min(height - 1, Math.ceil(Math.max(S[0][1], S[1][1], S[2][1])));
    const area = (S[1][0] - S[0][0]) * (S[2][1] - S[0][1]) - (S[2][0] - S[0][0]) * (S[1][1] - S[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let Y = minY; Y <= maxY; Y++) for (let X = minX; X <= maxX; X++) {
      const cx = X + 0.5, cy = Y + 0.5;
      const w0 = ((S[1][0] - cx) * (S[2][1] - cy) - (S[2][0] - cx) * (S[1][1] - cy)) / area;
      const w1 = ((S[2][0] - cx) * (S[0][1] - cy) - (S[0][0] - cx) * (S[2][1] - cy)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const d = w0 * S[0][2] + w1 * S[1][2] + w2 * S[2][2], i = Y * width + X;
      if (d <= depth[i] + 1e-4) continue;
      depth[i] = d; face[i] = t.face;
      px[i * 4] = col[0]; px[i * 4 + 1] = col[1]; px[i * 4 + 2] = col[2];
    }
  }
  // darken where one face meets another
  for (let Y = 0; Y < height - 1; Y++) for (let X = 0; X < width - 1; X++) {
    const i = Y * width + X;
    if (face[i] < 0) continue;
    if (face[i] !== face[i + 1] || face[i] !== face[i + width]) for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.round(px[i * 4 + c] * 0.55);
  }
  return px;
}

// ---- shapes ----

type P2 = [number, number]; // x, z
let faceId = 0;
const quad = (out: Tri[], a: V3, b: V3, c: V3, d: V3, color: [number, number, number]) => { const f = faceId++; out.push({ p: [a, b, c], color, face: f }, { p: [a, c, d], color, face: f }); };
const tri = (out: Tri[], a: V3, b: V3, c: V3, color: [number, number, number]) => out.push({ p: [a, b, c], color, face: faceId++ });

/** A flat horizontal polygon (convex), at height y. */
export function slab(out: Tri[], poly: P2[], y: number, color: [number, number, number]) {
  const f = faceId++;
  for (let k = 1; k < poly.length - 1; k++) out.push({ p: [[poly[0][0], y, poly[0][1]], [poly[k][0], y, poly[k][1]], [poly[k + 1][0], y, poly[k + 1][1]]], color, face: f });
}

/** Walls standing on each edge of a polygon, from y0 to y1. */
export function walls(out: Tri[], poly: P2[], y0: number, y1: number, color: [number, number, number]) {
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    quad(out, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], color);
  }
}

/** A rectangle footprint with corners cut at 45 degrees (legs in metres), clockwise from the north-west. */
export function footprint(r: [number, number, number, number], cuts: { corner: string; n: number }[]): P2[] {
  const [x0, z0, x1, z1] = r, c = (k: string) => cuts.find((q) => q.corner === k)?.n ?? 0;
  const pts: P2[] = [];
  const nw = c("nw"), ne = c("ne"), se = c("se"), sw = c("sw");
  if (nw) pts.push([x0, z0 + nw], [x0 + nw, z0]); else pts.push([x0, z0]);
  if (ne) pts.push([x1 - ne, z0], [x1, z0 + ne]); else pts.push([x1, z0]);
  if (se) pts.push([x1, z1 - se], [x1 - se, z1]); else pts.push([x1, z1]);
  if (sw) pts.push([x0 + sw, z1], [x0, z1 - sw]); else pts.push([x0, z1]);
  return pts;
}

/** A gable roof over a rectangle: the ridge along its long side, gable ends (in wall colour) on the short sides. */
export function gable(out: Tri[], r: [number, number, number, number], y: number, pitchDeg: number, roof: [number, number, number], wall: [number, number, number], o = 0.4) {
  const [x0, z0, x1, z1] = r, ew = x1 - x0 >= z1 - z0, t = Math.tan((pitchDeg * Math.PI) / 180);
  if (ew) {
    const zm = (z0 + z1) / 2, R = y + ((z1 - z0) / 2) * t;
    quad(out, [x0 - o, y, z0 - o], [x1 + o, y, z0 - o], [x1 + o, R, zm], [x0 - o, R, zm], roof);
    quad(out, [x0 - o, y, z1 + o], [x1 + o, y, z1 + o], [x1 + o, R, zm], [x0 - o, R, zm], roof);
    tri(out, [x0, y, z0], [x0, y, z1], [x0, R, zm], wall);
    tri(out, [x1, y, z0], [x1, y, z1], [x1, R, zm], wall);
  } else {
    const xm = (x0 + x1) / 2, R = y + ((x1 - x0) / 2) * t;
    quad(out, [x0 - o, y, z0 - o], [x0 - o, y, z1 + o], [xm, R, z1 + o], [xm, R, z0 - o], roof);
    quad(out, [x1 + o, y, z0 - o], [x1 + o, y, z1 + o], [xm, R, z1 + o], [xm, R, z0 - o], roof);
    tri(out, [x0, y, z0], [x1, y, z0], [xm, R, z0], wall);
    tri(out, [x0, y, z1], [x1, y, z1], [xm, R, z1], wall);
  }
}

/** A hip roof over a convex footprint: every edge slopes up to a ridge along the long side (a point if square). */
export function hip(out: Tri[], poly: P2[], y: number, pitchDeg: number, roof: [number, number, number]) {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), w = x1 - x0, d = z1 - z0;
  const t = Math.tan((pitchDeg * Math.PI) / 180), R = y + (Math.min(w, d) / 2) * t, xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
  const ridge: V3[] = w > d ? [[x0 + d / 2, R, zm], [x1 - d / 2, R, zm]] : d > w ? [[xm, R, z0 + w / 2], [xm, R, z1 - w / 2]] : [[xm, R, zm]];
  const near = (p: P2) => ridge.reduce((best, q) => (Math.hypot(q[0] - p[0], q[2] - p[1]) < Math.hypot(best[0] - p[0], best[2] - p[1]) ? q : best));
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length], ra = near(a), rb = near(b);
    if (ra === rb) tri(out, [a[0], y, a[1]], [b[0], y, b[1]], ra, roof);
    else quad(out, [a[0], y, a[1]], [b[0], y, b[1]], rb, ra, roof);
  }
}

/** A pyramid cap (a spire) over a footprint, rising `rise` metres. */
export function spire(out: Tri[], poly: P2[], y: number, rise: number, roof: [number, number, number]) {
  const xm = poly.reduce((s, p) => s + p[0], 0) / poly.length, zm = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; tri(out, [a[0], y, a[1]], [b[0], y, b[1]], [xm, y + rise, zm], roof); }
}

// ---- textured sprites: one building, its own depth buffer, transparent around it ----

/** Pixels of a texture: null where empty. Sampled at whole pixels (no smoothing), wrapping. */
export interface Texture { w: number; h: number; px: ([number, number, number] | null)[] }
/** A triangle with a texture and per-vertex texture coordinates in texture pixels. A decal skips empty texels. */
/** group: which layer it's drawn in, when a sprite is split into layers (a cutaway's floor, then its walls row by row). */
export interface TexTri { p: [V3, V3, V3]; uv: [[number, number], [number, number], [number, number]]; tex: Texture; face: number; decal?: boolean; group?: number }

let texFace = 1_000_000;
export const nextFace = () => texFace++;

/** Light levels for faces, by which way they turn: few and fixed, so the art keeps a small palette. */
function level(n: V3) {
  const l = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  return l > 0.85 ? 1 : l > 0.6 ? 0.88 : l > 0.3 ? 0.76 : 0.64;
}

/** Draw textured triangles into a sprite just big enough for them: pixels, where it sits on the map, and its outline. */
export function renderSprite(tris: TexTri[]) {
  const S = (p: V3) => [p[0] * PX, (p[2] - p[1]) * PX, p[1] + p[2]];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tris) for (const p of t.p) { const [x, y] = S(p); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const x0 = Math.floor(minX) - 1, y0 = Math.floor(minY) - 1, w = Math.ceil(maxX) - x0 + 2, h = Math.ceil(maxY) - y0 + 2;
  const px = new Uint8Array(w * h * 4), depth = new Float32Array(w * h).fill(-Infinity), face = new Int32Array(w * h).fill(-1);
  for (const t of tris) {
    const [a, b, c] = t.p;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    n = n.map((k) => k / len) as V3;
    if (n[1] < 0 || (Math.abs(n[1]) < 1e-9 && n[2] < 0)) n = n.map((k) => -k) as V3;
    const lit = level(n);
    const P = t.p.map(S).map(([x, y, d]) => [x - x0, y - y0, d]);
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    const bx0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), bx1 = Math.min(w - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const by0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), by1 = Math.min(h - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    for (let Y = by0; Y <= by1; Y++) for (let X = bx0; X <= bx1; X++) {
      const cx = X + 0.5, cy = Y + 0.5;
      const w0 = ((P[1][0] - cx) * (P[2][1] - cy) - (P[2][0] - cx) * (P[1][1] - cy)) / area;
      const w1 = ((P[2][0] - cx) * (P[0][1] - cy) - (P[0][0] - cx) * (P[2][1] - cy)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const d = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2], i = Y * w + X;
      if (d <= depth[i] + (t.decal ? -0.03 : 1e-4)) continue;
      const tu = Math.floor(w0 * t.uv[0][0] + w1 * t.uv[1][0] + w2 * t.uv[2][0]), tv = Math.floor(w0 * t.uv[0][1] + w1 * t.uv[1][1] + w2 * t.uv[2][1]);
      const tx = t.decal ? tu : ((tu % t.tex.w) + t.tex.w) % t.tex.w, ty = t.decal ? tv : ((tv % t.tex.h) + t.tex.h) % t.tex.h;
      if (t.decal && (tx < 0 || ty < 0 || tx >= t.tex.w || ty >= t.tex.h)) continue;
      const col = t.tex.px[ty * t.tex.w + tx];
      if (!col) { if (t.decal) continue; }
      const c = col ?? [128, 128, 128];
      depth[i] = Math.max(depth[i], d); face[i] = t.face;
      px.set([Math.round(c[0] * lit), Math.round(c[1] * lit), Math.round(c[2] * lit), 255], i * 4);
    }
  }
  // a black outline around the silhouette, and a dark line where one face meets another
  const out = new Uint8Array(px);
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    const i = Y * w + X;
    if (face[i] < 0) {
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => face[(Y + dy) * w + X + dx] >= 0 && X + dx >= 0 && X + dx < w && Y + dy >= 0 && Y + dy < h)) out.set([16, 16, 20, 255], i * 4);
      continue;
    }
    const r = X + 1 < w ? face[i + 1] : face[i], b = Y + 1 < h ? face[i + w] : face[i];
    if ((r >= 0 && r !== face[i]) || (b >= 0 && b !== face[i])) for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(px[i * 4 + k] * 0.6);
  }
  return { x0, y0, w, h, px: out };
}
