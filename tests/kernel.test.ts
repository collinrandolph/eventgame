import { describe as group, expect, it } from "vitest";
import { activeThreatAt, describe, listActions, machineReady, powered, step } from "../src/engine.js";
import { checkLifePlan, checkStoryEvents, proveEnding, withoutSkill } from "../src/lifecheck.js";
import { assignLife, pickNext, pool, prepareNextLife, rng, weightFor } from "../src/lives.js";
import { findMissionBreaks, missionStatus } from "../src/missions.js";
import { route, travel } from "../src/nav.js";
import { isHopeless, solve } from "../src/solver.js";
import type { Mode, State } from "../src/types.js";
import { compile, initialState, lifeOf, loadWorld } from "../src/world.js";

const w = loadWorld("worlds/ash-river-classic.json");
const fresh = (mode: Mode = "timed") => initialState(w, mode);

/** Begin the next life as a specific person (bypassing the random pick). */
function live(s: State, pid: string): State {
  return assignLife(w, prepareNextLife(w, s).state, pid).state;
}

/** Perform the first action whose description contains `text`. */
function act(s: State, text: string) {
  const a = listActions(w, s).find((x) => describe(w, s, x).includes(text));
  if (!a) throw new Error(`no action "${text}". Have:\n${listActions(w, s).map((x) => describe(w, s, x)).join("\n")}`);
  return step(w, s, a);
}
const run = (s: State, ...texts: string[]) => texts.reduce((x, t) => act(x, t).state, s);
const can = (s: State, text: string) => listActions(w, s).some((a) => describe(w, s, a).includes(text));
/** Travel by the quickest open route (around threats). */
const go = (s: State, to: string, avoid: string[] = []) => travel(w, s, to, { avoid });

/** Hale: from her office, down to the basement, breaker on, recording in hand, up into the main lab. */
function haleAtAnalyzer(): State {
  let s = live(fresh(), "hale");
  s = run(s, "Pick up Dr. Hale's notebook");
  s = go(s, "lab_basement").state;
  s = run(s, "Use the lab's tripped breaker", "Pick up the signal recording");
  return go(s, "lab").state;
}

group("machines and power", () => {
  it("the analyzer needs power, a sample and a scientist", () => {
    let s = live(fresh(), "hale");
    expect(machineReady(w, s, "hale", "analyzer")).toBe(false); // no power, no recording in reach
    s = haleAtAnalyzer();
    expect(powered(s, "analyzer")).toBe(true);
    expect(machineReady(w, s, "hale", "analyzer")).toBe(true);
    expect(machineReady(w, s, "ken", "analyzer")).toBe(false); // no science
  });

  it("operating the analyzer yields knowledge and writes it into the notebook", () => {
    const s = act(haleAtAnalyzer(), "Use the spectrum analyzer").state;
    expect(s.knowledge).toContain("signal.pattern");
    expect(s.facts["signal.decoded"]).toBe(true);
    expect(s.things.notes.props.reveals).toBe("signal.pattern");
  });

  it("either power source feeds the array: the backup generator runs on diesel", () => {
    const s = fresh();
    expect(powered(s, "console")).toBe(false);
    s.things.generator.props.online = true;
    expect(powered(s, "console")).toBe(true);
  });
});

group("story triggers and hazards", () => {
  it("Hale's analysis overloads the machine and starts the lab fire, which she witnesses and survives", () => {
    const r = act(haleAtAnalyzer(), "Use the spectrum analyzer");
    expect(r.state.fired).toContain("lab_fire");
    expect(r.state.locations.lab.fire).toBe(true);
    expect(r.state.people.hale.alive).toBe(true);
    expect(r.log.join("\n")).toContain("Fire races across the main lab");
  });

  it("walking into a fire kills", () => {
    let s = act(haleAtAnalyzer(), "Use the spectrum analyzer").state;
    s = go(s, "lab_basement").state;
    expect(s.people.hale.alive).toBe(true);
    s = act(s, "Go to Kessler Lab, main lab").state;
    expect(s.people.hale.alive).toBe(false);
  });

  it("the bridge gives way only in Theo's life, when he reaches it", () => {
    let s = live(fresh(), "dana");
    s.people.dana.location = "bridge"; // someone else on the bridge: nothing happens
    expect(s.collapsed).not.toContain("c_bridge_depot");
    s = live({ ...fresh(), played: [] }, "theo");
    s = go(s, "bridge").state;
    expect(s.fired).toContain("bridge_collapse");
    expect(s.collapsed).toContain("c_bridge_depot");
  });

  it("Rosa getting the ward keys fills the main stairs with smoke", () => {
    let s = live(fresh(), "rosa");
    s = act(s, "Pick up the ward keys").state;
    expect(s.collapsed).toContain("main_stairs");
    expect(route(w, s, "hospital_ward")).toBeNull(); // main stairs gone, service door still locked
    s = run(s, "Unlock the ward's service-stair door"); // her keys open the way round
    s = go(s, "hospital_ward").state;
    expect(s.people.rosa.location).toBe("hospital_ward");
  });
});

group("threats", () => {
  /** Ken steps out of the precinct into his horde on Harbor St (routes go around threats, so aim at it). */
  const kenOutside = () => {
    const s = live(fresh(), "ken");
    return go(s, s.things.horde_harbor.location!).state;
  };

  it("a life's horde arrives with it and stops travel", () => {
    expect(fresh().things.horde_harbor.props.active).toBe(false);
    const s = kenOutside();
    expect(activeThreatAt(w, s, s.people.ken.location)).toBe("horde_harbor");
  });

  it("inside a threat the only options are fighting or fleeing", () => {
    const s = kenOutside();
    const labels = listActions(w, s).map((a) => describe(w, s, a));
    expect(labels.every((l) => l.startsWith("Fight") || l.startsWith("Flee"))).toBe(true);
    expect(act(s, "Flee back").state.people.ken.location).toBe("police");
  });

  it("fighting without a weapon kills; with one it clears the threat", () => {
    expect(act(kenOutside(), "without a weapon").state.people.ken.alive).toBe(false);
    let s = live(fresh(), "ken");
    s = run(s, "Pick up the evidence room key", "Unlock the evidence room door");
    s = run(go(s, "evidence").state, "Pick up bolt cutters");
    s = go(s, s.things.horde_harbor.location!).state;
    s = act(s, "Fight a horde on Harbor St").state;
    expect(s.things.horde_harbor.props.active).toBe(false);
  });

  it("threats leave with their life", () => {
    const s = act(kenOutside(), "without a weapon").state;
    expect(s.actor).toBeNull();
    expect(s.things.horde_harbor.location).toBeNull();
  });
});

group("clues", () => {
  it("three observations deduce the signal pattern", () => {
    let s = live(fresh(), "theo");
    s.knowledge.push("obs.plaza", "obs.hill", "obs.hospital");
    expect(can(s, "Piece it together")).toBe(true);
    s = act(s, "Piece it together").state;
    expect(s.knowledge).toContain("signal.pattern");
  });

  it("people tell you things once their life's mission is open", () => {
    let s = live(fresh(), "dana");
    s.people.dana.location = "school";
    expect(can(s, "Talk to Ms. Okafor")).toBe(true);
    s = act(s, "Talk to Ms. Okafor").state;
    expect(s.knowledge).toContain("obs.plaza");
  });
});

group("lives", () => {
  it("every life's planned path works from its start, obstacle and triggers included", () => {
    for (const p of w.def.people.filter((x) => x.life)) {
      const rep = checkLifePlan(w, "timed", p.id);
      expect(rep.ok, `${p.name}: ${JSON.stringify(rep.steps)}`).toBe(true);
    }
  });

  it("every story event feeds something an ending depends on", () => {
    expect(checkStoryEvents(w)).toEqual([]);
  });

  it("a life ends at its destination once the objective is done, not before", () => {
    let s = live(fresh(), "ken");
    s = run(s, "Pick up the evidence room key", "Unlock the evidence room door");
    s = run(go(s, "evidence").state, "Pick up bolt cutters");
    expect(s.actor).toBe("ken"); // objective done, but not at the checkpoint yet
    s = act(go(s, s.things.horde_harbor.location!).state, "Fight").state;
    const r = go(s, "checkpoint");
    expect(r.lifeOver).toBe("goal");
  });

  it("subobjectives tick off as they become true, by any means", () => {
    let s = live(fresh(), "ken");
    s = act(s, "Pick up the evidence room key").state;
    expect(s.missions[0].subs).toContain("ken.key");
  });

  it("obstacles arrive with the life", () => {
    const s = live(fresh(), "dana");
    expect(s.things.school_front.props.blocks).toBe("all");
    expect(s.things.horde_1st.props.active).toBe(true);
  });
});

group("gating and protection", () => {
  it("a life's items are visible but can't be used before it", () => {
    let s = live(fresh(), "theo");
    s.people.theo.location = s.things.crowbar.location!;
    expect(can(s, "Pick up a crowbar")).toBe(false);
  });

  it("future characters can't be led and can't die", () => {
    const s = live(fresh(), "dana");
    s.people.theo.location = "apartments";
    s.people.dana.location = "apartments";
    expect(can(s, "Bring Theo Grant")).toBe(false);
  });

  it("finishing a dead character's mission doesn't end the current life", () => {
    // Dana dies at her horde before reaching Milo; her obstacles (horde, barricade) leave with her.
    let s = live(fresh(), "dana");
    s = act(go(s, s.things.horde_1st.location!).state, "without a weapon").state;
    expect(s.missions[0].status).toBe("open");
    expect(s.things.school_front.props.blocks).toBe("none");
    s = live(s, "rosa");
    s = run(go(s, "school").state, "Bring Milo Ruiz");
    expect(s.actor).toBe("rosa"); // Rosa's objective (the kit) isn't done, so the school doesn't end her life
    const r = go(s, "apartments");
    expect(r.state.missions.find((m) => m.owner === "dana")!.status).toBe("complete");
    expect(r.state.actor).toBe("rosa");
    expect(r.state.people.milo.following).toBeNull(); // he has met his final objective
  });

  it("rejects a world that makes a playable character leadable", () => {
    const def = structuredClone(w.def);
    def.people.find((p) => p.id === "theo")!.props = { leadable: true };
    expect(() => compile(def)).toThrow(/can't be leadable/);
  });
});

group("endings", () => {
  it("contact is provable by composing lives", () => {
    expect(proveEnding(w, "timed", "contact").status).toBe("reachable");
  });

  it("destruction is provable by composing lives", () => {
    const r = proveEnding(w, "timed", "destroy");
    expect(r.status).toBe("reachable");
    expect(r.ticks!).toBeLessThan(w.def.deadline! / 2);
  }, 120_000);

  it("science is a shortcut: contact without any scientist", () => {
    expect(proveEnding(withoutSkill(w, "science"), "timed", "contact").status).toBe("reachable");
  });

  it("the deadline ends a timed run", () => {
    let s = live(fresh("timed"), "theo");
    s.tick = w.def.deadline! - 1;
    s = act(s, "Wait").state;
    expect(s.ended).toEqual({ kind: "deadline" });
    let u = live(fresh("untimed"), "theo");
    u.tick = w.def.deadline! - 1;
    u = act(u, "Wait").state;
    expect(u.ended).toBeNull();
  });

  it("detects a world where every ending is gone", () => {
    const s = fresh();
    s.things.tanker.location = null; // no bomb
    s.people.hale.alive = false; // nobody can analyze
    s.things.monitors.location = null; // one of the three observations is gone
    expect(solve(w, s).status).toBe("unreachable");
    expect(isHopeless(w, s)).toBe(true);
  });
});

group("mission-break bug finder", () => {
  it("finds no breakable missions in Ash River", () => {
    for (const mode of ["timed", "untimed"] as Mode[]) {
      const breaks = findMissionBreaks(w, { mode, runs: 4, maxSteps: 60 });
      expect(breaks.filter((b) => b.status === "broken")).toEqual([]);
    }
  }, 120_000);

  it("catches a trigger that destroys what the active life needs", () => {
    const def = structuredClone(w.def);
    def.triggers.find((t) => t.id === "lab_fire")!.effects.push({ moveTo: ["#notes", "nowhere"] });
    const broken = compile(def);
    const pick = (x: State, t: string) => step(broken, x, listActions(broken, x).find((a) => describe(broken, x, a).includes(t))!).state;
    let s = assignLife(broken, prepareNextLife(broken, initialState(broken, "timed")).state, "hale").state;
    s = pick(s, "Pick up Dr. Hale's notebook");
    s = travel(broken, s, "lab_basement").state;
    s = pick(s, "Use the lab's tripped breaker");
    s = pick(s, "Pick up the signal recording");
    s = travel(broken, s, "lab").state;
    s = pick(s, "Use the spectrum analyzer");
    expect(s.things.notes.location).toBeNull();
    expect(missionStatus(broken, s)).toBe("broken");
  });
});

group("weighted life selection", () => {
  it("penalises repeating the last life's category and narrative", () => {
    const s = live(fresh(), "mae"); // skilled / escape
    s.actor = null;
    expect(weightFor(w, s, "theo")).toBeLessThan(weightFor(w, s, "rosa")); // theo shares "escape"
    expect(weightFor(w, s, "ken")).toBeLessThan(weightFor(w, s, "rosa")); // ken shares "skilled"
    expect(pool(w, s)).not.toContain("mae");
  });

  it("is reproducible from a seed", () => {
    const s = prepareNextLife(w, fresh()).state;
    expect(pickNext(w, s, rng(7))).toBe(pickNext(w, s, rng(7)));
  });

  it("lives resolve to their own definition", () => {
    const s = live(fresh(), "hale");
    expect(lifeOf(w, s.missions[0]).objective.text).toMatch(/Decode the signal/);
  });
});
