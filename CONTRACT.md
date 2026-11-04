# The EVENT contract

What every event must be, so that an AI can author events and the engine can judge them. The engine is the
**referee**: it fixes the rules and proves an event is playable. The AI is the **author**: it invents the event, the
setting, the town, the cast and the challenges, inside these rules. You define the base kits and approve what's new.

Each rule is marked:
- **Built:** enforced in code today.
- **Agreed:** decided with you, not built yet.
- **Proposed:** mine, needs your OK.

Where a rule came from is in [DECISIONS.md](DECISIONS.md); this file only says what the rule is.

The story inside an event (acts, storylines, chapters, the endgame and secrets) is in
[NARRATIVE.md](NARRATIVE.md). It's newer than §3 below, and its §14 lists the rules here that it replaces.

---

## 1. Who does what

| | Does | Never does |
|---|---|---|
| **Engine** | Defines the formats, runs the rules, compiles plans to maps, renders, proves playability | Decides what an event is about or how it looks |
| **AI (author)** | Writes the event, its setting, plan, cast, lives and challenges; composes from the kits; proposes new kit parts | Changes the gameplay rules, adds rule verbs, ships anything that fails a check |
| **You** | Define and correct the base kits; approve new kit parts once; approve each finished event; flag failures | Hand-place content |

**Kits, not freehand** (Proposed, from how the sprite generator came to work). The AI is good at deciding *what*
should be somewhere and how things relate. It's unreliable at exact geometry and pixel art. So everything it makes
is composed from **kits**: base parts you define and correct, which it combines and varies. When it keeps failing at
something, the fix is in the kit (narrow it, split a part, delete the capability), not a harder prompt. The same way
problematic angles and animations were dropped from the sprite bases.

---

## 2. The event package

An event is a folder of files the AI writes and the engine checks (Proposed). Each file only builds on the ones above
it.

| File | What it is | Format |
|---|---|---|
| `events/<id>/brief.json` | The event: premise, tone, threat (source and movement), isolation, density, season, the roles and places it needs, set pieces | Event card (§7) |
| `events/<id>/setting.md` + `setting.json` | Region, town type, its zones and their traits, palette family, the town's past in a few lines, what the setting gives the story. Every later step reads this | Setting card (§7) |
| `events/<id>/plan.json` | The map as decisions: size, streets and their cross-sections, zones as areas, sites placed by type, block fill per zone | Plan (§5.2) |
| `worlds/<id>.json` | The playable world: compiled grid plus people, lives, things, triggers, milestones, endings | World schema (`src/types.ts`) |
| `sprites/env/worlds/<id>.json` | Dressing: themes per zone, building types, areas, features, people's sprites | Env config (`src/env/build.ts`) |
| `events/<id>/cast.json` | Each character's sprite recipe, role family and picks | Recipes (`sprites/README.md`) |
| `events/<id>/proposals/` | New kit parts the event needs and the library doesn't have | Their kit's format, pending approval |

**Done** means every check in §8 passes and you've approved it. The output is plain files, so an event is fixed,
reviewable and plays the same every time. Nothing is generated during play.

---

## 3. Gameplay rules (fixed: the AI uses these, never changes them)

### 3.1 The loop
- A finite population. You play one life at a time and the world persists between lives. **Built**
- Knowledge belongs to the player, not the character; a character's expert knowledge is handed over when their life
  starts. **Built**
- The pool is alive, playable, never-played characters; the next life is picked at random, weighted away from the
  last one's role and narrative. **Built**
- Future characters are frozen where they start, can't be led and can't die. Played characters stay where they were
  left, and you can take what they carry. **Built**
- Timed mode has a deadline at least twice the slowest proven ending; untimed has none. **Built**
- When no ending is reachable, the player is offered to abandon or continue. **Built**

### 3.2 Lives
- A life is: start, objectives (the destination is one of them), subobjectives that form a proven path, exactly one
  story event, an obstacle, and spawn effects. **Built** (objectives as a list: **Agreed**)
- A life ends when its objectives are done, or on death. **Built**
- A mission must never become impossible while its character lives. **Built** (the bug finder hunts for violations)
- A life's items and NPCs are gated until that life starts. Its spawned obstacles leave when it ends; everything else
  it changed persists. **Built**
- Past lives' missions can be finished by anyone, with no bonus. **Built**
- Nothing happens on a timer: obstacles arrive with the life or are triggered by what someone does. **Built**
- On death the scenario decides what's left behind, picked by the cause of death. A remnant stays where it fell,
  guarding what the character carried, and must never lock away something a planned path needs. **Agreed**

### 3.3 Story structure
- Endings are hard-gated by tiered milestones; each gate is proven by removing every producer. **Built**
- An ending needs exactly 3 tier-2 milestones; each tier-2 needs 1–2 tier-1. A tier-2 is shared by at most 2 endings,
  and two endings share at most one. **Built**
- Redundancy comes from different mechanisms, never the same machine reached by someone else. **Built** (checked by
  the gate proofs)
- Every ending needs milestones from at least 5 different lives; no single life reaches more than 2 milestones on its
  own. **Built**
- Optional destinations: 1 bonus per game, 2 secrets and 1 encounter per ending, each gated by milestones from at
  least 2 lives. **Built**
- Size: about 10 people for one ending, 40 for three; lives ≈ milestones + endings; NPCs ≈ lives / 2; about 6 solver
  locations per life. **Built** as guidance, not enforced.
- Every life links to at least one other. **Proposed**

### 3.4 Systems
Every interaction is one of the verbs in [`rules/core.json`](rules/core.json), driven by props on things, never by
specific objects: pick up, drop, take, unlock, enter code, cut, pry, ram, authority open, close, board, leave
vehicle, operate, read, observe, inspect, talk, fight, fight unarmed, lead, sabotage. The systems behind them
(machine, power, darkness, access, hazard, threat, clue, escort, vehicle, sabotage) are listed in
[`src/types.ts`](src/types.ts). **Built**

- **The AI may not add verbs or systems.** It makes new challenges by combining props: a "flooded basement" is a
  claimed zone with a counter, not a new rule. If an event genuinely needs a new system, that's a proposal to you
  and a change to the engine.
- Combat in the engine is a stand-in. The real game is real-time and player-driven; threats are obstacles with costs
  and risks, and the game reports outcomes back (escaped, cleared, died). **Agreed**
- Systems to add (**Agreed**): claimed zones as data (kill, detect, drain, slow, each with a counter), condition
  meters, typed networks (power, water, air, comms), triggered movers, disturbance tags on actions, history as
  content.

### 3.5 Inventory (**Agreed**, not built)
- Two slots: one big (batteries, fuel, weapons), one small (keys, medicine, ammo). A backpack doubles both. Car trunks
  store items.
- No default weapon. Running is always an option.
- Every planned path must fit in the slots, or include a place to set things down.

### 3.6 Skills (**Agreed**, not built beyond the five story skills)
- Story skills gate milestone mechanisms; access skills open alternative routes; perks change how a life plays.
- Roles come from a family (military, medical…), then a role, then 1–2 individual picks from the role's pool.
- No planned path requires a perk; every access skill has a non-skill alternative; every ending stays reachable with
  nobody having a given skill. **Built** for the last one.

---

## 4. Setting rules

How an event becomes a place. These are the steps the AI follows; the conventions themselves live in the kits.

1. **The event decides the setting** (Agreed). From the brief: where the threat comes from decides what the map
   borders on; isolation decides town size and the ways out; density decides urban, small town or rural; the cast
   decides the landmarks; the tone decides region, season and palette. Tropes are fine. The format is the novelty.
2. **The setting picks a town type** from the kits (logging town, mill town, port…), which brings its zones.
3. **Zones carry traits** (Agreed): era, wealth, density, use, condition, street and lot pattern, the building and
   site types they allow, their open spaces, their palette range.
4. **History is a few rolls, not a simulation** (Agreed). Each zone gets an era and condition directly; a few
   buildings per zone get a change from a short table (converted, vacant, burned, renovated, replaced) with a
   one-line reason the story can use.
5. **Required places come first.** Every place the event needs is placed as a site, in a zone where it belongs,
   before ordinary blocks are filled.
6. **Everything follows real conventions**, scaled and simplified for the view. A building type is what it is in the
   real world (an apartment over shops has a tall glass ground floor and a separate residents' door; a hospital has a
   main entrance and a separate emergency entrance with an ambulance bay). The AI cites the convention on the card.
7. **Places become story.** Each place type has hooks (what it can be in a story); the lives are built on them.

Ash River and Millbrook are separate places. (Agreed)

---

## 5. Spatial rules

### 5.1 The grid (**Built**)
- 2 m cells, one 16 × 16 tile each. Layers are floors (`z` = 0 ground, negative below).
- Cell kinds: void, solid building (`%`), wall (`#`), portal (`+`), street (`=`), sidewalk (`_`), water (`~`),
  stairs, ladder, manhole (`S` `L` `M`), and floor chars mapped to zones.
- Zones become locations; walls make rooms; links are open boundaries, portals and vertical access; ticks come from
  distance.
- Streets lie inside named rectangles; sidewalks join the street they border. Vehicles need road links 2+ cells wide.
- The compiler rejects split zones, malformed portals and missing intended links.

### 5.2 The plan (**Proposed**, not built)
The AI doesn't write grids. It writes a plan, and code compiles it:
- map size and which edges are what (forest, river, highway, the rest of town);
- streets: a centre line plus a cross-section type (local, avenue, boulevard, alley, lane, rural road);
- zones: areas with a zone type and traits;
- sites: a site type, an anchor and a facing (which street its front door faces);
- block fill: per zone, which lot pattern and which building types, by weight.

The compiler lays out lots and footprints from the kits, so geometry is code's job. Today `src/city/generate.ts`
hard-codes these decisions; it becomes the plan compiler.

### 5.3 Scale (**Built**)
- 8 px per metre: a person is about 1.9 m (16 px), a storey 3 m (24 px), a door 0.9 × 2.1 m.
- Cross-sections: local street 3 m sidewalk + 8 m road + 3 m sidewalk; avenue 14 m road; boulevard 4 + 7 + 4 m
  median + 7 + 4; alley 2 m apron + 6 m lane + 2 m apron.
- No building touches a road: there's always a sidewalk, apron or open ground between.
- Every front door opens onto open ground. Main entrances face south unless the site's card says otherwise.

---

## 6. Visual rules

### 6.1 The view (**Built**)
- 3/4 top-down: a structure is a roof seen from above over its south wall. Only south faces are drawn.
- A building is one roof object; the game lifts its roof while the player is inside. Interiors are hidden until you
  enter. Walls are thin (4 px).
- A building behind a taller one shows only what rises above it. Tall buildings hide what's behind them (a storey
  hides about 1.5 cells), so height is a cost.

### 6.2 Colour (**Built**, palette schemes **Agreed**)
- Flat 8-bit: one master palette, at most 4 colours per texture, no gradients. Outlines are black. A test enforces
  it. Imported packs keep their own palette and are exempt.
- Materials have real colour ranges (Agreed): bricks come in tints and shades (common red, dark red, orange,
  brown, buff, clinker); brick can be painted; siding and trim follow period paint schemes. A building has a scheme
  (body, trim, accent) with trims that complement the body. A texture's 4 slots are filled from steps of the master
  palette, so tints, shades, paint and wear are swaps, not new art.
- A zone has a palette range (built in one period from one supply); owners vary paint and trim; a newer or converted
  building may come from another range.

### 6.3 Characters (**Built**)
- 13 × 16 px, 8 directions; walk (idle + 6), attack, hurt, death (E and W only).
- A character is a recipe: a base, a colour per body part, layers. The AI writes recipes; it doesn't draw.
- New layers must pass the missing-pixel check (`npm run check:sprites`).

### 6.4 Environment pieces (**Built**)
- Palette-key JSON, one file per piece: textures (16 × 16), tiles, themes, props (one frame per state), decos.
- Pieces are drawn at real scale (§5.3).
- Imported pieces come in through a manifest with their licence; non-redistributable packs stay out of git.

---

## 7. The kits

The library everything is composed from. The AI may use any approved entry and propose new ones; a proposal is
used only after you approve it, and then it's available to every later event.

| Kit | Each entry says | Today |
|---|---|---|
| **Event cards** | Premise, tone, threat source and movement, isolation, density, season, required roles and places, set pieces, supported town types | None (Ash River and Harrow Court predate them) |
| **Town types** | Region, economy, size, zones with shares and which border which, map edges, events it supports, palette family | None |
| **Zone types** | Use, era, wealth, density, condition range, street and lot pattern, building and site types with weights, open spaces, change table | Three districts (downtown, residential, industrial), too coarse |
| **Building types** | Real reference, features it can't drop, features that vary, size range, storeys, footprint parts, roofs, facade grammar (base, rhythm, top), materials, interior zones, 3/4 simplification | 21 archetypes in `sprites/env/archetypes.json`, fixed recipes without variation |
| **Site types** | Parts and how they sit relative to each other (hospital: main entrance, emergency entrance on another street, ambulance bay, garage, loading dock, plant), which parts are enterable | None |
| **Materials and palettes** | Colour range in master-palette steps, paint schemes by era, trim conventions, wear | One colour set per texture |
| **Story hooks** | Per place type: what it can be in a story, what it holds, how it can change | None |
| **Character families** | Family, roles, skill and perk pools, sprite recipe parts, what they carry | Recipes and layers in `sprites/data/`; families not yet |
| **Art parts** | Textures, decos, props, layers, imported pieces | `sprites/env/data/`, `sprites/data/`, imported packs |

**How the kits adapt** (Proposed), as the sprite bases did:
- Every failure you flag, or a check catches, goes in a **failure log** with what went wrong and which kit entry
  caused it.
- Each one is fixed in the kit, in this order of preference: correct the entry; split it into narrower entries; add a
  check so it can't recur; or remove the capability until it can be done reliably.
- A kit entry that keeps producing failures is narrowed or removed, not prompted harder.

---

## 8. The checks (the referee)

An event ships only when all of these pass.

| Check | What it proves | Status |
|---|---|---|
| Schema | Every file matches its format; every reference resolves | Built for worlds; Proposed for the event files |
| Grid compile | No split zones, bad portals or missing links | Built |
| Plan compile | The plan fits the map; every required place is placed; nothing overlaps | Proposed |
| Spatial | No building touches a road; doors open onto open ground; real proportions | Built (tests, for generated cities) |
| Life plans | Every life's planned path works from its start, with its obstacle and triggers | Built |
| Story structure | Endings provable, every gate real, milestone counts and sharing rules hold, skills are shortcuts | Built |
| Mission safety | No sequence of play can make a living character's mission impossible | Built |
| Deadline | At least twice the slowest proven ending | Built |
| Art exists | Every tile, deco, prop and recipe the event uses exists | Built |
| Palette | Master palette only; at most 4 colours per texture | Built |
| Sprites | No missing pixels in any recipe | Built |
| Conventions | Every placed building and site has its can't-drop features (the ambulance bay is there) | Proposed |
| Render review | The AI looks at each rendered map and checks it against the setting card and the conventions it cited, and lists what doesn't match | Proposed |

The quick check (about 40 s) runs inside the authoring loop; the full proof runs once at the end.

---

## 9. The authoring loop (**Proposed**)

An authoring agent (Claude Agent SDK) with the engine's commands as its tools:

1. Write the brief and the setting, choosing from the kits.
2. Write the plan; compile it; fix what the compiler rejects.
3. Write the cast and lives on the setting's places and hooks; run the quick check; fix.
4. Dress and render; review the render against the setting card; revise.
5. Write proposals for any kit parts it needed and didn't have.
6. Run the full check. Hand you the package, the renders, the check report and the proposals.

**Models:** the strongest one for the brief, setting, story and review; cheaper ones for bulk work (block fill,
dialogue, names).

---

## 10. Open

- Are the event file formats right? They need one event authored by hand in them before they're fixed.
- Inventory and skill families are agreed but not built; the checks for them can't run yet.
- Combat and remnants depend on the real-time game, which reports outcomes the engine doesn't model yet.
- What a site card needs, and how the plan compiler fits sites into blocks, is the biggest unknown in §5.2.
- How much review you want per event: every event, or only new kit parts once the kits are stable.
