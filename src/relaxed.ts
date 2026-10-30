// Relaxed reachability: a fast, sound proof that an ending is impossible.
//
// Every variable holds the SET of values it could ever have. Actions only add
// values, never remove them; timing is ignored; story triggers may or may
// not have fired; any unplayed person may act. The result over-approximates
// what the real game can do, so if no ending is reachable here, none is
// reachable in the real game. The reverse does not hold: "possible" here only
// means the exact solver has to decide.

import type { Cond, Effect, Ref, State, Value } from "./types.js";
import { type World, lifeOf } from "./world.js";

type VSet = Set<Value>;

interface RState {
  loc: Map<string, VSet>; // person/thing id -> possible locations (things: loc, holder id, or null)
  alive: Map<string, VSet>;
  vehicle: Map<string, VSet>;
  following: Map<string, VSet>;
  props: Map<string, Map<string, VSet>>; // entity or location id -> key -> values
  facts: Map<string, VSet>;
  knowledge: Set<string>;
  collapsed: Map<string, VSet>;
  /** People who may still act: current actor plus the unplayed pool. */
  actors: Set<string>;
  played: Set<string>;
}

function relax(w: World, s: State, onlyActor: boolean): RState {
  const r: RState = {
    loc: new Map(),
    alive: new Map(),
    vehicle: new Map(),
    following: new Map(),
    props: new Map(),
    facts: new Map(Object.entries(s.facts).map(([k, v]) => [k, new Set([v])])),
    knowledge: new Set(s.knowledge),
    collapsed: new Map(w.def.connections.map((c) => [c.id, new Set([s.collapsed.includes(c.id)])])),
    actors: new Set(),
    played: new Set(s.played),
  };
  const propsOf = (p: Record<string, Value>) => new Map(Object.entries(p).map(([k, v]) => [k, new Set([v])]));
  for (const [id, p] of Object.entries(s.people)) {
    r.loc.set(id, new Set([p.location]));
    r.alive.set(id, new Set([p.alive]));
    r.vehicle.set(id, new Set([p.vehicle]));
    r.following.set(id, new Set([p.following]));
    r.props.set(id, propsOf(p.props));
    const def = w.people.get(id)!;
    if (id === s.actor || (!onlyActor && def.playable && !s.played.includes(id))) r.actors.add(id);
  }
  for (const [id, t] of Object.entries(s.things)) {
    r.loc.set(id, new Set([t.location]));
    r.props.set(id, propsOf(t.props));
  }
  for (const [id, p] of Object.entries(s.locations)) r.props.set(id, propsOf(p));
  return r;
}

let grew = false;
function add(set: VSet | Set<string>, v: Value) {
  if (!(set as VSet).has(v)) {
    (set as VSet).add(v);
    grew = true;
  }
}
function propSet(r: RState, id: string, key: string): VSet {
  let m = r.props.get(id);
  if (!m) r.props.set(id, (m = new Map()));
  let set = m.get(key);
  if (!set) m.set(key, (set = new Set([null])));
  return set;
}
function factSet(r: RState, key: string): VSet {
  let set = r.facts.get(key);
  if (!set) r.facts.set(key, (set = new Set([null])));
  return set;
}

interface RCtx {
  self: string;
  bind: Record<string, string>;
}
function res(ref: Ref, ctx: RCtx): string {
  if (ref === "actor" || ref === "self") return ctx.self;
  if (ref.startsWith("#")) return ref.slice(1);
  return ctx.bind[ref];
}

/** Possible effective locations of an entity (a carried thing is wherever its carrier could be). */
function places(r: RState, id: string): Set<string> {
  const out = new Set<string>();
  for (const l of r.loc.get(id) ?? []) {
    if (l === null) continue;
    if (r.alive.has(l as string)) for (const pl of r.loc.get(l as string)!) out.add(pl as string);
    else out.add(l as string);
  }
  if (r.props.has(id) && !r.loc.has(id)) out.add(id); // a location is at itself
  return out;
}

function getProp(r: RState, id: string, key: string): VSet {
  if (key === "id") return new Set([id]);
  if (key === "alive" && r.alive.has(id)) return r.alive.get(id)!;
  if (key === "following" && r.following.has(id)) return r.following.get(id)!;
  return propSet(r, id, key);
}

const truthy = (set: VSet) => [...set].some(Boolean);
const falsy = (set: VSet) => [...set].some((v) => !v);

/** Could `c` evaluate to `want`? */
function possible(w: World, r: RState, c: Cond, ctx: RCtx, want: boolean): boolean {
  const x = (ref: Ref) => res(ref, ctx);
  const match = (set: VSet, eq: Value | undefined) =>
    eq === undefined ? (want ? truthy(set) : falsy(set)) : want ? set.has(eq) : [...set].some((v) => v !== eq);
  if ("all" in c) return want ? c.all.every((y) => possible(w, r, y, ctx, true)) : c.all.some((y) => possible(w, r, y, ctx, false));
  if ("any" in c) return want ? c.any.some((y) => possible(w, r, y, ctx, true)) : c.any.every((y) => possible(w, r, y, ctx, false));
  if ("not" in c) return possible(w, r, c.not, ctx, !want);
  if ("fact" in c) return match(factSet(r, c.fact), c.eq);
  if ("prop" in c) return match(getProp(r, x(c.prop[0]), c.prop[1]), c.eq);
  if ("propMatch" in c) {
    const a = getProp(r, x(c.propMatch[0][0]), c.propMatch[0][1]);
    const b = getProp(r, x(c.propMatch[1][0]), c.propMatch[1][1]);
    return want ? [...a].some((v) => v !== null && b.has(v)) : true;
  }
  if ("at" in c) {
    const p = places(r, x(c.at[0]));
    return want ? p.has(x(c.at[1])) : p.size > 1 || !p.has(x(c.at[1]));
  }
  if ("together" in c) {
    const a = places(r, x(c.together[0]));
    const b = places(r, x(c.together[1]));
    return want ? [...a].some((l) => b.has(l)) : true;
  }
  if ("holds" in c) {
    const l = r.loc.get(x(c.holds[1])) ?? new Set();
    return want ? l.has(x(c.holds[0])) : l.size > 1 || !l.has(x(c.holds[0]));
  }
  if ("ability" in c) return want ? rSkilled(w, r, x(c.ability[0]), c.ability[1]) : true;
  if ("ready" in c) return want ? rReady(w, r, x(c.ready[0]), x(c.ready[1])) : true;
  if ("powered" in c) return want ? rPowered(r, x(c.powered)) : true;
  if ("skilledFor" in c) {
    if (!want) return true;
    return [...getProp(r, x(c.skilledFor[1]), c.skilledFor[2])].some((v) => typeof v === "string" && rSkilled(w, r, x(c.skilledFor[0]), v));
  }
  if ("armedFor" in c) return want ? rArmed(r, x(c.armedFor[0]), x(c.armedFor[1])) : true;
  if ("propFacts" in c) {
    if (!want) return true;
    return [...getProp(r, x(c.propFacts[0]), c.propFacts[1])].some((v) => String(v ?? "").split("|").filter(Boolean).every((f) => truthy(factSet(r, f))));
  }
  if ("knows" in c) return want ? r.knowledge.has(c.knows) : true;
  if ("knowsProp" in c) {
    const vals = getProp(r, x(c.knowsProp[0]), c.knowsProp[1]);
    return want ? [...vals].some((v) => typeof v === "string" && r.knowledge.has(v)) : true;
  }
  if ("alive" in c) return match(r.alive.get(x(c.alive)) ?? new Set([false]), undefined);
  if ("inVehicle" in c) return match(r.vehicle.get(x(c.inVehicle[0]))!, x(c.inVehicle[1]));
  if ("onFoot" in c) return match(r.vehicle.get(x(c.onFoot))!, null);
  if ("played" in c) {
    const id = x(c.played);
    return want ? r.played.has(id) || r.actors.has(id) : !r.played.has(id);
  }
  if ("isActor" in c) return want ? r.actors.has(x(c.isActor)) : true;
  throw new Error(`unknown condition ${JSON.stringify(c)}`);
}

function apply(w: World, r: RState, e: Effect, ctx: RCtx): void {
  const x = (ref: Ref) => res(ref, ctx);
  if ("set" in e) {
    const id = x(e.set[0]);
    if (e.set[1] === "following" && r.following.has(id)) add(r.following.get(id)!, e.value);
    else add(propSet(r, id, e.set[1]), e.value);
  } else if ("fact" in e) add(factSet(r, e.fact), e.value);
  else if ("moveTo" in e) {
    const set = r.loc.get(x(e.moveTo[0]))!;
    const d = e.moveTo[1];
    if (d === "nowhere") add(set, null);
    else if (d === "here") for (const l of places(r, ctx.self)) add(set, l);
    else add(set, x(d));
  } else if ("learn" in e) add(r.knowledge, e.learn);
  else if ("learnProp" in e) {
    for (const v of getProp(r, x(e.learnProp[0]), e.learnProp[1])) if (typeof v === "string") add(r.knowledge, v);
  } else if ("kill" in e) add(r.alive.get(x(e.kill))!, false);
  else if ("follow" in e) add(r.following.get(x(e.follow))!, ctx.self);
  else if ("board" in e) add(r.vehicle.get(ctx.self)!, x(e.board));
  else if ("exitVehicle" in e) add(r.vehicle.get(ctx.self)!, null);
  else if ("collapse" in e) add(r.collapsed.get(e.collapse)!, true);
  else if ("setLoc" in e) add(propSet(r, e.setLoc[0], e.setLoc[1]), e.value);
  else if ("burn" in e || "fire" in e) {
    const at = "burn" in e ? e.burn : e.fire;
    if ("fire" in e) add(propSet(r, at, "lethal"), true); // entering a fire kills: treat like lethal (over-approximate)
    for (const [id, t] of r.loc) if (!r.alive.has(id) && truthy(propSet(r, id, "flammable")) && places(r, id).has(at)) add(t, null);
  } else if ("operate" in e) {
    const actor = x(e.operate[0]);
    const m = x(e.operate[1]);
    for (const key of getProp(r, m, "input")) {
      if (typeof key !== "string" || !truthy(getProp(r, m, "consumes"))) continue;
      for (const [id, l] of r.loc) if (!r.alive.has(id) && truthy(propSet(r, id, key))) add(l, null);
    }
    add(propSet(r, m, "used"), true);
    if (truthy(getProp(r, m, "source"))) add(propSet(r, m, "online"), true);
    for (const f of getProp(r, m, "yieldsFact")) if (typeof f === "string") add(factSet(r, f), true);
    for (const k of getProp(r, m, "yieldsClue")) if (typeof k === "string") add(r.knowledge, k);
    for (const rec of getProp(r, m, "recordsTo")) {
      if (typeof rec !== "string") continue;
      for (const k of getProp(r, m, "yieldsClue")) add(propSet(r, rec, "reveals"), k);
    }
    for (const b of getProp(r, m, "banishes")) for (const loc of String(b ?? "").split("|").filter(Boolean)) add(propSet(r, loc, "dark"), false);
    for (const f of getProp(r, m, "yieldsOnBanish")) if (typeof f === "string") add(factSet(r, f), true);
    void actor;
  }
}

// ---------- systems, relaxed ----------

const heldBy = (r: RState, pid: string) => [...r.loc].filter(([id, l]) => !r.alive.has(id) && l.has(pid)).map(([id]) => id);

function rSkilled(w: World, r: RState, pid: string, skill: string): boolean {
  if (w.people.get(pid)?.abilities?.includes(skill)) return true;
  return heldBy(r, pid).some((id) => getProp(r, id, "teaches").has(skill));
}

function circuitPossible(r: RState, circuit: string): boolean {
  return [...r.loc.keys()].some(
    (src) => truthy(getProp(r, src, "source")) && truthy(getProp(r, src, "online")) && [...getProp(r, src, "feeds")].some((f) => String(f ?? "").split("|").includes(circuit)),
  );
}

function rPowered(r: RState, id: string): boolean {
  const circuits = getProp(r, id, "circuit");
  if ([...circuits].some((c) => !c)) return true;
  return [...r.loc.keys()].some(
    (src) =>
      truthy(getProp(r, src, "source")) &&
      truthy(getProp(r, src, "online")) &&
      [...getProp(r, src, "feeds")].some((f) => [...circuits].some((c) => String(f ?? "").split("|").includes(String(c)))),
  );
}

function rReady(w: World, r: RState, actor: string, m: string): boolean {
  const has = (k: string) => truthy(getProp(r, m, k));
  if (!has("machine") && !has("source")) return false;
  if (!falsy(getProp(r, m, "used")) && !has("reusable")) return false;
  if (has("source") && !falsy(getProp(r, m, "online"))) return false;
  if (!rPowered(r, m)) return false;
  for (const sk of getProp(r, m, "skill")) if (typeof sk === "string" && !rSkilled(w, r, actor, sk)) return false;
  for (const tool of getProp(r, m, "tool")) {
    if (typeof tool === "string" && !heldBy(r, actor).some((id) => truthy(getProp(r, id, tool)))) return false;
  }
  const here = places(r, actor);
  for (const key of getProp(r, m, "input")) {
    if (typeof key !== "string") continue;
    const ok = [...r.loc].some(([id, l]) => !r.alive.has(id) && usable(w, r, id) && truthy(getProp(r, id, key)) && (l.has(actor) || [...l].some((x) => here.has(x as string))));
    if (!ok) return false;
  }
  for (const clue of getProp(r, m, "needsClue")) if (typeof clue === "string" && !r.knowledge.has(clue)) return false;
  for (const nf of getProp(r, m, "needsFact")) for (const f of String(nf ?? "").split("|").filter(Boolean)) if (!truthy(factSet(r, f))) return false;
  return true;
}

function rArmed(r: RState, actor: string, threat: string): boolean {
  const need = Math.min(...[...getProp(r, threat, "strength")].map((v) => Number(v ?? 1)));
  const counters = [...getProp(r, threat, "counter")].map((v) => String(v ?? "weapon"));
  return heldBy(r, actor).some((id) => counters.some((k) => [...getProp(r, id, k)].some((v) => Number(v ?? 0) >= need)));
}

/** Gated items/NPCs can be used once their owner's life could have begun. */
function usable(w: World, r: RState, id: string): boolean {
  if (w.people.get(id)?.playable && !r.played.has(id) && !r.actors.has(id)) return false;
  const owner = [...getProp(r, id, "owner")][0] as string | null;
  return owner === null || owner === undefined || r.played.has(owner) || r.actors.has(owner);
}

function candidates(w: World, r: RState, actor: string, spec: { kind: string; from: string }): string[] {
  return rawCandidates(w, r, actor, spec).filter((id) => usable(w, r, id));
}

function rawCandidates(w: World, r: RState, actor: string, spec: { kind: string; from: string }): string[] {
  const here = places(r, actor);
  if (spec.kind === "person") {
    return [...r.alive.keys()].filter(
      (id) => id !== actor && [...places(r, id)].some((l) => here.has(l)) && (spec.from !== "here" || truthy(r.alive.get(id)!)),
    );
  }
  const ids = w.def.things.filter((t) => t.kind === spec.kind).map((t) => t.id);
  const locs = (id: string) => r.loc.get(id)!;
  switch (spec.from) {
    case "held":
      return ids.filter((id) => locs(id).has(actor));
    case "here":
      return ids.filter((id) => [...locs(id)].some((l) => here.has(l as string)));
    case "reach":
      return ids.filter((id) => locs(id).has(actor) || [...locs(id)].some((l) => here.has(l as string)));
    case "others":
      return ids.filter((id) =>
        [...locs(id)].some((h) => h !== null && h !== actor && r.alive.has(h as string) && [...places(r, h as string)].some((l) => here.has(l))),
      );
    case "adjacent":
      return w.def.connections
        .filter((c) => c.barrier && (here.has(c.a) || here.has(c.b)) && falsy(r.collapsed.get(c.id)!))
        .map((c) => c.barrier!)
        .filter((b) => ids.includes(b));
    case "driving":
      return ids.filter((id) => r.vehicle.get(actor)!.has(id));
  }
  return [];
}

function* bindings(w: World, r: RState, actor: string, params: Record<string, { kind: string; from: string }>) {
  let out: Record<string, string>[] = [{}];
  for (const [name, spec] of Object.entries(params)) {
    const cands = candidates(w, r, actor, spec);
    out = out.flatMap((b) => cands.filter((c) => !Object.values(b).includes(c)).map((c) => ({ ...b, [name]: c })));
  }
  yield* out;
}

function passable(r: RState, w: World, connId: string, vehicle: boolean): boolean {
  if (!falsy(r.collapsed.get(connId)!)) return false;
  const c = w.connections.get(connId)!;
  if (vehicle && !c.road) return false;
  if (!c.barrier) return true;
  // Powered access: possible once its circuit could have power.
  const pb = [...propSet(r, c.barrier, "poweredBy")].find((v) => typeof v === "string");
  if (pb) return circuitPossible(r, pb as string);
  const blocks = propSet(r, c.barrier, "blocks");
  return [...blocks].some((b) => b === "none" || (b === "vehicles" && !vehicle));
}

function endingPossible(w: World, r: RState, ending?: string): boolean {
  return w.def.endings.some(
    (e) => (ending === undefined || e.id === ending) && possible(w, r, e.when, { self: [...r.actors][0] ?? "", bind: {} }, true),
  );
}

/** False means proven impossible. True means "maybe": ask the exact solver. */
export function relaxedReachable(w: World, s: State, ending?: string): boolean {
  if (s.ended) return s.ended.kind === "ending" && (ending === undefined || s.ended.ending === ending);
  const r = relax(w, s, false);
  return fixpoint(w, s, r, () => endingPossible(w, r, ending)) >= 0;
}

/** Could this condition ever hold (anyone may act)? False is a proof it can't. */
export function relaxedCondReachable(w: World, s: State, cond: Cond): boolean {
  const r = relax(w, s, false);
  return fixpoint(w, s, r, () => possible(w, r, cond, { self: s.actor ?? "", bind: {} }, true)) >= 0;
}

/** Could the current actor alone make this condition hold, within this life? False is a proof they can't. */
export function relaxedCondReachableByActor(w: World, s: State, cond: Cond): boolean {
  if (!s.actor) return false;
  const r = relax(w, s, true);
  return fixpoint(w, s, r, () => possible(w, r, cond, { self: s.actor!, bind: {} }, true)) >= 0;
}

/** Could the current actor reach this ending alone, within this life? False is a proof they can't. */
export function relaxedReachableByActor(w: World, s: State, ending?: string): boolean {
  if (!s.actor) return false;
  const r = relax(w, s, true);
  return fixpoint(w, s, r, () => endingPossible(w, r, ending)) >= 0;
}

/**
 * Can the current actor still complete their own mission within this life?
 * False is a proof the mission is broken, which is a world bug.
 */
export function relaxedMissionReachable(w: World, s: State): boolean {
  if (!s.actor) return true;
  const m = s.missions.find((x) => x.owner === s.actor && x.status === "active");
  if (!m) return true;
  const r = relax(w, s, true);
  const ctx = { self: s.actor, bind: {} };
  const life = lifeOf(w, m);
  const done: Cond = life.destination ? { all: [life.objective.done, { at: ["self", "#" + life.destination.at] }] } : life.objective.done;
  return fixpoint(w, s, r, () => possible(w, r, done, ctx, true)) >= 0;
}

/** Rounds until eached holds (0 = already), or -1 if it never can. */
function fixpoint(w: World, s: State, r: RState, reached: () => boolean): number {
  // Story triggers may fire once their condition could hold (checked every round).
  const pending = w.def.triggers.filter((t) => !s.fired.includes(t.id));
  const fireTriggers = () => {
    for (let i = pending.length - 1; i >= 0; i--) {
      const t = pending[i];
      // "The actor" of a trigger without a fixed life could be anyone who may act.
      const selves = t.life ? [t.life] : s.actor ? [s.actor] : [...r.actors];
      const self = selves.find((a) => !t.when || possible(w, r, t.when, { self: a, bind: {} }, true));
      if (self === undefined) continue;
      const ctx = { self, bind: {} };
      for (const e of t.effects) apply(w, r, e, ctx);
      pending.splice(i, 1);
      grew = true;
    }
  };
  fireTriggers();
  if (reached()) return 0;

  for (let round = 0; round < 1000; round++) {
    grew = false;
    // Hazards: anyone who can be somewhere lethal may die there.
    for (const [id, alive] of r.alive) {
      for (const l of places(r, id)) if (truthy(propSet(r, l, "lethal"))) add(alive, false);
    }
    for (const actor of r.actors) {
      if (!truthy(r.alive.get(actor)!)) continue;
      const ctx = { self: actor, bind: {} as Record<string, string> };
      const veh = r.vehicle.get(actor)!;
      // One link per round, so rounds measure hops as well as dependencies.
      const startPlaces = new Set(places(r, actor));
      for (const conn of w.def.connections) {
        for (const [from, to] of [
          [conn.a, conn.b],
          [conn.b, conn.a],
        ]) {
          if (!startPlaces.has(from)) continue;
          for (const v of veh) {
            if (!passable(r, w, conn.id, v !== null)) continue;
            add(r.loc.get(actor)!, to);
            if (v !== null) add(r.loc.get(v as string)!, to);
            for (const [pid, f] of r.following) if (f.has(actor)) add(r.loc.get(pid)!, to);
          }
        }
      }
      for (const rule of w.def.rules) {
        for (const bind of bindings(w, r, actor, rule.params ?? {})) {
          ctx.bind = bind;
          if ((rule.requires ?? []).every((c) => possible(w, r, c, ctx, true))) {
            for (const e of rule.effects) apply(w, r, e, ctx);
          }
        }
      }
    }
    fireTriggers();
    if (reached()) return round + 1;
    if (!grew) return -1;
  }
  return 1000;
}
