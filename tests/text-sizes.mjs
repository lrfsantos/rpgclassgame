// S6 STAGE TEXT SIZES test: measures the computed font sizes on the Stage at
// 1920x1080 (virtual canvas, --ss scaling) and reports them. Targets:
//   approach-card label >= 36px, dialogue 44px, names/banner >= 28px,
//   HUD >= 24px, nothing under 24px except the ?debug=1 line.
// Drives into a story scene (cards + dialogue + banner + party names) and a
// Random Expedition combat scene (battle menu, map, party/enemy names).
//
// Usage: node tests/text-sizes.mjs   (requires the server on :8000)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9239;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-textsize-profile";
const HTTP = `http://127.0.0.1:${PORT}`;
const BASE = "http://localhost:8000";

let edge = null;
let failures = 0;
const reported = {};
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

// Measure computed font-size (px) of the given selectors in the stage, divided
// by --ss so the numbers are the virtual px at 1080p.
const MEASURE = (selectors) => `(()=>{
  const ss=parseFloat(document.querySelector('.stage').style.getPropertyValue('--ss')||'1')||1;
  const out={};
  for(const sel of ${JSON.stringify(selectors)}){
    const el=document.querySelector(sel);
    if(el) out[sel]=+(parseFloat(getComputedStyle(el).fontSize)/ss).toFixed(1);
  }
  out.ss=ss;
  return JSON.stringify(out);
})()`;

try {
  await startEdge();
  const tab = await newTab(`${BASE}/index.html`);
  const c = connect(tab.webSocketDebuggerUrl);
  await c.ready; await c.send("Runtime.enable"); await c.send("Page.enable");
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const gm = makeClient(c.send);
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await addPlayers(gm, 4);

  // ---- story scene (episode): CHOOSE shows cards + dialogue + banner ----
  await gm.eval(`document.querySelector('[data-action="start-episode"]').click()`);
  await waitFor(gm, `!!document.querySelector('#stage .step-bar')`, 8000);
  // advance to CHOOSE (click the GM primary "Continue")
  await gm.eval(`(()=>{const b=document.querySelector('.primary-step:not([disabled])'); if(b)b.click(); return true;})()`);
  await waitFor(gm, `(()=>{const s=document.querySelector('#stage .step-bar .step.current'); return s && s.textContent.trim()==='CHOOSE';})()`, 8000);
  // wait for the approach cards to actually render on the Stage (it lags the GM)
  await waitFor(gm, `!!document.querySelector('#stage .approach-label')`, 6000);
  await wait(200);
  const storySizes = JSON.parse(await gm.eval(MEASURE([
    ".story .approach-label", ".story .approach-stat", ".story .approach-starter",
    ".story .approach-kind", ".story .approach-stars", ".story .approach-bonus",
    ".story .story-dialogue", ".story .story-title", ".story .story-path",
    ".story .turn-banner", ".story .story-hero .pname-tag", ".story .spark-count",
    ".story .story-items-top", ".story .story-item",
  ])));
  reported.story = storySizes;
  console.log("story sizes @1080p:", JSON.stringify(storySizes));

  // ---- combat scene (Random Expedition): battle menu, map, names ----
  await gm.eval(`localStorage.removeItem('classroom-rpg-save-v1'); location.reload();`);
  await wait(900);
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await addPlayers(gm, 4);
  await gm.eval(`document.querySelector('[data-action="start-expedition"]').click()`);
  await waitFor(gm, `!!document.querySelector('#stage .battle-menu') || !!document.querySelector('#stage .step-bar')`, 8000);
  const combatSizes = JSON.parse(await gm.eval(MEASURE([
    ".battle-menu", ".battle-menu .cmd", ".battle-menu .cmd-label",
    ".battle-menu .prompt", ".map-title", ".map-node",
    ".battle-party .party-slot .pname-tag", ".battle-enemies .enemy-slot .pname-tag",
    ".d20-face", ".roll-line", ".room-result-title", ".room-result-line", ".room-result-next",
  ])));
  reported.combat = combatSizes;
  console.log("combat sizes @1080p:", JSON.stringify(combatSizes));

  // ---- assertions ----
  // approach-card label >= 36px
  assert((storySizes[".story .approach-label"] || 0) >= 36, `approach-card label >= 36px (${storySizes[".story .approach-label"]})`);
  // dialogue == 44px (>= 40 acceptable)
  assert((storySizes[".story .story-dialogue"] || 0) >= 40, `story dialogue >= 40px (${storySizes[".story .story-dialogue"]})`);
  // names/banner >= 28px
  for (const sel of [".story .turn-banner", ".story .story-title", ".story .story-path", ".story .story-hero .pname-tag", ".battle-party .party-slot .pname-tag"]) {
    const v = storySizes[sel] ?? combatSizes[sel];
    assert((v || 0) >= 28, `${sel} >= 28px (${v})`);
  }
  // HUD (everything else) >= 24px
  const hudSels = [".story .spark-count", ".story .story-items-top", ".story .approach-stat", ".story .approach-starter",
    ".battle-menu", ".battle-menu .cmd", ".map-node", ".room-result-line", ".roll-line", ".d20-face"];
  let hudMin = 999;
  for (const sel of hudSels) {
    const v = storySizes[sel] ?? combatSizes[sel];
    if (v !== undefined) hudMin = Math.min(hudMin, v);
  }
  assert(hudMin >= 24, `all HUD text >= 24px (min ${hudMin})`);
  // nothing under 24px (excluding the debug line and the ss measurement key)
  const all = { ...storySizes, ...combatSizes };
  const under = Object.entries(all).filter(([k, v]) => k !== "ss" && typeof v === "number" && v < 24);
  assert(under.length === 0, `nothing under 24px except the debug line (${JSON.stringify(under)})`);
  assert(c.exceptions.length === 0, `no console exceptions (${c.exceptions.length})`);

  console.log(failures ? "\nTEXT-SIZES TEST FAILED" : "\nTEXT-SIZES TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nTEXT-SIZES TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exitCode = failures ? 1 : 0;
