# EVENT play systems

The real-time systems the game needs, decided one at a time before any prototype. Sits beside
[CONTRACT.md](CONTRACT.md) (event packages and checks) and [NARRATIVE.md](NARRATIVE.md) (stories, characters,
endings). Marked like those: **Built**, **Agreed**, **Proposed**.

---

## 1. Combat (**Agreed**)

- **Easy, early in development.** A foot soldier (a common enemy) goes down to 1–2 melee hits or 1 gunshot.
- **Firearms are in**, and play much like melee. The difference is mostly how they look and sound.
- **Health points**, for now, rather than injuries shown on the sprite. Simpler to build.
- **Nests and swarms can be beaten with weapons.** An encounter can be made deliberately overwhelming when the
  intent is for the player to use the threat's counter (light, water) instead.
- **Surrounding is an enemy-type trait, and a difficulty lever.** Pack types spread around you and attack from
  different sides; lone types come straight at you. Pack types wind up their attacks a little slower to make up for
  it (0.5 s against 0.35 s in the arena).
- **Streaks** (**Proposed**, being tested in the arena): land a number of hits in a row without being hit and basic
  enemies go down in one hit. Getting hit, or 2.5 s without landing one, ends it. Running to gain distance is a good
  strategy; the streak is the reason to stand and fight instead.
- **Wary enemies** (**Proposed**, being tested): harder types that read the fight. A streak doesn't one-hit them;
  they back off and wait it out, and they won't follow you into a corridor or doorway, holding at its mouth instead.
  So the corridor-and-streak tactic works on basic enemies and not on them.
- **Allies have an aggression stat** (**Agreed**): it comes with the character (soldiers high,
  a chef low) and sets how far they go for a fight and whether they'll cross in front of you. The cautious keep you
  between them and the danger. When the playable character leads (a general, a sergeant), everyone's aggression is
  damped and you lead the charge; a citizen among soldiers is the one swept along.
- **Out of a fight the group walks in a column** (**Agreed**): a loose, staggered two by two on the path you walked,
  single file where it's narrow, moving smoothly. When an enemy near you is after someone, they spread out for the
  fight.
- **Allies only start fights while you walk or stand** (**Agreed**). While you sprint, keeping up comes first. An
  ally who's hit fights back and can get separated, then sprints to catch up once that fight is over.
- **You can tell the group to hold** (**Agreed**): they stay where they are and fight only what comes to them, until
  you call them to follow again.
- **Who an enemy goes after is a trait of its type** (**Agreed**; the three kinds are **Proposed**):

  | Kind | Goes after | Examples |
  |---|---|---|
  | **Indiscriminate** | Every living person it notices, from the start, whether or not you're there | Zombies, the infected, the brood |
  | **Threat-driven** | Only whoever fights it, or is in its way while it's after them | Soldiers, guards, most human enemies |
  | **Predatory** | The weakest it can reach first: the unarmed, the hurt, the separated | Raiders, a slasher, pack hunters |

  It changes how a place feels before you arrive (a street of indiscriminate enemies is already a massacre), what a
  crowd is worth (cover against threat-driven ones, bait for predators), and how dangerous an escort is.
- **Bystanders draw attacks** (**Agreed**): an enemy chasing you goes for a bystander who's in reach and closer than
  you, for a few seconds. Bystanders freeze when danger comes close, then some run and some cower, so running
  through a crowd is a defence, paid for in lives.
- **Crowds are generated for this.** Bystander crowds are background characters, not anyone's story group, made
  to fill streets and places for encounters. Their fights and deaths are simulated, not scripted. The "mostly
  scripted" rule below is for story NPCs (named NPCs and playable characters).
- **NPCs can fight beside you**, but NPC combat and NPC deaths are mostly scripted.

**While testing:** health is infinite and ammo unlimited. The game records how many hits the player takes in each
chapter; those numbers decide health capacity and whether it regenerates.

Open: how specials and bosses differ from foot soldiers.

## 2. Dialogue (**Agreed**)

- **All dialogue is written when the world is generated.** Nothing is written during play.
- **Simple conversations have no choices.** A conversation can have **at most one choice**, there purely for
  variety in how it reads. Choices never change what happens; decisions are made by what you do in the world.
- Lines are keyed to a small set of facts (story beats, who's alive, the act, the ending branch), with a fallback
  line for every speaker in every state. (**Proposed**: the referee checks every reachable state has a line, and
  no line speaks of the dead as alive or of a beat that hasn't happened.)
- What the player knows from earlier lives doesn't enter dialogue. You can't tell an NPC something to change what
  they do.

## 3. Handoff (**Agreed**)

- **An orb of white light** comes in from off screen and enters a character's body in the scene. The player now
  controls them.
- **On death or completion the orb leaves** the body, the scene changes, and the orb enters the next character.
- It needs no explanation in the world.
- **On screen while playing:** the character's name, their health, and an icon for each special skill they have.
- **The objective:** the scene sets it up (what's happening, what's said), and a short line of text appears as the
  orb enters and fades. It names the goal's place (§4).

## 4. Navigation and goals (**Agreed**)

- **A map that fills in with what the player has seen**, for now. It shows places only: never
  objectives, secrets or people. It belongs to the run, like the rest of the player's knowledge.
- **Goals are places and things**: every objective comes down to "get to X" or "do Y at X", with X a
  named place the objective line can name.
- **Wayfinding is in the world**: landmarks visible from a distance (the steeple, the marquee), street
  and shop signs, place names on entering, and people in the scene giving directions.
- **Done is visible when it happens**: the vault door shuts, the generator starts; then the orb
  leaves.

## 5. Escorts (**Agreed**)

Two kinds, played the same way:

| | Random escorts | Story escorts |
|---|---|---|
| Who | Survivors who aren't in any storyline, come across by chance | Named NPCs or playable characters a storyline needs moved (Sam's mother, the witness, the scientist) |
| Toughness | Fragile: go down in a couple of hits | Robust: hits knock them down or slow them, and you get them back on their feet; they don't die to a stray blow |
| If they die | Costs nothing, and it can be fun to try with a group of strangers | Only when the story means it to happen (a scripted death or a planned sacrifice), never because a blow got through. Losing your own child to a random hit is just frustrating |
| If they make it | Stay as background characters where you left them | Carry on in their storyline |

**Helping them up** (**Agreed**): a story escort who takes enough hits goes down and stays down until someone helps
them up. They don't follow while they're down, so you have to go back for them. **Someone who's down is marked**
so they're never mistaken for dead: an indicator over them, visible from a distance, that the dead don't get
(**Proposed**: a pulsing icon, plus a slow struggle animation rather than lying still). (**Proposed**: helping up takes
about a second, standing over them, open to attack; an ally can do it too; enemies lose interest in someone who's
down and turn on whoever's near.) The cost of a bad escort is time and danger to you, not the person.

The rest of this section is about random escorts: optional challenge, not story. In the course of a chapter you
can come across survivors who aren't part of any storyline, and escort them to safety.

- **They join you when you come close.** A bystander you walk up to joins the group for protection and follows at
  the back: in the column when it's calm, huddled behind you, away from the danger, in a fight, and holding when the
  group holds. They're more vulnerable than your group: frailer, looser in the line and slower to keep up, and slow
  to get round to the safe side when the danger moves, so they're the ones who get caught. (**Proposed**: up to 8 at
  a time; 1 hit; about 2 s to come round when the danger swings to the other side.)
- **They're unarmed.** They follow you, and when danger comes close they cower or run; they never fight. Enemies go
  for them as they do any bystander.
- **The play:** lead them to cover, tell them to hold, clear the way, come back for them, deliver them somewhere
  safe. That can be any shelter the map has, not one central place: the event's main gathering place (its "hold" in
  [SHORTLIST.md](events/SHORTLIST.md); Haldane's Department Store in Pine Hollow), or another that's secure, like
  a barricaded church or a locked house. Leaving them close to a fight, or in sight, is the risk. (**Proposed**: cover is a
  place enemies can't see into, and panicking survivors make noise.)
- **Saved survivors stay.** If they're alive when your chapter ends, they remain in the world as background
  characters where you left them, so the shelter fills with people you brought in.
- **Losing them costs nothing.** Their deaths don't touch any storyline, ending or secret. It's a challenge you can
  take or leave.

## 6. Climbing and elevation

- **A level is half a storey** (**Agreed**): 1.5 m, 12 px in the view. A storey (3 m, as the buildings are drafted)
  is two levels; a one-storey roof is level 2.
- **One level you climb without help** (**Agreed**): a car, a dumpster, a low wall or a stack of crates is one level,
  and that's the most anyone climbs bare-handed. Anything higher takes a ladder, stairs or a fire escape.
- **Down follows the same rule** (**Agreed**): you drop one level at a time. Off a car, yes; off a roof, only by the
  ladder or stairs.
- **Height gives no combat bonus** (**Agreed**). The time it takes to climb up after you is the advantage.
- **Basements come later** (**Agreed**).
- **Proposed** (built in the arena to try): climbing takes time and makes noise, and you can't fight mid-climb;
  climbing is an enemy-type trait (none, one level, ladders, or everything: scaling walls); stairs anyone can walk;
  fights only happen on one level; from up high you see over walls and are hard to see from below; a ladder takes one
  at a time, so a group goes up in a line. Arena timings: a one-level climb 0.5 s, a drop 0.25 s, a ladder 1.2 s,
  scaling a wall 1 s.

## 7. Still to design

| System | The question |
|---|---|
| **Encounters and threat behaviour** | How enemies roam, notice you, chase, give up, nest and spread; the planned collision on each errand vs the ambient threat |
| **NPCs on screen** | Following, fleeing, hiding; how scripted fights and deaths play out beside you; how weight affects survival |
| **Vehicles** | Driving in the 3/4 view, collisions, the plow |
| **Light, water, fire, spread** | How each behaves; Mischief Night depends on light and water |
| **Remnants** | What a death leaves behind and how it guards what the character carried |
| **Endings** | Cutscenes, the epilogue, the exploration layer |
