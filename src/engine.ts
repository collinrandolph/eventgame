// The rules engine: evaluates conditions, enumerates legal actions for the
// current actor, and applies one action to produce the next state. step() is
// pure; stepMut() mutates a private copy (for the solver).
//
// The game systems (machines, power, access, hazards, threats, clues, escort,
// vehicles, sabotage) are generic conditions and effects here, driven by data
// props. See SYSTEMS in types.ts. Worlds supply only data.

import type { Action, Cond, Effect, Ref, State, StepResult, TriggerDef, Value } from "./types.js";
import { type World, lifeOf, nameOf } from "./world.js";

export interface Ctx {
  self: string | null;
  bind: Record<string, string>;
}

const clone = <T>(x: T): T => structuredClone(x);

export function resolve(ref: Ref, ctx: Ctx): string {
  if (ref === "actor" || ref === "self") {
    if (!ctx.self) throw new Error(`"${ref}" used with no actor`);
    return ctx.self;
  }
  if (ref.startsWith("#")) return ref.slice(1);
  const id = ctx.bind[ref];
  if (!id) throw new Error(`unbound ref "${ref}"`);
  return id;
}

/** Location id an entity is effectively at (carried things are where their carrier is). */
export function locationOf(s: State, id: string): string | null {
  const p = s.people[id];
  if (p) return p.location;
  const t = s.things[id];
  if (t) {
    if (t.location && s.people[t.location]) return s.people[t.location].location;
    return t.location;
  }
  return s.locations[id] ? id : null;
}

export function getProp(s: State, id: string, key: string): Value {
  if (key === "id") return id;
  const p = s.people[id];
  if (p) {
    if (key === "alive") return p.alive;
    if (key === "following") return p.following;
    return p.props[key] ?? null;
  }
  const t = s.things[id];
  if (t) return t.props[key] ?? null;
  return s.locations[id]?.[key] ?? null;
}

// ---------- system helpers ----------

const held = (s: State, pid: string) => Object.keys(s.things).filter((id) => s.things[id].location === pid);

/** Has the skill, or holds an item that stands in for it (props.teaches). */
export function skilled(w: World, s: State, pid: string, skill: string): boolean {
  if (w.people.get(pid)?.abilities?.includes(skill)) return true;
  return held(s, pid).some((id) => s.things[id].props.teaches === skill);
}

/** Power system: is any online source feeding this circuit? */
export function circuitOn(s: State, circuit: string): boolean {
  return Object.values(s.things).some((t) => t.props.source && t.props.online && String(t.props.feeds ?? "").split("|").includes(circuit));
}

/** No circuit means no power needed; otherwise an online source must feed it. */
export function powered(s: State, id: string): boolean {
  const circuit = s.things[id]?.props.circuit;
  return !circuit || circuitOn(s, String(circuit));
}

/** Darkness: a claimed location is deadly unless its lights (props.lightCircuit) are powered. */
export function darkAt(s: State, loc: string): boolean {
  const p = s.locations[loc];
  if (!p?.dark) return false;
  return !(p.lightCircuit && circuitOn(s, String(p.lightCircuit)));
}

/** Carrying light: a lasting light (props.light), or a flare with charges left (props.lightCharges). */
function lightFor(s: State, pid: string): { lasting: boolean; charge?: string } {
  const items = held(s, pid);
  if (items.some((id) => Number(s.things[id].props.light ?? 0) > 0)) return { lasting: true };
  const charge = items.find((id) => Number(s.things[id].props.lightCharges ?? 0) > 0);
  return { lasting: false, charge };
}

/** Machine input: an item with the input prop, held by the actor or on the ground beside the machine (never a gated one). */
function inputFor(w: World, s: State, actor: string, machine: string): string | undefined {
  const key = s.things[machine].props.input;
  if (!key) return undefined;
  const here = s.people[actor].location;
  return Object.keys(s.things).find((id) => {
    const t = s.things[id];
    return t.props[String(key)] && (t.location === actor || t.location === here) && !gated(w, s, id);
  });
}

export function machineReady(w: World, s: State, actor: string, machine: string): boolean {
  const p = s.things[machine]?.props;
  if (!p || !(p.machine || p.source)) return false;
  if (p.used && !p.reusable) return false;
  if (p.source && p.online) return false;
  if (!powered(s, machine)) return false;
  if (p.skill && !skilled(w, s, actor, String(p.skill))) return false;
  if (p.tool && !held(s, actor).some((id) => s.things[id].props[String(p.tool)])) return false;
  if (p.input && !inputFor(w, s, actor, machine)) return false;
  if (p.needsClue && !s.knowledge.includes(String(p.needsClue))) return false;
  // Milestones: story states this machine can't work without ("a|b").
  for (const f of String(p.needsFact ?? "").split("|").filter(Boolean)) if (!s.facts[f]) return false;
  return true;
}

/** Threats are beaten by items whose counter prop (default "weapon"; e.g. "light" for the dark) is at least their strength. */
export function armedFor(s: State, actor: string, threat: string): boolean {
  const t = s.things[threat]?.props;
  const strength = Number(t?.strength ?? 1);
  const counter = String(t?.counter ?? "weapon");
  return held(s, actor).some((id) => Number(s.things[id].props[counter] ?? 0) >= strength);
}

/** Threat system: an active threat at this location blocks everything but fighting and fleeing. */
export function activeThreatAt(w: World, s: State, loc: string): string | undefined {
  return Object.keys(s.things).find((id) => w.things.get(id)?.kind === "threat" && s.things[id].location === loc && s.things[id].props.active);
}

export function evalCond(w: World, s: State, c: Cond, ctx: Ctx): boolean {
  const r = (ref: Ref) => resolve(ref, ctx);
  if ("all" in c) return c.all.every((x) => evalCond(w, s, x, ctx));
  if ("any" in c) return c.any.some((x) => evalCond(w, s, x, ctx));
  if ("not" in c) return !evalCond(w, s, c.not, ctx);
  if ("fact" in c) {
    const v = s.facts[c.fact] ?? null;
    return c.eq === undefined ? !!v : v === c.eq;
  }
  if ("prop" in c) {
    const v = getProp(s, r(c.prop[0]), c.prop[1]);
    return c.eq === undefined ? !!v : v === c.eq;
  }
  if ("propMatch" in c) {
    const [[a, ka], [b, kb]] = c.propMatch;
    const va = getProp(s, r(a), ka);
    return va !== null && va === getProp(s, r(b), kb);
  }
  if ("at" in c) return locationOf(s, r(c.at[0])) === r(c.at[1]);
  if ("together" in c) {
    const a = locationOf(s, r(c.together[0]));
    return a !== null && a === locationOf(s, r(c.together[1]));
  }
  if ("holds" in c) return s.things[r(c.holds[1])]?.location === r(c.holds[0]);
  if ("ability" in c) return skilled(w, s, r(c.ability[0]), c.ability[1]);
  if ("knows" in c) return s.knowledge.includes(c.knows);
  if ("knowsProp" in c) {
    const v = getProp(s, r(c.knowsProp[0]), c.knowsProp[1]);
    return typeof v === "string" && s.knowledge.includes(v);
  }
  if ("alive" in c) return s.people[r(c.alive)]?.alive ?? false;
  if ("inVehicle" in c) return s.people[r(c.inVehicle[0])]?.vehicle === r(c.inVehicle[1]);
  if ("onFoot" in c) return s.people[r(c.onFoot)]?.vehicle === null;
  if ("played" in c) return s.played.includes(r(c.played));
  if ("isActor" in c) return s.actor === r(c.isActor);
  if ("ready" in c) return machineReady(w, s, r(c.ready[0]), r(c.ready[1]));
  if ("powered" in c) return powered(s, r(c.powered));
  if ("skilledFor" in c) {
    const skill = getProp(s, r(c.skilledFor[1]), c.skilledFor[2]);
    return typeof skill === "string" && skilled(w, s, r(c.skilledFor[0]), skill);
  }
  if ("armedFor" in c) return armedFor(s, r(c.armedFor[0]), r(c.armedFor[1]));
  if ("propFacts" in c) return String(getProp(s, r(c.propFacts[0]), c.propFacts[1]) ?? "").split("|").filter(Boolean).every((f) => !!s.facts[f]);
  throw new Error(`unknown condition ${JSON.stringify(c)}`);
}

function learn(w: World, s: State, fact: string, log: string[]): void {
  if (s.knowledge.includes(fact)) return;
  s.knowledge.push(fact);
  log.push(`  (you now know: ${fact})`);
}

/**
 * Gated until the owner's life begins: visible and encounterable, but not
 * interactable. A future playable character is gated by their own life.
 */
export function gated(w: World, s: State, id: string): boolean {
  if (w.people.get(id)?.playable && !s.played.includes(id)) return true;
  const owner = (s.things[id]?.props.owner ?? s.people[id]?.props.owner ?? null) as string | null;
  return owner !== null && !s.played.includes(owner);
}

/**
 * People who cannot die: future lives (playable, not yet played), and NPCs tied
 * to a mission that hasn't started or is being played right now.
 */
export function isProtected(w: World, s: State, id: string): boolean {
  if (w.people.get(id)?.playable && !s.played.includes(id)) return true;
  const owner = s.people[id]?.props.owner as string | undefined;
  return !!owner && (!s.played.includes(owner) || s.actor === owner);
}

export function kill(w: World, s: State, id: string, log: string[], how: string): void {
  const p = s.people[id];
  if (!p || !p.alive || isProtected(w, s, id)) return;
  p.alive = false;
  p.vehicle = null;
  p.following = null;
  for (const q of Object.values(s.people)) if (q.following === id) q.following = null;
  log.push(`${nameOf(w, id)} ${how}.`);
}

export function applyEffect(w: World, s: State, e: Effect, ctx: Ctx, log: string[]): void {
  const r = (ref: Ref) => resolve(ref, ctx);
  if ("set" in e) {
    const id = r(e.set[0]);
    const key = e.set[1];
    if (s.people[id]) {
      if (key === "following") s.people[id].following = e.value as string | null;
      else s.people[id].props[key] = e.value;
    } else if (s.things[id]) s.things[id].props[key] = e.value;
    else throw new Error(`set: unknown entity ${id}`);
  } else if ("fact" in e) {
    s.facts[e.fact] = e.value;
  } else if ("moveTo" in e) {
    const id = r(e.moveTo[0]);
    const dest = e.moveTo[1];
    const to = dest === "nowhere" ? null : dest === "here" ? locationOf(s, r("actor")) : r(dest);
    if (!s.things[id]) throw new Error(`moveTo: ${id} is not a thing`);
    s.things[id].location = to;
  } else if ("learn" in e) {
    learn(w, s, e.learn, log);
  } else if ("learnProp" in e) {
    const v = getProp(s, r(e.learnProp[0]), e.learnProp[1]);
    if (typeof v === "string") learn(w, s, v, log);
  } else if ("kill" in e) {
    kill(w, s, r(e.kill), log, "is killed");
  } else if ("follow" in e) {
    s.people[r(e.follow)].following = r("actor");
  } else if ("board" in e) {
    s.people[r("actor")].vehicle = r(e.board);
  } else if ("exitVehicle" in e) {
    s.people[r("actor")].vehicle = null;
  } else if ("collapse" in e) {
    if (!s.collapsed.includes(e.collapse)) s.collapsed.push(e.collapse);
  } else if ("setLoc" in e) {
    s.locations[e.setLoc[0]][e.setLoc[1]] = e.value;
  } else if ("burn" in e) {
    burn(w, s, e.burn, log);
  } else if ("fire" in e) {
    s.locations[e.fire].fire = true;
    burn(w, s, e.fire, log);
  } else if ("operate" in e) {
    operate(w, s, r(e.operate[0]), r(e.operate[1]), log);
  } else {
    throw new Error(`unknown effect ${JSON.stringify(e)}`);
  }
}

/** Destroy flammable things lying on the ground (carried things survive with their carrier). */
function burn(w: World, s: State, loc: string, log: string[]): void {
  for (const [id, t] of Object.entries(s.things)) {
    if (t.props.flammable && t.location === loc) {
      t.location = null;
      log.push(`  ${nameOf(w, id)} is destroyed.`);
    }
  }
}

/** Machine system outputs. */
function operate(w: World, s: State, actor: string, machine: string, log: string[]): void {
  const p = s.things[machine].props;
  const input = inputFor(w, s, actor, machine);
  if (p.consumes && input) s.things[input].location = null;
  p.used = true;
  if (p.source) {
    p.online = true;
    log.push(`  ${nameOf(w, machine)} is online.`);
  }
  if (p.yieldsFact) s.facts[String(p.yieldsFact)] = true;
  if (p.yieldsClue) learn(w, s, String(p.yieldsClue), log);
  if (p.recordsTo && s.things[String(p.recordsTo)]) s.things[String(p.recordsTo)].props.reveals = p.yieldsClue ?? null;
  // Floodlights and the like push the dark out of locations for good.
  for (const loc of String(p.banishes ?? "").split("|").filter(Boolean)) {
    if (s.locations[loc]?.dark) {
      s.locations[loc].dark = false;
      // Only counts as driving the dark back if there was dark to drive.
      if (p.yieldsOnBanish) s.facts[String(p.yieldsOnBanish)] = true;
      log.push(`  The dark is driven out of ${nameOf(w, loc)}.`);
    }
  }
}

// ---------- Action enumeration ----------

/** Can the actor cross this connection right now? Barriers with blocks "vehicles" only stop vehicles. */
export function passable(w: World, s: State, connId: string, inVehicle: boolean): boolean {
  if (s.collapsed.includes(connId)) return false;
  const c = w.connections.get(connId)!;
  if (inVehicle && !c.road) return false;
  if (!c.barrier) return true;
  const bp = s.things[c.barrier].props;
  // Powered access (lifts, maglocks): open only while its circuit has power.
  if (bp.poweredBy) return circuitOn(s, String(bp.poweredBy)) && (bp.blocks ?? "none") !== "all";
  const blocks = bp.blocks ?? "all";
  if (blocks === "all") return false;
  if (blocks === "vehicles") return !inVehicle;
  return true;
}

function candidates(w: World, s: State, actor: string, spec: { kind: string; from: string }): string[] {
  return rawCandidates(w, s, actor, spec).filter((id) => !gated(w, s, id));
}

function rawCandidates(w: World, s: State, actor: string, spec: { kind: string; from: string }): string[] {
  const here = s.people[actor].location;
  if (spec.kind === "person") {
    return Object.entries(s.people)
      .filter(([id, p]) => id !== actor && p.location === here && (spec.from !== "here" || p.alive))
      .map(([id]) => id);
  }
  const ofKind = (id: string) => w.things.get(id)?.kind === spec.kind;
  switch (spec.from) {
    case "held":
      return Object.keys(s.things).filter((id) => ofKind(id) && s.things[id].location === actor);
    case "here":
      return Object.keys(s.things).filter((id) => ofKind(id) && s.things[id].location === here);
    case "reach":
      return Object.keys(s.things).filter(
        (id) => ofKind(id) && (s.things[id].location === actor || s.things[id].location === here),
      );
    case "others":
      return Object.keys(s.things).filter((id) => {
        const holder = s.things[id].location;
        return ofKind(id) && holder !== null && holder !== actor && s.people[holder]?.location === here;
      });
    case "adjacent":
      return (w.edges.get(here) ?? [])
        .filter((cid) => !s.collapsed.includes(cid))
        .map((cid) => w.connections.get(cid)!.barrier)
        .filter((b): b is string => !!b && ofKind(b));
    case "driving": {
      const v = s.people[actor].vehicle;
      return v && ofKind(v) ? [v] : [];
    }
  }
  throw new Error(`unknown param source ${spec.from}`);
}

function bindings(w: World, s: State, actor: string, params: Record<string, { kind: string; from: string }>) {
  let out: Record<string, string>[] = [{}];
  for (const [name, spec] of Object.entries(params)) {
    const cands = candidates(w, s, actor, spec);
    const next: Record<string, string>[] = [];
    for (const b of out) for (const c of cands) if (!Object.values(b).includes(c)) next.push({ ...b, [name]: c });
    out = next;
  }
  return out;
}

export interface ListOpts {
  /** Drop rules marked solverSkip (used by the solver). */
  forSolver?: boolean;
}

export function listActions(w: World, s: State, opts: ListOpts = {}): Action[] {
  if (s.ended || !s.actor) return [];
  const actor = s.actor;
  const me = s.people[actor];
  if (!me.alive) return [];
  const out: Action[] = [];
  const threat = activeThreatAt(w, s, me.location);

  if (threat) {
    // Fight (duringThreat rules) or flee back the way you came.
    if (me.from) {
      const cid = (w.edges.get(me.location) ?? []).find((id) => {
        const c = w.connections.get(id)!;
        return (c.a === me.from || c.b === me.from) && passable(w, s, id, me.vehicle !== null);
      });
      if (cid) {
        const c = w.connections.get(cid)!;
        out.push({ kind: "flee", conn: cid, to: me.from, ticks: me.vehicle ? Math.ceil(c.ticks / 2) : c.ticks });
      }
    }
  } else {
    for (const cid of w.edges.get(me.location) ?? []) {
      if (!passable(w, s, cid, me.vehicle !== null)) continue;
      const c = w.connections.get(cid)!;
      const ticks = me.vehicle ? Math.ceil(c.ticks / 2) : c.ticks;
      out.push({ kind: "move", conn: cid, to: c.a === me.location ? c.b : c.a, ticks });
    }
  }

  for (const rule of w.def.rules) {
    if (opts.forSolver && (rule.solverSkip || rule.solverAuto)) continue;
    if (!!threat !== !!rule.duringThreat) continue;
    for (const bind of bindings(w, s, actor, rule.params ?? {})) {
      const ctx = { self: actor, bind };
      if ((rule.requires ?? []).every((c) => evalCond(w, s, c, ctx))) {
        out.push({ kind: "rule", rule: rule.id, bind, ticks: rule.ticks });
      }
    }
  }

  if (!threat) out.push({ kind: "wait", ticks: 5 });
  return out;
}

function fill(w: World, template: string, ctx: Ctx): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k === "actor" ? nameOf(w, ctx.self) : ctx.bind[k] ? nameOf(w, ctx.bind[k]) : `{${k}}`,
  );
}

export function describe(w: World, s: State, a: Action): string {
  if (a.kind === "wait") return `Wait (${a.ticks})`;
  if (a.kind === "flee") return `Flee back to ${nameOf(w, a.to)} (${a.ticks})`;
  if (a.kind === "move") {
    const verb = s.actor && s.people[s.actor].vehicle ? "Drive" : "Go";
    return `${verb} to ${nameOf(w, a.to)} (${a.ticks})`;
  }
  const rule = w.rules.get(a.rule)!;
  return `${fill(w, rule.label ?? rule.text, { self: s.actor, bind: a.bind })} (${a.ticks})`;
}

// ---------- Triggers, hazards, missions, endings ----------

/** Kill anyone standing in a lethal location. */
export function resolveHazards(w: World, s: State, log: string[]): void {
  for (const [id, p] of Object.entries(s.people)) {
    if (p.alive && s.locations[p.location]?.lethal) kill(w, s, id, log, `dies at ${nameOf(w, p.location)}`);
  }
}

/** Fire every trigger matching `match` whose life and condition hold. Each fires once. */
export function fireTriggers(w: World, s: State, match: (t: TriggerDef) => boolean, log: string[]): void {
  for (const t of w.def.triggers) {
    if (s.fired.includes(t.id) || !match(t)) continue;
    if (t.life && t.life !== s.actor) continue;
    const ctx = { self: s.actor, bind: {} };
    if (t.when && !evalCond(w, s, t.when, ctx)) continue;
    s.fired.push(t.id);
    log.push(`!! ${t.text}`);
    for (const e of t.effects) applyEffect(w, s, e, ctx, log);
  }
}

export function checkEnding(w: World, s: State, log: string[]): void {
  if (s.ended) return;
  for (const end of w.def.endings) {
    if (evalCond(w, s, end.when, { self: s.actor, bind: {} })) {
      s.ended = { kind: "ending", ending: end.id };
      log.push(`== ENDING: ${end.name} ==`, end.text);
      return;
    }
  }
}

/**
 * Tick off the current life's subobjectives (firing their triggers), then
 * check missions. The current life is done when its objective holds and the
 * actor is at the destination. Past lives' unfinished missions can be
 * finished by anyone; that never ends the current life.
 */
function checkMissions(w: World, s: State, log: string[]): boolean {
  let goalDone = false;
  for (const m of s.missions) {
    if (m.status === "complete") continue;
    const life = lifeOf(w, m);
    const ctx = { self: m.owner, bind: {} };
    const current = m.status === "active" && m.owner === s.actor && s.people[m.owner].alive;
    if (current) {
      for (const sub of life.subobjectives) {
        if (m.subs.includes(sub.id) || !evalCond(w, s, sub.done, ctx)) continue;
        m.subs.push(sub.id);
        log.push(`  ✓ ${sub.text}`);
        fireTriggers(w, s, (t) => "sub" in t.on && t.on.sub === sub.id, log);
      }
    }
    if (!evalCond(w, s, life.objective.done, ctx)) continue;
    if (m.status === "active") {
      if (!current) continue;
      if (life.destination && s.people[m.owner].location !== life.destination.at) continue;
      goalDone = true;
      log.push(`** Mission complete: ${life.objective.text}`);
    } else {
      log.push(`** ${nameOf(w, m.owner)}'s unfinished mission is complete: ${life.objective.text}`);
    }
    m.status = "complete";
    if (life.objective.completeText) log.push(life.objective.completeText);
    // NPCs tied to a finished mission have met their final objective: they stay put for good.
    for (const p of Object.values(s.people)) {
      if (p.props.owner === m.owner && p.props.leadable) {
        p.props.leadable = false;
        p.following = null;
      }
    }
  }
  return goalDone;
}

export function step(w: World, state: State, a: Action): StepResult {
  const s = clone(state);
  return { state: s, ...stepMut(w, s, a) };
}

/** Like step(), but mutates `s` in place. For callers that already own a private copy (the solver). */
export function stepMut(w: World, s: State, a: Action): Omit<StepResult, "state"> {
  if (s.ended || !s.actor) throw new Error("no active life");
  const log: string[] = [];
  const actor = s.actor!;
  const me = s.people[actor];
  const ctx: Ctx = { self: actor, bind: a.kind === "rule" ? a.bind : {} };

  if (a.kind === "move" || a.kind === "flee") {
    const from = me.location;
    log.push(`${nameOf(w, actor)} ${a.kind === "flee" ? "flees" : me.vehicle ? "drives" : "goes"} to ${nameOf(w, a.to)}.`);
    me.location = a.to;
    me.from = from;
    if (me.vehicle) s.things[me.vehicle].location = a.to;
    for (const [id, p] of Object.entries(s.people)) {
      if (p.following === actor && p.alive && p.location === from) {
        p.location = a.to;
        log.push(`  ${nameOf(w, id)} follows.`);
      }
    }
    const light = darkAt(s, a.to) ? lightFor(s, actor) : null;
    if (light?.charge) {
      const t = s.things[light.charge].props;
      t.lightCharges = Number(t.lightCharges) - 1;
      log.push(`  ${nameOf(w, light.charge)} holds the dark back${Number(t.lightCharges) ? "" : " and gutters out"}.`);
    }
    if (s.locations[a.to]?.fire) kill(w, s, actor, log, `walks into the fire at ${nameOf(w, a.to)}`);
    else if (light && !light.lasting && !light.charge) kill(w, s, actor, log, `is taken by the dark in ${nameOf(w, a.to)}`);
    else {
      const threat = activeThreatAt(w, s, a.to);
      if (threat) log.push(`!! ${nameOf(w, threat)} blocks the way.`);
      fireTriggers(w, s, (t) => "enter" in t.on && t.on.enter === a.to, log);
    }
  } else if (a.kind === "wait") {
    log.push(`${nameOf(w, actor)} waits.`);
  } else {
    const rule = w.rules.get(a.rule)!;
    log.push(fill(w, rule.text, ctx));
    for (const e of rule.effects) applyEffect(w, s, e, ctx, log);
    const bound = Object.values(a.bind);
    fireTriggers(w, s, (t) => "rule" in t.on && t.on.rule === a.rule && (!t.on.thing || bound.includes(t.on.thing)), log);
  }

  s.tick += a.ticks;
  resolveHazards(w, s, log);
  checkEnding(w, s, log);
  if (!s.ended && s.mode === "timed" && w.def.deadline !== undefined && s.tick >= w.def.deadline) {
    s.ended = { kind: "deadline" };
    log.push("== The event has run its course. Time is up. ==");
  }

  let lifeOver: StepResult["lifeOver"] = null;
  if (!s.people[actor].alive) lifeOver = "death";
  else if (checkMissions(w, s, log)) lifeOver = "goal";
  if (lifeOver === "death") checkMissions(w, s, log);

  if (lifeOver) {
    const mine = s.missions.find((m) => m.owner === actor && m.status === "active");
    if (mine) mine.status = "open";
    const p = s.people[actor];
    p.vehicle = null;
    for (const q of Object.values(s.people)) if (q.following === actor) q.following = null;
    // A life's own obstacles leave with it: its threats disperse and its temporary
    // barriers clear. (Story-trigger consequences persist; these were scaffolding.)
    for (const [id, t] of Object.entries(s.things)) {
      if (t.props.owner !== actor) continue;
      const kind = w.things.get(id)?.kind;
      if (kind === "threat") {
        t.location = null;
        t.props.active = false;
      } else if (kind === "barrier" && t.props.temporary) {
        t.props.blocks = "none";
        t.props.locked = false;
      }
    }
    log.push(lifeOver === "death" ? `-- ${nameOf(w, actor)}'s life is over. --` : `-- ${nameOf(w, actor)}'s part is done. --`);
    s.actor = null;
  }
  return { log, lifeOver };
}
