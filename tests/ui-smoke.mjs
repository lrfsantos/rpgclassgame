// UI smoke test: drives real headless Edge via CDP (no npm; Node >= 22 has
// global WebSocket). Loads index.html, clicks the GM button and presses G,
// asserting the drawer opens/closes.
//
// Usage: node tests/ui-smoke.mjs   (requires the server on http://localhost:8000)
import { spawn } from "node:child_process";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const APP_URL = "http://localhost:8000/index.html";
const CDP_PORT = 9223;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-cdp-profile";
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;

let edge = null;
let failures = 0;

function assert(cond, msg) {
  if (cond) console.log("ok: " + msg);
  else { console.error("FAIL: " + msg); failures++; }
}

async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${CDP_HTTP}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* not up yet */ }
    await wait(250);
  }
  throw new Error("Edge CDP target never appeared");
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
      exceptions.push(msg.params.exceptionDetails.text + ": " +
        (msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : ""));
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  return { send, exceptions, ready: new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }) };
}

async function evaluate(send, expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result && r.result.value;
}

try {
  edge = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-sandbox",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE}`,
    "about:blank",
  ], { stdio: "ignore" });

  const wsUrl = await getWsUrl();
  const { send, exceptions, ready } = connect(wsUrl);
  await ready;
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: APP_URL });

  // wait for the lobby to render
  let rendered = false;
  for (let i = 0; i < 30; i++) {
    if (await evaluate(send, `!!document.querySelector('#stage .title-screen')`)) { rendered = true; break; }
    await wait(300);
  }
  assert(rendered, "stage lobby rendered");

  const drawerOpen = () => evaluate(send, `document.querySelector('#gm-drawer').classList.contains('open')`);
  const gmMounted = await evaluate(send, `!!document.querySelector('#gm-drawer .gm')`);

  assert(await drawerOpen() === false, "drawer starts closed");
  assert(gmMounted, "GM view mounted into drawer");

  // click the GM button
  const diag = await evaluate(send, `(() => {
    try {
      const b = document.getElementById('gm-drawer-open');
      const d = document.getElementById('gm-drawer');
      const out = {
        btnId: b && b.id, btnClass: b && b.className,
        drawerId: d && d.id, drawerClassBefore: d && d.className,
        drawerCount: document.querySelectorAll('#gm-drawer').length,
      };
      b.click();
      out.drawerClassAfter = d && d.className;
      return out;
    } catch (e) { return { err: String(e) }; }
  })()`);
  console.log("diag:", JSON.stringify(diag));
  await wait(400);
  assert(await drawerOpen() === true, "drawer opens after clicking GM button");
  console.log("exceptions:", JSON.stringify(exceptions));

  // press G -> should close
  await evaluate(send, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))`);
  await wait(400);
  assert(await drawerOpen() === false, "drawer closes after pressing G");

  // press G again -> should open
  await evaluate(send, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', bubbles: true }))`);
  await wait(400);
  assert(await drawerOpen() === true, "drawer opens after pressing G (uppercase)");

  // Escape closes
  await evaluate(send, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await wait(400);
  assert(await drawerOpen() === false, "drawer closes on Escape");

  // D13: G must NOT toggle the drawer while typing in an input (lobby has #gm-name)
  await evaluate(send, `document.getElementById('gm-drawer-open').click()`);
  await wait(300);
  assert(await drawerOpen() === true, "drawer reopened for input test");
  await evaluate(send, `(()=>{const i=document.getElementById('gm-name'); i.focus(); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })); return document.activeElement === i;})()`);
  await wait(300);
  assert(await drawerOpen() === true, "D13: G while typing in an input does not toggle the drawer");

  // version badge must match the engine VERSION constant
  const badge = await evaluate(send, `(()=>{const b=document.querySelector('.ver-badge'); return b?b.textContent.trim():null;})()`);
  assert(badge === "v2.2.0", `version badge matches VERSION (got "${badge}")`);

  // mute toggle in More must actually change the audio module's state
  await evaluate(send, `(()=>{const d=document.querySelector('.tools'); if(d) d.open=true; return !!d;})()`);
  const mutedBefore = await evaluate(send, `(async()=>{const a=await import("http://localhost:8000/src/engine/audio.js"); return a.isMuted();})()`);
  const muteLabel = await evaluate(send, `(()=>{const b=document.querySelector('[data-action="toggle-mute"]'); if(b){b.click();return b.textContent.trim();} return null;})()`);
  await wait(250);
  const mutedAfter = await evaluate(send, `(async()=>{const a=await import("http://localhost:8000/src/engine/audio.js"); return a.isMuted();})()`);
  assert(!!muteLabel, "mute toggle button exists in More");
  assert(mutedAfter === !mutedBefore, `mute toggle flips audio state (${mutedBefore} -> ${mutedAfter}, label "${muteLabel}")`);
  await evaluate(send, `(()=>{const b=document.querySelector('[data-action="toggle-mute"]'); if(b)b.click(); return true;})()`);
  // close the drawer again for a clean exit state
  await evaluate(send, `document.getElementById('gm-drawer-close').click()`);
  await wait(300);

  // A separate Stage window must NOT own a music loop: instrument AudioContext
  // before the page loads, then send a gesture and count constructions.
  const stageTarget = await (await fetch(`${CDP_HTTP}/json/new?${encodeURIComponent("http://localhost:8000/stage.html")}`, { method: "PUT" })).json();
  const sc = connect(stageTarget.webSocketDebuggerUrl);
  await sc.ready;
  await sc.send("Runtime.enable");
  await sc.send("Page.enable");
  await sc.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__ctxCount=0;var AC=window.AudioContext;if(AC){window.AudioContext=class extends AC{constructor(){super();window.__ctxCount++;}};}" });
  await sc.send("Page.navigate", { url: "http://localhost:8000/stage.html" });
  await wait(1000);
  await evaluate(sc.send, `document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'g',bubbles:true})); true`);
  await wait(300);
  const stageCtxCount = await evaluate(sc.send, `window.__ctxCount`);
  assert(stageCtxCount === 0, `Stage window creates no AudioContext on gesture (got ${stageCtxCount})`);

  // Delete save must remove the key for good, not write a fresh lobby save.
  await evaluate(send, `(()=>{const b=document.querySelector('[data-action="delete-save"]'); if(b)b.click(); return true;})()`);
  await wait(200);
  const saveAfterDelete = await evaluate(send, `localStorage.getItem('classroom-rpg-save-v1')`);
  assert(saveAfterDelete === null, `Delete save removes the save key (got "${String(saveAfterDelete).slice(0, 40)}")`);
  await evaluate(send, `location.reload(); true`);
  await wait(1000);
  const noContinue = await evaluate(send, `!document.querySelector('#start-overlay.show') && !!document.querySelector('#stage .title-screen')`);
  assert(noContinue, "no Continue overlay after Delete save + reload");

  // Structurally invalid schema-2 saves must be ignored, not crash the page.
  const badSaves = [
    { schema:2, rev:9, phase:'expedition', expedition:null, players:[], party:{score:0,gold:0}, settings:{} },
    { schema:2, rev:9, phase:'expedition', expedition:{rooms:[],current:0,log:[]}, players:[null], party:{score:0,gold:0}, settings:{} },
    { schema:2, rev:9, phase:'expedition', expedition:{rooms:[],current:0,log:{}}, players:[], party:{score:0,gold:0}, settings:{} },
    { schema:2, rev:9, phase:'bogus', players:[], party:{score:0,gold:0}, settings:{} },
    { schema:2, rev:9, phase:'expedition', expedition:{rooms:[],current:0,log:[]}, players:[], party:5, settings:{} },
    { schema:2, rev:9, phase:'expedition', expedition:{rooms:{},current:0,log:[]}, players:[], party:{}, settings:{} },
  ];
  for (let i = 0; i < badSaves.length; i++) {
    await evaluate(send, `localStorage.setItem('classroom-rpg-save-v1', ${JSON.stringify(JSON.stringify(badSaves[i]))}); true`);
    await evaluate(send, `location.reload(); true`);
    await wait(1000);
    const recover = await evaluate(send, `({title:!!document.querySelector('#stage .title-screen'), banner:!!document.getElementById('err-banner')})`);
    assert(recover.title && !recover.banner, `malformed save #${i} ignored, lobby renders without banner (got ${JSON.stringify(recover)})`);
  }

  console.log(failures ? "\nSMOKE TEST FAILED" : "\nSMOKE TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nSMOKE TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exitCode = failures ? 1 : 0;
