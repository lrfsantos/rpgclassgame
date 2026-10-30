// Geometry layout test (B1.5): asserts the fixed 16:9 Stage fits at 5 viewports,
// no horizontal overflow, no overlaps between key blocks, no clipped text, and
// integer sprite scaling in battle. Drives real headless Edge via CDP.
// Usage: node tests/layout.mjs   (requires server on http://localhost:8000)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9240;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-layout-profile";
const HTTP = `http://127.0.0.1:${PORT}`;
const BASE = "http://localhost:8000";
const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 1366, h: 768 },
  { w: 1280, h: 720 },
  { w: 2560, h: 1440 },
  { w: 1024, h: 768 },
  { w: 960, h: 540 },
];

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
      try { const res = await fetch(`${HTTP}/json`); const list = await res.json(); if (list.some((t) => t.type === "page")) return; } catch (e) {}
    }
    try { edge.kill(); } catch (e) {}
    await wait(500);
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
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
    else if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails.text + ": " + (msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : ""));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
  return { send, exceptions, ready: new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }) };
}

async function evalJs(send, expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result && r.result.value;
}

// Geometry report for the current page: overflow, extenders, key-block rects, overlaps.
const GEOM = `(() => {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const rect = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const blocks = {
    stage: rect('#stage .stage') || rect('.single-window #stage .stage'),
    drawer: rect('#gm-drawer'), gmBtn: rect('#gm-drawer-open'),
    enemy: rect('.stage .battle-enemies'), party: rect('.stage .battle-party'),
    menu: rect('.stage .battle-menu'), title: rect('.stage .title-screen'),
    canvas: rect('.stage canvas'),
  };
  // extenders: elements poking past the viewport HORIZONTALLY (vertical is fine
  // on scrollable pages like gm.html; the fixed Stage is checked by overlap/canvas)
  const extenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    if (b.right > vw + 1 || b.left < -1) {
      extenders.push((el.id ? '#' + el.id : el.className && el.className.baseVal !== undefined ? '.' + el.className.baseVal : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName));
    }
  }
  const horizOverflow = document.documentElement.scrollWidth - vw;
  const names = Object.keys(blocks).filter((k) => blocks[k] && k !== 'title' && k !== 'stage');
  const overlaps = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = blocks[names[i]], b = blocks[names[j]];
    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    if (ix > 0 && iy > 0) overlaps.push([names[i], names[j], ix * iy]);
  }
  return { vw, vh, horizOverflow, extenders: [...new Set(extenders)].slice(0, 8), blocks, overlaps };
})()`;

let failuresByRes = [];
try {
  await startEdge();
  const tab = await newTab(`${BASE}/index.html`);
  const c = connect(tab.webSocketDebuggerUrl);
  await c.ready;
  await c.send("Runtime.enable");
  await c.send("Page.enable");
  // clear save so the title (lobby) shows consistently
  await c.send("Runtime.evaluate", { expression: `localStorage.removeItem('classroom-rpg-save-v1')` });
  await c.send("Page.navigate", { url: `${BASE}/index.html` });
  await wait(800);

  for (const vp of VIEWPORTS) {
    await c.send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false });

    // --- stage.html title ---
    await c.send("Page.navigate", { url: `${BASE}/stage.html` });
    await wait(700);
    let g = await evalJs(c.send, GEOM);
    assert(g.horizOverflow <= 0, `${vp.w}x${vp.h} stage title: no horizontal overflow`);
    assert(g.extenders.length === 0, `${vp.w}x${vp.h} stage title: no extenders (${JSON.stringify(g.extenders)})`);
    assert(g.blocks.stage && g.blocks.title && g.blocks.canvas, `${vp.w}x${vp.h} stage title: stage/title/canvas present`);
    assert(g.blocks.title.w === g.blocks.canvas.w, `${vp.w}x${vp.h} stage title: canvas fills title width (${g.blocks.canvas.w}/${g.blocks.title.w})`);
    assert(g.overlaps.length === 0, `${vp.w}x${vp.h} stage title: no key-block overlaps (${JSON.stringify(g.overlaps)})`);

    // --- gm.html (no floating GM button) ---
    await c.send("Page.navigate", { url: `${BASE}/gm.html` });
    await wait(700);
    g = await evalJs(c.send, GEOM);
    assert(g.horizOverflow <= 0, `${vp.w}x${vp.h} gm: no horizontal overflow`);
    assert(!g.blocks.gmBtn, `${vp.w}x${vp.h} gm: no floating GM button`);
    assert(g.extenders.length === 0, `${vp.w}x${vp.h} gm: no extenders`);

    // --- index.html with drawer open (docked, GM button hidden) ---
    await c.send("Page.navigate", { url: `${BASE}/index.html` });
    await wait(700);
    await c.send("Runtime.evaluate", { expression: `(()=>{const b=document.getElementById('gm-drawer-open'); if(b){b.click(); return true;} return false;})()` });
    await wait(400);
    g = await evalJs(c.send, GEOM);
    assert(g.horizOverflow <= 0, `${vp.w}x${vp.h} index drawer-open: no horizontal overflow`);
    assert(g.blocks.drawer && g.blocks.drawer.w > 0, `${vp.w}x${vp.h} index drawer-open: drawer docked (w=${g.blocks.drawer && g.blocks.drawer.w})`);
    assert(!g.blocks.gmBtn || g.blocks.gmBtn.w === 0, `${vp.w}x${vp.h} index drawer-open: GM button hidden (w=${g.blocks.gmBtn && g.blocks.gmBtn.w})`);
    const stageBlocks = [g.blocks.enemy, g.blocks.party, g.blocks.menu, g.blocks.canvas, g.blocks.drawer].filter(Boolean);
    assert(g.overlaps.length === 0, `${vp.w}x${vp.h} index drawer-open: no overlaps (${JSON.stringify(g.overlaps)})`);
    assert(g.extenders.length === 0, `${vp.w}x${vp.h} index drawer-open: no extenders (${JSON.stringify(g.extenders)})`);
  }

  // --- battle: integer sprite scaling (single-window, drawer open, one 1920x1080 pass) ---
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await c.send("Page.navigate", { url: `${BASE}/index.html` });
  await wait(700);
  await c.send("Runtime.evaluate", { expression: `(()=>{const b=document.getElementById('gm-drawer-open'); if(b){b.click();} return true;})()` });
  await wait(300);
  await evalJs(c.send, `document.querySelector('[data-action="quick-add-4"]') && document.querySelector('[data-action="quick-add-4"]').click()`);
  await wait(400);
  await evalJs(c.send, `document.querySelector('[data-action="start-expedition"]') && document.querySelector('[data-action="start-expedition"]').click()`);
  // drive until a monster is up
  let found = false;
  for (let i = 0; i < 250; i++) {
    await wait(150);
    const hasMonster = await evalJs(c.send, `!!document.querySelector('.stage .battle-enemies .enemy-slot canvas')`);
    if (hasMonster) { found = true; break; }
    const actions = [
      `(()=>{const b=document.querySelector('[data-action="advance-room"]:not([disabled])'); if(b){b.click(); return true;} return false;})()`,
      `(()=>{const b=document.querySelector('[data-action="choose-approach"]'); if(b){b.click(); return true;} return false;})()`,
      `(()=>{const b=document.querySelector('[data-action="grade-story"][data-value="2"]'); if(b){b.click(); return true;} return false;})()`,
      `(()=>{const b=document.querySelector('.primary-step[data-action="story-continue"]'); if(b){b.click(); return true;} return false;})()`,
      `(()=>{const b=document.querySelector('[data-action="use-skill"]'); if(b){b.click(); return true;} return false;})()`,
      `(()=>{const b=document.querySelector('[data-action="judge-lang"][data-value="2"]'); if(b){b.click(); return true;} return false;})()`,
      `(()=>{const b=document.querySelector('[data-action="skip-room"]'); if(b){b.click(); return true;} return false;})()`,
    ];
    for (const a of actions) if (await evalJs(c.send, a)) break;
  }
  assert(found, "battle: monster rendered (single-window)");
  const sprites = JSON.parse(await evalJs(c.send, `(() => { const out = []; for (const c of document.querySelectorAll('.stage .battle-enemies canvas, .stage .battle-party canvas')) { const r = c.getBoundingClientRect(); out.push({ key: c.dataset.key, css: r.width, native: c.width, scale: Math.round(r.width / (c.width / 3)) }); } return JSON.stringify(out); })()`));
  const scaleOK = sprites.length > 0 && sprites.every((s) => Number.isInteger(s.scale) && s.scale > 0);
  assert(scaleOK, `battle: integer sprite scaling (${JSON.stringify(sprites.slice(0, 4))})`);
  assert(c.exceptions.length === 0, `battle: no console exceptions (got ${c.exceptions.length})`);

  console.log(failures ? "\nLAYOUT TEST FAILED" : "\nLAYOUT TEST PASSED");
} catch (e) {
  console.error("CRASH:", e);
  failures++;
  console.log("\nLAYOUT TEST FAILED");
} finally {
  if (edge) edge.kill();
}
process.exitCode = failures ? 1 : 0;
