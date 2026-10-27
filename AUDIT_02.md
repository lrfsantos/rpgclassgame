# AUDIT_02.md — audit checklist (scope = everything after commit 3c33a13)

Audit scope: commits 03d18e5 (B1.5) + aa3bf5f (Step C). Read REPORT/report_02 + report_03 for context. Verify with evidence only: run `tests/layout.mjs`, `tests/ui-episode.mjs`, `tests/ui-smoke.mjs`, `tests/validator.mjs` (server must be on http://localhost:8000). Report each item PASS / FAIL / PARTIAL + file:line evidence. Fix nothing speculative.

## Layout geometry (5 viewports)
- [ ] `tests/layout.mjs` passes at 1920×1080, 1366×768, 1280×720, 2560×1440, 1024×768: no horizontal overflow, no extenders past viewport, no key-block overlaps (stage, drawer, GM button, enemy, party, menu), canvas width == stage/title width, integer sprite scaling in battle.
- [ ] gm.html renders as a responsive page with NO floating GM button at all 5 viewports.
- [ ] index.html drawer docks beside the Stage (does not overlay); GM button hidden while drawer open (sibling selector, index.html button placed after drawer in DOM).

## Episode flags and branches
- [ ] `tests/ui-episode.mjs` passes: all 6 scene prompts appear on the Stage; Great run shows every onGood narration + sets `crossedBridge`; Weak run shows every onBad narration + leaves `crossedBridge` unset; `expedition.flags` non-empty at Great recap, empty at Weak.
- [ ] Conditional scene (the-clapper, content/episodes.json scene[4]): resolves difficulty 11 + whenSet flavour when `crossedBridge` set, difficulty 13 + whenUnset when not. Confirmed in save: `expedition.rooms[4].event.difficulty` / `.flavour`.
- [ ] `judgeLanguage` (src/engine/actions.js) applies scene narration + flags by grade (bonus >= 2 = good) for story AND combat scenes that carry onGood/onBad.

## Spoiler leak
- [ ] During a full episode run the Stage DOM (`#stage`) never contains any `target` or `example` string from prompts.json or episodes.json (teacher hints are GM-only). Covered by tests/ui-episode.mjs.

## GitHub Pages subpath (/rpgclassgame/)
- [ ] All asset/font/fetch paths are RELATIVE: `css/main.css` + `src/main.js` in HTML, `@font-face url("../assets/fonts/...")` in css/main.css, `fetch("content/${file}")` in src/engine/content.js, `fetch("assets/sprites/manifest.json")` in src/engine/sprites.js. No absolute URLs, so it works under the `/rpgclassgame/` subpath.
- [ ] server.js / start.bat only used for local dev; Pages serves the static files directly.

## Offline after first load
- [ ] Does a service worker or cache manifest exist? (Check for `serviceWorker.register`, `caches.`, `appcache`, `manifest` — currently NONE exist; Page. Is offline-ability implemented at all? If not, mark FAIL and note it is deferred to Step D.)

## Save robustness
- [ ] Two-window: gm.html broadcasts full state after every mutation; stage.html requests on load and retries. Real BroadcastChannel sync across two tabs is NOT headless-testable here — note as unverified, give the 3-line manual test.
- [ ] localStorage: save written on every mutation (state.js `save()`); quota errors are caught with `console.warn` — verify a quota failure does not crash the page.
- [ ] Corrupt save (bad JSON or wrong schema): `state.load()` returns null on parse error / wrong schema and `init()` falls back to `newGameState()` — verify a visibly-corrupt save shows a recoverable state, not a blank page. Note: the global error banner (src/errors.js) covers script errors; confirm the fallback path.

## Visible version string / cache busting
- [ ] Is there a user-visible version string (footer, title, or console)? Currently NONE (grep for a version marker). If absent mark FAIL — stale GitHub Pages cache after a push is then hard to diagnose. Note as deferred to Step D (README/AUDIT list it).

## Content level check of episodes.json (The Bell of Bellingham)
- [ ] Vocabulary is A2-B2 (promise, toll-keeper, riddle, carefully, clapper, bell) — no advanced/rare words.
- [ ] Target grammar is age-appropriate and cued in prompts: promise sentence, polite question (May we/Could we), "the more... the more", "because", instruction adverb "carefully", exclamation/wish with "may".
- [ ] Tone is warm/funny/epic, not scary or inappropriate; outcomes (onGood/onBad) are safe and non-punitive.
- [ ] Each story scene's difficulty is a sensible d20 target for the stated stat (heart/mind/agility 10-13; conditional 11/13); combat scene reuses a level-2 monster (cracked-golem) appropriate for a mixed class.

## Reporting
For each section output: `PASS` / `FAIL` / `PARTIAL` + evidence. End with a
top-5 prioritized list of real defects (if any) ordered by user impact, and state
explicitly which items could NOT be verified headlessly (e.g., real two-window
BroadcastChannel sync, audible audio) so a human can do the 3-line manual check.
