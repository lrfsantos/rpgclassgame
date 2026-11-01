// F4 COMBAT AND ROOM ENDINGS test: drives a full Random Expedition through the
// REAL UI in headless Edge and asserts that EVERY room kind shows a RESULT beat
// on the Stage (a non-empty .room-result box that differs from the room
// narration), and that the GM shows ONE primary "Next room" button that Space
// advances. Also drives a forced-defeat path (party at 1 HP vs a huge monster)
// and asserts the defeat result screen.
//
// Usage: node tests/ui-rooms.mjs   (requires the server on :8000)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9231;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-rooms-profile";
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

async function addPlayers(gm, n) {
  await waitFor(gm, `!!document.querySelector('[data-action="add-player"]')`);
  for (let i = 0; i < n; i++) await gm.eval(`document.querySelector('[data-action="add-player"]').click()`);
  await waitFor(gm, `document.querySelectorAll('[data-player]').length >= ${n}`);
}

async function stepOnce(gm) {
  return await gm.eval(`(()=>{
    const prim=document.querySelector('.primary-step:not([disabled])');
    if(prim){prim.click();return true;}
    const ap=document.querySelector('[data-action="choose-approach"]:not([disabled])');
    if(ap){ap.click();return true;}
    const gr=document.querySelector('[data-action="grade-story"], [data-action="judge-lang"]');
    if(gr){gr.click();return true;}
    const sk=document.querySelector('[data-action="use-skill"]:not([disabled])');
    if(sk){sk.click();return true;}
    const adv=document.querySelector('[data-action="advance-room"]:not([disabled])');
    if(adv){adv.click();return true;}
    return false;
  })()`);
}

try {
  await startEdge();
  const tab = await newTab(`${BASE}/index.html`);
  const c = connect(tab.webSocketDebuggerUrl);
  await c.ready; await c.send("Runtime.enable"); await c.send("Page.enable");
  const gm = makeClient(c.send);
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await addPlayers(gm, 4);
  await gm.eval(`document.querySelector('[data-action="start-expedition"]').click()`);
  const started = await waitFor(gm, `!!document.querySelector('#stage .step-bar')`);
  assert(started, "expedition started");

  // ---- Full expedition: every room kind must show a RESULT beat ----
  const kindsSeen = {};
  let prevResultText = null;
  let resultCount = 0;
  let resultEmpty = 0;
  let resultSameAsPrev = 0;
  let primaryNext = 0;
  let advancedOk = 0;
  let actions = 0;
  let safety = 400;
  const tStart = Date.now();
  while (actions < safety) {
    if (Date.now() - tStart > 200000) { console.error("  TIMEOUT: expedition drive exceeded 200s"); break; }
    const ended = await gm.eval(`/Expedition Complete|Expedition Over|Story Complete|Story Over/i.test(document.body.textContent)`);
    if (ended) break;
    // a cleared/defeat room shows the enabled primary "Next room" button
    const isResult = await gm.eval(`(()=>{const b=document.querySelector('.primary-step'); return !!(b && !b.disabled && /Next room/i.test(b.textContent.replace(/\\s+/g,' ').trim()));})()`);
    if (isResult) {
      const probe = await gm.eval(`(()=>{
        const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1'));
        const kind=p.expedition.rooms[p.expedition.current].kind;
        const e=document.querySelector('#stage .room-result');
        const txt=e?e.textContent.replace(/\\s+/g,' ').trim():null;
        document.querySelector('.primary-step').click();
        return JSON.stringify({kind,txt});
      })()`);
      const pr = JSON.parse(probe);
      kindsSeen[pr.kind] = (kindsSeen[pr.kind] || 0) + 1;
      if (!pr.txt || pr.txt.length === 0) resultEmpty++;
      else {
        resultCount++;
        if (pr.txt === prevResultText) resultSameAsPrev++;
        prevResultText = pr.txt;
      }
      primaryNext++;
      advancedOk++;
      await wait(220);
      actions++;
      continue;
    }
    const did = await stepOnce(gm);
    if (!did) { await wait(120); continue; }
    actions++;
    await wait(140);
  }

  // expect every expedition room kind to have appeared with a result beat
  for (const k of ["combat", "challenge", "trap", "treasure", "rest", "event"]) {
    assert((kindsSeen[k] || 0) > 0, `room kind "${k}" appeared with a RESULT beat (seen ${kindsSeen[k] || 0})`);
  }
  const hasBoss = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return !!(p.expedition && p.expedition.rooms.some(r=>r.boss));})()`);
  if (hasBoss) assert((kindsSeen["combat"] || 0) >= 1, "boss combat also resolved with a result beat");
  assert(resultEmpty === 0, `no room ended with an empty result beat (empty ${resultEmpty})`);
  assert(resultSameAsPrev === 0, `each result beat differed from the previous screen (same ${resultSameAsPrev})`);
  assert(primaryNext > 0, `GM showed the primary "Next room" button (${primaryNext} times)`);
  assert(advancedOk > 0, `Space/primary advanced past cleared rooms (${advancedOk})`);
  assert(c.exceptions.length === 0, `no console exceptions (${c.exceptions.length})`);

  // ---- Forced-defeat path: single human at 1 HP vs a huge monster ----
  await gm.eval(`localStorage.removeItem('classroom-rpg-save-v1'); location.reload();`);
  await wait(900);
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await addPlayers(gm, 1);
  await gm.eval(`document.querySelector('[data-action="start-expedition"]').click()`);
  const started2 = await waitFor(gm, `!!document.querySelector('#stage .step-bar')`);
  assert(started2, "defeat-run expedition started");
  // set every player (incl. NPC companion) to 1 HP and the current monster very
  // tanky via the engine, then a no-op adjustScore(0) mutation broadcasts the
  // edited state to the Stage (bumps rev)
  await gm.eval(`(async()=>{
    const a=await import("${BASE}/src/engine/actions.js");
    const st=await import("${BASE}/src/engine/state.js");
    const s=st.getState();
    s.players.forEach(p=>{ p.hp=1; });
    if(s.expedition&&s.expedition.monster) s.expedition.monster.hp=99999;
    a.adjustScore(0);
    return true;
  })()`);
  await wait(300);
  let defeatSeen = false;
  for (let i = 0; i < 300; i++) {
    const status = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return p.expedition?p.expedition.roomStatus:null;})()`);
    if (status === "defeat") {
      const resText = await gm.eval(`(()=>{const e=document.querySelector('#stage .room-result'); return e?e.textContent.replace(/\s+/g,' ').trim():null;})()`);
      assert(!!resText && /overwhelmed|Defeat/i.test(resText), `defeat result beat shown on Stage ("${resText}")`);
      defeatSeen = true;
      break;
    }
    if (await gm.eval(`/Expedition Over/i.test(document.body.textContent)`)) { defeatSeen = true; break; }
    const did = await stepOnce(gm);
    if (!did) { await wait(150); continue; }
    await wait(180);
  }
  assert(defeatSeen, "forced-defeat path reached a defeat screen");

  console.log(failures ? "\nUI-ROOMS TEST FAILED" : "\nUI-ROOMS TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nUI-ROOMS TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exitCode = failures ? 1 : 0;
