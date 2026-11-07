# EPIC: the sister project

EPIC is a separate, later game: a 2D 3/4 top-down fantasy adventure, one hand-reviewed world, built on this engine.
It isn't being built yet. This file keeps it in view while EVENT is built, without letting it change EVENT's scope.

Marked like the other docs: **Built**, **Agreed**, **Proposed**. Everything here is **Proposed** until you approve it.

---

## 1. The rule

**EPIC breaks ties. It never adds work.**

- When an EVENT decision could go either way, take the option that also works for EPIC.
- Never build something only EPIC needs. If EPIC needs it and EVENT doesn't, it waits.
- If a choice that helps EPIC makes EVENT worse, EVENT wins.

## 2. What EPIC is, in one table

So a session can judge a tie without reading EPIC's design doc.

| | EVENT | EPIC |
|---|---|---|
| Content | AI-authored in development, many variations, one served per run | AI-drafted in development, one world, every piece reviewed by hand |
| Setting | Modern towns, one event | Fantasy kingdoms, about 15 regions joined by wilderness |
| Who you play | A succession of lives | One hero |
| Story unit | Storylines, chapters, three acts per world | Three acts per region, five dungeons per region, quest clusters |
| Combat | Real-time, easy | Real-time, shallow: 1–2 attack patterns per enemy |
| Party | Allies, joining bystanders, story escorts | One active creature companion (three in some regions), passive creature followers |
| Space | Buildings and streets, 1.5 m levels | Outdoor regions at overworld scale, plus climbing, gliding, grappling and side-scroll segments |
| Failure | Missions can't break while their character lives | Required quests can't be failed; optional quests can |

## 3. Tie-breakers

Each is cheap during EVENT's development and expensive to retrofit. None adds an EPIC-only feature.

| Area | When there's a choice, prefer | Why EPIC cares | Where |
|---|---|---|---|
| Arena code | Modules (entities, steering, enemy states, party, climbing) with tuning values in data, once EVENT extracts it for the real game | EPIC reuses movement, combat, allies and followers | `sprites/maps/arena/index.html` |
| Party | A party slot that a person or a creature can fill; player controls that can attach to any party member | Creature companions; taking control of a companion | Arena allies |
| Followers | A "separated" event and a per-type recovery distance, if EVENT models stragglers at all | Passive creature followers that can be lost for good | Arena `followerThink` |
| Climbing | Climb and drop limits as per-entity values, not constants | Climbing gear and gliding change the limits | Arena `CLIMB`, SYSTEMS.md §6 |
| Enemy types | Traits as combinable components (target kind, pack/lone/wary, climb trait, wind-up) | EPIC builds enemies from components | SYSTEMS.md §1 |
| Sprites | Room in the recipe format for optional animations beyond walk, attack, hurt, death | Jump, flap and climb frames | `src/sprites/compose.ts` |
| Kits | Genre-neutral schemas: no street or sidewalk assumptions in site and zone types | EPIC needs castles, abbeys, villages and terrain as new kits, not new code | `kits/`, CONTRACT.md §7 |
| Referee | "A required path can never become impossible" as a reusable check, not tied to lives | EPIC's required-quest rule is the same proof | `src/missions.ts`, `src/lifecheck.ts` |
| State | One serializable world state that could be saved between sessions | EPIC's world persists for the whole game | `src/types.ts` |
| Projection | Keep the oblique projection's equal scale for height and ground depth | It gives EPIC the flat-sprite look over real 3D geometry | `src/env/oblique.ts` |

## 4. The canary

A fixed EPIC brief kept in this repo, run through the authoring pipeline at EVENT milestones.

- **What:** the Heartland Kingdom's Act I up to and through its first dungeon, the Abandoned Abbey, written in this
  repo's event formats once those formats are fixed (CONTRACT.md §10). Path: `events/epic-canary/`.
- **When:** at EVENT milestones, not continuously.
- **A failure is information, not a bug.** Record what failed and why. Fix it in EVENT only if the fix also improves
  EVENT; otherwise note it for EPIC.
- **What a pass means:** the pipeline can produce a first draft of an EPIC dungeon worth editing by hand. It doesn't
  need to be good; it needs to be a structure.

## 5. What this file must never cause

- An EPIC-only system, verb, kit or check added to EVENT.
- A delay to an EVENT milestone.
- EVENT content shaped to look like EPIC.
