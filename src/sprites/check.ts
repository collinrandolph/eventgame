// Missing-pixel check for assembled sprites.
//
// Two kinds of missing pixel:
//   gap         an empty pixel the outside can't reach: a hole inside the sprite (hair that lost its middle, a strand
//               that came away from the head)
//   no outline  a coloured pixel touching the outside with no outline between (an edge whose outline was clipped)
//
// Hand-drawn bases have some of both on purpose (the space between the legs, an open hand), so a recipe frame is
// compared with its bare base frame (the same pose with no layers): only problems the layers add are reported, and
// each is put down to the layer that painted next to it.

import type { Frames, Palette } from "./compose.js";

export type Kind = "gap" | "no outline";
export interface Problem { kind: Kind; x: number; y: number; layer: string }

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const isOutline = (pal: Palette, key: string) => (pal[key] ?? "").toLowerCase() === "#000000";

/** Every gap and outline-less edge pixel in one frame. */
export function missingPixels(rows: string[], pal: Palette): { kind: Kind; x: number; y: number }[] {
  const H = rows.length, W = rows[0]?.length ?? 0;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  // empty pixels the outside reaches
  const outside = new Set<string>(), stack: [number, number][] = [];
  for (let x = -1; x <= W; x++) stack.push([x, -1], [x, H]);
  for (let y = 0; y < H; y++) stack.push([-1, y], [W, y]);
  while (stack.length) {
    const [x, y] = stack.pop()!, k = `${x},${y}`;
    if (outside.has(k) || x < -1 || y < -1 || x > W || y > H) continue;
    if (inside(x, y) && rows[y][x] !== ".") continue;
    outside.add(k);
    for (const [dx, dy] of SIDES) stack.push([x + dx, y + dy]);
  }
  const out: { kind: Kind; x: number; y: number }[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = rows[y][x];
    if (c === ".") { if (!outside.has(`${x},${y}`)) out.push({ kind: "gap", x, y }); continue; }
    if (isOutline(pal, c)) continue;
    if (SIDES.some(([dx, dy]) => outside.has(`${x + dx},${y + dy}`))) out.push({ kind: "no outline", x, y });
  }
  return out;
}

/**
 * Problems an assembled frame has that its bare base frame doesn't, each put down to a layer: the one that painted
 * the pixel, or for a gap, the layer painted next to it.
 */
export function addedProblems(rows: string[], pal: Palette, painter: string[][], bare: string[], barePal: Palette): Problem[] {
  const had = new Set(missingPixels(bare, barePal).map((p) => `${p.kind}@${p.x},${p.y}`));
  const out: Problem[] = [];
  for (const p of missingPixels(rows, pal)) {
    if (had.has(`${p.kind}@${p.x},${p.y}`)) continue;
    let layer = painter[p.y]?.[p.x] ?? "";
    if (!layer) {
      for (let r = 1; r <= 2 && !layer; r++) for (let dy = -r; dy <= r && !layer; dy++) for (let dx = -r; dx <= r && !layer; dx++) layer = painter[p.y + dy]?.[p.x + dx] ?? "";
    }
    out.push({ ...p, layer: layer || "(base)" });
  }
  return out;
}

export interface FrameReport { sprite: string; anim: string; dir: string; frame: number; problems: Problem[] }

/** Compare every frame of an assembled sprite with the same frames of its bare base. */
export function checkFrames(sprite: string, anim: string, built: Frames, bare: Frames): FrameReport[] {
  const out: FrameReport[] = [];
  for (const [dir, list] of Object.entries(built.frames)) {
    list!.forEach((rows, i) => {
      const b = bare.frames[dir as keyof Frames["frames"]]?.[i];
      if (!b) return;
      const problems = addedProblems(rows, built.palette, built.painter[dir as keyof Frames["painter"]]![i], b, bare.palette);
      if (problems.length) out.push({ sprite, anim, dir, frame: anim === "walk" ? i : i + 1, problems });
    });
  }
  return out;
}
