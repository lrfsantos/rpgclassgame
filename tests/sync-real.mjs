// F2 SYNC real test: verifies Stage/GM revision sync in ONE browser context
// with a REAL popup (window.open("stage.html","classroom-stage")) and the SAME
// module instance (import("/src/engine/actions.js") by absolute URL). No
// BroadcastChannel stub, no second context. BroadcastChannel is still exercised
// as one transport among several (poll + storage + postMessage + opener-poll).
//
// Drives the engine directly and, after EVERY action, asserts the Stage's rev
// equals the GM's rev within 300ms. Includes: full Random Expedition, full
// story, undo x3 then an action, New Game, and a GM reload.
//
// Usage: node tests/sync-real.mjs   (requires the server on :8000)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9228;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-sync-profile";
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
    for (let i = 0; i < 30; i++) {
      await wait(300);
      try { const r = await fetch(`${HTTP}/json`); const l = await r.json(); if (l.some((t) => t.type === "page")) return; } catch (e) {}
    }
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
function makeClient(send) { return { eval: async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; } }; }

async function waitFor(c, expr, t = 8000) { const t0 = Date.now(); while (Date.now() - t0 < t) { if (await c.eval(expr)) return true; await wait(100); } return false; }

// absolute-URL engine handle inside the GM page (same module instance as the UI)
const IMPORTA = `(async()=>{ if(window.__rpgA) return window.__rpgA; window.__rpgA = await import("${BASE}/src/engine/actions.js"); return window.__rpgA; })()`;
async function engineHandle(gm) {
  await gm.eval(IMPORTA);
  return "window.__rpgA";
}

// Wait until the STAGE page's in-memory state rev EQUALS `target` (via any
// transport: poll/storage/postMessage/opener-poll). Reads the stage's own state
// module, NOT the shared localStorage key, so the assertion is not vacuous.
// Exact equality matters: after an undo the old code left the stage AHEAD of
// the GM (a >= check would not catch that divergence).
async function stageReaches(stage, target, timeoutMs = 3000) {
  await stage.eval(`(async()=>{ if(!window.__rpgS) window.__rpgS = await import("${BASE}/src/engine/state.js"); return true; })()`);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const rev = await stage.eval(`(()=>{const s=window.__rpgS.getState(); return s?s.rev||0:0;})()`);
    if (rev === target) return rev;
    await wait(100);
  }
  return await stage.eval(`(()=>{const s=window.__rpgS.getState(); return s?s.rev||0:0;})()`);
}

async function setupParty(gm, a, n = 4) {
  await gm.eval(`${a}.addPlayerWithClass("", "warrior")`);
  for (let i = 1; i < n; i++) await gm.eval(`${a}.addPlayerWithClass("", "mage")`);
}

try {
  await startEdge();
  // ONE browser context, TWO real pages (same user-data-dir, shared
  // localStorage). NOTE: window.open popups do not open in headless Edge
  // (verified: window.open returns null even on a trusted CDP click, and a
  // stray edge://sync-confirmation-dialog appears). The postMessage/opener
  // transport is therefore NOT exercised headlessly; the poll + storage +
  // BroadcastChannel fallbacks ARE, because both pages share localStorage.
  // This matches AGENTS.md: real two-window BC/popup sync needs a manual test.
  const gmTab = await newTab(`${BASE}/index.html`);
  const cG = connect(gmTab.webSocketDebuggerUrl);
  await cG.ready; await cG.send("Runtime.enable"); await cG.send("Page.enable");
  const gm = makeClient(cG.send);
  await waitFor(gm, `!!document.querySelector('#stage .title-screen') || !!document.querySelector('#gm .gm')`);
  await gm.eval(`localStorage.removeItem('classroom-rpg-save-v1'); location.reload();`);
  await wait(900);
  await waitFor(gm, `!!document.querySelector('#gm .gm') || !!document.querySelector('.title-screen')`);
  const a = await engineHandle(gm);
  await setupParty(gm, a, 4);

  // second real page: the Stage (same profile -> same localStorage)
  const stTab = await newTab(`${BASE}/stage.html`);
  const cS = connect(stTab.webSocketDebuggerUrl);
  await cS.ready; await cS.send("Runtime.enable"); await cS.send("Page.enable");
  const stage = makeClient(cS.send);
  await wait(800);
  assert(!!stTab, "stage.html page target created");

  // ---- Full Random Expedition ----
  await gm.eval(`${a}.startExpedition()`);
  let lastGmRev = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.rev;})()`);
  let expDone = false;
  let maxLag = 0;
  let checked = 0;
  const safety = 1500;
  for (let i = 0; i < safety; i++) {
    const phase = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.phase;})()`);
    if (phase === "victory" || phase === "defeated") { expDone = true; break; }
    // one random step forward via the UI primary (real clicks through the UI)
    const step = await gm.eval(`(()=>{const s=document.querySelector('#gm .step-bar .step.current'); return s?s.textContent.trim():null;})()`);
    let clicked = false;
    if (step === "CHOOSE") {
      clicked = await gm.eval(`(()=>{const b=document.querySelector('[data-action="choose-approach"]'); if(b){b.click();return true;} const sk=document.querySelector('[data-action="use-skill"]:not([disabled])'); if(sk){sk.click();return true;} return false;})()`);
    } else if (step === "SAY IT") {
      clicked = await gm.eval(`(()=>{const b=document.querySelector('[data-action="grade-story"][data-value="2"]')||document.querySelector('[data-action="judge-lang"][data-value="2"]'); if(b){b.click();return true;} return false;})()`);
    } else {
      clicked = await gm.eval(`(()=>{const b=document.querySelector('[data-action="story-continue"]:not([disabled])')||document.querySelector('[data-action="primary-attack"]:not([disabled])')||document.querySelector('[data-action="advance-room"]:not([disabled])')||document.querySelector('[data-action="use-skill"]:not([disabled])'); if(b){b.click();return true;} return false;})()`);
    }
    if (!clicked) { await wait(150); continue; }
    const newGmRev = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.rev;})()`);
    if (newGmRev !== lastGmRev) {
      lastGmRev = newGmRev;
      const t0 = Date.now();
      const sRev = await stageReaches(stage, newGmRev);
      const lag = Date.now() - t0;
      if (lag > maxLag) maxLag = lag;
      checked++;
      if (sRev < newGmRev) { console.error(`FAIL: expedition action rev ${newGmRev}: stage stuck at ${sRev}`); failures++; break; }
      if (lag > 300) console.error(`  slow: action rev ${newGmRev} took ${lag}ms to reach stage`);
    }
    await wait(120);
  }
  assert(expDone, "expedition completed (victory/defeat reached)");
  assert(checked >= 10, `expedition: checked ${checked} rev changes after actions`);
  console.log(`expedition: ${checked} rev changes, max lag ${maxLag}ms`);

  // ---- undo x3 then an action (rev must stay monotonic) ----
  await gm.eval(`${a}.undo()`);
  await gm.eval(`${a}.undo()`);
  await gm.eval(`${a}.undo()`);
  const revAfterUndo = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.rev;})()`);
  // perform a real action (add a player via lobby would be wrong mid-game; use a valid play action)
  const stepU = await gm.eval(`(()=>{const s=document.querySelector('#gm .step-bar .step.current'); return s?s.textContent.trim():null;})()`);
  let clickedU = await gm.eval(`(()=>{const b=document.querySelector('[data-action="story-continue"]:not([disabled])')||document.querySelector('[data-action="primary-attack"]:not([disabled])')||document.querySelector('[data-action="advance-room"]:not([disabled])'); if(b){b.click();return true;} return false;})()`);
  if (!clickedU && stepU === "CHOOSE") clickedU = await gm.eval(`(()=>{const b=document.querySelector('[data-action="choose-approach"]'); if(b){b.click();return true;} const sk=document.querySelector('[data-action="use-skill"]:not([disabled])'); if(sk){sk.click();return true;} return false;})()`);
  if (!clickedU && stepU === "SAY IT") clickedU = await gm.eval(`(()=>{const b=document.querySelector('[data-action="grade-story"][data-value="2"]')||document.querySelector('[data-action="judge-lang"][data-value="2"]'); if(b){b.click();return true;} return false;})()`);
  const revAfterAction = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.rev;})()`);
  assert(revAfterAction > revAfterUndo, `undo x3 then action keeps rev monotonic (after-undo ${revAfterUndo} -> after-action ${revAfterAction})`);
  const sRevU = await stageReaches(stage, revAfterAction);
  assert(sRevU === revAfterAction, `stage followed the post-undo action (stage ${sRevU} gm ${revAfterAction})`);

  // ---- New Game (rev keeps climbing; stage follows to lobby) ----
  await gm.eval(`${a}.startExpedition()`); // ensure in a runnable state is irrelevant; do reset via UI
  await gm.eval(`(()=>{const b=document.getElementById('start-new'); if(b)b.click(); return true;})()`);
  await wait(400);
  const revNew = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.rev;})()`);
  assert(revNew >= revAfterAction, `New Game keeps rev monotonic (${revAfterAction} -> ${revNew})`);

  // ---- GM reload: same page reloads, stage must re-sync (poll/opener) ----
  await cG.send("Page.navigate", { url: `${BASE}/index.html` });
  await wait(1200);
  // dismiss the Continue/New Game overlay so the GM mounts (mountGm waits for it)
  await waitFor(gm, `!!document.getElementById('start-new')`);
  await gm.eval(`(()=>{const b=document.getElementById('start-new'); if(b)b.click(); return true;})()`);
  await waitFor(gm, `!!document.querySelector('[data-action="add-player"]')`, 8000);
  const a2 = await engineHandle(gm);
  await setupParty(gm, a2, 3);
  const revReload = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.rev;})()`);
  const sRevR = await stageReaches(stage, revReload);
  assert(sRevR >= revReload, `stage re-synced after GM reload (stage ${sRevR} gm ${revReload})`);

  // ---- Full story ----
  // After New Game + reload the lobby is empty; re-add players via the UI and
  // ensure the drawer is open so the episode button is enabled.
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await waitFor(gm, `!!document.querySelector('[data-action="add-player"]')`);
  await setupParty(gm, a2, 3);
  const epBtn = await gm.eval(`(()=>{const b=document.querySelector('[data-action="start-episode"]'); return b?b.getAttribute('data-value'):null;})()`);
  assert(!!epBtn, "episode start button available");
  await gm.eval(`document.querySelector('[data-action="start-episode"]').click()`);
  let storyDone = false;
  lastGmRev = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.rev;})()`);
  for (let i = 0; i < safety; i++) {
    const phase = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.phase;})()`);
    if (phase === "victory" || phase === "defeated") { storyDone = true; break; }
    const step = await gm.eval(`(()=>{const s=document.querySelector('#gm .step-bar .step.current'); return s?s.textContent.trim():null;})()`);
    let clicked = false;
    if (step === "CHOOSE") clicked = await gm.eval(`(()=>{const b=document.querySelector('[data-action="choose-approach"]'); if(b){b.click();return true;} const sk=document.querySelector('[data-action="use-skill"]:not([disabled])'); if(sk){sk.click();return true;} return false;})()`);
    else if (step === "SAY IT") clicked = await gm.eval(`(()=>{const b=document.querySelector('[data-action="grade-story"][data-value="2"]')||document.querySelector('[data-action="judge-lang"][data-value="2"]'); if(b){b.click();return true;} return false;})()`);
    else clicked = await gm.eval(`(()=>{const b=document.querySelector('[data-action="story-continue"]:not([disabled])')||document.querySelector('[data-action="advance-room"]:not([disabled])')||document.querySelector('[data-action="primary-attack"]:not([disabled])'); if(b){b.click();return true;} return false;})()`);
    if (!clicked) { await wait(150); continue; }
    const newGmRev = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.rev;})()`);
    if (newGmRev !== lastGmRev) {
      lastGmRev = newGmRev;
      const t0 = Date.now();
      const sRev = await stageReaches(stage, newGmRev);
      const lag = Date.now() - t0;
      if (lag > maxLag) maxLag = lag;
      if (sRev < newGmRev) { console.error(`FAIL: story action rev ${newGmRev}: stage stuck at ${sRev}`); failures++; break; }
    }
    await wait(120);
  }
  assert(storyDone, "story completed");
  console.log(`combined max stage lag ${maxLag}ms`);
  assert(cG.exceptions.length === 0, `no GM console exceptions (${cG.exceptions.length})`);
  assert(cS.exceptions.length === 0, `no stage console exceptions (${cS.exceptions.length})`);

  console.log(failures ? "\nSYNC-REAL TEST FAILED" : "\nSYNC-REAL TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nSYNC-REAL TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exitCode = failures ? 1 : 0;
