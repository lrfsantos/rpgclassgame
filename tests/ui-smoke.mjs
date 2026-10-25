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
    if (await evaluate(send, `!!document.querySelector('#stage .big-title')`)) { rendered = true; break; }
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

  console.log(failures ? "\nSMOKE TEST FAILED" : "\nSMOKE TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nSMOKE TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exitCode = failures ? 1 : 0;
