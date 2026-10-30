// Validators for lives and systems:
// - every life's planned path (its subobjectives, in order, then the objective
//   and destination) works from its starting point, obstacle and triggers included
// - every story event feeds something the endings depend on
// - every skill is a shortcut, never a requirement (each ending is reachable with nobody having it)

import { evalCond } from "./engine.js";
import { assignLife, prepareNextLife } from "./lives.js";
import { relaxedCondReachable, relaxedCondReachableByActor, relaxedReachable, relaxedReachableByActor } from "./relaxed.js";
import { solve } from "./solver.js";
import { goalTargets } from "./targets.js";
import type { Mode, State, WorldDef } from "./types.js";
import { SKILLS } from "./types.js";
import { type World, compile, initialState, lifeOf, nameOf } from "./world.js";

export interface PlanStep {
  sub: string;
  text: string;
  status: "done" | "already" | "failed";
  ticks?: number;
  steps?: number;
}

export interface PlanReport {
  person: string;
  name: string;
  ok: boolean;
  steps: PlanStep[];
}

/** Where a life's mission points: its objective's targets, then its destination. */
export function missionTargets(w: World, s: State, pid: string): string[] {
  const m = s.missions.find((x) => x.owner === pid && x.status === "active");
  if (!m) return [];
  const life = lifeOf(w, m);
  const done = evalCond(w, s, life.objective.done, { self: pid, bind: {} });
  if (done && life.destination) return [life.destination.at];
  return goalTargets(w, s, life.objective.done, pid);
}

/** Start this person's life first, in a fresh world. */
export function startLife(w: World, mode: Mode, pid: string): State {
  return assignLife(w, prepareNextLife(w, initialState(w, mode)).state, pid).state;
}

export function checkLifePlan(w: World, mode: Mode, pid: string, maxNodes = 20_000): PlanReport {
  const life = w.people.get(pid)!.life!;
  let s = startLife(w, mode, pid);
  const steps: PlanStep[] = [];
  const ctx = { self: pid, bind: {} };
  const targets = [
    ...life.subobjectives.map((sub) => ({ sub: sub.id, text: sub.text, done: (x: State) => evalCond(w, x, sub.done, ctx), targets: (x: State) => goalTargets(w, x, sub.done, pid) })),
    {
      sub: "objective",
      text: `${life.objective.text}${life.destination ? `, then ${life.destination.text.toLowerCase()}` : ""}`,
      done: (x: State) => x.missions.some((m) => m.owner === pid && m.status === "complete"),
      targets: (x: State) => missionTargets(w, x, pid),
    },
  ];
  for (const t of targets) {
    if (t.done(s)) {
      steps.push({ sub: t.sub, text: t.text, status: "already" });
      continue;
    }
    if (!s.actor) {
      steps.push({ sub: t.sub, text: t.text, status: "failed" });
      return { person: pid, name: nameOf(w, pid), ok: false, steps };
    }
    const start = s.tick;
    const r = solve(w, s, { withinLife: true, goal: t.done, targets: t.targets(s), maxNodes });
    if (r.status !== "reachable" || !r.state) {
      steps.push({ sub: t.sub, text: t.text, status: "failed" });
      return { person: pid, name: nameOf(w, pid), ok: false, steps };
    }
    steps.push({ sub: t.sub, text: t.text, status: "done", ticks: r.state.tick - start, steps: r.path!.length });
    s = r.state;
  }
  return { person: pid, name: nameOf(w, pid), ok: true, steps };
}

export interface EndingProof {
  status: "reachable" | "unknown";
  /** Lives in the order played, with what each did. */
  path: string[];
  ticks?: number;
  /** The life that finished the ending. */
  finisher?: string;
  /** Where the composition ended (the stuck state when unknown). */
  state?: State;
}

/**
 * Prove an ending by composing lives: play lives in order and, at the start of
 * each, try to reach the ending within that life. Otherwise the life follows
 * its planned path (or, if that fails, ends some other legal way) and the next
 * one starts. This mirrors how the game is built: story events from earlier
 * lives open the way, and some later life finishes it. The witness is a real,
 * legal playthrough.
 */
export function proveEnding(w: World, mode: Mode, ending: string, order?: string[], maxNodes = 8_000): EndingProof {
  const lives = order ?? w.def.people.filter((p) => p.playable).map((p) => p.id);
  let s = initialState(w, mode);
  const path: string[] = [];
  const reached = (x: State) => x.ended?.kind === "ending" && x.ended.ending === ending;
  for (const pid of lives) {
    if (s.ended || !s.people[pid].alive || s.played.includes(pid)) continue;
    s = assignLife(w, prepareNextLife(w, s).state, pid).state;
    path.push(`[life ${s.lives}: ${nameOf(w, pid)}]`);
    // 1. Can this life finish the ending?
    const endCond = w.def.endings.find((e) => e.id === ending)!.when;
    const finish = relaxedReachableByActor(w, s, ending) ? solve(w, s, { withinLife: true, goal: reached, targets: goalTargets(w, s, endCond, pid), maxNodes: maxNodes * 4 }) : { status: "unreachable" as const };
    if (finish.status === "reachable" && "path" in finish) return { status: "reachable", path: [...path, ...finish.path!], ticks: finish.state!.tick, finisher: pid };
    // 2. Otherwise follow its planned path (its story event is what moves the world on)...
    const life = w.people.get(pid)!.life;
    const ctx = { self: pid, bind: {} };
    for (const sub of life?.subobjectives ?? []) {
      if (!s.actor || evalCond(w, s, sub.done, ctx)) continue;
      const r = solve(w, s, { withinLife: true, goal: (x) => !x.ended && evalCond(w, x, sub.done, ctx), targets: goalTargets(w, s, sub.done, pid), maxNodes });
      if (r.status !== "reachable") break;
      path.push(...r.path!);
      s = r.state!;
    }
    // 3. ...and end the life: its mission if possible, any legal end otherwise.
    if (s.actor) {
      // Never end the run on the way: another ending here would rule out the one being proved.
      const mission = (x: State) => !x.ended && x.missions.some((m) => m.owner === pid && m.status === "complete");
      const done = solve(w, s, { withinLife: true, goal: mission, targets: missionTargets(w, s, pid), maxNodes });
      const threats = Object.keys(s.things).filter((id) => w.things.get(id)?.kind === "threat" && s.things[id].props.active && s.things[id].location);
      const end = done.status === "reachable" ? done : solve(w, s, { withinLife: true, goal: (x) => !x.ended && !x.actor, targets: threats.map((id) => s.things[id].location!), maxNodes });
      if (end.status !== "reachable") return { status: "unknown", path, state: s };
      path.push(...end.path!);
      s = end.state!;
    }
    if (reached(s)) return { status: "reachable", path, ticks: s.tick, finisher: pid };
  }
  return { status: "unknown", path };
}

/** What the endings can depend on, by kind: clues, circuits, barriers, things, facts. */
function endingInputs(w: World): Record<string, Set<string>> {
  const inputs: Record<string, Set<string>> = { clue: new Set(), power: new Set(), open: new Set(), item: new Set(), fact: new Set(), milestone: new Set((w.def.milestones ?? []).map((m) => m.id)) };
  for (const d of w.def.deductions ?? []) {
    for (const n of d.needs) inputs.clue.add(n);
    inputs.clue.add(d.yields);
  }
  for (const t of w.def.things) {
    const p = t.props ?? {};
    for (const k of ["needsClue", "weakness", "keypad", "yieldsClue"]) if (typeof p[k] === "string") inputs.clue.add(p[k] as string);
    if (typeof p.circuit === "string") inputs.power.add(p.circuit);
    if (t.kind === "barrier") inputs.open.add(t.id);
    if (t.kind !== "barrier") inputs.item.add(t.id);
    for (const k of ["yieldsFact", "yieldsOnBanish"]) if (typeof p[k] === "string") inputs.fact.add(p[k] as string);
  }
  const scan = (x: unknown): void => {
    if (x && typeof x === "object" && !Array.isArray(x) && "fact" in x && typeof (x as { fact: unknown }).fact === "string") inputs.fact.add((x as { fact: string }).fact);
    if (Array.isArray(x)) x.forEach(scan);
    else if (x && typeof x === "object") Object.values(x).forEach(scan);
  };
  scan(w.def.endings);
  return inputs;
}

/** Each life has one story event, and what it feeds is something the endings use. */
export function checkStoryEvents(w: World): string[] {
  const errors: string[] = [];
  const inputs = endingInputs(w);
  for (const p of w.def.people) {
    if (!p.life) continue;
    const story = p.life.subobjectives.find((s) => s.story);
    if (!story?.feeds) continue; // compile() already rejects lives without one
    const [kind, token] = story.feeds.split(":");
    if (!inputs[kind]) errors.push(`${p.name}: story event "${story.text}" feeds unknown kind "${kind}"`);
    else if (!inputs[kind].has(token)) errors.push(`${p.name}: story event "${story.text}" feeds ${story.feeds}, which no ending depends on`);
  }
  return errors;
}

/** The world with nobody holding this skill (items that teach it still work). */
export function withoutSkill(w: World, skill: string): World {
  const def: WorldDef = structuredClone(w.def);
  for (const p of def.people) p.abilities = (p.abilities ?? []).filter((a) => a !== skill);
  return { ...compile(def), spatial: w.spatial };
}

export function skillsInUse(w: World): string[] {
  return SKILLS.filter((sk) => w.def.people.some((p) => p.abilities?.includes(sk)));
}

// ---------- milestones: tiered hard gates ----------

/** The world with nothing able to produce this fact (no rule, trigger or machine sets it). */
function withoutProducers(w: World, fact: string): World {
  const def: WorldDef = structuredClone(w.def);
  const keep = (e: { fact?: string }) => e.fact !== fact;
  for (const r of def.rules) r.effects = r.effects.filter((e) => keep(e as { fact?: string }));
  for (const t of def.triggers) t.effects = t.effects.filter((e) => keep(e as { fact?: string }));
  for (const t of def.things) for (const k of ["yieldsFact", "yieldsOnBanish"]) if (t.props?.[k] === fact) delete t.props[k];
  return { ...compile(def), spatial: w.spatial };
}

/** Distinct things that can produce a fact: rules, triggers, machines. */
export function producersOf(w: World, fact: string): string[] {
  const out: string[] = [];
  for (const r of w.def.rules) if (r.effects.some((e) => (e as { fact?: string }).fact === fact)) out.push(`rule ${r.id}`);
  for (const t of w.def.triggers) if (t.effects.some((e) => (e as { fact?: string }).fact === fact)) out.push(`trigger ${t.id}`);
  for (const t of w.def.things) if (t.props?.yieldsFact === fact || t.props?.yieldsOnBanish === fact) out.push(t.name);
  return out;
}

export interface MilestoneReport {
  endings: { id: string; name: string; gates: string[] }[];
  requires: { milestone: string; needs: string; proven: boolean }[];
  producers: { milestone: string; tier: number; by: string[] }[];
}

/**
 * Proves the story structure: for each ending, which milestones are hard gates
 * (with nothing able to produce the milestone, the relaxed check proves the
 * ending impossible), and whether each declared "requires" really holds.
 */
export function checkMilestones(w: World): MilestoneReport {
  const ms = w.def.milestones ?? [];
  const s0 = initialState(w, "timed");
  const cut = new Map(ms.map((m) => [m.id, withoutProducers(w, m.id)]));
  const endings = w.def.endings.map((e) => ({
    id: e.id,
    name: e.name,
    gates: ms.filter((m) => !relaxedReachable(cut.get(m.id)!, initialState(cut.get(m.id)!, "timed"), e.id)).map((m) => m.id),
  }));
  const requires = ms.flatMap((m) =>
    (m.requires ?? []).map((needs) => {
      const ww = cut.get(needs)!;
      return { milestone: m.id, needs, proven: !relaxedCondReachable(ww, initialState(ww, "timed"), { fact: m.id }) };
    }),
  );
  void s0;
  const producers = ms.map((m) => ({ milestone: m.id, tier: m.tier, by: producersOf(w, m.id) }));
  return { endings, requires, producers };
}
// ---------- generation rules: structure, reach, optional destinations ----------

export interface RuleCheck {
  ok: boolean;
  label: string;
  detail: string;
}

/** Lives whose story event produces each milestone. */
function storyLives(w: World): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of w.def.people) {
    const f = p.life?.subobjectives.find((s) => s.story)?.feeds;
    if (f?.startsWith("milestone:")) {
      const m = f.slice(10);
      out.set(m, [...(out.get(m) ?? []), p.id]);
    }
  }
  return out;
}

/** How many milestones this life could produce on its own, played first (relaxed, then confirmed exactly). */
export function singleLifeReach(w: World, pid: string): string[] {
  const s = startLife(w, "timed", pid);
  const out: string[] = [];
  for (const m of w.def.milestones ?? []) {
    const cond = { fact: m.id };
    if (!relaxedCondReachableByActor(w, s, cond)) continue;
    const r = solve(w, s, { withinLife: true, goal: (x) => !!x.facts[m.id], targets: goalTargets(w, s, cond, pid), maxNodes: 3_000 });
    if (r.status === "reachable") out.push(m.id);
  }
  return out;
}

/** The generation rules, checked against a world. */
export function checkStructure(w: World): RuleCheck[] {
  const checks: RuleCheck[] = [];
  const add = (ok: boolean, label: string, detail: string) => checks.push({ ok, label, detail });
  const ms = new Map((w.def.milestones ?? []).map((m) => [m.id, m]));
  const report = checkMilestones(w);
  const gates = new Map(report.endings.map((e) => [e.id, new Set(e.gates)]));
  const lives = storyLives(w);
  const E = w.def.endings.length;

  // Every life's story event produces a main milestone.
  for (const p of w.def.people.filter((x) => x.life)) {
    const f = p.life!.subobjectives.find((s) => s.story)?.feeds ?? "";
    add(f.startsWith("milestone:") && ms.has(f.slice(10)), `${p.name}: story event produces a milestone`, f);
  }
  // Tier 1 -> tier 2 -> ending.
  for (const m of ms.values()) {
    if (m.tier !== 2) continue;
    const req = m.requires ?? [];
    const ok = req.length >= 1 && req.length <= 2 && req.every((r) => ms.get(r)?.tier === 1) && req.every((r) => report.requires.find((x) => x.milestone === m.id && x.needs === r)?.proven);
    add(ok, `${m.id} needs 1-2 tier-1 milestones (proven)`, req.join(", ") || "none");
  }
  for (const e of w.def.endings) {
    const t2 = e.milestones ?? [];
    const proven = t2.filter((m) => gates.get(e.id)?.has(m));
    add(t2.length === 3 && t2.every((m) => ms.get(m)?.tier === 2) && proven.length === 3, `${e.name}: exactly 3 tier-2 gates, all proven`, `${proven.length}/3 proven: ${t2.join(", ")}`);
    const people = new Set<string>();
    for (const m of t2) for (const id of [m, ...(ms.get(m)?.requires ?? [])]) for (const l of lives.get(id) ?? []) people.add(l);
    add(people.size >= 5, `${e.name}: needs at least 5 different lives`, `${people.size} lives`);
  }
  // Sharing: a tier-2 milestone in at most 2 endings; any two endings share at most 1; each keeps one of its own.
  const owners = new Map<string, string[]>();
  for (const e of w.def.endings) for (const m of e.milestones ?? []) owners.set(m, [...(owners.get(m) ?? []), e.id]);
  add([...owners.values()].every((o) => o.length <= 2), "tier-2 milestones shared by at most 2 endings", [...owners].filter(([, o]) => o.length > 1).map(([m, o]) => `${m}: ${o.join("+")}`).join("; ") || "none shared");
  for (let i = 0; i < E; i++) for (let j = i + 1; j < E; j++) {
    const a = w.def.endings[i], b = w.def.endings[j];
    const shared = (a.milestones ?? []).filter((m) => (b.milestones ?? []).includes(m));
    add(shared.length <= 1, `${a.name} and ${b.name} share at most one`, shared.join(", ") || "none");
  }
  for (const e of w.def.endings) add((e.milestones ?? []).some((m) => owners.get(m)!.length === 1), `${e.name} keeps a tier-2 milestone of its own`, "");
  // Optional destinations: 1 bonus, 2 secrets per ending, 1 encounter per ending; each gated by 2+ milestones from different lives.
  const opts = w.def.optionals ?? [];
  add(opts.filter((o) => o.kind === "bonus").length === 1, "exactly 1 bonus", `${opts.filter((o) => o.kind === "bonus").length}`);
  for (const e of w.def.endings) add(opts.filter((o) => o.kind === "secret" && o.ending === e.id).length === 2, `${e.name}: 2 secrets`, "");
  add(opts.filter((o) => o.kind === "encounter").length === E, `${E} encounters`, `${opts.filter((o) => o.kind === "encounter").length}`);
  const s0 = initialState(w, "timed");
  for (const o of opts) {
    const fx = w.things.get(o.fixture);
    const need = String(fx?.props?.needsFact ?? "").split("|").filter(Boolean);
    const fromLives = new Set(need.flatMap((m) => lives.get(m) ?? []));
    const reachable = relaxedCondReachable(w, s0, { fact: `found.${o.id}` });
    const real = need.every((m) => { const cut = withoutProducers(w, m); return !relaxedCondReachable(cut, initialState(cut, "timed"), { fact: `found.${o.id}` }); });
    add(need.length >= 2 && fromLives.size >= 2 && reachable && real, `${o.kind} "${o.name}": reachable, gated by 2+ milestones from different lives`, need.join(" + "));
  }
  return checks;
}