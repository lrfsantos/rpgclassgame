# RPG ESL — Game Design Vision (v0.1)

Status: version 0.1, initial product direction. This document records the
established direction from the master directive. It is NOT an authorization to
implement anything. Illustrative material and unresolved questions are labelled
explicitly. Product/design authority: project owner and ChatGPT.

## 1. Core identity (ESTABLISHED)

RPG ESL is an offline-first, teacher-led digital tabletop RPG for English
revision in classrooms. It is played by a whole class around one projector;
students do not use individual devices. The teacher and the game share the GM
role: the game runs rules, dice, HP, turn order, monsters and narration; the
teacher judges spoken English and improvises.

It is NOT a quiz with RPG graphics, an online multiplayer RPG, an open-world
game, an AI-generated interactive fiction platform, a teacher replacement, or a
sequence of disconnected exercises.

It IS a tabletop RPG adapted for classroom use, a collective narrative
adventure, a persistent campaign system with decisions and consequences, and a
modular platform for thematic cartridges. English revision is integrated into
the fiction rather than bolted on.

Design philosophy: **GAME FIRST. EDUCATION INTEGRATED.** Students should want
to play another session. Tone: warm, funny, a bit epic. Content: A2–B2
vocabulary, on-screen reading around B1, teenage/young-adult audience.

## 2. Classroom configuration and teacher authority (ESTABLISHED)

- Primary use: one teacher computer connected to a projector; shared-table
  play. Do not design around student logins or mandatory multiplayer.
- The teacher must be able to approve or override results, skip events, modify
  consequences, choose alternative dialogue, trigger optional encounters,
  ignore suggested events and advance the narrative manually. Automation
  assists; it never replaces the teacher.

## 3. Technical and commercial constraints (ESTABLISHED)

Windows desktop application; offline-first; no paid hosting; no mandatory
server, online authentication, account, paid API or generative AI; local
campaign and content storage; local backups; export/import of campaigns; no
dependency on GitHub during gameplay (GitHub may distribute source/releases).

Open architectural question: the final desktop architecture is NOT chosen
here. Electron, Tauri and other frameworks must not be selected
independently — the project owner and ChatGPT decide.

## 4. Three conceptual layers (ESTABLISHED as separation of concerns)

- **RPG Engine**: reusable rules, dice, attributes, characters, combat, events,
  inventory, quests, campaign persistence, narrative-state evaluation, GM
  tools, projector interface. No campaign-specific narrative hardcoded in core.
- **Theme Cartridges**: self-contained authored worlds (lore, campaigns,
  chapters, locations, NPCs, creatures, items, dialogue, variants, ESL
  activities, visual/audio assets). Installing a cartridge must not require
  rebuilding the application. Each campaign stores its cartridge id and exact
  content version; incompatible or missing content must be reported, never
  silently replaced.
- **ESL Content**: vocabulary, grammar, comprehension, interpretation,
  dialogue, description, instructions, negotiation and reasoning integrated
  into situations. See `NARRATIVE_SYSTEM_SPEC.md` and
  `CAMPAIGN_CONTENT_STANDARD.md`.

This separation is conceptual. It does not authorize a particular desktop
architecture or an immediate rewrite of the current implementation.

## 5. Narrative philosophy (ESTABLISHED)

Manageable world, rich possibilities: prewritten, structured, branching,
reactive, replayable, coherent and connected stories. No generative invention
of dialogue or plot during play; every important line is authored ahead of
time. "Prewritten" does not mean rigid: the engine selects authored content
according to choices, flags, relationships, previous chapters, optional events
and the chosen playthrough variant.

## 6. Product quality standard (ESTABLISHED)

1. Feels like a real tabletop RPG. 2. Teacher stays GM. 3. Student decisions
matter. 4. The world remembers. 5. The same campaign can feel different.
6. Alternative encounters and dialogue are pre-authored. 7. Narrative stays
coherent across chapters. 8. Optional events have alternative paths.
9. Endings reflect decisions. 10. English is integrated naturally.
11. Works offline. 12. A campaign can be saved and resumed. 13. Works on a
classroom projector. 14. Can grow through modular cartridges.

Highest standards: students experience an adventure, not a worksheet; every
chapter belongs to one story, every decision leaves a trace, every variation
preserves continuity; rich authored content without a massive open world,
generative AI, paid services or uncontrolled complexity.

## 7. Relationship to the current build (FACTUAL SUMMARY)

The repository currently contains a static-site browser game (vanilla JS ES
modules, no build step) with a rules engine, two entry pages plus a
single-window mode, JSON content, validation, seeded RNG, save/load, 1–12
player spotlight combat, language checks, a six-scene story episode with flags,
and headless-Edge tests. It is NOT yet a cartridge-based, branching,
multi-ending campaign system. A separate read-only reconnaissance feeds
`PRODUCT_ROADMAP.md`; no existing gameplay system is to be discarded without
explicit authorization.

## 8. Status of this document

- ESTABLISHED: sections 1–6 come from the master directive (v0.1).
- ILLUSTRATIVE: `examples/THE_BELL_OF_GREYWATCH.md` is a design reference, not
  shipped content and not an instruction to replace current content.
- OPEN: desktop architecture, content schema migration, implementation stages
  and any change to existing mechanics require explicit authorization.
