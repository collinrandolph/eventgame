// Text runner: play the kernel from the terminal.
// Usage: npm run play -- [world.json] [--mode timed|untimed] [--seed N]

import { createInterface } from "node:readline";
import { describe, listActions, step } from "../engine.js";
import { assignLife, pickNext, prepareNextLife, rng } from "../lives.js";
import { isHopeless } from "../solver.js";
import type { Mode, State } from "../types.js";
import { initialState, lifeOf, loadWorld, nameOf } from "../world.js";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "worlds/ash-river.json";
const mode = (opt("mode") ?? "timed") as Mode;
const seed = Number(opt("seed") ?? Date.now() % 100000);

const w = loadWorld(file);
const random = rng(seed);
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
async function ask(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const next = await lines.next();
  if (next.done) return "q";
  if (!process.stdin.isTTY) console.log(next.value);
  return next.value.trim().toLowerCase();
}
const print = (lines: string[]) => lines.forEach((l) => console.log(l));

let s: State = initialState(w, mode);
let warned = false;
console.log(`EVENT — ${w.def.name} · mode ${mode} · seed ${seed}\nCommands: number = act, k = knowledge, q = quit\n`);

function status(s: State) {
  const me = s.people[s.actor!];
  const here = me.location;
  const things = Object.entries(s.things).filter(([, t]) => t.location === here).map(([id]) => nameOf(w, id));
  const held = Object.entries(s.things).filter(([, t]) => t.location === s.actor).map(([id]) => nameOf(w, id));
  const people = Object.entries(s.people)
    .filter(([id, p]) => id !== s.actor && p.location === here)
    .map(([id, p]) => `${nameOf(w, id)}${p.alive ? "" : " (dead)"}`);
  const mission = s.missions.find((m) => m.owner === s.actor && m.status === "active");
  console.log(`\n— tick ${s.tick} · life ${s.lives} · ${nameOf(w, s.actor)} at ${nameOf(w, here)}${me.vehicle ? ` (in ${nameOf(w, me.vehicle)})` : ""}`);
  if (mission) {
    const life = lifeOf(w, mission);
    console.log(`  Objective: ${life.objective.text}${life.destination ? ` · then: ${life.destination.text}` : ""}`);
    for (const sub of life.subobjectives) console.log(`    [${mission.subs.includes(sub.id) ? "x" : " "}] ${sub.text}`);
    if (life.obstacle.text) console.log(`  Watch out: ${life.obstacle.text}`);
  }
  if (things.length) console.log(`  Here: ${things.join(", ")}`);
  if (people.length) console.log(`  People: ${people.join(", ")}`);
  if (held.length) console.log(`  Carrying: ${held.join(", ")}`);
}

while (!s.ended) {
  if (!s.actor) {
    const prep = prepareNextLife(w, s);
    print(prep.log);
    s = prep.state;
    if (s.ended) break;
    const life = assignLife(w, s, pickNext(w, s, random));
    console.log("");
    print(life.log);
    s = life.state;
  }

  status(s);
  const actions = listActions(w, s);
  actions.forEach((a, i) => console.log(`  ${String(i + 1).padStart(2)}) ${describe(w, s, a)}`));
  const input = await ask("> ");
  if (input === "q") break;
  if (input === "k") {
    console.log(`  You know: ${s.knowledge.join(", ") || "nothing yet"}`);
    continue;
  }
  const a = actions[Number(input) - 1];
  if (!a) continue;

  const r = step(w, s, a);
  print(r.log);
  s = r.state;

  if (!s.ended && !warned && isHopeless(w, s)) {
    warned = true;
    const ans = await ask("\nThings might be hopeless. Abandon? Continue on? [a/c] ");
    if (ans.startsWith("a")) s = { ...s, ended: { kind: "abandoned" } };
  }
}

console.log(`\nRun over after ${s.tick} ticks and ${s.lives} lives: ${s.ended ? JSON.stringify(s.ended) : "quit"}`);
rl.close();
