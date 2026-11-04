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
- **Out of a fight the group walks in a column** (**Agreed**): a loose two by two on the path you walked, single
  file where it's narrow. When an enemy near you is after someone, they spread out for the fight.
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

## 5. Still to design

| System | The question |
|---|---|
| **Encounters and threat behaviour** | How enemies roam, notice you, chase, give up, nest and spread; the planned collision on each errand vs the ambient threat |
| **Climbing and verticality** | Upper floors, roofs, basements and the climb points between them; which threats can follow |
| **NPCs on screen** | Following, fleeing, hiding; how scripted fights and deaths play out beside you; how weight affects survival |
| **Vehicles** | Driving in the 3/4 view, collisions, the plow |
| **Light, water, fire, spread** | How each behaves; Mischief Night depends on light and water |
| **Remnants** | What a death leaves behind and how it guards what the character carried |
| **Endings** | Cutscenes, the epilogue, the exploration layer |
