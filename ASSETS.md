# EVENT asset needs

What the sprite generator has to produce for the engine's systems. The game is 2D top-down pixel art.

Status: ☐ needed · ◐ partly covered · ☑ done.

**The character generator (sprites/, see sprites/README.md):**
- 3/4 top-down view; characters are **13×16 px**, in **8 directions**, with a black outline.
- Animations: walk (idle + 6 frames), attack, hurt, death (death drawn E and W only).
- Sprites are palette-keyed JSON from the sprite editor. Characters are **recipes**: a base body, a colour per body part, and layers (hair, hats, collars). So variants are new recipes, not new drawings.
- **Scale for environments:** 16 px is about one person's height, so **one 2 m grid cell = one 16×16 tile**.

---

## 1. Buildings

**Environment builder (sprites/env/, `npm run env`):** turns a grid world into a tilemap. It has placeholder tiles
for floors (tile, plank, carpet, concrete, stone, grass), walls (top and front face), roofs, streets, water, stairs,
ladders and manholes, and 12 themes (clinic, lab, office, wood, carpet, stone, concrete, pavement, grass, gravel,
sewer, bridge). A building type is mostly a theme, so ◐ below means "a placeholder theme covers it".

Each building type needs an exterior footprint, interior tiles, doors and windows, stairs or lifts if multi-storey, and the props listed with it. Building types come from the cast (homes, workplaces, personal places) plus the scenario's landmarks.

| Type | Floors | Key props / interactions | Status |
|---|---|---|---|
| **Homes** | | | |
| Apartment block | 2–5 | Stairwell, lifts, units with personal items, mailroom | ◐ |
| Row house / small house | 1–2 | Garage, basement, kitchen, gun cabinet (some) | ☐ |
| Trailer | 1 | Cramped, flimsy door | ☐ |
| **Emergency and authority** | | | |
| Police precinct | 2 | Evidence room, lockers, holding cells, sergeant's desk, armory | ◐ |
| Fire station | 2 | Engine bay, gear lockers, pole, roof access | ☐ |
| Army checkpoint / field post | 1 | Sandbags, tents, barricade, ammo cache, radio | ☐ |
| Jail | 2 | Cells, control room, gates | ☐ |
| **Medical and science** | | | |
| Hospital | 2–4 | Wards, nurses' station, pharmacy, morgue, ER, stairwells | ◐ |
| Clinic / pharmacy | 1 | Shelves, locked drug cabinet | ☐ |
| Research lab | 2 | Analyzer, breaker room, clean room, offices | ◐ |
| **Infrastructure** | | | |
| Substation | 1 | Control room, transformers, breakers, fence | ◐ |
| Water treatment / sluice house | 2 | Pumps, sluice controls, tanks | ◐ |
| Fuel depot | 1 | Tankers, rigging bay, dispatch office, gate | ◐ |
| Bus lot / garage | 1 | Buses, workshop, keys board | ◐ |
| Sewers and tunnels | below ground | Hatches, grates, walkways, flood channels | ◐ |
| Subway station | below ground | Platforms, turnstiles, service doors | ☐ |
| Radio tower / antenna array | 1 + mast | Transmitter, climbable mast | ☐ |
| Construction site | 1–3 open | Scaffolding, crane, cutting tools | ☐ |
| **Civic and community** | | | |
| School | 2 | Classrooms, gym, front and back doors, office | ◐ |
| Library | 2 | Stacks, reading room, archive | ◐ |
| Church | 1 + belfry | Pews, crypt, bell tower | ◐ |
| City hall / records | 2 | Archive, council chamber, emergency ops | ☐ |
| Shelter / community center | 1 | Cots, supplies | ☐ |
| **Commercial** | | | |
| Café / restaurant / bar | 1 | Kitchen, walk-in, back room | ◐ |
| Hotel | 2–5 | Lobby, keycards, ballroom, rooms | ◐ |
| Grocery / warehouse | 1 | Loading dock, forklift, shelves | ☐ |
| Hardware store | 1 | Tools (cutters, crowbars) | ☐ |
| Gun shop / pawn shop | 1 | Locked cases | ☐ |
| Bank | 1 | Vault | ☐ |
| Gas station | 1 | Pumps, cans, shop | ☐ |
| **Filler (unenterable)** | | | |
| Buffer blocks, offices, ruins | — | Roof and wall tiles only | ☐ |
| **Scenario landmarks** | | | |
| Ash River: the Spire | — | Plaza base, root tunnels | ◐ |
| Lightless: Harrow Court towers | many | Dark zones, lifts | ☐ |

## 2. Character bases

The base is the body; outfits and accessories layer on top.

| Base | Notes | Status |
|---|---|---|
| Adult male, adult female | `base-male`, `base-female` | ☑ |
| Adult, heavy | Variety; "strong" trait | ☐ |
| Elderly | Recipes exist on adult bases (`grandpa`, `elderly-woman`); no stooped base or slower walk | ◐ |
| Teen | Recipe on an adult base (`teenager`); no smaller base | ◐ |
| Child | `kid` is hand-drawn, not a base, so it can't take recipes | ◐ |
| Dog | Pet, sled team, police dog (`dog-walker` needs one) | ☐ |
| **Threat and remnant bases** | | |
| Horde member | `infected` recipe; no shambling walk | ◐ |
| Remnant overlay | Turns any character base into their remnant (scenario-specific) | ☐ |
| Scenario creatures | Per scenario (e.g. elves, reindeer, snowman for Polaris) | ☐ |

## 3. Roles and variations

**Variation rule (proposed):**
- **Common roles** (nurse, police officer, soldier, worker): 4 variants.
- **Specialist roles:** 2 variants.
- **Unique story characters:** 1 bespoke sprite.

A role variant is: base × outfit × hair/skin × one accessory. Rank or role differences within a family (infantry vs sergeant) should read at a glance: insignia, hat, kit.

**Covered:** 98 recipes across 11 groups (emergency, medical, infrastructure, transport, civic, commercial, media, education, residents, underworld, event-specific), one per role. Every role in the table below has its first variant. **Still needed:** the extra variants per role (new recipes), and the accessories the recipes list under `needs`:

| Accessory | Recipes waiting | Status |
|---|---|---|
| Hard hat | 9 | ☐ |
| Hi-vis vest | 7 | ☐ |
| Key ring | 6 | ☐ |
| Apron, headset, lanyard badge, tool belt | 3 each | ☐ |
| Medic bag, respirator, mask, headlamp, climbing harness, beanie, bandana, name tag, waistcoat, hair bun, cardigan buttons | 2 each | ☐ |
| About 40 more, 1 each (stethoscope, rifle, fire helmet, backpack, dog and leash, …) | 1 each | ☐ |

Some of these are also world items (key ring, flashlight, rifle, backpack). Draw them once, as a layer for the character and a prop for the world.

| Family | Roles | Outfit signals | Variants | Status |
|---|---|---|---|---|
| Military | Infantry, sergeant, medic | Fatigues; sergeant: stripes, cap; medic: cross | 4 / 2 / 2 | ☐ |
| Police | Officer, detective, dispatcher | Uniform; detective: coat | 4 / 2 / 2 | ☐ |
| Fire / EMS | Firefighter, paramedic | Turnout gear; EMS jacket | 4 / 2 | ☐ |
| Medical | Nurse, doctor, orderly | Scrubs; doctor: coat | 4 / 2 / 2 | ☐ |
| Science | Scientist, lab assistant | Lab coat, badge | 2 / 2 | ☐ |
| Utility | Lineman, technician, dispatcher, sewer worker | Hi-vis, hard hat, waders | 2 each | ☐ |
| Transport | Bus driver, delivery driver, tanker driver | Company uniform, cap | 2 each | ☐ |
| Civic | Surveyor, librarian, teacher, priest, custodian | Workwear per role | 2 each | ☐ |
| Service | Barista, cook, hotel clerk, bartender, security guard | Aprons, uniforms | 2 each | ☐ |
| Residents | Parent, retiree, teen, unhoused, explorer | Civilian clothes | 4+ (civilians are the crowd) | ☐ |

## 4. Movement types

Each comes from an engine system or a skill.

| Movement | From | Status |
|---|---|---|
| Walk | Everyone | ☑ |
| Run | Everyone (running is always an option) | ☐ |
| Sneak / crouch | Stealth | ☐ |
| Carry heavy (slow walk) | Big items: car battery, gas can | ☐ |
| Limp | Injured weakness or injury meter | ☐ |
| Climb (ladder, fence, fire escape) | Climbing skill; ladders for all | ☐ |
| Swim / wade | Swimming skill; flooded floors | ☐ |
| Crawl (vents, gaps) | Teen/child base; tight spaces | ☐ |
| Drive (in vehicle) | Vehicles | ☐ |
| Lead (escort) | Leading rescue NPCs | ☐ |
| Being led (follow) | Rescue NPCs | ☐ |
| Stairs / floor transition | Layers (top-down: fade or slide between floors) | ☐ |

## 5. Animations

Per character base, in all 8 directions. Drawn on the base, so every recipe gets them.

| Group | Animations | Status |
|---|---|---|
| Have | Idle, walk, attack, hurt, death (E/W) | ☑ |
| Core | Run, sneak, carry heavy, limp | ☐ |
| Traversal | Climb, swim, crawl, enter/exit vehicle | ☐ |
| Items | Pick up, drop, use/interact (reach), throw, open container | ☐ |
| Access | Pry, cut, unlock, enter code, ram (in vehicle), hack | ☐ |
| Machines | Operate (lever/panel), repair | ☐ |
| Combat | Melee swing, shoot, aim, reload, hurt | ☐ |
| Care | Heal self, heal other, carry a person | ☐ |
| Social | Talk / gesture, give item, cower, panic (NPCs) | ☐ |
| Death | One per cause: bitten, burned, crushed, frozen, taken | ☐ |
| Remnant | Turning (transformation), remnant idle, remnant attack | ☐ |

## 6. Props and world interactions

Each prop needs a sprite for every state the engine tracks.

| Prop | States | Engine system | Status |
|---|---|---|---|
| Door | Closed, open, locked, pried, broken, keypad, powered | Access | ◐ |
| Gate / chain-link fence | Closed, open, cut | Access | ◐ |
| Barricade | Up, rammed, down | Access | ◐ |
| Hatch / grate | Closed, pried open | Access | ◐ |
| Keypad / card reader | Locked, unlocked, unpowered | Access, power | ☐ |
| Breaker / generator / panel | Off, on, tripped | Power, machines | ☐ |
| Machines (analyzer, sluice, transmitter) | Idle, running, broken, overloaded | Machines | ☐ |
| Lights / lamps | Off, on (darkness overlay) | Darkness, power | ☐ |
| Flare / flashlight | Item, lit, burnt out | Light | ☐ |
| Containers: locker, cabinet, car trunk | Closed, open, empty | Inventory, storage | ☐ |
| Car, van, bus, tanker, snowcat, boat | Parked, moving, wrecked, rigged (tanker) | Vehicles | ☐ |
| Big items: car battery, gas can, rifle, crowbar, bolt cutters | World sprite and icon | Inventory (big slot) | ☐ |
| Small items: keys, keycard, medicine, ammo, flare, documents | World sprite and icon | Inventory (small slot) | ☐ |
| Backpack | World sprite and icon | Bonus / inventory | ☐ |
| Documents / clues | Unread, read | Clues | ☐ |
| Fire | Spreading, burning, burnt out | Hazards | ☐ |
| Rubble / collapse | Blocking | Hazards | ☐ |
| Water / flood | Shallow, deep | Hazards, swimming | ☐ |
| Darkness / claim overlay | Per scenario (dark, smoke, swarm) | Claim effects | ☐ |
| Bodies | Per cause of death; with dropped items | Remnants, history | ☐ |
| Stash pile | Items left behind | Persistent world | ☐ |
| Optional content fixtures | Secret artifacts, encounter set pieces, bonus case | Optionals | ☐ |

## 7. UI icons

| Icon | Status |
|---|---|
| Inventory slots: big, small, doubled (backpack) | ☐ |
| Skills and perks (one icon each) | ☐ |
| Condition meters: injury, exposure, infection | ☐ |
| Objective / destination markers | ☐ |
| Stealth / detection indicator | ☐ |
