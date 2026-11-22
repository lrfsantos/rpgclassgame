# RPG ESL — Product Roadmap (v0.1)

Status: version 0.1. Stages are ESTABLISHED from the master directive. The
current-position notes are factual observations of the repository, not a
commitment to implement. Each stage needs explicit authorization before work
starts; no stage may be skipped to produce a visual demonstration.

## 1. Stage sequence (ESTABLISHED)

| Stage | Goal | Evidence / exit |
|---|---|---|
| 0 | Repository reconnaissance: actual state, reusable systems, limitations, missing functionality, technical requirements for the vision | Written inventory; no assumptions |
| 1 | Product and narrative specification: data model, campaign structure, narrative rules, complete example campaign | This `docs/` set (v0.1) |
| 2 | Architecture approval: present current state and design requirements to owner and ChatGPT; do not choose the desktop framework | Explicit approval before Stage 3 |
| 3 | Core game infrastructure (only after authorization) | Approved architecture implemented |
| 4 | Persistence and narrative state: saves, flags, NPC memory, controlled variation, continuity | Save/reload and replay tests |
| 5 | GM and Table interfaces: teacher tools and projector experience | Private info never on Stage |
| 6 | First cartridge and complete adventure | Vertical slice end-to-end |
| 7 | ESL integration in context | English supports play, not a quiz |
| 8 | QA and packaging: full experience, offline compatibility, Windows distribution | Manual checks incl. audio, two windows |

## 2. Current position (FACTUAL)

The repository is a static site (HTML/CSS/vanilla ES modules, no build step)
with three entry pages: `stage.html` (projector, read-only), `gm.html`
(authoritative teacher console) and `index.html` (single-window + GM drawer).
It ships v2 rules (stats, d20 + modifier + language bonus, Focus, 3 skills per
class, spotlight rounds, assists, NPC companion, dazed-not-dead), a seeded RNG,
JSON content with boot-time validation, 8–10 room random expeditions and one
six-scene story episode with flags/item grants/conditional flavour, plus
localStorage saves and BroadcastChannel sync. A large headless-Edge test suite
covers UI, sync, layout and 120 stress runs.

It does NOT yet implement cartridge versioning/identity, branching scene
graphs, authored dialogue variant sets, NPC memory, controlled run variation,
multiple endings, campaign export/import, a service worker/offline cache or a
desktop shell. The existing "Bell of Bellingham" episode is linear; the
"Bell of Greywatch" document is an illustrative target, not shipped content.

Verified wiring gaps relevant to future architecture (read-only recon):
- `episode.goal` is required by the validator and read by `view.js:240`, but
  `episode.js` never copies it into the expedition, so the Stage goal is empty.
- `startMusic()`/`setMuted()` are defined but never called; `initAudio()` only
  resumes the audio context. There is no mute control in the UI.
- `rng.js` provides `mulberry32`, but rolls use `newSeed()` from
  `Math.random()`; the stored run seed does not make a run replayable.
- `VERSION` is `v2.2.0` (`main.js:11`) while badges say `v2.1.0`.
- No PNG sprites exist (all art is code-drawn) and no idle-2 animation is
  driven, despite `SPRITE_GUIDE.md`; `assets/sprites/manifest.json` is present.
- `content.js` validates basic shape/cross-references but not endings,
  branches, dialogue variants, reachability or cartridge compatibility.

Known manual validations still pending: physical two-window sync, audio
audibility, real PNG art, corrupt-save recovery. Branch `wip/part-1-2` was
pushed after audit approval; `main` remains untouched by this work.

## 3. Dependency order within any future implementation

data/content shape -> rules/engine -> automated tests -> UI. Do not build UI
on rules that are about to change. Do not polish visuals before logic is
correct. One milestone per session, full test run and report, then stop for
review.

## 4. Authorization gates (OPEN — not resolved by this document)

- Desktop architecture (Windows application form) — decision of owner and ChatGPT.
- Whether to migrate the existing static-site implementation or extend it.
- Content schema design and migration path from current JSON to campaign/
  cartridge structures; compatibility with existing saves.
- Exact scope and order of Stages 3–8.
- Any change to existing rules, content or UI.

## 5. Relationship to existing working rules

`AGENTS.md` governs the current milestone work on `wip/part-1-2` (Part 1.2,
Part 2/Part 3). This roadmap describes the later strategic vision; it does not
supersede the active milestone rules or authorize work on `main`.

## 6. Verification expectations for future work

Every UI feature must be driven in a headless browser against the real UI and
assert visible DOM; engine-only tests are not proof. After rules changes, rerun
the stress test. Real two-window BroadcastChannel sync, audio and real art need
human checks. Temporary test scripts are removed unless they are permanent
stress/regression tests.
