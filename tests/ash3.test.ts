// Ash River, three endings: the generation rules applied to a real world.
import { describe as group, expect, it } from "vitest";
import { checkLifePlan, checkMilestones, checkStructure, proveEnding, singleLifeReach } from "../src/lifecheck.js";
import { loadWorld } from "../src/world.js";

const w = loadWorld("worlds/ash-river.json");

group("Ash River (three endings)", () => {
  it("meets every generation rule", () => {
    const failed = checkStructure(w).filter((r) => !r.ok);
    expect(failed.map((r) => `${r.label} (${r.detail})`)).toEqual([]);
  }, 120_000);

  it("has the rule-derived counts: 3 endings, 12 milestones, 15 lives, 6 secrets, 3 encounters, 1 bonus", () => {
    const kinds = (k: string) => (w.def.optionals ?? []).filter((o) => o.kind === k).length;
    expect(w.def.endings.length).toBe(3);
    expect(w.def.milestones!.length).toBe(12);
    expect(w.def.people.filter((p) => p.playable).length).toBe(15);
    expect([kinds("secret"), kinds("encounter"), kinds("bonus")]).toEqual([6, 3, 1]);
  });

  it("every ending's gates are proven hard", () => {
    for (const e of checkMilestones(w).endings) expect(e.gates.length, e.name).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it("no single life can unlock more than two milestones", () => {
    for (const p of w.def.people.filter((x) => x.playable)) expect(singleLifeReach(w, p.id).length, p.name).toBeLessThanOrEqual(2);
  }, 300_000);

  for (const e of ["contact", "destroy", "sever"]) {
    it(`${e} is provable by composing lives`, () => {
      expect(proveEnding(w, "timed", e).status).toBe("reachable");
    }, 300_000);
  }

  it("tier-1 lives' planned paths work played first", () => {
    for (const id of ["omar", "ken", "park", "gus", "lou", "mae", "priya", "marta", "dana"]) {
      expect(checkLifePlan(w, "timed", id).ok, id).toBe(true);
    }
  }, 120_000);
});
