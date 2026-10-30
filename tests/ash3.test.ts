// Ash River, three endings: the generation rules applied to a real world.
// Endings and life plans replay the saved witnesses (worlds/ash-river.witness.json),
// so these tests take seconds; `npm run check:full` re-proves them from scratch.
import { describe as group, expect, it } from "vitest";
import { checkMilestones, checkStructure, singleLifeReach, skillGaps } from "../src/lifecheck.js";
import { loadWitnesses, replay, worldHash } from "../src/witness.js";
import { loadWorld } from "../src/world.js";

const file = "worlds/ash-river.json";
const w = loadWorld(file);
const lock = loadWitnesses(file, w);

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

  // Uses the reach cached by `npm run check` while the world is unchanged; otherwise searches (~2 min per life).
  it("no single life can unlock more than two milestones", () => {
    const cached = lock.reach?.hash === worldHash(file) ? lock.reach.lives : null;
    for (const p of w.def.people.filter((x) => x.playable)) {
      expect((cached?.[p.id] ?? singleLifeReach(w, p.id)).length, p.name).toBeLessThanOrEqual(2);
    }
  }, 3_600_000);

  it("no skill is required anywhere (every skill has a stand-in or another mechanism)", () => {
    for (const g of skillGaps(w)) expect([...g.endings, ...g.milestones], g.skill).toEqual([]);
  }, 120_000);

  for (const mode of ["timed", "untimed"] as const) {
    for (const e of ["contact", "destroy", "sever"]) {
      it(`${e} (${mode}): the saved witness replays to the ending`, () => {
        const steps = lock.entries[`ending:${mode}:${e}`];
        expect(steps, "no witness saved: run npm run check").toBeDefined();
        const r = replay(w, mode, steps);
        expect(r.ok, r.reason).toBe(true);
        expect(r.state.ended).toEqual({ kind: "ending", ending: e });
      });
    }
  }

  it("every life's planned path replays to its mission", () => {
    for (const p of w.def.people.filter((x) => x.life)) {
      const steps = lock.entries[`plan:${p.id}`];
      expect(steps, `${p.id}: no witness saved`).toBeDefined();
      const r = replay(w, "timed", steps);
      expect(r.ok, `${p.id}: ${r.reason}`).toBe(true);
      expect(r.state.missions.some((m) => m.owner === p.id && m.status === "complete"), p.id).toBe(true);
    }
  });
});
