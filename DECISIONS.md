# EVENT design decisions: who decided what

Use this ledger to work backwards from the intended game loop. Every design rule and system in the kernel is listed here with where it came from:

- **Yours:** you stated it directly.
- **Approved:** I proposed it and you agreed or refined it.
- **Assumed:** I decided it myself while building, without asking. These are the places our visions may diverge.

Each entry also says what depends on it and how hard it is to change.

---

## 1. The game loop

| Rule | Origin | Notes |
|---|---|---|
| A finite population; you play one life at a time; the world persists between lives | Yours (original concept) | |
| Knowledge belongs to the player, not the character | Yours (original concept) | Characters' expert knowledge (`knows`) is handed to the player when that life starts. **Assumed** detail. |
| A life ends on death, or when its goal is complete | Yours | |
| **A life ends only when the objective is done *and* the character is at the destination** | **Assumed** | You defined objective and destination; requiring both was my reading. Change: `checkMissions` in `src/engine.ts`. |
| The pool is alive, playable, never-played characters | Yours | |
| The next life is picked at random, weighted away from repeating the last life's role or narrative | Yours | The penalty numbers (×0.15 for the last life, ×0.5 for the one before) are **assumed**. |
| Future characters are frozen where they start, can't be led, and can't die | Yours | |
| Rescue NPCs (`leadable`) can be led; they stay put once their mission is done | Yours | |
| Past lives' missions can be finished by later lives, with no bonus, and finishing one doesn't end the current life | Yours | |
| Items and NPCs tied to a life are gated until that life starts | Yours | |
| A mission must never become impossible while its character lives; if it can, the world has a bug | Yours | The bug finder (`src/missions.ts`) and the per-life checks enforce it. |
| Timed mode has a deadline (the event concludes); untimed mode has none | Yours (you chose the deadline) | **Assumed:** the deadline must be at least 2× the slowest proven ending. |
| "Things might be hopeless. Abandon? Continue on?" | Yours | **Assumed:** it's shown once and judged by a cautious solver, and Continue runs until the pool is empty. |

## 2. Lives

| Rule | Origin | Notes |
|---|---|---|
| Start, objective, subobjectives, story event (one of the subobjectives), obstacle, destination | Yours | |
| Subobjectives aren't required, but form a path that's guaranteed to work | Yours | |
| Every life's story event moves the story forward (understanding or a branch), even if it doesn't look special | Yours | |
| Obstacles spawn with the life, or come from triggers the life's own actions cause; nothing runs on a timer | Yours | |
| **Obstacles a life spawns (hordes, barricades) are removed when that life ends** | **Assumed** | A fix for a mission-break bug: Dana's barricade could seal the school for later lives. Story-trigger consequences (fires, collapses) persist. Change: the end of `stepMut` in `src/engine.ts`. |
| **`bound` items can't be dropped by anyone** | **Assumed** | Stops a life breaking its own plan. |
| **Each life has exactly one story event, and it produces exactly one milestone** | **Assumed** | It follows from your "lives are units of story" direction, but making it exactly one is my rule. |
| **A tier-2 life's plan is checked *after* the lives that produce its tier-1 milestones** | **Assumed** | Needed because tier-2 story events can't happen first by design. |

## 3. Story structure and generation rules

| Rule | Origin | Notes |
|---|---|---|
| Endings are hard-gated by tiered milestones | Yours | |
| An ending depends on exactly 3 tier-2 milestones; each tier-2 depends on 1–2 tier-1 milestones; minimum 5–6 lives per ending | Yours | |
| A tier-2 milestone is shared by at most 2 endings, and any two endings share at most one | Yours | **Assumed:** each ending must keep at least one tier-2 milestone of its own. |
| Redundancy through different mechanisms, never the same machine reached by someone else; don't make it 1:1 | Yours | |
| Alternate mechanisms are discoverable but unlikely to be stumbled into, and one life shouldn't unlock large parts of the game | Yours | **Assumed:** "no life reaches more than **2** milestones on its own" is my number. |
| Optional destinations are planned endpoints with content: 1 bonus per game, 2 secrets per ending, 1 encounter per ending | Yours | **Assumed:** each is gated by at least 2 milestones from different lives. |
| **Formulas: `T2 = 3E − shared`, `T1 ≈ T2`, `lives = milestones + E`, NPCs ≈ lives/2, ~6 solver locations per life** | **Assumed** | My derivations from your structure rules. You flagged the population numbers as open. |
| **Every ending needs milestones from at least 5 different lives** | **Assumed** (from your minimum of 5–6) | |
| Hard gates are *proven* by removing every producer of a milestone | Approved | |

## 4. Systems (mechanics)

You asked for general systems instead of one-off rules; that is **Approved**. The specific mechanics inside each one were mostly **Assumed**:

| Mechanic | Origin | Notes |
|---|---|---|
| Machines need power, a skill, a tool, an input item or a clue, and produce facts, clues or power | **Assumed** | |
| Power sources feed named circuits | **Assumed** | |
| Access: keys, codes, cutting, prying, ramming, authority; barriers can block everyone or only vehicles | **Assumed** | Partly from the original Ash River puzzles. |
| **Hordes: fight with a strong enough weapon or die; flee back the way you came; routes avoid them** | **Assumed** | Your example only said "battle or run". Fixed outcomes, no odds, and death if unarmed are all mine. |
| **Darkness: entering a claimed zone without light kills; powered circuits light zones; flares burn down** | **Assumed** | You approved the Lightless concept; the rules inside it are mine. |
| Hazards: collapse (blocks a link) and fire (deadly to enter) | **Assumed** | |
| **Skills: a fixed list (science, engineering, authority, medicine, combat)** | **Assumed** | |
| **"Every skill is a shortcut": every ending (and, lately, every milestone) must be reachable with nobody having the skill** | **Assumed**, from your remark that experts shouldn't be essential | This goes further than you said. |
| **Library textbooks that teach a skill to anyone** | **Assumed** | Makes experts nearly decorative. The best candidate for removal; see the alternatives in our discussion. |
| Clues: documents, observations, people telling you, expert surveys, deductions (three observations lead to a conclusion) | **Assumed** | From the original Ash River puzzle. |
| Vehicles move at half the ticks and need 2+ cell roads | **Assumed** | |
| Sabotage: an explosive vehicle plus an igniter at a core with a known weakness | **Assumed** | |

## 5. Content

| Content | Origin |
|---|---|
| Ash River's alien Spire scenario; Contact and Destruction endings | Approved, from the original concept document |
| **Ash River's third ending (Sever), all 15 three-ending lives, their objectives, the NPCs, secrets, encounters and bonus** | **Assumed:** I wrote all of it to satisfy the rules. Treat it as placeholder. |
| Lightless at Harrow Court (three towers, the dark, six lives, three endings) | Approved concept; the details are **Assumed** |
| The hand-drawn city layout, two-storey buildings and street names | Approved direction; the details are **Assumed** |

## 6. Infrastructure (doesn't change the game loop)

None of this affects how the game plays; it only affects how the kernel proves things:

- The solver (trips, automatic pick-ups, progress ordering)
- The relaxed impossibility proofs
- Composing lives to prove endings
- The witness replay files
- The grid compiler (street folding, lifts, transit floors)
- The viewer

The one thing here that touches design is the automatic pick-up assumption: the solver treats "picking up everything" as always safe.

---

**Suggested review order:** sections 1–3 for the rules (mostly yours, with my numbers marked), then section 4 for the mechanics (mostly mine), then section 5 for the content (mostly mine). Anything marked **Assumed** that doesn't serve the loop you have in mind can be removed or changed. For each one I can tell you what breaks.

---

## Clarifications from review

1. **Experts:** still open and needs more exploration. Candidate models for later: (a) redundancy at the milestone level (a non-expert route by a different mechanism), (b) non-experts can do it at a real cost (slower, single-use or risky), (c) experts required for their own milestone, with redundancy elsewhere. The library textbooks are a stopgap.
2. **Combat:** the fight-or-flee horde model is a **testing stand-in only**. In the final game, survival is in the player's hands: real-time, player-driven, with neither fixed outcomes nor dice. The engine should treat threats as obstacles with costs and risks, and the game reports outcomes back (escaped, cleared, died).
3. **Darkness** is fine, provided it's a **reusable rule**: a zone claimed by a hazard that's deadly to enter unless countered, where the counter is data. Darkness is countered by light; a nanobot swarm could be countered by an EMP field. *To do:* rename the darkness-specific props to the general rule.
4. **Lives end when every objective assigned to the character is complete.** The destination is just another objective. *To do:* model a life's objectives as a list, with the destination as one of them.
5. **The single-life milestone limit** answered your concern about environmental workarounds letting one life unlock large parts of the game. It is **not** a limit on finishing earlier lives' unfinished milestones; a later life may complete any number of those. As implemented, it's a design-time check on a fresh world (no earlier lives exist), so it only measures unaided workarounds and never restricts play.
6. **Content:** Claude may create content, provided it keeps internal narrative consistency and every sequence stays completable (which the checks enforce).

## Scope: this is the engine, not the game

The final game is a 3D third-person survival/adventure game with real-time, player-driven movement and combat. **This repository is the engine that drives it:**

- **The world model:** places, links, things, people, state.
- **The rules and story structure:** lives, objectives, triggers, milestones, endings.
- **Generation and validation:** proving a world is completable, mission-safe and rule-conformant.

The 3D game is a client of the engine. It renders the grid as a level, runs real-time movement and combat, and reports what happened back as events (moved here, used this, opened that, died, escaped). The turn-like parts here (actions, ticks, the text runner, the solver's fixed fight outcomes) are abstractions for testing and proofs, not the game's feel.
## Core systems to add (agreed)

- **What a claim does, as data:** a claimed zone can kill, detect, drain a meter or slow; its counter is data. This generalises darkness.
- **Condition meters:** per-person values (exposure, injury, infection, fatigue) that build up and cross thresholds. They bridge to the real-time game, which reports damage and exposure as events.
- **Typed networks:** power, water, air, comms. This generalises power circuits.
- **Triggered movers:** patrols, roaming threats and crowds whose position advances when an action triggers it.
- **Disturbance tags on actions:** loud, bright, powered. Triggers and movers can respond to them.
- **History as content:** who died, where and how, and which missions were left open, all available to content conditions.

## Remnants (yours)

- **On death, the scenario decides what a character leaves behind, and the cause of death picks it.** Bitten means turned; burned means no remnant. Infection crossing its threshold turns a living character, which ends their life just as death does.
- **Remnants stay where they fell.** They are an obstacle guarding the items the character carried; going back to the place they died is a reliable plan.
- **Their unfinished mission stays open,** as now.
- **Validator rule:** a remnant must never lock away something a planned path needs. There must always be a reachable way past it (a counter or weapon, a distraction, or another route).
- **The cure is the bonus weapon** in an outbreak scenario. It works on every infected person, turning them back into rescue NPCs, including your own past characters. It follows the bonus rules: one per game, unlocked by milestones from at least 2 different lives.
- The remnant is scenario data: a turned character (zombie), a pocket of dark (Lightless), an assimilated drone (nanobots), a ghost (haunting), just a body (grounded thriller).