// Episode test (Step C strengthened): drives the story episode through the REAL
// UI in headless Edge. Runs it TWICE — once grading every Language Check "Great"
// and once "Weak" — and asserts:
//   - all 6 scene prompts appear on the Stage DOM
//   - narration differs per scene (onGood in the Great run, onBad in the Weak run)
//   - expedition.flags is non-empty at recap (Great run), empty/absent (Weak run)
//   - the conditional scene (the-clapper) resolves from the crossedBridge flag
//   - the Stage DOM never leaks any target/example hint text (spoiler test)
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9241;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-episode-profile";
const HTTP = `http://127.0.0.1:${PORT}`;
const BASE = "http://localhost:8000";
const ROOT = "C:/Users/luiza/Documents/protogame";

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
async function evalJs(send, expression) { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; }

const EPISODE = "the-bell-of-bellingham";
// all hint strings that must NEVER appear on the Stage
const episode = JSON.parse(readFileSync(`${ROOT}/content/episodes.json`, "utf8"));
const prompts = JSON.parse(readFileSync(`${ROOT}/content/prompts.json`, "utf8"));
const hints = [];
for (const ep of episode.episodes) for (const sc of ep.scenes) if (sc.prompt) { hints.push(sc.prompt.target, sc.prompt.example); }
for (const p of prompts.vocabPrompts || []) { hints.push(p.target, p.example); }
const sceneText = episode.episodes[0].scenes.map((sc) => sc.prompt.text.toLowerCase());
// narration strings keyed by scene
const narration = episode.episodes[0].scenes.map((sc) => ({ good: sc.onGood || "", bad: sc.onBad || "" }));

async function resetGame(c) {
  await c.send("Runtime.evaluate", { expression: `localStorage.removeItem('classroom-rpg-save-v1'); location.reload();` });
  await wait(900);
  await evalJs(c.send, `document.getElementById('gm-drawer-open').click()`);
  await wait(300);
  await evalJs(c.send, `document.querySelector('[data-action="quick-add-4"]').click()`);
  await wait(400);
  await evalJs(c.send, `document.querySelector('[data-action="start-episode"][data-value="${EPISODE}"]').click()`);
  await wait(600);
}

async function playOnce(c, grade) {
  // returns { seen:Set, stageHints:[], stageText:Set, recapReached:bool }
  const seen = new Set();
  const stageHints = [];
  const stageText = new Set();
  let recapReached = false;
  let steps = 0;
  const safety = 500;
  const gradeBtn = grade === "weak" ? "0" : "4";
  while (steps++ < safety) {
    if (await evalJs(c.send, `!!/Expedition Complete!|Expedition Over/.test(document.body.textContent)`)) { recapReached = true; break; }

    // spoiler scan: stage DOM must not contain any target/example hint
    const stageTextNow = await evalJs(c.send, `document.querySelector('#stage') ? document.querySelector('#stage').textContent : ''`);
    for (const h of hints) {
      if (h && stageTextNow.includes(h)) { stageHints.push(h); }
    }
    // accumulate narration (immune to the 60-entry log cap)
    for (const frag of [stageTextNow, await evalJs(c.send, `(()=>{const e=document.querySelector('#stage .typewriter-wrap'); return e ? e.textContent : '';})()`)]) {
      if (frag) stageText.add(frag);
    }

    // if a say-it prompt is on stage, record it, then grade it
    const prompt = await evalJs(c.send, `(()=>{const e=document.querySelector('.stage .battle-menu .prompt'); return e ? e.textContent : null;})()`);
    if (prompt) {
      const low = prompt.toLowerCase();
      for (const sc of sceneText) { if (low.includes(sc)) seen.add(sc); }
      await evalJs(c.send, `document.querySelector('[data-action="judge-lang"][data-value="${gradeBtn}"]').click()`);
      await wait(150);
      continue;
    }

    const sk = await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="use-skill"]'); if(b){b.click(); return true;} return false;})()`);
    if (sk) { await wait(150); continue; }
    const assist = await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="grant-assist"]:not([disabled])'); if(b){b.click(); return true;} return false;})()`);
    if (assist) { await wait(80); continue; }
    const adv = await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="advance-room"]:not([disabled])'); if(b){b.click(); return true;} return false;})()`);
    if (adv) { await wait(150); continue; }
    const rr = await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="reroll"]'); if(b){b.click(); return true;} return false;})()`);
    if (rr) { await wait(100); continue; }
    const skip = await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="skip-room"]'); if(b){b.click(); return true;} return false;})()`);
    if (skip) { await wait(100); continue; }
    await wait(200);
  }
  return { seen, stageHints, stageText, recapReached };
}

// read the authoritative save (log, flags, rooms) at recap
async function readSave(c) {
  const raw = await evalJs(c.send, `localStorage.getItem('classroom-rpg-save-v1')`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

try {
  await startEdge();
  const tab = await newTab(`${BASE}/index.html`);
  const c = connect(tab.webSocketDebuggerUrl);
  await c.ready;
  await c.send("Runtime.enable");
  await c.send("Page.enable");

  // ---- run 1: grade everything Great ----
  await resetGame(c);
  const great = await playOnce(c, "great");
  assert(great.recapReached, "great run reached recap");
  assert(great.stageHints.length === 0, `great run: no target/example hint leaked on Stage (${JSON.stringify(great.stageHints.slice(0,3))})`);
  assert(great.seen.size === 6, `great run: all 6 scene prompts appeared on Stage (got ${great.seen.size})`);
  const saveG = await readSave(c);
  assert(!!saveG && saveG.expedition && saveG.expedition.flags && Object.keys(saveG.expedition.flags).length > 0, "great run: expedition.flags is non-empty at recap");
  {
    const logText = saveG && saveG.expedition ? saveG.expedition.log.map((l) => l.text).join("\n") : "";
    const allGood = narration.every((n) => !n.good || logText.includes(n.good));
    assert(allGood, "great run: every scene's onGood narration appears in the log");
    const crossedFlag = saveG && saveG.expedition && saveG.expedition.flags && saveG.expedition.flags.crossedBridge === true;
    assert(crossedFlag, "great run: crossedBridge flag set");
  }
  // conditional: the-clapper (index 4) should use whenSet (crossedBridge set)
  if (saveG && saveG.expedition && saveG.expedition.rooms && saveG.expedition.rooms[4]) {
    const clapper = saveG.expedition.rooms[4];
    const whenSetFlavour = episode.episodes[0].scenes[4].conditional.whenSet.flavour;
    assert(clapper.flavour === whenSetFlavour, "great run: clapper scene used whenSet branch (flavour)");
    assert(clapper.event.difficulty === 11, "great run: clapper scene difficulty resolved to 11 (whenSet)");
  }

  // ---- run 2: grade everything Weak ----
  await resetGame(c);
  const weak = await playOnce(c, "weak");
  assert(weak.recapReached, "weak run reached recap");
  assert(weak.stageHints.length === 0, `weak run: no target/example hint leaked on Stage (${JSON.stringify(weak.stageHints.slice(0,3))})`);
  assert(weak.seen.size === 6, `weak run: all 6 scene prompts appeared on Stage (got ${weak.seen.size})`);
  const saveW = await readSave(c);
  {
    const logText = saveW && saveW.expedition ? saveW.expedition.log.map((l) => l.text).join("\n") : "";
    const allBad = narration.every((n) => !n.bad || logText.includes(n.bad));
    assert(allBad, "weak run: every scene's onBad narration appears in the log");
    const flagsW = saveW && saveW.expedition ? (saveW.expedition.flags || {}) : {};
    assert(!flagsW.crossedBridge, "weak run: crossedBridge flag NOT set");
  }
  // conditional: clapper (index 4) should use whenUnset (crossedBridge unset)
  if (saveW && saveW.expedition && saveW.expedition.rooms && saveW.expedition.rooms[4]) {
    const clapper = saveW.expedition.rooms[4];
    const whenUnsetFlavour = episode.episodes[0].scenes[4].conditional.whenUnset.flavour;
    assert(clapper.flavour === whenUnsetFlavour, "weak run: clapper scene used whenUnset branch (flavour)");
    assert(clapper.event.difficulty === 13, "weak run: clapper scene difficulty resolved to 13 (whenUnset)");
  }

  assert(c.exceptions.length === 0, `no console exceptions (got ${c.exceptions.length})`);
  console.log(failures ? "\nEPISODE TEST FAILED" : "\nEPISODE TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nEPISODE TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exitCode = failures ? 1 : 0;
