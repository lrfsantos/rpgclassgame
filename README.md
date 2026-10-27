# Classroom RPG

A tabletop-style RPG for ESL classrooms, played by a whole class around one
shared projector. Students do **not** use their own devices. The game and the
teacher together act as the Game Master: the game runs rules, dice, HP, turn
order, monsters and narration; the teacher judges spoken English and
improvises.

- **Players:** 1 to 12 (typically 1 to 8). Each player has their own character.
- **Audience:** teens / young adults. Vocabulary A2–B2, on-screen reading ~B1.
- **Tone:** warm, funny, a bit epic.
- **Modes:** Random Expedition (8–10 themed rooms) and Story Episodes
  (scripted linear scenes where spoken English decides progress).

## Running the game

The game is a **static site** (HTML + CSS + vanilla JS ES modules). Opening the
files by double-click (`file://`) **will not work** — ES modules and
BroadcastChannel need a local server. Use one of these:

### Option A — start.bat (Windows, recommended)
Double-click `start.bat` in the project root. It opens `http://localhost:8000`
in your default browser and starts a local server, trying (in order):
1. `node server.js` (bundled, no installs — preferred),
2. `py -m http.server 8000`,
3. `python -m http.server 8000`.

If it can't find Node.js or Python, `start.bat` prints a clear message telling
you to use the VS Code Live Server extension or GitHub Pages (below).

> Note: on Windows the Microsoft Store Python "alias" (the `python.exe` in
> `...\WindowsApps`) does not actually run `http.server`. `start.bat` avoids
> it by preferring Node.js. If you prefer Python, install it from python.org
> (check "Add to PATH") — but it's not required.

### Option B — VS Code "Live Server" extension
Install the **Live Server** extension, right-click `index.html` and choose
*Open with Live Server*. A browser tab opens with a local server already set up.

### Option C — GitHub Pages
This repo is published at https://lrfsantos.github.io/rpgclassgame/. All asset
and fetch paths are relative, so the game runs under the `/rpgclassgame/`
subpath. It is *not* cached offline (no service worker yet).

## How to play

1. Open the game (see above).
2. In the GM Console (single-window mode: press **G** to open the drawer),
   add 1–12 players and give them names (or roll random names).
3. Let each player pick a class (the Stage shows the choices — no spoilers).
4. Choose a mode:
   - **Random Expedition** — a themed 9-room run (combat, challenges, traps,
     treasure, rest, events, a final boss).
   - **Story Episode** (e.g. "The Bell of Bellingham") — a linear story where
     the class answers "Say it" prompts out loud; the teacher grades
     Weak/Good/Great and the English decides what happens next.
5. Play. Dice, HP, Focus, spotlight rounds, Assists and language checks are all
   run by the game; the teacher judges spoken English and improvises.

Two-window mode: open `gm.html` (teacher laptop) and `stage.html` (projector)
in the same browser. The GM console is the source of truth; the Stage follows
via BroadcastChannel. All state is saved to `localStorage` (Continue / New Game).

## What is content vs. code

Everything the players meet is **data**, not code. Edit the JSON files in
`/content` to change the game without touching the engine (see
**CONTENT_GUIDE.md**):

| File                | Contains                                              |
|---------------------|-------------------------------------------------------|
| `content/classes.json` | Player classes (name, stats, HP, attack, skills)   |
| `content/skills.json`  | Class skills (dice, effects, flavour)               |
| `content/monsters.json`| Monsters (HP, dice, difficulty, quirks, vocab hooks)|
| `content/rooms.json`   | Expedition room templates by themed deck            |
| `content/episodes.json`| Scripted story episodes (scenes, prompts, flags)    |
| `content/vocabulary.json` | Language-check prompt packs (A2–B2)              |
| `content/prompts.json` | Narration and speaking prompts for each situation   |

The engine validates all content on load and shows a friendly error naming the
broken file and problem. Sprites come from `assets/sprites/manifest.json` (see
**SPRITE_GUIDE.md**); missing PNGs fall back to code-drawn placeholders.

## Project layout

```
protogame/
├─ index.html        single-window mode (Stage + GM drawer, hotkey G)
├─ stage.html        projector stage (read-only, no spoilers)
├─ gm.html           teacher console
├─ start.bat         local server launcher (Node or Python)
├─ server.js         tiny static server used by start.bat (Node)
├─ css/              styles (section-5 palette, pixel fonts, 16:9 stage)
├─ src/
│  ├─ main.js        entry / router / drawer
│  ├─ engine/        rules, state, rng, content, expedition, episode, sprites, audio
│  ├─ sync/          BroadcastChannel sync
│  └─ ui/            stage & GM console views, typewriter
├─ content/          all JSON game data
├─ tests/            headless-Edge UI tests + engine tests
├─ assets/           fonts (OFL) + sprite manifest
├─ AUDIT.md          audit checklist (pre-B1.5)
├─ AUDIT_02.md       audit checklist (post-B1.5 / Step C)
├─ SPRITE_GUIDE.md   how to add real sprite art
├─ CONTENT_GUIDE.md  how to edit game content
└─ NOTES.md          design decisions (one line each, decision + reason)
```

## Tests

The user cannot run tests by hand, so every UI feature is verified by a
headless-Edge test that drives the real UI (clicks + keypresses) and asserts
visible DOM. Requires the local server on port 8000, then run from the project
root:

```
node tests/ui-smoke.mjs     drawer open/close via click + G/Escape
node tests/ui-fullrun.mjs   full expedition through the real UI
node tests/ui-episode.mjs   story episode: prompts, narration, flags, spoilers
node tests/layout.mjs       fixed 16:9 geometry at 5 viewports
node tests/validator.mjs    content validation (bad files fail with messages)
node tests/functional.mjs   engine rules (undo, reroll, NPC, spotlight)
node tests/stress.mjs       120 random runs, every run must end cleanly
```

## License / notes
See `NOTES.md` for design decisions and the change log, and `CREDITS.md` for
third-party assets (fonts are OFL).
