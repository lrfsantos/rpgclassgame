// S3 RESULT TEXT test: drives a Random Expedition in headless Edge and, at every
// challenge/trap ROLL, forces the d20 via the engine handle (rollStory(1) fail /
// rollStory(20) success). Asserts the Stage .room-result shows the correct branch
// text ("The challenge slips away." / "The trap springs! <Name> takes N
// damage." on failure; the conquered/disarmed text on success) and that the
// headline sentence is NEVER printed twice (title == a body line is a duplicate).
//
// Usage: node tests/result-text.mjs   (requires the server on :8000)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9238;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-resulttext-profile";
const HTTP = `http://127.0.0.1:${PORT}`;
const BASE = "http://localhost:8000";
const SAVE_KEY = "classroom-rpg-save-v1";

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

// sample the stage .room-result box: {title, body, full}
async function roomResult(gm) {
  const raw = await gm.eval(`(()=>{const e=document.querySelector('#stage .room-result'); if(!e)return null; const t=document.querySelector('#stage .room-result-title'); const lines=[...document.querySelectorAll('#stage .room-result-line,#stage .room-result-bridge')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()); return JSON.stringify({title:t?t.textContent.replace(/\\s+/g,' ').trim():'', lines, full:e.textContent.replace(/\\s+/g,' ').trim()});})()`);
  return raw ? JSON.parse(raw) : null;
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

  let forced = 0;
  let checked = 0;
  let failTexts = [];
  let succTexts = [];
  let dupTitle = 0;
  const actions = [];
  let safety = 800;
  while (actions.length < safety) {
    const ended = await gm.eval(`/Expedition Complete|Expedition Over|Story Complete|Story Over/i.test(document.body.textContent)`);
    if (ended) break;
    // what room kind + step are we at?
    const state = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})); const e=p.expedition; const room=e.rooms[e.current]; const s=document.querySelector('#gm .step-bar .step.current'); return JSON.stringify({kind:room.kind, step:s?s.textContent.trim():null, roomStatus:e.roomStatus});})()`);
    const st = JSON.parse(state);
    // at ROLL of a challenge/trap room: force the die via the engine handle
    if (st.roomStatus === "story" && st.step === "ROLL" && (st.kind === "challenge" || st.kind === "trap")) {
      const die = forced % 2 === 0 ? 1 : 20;
      await gm.eval(`(async()=>{const a=await import("${BASE}/src/engine/actions.js"); a.rollStory(${die}); return true;})()`);
      forced++;
      actions.push("force" + die);
      await wait(400);
      const rr = await roomResult(gm);
      if (rr) {
        checked++;
        if (st.kind === "challenge") {
          if (die === 1) failTexts.push(rr.title);
          else succTexts.push(rr.title);
          const expect = die === 1 ? "The challenge slips away." : "The challenge is conquered. The path opens.";
          if (rr.title !== expect) { console.error("  S3:", st.kind, "die", die, "expected", JSON.stringify(expect), "got", JSON.stringify(rr.title)); failures++; }
        } else {
          if (die === 1) failTexts.push(rr.title);
          else succTexts.push(rr.title);
          if (die === 1) {
            if (!/The trap springs! .* takes \d+ damage\./.test(rr.title)) { console.error("  S3 trap fail title:", JSON.stringify(rr.title)); failures++; }
          } else if (rr.title !== "The trap is disarmed. The party slips past.") {
            console.error("  S3 trap succ title:", JSON.stringify(rr.title)); failures++;
          }
        }
        if (rr.lines.includes(rr.title)) { console.error("  S3 duplicate: title printed as a line too:", JSON.stringify(rr.title)); dupTitle++; }
      }
      continue;
    }
    // otherwise advance via the UI primary
    const did = await gm.eval(`(()=>{
      const prim=document.querySelector('.primary-step:not([disabled])'); if(prim){prim.click();return true;}
      const ap=document.querySelector('[data-action="choose-approach"]:not([disabled])'); if(ap){ap.click();return true;}
      const gr=document.querySelector('[data-action="grade-story"], [data-action="judge-lang"]'); if(gr){gr.click();return true;}
      const sk=document.querySelector('[data-action="use-skill"]:not([disabled])'); if(sk){sk.click();return true;}
      return false;
    })()`);
    if (!did) { await wait(150); continue; }
    actions.push("adv");
    await wait(180);
  }

  assert(forced >= 1, `forced at least one challenge/trap die (${forced})`);
  assert(checked >= 1, `sampled at least one challenge/trap room-result (${checked})`);
  assert(failTexts.length >= 1, `observed at least one failure branch (${JSON.stringify(failTexts)})`);
  assert(succTexts.length >= 1, `observed at least one success branch (${JSON.stringify(succTexts)})`);
  assert(dupTitle === 0, `headline sentence never duplicated as a body line (${dupTitle} duplicates)`);
  assert(c.exceptions.length === 0, `no console exceptions (${c.exceptions.length})`);

  console.log(failures ? "\nRESULT-TEXT TEST FAILED" : "\nRESULT-TEXT TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nRESULT-TEXT TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exit(failures ? 1 : 0);
