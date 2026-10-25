# Classroom RPG — README

A tabletop-style RPG for ESL classrooms, played by a whole class around one
shared projector screen. Students do **not** use their own devices. The game +
the teacher together act as the Game Master: the game runs rules, dice, HP,
turn order, monsters and narration; the teacher judges spoken English and
improvises.

- **Players:** 1 to 12 (typically 1 to 8). Each player has their own character.
- **Audience:** teens / young adults. Vocabulary A2–B2, on-screen reading ~B1.
- **Version 1:** base game with a Random Expedition mode. Later versions add
  episode story campaigns.

## Running the game

The game is a **static site** (HTML + CSS + vanilla JS ES modules). Opening the
files by double-click (`file://`) **will not work** — ES modules and
BroadcastChannel need a local server. Use one of these:

### Option A — start.bat (Windows, recommended)
Double-click `start.bat` in the project root. It opens `http://localhost:8000`
in your default browser and starts a local server, trying (in order):
1. `node server.js` (bundled, no installs — preferred fallback),
2. `py -m http.server 8000`,
3. `python -m http.server 8000`.

If it can't find Node.js or Python, `start.bat` prints a clear message telling
you to use the VS Code Live Server extension or GitHub Pages (below).

> Note: on Windows the Microsoft Store Python "alias" (the `python.exe` in
> `...\WindowsApps`) does not actually run `http.server`. `start.bat` avoids
> it by preferring Node.js. Node is bundled via `server.js` so no install is
> needed. If you prefer Python, install it from python.org (check "Add to
> PATH") — but it's not required.

### Option B — VS Code "Live Server" extension
Install the **Live Server** extension, right-click `index.html` and choose
*Open with Live Server*. A browser tab opens with a local server already set up.

### Option C — GitHub Pages
Push this repository to GitHub, enable Pages on the repository (branch `main`,
root folder). The game runs at
`https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## Three ways to play

| File        | What it is                                                              |
|-------------|-------------------------------------------------------------------------|
| `gm.html`   | **GM Console** — the teacher's view. Holds the authoritative game state. |
| `stage.html`| **Stage** — what students see on the projector. Read-only, no spoilers.  |
| `index.html`| **Single-window mode** — Stage fills the screen; the GM Console is a drawer toggled with the hotkey (default **G**). For teachers without a second screen. |

`gm.html` and `stage.html` stay in sync on the same computer using
`BroadcastChannel`. The GM console broadcasts its state to the Stage; when the
Stage loads or reconnects it requests the current state. Single-window mode
uses the same two views in one tab.

> Tip: in two-window mode, open `gm.html` on the teacher laptop and
> `stage.html` on the projector. The GM console is the source of truth — keep
> it open.

## First time playing

1. Start the game (see above).
2. In the GM Console, choose **New Game**.
3. Add 1–12 players and give them names (or let the game roll random names).
4. Let each player pick a class (the stage shows the choices — no reading
   ahead, no spoilers).
5. Launch the **Random Expedition**. The game rolls the dice and narrates.

All state is saved automatically to `localStorage`. Use **Continue** to resume
after closing a tab.

## What is content vs. code

Everything the players meet is **data**, not code. Edit the JSON files in
`/content` to change the game without touching the engine:

| File                  | Contains                                              |
|-----------------------|-------------------------------------------------------|
| `content/classes.json`| Player classes (name, HP, attack, skills, blurb)      |
| `content/skills.json` | Class/global skills (dice, effects, flavour)          |
| `content/monsters.json`| Monsters (HP, attack, xp, quirks, vocabulary hooks)  |
| `content/rooms.json`  | Room templates for expeditions                        |
| `content/vocabulary.json` | Vocabulary word packs (topic, level, words, prompts) |
| `content/prompts.json`| Narration / speaking prompts for each situation       |

The engine validates all content on load and shows a friendly error naming the
broken file if something is wrong.

## Project layout

```
protogame/
├── index.html        single-window mode
├── stage.html        projector stage
├── gm.html           teacher console
├── start.bat         local server launcher (Node or Python)
├── server.js         tiny static server used by start.bat (Node)
├── css/              styles
├── src/
│   ├── main.js       entry / router
│   ├── engine/       rules, state, rng, validation, expedition
│   ├── sync/         BroadcastChannel sync
│   └── ui/           stage & GM console views
└── content/          all JSON game data
```

## License / notes
See `NOTES.md` for design decisions and the change log.
