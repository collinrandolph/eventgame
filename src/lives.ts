// Life handoffs: who is left to play, weighted random selection, and starting
// a life (its mission, its spawned obstacles, its character knowledge).

import { applyEffect, checkEnding, evalCond } from "./engine.js";
import type { GoalTemplate, Mission, State } from "./types.js";
import { type World, lifeOf, nameOf } from "./world.js";

/** Alive, playable, never played. Everyone played is out: their life ended in death or a completed goal. */
export function pool(w: World, s: State): string[] {
  return w.def.people
    .filter((p) => p.playable && s.people[p.id].alive && !s.played.includes(p.id))
    .map((p) => p.id);
}

/** Start the next life: advance the life counter; end the run if nobody is left. Call before choosing who. */
export function prepareNextLife(w: World, state: State): { state: State; log: string[] } {
  const s = structuredClone(state);
  const log: string[] = [];
  s.lives += 1;
  checkEnding(w, s, log);
  if (!s.ended && pool(w, s).length === 0) {
    s.ended = { kind: "exhausted" };
    log.push("== There is no one left. ==");
  }
  return { state: s, log };
}

/** The person's own life if it applies (its `when` holds and its objective isn't already done), else a fallback. */
function pickMission(w: World, s: State, pid: string): Omit<Mission, "status" | "subs"> {
  const ctx = { self: pid, bind: {} };
  const life = w.people.get(pid)!.life;
  if (life && (!life.when || evalCond(w, s, life.when, ctx)) && !evalCond(w, s, life.objective.done, ctx)) {
    return { owner: pid, src: "life", index: 0 };
  }
  const usable = (g: GoalTemplate) => (!g.when || evalCond(w, s, g.when, ctx)) && !evalCond(w, s, g.done, ctx);
  return { owner: pid, src: "fallback", index: Math.max(0, w.def.fallbackGoals.findIndex(usable)) };
}

export function assignLife(w: World, state: State, pid: string): { state: State; log: string[] } {
  const s = structuredClone(state);
  const log: string[] = [];
  const def = w.people.get(pid)!;
  s.actor = pid;
  s.played.push(pid);
  s.history.push([def.category ?? "ordinary", def.narrative ?? "none"]);
  s.people[pid].from = null;
  const mission: Mission = { ...pickMission(w, s, pid), status: "active", subs: [] };
  s.missions.push(mission);
  const life = lifeOf(w, mission);
  log.push(`>> Life ${s.lives}: you are ${def.name}${def.role ? `, ${def.role}` : ""}, at ${nameOf(w, s.people[pid].location)}.`);
  log.push(`   Objective: ${life.objective.text}${life.destination ? ` · then: ${life.destination.text}` : ""}`);
  for (const k of def.knows ?? []) {
    if (!s.knowledge.includes(k)) {
      s.knowledge.push(k);
      log.push(`   (${def.name} knows: ${k})`);
    }
  }
  // Obstacles that arrive with this life.
  if (mission.src === "life") for (const e of life.spawn ?? []) applyEffect(w, s, e, { self: pid, bind: {} }, log);
  return { state: s, log };
}

// ---------- Weighted random selection ----------

/** Seeded PRNG (mulberry32) so runs are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Penalty multipliers for matching the last life, and the one before it. */
const RECENCY = [0.15, 0.5];

export function weightFor(w: World, s: State, pid: string): number {
  const p = w.people.get(pid)!;
  const tags = [p.category ?? "ordinary", p.narrative ?? "none"];
  let weight = 1;
  for (let i = 0; i < RECENCY.length; i++) {
    const past = s.history[s.history.length - 1 - i];
    if (!past) break;
    if (past[0] === tags[0]) weight *= RECENCY[i];
    if (past[1] === tags[1]) weight *= RECENCY[i];
  }
  return weight;
}

export function pickNext(w: World, s: State, random: () => number): string {
  const ids = pool(w, s);
  if (!ids.length) throw new Error("pool is empty");
  const weights = ids.map((id) => weightFor(w, s, id));
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}
