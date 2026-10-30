// Generation-time validation for a world:
//   1. every ending is reachable from the start, in both modes, inside the deadline (with 2x margin)
//   2. every skill is a shortcut: each ending is still reachable with nobody having it
//   3. every life's planned path works from its start, obstacle and triggers included
//   4. every story event feeds something an ending depends on
//   5. random play never leaves a living character with a broken mission
// Usage: npm run check -- [world.json] [--paths] [--runs=N]

import { checkLifePlan, checkMilestones, checkStoryEvents, checkStructure, proveEnding, singleLifeReach, skillsInUse, withoutSkill } from "../lifecheck.js";
import { findMissionBreaks } from "../missions.js";
import { solve } from "../solver.js";
import type { Mode } from "../types.js";
import { type World, initialState, loadWorld } from "../world.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "worlds/ash-river.json";
const showPaths = args.includes("--paths");
const runs = Number(args.find((a) => a.startsWith("--runs="))?.slice(7) ?? 30);
const w: World = loadWorld(file);
let failures = 0;
const ms = (t0: number) => `${Math.round(performance.now() - t0)}ms`;

console.log(`World: ${w.def.name}`);
if (w.spatial) {
  const sp = w.spatial;
  const live = sp.zones.filter((z) => !z.folded);
  console.log(`Grid: ${sp.cellMeters} m cells · ${sp.zones.length} zones (${live.length} solver locations) · ${sp.links.length} links`);
  for (const warn of sp.warnings) console.log(`  WARN  ${warn}`);
}
console.log(`Rules: ${w.def.rules.length} · triggers: ${w.def.triggers.length} · lives: ${w.def.people.filter((p) => p.life).length}`);

/** Compose lives first (fast, mirrors play); fall back to the general search. */
function prove(world: World, mode: Mode, ending: string) {
  const c = proveEnding(world, mode, ending);
  if (c.status === "reachable") return { status: c.status, ticks: c.ticks, path: c.path, by: world.people.get(c.finisher!)!.name };
  const r = solve(world, initialState(world, mode), { ending, maxNodes: 30_000 });
  return { status: r.status, ticks: r.ticks, path: r.path ?? [], by: "search" };
}

// 0. Story structure: every ending hard-gated by at least three milestones
if (w.def.milestones?.length) {
  console.log("\nStory milestones (hard gates proven by removing every producer)");
  const ms = checkMilestones(w);
  for (const p of ms.producers) console.log(`  tier ${p.tier}  ${p.milestone.padEnd(16)} ${p.by.length} way${p.by.length === 1 ? " " : "s"}: ${p.by.join("; ")}`);
  for (const r of ms.requires) {
    if (!r.proven) failures++;
    console.log(`  ${r.proven ? "PASS" : "FAIL"}  ${r.milestone} needs ${r.needs}`);
  }
  for (const e of ms.endings) {
    const ok = e.gates.length >= 3;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${e.name.padEnd(12)} gated by ${e.gates.length}: ${e.gates.join(", ")}`);
  }
  console.log("\nGeneration rules");
  for (const r of checkStructure(w)) {
    if (!r.ok) failures++;
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.detail ? `  (${r.detail})` : ""}`);
  }
  for (const p of w.def.people.filter((x) => x.playable)) {
    const reach = singleLifeReach(w, p.id);
    if (reach.length > 2) failures++;
    console.log(`  ${reach.length > 2 ? "FAIL" : "PASS"}  ${p.name}: one life reaches ${reach.length} milestone(s)${reach.length ? `  (${reach.join(", ")})` : ""}`);
  }
}

// 1. Endings
let slowest = 0;
for (const mode of ["timed", "untimed"] as Mode[]) {
  console.log(`\nEndings (${mode})`);
  for (const end of w.def.endings) {
    const t0 = performance.now();
    const r = prove(w, mode, end.id);
    const ok = r.status === "reachable";
    if (!ok) failures++;
    if (ok) slowest = Math.max(slowest, r.ticks!);
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${end.name.padEnd(12)} ${ok ? `in ${r.ticks} ticks, ${r.path!.length} steps, finished by ${r.by}` : r.status}  (${ms(t0)})`);
    if (ok && showPaths) for (const p of r.path!) console.log(`          ${p}`);
  }
}
if (w.def.deadline !== undefined) {
  const ok = w.def.deadline >= 2 * slowest;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  deadline ${w.def.deadline} ticks vs slowest proven ending ${slowest} (needs at least 2x: ${2 * slowest})`);
}

// 2. Skills are shortcuts
console.log("\nSkills are shortcuts (timed, nobody has the skill)");
for (const skill of skillsInUse(w)) {
  const ww = withoutSkill(w, skill);
  for (const end of w.def.endings) {
    const t0 = performance.now();
    const r = prove(ww, "timed", end.id);
    const ok = r.status === "reachable";
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  without ${skill.padEnd(12)} ${end.name.padEnd(12)} ${ok ? `in ${r.ticks} ticks, finished by ${r.by}` : r.status}  (${ms(t0)})`);
  }
}

// 3. Life plans
console.log("\nLife plans (each life played first, timed)");
for (const p of w.def.people.filter((x) => x.life)) {
  const t0 = performance.now();
  const rep = checkLifePlan(w, "timed", p.id);
  if (!rep.ok) failures++;
  const total = rep.steps.reduce((s, x) => s + (x.ticks ?? 0), 0);
  console.log(`  ${rep.ok ? "PASS" : "FAIL"}  ${rep.name.padEnd(20)} ${rep.ok ? `${total} ticks` : ""}  (${ms(t0)})`);
  for (const st of rep.steps) {
    const mark = st.status === "done" ? "✓" : st.status === "already" ? "·" : "✗";
    console.log(`          ${mark} ${st.text}${st.ticks !== undefined ? `  (${st.ticks} ticks)` : st.status === "already" ? "  (already true)" : ""}`);
  }
}

// 4. Story events
console.log("\nStory events");
const storyErrors = checkStoryEvents(w);
failures += storyErrors.length;
for (const p of w.def.people.filter((x) => x.life)) {
  const story = p.life!.subobjectives.find((s) => s.story)!;
  const bad = storyErrors.find((e) => e.startsWith(`${p.name}:`));
  console.log(`  ${bad ? "FAIL" : "PASS"}  ${p.name.padEnd(20)} ${story.feeds!.padEnd(22)} ${bad ? bad.slice(p.name.length + 2) : story.text}`);
}

// 5. Mission breaks
for (const mode of ["timed", "untimed"] as Mode[]) {
  console.log(`\nMission-break search (${mode}, ${runs} random runs)`);
  const t0 = performance.now();
  const breaks = findMissionBreaks(w, { mode, runs, maxSteps: 150 });
  const bugs = breaks.filter((b) => b.status === "broken");
  failures += bugs.length;
  if (!breaks.length) console.log(`  PASS  no mission can break while its character lives  (${ms(t0)})`);
  for (const b of breaks) {
    console.log(`  ${b.status === "broken" ? "BUG " : "info"}  seed ${b.seed}: ${b.who}'s "${b.mission}" ${b.status === "broken" ? "can no longer be completed" : "could not be verified (budget)"}`);
    for (const t of b.trace.slice(-8)) console.log(`          ${t}`);
  }
}

console.log(failures ? `\n${failures} required check(s) failed.` : "\nAll required checks passed.");
process.exit(failures ? 1 : 0);
