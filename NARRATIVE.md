# The EVENT narrative system

How stories, characters, lives and endings work. This sits beside [CONTRACT.md](CONTRACT.md): the contract says what
an event package is and how it's checked; this file says what the story inside it does. Where the two disagree, this
file is newer, and §14 lists what in the contract it replaces.

Each rule is marked like the contract's:
- **Built:** enforced in code today.
- **Agreed:** decided with you, not built yet.
- **Proposed:** mine, needs your OK.

Nothing here is built yet. Templates with branches are what the AI authors; deterministic rules decide eligibility,
persistence and outcomes.

---

## 1. Principles (**Agreed**)

- The town and its people are the protagonist. There's no permanent player character; you play a succession of
  people, one life at a time, in a persistent world.
- Stories persist independently of the people in them. Characters persist independently of their chapters.
- The player's experience is the log. No quest log, counter, roster, checklist or progress screen.
- **Knowledge is the player's.** What the player has seen, any later character can act on, even when that bends
  in-world logic. A new character can walk to the sewer door they've never seen. Characters' knowledge only matters
  for what the story lets them claim in dialogue.
- The generator makes opportunities, not guaranteed outcomes. Losses are real; a run can end without a resolution.
- Endings aren't right or wrong answers. The player chooses what to make happen, with incomplete information.

## 2. The layers (**Agreed**)

| Layer | What it is | Advances when |
|---|---|---|
| **Acts** | Three, for the whole game | The story conditions of §3 are met |
| **Storylines** | Persistent arcs with their own cast, places, objectives and outcomes. 1 to 3 per world | Its developments complete, whoever completes them |
| **Chapters** | One playable life with a finite objective | The objective is done, or the character dies |
| **Endgame campaigns** | Act III checkpoints toward one ending | A checkpoint is completed |

They advance independently. Finishing a chapter doesn't finish a storyline; finishing a storyline doesn't end the
event.

## 3. Three acts (**Agreed**)

| | Act I: Discovery | Act II: Development | Act III: Execution |
|---|---|---|---|
| Purpose | Meet the event through ordinary people | Find out what can be done | Do it |
| New characters | Yes | Yes, including ones with a specific story in mind | **None** |
| Personal storylines | Introduced | Developed, concluded or lost | No new ones |
| Who plays | Authored and emergent chapters | Authored and emergent chapters | Emergent only, from the playable characters left |

- **Act II ends when the storylines have concluded** and the possible endings are understood but not executed.
  There's no convergence requirement: storylines can stay apart in place and story right to the end.
- **The roster locks at the start of Act III.** The game can still move people, kill them, change relationships and
  pick new playable characters from those left. It can never create a person to fill a missing role.

## 4. Storylines (**Agreed**)

A storyline is an authored **template with conditional branches**. The generator instantiates it with the world's
people and places; the rules evaluate its branches against what's actually happened.

A template has: premise, places, required and optional roles, **entry paths**, chapter opportunities, conditional
developments, objectives, failure conditions, links to other storylines, and what it contributes to endings.

- **Entry paths are alternatives.** The base storyline can begin through the delivery driver, the late private or
  the gate guard. Once one succeeds, the others needn't happen; a succeeded path still costs a redundancy if its
  character later dies.
- **States:** dormant, active, branching, degraded, resolved, failed.
- **A storyline fails** only when every path to its next development is gone. Failing one doesn't end the event,
  though it may remove an ending.
- **Allegiance.** A storyline serves an outcome: it enables, prevents, delays or changes one. Storylines can pursue
  **incompatible** outcomes. A doomsday cult storyline works to bring about what the others are trying to stop, with
  its own cast, recruitment, places and internal disagreement. The game assigns no moral verdict in advance.
  Competing storylines are a template property, used only where the event supports one.
- **A second faction is written for both sizes.** In a three-story world it can be a competing storyline; in a
  one-story world the same faction becomes one of the story's ending branches.
- Kinds of storyline objective: resistance, containment, investigation, cooperation, exploitation, abandonment. They
  can overlap, compete, or shift as the player learns more.
- A character can serve storylines whose objectives later conflict, sometimes without knowing it (restoring power to
  the facility the cult needs).

## 5. Characters (**Agreed**)

### 5.1 Three kinds of character
- **Playable characters** are the lives. **The story plans them from the beginning**: every playable character is
  in a storyline template's plan when the world is generated. They have identity, motivation, relationships,
  capabilities, world state and narrative history. Between their chapters they're NPCs; they can support another
  storyline and be played again.
- **Named NPCs** are the people a scene gives a name and a relationship to. They're never played. They can have a
  fate and a part in an ending (the antiques dealer).
- **Background characters** fill out the scene and the town. They take mass-casualty events without spending any
  lives. Crowds of them can also be generated purely for encounters: bystanders the threat goes for, whose deaths
  are simulated in play ([SYSTEMS.md](SYSTEMS.md) §1).

### 5.2 Scenes generate their people
Each chapter's scene generates who's in it. "Jim is drinking with his three friends at the bar when there's a
disruption outside" generates Jim, his three friends and the bartender as named NPCs, and some patrons as background.

A scene can contain several playable characters when the story plans for it: if one of Jim's friends is planned as
a life, the scene introduces him alongside Jim. Nothing becomes playable that wasn't planned.

**Crossover potential.** In a world with more than one storyline, a storyline can plan one of its playable
characters to first appear in another storyline's scene: Jim's friend at the bar is the nurse whose chapter is in
the hospital storyline. It's planned but not guaranteed (he can die at the bar, or the hospital storyline can start
through another entry path), and no storyline may depend on it. It's how the world feels connected: the person you
drank with in one story is the life you're playing in another.

### 5.3 Lifecycle of a playable character
Introduced, NPC, playable, returning NPC, supporting another storyline, incapacitated, dead. Not a sequence: any
state can follow another except dead. A finished personal story doesn't remove the character from the world.

### 5.4 Protagonist weight
A persistent number, for each playable character, for how much they've come to matter.

- **Interaction counts.** Meeting them as an NPC, helping or rescuing them, trusting them with something, going
  through danger together, involving them in a big decision, and surviving events the player could have changed.
- The game records what happened; the weight judges its significance. Ten chats don't outweigh one rescue.
- Weight biases: who plays next, who supports, who inherits a responsibility, NPC survival odds in uncertain
  encounters, and who's in the endgame.
- Weight is separate from **suitability** (do they fit the role), **capability** (can they do it) and
  **availability** (can they be there). It never overrides physical circumstances: weight helps you survive a swarm,
  not a collapsing building.

### 5.5 Responsibilities
Objectives belong to storylines. A character holds a responsibility while pursuing it. When they die or drop it, it
transfers to someone who plausibly would take it on: someone who was there, has a reason to care, and can do it. It
can be adapted on the way (the general's operation, run by the pizza driver). Authority and expertise don't
transfer.

## 6. Chapters (**Agreed**)

- A chapter has a playable character, an immediate motivation, an objective, circumstances, and possible outcomes.
- **Two selection modes.** *Authored*: the story names the character or the eligible group. *Emergent*: the story
  names a situation and the suitability it needs, and the system picks from the planned playable characters by
  weight, suitability and availability. Acts I and II use both, mostly authored; emergent chapters are how recurring characters establish
  themselves. Act III is emergent only.
- **Death can be the planned end.** A sacrifice isn't a failure. A chapter may offer to save the NPC who'd carry the
  story on; losing them carries the weight of a failure without being one.
- Outcomes: done and alive, done and dead, partly done, abandoned, made impossible, died without it. All persist.
- A character can be played more than once, but each return needs a story reason.
- Doing another storyline's beat (rescuing someone else's kid) completes that beat. It doesn't end your chapter.
- **Objectives change the world.** Bar the door, move the generator, open the route. Since the player already holds
  what any character learns, an objective that only passes information on ("warn the store") does nothing.
- **Suitability is per role within a checkpoint**, not yes or no for the whole campaign. A child can carry the pet
  and lead the way, but isn't picked to throw the switch.

## 7. Off-screen: soft simulation (**Agreed**)

When a chapter ends but the thing it started doesn't (the general dies leading the evacuation), the rest happens
off-screen, at the level of story beats, not steps.

- It decides where the group got to, who died, separated or joined, what was completed or abandoned. When the player
  returns, the storyline resumes there with the actual survivors.
- **Losses are dramatic, not arithmetic.** They're grounded in the situation and the people (capabilities,
  preparation, weight), not a combat model.
- **It can't break hard rules.** It can decide two people died; it can't use a route nobody could open or move a key
  that's on a body.
- **It can't close a storyline.** Off-screen events can thin a group down to one survivor. Only something that
  happens on-screen can close a storyline.

| Kind | Covers | Precision |
|---|---|---|
| Hard | Items, access, doors, power, everything persistent | Deterministic |
| Soft | Off-screen travel, casualties, developments | Plausible |
| Presentation | Dialogue, scenes, reactions | Free |

## 8. Act III: endgame campaigns (**Agreed**)

- Each ending still possible at the lock gets a campaign: an ending objective, about **3 checkpoints**, its places,
  and about **3 surviving characters** who are eligible. These are targets, not fixed counts.
- **Play alternates between campaigns.** When a chapter ends (done or dead), focus moves to another campaign. Coming
  back, the people are where they were, completed checkpoints stay completed, and the world has moved on. No resets.
  Because the stories take turns, the player always has a rough sense of each group's state.
- **Progress belongs to the campaign.** If the technician dies after restoring the radio, the radio stays restored.
- **If every eligible character in a campaign dies first, that ending closes.** Its effects on the world stay.
- **The first campaign to finish offers its ending once.** Execute it, or reject it permanently and gamble that
  another campaign gets there. A rejected ending can't come back as a backup. Rejection changes the world (the
  payload is dismantled, the group gives up its objective) rather than just removing an option.
- **One-story worlds have no rejection.** Their campaign's ending executes when it's complete. They're meant as a
  casual one-sitting game. When the story has two ending branches, an authored **decision chapter** in Act II picks
  one by something the character does in the world (keep the pet, or hand it back). If that character dies first,
  the branch is whichever ending is prepared; if neither is, there's no campaign.
- If every campaign is lost, the game shows the consequences of the event without a resolution.

## 9. Endings (**Agreed**)

- **Executed endings work.** Containment contains, the ritual completes. The surprise is in what that turns out to
  mean, never in the method failing.
- **What it means comes from the world's history**: who survived, which storylines were fulfilled or destroyed, what
  the player discovered. Two players who both contain the event get different endings.
- An ending has several dimensions: the objective, the human cost, what actually happened to the event, the
  storylines' fates, and what was misunderstood.
- Endings can be different futures, not one problem solved three ways: destruction may release what was being held
  back; containment may defer it for decades.
- An epilogue gives the fates of the people and unresolved storylines. Endings you didn't reach are never shown.

## 10. Exploration and secrets (**Agreed**)

### 10.1 What can be found
- **Optional discoveries:** a family in a basement, a supply room, a radio, evidence about the event.
- **Secret routes:** maintenance tunnels, rooftops, basements, crawlspaces, broken walls. One character can find a
  route, another open it, a third use it.
- **Secret story paths:** a discovery that opens a new development or a new way to an ending.

They range from atmospheric to practical, social, informational and structural. None is needed for an ending's basic
solvability unless that ending is built around finding it.

### 10.2 Secrets
- A **secret** is a designated discovery, fixed when the world is generated, of three kinds: **world** (the town's
  hidden places and history), **story** (concealed connections and motives) and **event** (the nature and origin of
  the catastrophe).
- **Secrets aren't items.** One is recorded the moment the player makes contact: opens the journal, enters the
  room. The record belongs to the run, not to the character, so losing the finder loses nothing.
- A secret is lost only if its place or object is destroyed before anyone reaches it.
- There's no counter. The player can suspect they've found everything, never know.
- **Secrets stay available across acts; their hints change by act.** Each act points toward a secret differently
  (the bells ring on their own in Act I, the brood gathers at the church in Act II, the tower is full of empty
  shells in Act III), so exploration is pushed again at each act. **Hints are allowed, reminders aren't:** a hint
  is something in the world; a marker or a note in the UI is a reminder.

### 10.3 The exploration layer
- Finding **every** secret adds a revelation to whichever ending the player executes. Containment plays as a
  success; with the full set, a crack forms afterwards.
- It changes what the player understands, not what the characters believe. The ending shows what they think
  happened; the layer shows what the player has learned.
- **It doesn't always undercut the ending.** Some layers reassure, some explain, some open a door. If every layer
  says "you didn't really win", players stop trusting victories.
- It needs no particular survivor and no final mission.

## 11. World size (**Agreed** for stories and time; **Proposed** for the counts)

| World | Play time | Chapters (5–10 min) | Act III | Secrets |
|---|---|---|---|---|
| 1 story | 45–60 min | ~6–8 | 1 campaign, no rejection | ~4–6 |
| 3 stories | ~3 h | ~20–25 | up to 3 campaigns, alternating | ~12–18 |

The 5–10 minutes per chapter is a design target for how long a chapter's content should take, not a time limit.
Nothing ends a chapter on the clock.

Exploration and completionist play add 1–2 hours. The cast isn't sized directly: it's what the chapters' scenes
generate (§5.1).

**A one-story world plays 2 + 3 + 3** (**Agreed**): two Act I chapters, three Act II, three Act III (one per
checkpoint). Its entry paths are real alternatives: one or two are played, not all of them.

## 12. Invariants (**Agreed**)

1. Characters persist independently of chapters; storylines persist independently of characters.
2. Death is permanent.
3. Completed world actions stay completed across lives.
4. Knowledge is the player's. Secrets are recorded on contact, per run.
5. Responsibilities transfer only to someone plausible.
6. Alternative entry paths are conditional, never all required.
7. Losing a character can remove several future possibilities at once.
8. Weight biases selection and uncertain survival; it guarantees neither.
9. Act III introduces nobody.
10. Off-screen simulation can't break hard rules or close a storyline.
11. Campaign progress persists when focus moves away.
12. Rejecting an ending is permanent; one-story worlds don't offer it.
13. Nobody is generated to rescue a failed path.

## 13. What the generator must guarantee (**Proposed**)

A run can lose anything, but it must not start unwinnable. Added to the contract's checks:

| Check | Proves |
|---|---|
| Entry redundancy | Every storyline has at least 2 entry paths, from different characters |
| Endgame cast | Every ending can have at least 3 eligible characters at the lock, if nobody dies early, without counting crossovers |
| Secret reach | Every secret is reachable at the start, by more than one route where it can be |
| Layer coverage | Every ending has its exploration layer written |
| No orphans | Every Act II character with a planned story is reachable by an entry or a transfer |
| Soft-sim bounds | No off-screen beat in a template can close a storyline |

## 14. What this changes in the contract

| Contract rule | Now |
|---|---|
| §3.1 "the next life is picked at random, weighted away from the last one's role" | Stories pick: authored or emergent chapters (§6) |
| §3.1 "future characters are frozen where they start, can't be led and can't die" | Unplayed named characters can move and die off-screen (§7), never at the hands of a hard rule they couldn't meet |
| §3.3 milestones and endings | Milestones are how Act II prepares endings; Act III checkpoints are a new layer on top (§8) |
| §3.3 "2 secrets per ending" as optional destinations | Secrets are per world and feed the exploration layer (§10) |
| §3.1 "a finite population", which counted the lives | Playable characters are planned by the storylines; scenes generate named NPCs and background (§5) |
| §3.3 sizes "10 people for one ending, 40 for three" | Set by the storylines' plans, not a population size |

The contract's own rules otherwise stand: knowledge already belongs to the player, past lives' missions are
finishable by anyone, and nothing happens on a timer.

## 15. Open

- In Acts I–II, which storyline gets the next chapter? I'd rotate to the one least recently played that has a
  chapter available, with authored chapters able to claim the next slot.
- The worked example that several rules above came from:
  [events/mischief-night/story.md](events/mischief-night/story.md).
- Whether weight is shown in any diegetic way, or only felt.
