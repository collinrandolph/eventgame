// Mission-break bug finder. Invariant: while a character is alive, their
// mission can always still be completed. Obstacles may kill them; nothing may
// make the mission impossible. Any state that violates this is a world bug.
//
// Plays many random runs (random lives, random actions) and checks the
// invariant at every life start and after every action.

import { describe, listActions, step } from "./engine.js";
import { assignLife, pickNext, prepareNextLife, rng } from "./lives.js";
import { missionTargets } from "./lifecheck.js";
import { solve, stateHash } from "./solver.js";
import type { Mode, State } from "./types.js";
import { type World, initialState, lifeOf, nameOf } from "./world.js";

export interface MissionBreak {
  seed: number;
  who: string;
  mission: string;
  /** "broken" = proven impossible; "unknown" = search ran out of budget. */
  status: "broken" | "unknown";
  trace: string[];
}

export interface FuzzOpts {
  mode: Mode;
  runs: number;
  maxSteps: number;
  seed?: number;
  maxNodes?: number;
}

/** "ok" | "broken" | "unknown" for the current life's mission. */
export function missionStatus(w: World, s: State, maxNodes = 5_000): "ok" | "broken" | "unknown" {
  if (!s.actor || s.ended) return "ok";
  if (w.locations.has(s.people[s.actor].location) && s.locations[s.people[s.actor].location]?.lethal) return "broken";
  // The deadline is pressure, like death: running out of time doesn't break a mission. Judge without it.
  const r = solve(w, { ...s, mode: "untimed" }, { withinLife: true, targets: missionTargets(w, s, s.actor), maxNodes });
  return r.status === "reachable" ? "ok" : r.status === "unreachable" ? "broken" : "unknown";
}

export function findMissionBreaks(w: World, opts: FuzzOpts): MissionBreak[] {
  const found: MissionBreak[] = [];
  const seen = new Map<string, ReturnType<typeof missionStatus>>();
  const base = opts.seed ?? 1;

  for (let run = 0; run < opts.runs; run++) {
    const seed = base + run;
    const random = rng(seed);
    let s = initialState(w, opts.mode);
    const trace: string[] = [];

    const check = (): boolean => {
      const key = stateHash(s);
      let status = seen.get(key);
      if (!status) seen.set(key, (status = missionStatus(w, s, opts.maxNodes)));
      if (status === "ok") return true;
      const m = s.missions.find((x) => x.owner === s.actor && x.status === "active")!;
      found.push({ seed, who: nameOf(w, s.actor), mission: lifeOf(w, m).objective.text, status, trace: [...trace] });
      return false;
    };

    for (let i = 0; i < opts.maxSteps && !s.ended; i++) {
      if (!s.actor) {
        s = prepareNextLife(w, s).state;
        if (s.ended) break;
        const pid = pickNext(w, s, random);
        s = assignLife(w, s, pid).state;
        trace.push(`[life ${s.lives}: ${nameOf(w, pid)}]`);
        if (!check()) break;
        continue;
      }
      const actions = listActions(w, s);
      const a = actions[Math.floor(random() * actions.length)];
      trace.push(`${nameOf(w, s.actor)}: ${describe(w, s, a)}`);
      s = step(w, s, a).state;
      if (!check()) break;
    }
  }
  return found;
}
