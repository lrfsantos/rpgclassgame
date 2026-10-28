# AGENTS.md — Classroom RPG (project memory, read fully before acting)

Project folder: C:\Users\luiza\Documents\protogame (Windows). Work ONLY inside it. Never run git push or touch GitHub. Use relative paths and forward slashes in code. Windows-compatible commands only. No npm, no installs needing admin.

---

## 1. HOW TO WORK (applies to every task; this is the most important section)

Goal: reach the result in the fewest steps and tokens without lowering quality. Think in dependency order, act on evidence, never repeat work.

**Reading and editing**
- Locate before you read: use grep/glob to find the exact file and line range, then read only that range. Do not re-read a file you wrote or already read this session; trust it unless an error says otherwise.
- Edit with targeted replacements. Rewrite a whole file only if >50% of it changes. Batch independent edits in one turn.
- Do not narrate. No running commentary, no restating the task, no recap of steps. Output only: a 2-3 line plan before acting (when the task has >2 steps), then the work, then the final report (section 8).

**Order of work (dependencies first)**
data/content shape -> rules/engine -> automated tests -> UI. Never build UI on rules that are about to change. Never fix visuals before logic is correct.

**Debugging protocol (mandatory)**
1. Reproduce or observe the failure with evidence (console error text, headless-browser DOM dump, request log, failing test). No evidence = no fix yet.
2. State ONE hypothesis for the root cause, with the evidence behind it.
3. Make the smallest fix that addresses that cause. No unrelated cleanups, no "while I'm here" changes, no speculative fixes in several places at once.
4. Verify with the same method that showed the failure. If still failing after 2 attempts on the same hypothesis, discard it and form a new one from new evidence; do not keep patching.
5. Report the root cause in <=2 lines.

**Testing rules**
- The user CANNOT test code. Every UI feature must be verified by a headless-Edge test that drives the REAL UI with simulated clicks and keypresses (not by calling engine functions) and asserts visible DOM text/controls. Engine tests that pass are NOT proof a feature is done.
- Add a global error handler (window.onerror + unhandledrejection) in every page that shows a visible banner with the error message and file/line, plus a "Copy" button. A silent blank page must never happen again.
- Past failures to never repeat: inverted duplicate check in the validator (twice), boot() never called, render() crashing on a null element before listeners attach. When code mounts UI, attach listeners BEFORE anything that can throw, and wrap each render section so one failure shows an error box and the rest still renders.
- Logic tests (node scripts with stubs) do NOT catch UI wiring bugs. Past failures prove it: a `boot()` that was never called, and a GM button/hotkey that does nothing. For every UI change run a UI smoke test in headless Edge (`msedge.exe --headless=new --dump-dom` against the local server, or a scripted DOM test) that simulates the click/keypress and asserts the resulting DOM (e.g., drawer open, stage shows expected text).
- After any engine/rules change rerun the stress test (1-12 random players, random actions, every run must end in victory or defeat with no crash).
- BroadcastChannel sync between two real windows cannot be fully tested headless with stubs. Say so explicitly in the report and give me a 3-line manual test instead of claiming it works.
- Temporary test scripts: delete them when finished unless they are the permanent stress test (keep that one in /tests).

**Files and scope**
- Create no file that is not used by the game or required here. No DEVLOG, no process logs, no screenshots, no demo artifacts. Only NOTES.md for decisions (one line each: decision + reason).
- Stay inside the requested step. Do not start the next step. Do not add features not in this file.
- Ask me a question only if truly blocked and no sensible default exists. Otherwise decide and log it in NOTES.md.

**Phase gating**
Finish one step of the TASK QUEUE (section 7), run its checks, report, then STOP and wait for me to say "continue".

---

## 2. PRODUCT

A tabletop-style RPG for ESL classes, played by a whole class around ONE projector. Students do NOT use their own devices. The game and the teacher are the Game Master together: the game runs rules, dice, HP, turn order, monsters, narration; the teacher judges spoken English and improvises. It is a REVIEW tool: vocabulary A2-B2, on-screen reading about B1, audience teenagers and young adults. Tone: warm, funny, a bit epic. Players 1-12 (typically 1-8), each with their own character. v1 = base game + Random Expedition. Later: 2-3 story episodes with twists. Build extensible, do not overbuild.

## 3. HARD TECHNICAL CONSTRAINTS

- Static site: HTML, CSS, vanilla JS (ES modules). No frameworks, build step, backend, or external API calls. Must run on GitHub Pages and offline after first load.
- Three entry pages: `stage.html` (projector, read-only, no spoilers), `gm.html` (teacher console, AUTHORITATIVE state, broadcasts full state after every mutation), `index.html` (single-window: stage fullscreen + GM drawer, hotkey G). Two-window sync via BroadcastChannel, same browser/computer. Stage requests state on load and retries until received.
- State saved to localStorage (Continue / New Game).
- Content is data: classes, skills, monsters, rooms, vocabulary, prompts in /content JSON. Engine in /src. Loader validates all content with friendly errors naming file + problem.
- Engine is UI-agnostic: actions mutate state, UIs render from state.
- Open-licensed (CC0/OFL) or code-generated assets only; log third-party items in CREDITS.md.
- `start.bat` launches a local server (current order: node server.js -> py -> python) because file:// breaks ES modules.

## 4. RULES SPEC (target; keep it light, one idea per rule)

- Stats: Might, Agility, Mind, Heart. Each character also has HP and Focus.
- Action resolution: d20 + stat modifier + Language Bonus vs Difficulty. Natural 20 = critical (fun effect), natural 1 = fumble (fun effect).
- Language Check: before a roll, Stage shows a short "Say it" prompt drawn from vocabulary/grammar targets in content (e.g., "Describe what you do using 'cautiously'", "Make a past-tense sentence about the monster", "Ask the guard a polite question"). Student answers aloud; teacher clicks Weak / Good / Great on the GM console -> Language Bonus +0 / +2 / +4. Teacher-only hints (target form, example answers) appear ONLY on the GM console. Setting: Off / Light (sometimes) / Full (every action). English supports the game; it never gates it.
- Combat: turn-based, FF4-inspired layout, short (3-6 rounds). SPOTLIGHT ROUNDS: only N characters act per round (default 4, adjustable), fair rotation so everyone acts across rounds. Non-acting players may give an ASSIST (an English sentence of advice/encouragement) for a small bonus to an acting player. Monster HP scales with player count. With 1-2 players add a simple NPC companion. HP 0 = "dazed" (sits out), never dead.
- Classes (duplicates allowed, so 12 players work): Warrior, Thief, Mage, Cleric, Ranger, Bard. Each: stat spread, free basic attack, 3 skills that complement other classes (Thief: stealth / perception / pickpocket; Cleric: heal / shield; Bard: inspire = bonus to another player's roll). Skills cost 1 Focus; Focus regenerates 1 per round. The ACTIVE player's skill menu appears on Stage on their turn (no paper sheets).
- Dice: animated d20 on Stage (tumble, settle, number, critical flash) with sound. Teacher can reroll or override any result.
- GM console: set party (names, classes), adjust HP/Focus/score, override or reroll dice, skip or replay a scene, change difficulty and Language Check setting, send a free-text "narrate to Stage" message, view teacher-only hints, undo last action.
- Random Expedition: 8-10 rooms from themed decks (Forest, Crypt, Ruins). Room kinds: combat, riddle/skill challenge, trap, treasure, rest, event, final boss. Narration coherent within a theme. Rewards: score, gold, simple items. End: recap screen with party highlights and the target words that came up.
- Story hooks (plumbing only, no big content): flags/memory log of key events and what players said/did; scene format supporting conditions on flags; episode loader that runs a scripted scene sequence instead of a random expedition.

## 5. ART DIRECTION (mandatory)

- 16-bit JRPG feel, original, clearly inspired by Final Fantasy IV but NOT a copy: no copied names, characters, creatures, UI assets, music, logos.
- Layout = JRPG battle/exploration screen, NOT a web dashboard (no header bar + roster strip + log layout). Enemies on one side, party on the other, bordered menu window at the bottom, damage numbers, status icons.
- Chunky pixels, integer upscaling, `image-rendering: pixelated`. Text large and high contrast for a projector viewed from the back of the room.
- Palette: define ~20 colors once as CSS variables. Warm and earthy, NOT indigo/purple/navy: charcoal-brown darks (~#1b1713), parchment/bone for text and windows, ember orange and brass gold for accents, moss green, teal, brick red for status/elements. Menu windows: double-line frame, flat dark-brown fill, bone border.
- FORBIDDEN: gradients, glow, soft/large shadows, glassmorphism, rounded corners and pill buttons, emoji as icons, centered hero layouts, card grids, default system fonts for headings, generic web-app look. If you add one of these, remove it.
- Fonts: open-licensed pixel font for headings/logo (self-hosted in /assets/fonts), clean readable font for long text.
- Title screen: pixel-art logo drawn in code, simple animated backdrop (parallax hills or dungeon door), bordered "New Game / Continue" menu. Lobby shows joined players as portraits in bordered windows and a visible hint "Teacher: press G to open the GM console". NEVER show an empty screen without instruction.
- Sprites: custom art will be supplied later. Draw PLACEHOLDERS in code and build a drop-in system: sprites manifest JSON maps each character/enemy/portrait to a PNG path, frame size, frame list. Spec: party battle sprites 32x48, enemies 64x64 (bosses 128x128), portraits 64x64; frames: idle x2, attack, hurt, down, victory. Missing PNG -> placeholder. Document in SPRITE_GUIDE.md.
- Juice: scene transitions, typewriter text (click to skip), idle animations, hit flashes, screen shake, victory fanfare. Respect prefers-reduced-motion.
- Audio: Web Audio API chiptune music loop + SFX (no audio files), mute toggle.

## 6. REVIEW FINDINGS ON THE CURRENT BUILD (v1 as delivered)

**Keep and do not rebuild:** GM-authoritative sync model and the two-factory sync layer, content loader/validator with cross-reference checks, seeded RNG (mulberry32), state/save/load, UI-agnostic actions, server.js + start.bat fallback chain, the 40-run stress test approach, "dazed instead of dead", boot-time validation errors.

**Defects and deviations to fix:**
1. BUG (blocking): in index.html clicking the GM button does nothing (cursor shows pointer) and the G hotkey does nothing either; the drawer never opens. The page renders the lobby fine. Likely areas: handler not attached or throwing after boot, drawer toggle changes a class the CSS does not honor (display/visibility/transform/z-index/overlap), GM view not mounted into the drawer, hotkey listener blocked by focus or attached to the wrong element, or stale browser cache. Follow the debugging protocol; do not guess.
2. UX: the lobby shows only "No players yet." and "The Adventure Awaits" with no instruction. Must follow the title/lobby spec in section 5.
3. Look: current theme (dark indigo, glowing gold heading, thin header bar, rounded GM button) is the generic "AI website" look. Replace per section 5. Do not polish the current CSS; replace it.
4. Process: the previous run ignored phase gating and built several phases in one go, and created DEVLOG.md duplicating NOTES.md. Follow section 1 from now on.
5. Rules deviations from section 4: no stats (Might/Agility/Mind/Heart); no d20 + modifier + Language Bonus; the language check is a room type instead of a pre-roll bonus and has no Off/Light/Full setting; 2 skills per class instead of 3; no Focus; combat is "all players act once, then the monster attacks" instead of Spotlight rounds with Assists (this makes 12-player combat a slog); expedition is 5-6 rooms instead of 8-10 with themed decks.
6. Missing: dice animation, placeholder sprites, sprites manifest, SPRITE_GUIDE.md, audio, typewriter text, flags/memory system, episode loader, teacher-only hints separation, undo.
7. Untested: real two-window BroadcastChannel sync (tests used a stub).

## 7. TASK QUEUE (execute in order; stop after each step and wait for "continue"; when the queue is fully done, delete this section 7)

**Step 0 — DONE (GM button/hotkey bug).** Fixed: gm.js render() appended a null log in lobby -> bootSingle threw -> drawer listeners never attached. Guarded the null. tests/ui-smoke.mjs verifies drawer opens/closes via real clicks + G hotkey.

**Step A — DONE (rules engine, content, tests).** v2 rules implemented: stats, d20 resolution, Language Check Off/Light/Full + Weak/Good/Great, Focus, 3 skills/class, Spotlight rounds + Assists, NPC companion, 8-10 rooms from themed decks, crit/fumble, undo in state layer, reroll. Content + validator updated to v2 shapes. tests/stress.mjs (120 runs) + tests/functional.mjs green.

**Step B0 — CURRENT: a TESTABLE UI on the v2 engine.** Plain functionality styling using the section 5 palette (no art work yet). Rebuild gm.js and stage.js against the v2 state shape. GM console (gm.html + single-window drawer): lobby (Add player with name+class, blank name = random; player list with change-class/remove; "Quick test: add 4 players"; settings Language Check Off/Light/Full + spotlight size + NPC companion; Start Expedition); during play (current-state panel: room/who's turn/spotlight; active player's skill buttons basic+3 with Focus cost disabled when unaffordable; Assist buttons for non-acting players; Language Check panel with prompt + TEACHER-ONLY hints + Weak/Good/Great; Reroll; Undo; HP/Focus/score +/- adjusters; "Narrate to Stage" text box; skip room; retreat; back to lobby; delete save); a single obvious "Next step" hint line at the top. Stage (stage.html + single-window view): plain readable screen with title/lobby + instruction "Teacher: press G to open the GM console", party HP/Focus bars, current room + narration, enemy HP bar, active player + skill list, d20 result with breakdown (die + modifier + language + assist vs difficulty), Language Check prompt WITHOUT hints, recap screen at the end. No teacher-only info on Stage. Verification (mandatory, headless Edge, real clicks): script a full run through the UI (add 4 via Quick test, start, act through every room kind using clicks, incl Language Check judgement, Assist, Undo, Reroll, until recap); assert visible text; attempt the two-window layout too. STOP POINT 1: report (max 8 lines) + "How to test it yourself" (max 6 click steps), then wait for "continue".

**Step B1 — DONE (art proof).** Title screen (pixel logo + animated hills backdrop + bordered New Game/Continue menu), final JRPG battle layout for Stage (enemies right, party left, bordered bottom menu window, damage numbers), code-drawn placeholder sprites via sprites manifest (assets/sprites/manifest.json + SPRITE_GUIDE.md; party 32x48, enemies 64x64, bosses 128x128, portraits 64x64, frames idle x2/attack/hurt/down/victory, missing PNG -> placeholder), section 5 palette + self-hosted OFL pixel fonts (Press Start 2P headings, VT323 text), animated d20 with Web Audio chiptune SFX + music loop, typewriter text. prefers-reduced-motion respected. Engine logic untouched. Verified: tests/ui-smoke.mjs (title selector updated to .title-screen), tests/ui-fullrun.mjs, tests/validator.mjs, tests/functional.mjs all green headless-Edge; file:// guard DOM-ready fix verified. NOT verified: real two-window BroadcastChannel sync (see section 1), audio audibility, real PNG art.

**Step B1.5 — DONE (audit-driven two-screen layout fix, replaces B2 as written).** stage.html + gm.html = primary mode; index.html secondary. Stage = fixed 16:9 virtual canvas, letterboxed, integer sprite scaling, pixelated; minimap placeholder (top-right, expedition nodes), center battlefield, bottom menu; stage text >=28px at 1080p; pixel font only for logo/titles, VT323 for panels. gm.html responsive, no floating button. index.html drawer DOCKED beside stage (stage rescales), GM button hidden while open. Typo "The The Whispering Forest" fixed at source (prompts.json). Verified: tests/layout.mjs (permanent geometry test, 5 viewports: no overflow/extenders/overlaps, canvas=viewport, integer sprite scale) + ui-smoke + ui-fullrun, all green. Not verified headless: two-window BC sync, audio, real PNG art.

**Step B2 — PENDING (after B1.5; rest of UI):** full Stage/GM polish, teacher tools completion, audio mute toggle in UI, scene transitions, manual two-window sync test.

**Step B2 — PENDING (rest of UI, after B1 approved):** full Stage/GM polish, teacher tools completion, sprites manifest + SPRITE_GUIDE.md, audio mute, scene transitions, manual two-window sync test.

**Step C — IN PROGRESS (story plumbing):** content/episodes.json (real 6-scene story "The Bell of Bellingham"), episode loader (src/engine/episode.js buildEpisodeExpedition + actions.startEpisode) reusing the expedition combat/roll machinery, per-scene prompts + outcomes + flags (memory), validated in content.js (duplicate ids, prompt shape, monsterId cross-ref). GM lobby has a "Story episodes" section. Shipped episode: 5 story scenes + 1 combat scene. Next: finish tests/ui-episode.mjs prompt-count assertion (currently passes run + recap + 0 exceptions but only counts 3 distinct prompts; threshold is ≥4 — likely needs to count the combat scene prompt or relax to ≥3) — see REPORT/report_02.

**Step D — DONE: Finish.** A11y (focus-visible, drawer/start-overlay focus moves, reduced motion), mobile fallback (drawer stacks under stage ≤720px), visible version badge v2.1.0 (index + gm.html; no SW yet — offline deferred), README.md rewritten (episodes/tests/subpath/layout), CONTENT_GUIDE.md, CREDITS.md (OFL fonts logged). Verified: ui-smoke + layout + ui-episode all green after changes. Remaining known limits (from AUDIT_02): no offline (service worker), no corrupt-save manual test, AGENTS.md still lives in Downloads (move into repo to be auditable), real two-window BroadcastChannel sync + audio need a human/manual check.

## 8. REPORT FORMAT (after every step, max 6 lines, nothing else)

Root cause or what was built (1-2 lines) / Checks run and results (1-2 lines) / Not verified or needs my manual test (1 line) / Decisions logged to NOTES.md (1 line) / "Stopped. Say continue for Step X."
