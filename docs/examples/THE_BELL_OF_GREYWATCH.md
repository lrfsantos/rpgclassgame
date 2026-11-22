# The Bell of Greywatch — illustrative campaign (v0.1)

Status: version 0.1, ILLUSTRATIVE design reference from the master directive.
It is not shipped content and not an instruction to replace the existing
"The Bell of Bellingham" episode. All names, scenes and branches below are
authored examples of the target narrative model.

## 1. Premise and narrative spine

Setting: a small medieval village at an old river crossing. Its bronze warning
bell has protected the lower streets for generations: when it rings, the
village closes the sluices and evacuates. One morning the bell is missing and
a dangerous storm is approaching.

Spine: the bell vanishes -> the tower shows hurried removal -> clues point to
smugglers and an abandoned mill -> the party follows the route and learns why
the bell was taken -> the storm arrives and the party's earlier decisions
determine whether the village is warned and what happens to the responsible
people. Every encounter reveals information, introduces a character, creates a
choice, changes a relationship or produces a later consequence.

Central conflict: recover the warning or save the people before the flood.
Stakes: the lower village and its future. Objective: warn the village in time;
the bell itself is a means, not the only solution.

## 2. Characters and motivations (ESTABLISHED examples)

- **Village watchman**: reports the theft; wants the warning restored.
- **Goblin under the bridge** (optional): hired lookout; knows a heavy cart went
  toward the abandoned mill; motivated by self-preservation.
- **Smugglers**: moved the bell; intend to shift it before the storm.
- **Mill contact** (alternative source): can deliver the same critical clue when
  the goblin is absent.
- **Party**: the class, acting together through spoken decisions.

## 3. Chapter 1 — The Silent Tower

Purpose: introduce village, missing bell, flood, objective, initial clues and
first meaningful decisions. Evidence: rope marks, muddy cart tracks, bronze
fragments, broken crate, smuggler symbol.

Variable encounter — three authored variants, selected once per new run and
stored in the save:

- **A — Goblin lookout**: hostile but talkative; he saw the cart go to the mill.
  Choices: negotiate, intimidate, fight, offer help, let him escape.
- **B — Empty bridge**: no goblin; footprints, broken lantern, dropped token.
  The token leads to the mill contact. Same critical information is available.
- **C — Frightened goblin**: injured, distrustful; escaped after the smugglers
  attacked him; information available but requires reassurance.

Consequences: party may gain a smuggler token, the goblin's trust, or alert the
smugglers; they may discover an alternative route. All variants lead onward —
this is the fail-forward rule in practice.

Flags: `goblin_encountered`, `goblin_helped`, `goblin_threatened`,
`goblin_alive`, `bridge_route_discovered`, `smugglers_alerted`.

Chapter handoff to 2: the party knows the bell went toward the abandoned mill;
the goblin's state (if any) and whether the smugglers were alerted are carried
forward; variant B carries the token instead of an NPC relationship.

## 4. Chapter 2 — The Abandoned Mill

Purpose: confirm the smugglers' role, learn where the bell is being kept and
let prior decisions change the scene.

Authored approaches: infiltration, negotiation, direct confrontation, disguise,
information exchange, asking a previously encountered NPC for help.

Reactions (all pre-authored, none generated):
- Alerted smugglers: more guards, bell may have been moved, hostile dialogue.
- No suspicion: lighter guard, more infiltration opportunities.
- Goblin helped: returns with information, offers an alternative entrance.
- Goblin threatened: refuses, warns the smugglers, fearful or hostile variant.
- Goblin absent: the mill contact or the token supplies the necessary clue.

Flags: `bell_location_known`, `mill_infiltrated`.

Handoff to 3: the party knows where the bell is and how the smugglers are
disposed; guard strength, NPC assistance and known routes are transferred; the
storm is now close.

## 5. Chapter 3 — Before the Flood

Purpose: resolve the central conflict through decisions from earlier chapters.

Authored options: restore the bell to the tower; use it to warn villagers
directly; negotiate with the smugglers; organize evacuation another way;
abandon the bell to save people; accept a difficult compromise.

Endings (state-derived, not arbitrary):
- **A Restored Bell** — bell returns, warning sounds, sluices close, village survives.
- **B Evacuation** — bell lost, another warning path used, material losses.
- **C Unlikely Allies** — smugglers cooperate; a former hostile becomes an ally.
- **D Too Late** — action fails; lower village floods; the place is changed.

A party that helped the goblin should see that relationship acknowledged in the
finale; a party that alerted the smugglers faces the consequences they created.

## 6. ESL integration examples (ILLUSTRATIVE)

| Situation | English revision |
|---|---|
| Questioning the watchman | questions and past tense |
| Negotiating at the bridge | polite requests, conditionals |
| Reading a smuggler symbol | interpretation and inference |
| Describing the mill guard | adjectives and description |
| Giving infiltration instructions | imperatives and sequence words |
| Confronting the smugglers | argumentation and persuasion |
| Announcing the warning | public speaking, complete sentences |

Not every scene needs a language challenge; the GM judges spoken answers.

## 7. Replayability matrix (ILLUSTRATIVE)

| Run | Bridge | Information route | Outcome flavour |
|---|---|---|---|
| 1 | Goblin lookout A | goblin clue | negotiation, ally possible |
| 2 | Empty bridge B | token + mill contact | investigation focus |
| 3 | Frightened goblin C | rescue conversation | protective tone |

The variant is chosen when a NEW campaign starts, stored in the save, and
preserved on reload. An existing campaign never changes variant mid-run.

## 8. Scenario coverage from the master directive (target tests)

A goblin encounter; B goblin absent; C goblin helped; D goblin attacked;
E save/reload keeps the same variant and state; F new run selects another
eligible variant; G chapter handoffs reference prior choices; H endings reflect
actual state; I skipping optional content keeps the campaign completable;
J offline operation. These are requirements for a future implementation, not
current test results.
