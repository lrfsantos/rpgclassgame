# AUDIT.md — audit checklist for another AI

Audit the current build at `C:\Users\luiza\Documents\protogame` (v2 engine + B0/B1 UI).
Work from evidence only: read the code, then verify each item with the headless-Edge
tests (`node tests/ui-smoke.mjs`, `node tests/ui-fullrun.mjs`) and the logic tests
(`tests/validator.mjs`, `tests/functional.mjs`, `tests/stress.mjs`). The server must be
running on `http://localhost:8000` (start via `start.bat` or `node server.js`) before the
headless-Edge tests. Fix nothing speculative; report each finding as PASS / FAIL / PARTIAL
with the file:line evidence.

## 1. Save versioning & validation
- [ ] Save schema has a `version` field; loads reject or migrate unknown/lower versions instead of crashing (NOTES.md: "Old v1 saves are ignored, schema bump to 2").
- [ ] `loadGame` / `saveGame` validate the shape (party exists, expected keys, sane numbers) before use.
- [ ] A corrupted save (missing keys, NaN HP, wrong version) is handled with a visible error, not a silent blank page.

## 2. Atomic saves
- [ ] `saveGame` writes localStorage in one operation and never leaves a half-written state (no multi-step writes that can interleave).
- [ ] Write happens after the in-memory state is consistent; a failure to save surfaces a banner, not silent data loss.

## 3. Global error handler
- [ ] `src/errors.js` is loaded on every entry page (`index.html`, `gm.html`, `stage.html`) before the modules.
- [ ] `window.onerror` + `unhandledrejection` show a visible banner with message + file:line and a Copy button (AGENTS.md section 1).
- [ ] The `file://` guard actually renders when the page is opened directly (script runs in `<head>` before body — must wait for `DOMContentLoaded`/body). Verify by opening `index.html` as `file://` in headless Edge.
- [ ] No path in boot/render can throw before listeners attach, leaving a dead page (see past failures in AGENTS.md section 1).

## 4. Tooling: Vitest / ESLint / Prettier / package.json / GitHub Actions
- [ ] If a `package.json` is added, scripts wire up the test runners; otherwise confirm the no-dependency constraint in AGENTS.md section 3 (no npm) is documented as intentional, not missing.
- [ ] ESLint/Prettier config (if present) enforces the code style; if absent, note that style is manual (no build step allowed).
- [ ] GitHub Actions workflow (if present) runs the Node test scripts headlessly; if absent, note manual test protocol is the only gate.

## 5. Core rule tests
- [ ] d20 + statMod + LanguageBonus + AssistBonus vs difficulty; nat20 crit, nat1 fumble (functional + stress tests cover).
- [ ] Spotlight rounds: only N act per round, fair rotation, Assists capped, dazed can assist but not act.
- [ ] Monster HP scaling `base + (acting-1)*5`; 12-round retreat cap; HP 0 = dazed not dead.
- [ ] Undo (cap-60 snapshot history) and reroll restore prior state correctly.

## 6. Accessibility: start overlay + GM drawer
- [ ] Stage has an instruction overlay / title hint ("Teacher: press G to open the GM console") — never an empty screen (AGENTS.md section 5).
- [ ] GM drawer toggles by button click AND hotkey G/Escape; focus moves sensibly; drawer content is reachable by keyboard.
- [ ] `prefers-reduced-motion` disables animations (d20 tumble, typewriter, screen shake) — verify in CSS and JS.

## 7. Live status feedback
- [ ] Stage shows the current room, whose turn, and party/monster HP/Focus bars updated from state after every GM mutation.
- [ ] Single-window mode reflects state changes after GM actions in the drawer (same-authority model).

## 8. main.js boot-module refactor
- [ ] `src/main.js` boot is split into small modules (router, drawer, sync) rather than one monolithic script; each has a clear responsibility.
- [ ] Listeners attach before anything that can throw (AGENTS.md section 1 past-failure rule).

## 9. Content validation diagnostics
- [ ] Loader/validator names the file AND the problem on failure (e.g., `classes.json: duplicate class id "warrior"`), so a teacher editing content sees what to fix (NOTES.md).
- [ ] `tests/validator.mjs` covers duplicate ids, unknown cross-refs, bad skill effects.

## 10. Version identifier / cache busting
- [ ] A visible version string exists somewhere (UI footer or console) so stale-cache confusion is diagnosable (past: "stale browser cache" was a suspected defect).
- [ ] Static assets load with cache-busting where needed after deploys to GitHub Pages.

## 11. README expansion
- [ ] README covers: what the game is, how to run (`start.bat` -> http://localhost:8000), how to play (teacher = GM), how to edit content, how to run tests, asset licensing (OFL fonts, CC0/code-drawn).
- [ ] CREDITS.md logs third-party items (fonts are OFL — must be logged).

## 12. B1-specific verification (last audit was pre-B1)
- [ ] Title screen renders (`.title-screen`), JRPG battle layout mounts (`.battle-enemies`, `.battle-party`, `.battle-menu`), damage numbers appear, d20 face + roll breakdown show on stage during combat.
- [ ] Sprites mount from the manifest; missing PNG falls back to placeholder without console errors.
- [ ] No console exceptions across the whole full-run test (`tests/ui-fullrun.mjs` asserts 0).

## Reporting
For each section output: `PASS` / `FAIL` / `PARTIAL` + evidence. End with a
top-5 prioritized list of real defects (if any) ordered by user impact, and state
explicitly which items could NOT be verified headlessly (e.g., real two-window
BroadcastChannel sync, audible audio) so a human can do the 3-line manual check.
