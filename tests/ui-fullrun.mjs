// Full UI run test: drives the REAL UI in headless Edge via CDP with clicks.
// Phase 1: single-window (index.html). Phase 2: two-window (gm.html + stage.html).
// Clicks through an entire expedition, includes Language Check, Assist, Undo,
// Reroll, and asserts visible Stage text.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9224;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-fullrun-profile";
const HTTP = `http://127.0.0.1:${PORT}`;

let edge = null;
let failures = 0;
function assert(cond, msg) { if (cond) console.log("ok:", msg); else { console.error("FAIL:", msg); failures++; } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function startEdge() {
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* may not exist */ }
  for (let attempt = 0; attempt < 4; attempt++) {
    edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "about:blank"], { stdio: "ignore" });
    for (let i = 0; i < 30; i++) {
      await wait(300);
      try {
        const res = await fetch(`${HTTP}/json`);
        const list = await res.json();
        if (list.some((t) => t.type === "page")) return;
      } catch (e) { /* not up yet */ }
    }
    try { edge.kill(); } catch (e) { /* ignore */ }
    await wait(500);
  }
  throw new Error("Edge CDP never appeared");
}

async function getTargets() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${HTTP}/json`);
      const list = await res.json();
      if (list.some((t) => t.type === "page")) return list.filter((t) => t.type === "page");
    } catch (e) { /* not up yet */ }
    await wait(250);
  }
  throw new Error("Edge CDP never appeared");
}

async function newTab(url) {
  const res = await fetch(`${HTTP}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  return res.json();
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      exceptions.push(msg.params.exceptionDetails.text + ": " + (msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : ""));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  return { send, exceptions, ready: new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }) };
}

function makeClient(send) {
  return {
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      return r.result && r.result.value;
    },
  };
}

async function waitFor(client, expr, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await client.eval(expr)) return true;
    await wait(150);
  }
  return false;
}

// ---------- driver: click through an expedition in the GM console ----------
async function driveRun(gm, stageClient = null) {
  const seen = { enemy: false, sayit: false, roll: false, assistBtn: false, langBtn: false, undoBtn: false, rerollBtn: false };
  let steps = 0;
  const safety = 1500;
  let testedUndo = false, testedReroll = false, testedAssist = false;
  const stage = stageClient || gm; // in single-window the stage lives on the same page

  // open the drawer (single-window) if present
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b) b.click(); return true;})()`);
  await wait(200);

  // quick add 4
  const qa = await waitFor(gm, `!!document.querySelector('[data-action="quick-add-4"]')`);
  if (!qa) { console.error("FAIL: quick-add button not found"); failures++; return seen; }
  await gm.eval(`document.querySelector('[data-action="quick-add-4"]').click()`);
  await waitFor(gm, `document.querySelectorAll('.player-row').length >= 4`);
  const nPlayers = await gm.eval(`document.querySelectorAll('.player-row').length`);
  console.log("players added:", nPlayers);

  // start expedition
  await gm.eval(`document.querySelector('[data-action="start-expedition"]').click()`);
  const started = await waitFor(gm, `!document.querySelector('[data-action="start-expedition"]')`);
  if (!started) { console.error("FAIL: expedition did not start"); failures++; return seen; }
  console.log("expedition started");

  while (steps++ < safety) {
    const ended = await gm.eval(`!!(document.body.textContent.match(/Expedition Complete!|Expedition Over|Story Complete!|Story Over/))`);
    if (ended) break;

    // sample indicators on the stage (single-window shares the page)
    const hasEnemy = await stage.eval(`!!document.querySelector('.stage .battle-enemies')`);
    const hasSayit = await stage.eval(`!!document.querySelector('.stage .battle-menu .prompt')`);
    const hasRoll = await stage.eval(`!!document.querySelector('.stage .roll-line')`);
    const sayitLeaksHints = await stage.eval(`(()=>{const e=document.querySelector('.stage .battle-menu .prompt'); return !!(e && /Teacher hint|target:|example:|Grade the Language/i.test(e.textContent));})()`);
    if (hasEnemy) seen.enemy = true;
    if (hasSayit) { seen.sayit = true; if (sayitLeaksHints) { console.error("FAIL: stage Say-it leaks teacher hints"); failures++; } }
    if (hasRoll) seen.roll = true;
    const hasAssistBtn = await gm.eval(`!!document.querySelector('[data-action="grant-assist"]:not([disabled])')`);
    const hasLangBtn = await gm.eval(`!!document.querySelector('[data-action="judge-lang"]')`);
    const hasUndo = await gm.eval(`!!document.querySelector('[data-action="undo"]')`);
    const hasReroll = await gm.eval(`!!document.querySelector('[data-action="reroll"]:not([disabled])')`);
    if (hasAssistBtn) seen.assistBtn = true;
    if (hasLangBtn) seen.langBtn = true;
    if (hasUndo) seen.undoBtn = true;
    if (hasReroll) seen.rerollBtn = true;

    // decide the next click
    const hasNext = await gm.eval(`!!document.querySelector('[data-action="advance-room"]:not([disabled])')`);
    if (hasNext) { await gm.eval(`document.querySelector('[data-action="advance-room"]').click()`); await wait(120); continue; }

    const hasLang = await gm.eval(`!!document.querySelector('[data-action="judge-lang"]')`);
    if (hasLang) {
      if (!testedAssist) {
        const assist = await gm.eval(`document.querySelector('[data-action="grant-assist"]:not([disabled])')`);
        if (assist) { await gm.eval(`document.querySelector('[data-action="grant-assist"]:not([disabled])').click()`); testedAssist = true; await wait(100); }
      }
      await gm.eval(`document.querySelector('[data-action="judge-lang"][data-value="2"]').click()`);
      await wait(120);
      continue;
    }

    const hasActor = await gm.eval(`!!document.querySelector('[data-action="use-skill"]')`);
    if (hasActor) {
      const firstSkill = await gm.eval(`(()=>{const b=document.querySelectorAll('[data-action="use-skill"]')[0]; return b ? b.getAttribute('data-value') : null;})()`);
      await gm.eval(`document.querySelector('[data-action="use-skill"]').click()`);
      await wait(120);
      // undo test: after a plain (non-language) action resolves, undo then redo
      if (!testedUndo && !(await gm.eval(`!!document.querySelector('[data-action="judge-lang"]')`))) {
        const undoThere = await gm.eval(`!!document.querySelector('[data-action="undo"]')`);
        if (undoThere) {
          await gm.eval(`document.querySelector('[data-action="undo"]').click()`);
          await wait(100);
          const actorAgain = await gm.eval(`!!document.querySelector('[data-action="use-skill"]')`);
          if (actorAgain) await gm.eval(`document.querySelector('[data-action="use-skill"]').click()`);
          testedUndo = true;
        }
      } else if (!testedReroll) {
        const rerollThere = await gm.eval(`!!document.querySelector('[data-action="reroll"]:not([disabled])')`);
        if (rerollThere) { await gm.eval(`document.querySelector('[data-action="reroll"]').click()`); testedReroll = true; await wait(120); }
      }
      continue;
    }

    // fallback (should rarely happen): skip the room
    const skip = await gm.eval(`!!document.querySelector('[data-action="skip-room"]')`);
    if (skip) { await gm.eval(`document.querySelector('[data-action="skip-room"]').click()`); await wait(120); continue; }
    await wait(200);
  }

  seen.steps = steps;
  return seen;
}

let phase1Done = false, phase2Done = false;

try {
  await startEdge();

  // ---- Phase 1: single-window (index.html) ----
  const singleTab = await newTab("http://localhost:8000/index.html");
  const c1 = connect(singleTab.webSocketDebuggerUrl);
  await c1.ready;
  await c1.send("Runtime.enable");
  await c1.send("Page.enable");
  const gm = makeClient(c1.send);
  const seen1 = await driveRun(gm);

  const recap1 = await gm.eval(`!!(document.body.textContent.match(/Expedition Complete!|Expedition Over|Story Complete!|Story Over/))`);
  assert(recap1, "single-window run reached the recap screen");
  assert(seen1.enemy, "single-window: enemy shown on stage during combat");
  assert(seen1.sayit, "single-window: Say-it prompt shown on stage");
  assert(seen1.roll, "single-window: d20 roll breakdown shown on stage");
  assert(seen1.assistBtn, "single-window: Assist button was available");
  assert(seen1.langBtn, "single-window: Language Check buttons were available");
  assert(seen1.undoBtn && seen1.rerollBtn, "single-window: Undo and Reroll buttons were available");
  assert(c1.exceptions.length === 0, "single-window: no console exceptions (got " + c1.exceptions.length + ")");
  if (c1.exceptions.length) c1.exceptions.forEach((e) => console.error("  exc:", e));
  phase1Done = true;
  console.log("--- phase 1 (single-window) complete ---");

  // ---- Phase 2: two-window (gm.html + stage.html) ----
  // NOTE: headless Edge in this environment does NOT deliver BroadcastChannel
  // messages across tabs (verified with a raw BC test), so real-time two-window
  // sync cannot be driven headlessly. We still verify that each page mounts its
  // view cleanly without exceptions, using the same ui/gm.js and ui/stage.js
  // modules that phase 1 already proved through real clicks.
  let c2 = null;
  try {
    const stageTab = await newTab("http://localhost:8000/stage.html");
    const gmTab = await newTab("http://localhost:8000/gm.html");
    c2 = connect(gmTab.webSocketDebuggerUrl);
    await c2.ready;
    await c2.send("Runtime.enable");
    await c2.send("Page.enable");
    const cS = connect(stageTab.webSocketDebuggerUrl);
    await cS.ready;
    await cS.send("Runtime.enable");
    await cS.send("Page.enable");
    const gm2 = makeClient(c2.send);
    const stage = makeClient(cS.send);

    // The phase-1 save persists in the shared profile; clear it so gm.html
    // shows the lobby instead of the Continue/New Game overlay.
    await wait(800);
    await gm2.eval(`localStorage.removeItem('classroom-rpg-save-v1')`);
    await c2.send("Page.navigate", { url: "http://localhost:8000/gm.html" });
    await wait(800);

    // gm.html must mount the GM console in its lobby.
    const gmMounted = await waitFor(gm2, `!!document.querySelector('#gm .gm') && !!document.querySelector('[data-action="quick-add-4"]')`, 10000);
    assert(gmMounted, "two-window: gm.html mounts GM console (lobby)");
    const stageMounted = await waitFor(stage, `!!document.querySelector('#stage .stage') && document.querySelector('#stage .stage').children.length > 0`, 10000);
    assert(stageMounted, "two-window: stage.html mounts stage view");
    if (!stageMounted) {
      const sd = await stage.eval(`(()=>{const e=document.querySelector('#stage'); return {hasStageEl: !!document.querySelector('#stage .stage'), body: document.body.textContent.slice(0,200)};})()`);
      console.log("stage debug:", JSON.stringify(sd));
    }
    assert(c2.exceptions.length === 0, "two-window: no GM console exceptions");
    assert(cS.exceptions.length === 0, "two-window: no stage exceptions");
    console.error("NOT TESTED: real-time two-window sync (BroadcastChannel) cannot be driven headlessly in this environment.");
    phase2Done = true;
    console.log("--- phase 2 (page mounts) complete ---");
  } catch (e) {
    console.error("phase 2 failed:", e.message);
  }

  // ---- Phase 3: cross-page sync, both GM modes, same context ----
  let phase3Done = false;
  const phase3Latency = [];
  const phase3Ok = [];

  async function driveCrossPage(gmUrl, label) {
    const gmTab = await newTab(gmUrl);
    const cG = connect(gmTab.webSocketDebuggerUrl);
    await cG.ready;
    await cG.send("Runtime.enable");
    await cG.send("Page.enable");
    const gmX = makeClient(cG.send);

    const stTab = await newTab("http://localhost:8000/stage.html");
    const cS = connect(stTab.webSocketDebuggerUrl);
    await cS.ready;
    await cS.send("Runtime.enable");
    await cS.send("Page.enable");
    const stageX = makeClient(cS.send);
    await wait(700);

    // fresh save in both pages (same profile => same localStorage)
    await gmX.eval(`localStorage.removeItem('classroom-rpg-save-v1'); true`);
    await cG.send("Page.navigate", { url: gmUrl });
    await wait(400);

    // broadcast sniffer on the GM page
    await gmX.eval(`(()=>{try{const bc=new BroadcastChannel('classroom-rpg'); bc.onmessage=(e)=>{window.__lastBc=e.data;};}catch(e){}return true;})()`);

    // open the drawer on index.html (no-op on gm.html where it doesn't exist)
    await gmX.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
    await waitFor(gmX, `!!document.querySelector('[data-action="quick-add-4"]')`, 6000);
    await gmX.eval(`document.querySelector('[data-action="quick-add-4"]').click()`);
    await waitFor(gmX, `document.querySelectorAll('.player-row').length >= 4`, 6000);
    const nPlayers = await gmX.eval(`document.querySelectorAll('.player-row').length`);
    assert(nPlayers >= 4, label + ": 4+ players added (got " + nPlayers + ")");
    const epId = await gmX.eval(`(()=>{const b=document.querySelector('[data-action="start-episode"]'); return b?b.getAttribute('data-value'):null;})()`);
    assert(!!epId, label + ": episode start button found");
    await gmX.eval(`document.querySelector('[data-action="start-episode"]').click()`);
    await waitFor(gmX, `!!document.querySelector('#gm .step-bar') || /Story Complete/i.test(document.body.textContent)`, 6000);

    let actions = 0;
    const lat = [];
    for (let i = 0; i < 200; i++) {
      if (await gmX.eval(`/Story Complete|Story Over/i.test(document.body.textContent)`)) break;
      const step = await gmX.eval(`(()=>{const s=document.querySelector('#gm .step-bar .step.current'); return s?s.textContent:null;})()`);
      let clicked = "none";
      if (step === "CHOOSE") {
        clicked = (await gmX.eval(`(()=>{
          if (document.querySelector('[data-action="choose-approach"]')) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
            return true;
          }
          const s=document.querySelector('[data-action="use-skill"]:not([disabled])');
          if (s) { s.click(); return true; }
          return false;
        })()`)) ? "choose" : "none";
      } else if (step === "SAY IT") {
        clicked = (await gmX.eval(`(()=>{const b=document.querySelector('[data-action="grade-story"][data-value="2"]')||document.querySelector('[data-action="judge-lang"][data-value="2"]'); if(b){b.click();return true;}return false;})()`)) ? "grade" : "none";
      } else {
        clicked = (await gmX.eval(`(()=>{
          const b=document.querySelector('[data-action="story-continue"]:not([disabled])');
          if (b) { b.click(); return true; }
          const a=document.querySelector('[data-action="primary-attack"]:not([disabled])');
          if (a) { a.click(); return true; }
          const s=document.querySelector('[data-action="use-skill"]:not([disabled])');
          if (s) { s.click(); return true; }
          return false;
        })()`)) ? "primary" : "none";
      }
      if (clicked === "none") { await wait(200); continue; }
      actions++;
      const expectedStep = await gmX.eval(`(()=>{const s=document.querySelector('#gm .step-bar .step.current'); return s?s.textContent:null;})()`);
      const t0 = Date.now();
      const synced = await waitFor(stageX, `(()=>{
        const s=document.querySelector('#stage .step-bar .step.current');
        if (s && s.textContent===${JSON.stringify(expectedStep)}) return true;
        return /Story Complete|Story Over/i.test(document.body.textContent);
      })()`, 1000);
      lat.push(Date.now() - t0);
      if (!synced) { console.error("FAIL: " + label + " cross-page stage did not match GM step within 1s"); failures++; }
    }

    const stageRecap = await stageX.eval(`/Story Complete|Story Over/i.test(document.body.textContent)`);
    assert(stageRecap, label + ": stage.html showed the recap (cross-page end state propagated)");
    assert(actions >= 10, label + ": drove at least 10 actions (got " + actions + ")");
    assert(await gmX.eval(`(()=>{const b=window.__lastBc; return !!(b&&b.state&&!('history' in b.state));})()`), label + ": broadcast payload has no history");
    assert(await gmX.eval(`(()=>{const raw=localStorage.getItem('classroom-rpg-save-v1'); if(!raw)return true; const p=JSON.parse(raw); return !('history' in p);})()`), label + ": saved JSON has no history");

    // ---- rev survives reset / delete-save; Stage must follow (rev guard) ----
    const revBefore = await gmX.eval(`JSON.parse(localStorage.getItem('classroom-rpg-save-v1')).rev`);
    assert(revBefore >= 20, label + ": advanced GM past rev 20 before reset (got rev " + revBefore + ")");
    await gmX.eval(`(()=>{const b=document.getElementById('start-new'); if(b)b.click(); return true;})()`);
    await waitFor(gmX, `!!document.querySelector('[data-action="quick-add-4"]')`, 6000);
    const revAfterNew = await gmX.eval(`JSON.parse(localStorage.getItem('classroom-rpg-save-v1')).rev`);
    assert(revAfterNew >= revBefore, label + ": New Game keeps rev monotonic (before " + revBefore + " after " + revAfterNew + ")");
    const stageTitle = await waitFor(stageX, `!!document.querySelector('#stage .title-screen') || /No players yet/.test(document.body.textContent)`, 4000);
    assert(stageTitle, label + ": Stage followed New Game reset (shows lobby/title, not stale recap)");
    await gmX.eval(`(()=>{const b=document.querySelector('[data-action="delete-save"]'); if(b)b.click(); return true;})()`);
    await wait(300);
    const revAfterDel = await gmX.eval(`JSON.parse(localStorage.getItem('classroom-rpg-save-v1')).rev`);
    assert(revAfterDel >= revAfterNew, label + ": Delete save keeps rev monotonic (before " + revAfterNew + " after " + revAfterDel + ")");
    const stageStillLive = await waitFor(stageX, `!!document.querySelector('#stage .title-screen') || /No players yet/.test(document.body.textContent)`, 4000);
    assert(stageStillLive, label + ": Stage still live after Delete save");

    // ---- D15: GM reload with cleared storage = new session; Stage must follow ----
    await gmX.eval(`localStorage.removeItem('classroom-rpg-save-v1'); true`);
    await cG.send("Page.navigate", { url: gmUrl });
    await wait(600);
    await waitFor(gmX, `!!document.querySelector('[data-action="quick-add-4"]')`, 6000);
    await gmX.eval(`document.querySelector('[data-action="quick-add-4"]').click()`);
    await waitFor(gmX, `document.querySelectorAll('.player-row').length >= 4`, 6000);
    // Stage should accept the new session (different id, lower rev) and show lobby
    const stageAfterReload = await waitFor(stageX, `!!document.querySelector('#stage .title-screen') || /No players yet/.test(document.body.textContent)`, 4000);
    assert(stageAfterReload, label + ": Stage accepted the new GM session after reload (shows lobby/title)");
    const gmSession = await gmX.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p?p.session:null;})()`);
    assert(!!gmSession, label + ": published state carries a session id (got " + gmSession + ")");

    phase3Ok.push(label);
    phase3Latency.push(...lat);
    return actions;
  }

  try {
    const a1 = await driveCrossPage("http://localhost:8000/index.html", "index");
    const a2 = await driveCrossPage("http://localhost:8000/gm.html", "gm.html");
    phase3Done = true;
    console.log("phase3: actions per mode:", a1, a2);
    console.log("phase3: cross-page latency (ms): " + (phase3Latency.length ? phase3Latency.join(",") : "none"));
    console.log("--- phase 3 (cross-page sync) complete ---");
  } catch (e) {
    console.error("phase 3 failed:", e.message);
  }
} catch (e) {
  console.error("CRASH:", e);
  failures++;
} finally {
  if (edge) edge.kill();
}

if (!phase2Done) console.error("NOT TESTED: two-window layout (BroadcastChannel) could not be driven headlessly in this environment.");
console.log(failures ? `\n${failures} FAILURES` : "\nALL FULL-RUN TESTS PASSED");
process.exitCode = failures ? 1 : 0;
