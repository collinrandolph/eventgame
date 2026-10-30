// Omniscient solver: searches the full rule set (not just the planned paths)
// for any sequence of actions and life orderings that reaches an ending.
//
// - Life order: the game picks lives randomly, but the solver branches over
//   every possible next person. "Reachable" means some ordering works, so the
//   hopeless check never fires while a lucky draw could still win.
// - Search is best-first: ticks spent minus a progress bonus. State keys leave
//   out the tick and a state is only revisited if reached earlier, which treats
//   "earlier is never worse" (true while scheduled events only make things harder).
// - solverAuto rules (picking things up) are applied automatically, not branched on.
// - Out of budget -> "unknown", which callers must treat as still possible.

import { createHash } from "node:crypto";
import { activeThreatAt, describe, listActions, passable, step, stepMut } from "./engine.js";
import { assignLife, pool, prepareNextLife } from "./lives.js";
import { distances } from "./nav.js";
import { relaxedMissionReachable, relaxedReachable } from "./relaxed.js";
import type { State } from "./types.js";
import { type World, nameOf } from "./world.js";

export interface SolveOpts {
  /** Only count this ending as success. Default: any ending. */
  ending?: string;
  maxNodes?: number;
  /**
   * Search only the current life: success is completing the current actor's
   * mission (or any ending); the life ending any other way is a dead end.
   */
  withinLife?: boolean;
  /** Custom success test (used to walk a life's planned path one subobjective at a time). */
  goal?: (s: State) => boolean;
  /**
   * Locations the goal points at (see goalTargets). When given, the search leads with A*
   * on travel time to the nearest of them, which keeps a life from wandering the city.
   */
  targets?: string[];
}

export interface SolveResult {
  status: "reachable" | "unreachable" | "unknown";
  ending?: string;
  path?: string[];
  ticks?: number;
  nodes: number;
  /** The state where the goal was reached. */
  state?: State;
}

/** Compact identity for a state (SHA-1 of stateKey): the search keeps one per state it has seen. */
export function stateHash(s: State): string {
  return createHash("sha1").update(stateKey(s)).digest("base64");
}

export function stateKey(s: State): string {
  const things = Object.keys(s.things)
    .sort()
    .map((id) => [id, s.things[id].location, s.things[id].props]);
  const people = Object.keys(s.people)
    .sort()
    .map((id) => {
      const p = s.people[id];
      return [id, p.location, p.alive, p.vehicle, p.following, p.from];
    });
  return JSON.stringify([
    s.mode === "untimed" ? s.lives : 0,
    s.actor,
    s.facts,
    s.locations,
    [...s.collapsed].sort(),
    things,
    people,
    [...s.knowledge].sort(),
    [...s.played].sort(),
    [...s.fired].sort(),
    s.ended,
  ]);
}

class Heap<T> {
  private items: { k: number; v: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(k: number, v: T) {
    const a = this.items;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): T {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.v;
  }
}

interface Node {
  state: State;
  key: string;
}

/** Apply every available solverAuto rule (first binding each time) until none remain. Mutates `s`, which must be private. */
function autoApply(w: World, s: State): State {
  for (let guard = 0; guard < 100 && s.actor && !s.ended; guard++) {
    const a = listActions(w, s).find((x) => x.kind === "rule" && w.rules.get(x.rule)!.solverAuto);
    if (!a) break;
    stepMut(w, s, a);
  }
  return s;
}

/** Locations named literally ("#id") in goals, endings or rules: places that matter just by being there. */
const namedCache = new WeakMap<World, Set<string>>();
function namedPlaces(w: World): Set<string> {
  let named = namedCache.get(w);
  if (named) return named;
  named = new Set<string>();
  const scan = (x: unknown): void => {
    if (typeof x === "string" && x.startsWith("#") && w.locations.has(x.slice(1))) named!.add(x.slice(1));
    else if (Array.isArray(x)) x.forEach(scan);
    else if (x && typeof x === "object") Object.values(x).forEach(scan);
  };
  scan([w.def.people.map((p) => p.life), w.def.fallbackGoals, w.def.endings, w.def.rules]);
  for (const p of w.def.people) if (p.life?.destination) named.add(p.life.destination.at);
  for (const t of w.def.triggers) if ("enter" in t.on) named.add(t.on.enter);
  namedCache.set(w, named);
  return named;
}

/**
 * Places worth stopping at right now: something lies there (item, fixture,
 * vehicle), someone is there, a closed barrier sits on one of its links, or a
 * goal or ending names it. Everything else is only ever passed through.
 */
function isStop(w: World, s: State, loc: string): boolean {
  if (namedPlaces(w).has(loc)) return true;
  for (const p of Object.values(s.people)) if (p.location === loc) return true;
  for (const t of Object.values(s.things)) if (t.location === loc) return true;
  for (const cid of w.edges.get(loc) ?? []) {
    const b = w.connections.get(cid)!.barrier;
    if (b && s.things[b].props.blocks !== "none" && !s.collapsed.includes(cid)) return true;
  }
  return false;
}

/**
 * Macro travel: one successor per reachable stop, following the quickest route
 * on the current passability. Each hop is applied with step(), so hazards,
 * triggers and followers behave exactly as if the moves were made one by one.
 */
function travel(w: World, s: State): { state: State; label: string }[] {
  const me = s.people[s.actor!];
  const inVehicle = me.vehicle !== null;
  const best = new Map<string, number>([[me.location, 0]]);
  const prev = new Map<string, string>(); // location -> connection used to reach it
  const heap = new Heap<string>();
  heap.push(0, me.location);
  while (heap.size) {
    const loc = heap.pop();
    // A threat can be a destination, never a shortcut: routes go around it.
    if (loc !== me.location && activeThreatAt(w, s, loc)) continue;
    for (const cid of w.edges.get(loc) ?? []) {
      if (!passable(w, s, cid, inVehicle)) continue;
      const c = w.connections.get(cid)!;
      const to = c.a === loc ? c.b : c.a;
      const d = best.get(loc)! + (inVehicle ? Math.ceil(c.ticks / 2) : c.ticks);
      if (d >= (best.get(to) ?? Infinity)) continue;
      best.set(to, d);
      prev.set(to, cid);
      heap.push(d, to);
    }
  }
  const who = nameOf(w, s.actor);
  const out: { state: State; label: string }[] = [];
  for (const dest of best.keys()) {
    if (dest === me.location || !isStop(w, s, dest)) continue;
    const hops: string[] = [];
    for (let at = dest; at !== me.location; ) {
      const cid = prev.get(at)!;
      hops.unshift(cid);
      const c = w.connections.get(cid)!;
      at = c.a === at ? c.b : c.a;
    }
    const cur = structuredClone(s);
    let moved = false;
    for (const cid of hops) {
      if (!cur.actor || cur.ended) break;
      const inCar = cur.people[cur.actor].vehicle !== null;
      if (!passable(w, cur, cid, inCar)) break; // the route closed mid-trip (e.g. a collapse): stop where we are
      const c = w.connections.get(cid)!;
      const here = cur.people[cur.actor].location;
      stepMut(w, cur, { kind: "move", conn: cid, to: c.a === here ? c.b : c.a, ticks: inCar ? Math.ceil(c.ticks / 2) : c.ticks });
      moved = true;
      if (activeThreatAt(w, cur, cur.people[cur.actor!]?.location ?? "")) break; // a threat stops the trip: fight or flee
    }
    if (!moved) continue;
    out.push({ state: autoApply(w, cur), label: `${who}: ${inVehicle ? "Drive" : "Go"} to ${nameOf(w, dest)} (${cur.tick - s.tick})` });
  }
  return out;
}

/** Successor states, with a human-readable label for the transition. */
export function successors(w: World, s: State): { state: State; label: string }[] {
  if (s.ended) return [];
  if (!s.actor) {
    const prepared = prepareNextLife(w, s).state;
    if (prepared.ended) return [{ state: prepared, label: "(run ends)" }];
    return pool(w, prepared).map((pid) => ({
      state: autoApply(w, assignLife(w, prepared, pid).state),
      label: `[life ${prepared.lives}: ${nameOf(w, pid)}]`,
    }));
  }
  const who = nameOf(w, s.actor);
  const acts = listActions(w, s, { forSolver: true })
    .filter((a) => a.kind !== "move" && a.kind !== "wait") // nothing runs on a timer, so waiting never helps
    .map((a) => ({ state: autoApply(w, step(w, s, a).state), label: `${who}: ${describe(w, s, a)}` }));
  // Inside an active threat the only options are fighting or fleeing (already in acts).
  if (activeThreatAt(w, s, s.people[s.actor].location)) return acts;
  return [...acts, ...travel(w, s)];
}

/**
 * Rough progress measure used to order the search (never to prune it, so
 * "unreachable" stays a complete proof). More knowledge, true facts and open
 * barriers usually mean closer to an ending.
 */
function progress(w: World, s: State): number {
  let n = s.knowledge.length * 3 + Object.values(s.facts).filter(Boolean).length * 3;
  for (const c of w.def.connections) {
    if (c.barrier && s.things[c.barrier].props.blocks === "none") n += 1;
  }
  // Machines and power: a source online or a machine used is real progress.
  for (const t of Object.values(s.things)) if (t.props.online || t.props.used) n += 3;
  // Vehicles that have left where they started (the tanker on its way somewhere).
  for (const t of w.def.things) {
    if (t.kind === "vehicle" && s.things[t.id].location !== t.location) n += 2;
  }
  return n;
}

/**
 * How strongly the search prefers progress over time spent. The best value
 * varies a lot between worlds and goals (measured on the Ash River city: one
 * case took 179 nodes at 20 and >15,000 at 8), so solve() tries each in turn
 * with a share of the budget and returns the first route found.
 */
const PROGRESS_WEIGHTS = [20, 40, 8];
const LIFE_WEIGHTS = [0, 8, 20];

export function solve(w: World, start: State, opts: SolveOpts = {}): SolveResult {
  if (opts.withinLife) {
    if (!start.actor) throw new Error("withinLife needs an active life");
    if (!opts.goal && !relaxedMissionReachable(w, start)) return { status: "unreachable", nodes: 0 };
  } else if (!relaxedReachable(w, start, opts.ending)) return { status: "unreachable", nodes: 0 };

  const budget = opts.maxNodes ?? 200_000;
  // Within one life, chasing general progress sends the actor collecting every clue in the city;
  // shortest-time order goes first there. Across lives, progress is what finds multi-life plans.
  const weights: Weight[] = opts.withinLife ? [...(opts.targets?.length ? ["astar" as const] : []), ...LIFE_WEIGHTS] : PROGRESS_WEIGHTS;
  const share = Math.max(1, Math.floor(budget / weights.length));
  let nodes = 0;
  for (const weight of weights) {
    const r = search(w, start, opts, weight, share);
    nodes += r.nodes;
    // "unreachable" means the search ran out of states: a complete proof whatever the weight.
    if (r.status !== "unknown") return { ...r, nodes };
  }
  return { status: "unknown", nodes };
}

/** A progress weight, or "astar": ticks plus travel time to the nearest goal target. */
type Weight = number | "astar";

function search(w: World, start: State, opts: SolveOpts, weight: Weight, maxNodes: number): SolveResult {
  const owner = start.actor;
  const missionDone = (s: State) => s.missions.some((m) => m.owner === owner && m.status === "complete");
  // A custom goal replaces the default (an ending, or this life's mission when withinLife).
  const isGoal = (s: State) =>
    opts.goal
      ? opts.goal(s)
      : (s.ended?.kind === "ending" && (opts.ending === undefined || s.ended.ending === opts.ending)) || (!!opts.withinLife && missionDone(s));

  const startKey = stateHash(start);
  const parent = new Map<string, { from: string; label: string } | null>([[startKey, null]]);
  const best = new Map<string, number>([[startKey, start.tick]]);
  const heap = new Heap<Node>();
  const targets = opts.targets ?? [];
  const toTarget = (s: State) => {
    if (!s.actor) return 0;
    const d = distances(w, s);
    return Math.min(...targets.map((t) => d.get(t) ?? 1_000));
  };
  const priority = (s: State) => (weight === "astar" ? s.tick + toTarget(s) : s.tick - weight * progress(w, s));
  heap.push(priority(start), { state: start, key: startKey });
  let nodes = 0;

  while (heap.size) {
    const { state, key } = heap.pop();
    // Stale entry: this state was reached again earlier in time after being queued.
    if (state.tick > best.get(key)!) continue;
    nodes++;
    if (isGoal(state)) {
      const path: string[] = [];
      for (let k: string | undefined = key; k; ) {
        const p = parent.get(k);
        if (!p) break;
        path.unshift(p.label);
        k = p.from;
      }
      const ending = state.ended?.kind === "ending" ? state.ended.ending : undefined;
      return { status: "reachable", ending, path, ticks: state.tick, nodes, state };
    }
    if (nodes >= maxNodes) return { status: "unknown", nodes };
    if (opts.withinLife && !state.actor) continue;
    for (const next of successors(w, state)) {
      const k = stateHash(next.state);
      if ((best.get(k) ?? Infinity) <= next.state.tick) continue;
      best.set(k, next.state.tick);
      parent.set(k, { from: key, label: next.label });
      heap.push(priority(next.state), { state: next.state, key: k });
    }
  }
  return { status: "unreachable", nodes };
}

/**
 * True only when no ending is proven reachable: first by the cheap relaxed
 * check, then by a bounded exact search. Running out of budget is never hopeless.
 */
export function isHopeless(w: World, s: State, maxNodes = 500): boolean {
  if (!relaxedReachable(w, s)) return true;
  return solve(w, s, { maxNodes }).status === "unreachable";
}
