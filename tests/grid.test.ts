import { describe as group, expect, it } from "vitest";
import { describe, listActions, step } from "../src/engine.js";
import { type GridSpec, type GridWorldFile, compileGrid } from "../src/grid.js";
import { assignLife, prepareNextLife } from "../src/lives.js";
import { route, travel } from "../src/nav.js";
import type { State } from "../src/types.js";
import { initialState, loadWorld } from "../src/world.js";

/** Minimal grid world around a set of layers. */
function gridWorld(grid: Partial<GridSpec> & Pick<GridSpec, "layers" | "legend" | "zones">, extra: Partial<GridWorldFile> = {}): GridWorldFile {
  return {
    id: "t",
    name: "test",
    grid: { cellMeters: 2, ticksPerCell: 0.5, floorChangeCells: 4, ...grid },
    things: [],
    people: [],
    rules: [],
    triggers: [],
    endings: [],
    fallbackGoals: [],
    ...extra,
  };
}

const twoRooms = {
  layers: {
    "0": [
      "#########",
      "#aaa+bbb#",
      "#aaa#bbb#",
      "#########",
    ],
  },
  legend: { "0": { a: "a", b: "b" } },
  zones: [
    { id: "a", name: "Room A" },
    { id: "b", name: "Room B" },
  ],
};

group("grid compiler", () => {
  it("turns a door between two zones into a foot connection with distance-based ticks", () => {
    const { def, report } = compileGrid(gridWorld(twoRooms));
    expect(def.locations.map((l) => l.id)).toEqual(["a", "b"]);
    expect(def.connections).toHaveLength(1);
    const c = def.connections[0];
    expect([c.a, c.b]).toEqual(["a", "b"]);
    expect(c.road).toBe(false);
    expect(report.links[0].kind).toBe("portal");
    expect(c.ticks).toBe(Math.round(report.links[0].cells * 0.5));
  });

  it("counts wall-separated rooms inside one zone and keeps it connected through internal doors", () => {
    const { report } = compileGrid(
      gridWorld({
        layers: { "0": ["#########", "#aaa+aaa#", "#aaa#aaa#", "#########"] },
        legend: { "0": { a: "a" } },
        zones: [{ id: "a", name: "A" }],
      }),
    );
    expect(report.zones[0].rooms).toBe(2);
  });

  it("rejects a zone split by a wall with no door", () => {
    expect(() =>
      compileGrid(
        gridWorld({
          layers: { "0": ["#########", "#aaa#aaa#", "#########"] },
          legend: { "0": { a: "a" } },
          zones: [{ id: "a", name: "A" }],
        }),
      ),
    ).toThrow(/zone a is split/);
  });

  it("links layers through matching stairs", () => {
    const { def, report } = compileGrid(
      gridWorld({
        layers: { "1": ["#####", "#uSu#", "#####"], "0": ["#####", "#gSg#", "#####"] },
        legend: { "1": { u: "up" }, "0": { g: "ground" } },
        zones: [
          { id: "up", name: "Upstairs" },
          { id: "ground", name: "Ground" },
        ],
      }),
    );
    expect(report.links[0].kind).toBe("vertical");
    expect(def.locations.find((l) => l.id === "up")!.layer).toBe(1);
  });

  it("rejects stairs with nothing above or below", () => {
    expect(() =>
      compileGrid(gridWorld({ layers: { "0": ["#####", "#gSg#", "#####"] }, legend: { "0": { g: "g" } }, zones: [{ id: "g", name: "G" }] })),
    ).toThrow(/no matching S/);
  });

  it("only makes road links where both zones are roads and the gap is 2+ cells wide", () => {
    const { def } = compileGrid(
      gridWorld({
        layers: { "0": ["aaaa", "aaaa", "#+##", "bbbb", "##++", "cccc"] },
        legend: { "0": { a: "a", b: "b", c: "c" } },
        zones: [
          { id: "a", name: "A", road: true },
          { id: "b", name: "B", road: true },
          { id: "c", name: "C", road: true },
        ],
      }),
    );
    expect(def.connections.find((c) => c.id === "a~b")!.road).toBe(false); // 1 wide
    expect(def.connections.find((c) => c.id === "b~c")!.road).toBe(true); // 2 wide
  });

  it("refuses a barrier on an open boundary", () => {
    const w = gridWorld(
      {
        layers: { "0": ["aabb"] },
        legend: { "0": { a: "a", b: "b" } },
        zones: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        links: [{ at: [1, 0, 0], barrier: "door" }],
      },
      { things: [{ id: "door", name: "door", kind: "barrier", props: { blocks: "all" } }] },
    );
    expect(() => compileGrid(w)).toThrow(/barrier door on an open boundary/);
  });

  it("errors on a missing intended link and warns about unplanned ones", () => {
    const missing = gridWorld({ ...twoRooms, layers: { "0": ["#########", "#aaa#bbb#", "#########"] }, expect: [["a", "b"]] });
    expect(() => compileGrid(missing)).toThrow(/expected link a~b is missing/);
    const extra = compileGrid(gridWorld({ ...twoRooms, expect: [] }));
    expect(extra.report.warnings[0]).toMatch(/unplanned link a~b/);
  });

  it("places things and people by cell and rejects placements on walls", () => {
    const ok = compileGrid(gridWorld(twoRooms, { things: [{ id: "box", name: "box", kind: "item", at: [6, 2, 0] }] }));
    expect(ok.def.things[0].location).toBe("b");
    expect(() => compileGrid(gridWorld(twoRooms, { things: [{ id: "box", name: "box", kind: "item", at: [4, 2, 0] }] }))).toThrow(
      /not floor in any zone/,
    );
  });
});

group("Ash River as a grid", () => {
  const w = loadWorld("worlds/ash-river-classic.json");

  it("compiles with every intended link and no unplanned ones", () => {
    expect(w.spatial!.warnings).toEqual([]);
    expect(w.spatial!.zones.map((z) => z.z).sort()).toEqual(expect.arrayContaining([-1, 0, 1]));
  });

  it("the sewer is a new way into the lab: manhole, sewer, pried hatch, tunnel, stairs", () => {
    let s: State = assignLife(w, prepareNextLife(w, initialState(w, "timed")).state, "dana").state;
    const act = (text: string) => {
      const a = listActions(w, s).find((x) => describe(w, s, x).includes(text));
      if (!a) throw new Error(`no "${text}": ${listActions(w, s).map((x) => describe(w, s, x)).join(" | ")}`);
      s = step(w, s, a).state;
    };
    const alley = w.def.locations.find((l) => l.name.startsWith("Linden Alley"))!.id;
    s = travel(w, s, alley).state;
    act("Pick up a crowbar"); // Dana's own crowbar, left in the alley
    s = travel(w, s, "sewer").state; // the hatch is shut, so the only way in is the manhole
    act("Pry open the rusted maintenance hatch");
    act("Go to Utility Tunnel");
    act("Go to Kessler Lab, basement");
    act("Go to Kessler Lab, main lab");
    expect(s.people.dana.location).toBe("lab");
    expect(s.things.lab_door.props.locked).toBe(true); // never touched the front door
  });

  it("vehicles can't use stairs, doors, manholes or the fence", () => {
    const between = (a: string, b: string) => w.def.connections.filter((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
    const byBarrier = (id: string) => w.def.connections.find((c) => c.barrier === id)!;
    expect(between("lab", "lab_basement").every((c) => !c.road)).toBe(true); // stairs
    expect(between("lab_basement", "tunnel")[0].road).toBe(false);
    expect(byBarrier("lab_door").road).toBe(false);
    expect(byBarrier("yard_fence").road).toBe(false);
    expect(w.def.connections.filter((c) => c.a === "sewer" || c.b === "sewer").every((c) => !c.road)).toBe(true);
    expect(byBarrier("yard_gate").road).toBe(true);
  });

  it("turns the street network into intersections and segments, folding empty runs", () => {
    const zones = w.spatial!.zones;
    const live = zones.filter((z) => z.street && !z.folded);
    expect(zones.filter((z) => z.street === "intersection").length).toBeGreaterThan(15);
    expect(zones.some((z) => z.folded)).toBe(true);
    expect(live.length).toBeLessThan(zones.filter((z) => z.street).length);
    expect(w.spatial!.links.some((l) => l.kind === "street")).toBe(true);
    // Alleys are 1 cell wide: never drivable.
    const alley = w.def.locations.find((l) => l.name.startsWith("Linden Alley"))!;
    expect(w.def.connections.filter((c) => c.a === alley.id || c.b === alley.id).every((c) => !c.road)).toBe(true);
  });

  it("every enterable building can be reached from the street network on foot", () => {
    let s: State = assignLife(w, prepareNextLife(w, initialState(w, "timed")).state, "theo").state;
    for (const id of ["hospital", "police", "school", "plaza"]) expect(route(w, s, id)).not.toBeNull();
  });
});
