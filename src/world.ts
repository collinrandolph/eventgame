import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type GridWorldFile, type SpatialReport, compileGrid } from "./grid.js";
import {
  type ConnectionDef,
  type GoalTemplate,
  type LifeDef,
  type LocationDef,
  type Mission,
  type Mode,
  type PersonDef,
  type Rule,
  SKILLS,
  type State,
  type ThingDef,
  type WorldDef,
} from "./types.js";

/** A WorldDef with lookup tables. Immutable for the whole run. */
export interface World {
  def: WorldDef;
  locations: Map<string, LocationDef>;
  connections: Map<string, ConnectionDef>;
  /** Connection ids touching each location. */
  edges: Map<string, string[]>;
  things: Map<string, ThingDef>;
  people: Map<string, PersonDef>;
  rules: Map<string, Rule>;
  /** Present when the world was compiled from a grid. */
  spatial?: SpatialReport;
}

/** Deductions become ordinary rules: know every clue, don't know the conclusion yet. */
function deductionRules(def: WorldDef): Rule[] {
  return (def.deductions ?? []).map((d) => ({
    id: `deduce:${d.id}`,
    requires: [...d.needs.map((k) => ({ knows: k })), { not: { knows: d.yields } }],
    effects: [{ learn: d.yields }],
    ticks: d.ticks,
    label: "Piece it together",
    text: d.text,
  }));
}

export function compile(input: WorldDef): World {
  const have = new Set(input.rules.map((r) => r.id));
  const def: WorldDef = { ...input, rules: [...input.rules, ...deductionRules(input).filter((r) => !have.has(r.id))] };
  const w: World = {
    def,
    locations: new Map(def.locations.map((l) => [l.id, l])),
    connections: new Map(def.connections.map((c) => [c.id, c])),
    edges: new Map(def.locations.map((l) => [l.id, []])),
    things: new Map(def.things.map((t) => [t.id, t])),
    people: new Map(def.people.map((p) => [p.id, p])),
    rules: new Map(def.rules.map((r) => [r.id, r])),
  };
  for (const c of def.connections) {
    w.edges.get(c.a)?.push(c.id);
    w.edges.get(c.b)?.push(c.id);
  }
  validateDef(w);
  return w;
}

/** Catches authoring mistakes: dangling ids, duplicate ids, barriers not on a connection, malformed lives. */
export function validateDef(w: World): void {
  const errors: string[] = [];
  const ids = new Set<string>();
  const all = [...w.def.locations, ...w.def.connections, ...w.def.things, ...w.def.people];
  for (const x of all) {
    if (ids.has(x.id)) errors.push(`duplicate id ${x.id}`);
    ids.add(x.id);
  }
  for (const c of w.def.connections) {
    if (!w.locations.has(c.a)) errors.push(`${c.id}: unknown location ${c.a}`);
    if (!w.locations.has(c.b)) errors.push(`${c.id}: unknown location ${c.b}`);
    if (c.barrier) {
      const b = w.things.get(c.barrier);
      if (!b || b.kind !== "barrier") errors.push(`${c.id}: barrier ${c.barrier} is not a barrier thing`);
      // One barrier may sit on several links (an elevator serving many floors); it lives on one of them.
      else if (!w.def.connections.some((x) => x.barrier === b.id && x.id === b.location)) errors.push(`${b.id}: barrier location must be a connection it sits on`);
    }
  }
  for (const t of w.def.things) {
    if (t.location === null || t.kind === "barrier") continue;
    if (!w.locations.has(t.location) && !w.people.has(t.location)) errors.push(`${t.id}: unknown location ${t.location}`);
    if (t.kind === "threat" && !t.props?.owner) errors.push(`${t.id}: a threat must belong to a life (props.owner)`);
  }
  const subIds = new Set<string>();
  for (const p of w.def.people) {
    if (!w.locations.has(p.location)) errors.push(`${p.id}: unknown location ${p.location}`);
    if (p.playable && p.props?.leadable) errors.push(`${p.id}: playable characters can't be leadable`);
    for (const a of p.abilities ?? []) if (!(SKILLS as readonly string[]).includes(a)) errors.push(`${p.id}: unknown skill ${a}`);
    if (!p.life) continue;
    if (p.life.destination && !w.locations.has(p.life.destination.at)) errors.push(`${p.id}: unknown destination ${p.life.destination.at}`);
    const stories = p.life.subobjectives.filter((s) => s.story);
    if (stories.length !== 1) errors.push(`${p.id}: a life needs exactly one story event (has ${stories.length})`);
    for (const s of p.life.subobjectives) {
      if (subIds.has(s.id)) errors.push(`duplicate subobjective id ${s.id}`);
      subIds.add(s.id);
      if (s.story && !s.feeds) errors.push(`${s.id}: the story event must say what it feeds`);
    }
  }
  for (const t of w.def.triggers) {
    if (t.life && !w.people.has(t.life)) errors.push(`trigger ${t.id}: unknown life ${t.life}`);
    if ("rule" in t.on && !w.rules.has(t.on.rule)) errors.push(`trigger ${t.id}: unknown rule ${t.on.rule}`);
    if ("enter" in t.on && !w.locations.has(t.on.enter)) errors.push(`trigger ${t.id}: unknown location ${t.on.enter}`);
    if ("sub" in t.on && !subIds.has(t.on.sub)) errors.push(`trigger ${t.id}: unknown subobjective ${t.on.sub}`);
  }
  if (errors.length) throw new Error(`World ${w.def.id} is invalid:\n  ${errors.join("\n  ")}`);
}

export function initialState(w: World, mode: Mode): State {
  return {
    mode,
    tick: 0,
    lives: 0,
    facts: {},
    locations: Object.fromEntries(w.def.locations.map((l) => [l.id, { ...(l.props ?? {}) }])),
    collapsed: [],
    things: Object.fromEntries(
      w.def.things.map((t) => [t.id, { location: t.location, props: { ...(t.props ?? {}) } }]),
    ),
    people: Object.fromEntries(
      w.def.people.map((p) => [
        p.id,
        { location: p.location, from: null, alive: true, vehicle: null, following: null, props: { ...(p.props ?? {}) } },
      ]),
    ),
    knowledge: [],
    played: [],
    history: [],
    actor: null,
    missions: [],
    fired: [],
    ended: null,
  };
}

/**
 * Loads a graph world (locations/connections) or a grid world (compiled to a
 * graph). `ruleSets: ["core"]` pulls shared rule libraries from rules/<name>.json
 * next to the worlds folder; a world's own `rules` are added after them.
 */
export function loadWorld(path: string): World {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const libs: Rule[] = (raw.ruleSets ?? []).flatMap((name: string) =>
    JSON.parse(readFileSync(join(dirname(path), "..", "rules", `${name}.json`), "utf8")),
  );
  raw.rules = [...libs, ...(raw.rules ?? [])];
  raw.triggers ??= [];
  if (raw.grid) {
    const { def, report } = compileGrid(raw as GridWorldFile);
    return { ...compile({ ...def, deductions: raw.deductions, milestones: raw.milestones, optionals: raw.optionals, deadline: raw.deadline }), spatial: report };
  }
  return compile(raw as WorldDef);
}

/** A mission's definition, normalised: fallbacks become lives with no subobjectives or destination. */
export function lifeOf(w: World, m: Mission): LifeDef {
  if (m.src === "life") return w.people.get(m.owner)!.life!;
  const g: GoalTemplate = w.def.fallbackGoals[m.index];
  return { objective: g, subobjectives: [], obstacle: { text: "" } };
}

export function nameOf(w: World, id: string | null): string {
  if (id === null) return "nothing";
  return w.locations.get(id)?.name ?? w.things.get(id)?.name ?? w.people.get(id)?.name ?? id;
}
