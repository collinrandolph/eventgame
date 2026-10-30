// World validation.
//
//   npm run check -- [world.json]        quick: structure, relaxed gates, witness replay, static skill check
//   npm run check:full -- [world.json]   full: everything re-proved by search, skill proofs, mission-break search
//
// Proven routes are saved to <world>.witness.json. The quick check replays them
// (each action re-checked for legality) and only searches again when a replay
// breaks, so day-to-day checks take seconds instead of tens of minutes.
// Options: --paths (print routes), --runs=N (mission-break runs, full only)

import {
  checkLifePlan,
  checkMilestones,
  checkStoryEvents,
  checkStructure,
  proveEnding,
  singleLifeReach,
  skillGaps,
  skillsInUse,
  withoutSkill,
} from "../lifecheck.js";
import { findMissionBreaks } from "../missions.js";
import { solve } from "../solver.js";
import type { Mode, State } from "../types.js";
import { loadWitnesses, replay, saveWitnesses, worldHash } from "../witness.js";
import { type World, initialState, loadWorld } from "../world.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "worlds/ash-river.json";
const full = args.includes("--full");
const showPaths = args.includes("--paths");
const runs = Number(args.find((a) => a.startsWith("--runs="))?.slice(7) ?? 15);
const w: World = loadWorld(file);
const lock = loadWitnesses(file, w);
let lockChanged = false;
let failures = 0;
const t = (t0: number) => `${Math.round(performance.now() - t0)}ms`;
const start = performance.now();
const section = (name: string) => console.log(`\n${name}  [at ${Math.round((performance.now() - start) / 1000)}s]`);
const line = (ok: boolean, text: string) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${text}`);
};

console.log(`World: ${w.def.name}  (${full ? "full check" : "quick check"})`);
if (w.spatial) {
  const sp = w.spatial;
  console.log(`Grid: ${sp.cellMeters} m cells · ${sp.zones.length} zones (${sp.zones.filter((z) => !z.folded).length} solver locations) · ${sp.links.length} links`);
  for (const warn of sp.warnings) console.log(`  WARN  ${warn}`);
}

// ---------- story structure and generation rules (fast: relaxed proofs) ----------
if (w.def.milestones?.length) {
  section("Story milestones");
  const ms = checkMilestones(w);
  for (const r of ms.requires) line(r.proven, `${r.milestone} needs ${r.needs}`);
  for (const e of ms.endings) line(e.gates.length >= 3, `${e.name} gated by ${e.gates.length}: ${e.gates.join(", ")}`);
  section("Generation rules");
  for (const r of checkStructure(w)) line(r.ok, `${r.label}${r.detail ? `  (${r.detail})` : ""}`);
  // Cached against the world's hash: it only changes when the world or its rules do.
  const hash = worldHash(file);
  const cached = !full && lock.reach?.hash === hash ? lock.reach.lives : null;
  section(`Single-life reach${cached ? " (cached, world unchanged)" : ""}`);
  const lives: Record<string, string[]> = {};
  for (const p of w.def.people.filter((x) => x.playable)) {
    const reach = (lives[p.id] = cached?.[p.id] ?? singleLifeReach(w, p.id));
    line(reach.length <= 2, `${p.name}: one life reaches ${reach.length} milestone(s)${reach.length ? `  (${reach.join(", ")})` : ""}`);
  }
  if (!cached) {
    lock.reach = { hash, lives };
    lockChanged = true;
  }
}

// ---------- endings: replay the witness, re-prove only if it broke ----------
const reachedEnding = (s: State, id: string) => s.ended?.kind === "ending" && s.ended.ending === id;
function prove(world: World, mode: Mode, ending: string) {
  const c = proveEnding(world, mode, ending);
  if (c.status === "reachable") return { ok: true, ticks: c.ticks, steps: c.steps, by: world.people.get(c.finisher!)!.name, path: c.path };
  const r = solve(world, initialState(world, mode), { ending, maxNodes: 30_000 });
  return { ok: r.status === "reachable", ticks: r.ticks, steps: r.steps, by: "search", path: r.path ?? [] };
}

let slowest = 0;
for (const mode of ["timed", "untimed"] as Mode[]) {
  section(`Endings (${mode})`);
  for (const end of w.def.endings) {
    const t0 = performance.now();
    const key = `ending:${mode}:${end.id}`;
    const stored = lock.entries[key];
    const rep = !full && stored ? replay(w, mode, stored) : null;
    if (rep?.ok && reachedEnding(rep.state, end.id)) {
      slowest = Math.max(slowest, rep.state.tick);
      line(true, `${end.name.padEnd(12)} in ${rep.state.tick} ticks (replayed witness, ${t(t0)})`);
      continue;
    }
    const r = prove(w, mode, end.id);
    if (r.ok) {
      slowest = Math.max(slowest, r.ticks!);
      lock.entries[key] = r.steps!;
      lockChanged = true;
    }
    const why = rep ? `witness broke at step ${rep.failedAt}: ${rep.reason ?? "ending not reached"}; ` : "";
    line(r.ok, `${end.name.padEnd(12)} ${r.ok ? `in ${r.ticks} ticks, finished by ${r.by}` : "unreachable"} (${why}searched, ${t(t0)})`);
    if (r.ok && showPaths) for (const p of r.path) console.log(`          ${p}`);
  }
}
if (w.def.deadline !== undefined) line(w.def.deadline >= 2 * slowest, `deadline ${w.def.deadline} ticks vs slowest proven ending ${slowest} (needs ${2 * slowest})`);

// ---------- skills are shortcuts ----------
section("Skills are shortcuts");
for (const g of skillGaps(w)) {
  line(!g.endings.length && !g.milestones.length, `without ${g.skill}: ${g.endings.length || g.milestones.length ? `impossible: ${[...g.endings, ...g.milestones].join(", ")}` : "every ending and milestone still possible"}`);
}
if (full) {
  for (const skill of skillsInUse(w)) {
    const ww = withoutSkill(w, skill);
    for (const end of w.def.endings) {
      const t0 = performance.now();
      const r = prove(ww, "timed", end.id);
      line(r.ok, `without ${skill.padEnd(12)} ${end.name.padEnd(12)} ${r.ok ? `in ${r.ticks} ticks` : "unreachable"} (${t(t0)})`);
    }
  }
}

// ---------- life plans: replay, re-plan only if it broke ----------
section("Life plans");
for (const p of w.def.people.filter((x) => x.life)) {
  const t0 = performance.now();
  const key = `plan:${p.id}`;
  const stored = lock.entries[key];
  const rep = !full && stored ? replay(w, "timed", stored) : null;
  if (rep?.ok && rep.state.missions.some((m) => m.owner === p.id && m.status === "complete")) {
    line(true, `${p.name.padEnd(20)} (replayed witness, ${t(t0)})`);
    continue;
  }
  const r = checkLifePlan(w, "timed", p.id);
  if (r.ok && r.witness) {
    lock.entries[key] = r.witness;
    lockChanged = true;
  }
  line(r.ok, `${p.name.padEnd(20)} ${r.ok ? "" : r.steps.filter((s) => s.status === "failed").map((s) => `failed: ${s.text}`).join("; ")} (planned, ${t(t0)})`);
}

// ---------- story events ----------
section("Story events");
const storyErrors = checkStoryEvents(w);
for (const e of storyErrors) line(false, e);
if (!storyErrors.length) line(true, "every story event feeds something an ending depends on");

// ---------- mission-break search (full only) ----------
if (full) {
  for (const mode of ["timed", "untimed"] as Mode[]) {
    console.log(`\nMission-break search (${mode}, ${runs} random runs)`);
    const t0 = performance.now();
    const breaks = findMissionBreaks(w, { mode, runs, maxSteps: 150 });
    const bugs = breaks.filter((b) => b.status === "broken");
    if (!bugs.length) line(true, `no mission can break while its character lives (${t(t0)})`);
    for (const b of bugs) {
      line(false, `seed ${b.seed}: ${b.who}'s "${b.mission}" can no longer be completed`);
      for (const s of b.trace.slice(-6)) console.log(`          ${s}`);
    }
  }
}

if (lockChanged) {
  saveWitnesses(file, lock);
  console.log(`\nSaved witnesses to ${file.replace(/\.json$/, ".witness.json")}`);
}
section("Done");
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
