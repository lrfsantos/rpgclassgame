# CONTENT_GUIDE.md — editing the game without touching code

All game data lives in `/content` as JSON. On every load the engine validates
the files and, if something is wrong, shows a friendly error naming the file
and the problem (e.g. `classes.json: class "warrior": stats must have
might/agility/mind/heart as numbers`). Keep JSON valid (no trailing commas,
double quotes) and keep every `id` unique.

## The files

| File | What it holds |
|------|---------------|
| `classes.json` | Player classes: id, name, stat spread (must add to 12), maxHp, maxFocus, basic attack, 3 skillIds, blurb. |
| `skills.json` | Skills: id, classId, stat, target (enemy/ally/party/self), effect (attack/heal/shield/buff/debuff), damage string (d4/d6…), cost (Focus), flavour. |
| `monsters.json` | Monsters: id, deck, level, name, hp, difficulty, damage string, score, quirk, vocabHint. `names` is the pool of display names. |
| `rooms.json` | Expedition decks. Each deck has a `name`, `flavour`, and 9 `rooms` (combat/challenge/trap/treasure/rest/event + a boss). |
| `episodes.json` | Story episodes: linear scenes with a language prompt; the teacher's grade decides which narration runs. |
| `vocabulary.json` | Language-check prompt packs: level (A2/B1/B2), text (shown on Stage), target + example (teacher hints only). |
| `prompts.json` | playerNames, npcNames, and `narrations` (templated lines, `{player}`, `{monster}`, `{deck}` get substituted). |

## Writing a story episode

An episode is an ordered list of scenes. Each scene needs:

```json
{
  "id": "unique-scene-id",
  "kind": "story",                       // "story" or "combat"
  "stat": "heart",                       // story scenes only: might/agility/mind/heart
  "difficulty": 10,                      // story scenes only: d20 target
  "monsterId": "cracked-golem",          // combat scenes only: an id from monsters.json
  "flavour": "Narration shown on Stage.",
  "prompt": {
    "text": "What the class must say aloud.",
    "target": "Teacher hint: grammar/form to look for.",
    "example": "Teacher hint: a good answer."
  },
  "onGood": "Narration when graded Good or Great.",
  "onBad": "Narration when graded Weak.",
  "flags": { "someFlagName": true },     // optional: set on a Good/Great grade
  "conditional": {                        // optional: branch on a flag set earlier
    "flag": "someFlagName",
    "whenSet": { "difficulty": 11, "flavour": "…" },
    "whenUnset": { "difficulty": 13, "flavour": "…" }
  }
}
```

Rules:
- A **story** scene is a language check + d20 roll. The teacher grades the
  class's spoken answer; grading Good/Great narrates `onGood` and sets `flags`;
  grading Weak narrates `onBad` and sets nothing. The roll still adds tension
  and score.
- A **combat** scene reuses the expedition combat engine against the referenced
  monster; its `prompt`/`onGood`/`onBad` also apply to the pre-fight language
  check.
- `conditional` resolves the scene's difficulty and flavour from a flag that an
  earlier scene may have set — use it to make the story react to what the class
  said (e.g. "The Bell of Bellingham": the clapper scene is easier if the toll
  bridge was crossed politely).
- Keep vocabulary A2–B2, keep prompts short, keep tone warm and safe. Every
  scene's `prompt` needs all three of text/target/example.

## Editing rules
- Add new content with new unique ids; never reuse an existing id.
- A monster referenced by an episode (`monsterId`) must exist in `monsters.json`.
- Every deck in `rooms.json` needs exactly one boss monster.
- After editing, reload the page; the validator reports any problem by file +
  message. Then run `node tests/validator.mjs` (needs the local server).
