// Event ideas: what recurs across them, so we build general pieces instead of one-offs.
//
//   npm run ideas     read events/ideas/batch-*.json, write events/ideas/REPORT.md
//
// An entry "specific:base" counts toward its base; an entry with no ":" is its own base. For each category the report
// ranks bases by how many events use them, lists the specifics each base stands in for, and shows how few bases it
// takes to cover most uses. Batches 1-10 are set 1 (seeded by our own discussion), 11-20 are set 2 (seeded by
// TROPES.md); the report compares them, and ranks set 1 by ratings-1.json.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

interface Idea {
  id: string; title: string; genre: string; set: number;
  threat: { kind: string; source: string; behavior: string[] };
  setting: { region: string; town: string; scale: string; isolation: string; season: string; era: string };
  zones?: string[]; sites: string[]; cast: { role: string; family: string; skills: string[] }[];
  mechanics: string[]; props: string[]; enemies: string[]; boss?: string | null; combat?: string[]; vehicles: string[]; fx: string[];
}

const dir = "events/ideas";
const ideas: Idea[] = readdirSync(dir).filter((f) => /^batch-\d+\.json$/.test(f)).sort().flatMap((f) => {
  const n = Number(f.match(/\d+/)![0]);
  return (JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Idea[]).map((i) => ({ ...i, set: n <= 10 ? 1 : 2 }));
});
const N = ideas.length;
const enemiesOf = (i: Idea) => [...i.enemies, ...(i.boss ? [i.boss] : [])];
const base = (entry: string) => entry.split(":")[1] ?? entry;

/** Per base: the events that use it and the specific names it stands in for. */
function tally(from: Idea[], get: (i: Idea) => string[]) {
  const bases = new Map<string, { events: Set<string>; specifics: Set<string> }>();
  for (const i of from) for (const entry of new Set(get(i))) {
    const [specific, b = specific] = entry.split(":");
    const row = bases.get(b) ?? { events: new Set(), specifics: new Set() };
    row.events.add(i.id);
    if (specific !== b) row.specifics.add(specific);
    bases.set(b, row);
  }
  return [...bases].map(([b, row]) => ({ base: b, n: row.events.size, specifics: [...row.specifics].sort() })).sort((a, b) => b.n - a.n || a.base.localeCompare(b.base));
}

/** How many of the top bases it takes to cover each share of all uses. */
function coverage(rows: ReturnType<typeof tally>) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const at = (share: number) => { let sum = 0; for (let k = 0; k < rows.length; k++) { sum += rows[k].n; if (sum >= share * total) return k + 1; } return rows.length; };
  return `${rows.length} bases, ${total} uses. Top ${at(0.5)} cover half of all uses, top ${at(0.8)} cover 80%, top ${at(0.9)} cover 90%. ${rows.filter((r) => r.n === 1).length} are used by one event only.`;
}

function section(title: string, note: string, get: (i: Idea) => string[], top = 40) {
  const rows = tally(ideas, get);
  const lines = [`## ${title}`, "", note, "", coverage(rows), "", "| Base | Events | Stands in for |", "|---|---|---|"];
  for (const r of rows.slice(0, top)) lines.push(`| ${r.base} | ${r.n} (${Math.round((100 * r.n) / N)}%) | ${r.specifics.join(", ")} |`);
  if (rows.length > top) lines.push("", `Used by one event only: ${rows.filter((r) => r.n === 1).map((r) => r.base).join(", ") || "none"}.`);
  return lines.join("\n");
}

const count = (get: (i: Idea) => string) => {
  const m = new Map<string, number>();
  for (const i of ideas) m.set(get(i), (m.get(get(i)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
};

// ---- set 1 against set 2 ----
function compare() {
  const sets = [1, 2].map((s) => ideas.filter((i) => i.set === s));
  const avg = (xs: Idea[], f: (i: Idea) => number) => (xs.reduce((s, i) => s + f(i), 0) / xs.length).toFixed(1);
  const pct = (xs: Idea[], f: (i: Idea) => boolean) => `${Math.round((100 * xs.filter(f).length) / xs.length)}%`;
  const fights = (i: Idea) => i.mechanics.includes("threat-fight");
  const rows: [string, (xs: Idea[]) => string][] = [
    ["Events", (xs) => String(xs.length)],
    ["Enemy types per event", (xs) => avg(xs, (i) => enemiesOf(i).length)],
    ["Events with no enemies", (xs) => pct(xs, (i) => enemiesOf(i).length === 0)],
    ["Events with a boss", (xs) => pct(xs, (i) => !!i.boss)],
    ["Events with fighting (threat-fight)", (xs) => pct(xs, fights)],
    ["Distinct enemy bases", (xs) => String(tally(xs, enemiesOf).length)],
    ["Distinct enemies (specific)", (xs) => String(new Set(xs.flatMap((i) => enemiesOf(i).map((e) => e.split(":")[0]))).size)],
    ["Weapons per event (melee, guns, ranged, explosives)", (xs) => avg(xs, (i) => i.props.filter((p) => ["melee", "long-gun", "handgun", "ranged", "heavy-weapon", "explosive", "flamethrower", "power-tool", "spear"].includes(base(p))).length)],
  ];
  const lines = ["## Set 1 against set 2", "", "Set 1 (batches 1-10) came out of our own discussion; set 2 (batches 11-20) was drawn from the genre reference in `TROPES.md`.", "", "| | Set 1 | Set 2 |", "|---|---|---|"];
  for (const [label, f] of rows) lines.push(`| ${label} | ${f(sets[0])} | ${f(sets[1])} |`);
  return lines.join("\n");
}

// ---- gameplay ratings (ratings-1.json, ratings-2.json) ----
type Score = [number, number, number, number, number, string];
const scores: Record<string, Score> = Object.assign({}, ...[1, 2].map((s) => `${dir}/ratings-${s}.json`).filter(existsSync).map((f) => JSON.parse(readFileSync(f, "utf8")).scores));
const total = (id: string) => (scores[id] ? (scores[id].slice(0, 5) as number[]).reduce((a, b) => a + b, 0) : undefined);
const rated = ideas.filter((i) => total(i.id) !== undefined);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function ranked() {
  if (!rated.length) return "";
  const rows = [...rated].sort((a, b) => total(b.id)! - total(a.id)!);
  const lines = ["## By gameplay potential", "", "From `ratings-1.json` and `ratings-2.json`: combat, enemies, set pieces, systems, fit for many lives, 1-5 each (25 max). " +
    `Average: set 1 ${mean(rated.filter((i) => i.set === 1).map((i) => total(i.id)!)).toFixed(1)}, set 2 ${mean(rated.filter((i) => i.set === 2).map((i) => total(i.id)!)).toFixed(1)}. The top 25 and bottom 10 of all ${rated.length}.`,
    "", "| Event | Set | Total | Combat | Enemies | Set pieces | Systems | Lives | Note |", "|---|---|---|---|---|---|---|---|---|"];
  for (const i of [...rows.slice(0, 25), ...rows.slice(-10)]) lines.push(`| ${i.id} | ${i.set} | ${total(i.id)} | ${scores[i.id].slice(0, 6).join(" | ")} |`);
  return lines.join("\n");
}

/** Which features go with high ratings: the average total of events that have each base, against the overall average. */
function lift(title: string, get: (i: Idea) => string[], min = 8) {
  if (!rated.length) return "";
  const all = mean(rated.map((i) => total(i.id)!));
  const rows = tally(rated, get).filter((r) => r.n >= min).map((r) => {
    const with_ = rated.filter((i) => get(i).some((e) => base(e) === r.base));
    return { base: r.base, n: r.n, avg: mean(with_.map((i) => total(i.id)!)) };
  }).sort((a, b) => b.avg - a.avg);
  const fmt = (r: (typeof rows)[number]) => `${r.base} ${r.avg.toFixed(1)} (${r.n})`;
  return `- **${title}** (overall ${all.toFixed(1)}). Highest: ${rows.slice(0, 8).map(fmt).join(", ")}. Lowest: ${rows.slice(-6).reverse().map(fmt).join(", ")}.`;
}

/**
 * Completion: pick bases one at a time, each time the one that finishes the most events (every entry of the category
 * covered), breaking ties by uses. Shows how many events are fully buildable after each pick.
 */
function completion(title: string, get: (i: Idea) => string[], picks = 15) {
  const need = ideas.map((i) => new Set(get(i).map(base))).filter((s) => s.size);
  const have = new Set<string>(), steps: string[] = [];
  const uses = new Map(tally(ideas, get).map((r) => [r.base, r.n]));
  for (let k = 0; k < picks; k++) {
    let best = "", bestDone = -1, bestUses = -1;
    for (const b of uses.keys()) {
      if (have.has(b)) continue;
      have.add(b);
      const done = need.filter((s) => [...s].every((x) => have.has(x))).length;
      have.delete(b);
      if (done > bestDone || (done === bestDone && uses.get(b)! > bestUses)) { best = b; bestDone = done; bestUses = uses.get(b)!; }
    }
    if (!best) break;
    have.add(best);
    steps.push(`${best} → ${bestDone}`);
  }
  return `- **${title}** (${need.length} events need any): ${steps.join(", ")}.`;
}

// ---- genre families ----
const FAMILY: Record<string, string> = {
  zombie: "infection", outbreak: "infection", infection: "infection",
  creature: "creature", cryptid: "creature", kaiju: "creature", "animal-attack": "creature",
  alien: "sci-fi", "alien-invasion": "sci-fi", "sci-fi": "sci-fi", tech: "sci-fi",
  supernatural: "supernatural", haunting: "supernatural", vampire: "supernatural", possession: "supernatural", "folk-horror": "supernatural", cosmic: "supernatural", horror: "supernatural",
  action: "human-threat", thriller: "human-threat", war: "human-threat", "war-horror": "human-threat", slasher: "human-threat", survival: "human-threat",
  disaster: "disaster", industrial: "disaster", bio: "disaster", historical: "disaster",
  "comedy-horror": "pulp", pulp: "pulp", holiday: "pulp", western: "pulp",
};
function families() {
  const lines = ["## Genre families", "", "Genres grouped into families. For each: how many events, the average rating, and the top enemies, combat styles and mechanics.", "", "| Family | Events | Rating | Enemies | Combat | Mechanics |", "|---|---|---|---|---|---|"];
  const groups = new Map<string, Idea[]>();
  for (const i of ideas) { const f = FAMILY[i.genre] ?? "other"; groups.set(f, [...(groups.get(f) ?? []), i]); }
  const top = (xs: Idea[], get: (i: Idea) => string[], n: number) => tally(xs, get).slice(0, n).map((r) => `${r.base} ${r.n}`).join(", ");
  for (const [f, xs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const r = xs.filter((i) => total(i.id) !== undefined).map((i) => total(i.id)!);
    lines.push(`| ${f} | ${xs.length} | ${r.length ? mean(r).toFixed(1) : ""} | ${top(xs, enemiesOf, 5)} | ${top(xs, (i) => i.combat ?? [], 5)} | ${top(xs, (i) => i.mechanics, 5)} |`);
  }
  return lines.join("\n");
}

/** Enemy bases that appear together in one event: the ladders. */
function pairs(n = 20) {
  const m = new Map<string, number>();
  for (const i of ideas) {
    const bs = [...new Set(enemiesOf(i).map(base))].sort();
    for (let a = 0; a < bs.length; a++) for (let b = a + 1; b < bs.length; b++) m.set(`${bs[a]} + ${bs[b]}`, (m.get(`${bs[a]} + ${bs[b]}`) ?? 0) + 1);
  }
  return `- **Enemy bases that appear together:** ${[...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join("; ")}.`;
}

const WEAPONS = new Set(["melee", "long-gun", "handgun", "ranged", "heavy-weapon", "explosive", "flamethrower", "power-tool", "spear", "spray"]);
function explore() {
  return ["## Exploring", "",
    "### What goes with high ratings", "", "Average rating of events with each base (bases in at least 8 rated events).", "",
    lift("Enemies", enemiesOf), lift("Mechanics", (i) => i.mechanics), lift("Combat styles", (i) => i.combat ?? [], 5), lift("Scale", (i) => [i.setting.scale]),
    "", "### Completion", "", "Bases picked greedily, each the one that finishes the most events; the number is how many events are then fully covered in that category.", "",
    completion("Enemies", enemiesOf), completion("Vehicles", (i) => i.vehicles), completion("Weapons", (i) => i.props.filter((p) => WEAPONS.has(base(p)))),
    completion("Effects", (i) => i.fx, 20), completion("Mechanics", (i) => i.mechanics, 20),
    "", "### Ladders", "", pairs(),
  ].join("\n");
}

const out = [
  "# Event ideas: what recurs",
  "",
  `Generated by \`npm run ideas\` from ${N} ideas in \`events/ideas/\`. Percentages are the share of all ${N} events that use a base.`,
  "",
  compare(),
  ranked(),
  families(),
  explore(),
  "## Settings",
  "",
  `- **Genre:** ${count((i) => i.genre)}`,
  `- **Scale:** ${count((i) => i.setting.scale)}`,
  `- **Isolation:** ${count((i) => i.setting.isolation)}`,
  `- **Season:** ${count((i) => i.setting.season)}`,
  `- **Era:** ${count((i) => i.setting.era)}`,
  `- **Region:** ${count((i) => i.setting.region)}`,
  "",
  section("Town types", "What kind of place each event is set in.", (i) => [i.setting.town], 30),
  section("Mechanics", "Engine systems the events lean on.", (i) => i.mechanics),
  section("Combat styles", "How fights go (set 2 only; set 1 didn't record it).", (i) => i.combat ?? []),
  section("Threat behaviour", "How threats move and act; each is a behaviour the game has to support.", (i) => i.threat.behavior),
  section("Enemies", "By base: the body or rig an enemy could be built on. Bosses included.", enemiesOf, 50),
  section("Bosses", "By base.", (i) => (i.boss ? [i.boss] : []), 30),
  section("Vehicles", "By base.", (i) => i.vehicles),
  section("Props", "Things you carry or use, by base.", (i) => i.props, 60),
  section("Visual effects", "By base.", (i) => i.fx),
  section("Sites", "Buildings and places the setting needs.", (i) => i.sites, 60),
  section("Zones", "Areas of the map (set 1 only).", (i) => i.zones ?? [], 30),
  section("Character families", "", (i) => i.cast.map((c) => c.family), 20),
  section("Roles", "", (i) => i.cast.map((c) => c.role), 40),
  section("Skills", "", (i) => i.cast.flatMap((c) => c.skills), 40),
  "",
].join("\n\n").replace(/\n{3,}/g, "\n\n");

writeFileSync(`${dir}/REPORT.md`, out);
console.log(`${dir}/REPORT.md  (${N} ideas)`);
