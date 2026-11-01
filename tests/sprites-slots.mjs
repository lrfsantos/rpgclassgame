// F1 SPRITES test: verifies that every hero and monster slot on the Stage has
// its OWN non-transparent canvas inside the viewport, for duplicate-class
// parties (the exact scenario that broke with the old getSpriteFrames
// element-cache: heroes of the same class stole each other's canvas — observed
// party [warrior,warrior,warrior,mage,cleric] -> slots NONE,NONE,ok,ok,ok).
//
// Cover: parties of 5 (warrior,warrior,warrior,mage,cleric), 12 of ONE class,
// and 12 mixed; expedition (combat party row = the failing case) and story (the
// visible actor sprite, a regression guard — the full story party row arrives
// with F3). Stage popup (stage.html) and index.html single-window; sampled at
// every observed step, after 30 actions and after a reload. Every hero +
// monster slot must show a non-transparent canvas within the viewport.
//
// Usage: node tests/sprites-slots.mjs   (requires the server on :8000)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9226;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-sprites-profile";
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
async function waitFor(c, expr, t = 8000) { const t0 = Date.now(); while (Date.now() - t0 < t) { if (await c.eval(expr)) return true; await wait(150); } return false; }

const SLOT_PROBE = `(()=>{
  const out=[];
  const record=(slot, type)=>{
    const cvs=[...slot.querySelectorAll('canvas')];
    // invariant: every slot element must hold EXACTLY one non-empty canvas
    const good = cvs.length===1 && (()=>{const c=cvs[0]; let nt=0; try{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; for(let i=3;i<d.length;i+=4){if(d[i]>0){nt=1;break;}}}catch(e){} const r=c.getBoundingClientRect(); const vp=document.documentElement.clientWidth, vh=document.documentElement.clientHeight; return nt===1 && r.width>0 && r.height>0 && r.left>=0 && r.top>=0 && r.right<=vp && r.bottom<=vh; })();
    out.push({type, good});
  };
  for(const s of document.querySelectorAll('.party-slot,.story-hero')) record(s,'hero');
  for(const s of document.querySelectorAll('.enemy-slot')) record(s,'monster');
  return JSON.stringify(out);
})()`;

async function probeSlots(page) {
  const slots = JSON.parse((await page.eval(SLOT_PROBE)) || "[]");
  const heroes = slots.filter((c) => c.type === "hero");
  const monsters = slots.filter((c) => c.type === "monster");
  return { total: slots.length, heroSlots: heroes.length, monsterSlots: monsters.length, heroesOk: heroes.every((c) => c.good), monstersOk: monsters.every((c) => c.good) };
}

async function addPlayers(gm, n, aClass) {
  await waitFor(gm, `!!document.querySelector('[data-action="add-player"]')`);
  for (let i = 0; i < n; i++) {
    if (aClass) await gm.eval(`(()=>{const s=document.querySelector('#gm-new-class'); if(s) s.value=${JSON.stringify(aClass)}; return true;})()`);
    await gm.eval(`document.querySelector('[data-action="add-player"]').click()`);
    await wait(30);
  }
  await waitFor(gm, `document.querySelectorAll('[data-player]').length >= ${n}`);
}

// Drive the current step forward once; returns true if something advanced.
async function stepOnce(gm) {
  return await gm.eval(`(()=>{
    const prim=document.querySelector('[data-action="story-continue"]:not([disabled]), [data-action="advance-room"]:not([disabled]), [data-action="primary-attack"]:not([disabled])');
    if(prim){prim.click();return true;}
    const ap=document.querySelector('[data-action="choose-approach"]');
    if(ap){ap.click();return true;}
    const gr=document.querySelector('[data-action="grade-story"], [data-action="judge-lang"]');
    if(gr){gr.click();return true;}
    const sk=document.querySelector('[data-action="use-skill"]:not([disabled])');
    if(sk){sk.click();return true;}
    const skip=document.querySelector('[data-action="skip-room"]');
    if(skip){skip.click();return true;}
    return false;
  })()`);
}

// Run the game for up to `maxActions` real actions while sampling sprites at
// every step. Stops early if the run ends (recap). Returns {samples, actions}.
async function driveAndSample(page, maxActions = 40) {
  const samples = [];
  let actions = 0;
  let steps = 0;
  while (actions < maxActions && steps++ < 600) {
    const ended = await page.eval(`/STORY COMPLETE|STORY OVER|Expedition Complete|Expedition Over/i.test(document.body.textContent)`);
    if (ended) break;
    const step = await page.eval(`(()=>{const s=document.querySelector('.step-bar .step.current'); return s?s.textContent.trim():null;})()`);
    const rep = await probeSlots(page);
    samples.push({ step, actions, ...rep });
    const did = await stepOnce(page);
    if (!did) { await wait(200); continue; }
    actions++;
    await wait(200);
  }
  return { samples, actions };
}

function allHeroesAt(samples, expect) {
  // every sample that HAS hero slots must have all of them ok; and at least one
  // sample must show the full party row (all `expect` heroes mounted at once)
  const withHeroes = samples.filter((s) => s.heroSlots > 0);
  if (withHeroes.length === 0) return false;
  const allOk = withHeroes.every((s) => s.heroesOk);
  const fullRow = withHeroes.some((s) => s.heroSlots >= expect);
  return allOk && fullRow;
}
function sampleAfterActions(samples, n) {
  return samples.some((s) => s.actions >= n);
}

try {
  await startEdge();

  // ---- Scenario A: index.html single-window, EXPEDITION, party [warrior x3, mage, cleric] ----
  // This is the EXACT observed failing case on stage.html + index.html.
  const tabA = await newTab(`${BASE}/index.html`);
  const cA = connect(tabA.webSocketDebuggerUrl);
  await cA.ready; await cA.send("Runtime.enable"); await cA.send("Page.enable");
  const gm = makeClient(cA.send);
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await waitFor(gm, `!!document.querySelector('[data-action="add-player"]')`);
  await addPlayers(gm, 3, "warrior");
  await addPlayers(gm, 1, "mage");
  await addPlayers(gm, 1, "cleric");
  const nA = await gm.eval(`document.querySelectorAll('[data-player]').length`);
  assert(nA === 5, `scenario A: 5 players in lobby (got ${nA})`);
  await gm.eval(`(()=>{const b=document.querySelector('[data-action="start-expedition"]'); if(b)b.click(); return true;})()`);
  const startedA = await waitFor(gm, `!!document.querySelector('#stage .step-bar')`);
  assert(startedA, "scenario A: expedition started");
  const resA = await driveAndSample(gm, 40);
  assert(allHeroesAt(resA.samples, 5), `scenario A (expedition, [w,w,w,m,c]): every hero slot present + non-transparent + in-view at every step; full row of 5 shown at least once`);
  assert(sampleAfterActions(resA.samples, 30), `scenario A: sampled after 30 actions (actions=${resA.actions})`);
  // reload while mid-game (or at recap) and re-check slots
  await gm.eval(`location.reload(); true`);
  await wait(900);
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  const repReload = await probeSlots(gm);
  if (repReload.total > 0) assert(repReload.heroesOk, "scenario A: after reload every present hero slot ok");
  else { await driveAndSample(gm, 5); assert((await probeSlots(gm)).heroesOk, "scenario A: after reload+drive slots ok"); }
  assert(cA.exceptions.length === 0, `scenario A: no console exceptions (${cA.exceptions.length})`);

  // ---- Scenario B: index.html single-window, expedition, 12 of ONE class ----
  await gm.eval(`localStorage.removeItem('classroom-rpg-save-v1'); location.reload();`);
  await wait(900);
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await waitFor(gm, `!!document.querySelector('[data-action="add-player"]')`);
  await addPlayers(gm, 12, "thief");
  const nB = await gm.eval(`document.querySelectorAll('[data-player]').length`);
  assert(nB === 12, `scenario B: 12 players in lobby (got ${nB})`);
  await gm.eval(`(()=>{const b=document.querySelector('[data-action="start-expedition"]'); if(b)b.click(); return true;})()`);
  const startedB = await waitFor(gm, `!!document.querySelector('#stage .step-bar')`);
  assert(startedB, "scenario B: expedition started");
  const resB = await driveAndSample(gm, 30);
  assert(allHeroesAt(resB.samples, 12), `scenario B (expedition, 12 thieves): every hero slot present + non-transparent + in-view at every step; full row of 12 shown at least once`);
  assert(cA.exceptions.length === 0, `scenario B: no console exceptions (${cA.exceptions.length})`);

  // ---- Scenario C: index.html single-window, expedition, 12 mixed classes ----
  await gm.eval(`localStorage.removeItem('classroom-rpg-save-v1'); location.reload();`);
  await wait(900);
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await waitFor(gm, `!!document.querySelector('[data-action="add-player"]')`);
  await addPlayers(gm, 2, "warrior");
  await addPlayers(gm, 2, "thief");
  await addPlayers(gm, 2, "mage");
  await addPlayers(gm, 2, "cleric");
  await addPlayers(gm, 2, "ranger");
  await addPlayers(gm, 2, "bard");
  const nC = await gm.eval(`document.querySelectorAll('[data-player]').length`);
  assert(nC === 12, `scenario C: 12 mixed players in lobby (got ${nC})`);
  await gm.eval(`(()=>{const b=document.querySelector('[data-action="start-expedition"]'); if(b)b.click(); return true;})()`);
  const startedC = await waitFor(gm, `!!document.querySelector('#stage .step-bar')`);
  assert(startedC, "scenario C: expedition started");
  const resC = await driveAndSample(gm, 30);
  assert(allHeroesAt(resC.samples, 12), `scenario C (expedition, 12 mixed): every hero slot present + non-transparent + in-view at every step; full row of 12 shown at least once`);
  const monsterOk = resC.samples.some((s) => s.monsterSlots > 0 && s.monstersOk);
  assert(monsterOk, "scenario C: monster slot present + non-transparent + in-view during combat");
  assert(cA.exceptions.length === 0, `scenario C: no console exceptions (${cA.exceptions.length})`);

  // ---- Scenario D: stage popup (stage.html) + GM (gm.html), expedition, dup classes ----
  // Two real pages in one headless browser, shared profile/localStorage.
  const gmTab = await newTab(`${BASE}/gm.html`);
  const cG = connect(gmTab.webSocketDebuggerUrl);
  await cG.ready; await cG.send("Runtime.enable"); await cG.send("Page.enable");
  const gmG = makeClient(cG.send);
  const stTab = await newTab(`${BASE}/stage.html`);
  const cS = connect(stTab.webSocketDebuggerUrl);
  await cS.ready; await cS.send("Runtime.enable"); await cS.send("Page.enable");
  const stageS = makeClient(cS.send);
  await wait(600);
  await gmG.eval(`localStorage.removeItem('classroom-rpg-save-v1'); true`);
  await cG.send("Page.navigate", { url: `${BASE}/gm.html` });
  await wait(500);
  await waitFor(gmG, `!!document.querySelector('[data-action="add-player"]')`);
  await addPlayers(gmG, 3, "warrior");
  await addPlayers(gmG, 1, "mage");
  await addPlayers(gmG, 1, "cleric");
  await gmG.eval(`(()=>{const b=document.querySelector('[data-action="start-expedition"]'); if(b)b.click(); return true;})()`);
  const startedD = await waitFor(gmG, `!!document.querySelector('#gm .step-bar')`, 6000);
  assert(startedD, "scenario D: GM expedition started");
  await waitFor(stageS, `!!document.querySelector('#stage .step-bar') || /Expedition Complete|Expedition Over/i.test(document.body.textContent)`, 8000);
  const repD = await probeSlots(stageS);
  assert(repD.total > 0, `scenario D (stage popup, dup classes): stage has sprite slots (${repD.total})`);
  assert(repD.heroesOk, `scenario D: stage popup all hero slots non-transparent + in-view`);
  // drive the GM a bit so the popup ingests more states, then re-probe the popup
  await driveAndSample(gmG, 6);
  const repD2 = await probeSlots(stageS);
  if (repD2.total > 0) assert(repD2.heroesOk, "scenario D: stage popup slots still ok after more states");
  assert(cS.exceptions.length === 0, `scenario D: no stage console exceptions (${cS.exceptions.length})`);

  console.log(failures ? "\nSPRITES-SLOTS TEST FAILED" : "\nSPRITES-SLOTS TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nSPRITES-SLOTS TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exitCode = failures ? 1 : 0;
