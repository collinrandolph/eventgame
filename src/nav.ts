// Navigation: quickest route for the current actor through the connections
// open right now. Used by tests and tools so they can say "go to the
// substation" instead of hard-coding every street on the way.

import { activeThreatAt, passable, stepMut } from "./engine.js";
import type { Action, State, StepResult } from "./types.js";
import { type World, nameOf } from "./world.js";

export interface RouteOpts {
  /** Locations the route must not pass through (the destination itself is always allowed). */
  avoid?: string[];
}

/** Move actions from the actor's location to `to`, or null if there is no open route. */
export function route(w: World, s: State, to: string, opts: RouteOpts = {}): Action[] | null {
  if (!s.actor) return null;
  const me = s.people[s.actor];
  const inVehicle = me.vehicle !== null;
  const avoid = new Set(opts.avoid ?? []);
  const best = new Map<string, number>([[me.location, 0]]);
  const via = new Map<string, Action>();
  const open = [me.location];
  while (open.length) {
    open.sort((a, b) => best.get(a)! - best.get(b)!);
    const loc = open.shift()!;
    if (loc === to) break;
    if (loc !== me.location && (avoid.has(loc) || activeThreatAt(w, s, loc))) continue; // threats: destination only, never a way through
    for (const cid of w.edges.get(loc) ?? []) {
      if (!passable(w, s, cid, inVehicle)) continue;
      const c = w.connections.get(cid)!;
      const next = c.a === loc ? c.b : c.a;
      const ticks = inVehicle ? Math.ceil(c.ticks / 2) : c.ticks;
      const d = best.get(loc)! + ticks;
      if (d >= (best.get(next) ?? Infinity)) continue;
      best.set(next, d);
      via.set(next, { kind: "move", conn: cid, to: next, ticks });
      open.push(next);
    }
  }
  if (!via.has(to)) return to === me.location ? [] : null;
  const path: Action[] = [];
  for (let at = to; at !== me.location; ) {
    const a = via.get(at)! as Extract<Action, { kind: "move" }>;
    path.unshift(a);
    const c = w.connections.get(a.conn)!;
    at = c.a === at ? c.b : c.a;
  }
  return path;
}

/** Travel ticks from the actor to every location reachable right now (around threats). */
export function distances(w: World, s: State): Map<string, number> {
  const best = new Map<string, number>();
  if (!s.actor) return best;
  const me = s.people[s.actor];
  const inVehicle = me.vehicle !== null;
  best.set(me.location, 0);
  const open = [me.location];
  while (open.length) {
    open.sort((a, b) => best.get(a)! - best.get(b)!);
    const loc = open.shift()!;
    if (loc !== me.location && activeThreatAt(w, s, loc)) continue;
    for (const cid of w.edges.get(loc) ?? []) {
      if (!passable(w, s, cid, inVehicle)) continue;
      const c = w.connections.get(cid)!;
      const next = c.a === loc ? c.b : c.a;
      const d = best.get(loc)! + (inVehicle ? Math.ceil(c.ticks / 2) : c.ticks);
      if (d >= (best.get(next) ?? Infinity)) continue;
      best.set(next, d);
      open.push(next);
    }
  }
  return best;
}

/** Walk (or drive) to `to`, one move at a time. Stops early if the life ends on the way. */
export function travel(w: World, state: State, to: string, opts: RouteOpts = {}): StepResult {
  const path = route(w, state, to, opts);
  if (!path) throw new Error(`no open route from ${nameOf(w, state.people[state.actor!]?.location ?? null)} to ${nameOf(w, to)}`);
  const s = structuredClone(state);
  const log: string[] = [];
  let lifeOver: StepResult["lifeOver"] = null;
  for (const a of path) {
    const r = stepMut(w, s, a);
    log.push(...r.log);
    lifeOver = r.lifeOver;
    if (lifeOver || s.ended) break;
    if (activeThreatAt(w, s, s.people[s.actor!].location)) break; // stopped by a threat
  }
  return { state: s, log, lifeOver };
}
