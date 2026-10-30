# EVENT: puzzle kernel

The rules of EVENT as data plus a solver. No rendering. A world is a JSON file
built on shared game systems; the kernel plays it, hands lives off, and proves
what is still possible.

```
npm test          # grid compiler, systems, triggers, threats, lives, gating, endings, mission breaks
npm run check     # endings (both modes, deadline margin), skills-as-shortcuts, life plans, story events, mission-break search
npm run viz       # write viz/<world>-viewer.html: 3D layer stack + 2D plan per layer + link schedule
npm run play      # play in the terminal  (-- --mode untimed --seed 42)
```

## Layout

| File | What it does |
|---|---|
| `src/types.ts` | Schema, and the SYSTEMS table: which props drive which system |
| `src/engine.ts` | The systems as generic conditions and effects; legal actions; one step |
| `src/world.ts` | Load + validate a world, rule libraries, deductions compiled to rules |
| `src/lives.ts` | Pool, weighted random life pick, starting a life (mission, spawned obstacles) |
| `src/solver.ts` | Best-first search with trips, not single moves; `isHopeless` |
| `src/relaxed.ts` | Fast sound "impossible" proof (values only accumulate, time ignored) |
| `src/lifecheck.ts` | Life-plan check, story-event check, skills-as-shortcuts, ending proofs by composing lives |
| `src/missions.ts` | Mission-break bug finder (random runs + per-life exact check) |
| `src/grid.ts` | Layered 2 m grid → zones, streets, rooms, links → the graph the kernel runs on |
| `src/nav.ts` | Quickest open route for the current actor (around threats) |
| `rules/core.json` | The shared rule library: one rule per system verb |
| `worlds/ash-river.json` | Event 1: an alien signal over a flat street-grid city. Eight lives, three triggers, two endings |
| `worlds/harrow-court.json` | Event 2, *Lightless*: a living dark in a 14-layer tower complex. Six lives, three triggers, three endings |
| `src/targets.ts` | Where a goal points (places, items, barriers, clue sources), for goal-directed life searches |

## Systems

Every rule in `rules/core.json` works off props, never specific objects, so any world (or generator) composes them.

| System | Driven by | Ash River instances |
|---|---|---|
| **Machine** | fixture `machine`, `circuit`, `skill`, `tool`, `input`/`consumes`, `needsClue`, `yieldsFact`/`yieldsClue`/`recordsTo` | analyzer, array console |
| **Power** | fixture `source`, `feeds: "a\|b"`, `online`. Operating a source brings it online | lab breaker, substation breaker, backup generator; switchgear, dock and tower generators |
| **Darkness** | location `dark` (entering kills), `lightCircuit` (powered lights hold it back); items `light` (lasting) or `lightCharges` (flares burn down); machines `banishes` / `yieldsOnBanish` | Harrow Court's sub-basement, garage surge, skybridge, roof |
| **Access** | barrier `blocks`, `locked`/`lockId`, `keypad`, `cuttable`, `pryable`, `ramable`, `authority`, `poweredBy` (lifts, maglocks), `closable` | doors, gates, fence, grates, hatch, barricade; elevators, blast door |
| **Hazard** | effects `collapse` (link impassable) and `fire` (entering kills; ground items burn) | bridge span, smoke-filled stairs, lab fire |
| **Threat** | threat `strength`, `active`, `owner`, `counter` (the item prop that beats it: `weapon` by default, `light` for pockets of the dark) | hordes, the taken, pockets of the dark |
| **Clue** | item `reveals`, fixture `observe` / `inspect`+`inspectSkill`, person `tells`, character `knows`, world `deductions` | memo, report, notebook, rhythms, teacher, survey |
| **Escort** | person `leadable` | Milo |
| **Vehicle** | vehicle `key`, `heavy`, `explosive` | van, tanker |
| **Sabotage** | fixture `core`, `weakness`; an explosive vehicle plus an igniter | the Spire |
| **Skills** | `science engineering authority medicine combat`; items with `teaches` stand in | |

**Design rule, checked:** every skill is a shortcut. Each ending must stay reachable when nobody has that skill.

## Lives

A life is a planned puzzle:

```
start → objective (+ destination) · subobjectives (one is the story event) · obstacle · spawn effects
```

- **The life ends** when its objective is done *and* the character is at the destination.
- **Subobjectives aren't required,** but in order they form a planned path. `check` proves it works from the start point, with the obstacle and triggers.
- **The story event** is how the life moves the whole story forward: understanding (`clue:`) or opening a branch (`power:`, `open:`, `item:`, `fact:`). It doesn't need to look special. `check` verifies that what it feeds is something an ending depends on.
- **Obstacles arrive with the life.** Either through `spawn` (hordes activated, the school barricaded) or as story triggers fired by the life's own actions.
- **Everything a planned path needs is tied to its life** (`owner`), so earlier lives can't take it. Everything else can be moved by anyone, which is where emergent shortcuts come from.
- **A life's hordes leave with it.** Every other change persists.

**Story triggers** (`triggers`) fire once, on an action (`{rule, thing}`), on entering a place, or on a subobjective. They can be scoped to one life. Nothing runs on a timer, so whoever causes a change sees it: Hale's analysis overloads the machine and sets the lab on fire, Theo reaching the bridge brings down its far span, and Rosa taking the ward keys fills the main stairs with smoke.

**Timed mode** has a deadline: at `deadline` ticks the event concludes and the run ends. It's the only clock and changes nothing in the world. `check` requires the deadline to be at least twice the slowest proven ending.

## Event 2: Lightless (Harrow Court)

A living darkness rises from under three 10-storey towers on a podium mall. Anything it has claimed is death to enter without light. Light holds it back: powered circuits, torches, phones, flares.

- **Map:** 14 layers (sub-basement, garage, podium, 10 floors, roofs). Stairwells run through every floor, lifts join lobbies to chosen floors (each elevator needs its circuit powered), and skybridges link the towers at floors 4 and 8. 17 empty stairwell floors fold away, leaving 30 solver locations.
- **Lives:** Nadia (engineer: main power), Pell (security: opens the lock-up), Iris (historian: reads what the dark wants), Grace (takes the foundation stone and gets her grandson out), Sami (starts the dock generator), Kai (starts Tower A's old generator and brings his mum home).
- **The dark spreads only through what people do:** Nadia's restored power surges it into the garage, Iris reading the carvings makes it take the floor-4 skybridge, and Grace lifting the stone drops it over Tower C's roof.
- **Endings:** Relight (main power and the crown beacon), Seal (drive it out of the garage with the floodlights, then shut the blast door), Return (bring the stone and the knowledge of what it wants down to the hollow in the foundations).

**What building it showed was still Ash River-shaped** (all now general):
- Hazards had no "deadly unless" (light); threats could only be beaten by weapons.
- Access couldn't depend on power (elevators) and nothing could close.
- The grid assumed buildings are a few storeys: no lifts that skip floors, no barrier shared by several links, and stairwell floors couldn't fold.
- The "intended links" check ran after folding.
- **Bug:** machine inputs ignored life gating, in the engine and in the relaxed check, so a gated fuel can could run a generator.
## World rules (unchanged)

- **Missions can't break** while their character lives. Obstacles may kill; nothing may make a mission impossible. The bug finder hunts for violations.
- **Life gating:** a life's items and NPCs, and future characters themselves, can be seen and met but not used before that life.
- **Protection:** future characters can't die, and neither can an NPC whose mission hasn't started or is being played.
- **`bound` items** can't be dropped by anyone.
- **Frozen NPCs:** played characters stay in the world; you can take what they carry.
- **Only rescue NPCs (`leadable`) can be led.** They stay put once their mission completes.
- **Pool = alive, playable, never played.** Next life weighted away from the last one's category and narrative.
- **Past-life missions** can be finished by anyone, with no bonus, and finishing one never ends the current life.
- **Hopeless prompt** when no ending is reachable.

## Proving endings

`proveEnding` composes lives: play them in order, and at the start of each, try to reach the ending within that life. Otherwise the life follows its planned path (or, if that fails, ends some other legal way) and the next life starts. Steps in between are never allowed to end the run with a different ending. This mirrors how the game is built, with story events from earlier lives opening the way and a later life finishing, and it's far faster than blind search across lives. The witness is a legal playthrough. The general search is the fallback.

## Spatial layer (grid)

One ASCII block per layer (`z` = 0 ground, negative below, positive upper floors), 2 m cells, compiled to locations and connections.

| Char | Meaning |
|---|---|
| ` ` `.` | void / solid ground |
| `%` | building you can't enter |
| `~` | water |
| `=` | street surface |
| `#` | wall |
| `+` | portal; a run of `+` is one portal and its length is its width |
| `S` `L` `M` | stairs / ladder / manhole: link the same char one layer up or down |
| other | floor; the layer's `legend` maps the char to a zone |

- **Zones** become kernel locations, and internal walls make **rooms**.
- **Links** are open boundaries, portals, and vertical access. **Ticks** come from cell distance.
- **Vehicles** need two road zones and a gap of 2+ cells.
- **Streets** must lie inside named rectangles. They split into intersections and segments, and empty runs fold into single connections.
- **Compile errors** catch split zones, malformed portals, missing intended links and bad placements. A link not in `expect` is a warning.

## Solver notes and known limits

- **Trips:** the solver travels straight to places where something can happen, routing around active threats, and steps every hop so hazards and triggers fire.
- **Ordering:** it tries several progress weights in turn (progress counts knowledge, facts, open barriers, powered sources, moved vehicles).
- **Picking up:** `solverAuto` rules (picking up) are applied automatically, and `solverSkip` rules (dropping) are left out. In rare cases holding an item could be worse than leaving it.
- **Impossible verdicts** come from the relaxed check or an exhaustive search. Running out of budget is never treated as hopeless.
- **Distances** are measured center-to-center, and "here" means "same zone".

## Story milestones (built; Harrow Court)

Endings are hard-gated by tiered **milestones**: named facts produced by story events. `check` proves every gate by removing all of a milestone's producers and showing the ending (or the dependent milestone) becomes impossible. Redundancy comes from **different mechanisms**, never the same machine reached by someone else. Machines can require milestones with `needsFact`.

Harrow Court: Relight is gated by power, the way up and understanding; Seal by power, reserve power, the surge and the garage held; Return by the lock-up, the stone and understanding. Every tier-1 and tier-2 milestone has two different producers (main power: the basement switchgear or the roof battery bank; understanding: the carvings, or holding the stone in the hollow). Ash River hasn't been converted yet.

## Design direction (next)

- **Reverse-engineer scenarios from the endings.** Pipeline: game size → number of endings → each ending's milestone tree (at least 3 gates, tiered) → milestones assigned to lives, with redundancy by different mechanisms → mechanisms placed on the map → the remaining population filled with lives that feed tier 1 or optional content.
- **Size sets the number of endings.** Roughly 10 people means 1 ending, and 40 people means 3. Population, time (deadline) and map size scale together.
- **Optional paths are planned destinations**, authored like endings but smaller. Each one is a path with content at its end, gated by at least 2 milestones from different lives, so it rewards exploration (Boss Keys: wandering should pay). Kinds:
  - **Bonus:** a reward that changes play, such as an overpowered weapon.
  - **Secret:** an artifact or record that reveals story or lore about the event.
  - **Encounter:** a memorable place or character that connects to nothing and exists purely for the experience.
  - The validator treats each as a **planned endpoint**: it must be reachable (proven like an ending), its gates must be real, and it must lead somewhere with content. Whether it touches the endgame is a property it reports, not the definition. A secret can still carry a clue that helps.
- **Metrics still to build:**
  - minimum lives per ending (Seal can still be done by Nadia alone, though it has 4 gates)
  - whether each obstacle actually obstructs
  - order freedom
  - ways through each barrier
  - loops and backtracking
  - reward for wandering