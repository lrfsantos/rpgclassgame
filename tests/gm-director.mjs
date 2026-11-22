// G GM DIRECTOR CARD test: hide, never disable. Drives the REAL UI headless.
// Asserts:
//  1. per-step x mode: zero visible DISABLED controls in the main view (everything
//     outside the collapsed .tools "More"), plus the expected ENABLED controls
//     (Continue / cards+Reshuffle / grades / Roll d20 / Next / skills).
//  2. first-time-user full story + full Random Expedition using ONLY main-view
//     controls + hotkeys (Space, 1/2/3), never opening More.
//  3. Narrate typing in More does not trigger the Space/Enter hotkey.
//  4. More collapsed by default and its open state survives re-render.
// Usage: node tests/gm-director.mjs   (requires the server on :8000)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9244;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-gmdirector-profile";
const HTTP = `http://127.0.0.1:${PORT}`;
const BASE = "http://localhost:8000";

let edge = null;
let failures = 0;
function assert(cond, msg) { if (cond) console.log("ok:", msg); else { console.error("FAIL:", msg); failures++; } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function startEdge() {
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  for (let attempt = 0; attempt < 4; attempt++) {
    edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "about:blank"], { stdio: "ignore" });
    for (let i = 0; i < 30; i++) { await wait(300); try { const r = await fetch(`${HTTP}/json`); const l = await r.json(); if (l.some((t) => t.type === "page")) return; } catch (e) {} }
    try { edge.kill(); } catch (e) {}
    await wait(500);
  }
  throw new Error("Edge CDP never appeared");
}
async function newTab(url) { const res = await fetch(`${HTTP}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }); return res.json(); }
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map(); const exceptions = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    else if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails.text + ": " + (m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : ""));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
  return { send, exceptions, ready: new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }) };
}
async function evalJs(send, expression) { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); return r.result ? r.result.value : undefined; }
// Dispatch on the focused element so keydown.target is correct (the onKey guard
// ignores hotkeys while typing in an input). Events bubble up to the window listener.
async function key(send, k) { await evalJs(send, `(document.activeElement||window).dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`); }
async function waitFor(send, expr, t = 10000) { const t0 = Date.now(); while (Date.now() - t0 < t) { if (await evalJs(send, expr)) return true; await wait(120); } return false; }

// Count visible interactive controls in the MAIN view (.gm) only; .tools is
// excluded even when More is open, so the zero-disabled guarantee covers the
// main view, not the secondary panel. Selection is by data-action where useful.
const VIEW = `(()=>{
  const gm = document.querySelector('.gm');
  const more = gm && gm.querySelector('.tools');
  const all = gm ? [...gm.querySelectorAll('button, select, input, textarea')] : [];
  let en = 0, dis = 0;
  const by = {};
  for (const el of all) {
    if (more && more.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.disabled) { dis++; continue; }
    en++;
    const k = el.dataset.action || el.dataset.setting || el.tagName.toLowerCase();
    by[k] = (by[k] || 0) + 1;
  }
  return JSON.stringify({ en, dis, by });
})()`;

const N = (view, key) => (view.by[key] || 0);

async function addPlayers(gm, n) {
  await waitFor(gm.send, `!!document.querySelector('[data-action="add-player"]')`);
  for (let i = 0; i < n; i++) await evalJs(gm.send, `document.querySelector('[data-action="add-player"]').click()`);
  await waitFor(gm.send, `document.querySelectorAll('[data-player]').length >= ${n}`);
}
async function openDrawer(gm) {
  await waitFor(gm.send, `!!document.getElementById('gm-drawer-open')`);
  await wait(400); // let main.js attach the click listener before clicking
  for (let i = 0; i < 3; i++) {
    if (await evalJs(gm.send, `document.getElementById('gm-drawer').classList.contains('open')`)) break;
    await evalJs(gm.send, `(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
    await wait(300);
  }
  assert(await evalJs(gm.send, `document.getElementById('gm-drawer').classList.contains('open')`), "GM drawer is open");
  await waitFor(gm.send, `!!document.querySelector('.gm')`);
}
async function reload(gm) {
  await evalJs(gm.send, `localStorage.removeItem('classroom-rpg-save-v1'); location.reload();`);
  await wait(1000);
  await openDrawer(gm);
  await addPlayers(gm, 4);
}

// Drive the GM main view by BUTTON EXISTENCE (not step-bar text).
// Covers story AND the combat scene inside the episode.
async function driveAny(gm) {
  return await evalJs(gm.send, `(()=>{
    const ap = document.querySelector('.gm [data-action="choose-approach"]:not([disabled])');
    if (ap) { ap.click(); return 'approach'; }
    const grade = document.querySelector('.gm [data-action="grade-story"]:not([disabled])');
    if (grade) { grade.click(); return 'grade'; }
    const lang = document.querySelector('.gm [data-action="judge-lang"]:not([disabled])');
    if (lang) { lang.click(); return 'judge'; }
    const sk = document.querySelector('.gm [data-action="use-skill"]:not([disabled])');
    if (sk) { sk.click(); return 'skill'; }
    const td = document.querySelector('.gm [data-action="talk-down"]:not([disabled])');
    if (td) { td.click(); return 'talkdown'; }
    const prim = document.querySelector('.gm .primary-step:not([disabled])');
    if (prim) { prim.click(); return 'primary'; }
    return null;
  })()`);
}

try {
  await startEdge();
  const tab = await newTab(`${BASE}/index.html`);
  const c = connect(tab.webSocketDebuggerUrl);
  await c.ready; await c.send("Runtime.enable"); await c.send("Page.enable");
  // Use a desktop viewport so the docked GM drawer has real geometry (headless
  // default 800x600 stacks the drawer below the stage, giving controls 0 size).
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const gm = { send: c.send };
  if (!(await waitFor(c.send, `!!document.getElementById('gm-drawer-open')`, 15000))) throw new Error("page never loaded (check server on :8000)");
  await openDrawer(gm);
  await addPlayers(gm, 4);

  // ---- More collapsed by default (lobby) ----
  assert(await evalJs(c.send, `!!document.querySelector('.tools') && !document.querySelector('.tools').open`), "More collapsed by default in lobby");
  assert(await evalJs(c.send, `!!document.querySelector('[data-action="delete-save"]')`), "Delete save lives in More");

  // ================= FULL STORY (main view + hotkeys only) =================
  await evalJs(c.send, `document.querySelector('[data-action="start-episode"]').click()`);
  assert(await waitFor(c.send, `!!document.querySelector('#stage .step-bar')`), "story started");
  assert(await evalJs(c.send, `!document.querySelector('.tools').open`), "More stays collapsed at story start");

  let sApproach = 0, sGrade = 0, sRoll = 0, sNext = 0;
  let v = JSON.parse(await evalJs(c.send, VIEW));
  // LISTEN -> exactly 1 primary (Continue), 0 disabled
  assert(v.dis === 0 && N(v, "story-continue") === 1, `story LISTEN: 1 Continue, 0 disabled (en=${v.en}, cont=${N(v, "story-continue")}, dis=${v.dis})`);

  // ---- READ ALOUD box (28px) + tip line; Tutorial tips off hides tip ----
  const ra = await evalJs(c.send, `(()=>{const t=document.querySelector('.gm .read-aloud-text'); return t ? (getComputedStyle(t).fontSize + '|' + !!document.querySelector('.gm .read-tip')) : null;})()`);
  assert(!!ra, "READ ALOUD box rendered on a scene with narration");
  if (ra) {
    assert(parseFloat(ra.split("|")[0]) >= 27, `READ ALOUD text >= 27px (${ra.split("|")[0]})`);
    assert(ra.split("|")[1] === "true", "READ ALOUD tip shown when Tutorial tips on");
  }
  // open More, flip Tutorial tips off, assert tip hides and More stays open
  await evalJs(c.send, `document.querySelector('.tools').open = true`);
  await evalJs(c.send, `(()=>{const t=document.querySelector('[data-setting="tutorialTips"]'); t.checked=false; t.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
  await wait(300);
  assert(await evalJs(c.send, `document.querySelector('.tools').open === true`), "More stays open across re-render");
  assert(await evalJs(c.send, `!document.querySelector('.gm .read-tip')`), "Tutorial tips off hides the READ ALOUD tip line");
  // ---- Narrate typing does not trigger hotkeys (More open, input focused) ----
  const narrFocused = await evalJs(c.send, `(()=>{const t=document.querySelector('.tools input#gm-narrate'); if(!t) return false; t.focus(); return document.activeElement===t;})()`);
  assert(narrFocused, "Narrate input focusable inside More");
  const revBefore = await evalJs(c.send, `(JSON.parse(localStorage.getItem('classroom-rpg-save-v1'))||{}).rev`);
  await evalJs(c.send, `(()=>{const t=document.getElementById('gm-narrate'); t.value='hello story'; t.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await key(c.send, " ");
  await wait(300);
  const revAfter = await evalJs(c.send, `(JSON.parse(localStorage.getItem('classroom-rpg-save-v1'))||{}).rev`);
  assert(revBefore === revAfter, `Space in Narrate input does not advance the game (rev ${revBefore} -> ${revAfter})`);
  // AUDIT11 P2: Send must clear the NEW input after the re-render, and log the text once.
  const narrText = "AUDIT11-NARRATE-REGRESSION";
  const narrSent = await evalJs(c.send, `(()=>{const t=document.getElementById('gm-narrate'); t.value=${JSON.stringify(narrText)}; const b=document.querySelector('.tools [data-action="narrate"]'); if(!b) return false; b.click(); return true;})()`);
  assert(narrSent, "Narrate Send button exists and was clicked");
  await wait(200);
  const narrCheck = JSON.parse(await evalJs(c.send, `(()=>{const i=document.getElementById('gm-narrate'); const s=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')||'{}'); const log=(s.expedition&&s.expedition.log)||[]; const n=log.filter(x=>JSON.stringify(x).includes(${JSON.stringify(narrText)})).length; return JSON.stringify({value:i?i.value:null,count:n});})()`));
  assert(narrCheck.value === "", `Narrate input is empty after Send (got "${narrCheck.value}")`);
  assert(narrCheck.count === 1, `Narration logged exactly once (got ${narrCheck.count})`);
  const stageNarr = await evalJs(c.send, `(()=>{const e=document.querySelector('#stage .stage-narration'); return e?e.textContent:'';})()`);
  assert(stageNarr.includes(narrText), `Stage displays Narrate text (got "${stageNarr.slice(0, 50)}")`);
  const revBeforeBlank = await evalJs(c.send, `(JSON.parse(localStorage.getItem('classroom-rpg-save-v1'))||{}).rev`);
  await evalJs(c.send, `(()=>{const t=document.getElementById('gm-narrate'); t.value='   '; const b=document.querySelector('.tools [data-action="narrate"]'); if(b)b.click(); return true;})()`);
  await wait(200);
  const revAfterBlank = await evalJs(c.send, `(JSON.parse(localStorage.getItem('classroom-rpg-save-v1'))||{}).rev`);
  assert(revBeforeBlank === revAfterBlank, `Whitespace Narrate is a no-op (rev ${revBeforeBlank} -> ${revAfterBlank})`);
  // re-enable tips so the rest of the story drive is unaffected; keep More closed
  await evalJs(c.send, `(()=>{const t=document.querySelector('[data-setting="tutorialTips"]'); if(t){t.checked=true; t.dispatchEvent(new Event('change',{bubbles:true}));} document.querySelector('.tools').open=false; return true;})()`);
  await wait(200);
  // advance to CHOOSE
  await key(c.send, " ");
  await waitFor(c.send, `!!document.querySelector('.gm [data-action="choose-approach"]')`);
  await wait(120);

  const t0 = Date.now(); let guard = 0;
  while (guard++ < 400) {
    if (Date.now() - t0 > 200000) { console.error("TIMEOUT: story drive >200s"); break; }
    if (await evalJs(c.send, `/Story Complete|Story Over/i.test(document.body.textContent)`)) break;
    const prim = await evalJs(c.send, `(()=>{const b=document.querySelector('.gm .primary-step:not([disabled])'); return b?b.textContent.trim():null;})()`);
    const ap = await evalJs(c.send, `!!document.querySelector('.gm [data-action="choose-approach"]')`);
    const grade = await evalJs(c.send, `!!document.querySelector('.gm [data-action="grade-story"]')`);
    const vv = JSON.parse(await evalJs(c.send, VIEW));
    assert(vv.dis === 0, `story main view: no visible disabled controls (got ${vv.dis})`);
    if (ap) {
      assert(N(vv, "choose-approach") === 3 && N(vv, "reshuffle-options") === 1, `story CHOOSE: 3 cards + Reshuffle (cards=${N(vv, "choose-approach")}, reshuffle=${N(vv, "reshuffle-options")})`);
      const did = await driveAny(gm); if (did === "approach") sApproach++;
      await wait(160);
    } else if (grade) {
      assert(N(vv, "grade-story") === 3, `story SAY IT: 3 grade buttons (got ${N(vv, "grade-story")})`);
      const did = await driveAny(gm); if (did === "grade") sGrade++;
      await wait(160);
    } else if (prim && /Roll d20/i.test(prim)) {
      assert(N(vv, "story-continue") === 1, `story ROLL: 1 Roll d20 (cont=${N(vv, "story-continue")})`);
      const did = await driveAny(gm); if (did === "primary") sRoll++;
      await wait(160);
    } else if (prim && /Next/i.test(prim)) {
      assert(N(vv, "story-continue") === 1, `story RESULT: 1 Next (cont=${N(vv, "story-continue")})`);
      const did = await driveAny(gm); if (did === "primary") sNext++;
      await wait(200);
    } else {
      // LISTEN (Continue), or the episode's combat scene (skills / judge)
      await driveAny(gm); await wait(160);
    }
  }
  assert(sApproach >= 4, `story CHOOSE picked via cards (${sApproach})`);
  assert(sGrade >= 4, `story SAY IT graded (${sGrade})`);
  assert(sRoll >= 4, `story ROLL advanced (${sRoll})`);
  assert(sNext >= 4, `story RESULT advanced (${sNext})`);
  assert(await evalJs(c.send, `/Story Complete|Story Over/i.test(document.body.textContent)`), "story reached a recap screen");

  // ================= FULL RANDOM EXPEDITION (main view + hotkeys) =================
  await reload(gm);
  await evalJs(c.send, `document.querySelector('[data-action="start-expedition"]').click()`);
  assert(await waitFor(c.send, `!!document.querySelector('#stage .step-bar')`), "expedition started");

  let cMin = 999, cMax = 0, cGrades = 0, cNext = 0;
  const t1 = Date.now(); let guard2 = 0;
  while (guard2++ < 600) {
    if (Date.now() - t1 > 240000) { console.error("TIMEOUT: expedition drive >240s"); break; }
    if (await evalJs(c.send, `/Expedition Complete|Expedition Over|Story Complete|Story Over/i.test(document.body.textContent)`)) break;
    const prim = await evalJs(c.send, `(()=>{const b=document.querySelector('.gm .primary-step:not([disabled])'); return b?b.textContent.trim():null;})()`);
    const hasSkill = await evalJs(c.send, `!!document.querySelector('.gm [data-action="use-skill"]')`);
    const hasLang = await evalJs(c.send, `!!document.querySelector('.gm [data-action="judge-lang"]')`);
    const vv = JSON.parse(await evalJs(c.send, VIEW));
    assert(vv.dis === 0, `expedition main view: no visible disabled controls (got ${vv.dis})`);
    if (hasSkill) {
      if (vv.en < cMin) cMin = vv.en; if (vv.en > cMax) cMax = vv.en;
      assert(N(vv, "use-skill") <= 6, `combat CHOOSE <= 6 skills (got ${N(vv, "use-skill")})`);
    } else if (hasLang) {
      cGrades++;
      assert(N(vv, "judge-lang") === 3, `combat ACTING: 3 grade buttons (got ${N(vv, "judge-lang")})`);
    } else if (prim && /Next room/i.test(prim)) {
      cNext++;
      assert(N(vv, "story-continue") === 1, `cleared room: 1 Next room (cont=${N(vv, "story-continue")})`);
    }
    await driveAny(gm);
    await wait(hasLang ? 200 : /Next room/i.test(prim || "") ? 250 : 200);
  }
  assert(cMin <= 6 && cMax <= 6 && cMin >= 1, `combat CHOOSE 1..6 controls (min ${cMin}, max ${cMax})`);
  assert(cGrades >= 3, `combat ACTING graded (${cGrades})`);
  assert(cNext >= 3, `cleared rooms advanced via Next room (${cNext})`);
  assert(await evalJs(c.send, `/Expedition Complete|Expedition Over|Story Complete|Story Over/i.test(document.body.textContent)`), "expedition reached an end screen");
  assert(c.exceptions.length === 0, `no console exceptions (${c.exceptions.length})`);

  console.log(failures ? "\nGM-DIRECTOR TEST FAILED" : "\nGM-DIRECTOR TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nGM-DIRECTOR TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exitCode = failures ? 1 : 0;
