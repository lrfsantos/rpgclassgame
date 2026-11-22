# RPG ESL — Narrative System Specification (v0.1)

Status: version 0.1. All mechanics below are ESTABLISHED requirements from the
master directive. They describe the target system, not a claim about the
current implementation. Implementation requires explicit authorization.

## 1. Scope and principle

The narrative system selects and presents authored content. It must never
invent arbitrary dialogue or contradict established story facts. The same
adventure may differ across playthroughs only through predefined variants and
recorded decisions; loading a save must never re-randomize past events.

## 2. Five fundamental mechanisms

### 2.1 Branching choices
Choices change what happens. Consequences must affect at least one relevant
aspect: future dialogue, NPC relationships, available scenes, items,
resources, quest conditions, event availability, encounter difficulty, routes,
alliances or ending conditions. Small but perceptible consequences are enough;
choosing different dialogue alone is not a meaningful choice.

### 2.2 Dialogue variants
NPCs have multiple authored lines selected by state: first meeting, helped,
harmed, lied to, possesses information, learned something, current chapter,
relationship, relevant previous events. NPCs must not know things they have
not acquired in the story. A killed NPC cannot appear alive without explicit
narrative justification.

### 2.3 Conditional events
Events declare explicit conditions (quest completed, enemy alerted, discount
earned, key obtained, companion rescued, enemy recognizes party). Arbitrary
event selection that can produce contradictions is forbidden.

### 2.4 Optional encounters
An encounter may appear normally, differently, elsewhere, be replaced, or be
skipped. It must never hold information essential to the main story unless the
same information is reachable through another authored route.

### 2.5 Multiple endings
Endings derive from actual events and decisions (full success, partial
success, peaceful resolution, sacrifice, alliance, failure with consequences,
alternate resolution). A relationship built across a campaign must be
acknowledged by the ending; a fixed ending regardless of play is forbidden.

## 3. Replayability and controlled variation

Two distinct situations must be separated:

- **Resuming an existing campaign**: all selected variants and decisions are
  preserved. Reloading must never change an event that already occurred,
  resurrect a killed NPC, replay a resolved encounter or alter a chosen
  dialogue variant.
- **Starting a new campaign with the same adventure**: the engine may select
  different authored variants.

Selection rules (conceptual): each new campaign gets a unique run id; eligible
variants are evaluated at campaign/chapter initialization; unmet prerequisites
exclude a variant; selection uses controlled logic and is stored in the save;
loading preserves it; a new run may select another eligible variant; local
history should avoid repeating the same variant consecutively; randomness must
never override explicit conditions; variation must not create incoherence.

Deterministic seeds or equivalent reproducible mechanisms are appropriate. A
teacher must not see an event change merely by closing and reopening the app.

## 4. Fail-forward rule

No critical information may depend on one optional encounter. If a key NPC is
absent, the clue must still be discoverable through another authored route
(tracks, testimony, letter, symbol, another NPC, earlier clue, investigation).
The main plot must remain completable.

## 5. Campaign continuity (highest narrative priority)

Every campaign defines: premise, main conflict, objective, central
mystery/problem, characters and motivations, locations, stakes, chapter
structure, causal links between chapters, clues, major decisions,
consequences and possible endings.

Chapter flow: (1) setup and inciting incident; (2) investigation, escalation
and decisions; (3) confrontation and resolution. More chapters are allowed when
justified; the real rule is causal continuity, not a rigid three-chapter cap.

Each chapter handoff documents why the next chapter begins, what information
the players have, which characters and events are involved, which choices
matter, which state variables transfer, which optional scenes unlock and which
earlier events are referenced. Events must contribute to the central story;
an encounter with no narrative purpose should be removed.

Branches may converge, but convergence preserves consequences: the same mill
can be reached with a goblin ally, with alerted guards, or via a secret
entrance — the location is shared, the experience is not.

## 6. Narrative memory and persistent state (conceptual requirements)

A campaign must be able to store: campaign id, cartridge id and version, run
id, current chapter and scene, selected variants, completed scenes, resolved
choices, story flags, NPC states/relationships/knowledge/memories/location/
alive status, encounter history, quest status, relevant inventory changes,
important character decisions, ending conditions, narrative event history,
seed or equivalent variation state, and save schema version.

Story flags are stable identifiers for established facts (e.g.
`goblin_helped`, `smugglers_alerted`, `bell_recovered`). Avoid duplicate or
contradictory flags for the same fact without a specific reason.

Narrative event history distinguishes: not happened, available, in progress,
resolved, skipped, failed, consequences already applied. This prevents
duplicate encounters and inconsistent scenes.

Save integrity: never re-randomize an existing campaign, repeat one-time
encounters, lose completed choices, restore killed NPCs without justification,
change selected dialogue variants, or silently load incompatible content.

## 7. ESL integration (ESTABLISHED)

English activities are interactions with the world, not grammar lessons:
open spoken answers, short written responses, reading/interpretation,
vocabulary, grammar in context, group problem-solving, roleplay, riddles,
instructions, negotiation. The teacher accepts, rejects, clarifies or gives
feedback; the engine applies the teacher's narrative consequence. No mandatory
speech recognition, automated grading API or online LM. Not every scene needs
a language challenge: balance narration, decisions, exploration, NPCs,
combat, puzzles and revision.

## 8. Quality controls for authored content

Coherence (purpose per scene/chapter), consequences (decisions leave traces),
continuity (location, knowledge, survival, relationships, items, facts),
alternative routes (no single point of failure), replayability (new runs may
vary; existing saves do not), converging branches (consequences preserved),
narrative fallback (never blank dialogue, missing scene or unreachable
mandatory objective).
