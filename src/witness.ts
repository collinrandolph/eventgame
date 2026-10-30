// Witnesses: proven routes (endings, life plans) saved as replayable steps.
// Replaying re-checks every action's legality against the current world, so a
// passing replay is a real proof, just without the search. Only when a replay
// breaks (the world changed under it) does the checker search again.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { listActions, passable, stepMut } from "./engine.js";
import { assignLife, pool, prepareNextLife } from "./lives.js";
import type { Step } from "./solver.js";
import type { Action, Mode, State } from "./types.js";
import { type World, initialState } from "./world.js";

export interface ReplayResult {
  ok: boolean;
  state: State;
  /** Index of the step that was illegal, when not ok. */
  failedAt?: number;
  reason?: string;
}

const sameAction = (a: Action, b: Action) =>
  a.kind === b.kind &&
  (a.kind !== "rule" || (b.kind === "rule" && a.rule === b.rule && JSON.stringify(a.bind) === JSON.stringify(b.bind)));

/** Replay steps from a fresh world. Every action must be legal when it's taken. */
export function replay(w: World, mode: Mode, steps: Step[]): ReplayResult {
  let s = initialState(w, mode);
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const fail = (reason: string): ReplayResult => ({ ok: false, state: s, failedAt: i, reason });
    if ("life" in st) {
      if (s.actor) return fail(`a life is still active when ${st.life} should start`);
      const prepared = prepareNextLife(w, s).state;
      if (!pool(w, prepared).includes(st.life)) return fail(`${st.life} is not in the pool`);
      s = assignLife(w, prepared, st.life).state;
      continue;
    }
    if (!s.actor || s.ended) return fail("no active life");
    const a = st.act;
    if (a.kind === "move" || a.kind === "flee") {
      const me = s.people[s.actor];
      const c = w.connections.get(a.conn);
      if (!c || (c.a !== me.location && c.b !== me.location) || !passable(w, s, a.conn, me.vehicle !== null)) return fail(`can't ${a.kind} along ${a.conn}`);
    } else if (a.kind === "rule" && !listActions(w, s).some((x) => sameAction(x, a))) {
      return fail(`rule ${a.rule} isn't available`);
    }
    stepMut(w, s, a);
  }
  return { ok: true, state: s };
}

// ---------- the witness file: worlds/<id>.witness.json ----------

export interface WitnessFile {
  world: string;
  entries: Record<string, Step[]>;
  /** Single-life reach per playable character. It can't be replayed (it's mostly "can't"),
   *  so it's cached against a hash of the world and its rule files instead. */
  reach?: { hash: string; lives: Record<string, string[]> };
}

export function witnessPath(worldFile: string): string {
  return worldFile.replace(/\.json$/, ".witness.json");
}

/** Hash of the world file and the rule sets it loads; any edit to either changes it. */
export function worldHash(worldFile: string): string {
  const raw = readFileSync(worldFile);
  const h = createHash("sha1").update(raw);
  for (const r of (JSON.parse(raw.toString("utf8")).ruleSets ?? []) as string[]) {
    const p = `rules/${r}.json`;
    if (existsSync(p)) h.update(readFileSync(p));
  }
  return h.digest("hex");
}

export function loadWitnesses(worldFile: string, w: World): WitnessFile {
  const p = witnessPath(worldFile);
  if (!existsSync(p)) return { world: w.def.id, entries: {} };
  return JSON.parse(readFileSync(p, "utf8")) as WitnessFile;
}

export function saveWitnesses(worldFile: string, file: WitnessFile): void {
  writeFileSync(witnessPath(worldFile), JSON.stringify(file) + "\n");
}
