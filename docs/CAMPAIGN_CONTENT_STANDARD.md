# RPG ESL — Campaign Content Standard (v0.1)

Status: version 0.1. This is the target authoring standard derived from the
master directive. It is a specification, not an implemented schema. The current
JSON files in `/content` follow an older, simpler shape documented in
`CONTENT_GUIDE.md`; migrating them requires explicit authorization.

## 1. Conceptual hierarchy

`RPG ENGINE -> THEME CARTRIDGE -> CAMPAIGN -> CHAPTER -> SCENE -> EVENT / CHOICE / DIALOGUE`

The engine is reusable and content-agnostic. A cartridge is a self-contained
authored world (identity, lore, campaigns, locations, NPCs, creatures, items,
events, encounters, dialogue, endings, ESL activities, visual/audio assets).
A cartridge is not a visual skin. Installing one must not rebuild the app.

## 2. Required content properties (target)

- Stable IDs for every entity; explicit content version.
- Campaign stores cartridge id and exact cartridge version. A missing or
  incompatible version must produce a clear error, never silent substitution.
- Conditions, choices, dialogue variants, scene transitions, NPC definitions,
  event triggers, story flags, encounter eligibility, ending conditions, ESL
  activities, asset references and references to other content.
- Authored content is inspectable and maintainable: avoid one giant JS file and
  avoid scattering story conditions through engine code.
- Every important line and outcome is pre-authored; no runtime generation of
  plot or dialogue.

## 3. Chapter handoff template (required per chapter)

Document explicitly:
1. Why the next chapter begins.
2. Information the players have at that point.
3. Characters involved.
4. Events already occurred.
5. Choices that influence the next chapter.
6. State variables transferred (flags, NPC states, items, relationships).
7. Optional scenes unlocked.
8. Earlier events referenced.

## 4. Scene/choice/authoring rules

- Every scene has a narrative purpose tied to the central conflict or world
  development. Remove set-pieces with no purpose.
- Choices declare conditions, effects and perceptible consequences.
- Dialogue variants declare prerequisites and include a fallback line.
- Conditional events declare explicit conditions; no arbitrary selection.
- Optional encounters never carry unique critical information; provide a
  fail-forward alternative route.
- Endings declare the state/flags they evaluate; they must reflect what
  actually happened.
- Converging branches preserve prior consequences in dialogue and state.
- Chapter 1 introduces problem/stakes/objective; chapter 2 develops and
  complicates; chapter 3 resolves using information and decisions from before.

## 5. Validation catalogue (target)

The loader must detect, naming file + problem:
- missing scene references; invalid choices; unreachable mandatory scenes;
  impossible conditions; missing dialogue fallbacks; missing alternative clues;
  invalid ending references; duplicate identifiers; inconsistent NPC
  references; missing content assets; chapter transitions without valid
  destinations; incompatible/missing cartridge version.
- Presence of a JSON file is not proof of narrative validity.

## 6. Save/state fields a campaign must preserve

Campaign and cartridge ids/versions, run id, chapter/scene, selected variants,
completed scenes, resolved choices, story flags, NPC state/relationship/
knowledge, encounter history, quest status, inventory changes, key decisions,
ending conditions, event history, seed/variation state, save schema version.
Saving must not randomize an existing run or repeat resolved encounters;
export/import and backup rotation are eventual requirements.

## 7. Current gap (FACTUAL, from reconnaissance)

The shipped `content/episodes.json` supports ordered scenes, story/combat
kinds, prompts with teacher-only hints, flags, item grants, simple conditional
flavour/difficulty and bridges. It does not yet support branching scene graphs,
authored dialogue variant sets, NPC state, optional/variant encounters,
multiple endings, chapter handoffs or cartridge versioning. Scene conditionals
only swap flavour/difficulty; they do not alter scene order or state. Outcomes
are binary (`onGood`/`onBad`), not grade- or flag-specific dialogue sets. See
`PRODUCT_ROADMAP.md` for verified wiring gaps; no migration is authorized by
this document.
