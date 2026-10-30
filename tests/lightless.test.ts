// Harrow Court ("Lightless"): the second event, and the systems it added.
import { describe as group, expect, it } from "vitest";
import { darkAt, describe, listActions, machineReady, passable, step } from "../src/engine.js";
import { checkLifePlan, checkStoryEvents, proveEnding } from "../src/lifecheck.js";
import { assignLife, prepareNextLife } from "../src/lives.js";
import { route, travel } from "../src/nav.js";
import type { State } from "../src/types.js";
import { initialState, loadWorld } from "../src/world.js";

const w = loadWorld("worlds/harrow-court.json");
const fresh = () => initialState(w, "timed");
const live = (s: State, pid: string) => assignLife(w, prepareNextLife(w, s).state, pid).state;
const act = (s: State, text: string) => {
  const a = listActions(w, s).find((x) => describe(w, s, x).includes(text));
  if (!a) throw new Error(`no "${text}": ${listActions(w, s).map((x) => describe(w, s, x)).join(" | ")}`);
  return step(w, s, a).state;
};
const conn = (a: string, b: string) => w.def.connections.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))!;

group("the map: a vertical complex", () => {
  it("compiles to 14 layers with empty stairwell floors folded away", () => {
    const sp = w.spatial!;
    expect(new Set(sp.zones.map((z) => z.z)).size).toBe(14);
    expect(sp.zones.filter((z) => z.folded).length).toBeGreaterThan(10);
    expect(sp.warnings).toEqual([]);
  });

  it("lifts join lobbies straight to chosen floors, one elevator car serving several", () => {
    expect(conn("lobby_b", "b6").barrier).toBe("elevator_b");
    expect(conn("lobby_b", "b8").barrier).toBe("elevator_b");
  });
});

group("darkness", () => {
  it("entering a claimed zone without light kills; carried light protects", () => {
    let s = live(fresh(), "kai");
    s.people.kai.location = "garage";
    s = act(s, "Go to Switchgear room");
    expect(s.people.kai.alive).toBe(false);
    let n = live(fresh(), "nadia");
    n.people.nadia.location = "garage";
    n = act(n, "Go to Switchgear room"); // her headlamp
    expect(n.people.nadia.alive).toBe(true);
  });

  it("lights on a powered circuit hold the dark back", () => {
    const s = fresh();
    expect(darkAt(s, "switchgear_room")).toBe(true);
    s.things.switchgear.props.online = true; // feeds main, whose lights cover the room
    expect(darkAt(s, "switchgear_room")).toBe(false);
  });

  it("flares burn down as they're used", () => {
    let s = live(fresh(), "sami");
    s = act(s, "Pick up a box of road flares");
    s.people.sami.location = "garage";
    s = act(s, "Go to Switchgear room");
    expect(s.people.sami.alive).toBe(true);
    expect(s.things.flares.props.lightCharges).toBe(2);
  });

  it("a pocket of the dark is a threat beaten by light, not weapons", () => {
    const s = live(fresh(), "iris");
    expect(s.things.dark_b5.props.active).toBe(true);
    expect(route(w, s, "lobby_b")).not.toBeNull(); // the way round: up, across the skybridge, down Tower C
    const path = route(w, s, "lobby_b")!.map((a) => (a.kind === "move" ? a.to : ""));
    expect(path).not.toContain("b5");
  });

  it("the dark spreads only through what people do", () => {
    let s = live(fresh(), "nadia");
    s = travel(w, s, "switchgear_room").state;
    expect(s.locations.garage.dark).toBeFalsy();
    s = act(s, "Use the main switchgear");
    expect(s.fired).toContain("surge");
    expect(s.locations.garage.dark).toBe(true);
    expect(darkAt(s, "garage")).toBe(false); // ...but the power she just restored lights it
  });
});

group("power and access", () => {
  it("elevators run only on power", () => {
    const s = live(fresh(), "kai");
    const lift = conn("lobby_a", "a3").id;
    expect(passable(w, s, lift, false)).toBe(false);
    const on = act(s, "Use Tower A's backup generator");
    expect(passable(w, on, lift, false)).toBe(true);
  });

  it("machine inputs respect life gating: nobody runs the dock generator on Sami's fuel before Sami", () => {
    const s = live(fresh(), "nadia");
    s.people.nadia.location = "dock";
    expect(machineReady(w, s, "nadia", "dock_gen")).toBe(false);
    const sami = live(fresh(), "sami");
    expect(machineReady(w, act(sami, "Pick up a can of diesel"), "sami", "dock_gen")).toBe(true);
  });

  it("blast doors close only with power", () => {
    let s = live(fresh(), "nadia");
    s.people.nadia.location = "garage";
    expect(listActions(w, s).some((a) => describe(w, s, a).startsWith("Close"))).toBe(false);
    s.things.dock_gen.props.online = true;
    s = act(s, "Close the sub-basement blast door");
    expect(s.things.blast_door.props.blocks).toBe("all");
  });
});

group("lives and endings", () => {
  it("every life's planned path works", () => {
    for (const p of w.def.people.filter((x) => x.life)) {
      const r = checkLifePlan(w, "timed", p.id);
      expect(r.ok, `${p.name}: ${JSON.stringify(r.steps)}`).toBe(true);
    }
  });

  it("every story event feeds an ending", () => {
    expect(checkStoryEvents(w)).toEqual([]);
  });

  for (const ending of ["relight", "seal", "return"]) {
    it(`${ending} is provable`, () => {
      expect(proveEnding(w, "timed", ending).status).toBe("reachable");
    });
  }
});
