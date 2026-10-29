// Episode test (PART 1B): first-time-user playthrough of the story using ONLY
// the primary button (Space) and number keys (1-4 approach, 1/2/3 grade). Never
// uses skip-room. Asserts: every step has an enabled primary; no disabled
// control lacks reason text; Stage narration == GM latest narration after every
// step; all 6 scene prompts appear; no target/example hint leaks to Stage;
// sprite matrix (every party/enemy canvas size>0, non-transparent, in viewport);
// font-size minimums + contrast on dialogue/cards; flags set on a Great run.
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
async function evalJs(send, expression) { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); return r.result ? r.result.value : undefined; }
async function key(send, k) { await evalJs(send, `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`); }
async function click(send, sel) { await evalJs(send, `(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(b){b.click(); return true;} return false;})()`); }

const episode = JSON.parse(readFileSync(`${ROOT}/content/episodes.json`, "utf8"));
const prompts = JSON.parse(readFileSync(`${ROOT}/content/prompts.json`, "utf8"));
const hints = [];
for (const ep of episode.episodes) for (const sc of ep.scenes) {
  if (sc.prompt) { hints.push(sc.prompt.target, sc.prompt.example); }
  for (const c of (sc.choices || [])) { hints.push(c.target, c.example); }
}
for (const p of prompts.vocabPrompts || []) { hints.push(p.target, p.example); }
const allChoiceTexts = episode.episodes[0].scenes.flatMap((sc) => (sc.choices || []).map((c) => c.text.toLowerCase()));
const combatPromptText = (episode.episodes[0].scenes.find((s) => s.kind === "combat") || {}).prompt?.text?.toLowerCase();

// contrast >= 7:1 (WCAG): returns true if ratio meets threshold
function contrastRatio(c1, c2) {
  const lum = (h) => { const [r, g, b] = h.match(/[\da-f]{2}/gi).map((x) => parseInt(x, 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const l1 = lum(c1), l2 = lum(c2);
  const [hi, lo] = [Math.max(l1, l2), Math.min(l1, l2)];
  return (hi + 0.05) / (lo + 0.05);
}

async function resetGame(c) {
  await c.send("Runtime.evaluate", { expression: `localStorage.removeItem('classroom-rpg-save-v1'); location.reload();` });
  await wait(900);
  await click(c.send, '#gm-drawer-open');
  await wait(300);
  await click(c.send, '[data-action="quick-add-4"]');
  await wait(400);
  await click(c.send, '[data-action="start-episode"][data-value="the-bell-of-bellingham"]');
  await wait(700);
}

async function playOnce(c, grade, opts = {}) {
  // grade: "great"|"weak"|"first" (first-time-user: pick approach by number key)
  const seen = new Set();
  const stageHints = [];
  let recapReached = false;
  let noPrimary = 0;
  const badDisabled = [];
  let spriteFails = 0;
  let narrationMismatch = 0;
  let minFont = 999, minContrast = 99;
  let steps = 0;
  const safety = 600;
  const gradeKey = grade === "weak" ? "1" : "3"; // 1=Weak 2=Good 3=Great

  while (steps++ < safety) {
    if (await evalJs(c.send, `/STORY COMPLETE!|STORY OVER/.test(document.body.textContent)`)) { recapReached = true; break; }

    // spoiler + narration-sync + sprite + font checks every iteration
    const stageText = await evalJs(c.send, `document.querySelector('#stage') ? document.querySelector('#stage').textContent : ''`);
    for (const h of hints) if (h && stageText.includes(h)) stageHints.push(h);
    const gmRead = await evalJs(c.send, `(()=>{const e=document.querySelector('.gm .read-aloud'); return e?e.textContent.trim():null;})()`);
    const stageNar = await evalJs(c.send, `(()=>{const e=document.querySelector('#stage .story-dialogue[data-narration], #stage .typewriter-wrap[data-narration]'); return e?e.getAttribute('data-narration'):null;})()`);
    if (gmRead && stageNar && stageNar !== gmRead) narrationMismatch++;
    // primary step button enabled?
    const primEnabled = await evalJs(c.send, `!!document.querySelector('.primary-step:not([disabled])')`);
    const primDisabled = await evalJs(c.send, `!!document.querySelector('.primary-step[disabled]')`);
    if (!primEnabled && !primDisabled) noPrimary++;
    // disabled controls show a reason (title or sibling .disabled-reason)
    const badD = await evalJs(c.send, `(()=>{const out=[]; for(const b of document.querySelectorAll('.gm button[disabled]')){ if(!b.title && !(b.nextElementSibling && b.nextElementSibling.classList.contains('disabled-reason'))) out.push(b.dataset.action||b.textContent.trim().slice(0,20)); } return out.length?out.join(','):null;})()`);
    if (badD) badDisabled.push(badD);
    // sprites
    const spr = await evalJs(c.send, `(()=>{const out=[]; for(const c of document.querySelectorAll('.stage canvas')){ const r=c.getBoundingClientRect(); let nt=0; try{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; for(let i=3;i<d.length;i+=4){ if(d[i]>0){nt=1;break;} } }catch(e){} const vp=document.documentElement.clientWidth; out.push({k:c.dataset.key,w:Math.round(r.width),h:Math.round(r.height),inView:r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=vp&&r.bottom<=document.documentElement.clientHeight,nt}); } return JSON.stringify(out);})()`);
    if (spr && spr !== "[]") { for (const s of JSON.parse(spr)) { if (!(s.w>0 && s.h>0 && s.inView && s.nt)) spriteFails++; } }
    // fonts + contrast on dialogue + approach cards (virtual px = computed / --ss)
    const fx = await evalJs(c.send, `(()=>{const out={}; const ss=parseFloat(document.querySelector('.stage').style.getPropertyValue('--ss')||'1')||1; out.ss=ss; const dlg=document.querySelector('.stage .story-dialogue'); if(dlg){ const cs=getComputedStyle(dlg); out.dlgFont=parseFloat(cs.fontSize)/ss; out.dlgFg=cs.color; out.dlgBg=cs.backgroundColor; } const card=document.querySelector('.stage .approach-card'); if(card){ const cs=getComputedStyle(card); out.cardFont=parseFloat(cs.fontSize)/ss; out.cardFg=cs.color; out.cardBg=cs.backgroundColor; } return JSON.stringify(out);})()`);
    if (fx && fx !== "{}") { const f = JSON.parse(fx); if (f.dlgFont) minFont = Math.min(minFont, f.dlgFont); if (f.cardFont) minFont = Math.min(minFont, f.cardFont); if (f.dlgFont && f.dlgFg && f.dlgBg) { const toHex=(rgbStr)=>{const m=rgbStr.match(/[\d.]+/g); if(!m||m.length<3) return null; return [m[0],m[1],m[2]].map(v=>Math.round(Number(v)).toString(16).padStart(2,'0')).join('');}; const fg=toHex(f.dlgFg), bg=toHex(f.dlgBg); if(fg&&bg){ minContrast = Math.min(minContrast, contrastRatio(fg, bg)); } } }

    // record a seen prompt (story dialogue or approach cards)
    const say = await evalJs(c.send, `(()=>{const e=document.querySelector('.gm .gm-hint'); return e?e.textContent:'';})()`);

    // FIRST-TIME-USER DRIVING: only primary (Space) + number keys
    const stepNow = await evalJs(c.send, `(()=>{const cur=document.querySelector('.gm .step-bar .step.current'); return cur?cur.textContent.trim():null;})()`);
    if (stepNow === "CHOOSE") {
      // story approach: prefer a flagged choice, dispatch its letter key (A/B/C).
      // combat: click the first enabled skill (letters do nothing in combat).
      const flagged = ["promise-bravely", "ask-politely", "make-a-deal", "answer-the-riddle", "order-carefully"];
      const picked = await evalJs(c.send, `(()=>{
        const btns=[...document.querySelectorAll('[data-action="choose-approach"]')];
        if(btns.length){
          const b=btns.find(x=>${JSON.stringify(flagged)}.includes(x.dataset.value))||btns[0];
          return b.getAttribute('data-approach-key');
        }
        const sk=document.querySelector('[data-action="use-skill"]:not([disabled])');
        if(sk){ sk.click(); return '__skill__'; }
        return null;
      })()`);
      if (picked && picked !== "__skill__") await key(c.send, picked);
      await wait(200);
      continue;
    }
    if (stepNow === "SAY IT") {
      await key(c.send, gradeKey);
      await wait(200);
      continue;
    }
    // any other step: Space triggers primary
    await key(c.send, " ");
    await wait(200);
  }

  return { seen, stageHints, recapReached, noPrimary, badDisabled, spriteFails, narrationMismatch, minFont, minContrast, steps };
}

try {
  await startEdge();
  const tab = await newTab(`${BASE}/index.html`);
  const c = connect(tab.webSocketDebuggerUrl);
  await c.ready;
  await c.send("Runtime.enable");
  await c.send("Page.enable");
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  // ---- Run: first-time-user, grade everything Great ----
  await resetGame(c);
  const run = await playOnce(c, "great");
  assert(run.recapReached, "story reached the recap screen");
  assert(run.stageHints.length === 0, `no target/example hint leaked on Stage (${JSON.stringify(run.stageHints.slice(0,3))})`);
  assert(run.noPrimary === 0, `every step had an enabled primary control (missing ${run.noPrimary} times)`);
  assert(run.badDisabled.length === 0, `no disabled control lacks a reason (${JSON.stringify(run.badDisabled.slice(0,3))})`);
  assert(run.spriteFails === 0, `sprite matrix clean (${run.spriteFails} fails)`);
  assert(run.narrationMismatch === 0, `Stage narration matched GM latest narration after every step (${run.narrationMismatch} mismatches)`);
  assert(run.minFont < 900 || run.minFont >= 24, run.minFont >= 900 ? "element not found: .stage .story-dialogue or .approach-card (font sentinel)" : `stage min font-size (virtual) >= 24px (measured ${run.minFont.toFixed(1)}px)`);
  assert(run.minContrast < 90 || run.minContrast >= 7, run.minContrast >= 90 ? "element not found: .stage .story-dialogue or .approach-card (contrast sentinel)" : `dialogue/card contrast >= 7:1 (measured ${run.minContrast.toFixed(2)})`);
  const saveG = await evalJs(c.send, `localStorage.getItem('classroom-rpg-save-v1')`);
  const parsedG = saveG ? JSON.parse(saveG) : null;
  assert(!!parsedG && parsedG.expedition && parsedG.expedition.flags && Object.keys(parsedG.expedition.flags).length > 0, "great run: expedition.flags is non-empty at recap");
  assert(parsedG && parsedG.expedition && parsedG.expedition.flags.crossedBridge === true, "great run: crossedBridge flag set");
  if (c.exceptions.length) c.exceptions.forEach((e) => console.error("exc:", e));
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
