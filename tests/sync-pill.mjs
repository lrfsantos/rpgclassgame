// S1 SYNC PILL test: drives the GM page (index.html single-window) and asserts
// the header sync pill shows the right state. On 4f40938 the pill compared
// ack.session with getState().session, which is null on a fresh game (only
// publishable() adds a session), so it showed "Stage: not detected" while in
// sync. Also the ack wrote the INCOMING rev, not the applied rev, so "behind"
// was wrong. This test writes the ack key directly and asserts the three states:
// fresh game in sync -> "Stage: in sync (rev N)"; stage acking a different rev
// (forced ahead) -> "Stage: behind (k)"; no ack for 3s -> "Stage: not detected".
//
// Usage: node tests/sync-pill.mjs   (requires the server on :8000)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9236;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-pill-profile";
const HTTP = `http://127.0.0.1:${PORT}`;
const BASE = "http://localhost:8000";
const SAVE_KEY = "classroom-rpg-save-v1";
const ACK_KEY = "classroom-rpg-stage-ack";

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

async function getPill(c) {
  return await c.eval(`(()=>{const p=document.querySelector('#gm-sync-pill'); return p?p.textContent.trim():null;})()`);
}
async function setAck(c, session, rev) {
  await c.eval(`(()=>{ try{ localStorage.setItem(${JSON.stringify(ACK_KEY)}, JSON.stringify({session:${JSON.stringify(session)}, rev:${rev}, t:Date.now()})); }catch(e){} return true; })()`);
}
async function clearAck(c) {
  await c.eval(`(()=>{ try{ localStorage.removeItem(${JSON.stringify(ACK_KEY)}); }catch(e){} return true; })()`);
}

try {
  await startEdge();
  const tab = await newTab(`${BASE}/index.html`);
  const c = connect(tab.webSocketDebuggerUrl);
  await c.ready; await c.send("Runtime.enable"); await c.send("Page.enable");
  const gm = makeClient(c.send);
  await waitFor(gm, `!!document.querySelector('#gm-sync-pill')`);
  // fresh game: add players + start an expedition so we have a real session/rev
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await waitFor(gm, `!!document.querySelector('[data-action="add-player"]')`);
  for (let i = 0; i < 4; i++) await gm.eval(`document.querySelector('[data-action="add-player"]').click()`);
  await wait(300);
  await gm.eval(`document.querySelector('[data-action="start-expedition"]').click()`);
  await wait(500);
  const session = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})); return p?p.session:null;})()`);
  const rev = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})); return p?p.rev:0;})()`);
  assert(!!session, `save carries a session (got ${session})`);

  // ---- state 1: in sync ----
  await setAck(gm, session, rev);
  await wait(1500);
  let pill = await getPill(gm);
  assert(!!pill && /Stage: in sync \(rev \d+\)/.test(pill), `fresh game + matching ack -> "Stage: in sync (rev N)" (got "${pill}")`);

  // ---- AUDIT11 P2: reload ONLY the GM; the persisted session must be restored
  // so the Stage's still-valid ack is recognized. ----
  await c.send("Page.reload", { ignoreCache: true });
  await waitFor(gm, `document.querySelector('#start-overlay') && document.querySelector('#start-overlay').classList.contains('show')`, 12000);
  await gm.eval(`(()=>{const b=document.getElementById('start-continue'); if(b)b.click(); return true;})()`);
  await waitFor(gm, `!!document.querySelector('#gm-sync-pill')`);
  await wait(1500);
  const pillReload = await getPill(gm);
  assert(!!pillReload && /Stage: in sync \(rev \d+\)/.test(pillReload), `GM reload keeps a valid Stage ack recognized (got "${pillReload}")`);
  await gm.eval(`(()=>{const b=document.getElementById('gm-drawer-open'); if(b)b.click(); return true;})()`);
  await waitFor(gm, `!!document.querySelector('.gm [data-action="add-player"], .gm .primary-step')`);

  // ---- state 2: stage forced ahead (acks a HIGHER rev) -> behind ----
  await setAck(gm, session, rev + 5);
  await wait(1500);
  pill = await getPill(gm);
  assert(!!pill && /Stage: behind \(\d+\)/.test(pill), `stage acking a different rev -> "Stage: behind (k)" (got "${pill}")`);

  // ---- state 3: no ack for 3s -> not detected ----
  await clearAck(gm);
  await wait(3500);
  pill = await getPill(gm);
  assert(!!pill && /Stage: not detected/.test(pill), `no ack for 3s -> "Stage: not detected" (got "${pill}")`);
  assert(c.exceptions.length === 0, `no console exceptions (${c.exceptions.length})`);

  // ---- S2 phase: two pages; force the Stage rev +500 (same session), then act
  // on the GM. The Stage's poll must self-heal (force ingest after 3 stale
  // polls) and match the GM within 3s. On the old code applyIfNewer rejects the
  // lower-rev save forever, so the Stage stays frozen at the forced rev. ----
  const stTab = await newTab(`${BASE}/stage.html`);
  const cS = connect(stTab.webSocketDebuggerUrl);
  await cS.ready; await cS.send("Runtime.enable"); await cS.send("Page.enable");
  const stage = makeClient(cS.send);
  await wait(800);
  // let the stage ingest the current GM state first (shared localStorage)
  await waitFor(stage, `(async()=>{const st=await import("${BASE}/src/engine/state.js"); return (st.getState().rev||0) > 0;})()`, 6000);
  // force the stage's in-memory rev way ahead of the GM (same session)
  await stage.eval(`(async()=>{const st=await import("${BASE}/src/engine/state.js"); st.getState().rev = st.getState().rev + 500; return true;})()`);
  const stageForcedRev = await stage.eval(`(async()=>{const st=await import("${BASE}/src/engine/state.js"); return st.getState().rev;})()`);
  // act on the GM (one real action bumps its rev)
  const before = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})); return p.rev;})()`);
  await gm.eval(`(()=>{const b=document.querySelector('.primary-step:not([disabled])')||document.querySelector('[data-action="score-plus"]')||document.querySelector('[data-action="choose-approach"]'); if(b){b.click();return true;} return false;})()`);
  await wait(400);
  const gmRev = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})); return p.rev;})()`);
  assert(gmRev > before, `GM advanced after the action (${before} -> ${gmRev})`);
  // the stage must self-heal back to the GM's rev within 3s
  let matched = false;
  for (let i = 0; i < 30; i++) {
    const sr = await stage.eval(`(async()=>{const st=await import("${BASE}/src/engine/state.js"); return st.getState().rev;})()`);
    if (sr === gmRev) { matched = true; break; }
    await wait(120);
  }
  assert(matched, `S2: Stage self-healed from forced rev ${stageForcedRev} back to GM rev ${gmRev} within 3s`);
  assert(cS.exceptions.length === 0, `S2: no stage console exceptions (${cS.exceptions.length})`);

  // ---- AUDIT11 P2: GM localStorage writes fail -> save key stays stale, but a
  // valid BroadcastChannel update must NOT be undone by Stage self-healing. ----
  const gmRevBefore = await gm.eval(`(async()=>{const st=await import("${BASE}/src/engine/state.js"); return st.getState().rev;})()`);
  const saveRevBefore = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})); return p?p.rev:0;})()`);
  await gm.eval(`(()=>{const key=${JSON.stringify(SAVE_KEY)}; const orig=localStorage.setItem.bind(localStorage); localStorage.setItem=(k,v)=>{if(k===key) throw new Error('audit11 save failure'); return orig(k,v);}; return true;})()`);
  await gm.eval(`(()=>{const b=document.querySelector('.primary-step:not([disabled])')||document.querySelector('[data-action="score-plus"]'); if(b){b.click();return true;} return false;})()`);
  await wait(500);
  const gmRevNew = await gm.eval(`(async()=>{const st=await import("${BASE}/src/engine/state.js"); return st.getState().rev;})()`);
  const saveRevNew = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})); return p?p.rev:0;})()`);
  assert(gmRevNew > gmRevBefore, `GM advanced with save writes failing (${gmRevBefore} -> ${gmRevNew})`);
  assert(saveRevNew < gmRevNew, `stored rev stays stale (${saveRevNew} < ${gmRevNew})`);
  // Deliver the update through the real GM->Stage postMessage handler (BC is not
  // reliable between independent CDP-created tabs in headless Edge).
  await stage.eval(`(async()=>{const st=await import("${BASE}/src/engine/state.js"); const s=st.publishable(); s.rev=${gmRevNew}; window.dispatchEvent(new MessageEvent('message',{origin:location.origin,data:{type:'state',state:s}})); return true;})()`);
  await wait(200);
  const stageRevFast = await stage.eval(`(async()=>{const st=await import("${BASE}/src/engine/state.js"); return st.getState().rev;})()`);
  assert(stageRevFast === gmRevNew, `Stage applied the direct update (${stageRevFast})`);
  await wait(2200);
  const stageRevKept = await stage.eval(`(async()=>{const st=await import("${BASE}/src/engine/state.js"); return st.getState().rev;})()`);
  assert(stageRevKept === gmRevNew, `Stage keeps the broadcast rev after failed save (stage ${stageRevKept}, gm ${gmRevNew}, stored ${saveRevNew})`);
  assert(cS.exceptions.length === 0, `AUDIT11: no stage console exceptions (${cS.exceptions.length})`);

  // ---- New Game after a GM reload must keep rev monotonic (monotonicRev is
  // seeded from the save by chooseStart before reset). ----
  const revBeforeNew = await gm.eval(`(()=>{const p=JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})); return p?p.rev:0;})()`);
  await c.send("Page.reload", { ignoreCache: true });
  await waitFor(gm, `document.querySelector('#start-overlay') && document.querySelector('#start-overlay').classList.contains('show')`, 12000);
  await gm.eval(`document.getElementById('start-new').click()`);
  await wait(300);
  const revAfterNew = await gm.eval(`(async()=>{const st=await import("${BASE}/src/engine/state.js"); return st.getState().rev;})()`);
  assert(revAfterNew >= revBeforeNew, `New Game after GM reload keeps rev monotonic (${revBeforeNew} -> ${revAfterNew})`);

  // ---- popup Stage must not re-render on every 500ms poll of the same save:
  // the typewriter node must stay mounted while the GM is idle. ----
  await waitFor(gm, `!!document.querySelector('[data-action="quick-add-4"]')`, 6000);
  await waitFor(stage, `!!document.querySelector('#stage .title-screen')`, 6000);
  await gm.eval(`document.querySelector('[data-action="quick-add-4"]').click(); true`);
  await wait(300);
  await gm.eval(`(()=>{const b=document.querySelector('[data-action="start-episode"][data-value="the-bell-of-bellingham"]'); if(b)b.click(); return true;})()`);
  await waitFor(stage, `!!document.querySelector('#stage .typewriter')`, 8000);
  await wait(400);
  await stage.eval(`(()=>{const n=document.querySelector('#stage .typewriter'); if(n)n.__mark=true; return true;})()`);
  await wait(2500);
  const tw = await stage.eval(`(()=>{const n=document.querySelector('#stage .typewriter'); return {same:!!(n&&n.__mark), text:(n?n.textContent:'').slice(0,40)};})()`);
  assert(tw.same, `Stage typewriter stays mounted while GM is idle (same=${tw.same}, text="${tw.text}")`);

  console.log(failures ? "\nSYNC-PILL TEST FAILED" : "\nSYNC-PILL TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nSYNC-PILL TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exit(failures ? 1 : 0);
