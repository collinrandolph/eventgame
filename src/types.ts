// Core data model for the EVENT kernel. Everything here is plain JSON so a
// world can be authored, saved, diffed and tested without any rendering.
//
// Game systems live in the engine as generic conditions and effects driven by
// data props (see SYSTEMS below). Worlds and lives are data built on them.

export type Value = boolean | number | string | null;
export type Props = Record<string, Value>;

/** "actor"/"self" = the person a rule or goal is about, "#id" = literal id, otherwise a rule param name. */
export type Ref = string;

export type Mode = "timed" | "untimed";

/**
 * SYSTEMS and the props that drive them.
 *
 * Machine  (fixture) machine:true · circuit? (needs power) · skill? · tool? (held item prop) ·
 *          input? (item prop, held or here) · consumes? (input is used up) · needsClue? ·
 *          yieldsFact? · yieldsClue? · recordsTo? (item that gets yieldsClue as its `reveals`) ·
 *          needsFact? ("a|b": milestones it needs) · reusable? (default: works once) · banishes? ("loc|loc": drives the dark out) · yieldsOnBanish? (fact, only if it did)
 * Power    (fixture) source:true · feeds ("a|b" circuits) · online. Operating a source brings it online.
 * Access   (barrier) blocks: all|vehicles|none · locked/lockId (key) · keypad (clue) · cuttable ·
 *          pryable · ramable · authority (opened by the authority skill)
 * Hazard   effects: collapse (link impassable) · fire (location: entering kills; ground items burn)
 * Threat   (threat) strength · active. Owned by a life: active only during it, gone when it ends.
 *          Items with weapon >= strength win a fight; otherwise fighting kills. Flee goes back.
 * Clue     items: reveals · fixtures: observe (anyone), inspect + inspectSkill (skilled) ·
 *          people: tells · characters: knows · world deductions: clues -> conclusion
 * Escort   (person) leadable
 * Vehicle  (vehicle) key · heavy (can ram) · explosive
 * Sabotage (fixture) core:true · weakness (clue) · destroyedFact. Needs an explosive vehicle and an igniter.
 * Skills   science · engineering · authority · medicine · combat. Items with teaches:<skill> stand in.
 */
export const SKILLS = ["science", "engineering", "authority", "medicine", "combat"] as const;

// ---------- Static world definition (authored data) ----------

export interface LocationDef {
  id: string;
  name: string;
  desc?: string;
  props?: Props;
  /** Grid layer (0 = ground). Static: not copied into runtime state. */
  layer?: number;
  /** Set for automatic street zones compiled from a grid. */
  street?: "intersection" | "segment";
}

export interface ConnectionDef {
  id: string;
  a: string;
  b: string;
  ticks: number;
  /** Vehicles can only use road connections. */
  road: boolean;
  /** Id of a barrier thing sitting on this connection. */
  barrier?: string;
}

export type ThingKind = "item" | "barrier" | "vehicle" | "fixture" | "threat";

/**
 * Life gating: a thing or person with props.owner = <person id> exists and can
 * be encountered from the start, but nothing can interact with it until that
 * owner's life has begun.
 */
export interface ThingDef {
  id: string;
  name: string;
  kind: ThingKind;
  /** Location id, person id (carried), connection id (barriers), or null (destroyed). */
  location: string | null;
  props?: Props;
}

export type Category = "ordinary" | "skilled" | "expert";

export interface Subobjective {
  /** Unique across the world, e.g. "dana.back_door". Triggers can fire on it. */
  id: string;
  text: string;
  done: Cond;
  /** The life's story event: how it moves the whole story forward. Exactly one per life. */
  story?: boolean;
  /** For the story event: what it contributes, as "clue:<token>", "fact:<name>", "power:<circuit>", "open:<barrier>" or "item:<thing>". */
  feeds?: string;
}

/**
 * One life: a planned puzzle. Subobjectives aren't required, but in order they
 * form a path the validator proves works. The life ends when the objective is
 * done and the character stands at the destination.
 */
export interface LifeDef {
  /** The life only applies if this holds at spawn; otherwise a fallback is used. */
  when?: Cond;
  objective: { text: string; done: Cond; completeText?: string };
  destination?: { at: string; text: string };
  subobjectives: Subobjective[];
  obstacle: { text: string };
  /** Applied when the life begins: obstacles that arrive with it (hordes, barricades). */
  spawn?: Effect[];
}

/** Used when a person has no life of their own (or theirs no longer applies). */
export interface GoalTemplate {
  text: string;
  when?: Cond;
  done: Cond;
  completeText?: string;
}

export interface PersonDef {
  id: string;
  name: string;
  role?: string;
  playable: boolean;
  category?: Category;
  narrative?: string;
  location: string;
  /** Character knowledge: handed to the player when this person is played. */
  knows?: string[];
  /** Skills, from SKILLS. */
  abilities?: string[];
  life?: LifeDef;
  props?: Props;
}

export interface RuleParam {
  kind: ThingKind | "person";
  /**
   * Where candidates come from, relative to the actor:
   * held, here (on the ground), reach (held or here), adjacent (barrier on a
   * connection touching here), others (held by another person here), driving.
   */
  from: "held" | "here" | "reach" | "adjacent" | "others" | "driving";
}

export interface Rule {
  id: string;
  params?: Record<string, RuleParam>;
  requires?: Cond[];
  effects: Effect[];
  ticks: number;
  /** Template: {actor} and {paramName} are replaced with names. */
  text: string;
  /** Label for the action menu; defaults to text. */
  label?: string;
  /** Excluded from solver search (never needed to reach an ending, only bloats state space). */
  solverSkip?: boolean;
  /**
   * The solver applies this automatically whenever it is available instead of
   * branching on it (e.g. picking up items: holding more is almost never worse,
   * and choosing every subset explodes the state space).
   */
  solverAuto?: boolean;
  /** Allowed while a threat blocks the actor (fight rules). Everything else waits. */
  duringThreat?: boolean;
}

/**
 * A story trigger: fires once, as a consequence of something a character does.
 * Never on a timer, so whoever causes the change sees it happen.
 */
export interface TriggerDef {
  id: string;
  /** Only during this person's life. */
  life?: string;
  on: { rule: string; thing?: string } | { enter: string } | { sub: string };
  when?: Cond;
  effects: Effect[];
  text: string;
}

/** Clues -> conclusion, e.g. three rhythms -> the signal pattern. Compiled into a rule. */
export interface Deduction {
  id: string;
  needs: string[];
  yields: string;
  text: string;
  ticks: number;
}

/** A story milestone: a named fact the endings are built from. Tiered; may require earlier milestones. */
export interface Milestone {
  /** The fact that marks it. */
  id: string;
  name: string;
  tier: number;
  /** Milestones this one can't happen without (proven by the validator). */
  requires?: string[];
}

/**
 * A planned side destination. Reaching it means operating its fixture (a machine whose
 * needsFact names the milestones that unlock it, and whose yieldsFact is `found.<id>`).
 */
export interface Optional {
  id: string;
  kind: "bonus" | "secret" | "encounter";
  name: string;
  /** Secrets belong to an ending; encounters and the bonus don't. */
  ending?: string;
  fixture: string;
  text: string;
}

export interface EndingDef {
  id: string;
  name: string;
  /** Its three tier-2 milestones (the structure check proves each is a hard gate). */
  milestones?: string[];
  when: Cond;
  text: string;
}

export interface WorldDef {
  id: string;
  name: string;
  locations: LocationDef[];
  connections: ConnectionDef[];
  things: ThingDef[];
  people: PersonDef[];
  rules: Rule[];
  triggers: TriggerDef[];
  deductions?: Deduction[];
  milestones?: Milestone[];
  /** Planned side destinations: content at the end of a path, gated by milestones from different lives. */
  optionals?: Optional[];
  endings: EndingDef[];
  /** Timed mode: the event reaches its own conclusion at this tick and the run ends. */
  deadline?: number;
  /** Used when a person has no life (or it no longer applies). First one not already done wins. */
  fallbackGoals: GoalTemplate[];
}

// ---------- Condition and effect language ----------

export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { fact: string; eq?: Value }
  | { prop: [Ref, string]; eq?: Value }
  | { propMatch: [[Ref, string], [Ref, string]] }
  | { at: [Ref, Ref] }
  | { together: [Ref, Ref] }
  | { holds: [Ref, Ref] }
  | { ability: [Ref, string] }
  | { knows: string }
  | { knowsProp: [Ref, string] }
  | { alive: Ref }
  | { inVehicle: [Ref, Ref] }
  | { onFoot: Ref }
  /** This person's life has started (current or past). */
  | { played: Ref }
  | { isActor: Ref }
  /** Machine system: the actor can operate this machine now (power, skill, tool, input, clue). */
  | { ready: [Ref, Ref] }
  /** Power system: the thing's circuit has an online source. */
  | { powered: Ref }
  /** The actor has the skill named by thing.props[key], or holds an item that teaches it. */
  | { skilledFor: [Ref, Ref, string] }
  /** Threat system: the actor holds a weapon at least as strong as the threat. */
  | { armedFor: [Ref, Ref] }
  /** Every fact named in thing.props[key] ("a|b") holds: milestones a rule's target needs. */
  | { propFacts: [Ref, string] };

export type Effect =
  | { set: [Ref, string]; value: Value }
  | { fact: string; value: Value }
  | { moveTo: [Ref, Ref | "here" | "nowhere"] }
  | { learn: string }
  | { learnProp: [Ref, string] }
  | { kill: Ref }
  | { follow: Ref }
  | { board: Ref }
  | { exitVehicle: true }
  | { collapse: string }
  | { setLoc: [string, string]; value: Value }
  | { burn: string }
  /** Machine system: run the machine's outputs (and consume its input). */
  | { operate: [Ref, Ref] }
  /** Hazard system: a fire at a location. Entering kills; items on the ground burn. */
  | { fire: string };

// ---------- Mutable runtime state ----------

export interface ThingState {
  location: string | null;
  props: Props;
}

export interface PersonState {
  location: string;
  /** Where this person came from on their last move (fleeing goes back here). */
  from: string | null;
  alive: boolean;
  vehicle: string | null;
  following: string | null;
  props: Props;
}

/** A life's mission. Points at its definition (resolve with lifeOf) so states never copy rule data. */
export interface Mission {
  owner: string;
  /** "life" = the owner's LifeDef; "fallback" = the world's fallbackGoals[index]. */
  src: "life" | "fallback";
  index: number;
  /** active = the current life, open = owner died with it unfinished, complete. */
  status: "active" | "open" | "complete";
  /** Ids of subobjectives completed so far. */
  subs: string[];
}

export interface State {
  mode: Mode;
  tick: number;
  /** Number of lives started so far. */
  lives: number;
  facts: Record<string, Value>;
  locations: Record<string, Props>;
  collapsed: string[];
  things: Record<string, ThingState>;
  people: Record<string, PersonState>;
  /** Player knowledge: survives every handoff. */
  knowledge: string[];
  played: string[];
  /** [category, narrative] of each played life, oldest first. */
  history: [string, string][];
  actor: string | null;
  missions: Mission[];
  /** Triggers that have fired. */
  fired: string[];
  ended:
    | null
    | { kind: "ending"; ending: string }
    | { kind: "exhausted" }
    | { kind: "abandoned" }
    | { kind: "deadline" };
}

// ---------- Actions ----------

export type Action =
  | { kind: "move"; conn: string; to: string; ticks: number }
  | { kind: "flee"; conn: string; to: string; ticks: number }
  | { kind: "wait"; ticks: number }
  | { kind: "rule"; rule: string; bind: Record<string, string>; ticks: number };

export interface StepResult {
  state: State;
  log: string[];
  lifeOver: null | "goal" | "death";
}
