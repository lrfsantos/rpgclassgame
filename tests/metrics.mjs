// metrics.mjs - READ-ONLY measurement harness for report_09.
// Measures content stats, balance, parity, DOM/UX, readability, performance,
// sprites and story transcripts against the live game (no game code changes).
// Usage: node tests/metrics.mjs  (requires the server on http://localhost:8000)
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9250;
const PROFILE = "C:\\Users\\luiza\\AppData\\Local\\Temp\\opencode\\edge-metrics-profile";
const HTTP = `http://127.0.0.1:${PORT}`;
const BASE = "http://localhost:8000";
const EP = JSON.parse(readFileSync("C:/Users/luiza/Documents/protogame/content/episodes.json", "utf8")).episodes[0];
const CLASSES = JSON.parse(readFileSync("C:/Users/luiza/Documents/protogame/content/classes.json", "utf8")).classes;

const out = [];
const log = (s) => { out.push(s); console.log(s); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Phase A: content stats (node, from episodes.json) ----------
function words(s) { return s ? s.split(/\s+/).filter((w) => w.length > 0).length : 0; }
function sentences(s) { const p = (s || "").split(/[.!?]+/).map((x) => x.trim()).filter((x) => x.length > 0); return p.length || 1; }
function longWords(s) { return (s || "").split(/\s+/).filter((w) => w.replace(/[^a-zA-Z]/g, "").length > 8).length; }

log("=== A. CONTENT STATS ===");
log(`episode id=${EP.id} goal="${EP.goal}" scenes=${EP.scenes.length}`);
const kindDist = {};
EP.scenes.forEach((sc) => { kindDist[sc.kind] = (kindDist[sc.kind] || 0) + 1; });
log(`kind distribution: ${JSON.stringify(kindDist)}`);
EP.scenes.forEach((sc, i) => {
  const read = sc.flavour;
  const choiceN = (sc.choices || []).length;
  const hasPrompt = !!(sc.prompt && sc.prompt.text);
  const hasTalk = !!sc.talkDown;
  const hasCond = !!sc.conditional;
  const isLast = i === EP.scenes.length - 1;
  log(`scene ${i + 1} ${sc.id} kind=${sc.kind} readWords=${words(read)} avgSentLen=${(words(read) / sentences(read)).toFixed(1)} longWords=${longWords(read)} choices=${choiceN} prompt=${hasPrompt} talkDown=${hasTalk} conditional=${hasCond} last=${isLast}`);
  if (sc.choices) sc.choices.forEach((c) => {
    log(`  choice ${c.id} kind=${c.kind || "think"} stat=${c.stat} diff=${c.difficulty} target="${c.target}"`);
  });
});

// M6 spec string checks
const allText = JSON.stringify(EP);
log(`riddle exact "What grows louder the more you take from it?" present=${allText.includes("What grows louder the more you take from it?")}`);
log(`riddle spec variant "bigger the more you take away" present=${allText.includes("What gets bigger the more you take away from it?")}`);
log(`word "mercy" absent=${!allText.includes("mercy")}`);
log(`word "hesitates" absent=${!allText.includes("hesitates")}`);
log(`scene6 shout-promise present=${EP.scenes[5] && EP.scenes[5].choices.some((c) => /shout the promise|Shout the promise/i.test(c.label + (c.text || "")))}`);
log(`scene6 any choice labelled "Shout the promise": ${EP.scenes[5] ? EP.scenes[5].choices.map((c) => c.label).join("|") : "none"}`);
const rope = (EP.scenes[1] || {}).choices || [];
log(`Rope: choices on toll-bridge = ${rope.map((c) => c.id).join("|")}; grants = ${rope.filter((c) => c.grants).map((c) => c.grants.label).join("|")}`);
log(`clapper conditional flag=${EP.scenes[4].conditional ? EP.scenes[4].conditional.flag : "none"} whenSet=${EP.scenes[4].conditional ? JSON.stringify(EP.scenes[4].conditional.whenSet) : "-"}`);

// ---------- Phase A2: balance (pure math) ----------
log("");
log("=== B. BALANCE (P(success) per choice) ===");
function pSuccess(diff, mod, lang) {
  let ok = 0;
  for (let d = 1; d <= 20; d++) {
    if (d === 1) continue;
    if (d === 20) { ok++; continue; }
    if (d + mod + lang >= diff) ok++;
  }
  return (ok / 20);
}
const MODS = [-1, 0, 1, 2];
const LANGS = [0, 2, 4];
EP.scenes.forEach((sc) => {
  if (!sc.choices) return;
  sc.choices.forEach((c) => {
    const ps = {};
    for (const l of LANGS) ps["W" + l] = pSuccess(c.difficulty, MODS[0], l) + "," + pSuccess(c.difficulty, MODS[1], l) + "," + pSuccess(c.difficulty, MODS[2], l) + "," + pSuccess(c.difficulty, MODS[3], l);
    log(`balance ${sc.id}/${c.id} diff=${c.difficulty} P(success) mod[-1,0,+1,+2] Weak(0)=${ps.W0} Good(2)=${ps.W2} Great(4)=${ps.W4}`);
  });
});
// expected Spark per run: 5 story scenes, each success +4 (crit +6, fail +1), ignoring combat
let spark = 0;
for (const sc of EP.scenes.filter((x) => x.kind === "story")) {
  for (const c of sc.choices) {
    const pd = c.difficulty;
    // typical hero mod +2 (stat 5 -> mod 2); teacher Great +4
    const p = pSuccess(pd, 2, 4);
    spark += p * 4 + (1 - p) * 1;
  }
}
log(`expected Spark per all-story run (hero mod +2, Great +4, avg over choices): ${spark.toFixed(1)}`);

// ---------- headless Edge ----------
let edge = null;
let edgeUp = false;
try { rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
for (let attempt = 0; attempt < 4; attempt++) {
  edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 30; i++) {
    await wait(300);
    try { const res = await fetch(`${HTTP}/json`); const list = await res.json(); if (list.some((t) => t.type === "page")) { edgeUp = true; break; } } catch (e) {}
  }
  if (edgeUp) break;
  try { edge.kill(); } catch (e) {}
  await wait(500);
}
if (!edgeUp) throw new Error("Edge CDP never appeared");

async function newTab(url) { const res = await fetch(`${HTTP}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }); return res.json(); }
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
    else if (msg.method === "Runtime.exceptionThrown") exceptions.push((msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : "") || msg.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
  return { send, exceptions, ready: new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }) };
}
async function evalJs(send, expression) { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; }

let tab = await newTab(`${BASE}/index.html`);
const c = connect(tab.webSocketDebuggerUrl);
await c.ready;
await c.send("Runtime.enable");
await c.send("Page.enable");
await c.send("Runtime.evaluate", { expression: `localStorage.removeItem('classroom-rpg-save-v1')` });
await c.send("Page.navigate", { url: `${BASE}/index.html` });
await wait(900);

// helper: inject a hook to count Stage re-renders and time mutate()
await evalJs(c.send, `(function(){ window.__metrics = { renders: 0, mutateMs: [] }; const orig = document.querySelector('#stage .stage') ? null : null; })()`);

// helper to open drawer and add players, start episode
const ensureLobby = async () => {
  await evalJs(c.send, `(()=>{const b=document.getElementById('gm-drawer-open'); if(b&&!document.getElementById('gm-drawer').classList.contains('open')) b.click(); return true;})()`);
  await wait(300);
  await evalJs(c.send, `document.querySelectorAll('[data-action="quick-add-4"]').forEach(b=>b.click())`);
  await wait(300);
};

// per-step measurement while driving the episode
async function measureNow(label, stepLabel) {
  const gm = await evalJs(c.send, `(()=>{
    const gmEl=document.querySelector('#gm-drawer .gm')||document.querySelector('.gm');
    const visible=[...gmEl.querySelectorAll('button,[data-action],[data-skill-num]')].filter(b=>{const r=b.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(b).display!=='none'&&getComputedStyle(b).visibility!=='hidden';});
    const interactives=[...gmEl.querySelectorAll('button,input,select,textarea,a')].filter(b=>{const r=b.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(b).display!=='none';});
    return JSON.stringify({visBtns:visible.length, all:interactives.length, labels:visible.map(b=>b.dataset.action||b.textContent.trim().slice(0,12)).slice(0,12)});
  })()`);
  const stage = await evalJs(c.send, `(()=>{
    const st=document.querySelector('#stage');
    const interactives=[...st.querySelectorAll('button,input,select,textarea,a')].filter(b=>{const r=b.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(b).display!=='none';});
    const dlg=st.querySelector('.story-dialogue[data-narration]');
    return JSON.stringify({interactive:interactives.length, dlg:dlg?dlg.getAttribute('data-narration'):'', items:(st.querySelector('.story-items')||{}).textContent||'', focus:document.activeElement?(document.activeElement.id||document.activeElement.tagName):'body'});
  })()`);
  const st = JSON.parse(stage);
  log(`step ${label} ${stepLabel}: GM visBtns=${gm} stageInteractive=${st.interactive} focus=${st.focus}`);
  return { gm: JSON.parse(gm), st };
}

// drive an all-Great episode run, measuring per scene at LISTEN, RESULT and bridge
async function driveEpisode(gradeKey, runLabel) {
  await ensureLobby();
  await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="start-episode"]'); if(b){b.click(); return true;} return false;})()`);
  await wait(400);
  let safety = 0;
  const transcript = [];
  while (safety++ < 300) {
    const saveRaw = await evalJs(c.send, `localStorage.getItem('classroom-rpg-save-v1')`);
    const save = saveRaw ? JSON.parse(saveRaw) : null;
    const exp = save && save.expedition;
    const cur = exp ? exp.current : 0;
    const status = exp ? exp.roomStatus : "?";
    const step = exp && status === "story" ? exp.step : null;
    if (status === "story") {
      if (step === "listen") {
        const m = await measureNow(runLabel, `scene${cur + 1}/LISTEN`);
        const st = m.st;
        transcript.push({ scene: cur + 1, step: "LISTEN", stage: st.dlg.slice(0, 90), items: st.items.replace(/\s+/g, " ").slice(0, 60) });
        await evalJs(c.send, `(()=>{const b=document.querySelector('.primary-step[data-action="story-continue"]'); if(b){b.click(); return true;} return false;})()`);
      } else if (step === "choose") {
        const pick = await evalJs(c.send, `(()=>{const btns=[...document.querySelectorAll('[data-action="choose-approach"]')]; if(btns.length){ btns[0].click(); return btns[0].getAttribute('data-approach-key'); } const rs=document.querySelector('[data-action="reshuffle-options"]'); if(rs&&!rs.disabled){rs.click(); return 'reshuffle';} return null;})()`);
        await wait(150);
        if (pick && pick !== "reshuffle") await evalJs(c.send, `(()=>{const k=${JSON.stringify(pick)}; const b=document.querySelector('[data-approach-key="'+k+'"]'); if(b){b.click(); return true;} return false;})()`);
        await wait(150);
      } else if (step === "sayit") {
        await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="grade-story"][data-value="${gradeKey}"]'); if(b){b.click(); return true;} return false;})()`);
        await wait(150);
      } else if (step === "roll") {
        await evalJs(c.send, `(()=>{const b=document.querySelector('.primary-step[data-action="story-continue"]'); if(b){b.click(); return true;} return false;})()`);
        await wait(150);
      } else if (step === "result") {
        const m = await measureNow(runLabel, `scene${cur + 1}/RESULT`);
        const st = m.st;
        const bridge = exp.outcome && exp.outcome.bridge ? exp.outcome.bridge : "";
        transcript.push({ scene: cur + 1, step: "RESULT", stage: (exp.outcome && exp.outcome.text || "").slice(0, 90), bridge: bridge.slice(0, 90), items: st.items.replace(/\s+/g, " ").slice(0, 60) });
        await evalJs(c.send, `(()=>{const b=document.querySelector('.primary-step[data-action="story-continue"]'); if(b){b.click(); return true;} return false;})()`);
      } else {
        await evalJs(c.send, `(()=>{const b=document.querySelector('.primary-step:not([disabled])'); if(b){b.click(); return true;} return false;})()`);
      }
    } else if (status === "combat") {
      const act = await evalJs(c.send, `(()=>{
        const sk=document.querySelector('[data-action="use-skill"]:not([disabled])');
        if(sk){sk.click(); return 'skill';}
        const jl=document.querySelector('[data-action="judge-lang"][data-value="2"]');
        if(jl){jl.click(); return 'judge';}
        const cont=document.querySelector('.primary-step[data-action="primary-attack"]');
        if(cont){cont.click(); return 'attack';}
        const adv=document.querySelector('[data-action="advance-room"]:not([disabled])');
        if(adv){adv.click(); return 'advance';}
        return null;
      })()`);
      await wait(150);
    } else if (status === "cleared" || status === "defeat") {
      const prevRoom = exp && exp.rooms && exp.rooms[exp.current] ? exp.rooms[exp.current] : null;
      const out = exp && exp.outcome;
      if (prevRoom && prevRoom.kind === "story" && out) {
        log(`RESULT scene${cur + 1}: stage="${(out.text || "").slice(0, 90)}" bridge="${(out.bridge || "-").slice(0, 90)}"`);
      }
      await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="advance-room"]:not([disabled])'); if(b){b.click(); return true;} return false;})()`);
      await wait(150);
    }
    if (await evalJs(c.send, `/STORY COMPLETE!|STORY OVER/.test(document.body.textContent)`)) {
      const items = await evalJs(c.send, `(()=>{const s=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return (s.expedition&&s.expedition.items||[]).map(i=>i.label||i).join('|');})()`);
      transcript.push({ scene: "END", step: "RECAP", items });
      log(`run ${runLabel}: reached recap. items=${items}`);
      break;
    }
    if (safety % 20 === 0) {
      log(`heartbeat ${runLabel} iter=${safety} cur=${cur} status=${status} step=${step} phase=${save && save.phase}`);
    }
    await wait(100);
  }
  if (safety >= 300) log(`run ${runLabel}: TIMED OUT (no recap)`);
  return transcript;
}

// Stage re-render count + mutate timing: instrument before the run
await evalJs(c.send, `(function(){
  window.__rr=0;
  const st=document.getElementById('stage');
  if(st&&!st.__hooked){ st.__hooked=true; const mo=new MutationObserver(()=>{ window.__rr++; }); mo.observe(st,{childList:true,subtree:true}); }
})()`);
const t0 = Date.now();
const greatTranscript = await driveEpisode("4", "great");
log(`great run wall time=${Date.now() - t0}ms renders=${await evalJs(c.send, `window.__rr`) || 0}`);
log("--- great transcript ---");
greatTranscript.forEach((t) => log(`T scene${t.scene} ${t.step}: stage="${t.stage}" bridge="${t.bridge || "-"}" items="${t.items}"`));

// weak run transcript
await evalJs(c.send, `(()=>{const b=document.getElementById('gm-drawer-open'); if(b&&!document.getElementById('gm-drawer').classList.contains('open')) b.click(); return true;})()`);
await wait(200);
await evalJs(c.send, `document.querySelector('[data-action="back-to-lobby"]') && document.querySelector('[data-action="back-to-lobby"]').click()`);
await wait(200);
const weakTranscript = await driveEpisode("0", "weak");
log("--- weak transcript ---");
weakTranscript.forEach((t) => log(`T scene${t.scene} ${t.step}: stage="${t.stage}" bridge="${t.bridge || "-"}" items="${t.items}"`));

// ---- SPRITES: story-mode hero slots at each step, party sizes 1/6/12 (+NPC on 1) ----
log("");
log("=== SPRITES (story mode, non-transparent pixels per hero slot) ===");
async function measureSprites(size) {
  await evalJs(c.send, `(()=>{const b=document.getElementById('gm-drawer-open'); if(b&&!document.getElementById('gm-drawer').classList.contains('open')) b.click(); return true;})()`);
  await wait(200);
  await evalJs(c.send, `document.querySelector('[data-action="back-to-lobby"]') && document.querySelector('[data-action="back-to-lobby"]').click()`);
  await wait(200);
  await evalJs(c.send, `localStorage.removeItem('classroom-rpg-save-v1')`);
  await evalJs(c.send, `(()=>{const b=document.getElementById('gm-drawer-open'); if(b&&!document.getElementById('gm-drawer').classList.contains('open')) b.click(); return true;})()`);
  await wait(200);
  for (let i = 0; i < size; i++) await evalJs(c.send, `document.querySelector('[data-action="quick-add-4"]').click()`);
  await wait(300);
  await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="start-episode"]'); if(b){b.click(); return true;} return false;})()`);
  await wait(400);
  const check = `(()=>{const out=[]; for(const c of document.querySelectorAll('#stage canvas')){ const r=c.getBoundingClientRect(); let nt=0; try{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; for(let i=3;i<d.length;i+=4){ if(d[i]>0){nt=1;break;} } }catch(e){} out.push({k:c.dataset.key, cls:(c.parentElement||{}).className||'', nt}); } return JSON.stringify(out);})()`;
  const steps = [];
  for (const st of ["LISTEN", "CHOOSE", "SAYIT", "ROLL", "RESULT"]) {
    let guard = 0;
    while (guard++ < 15) {
      const sv = await evalJs(c.send, `localStorage.getItem('classroom-rpg-save-v1')`);
      const s = sv ? JSON.parse(sv) : null;
      const exp = s && s.expedition;
      if (exp && exp.roomStatus === "story" && (exp.step || "").toUpperCase() === st) break;
      const act = await evalJs(c.send, `(()=>{
        const s2=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); const e2=s2&&s2.expedition;
        if(e2&&e2.roomStatus==='story'){
          if(e2.step==='listen'){const b=document.querySelector('.primary-step[data-action="story-continue"]'); if(b){b.click(); return 'l';}}
          if(e2.step==='choose'){const b=document.querySelector('[data-action="choose-approach"]'); if(b){b.click(); return 'c';}}
          if(e2.step==='sayit'){const b=document.querySelector('[data-action="grade-story"][data-value="2"]'); if(b){b.click(); return 's';}}
          if(e2.step==='roll'){const b=document.querySelector('.primary-step[data-action="story-continue"]'); if(b){b.click(); return 'r';}}
          if(e2.step==='result'){const b=document.querySelector('.primary-step[data-action="story-continue"]'); if(b){b.click(); return 'R';}}
        } else if(e2&&(e2.roomStatus==='combat')){ const b=document.querySelector('[data-action="use-skill"]:not([disabled])'); if(b){b.click(); return 'k';} const j=document.querySelector('[data-action="judge-lang"][data-value="2"]'); if(j){j.click(); return 'j';} }
        else if(e2&&(e2.roomStatus==='cleared'||e2.roomStatus==='defeat')){ const b=document.querySelector('[data-action="advance-room"]:not([disabled])'); if(b){b.click(); return 'a';} }
        return null;
      })()`);
      await wait(150);
      if (act === null) break;
    }
    const sprites = await evalJs(c.send, check);
    const slots = sprites ? JSON.parse(sprites) : [];
    const empty = slots.filter((x) => !x.nt).map((x) => x.k || x.cls);
    log(`sprites size=${size} step=${st}: canvases=${slots.length} empty=[${empty.join(",") || "none"}]`);
    steps.push({ st, slots });
  }
  await evalJs(c.send, `Page.reload`);
  await wait(900);
  await evalJs(c.send, `(()=>{const b=document.getElementById('start-continue'); if(b){b.click(); return true;} return false;})()`);
  await wait(400);
  const afterReload = await evalJs(c.send, check);
  const slotsR = afterReload ? JSON.parse(afterReload) : [];
  const emptyR = slotsR.filter((x) => !x.nt).map((x) => x.k || x.cls);
  log(`sprites size=${size} afterReload: canvases=${slotsR.length} empty=[${emptyR.join(",") || "none"}]`);
}
for (const size of [1, 6, 12]) await measureSprites(size);


// mutate timing + JSON size at actions 1/25/50/100 - measure during a fresh expedition (combat-heavy, more actions)
await evalJs(c.send, `(()=>{const b=document.getElementById('gm-drawer-open'); if(b&&!document.getElementById('gm-drawer').classList.contains('open')) b.click(); return true;})()`);
await wait(200);
await evalJs(c.send, `document.querySelector('[data-action="back-to-lobby"]') && document.querySelector('[data-action="back-to-lobby"]').click()`);
await wait(200);
await evalJs(c.send, `localStorage.removeItem('classroom-rpg-save-v1')`);
await evalJs(c.send, `(()=>{const b=document.getElementById('gm-drawer-open'); if(b&&!document.getElementById('gm-drawer').classList.contains('open')) b.click(); return true;})()`);
await wait(200);
await evalJs(c.send, `document.querySelectorAll('[data-action="quick-add-4"]').forEach(b=>b.click())`);
await wait(300);
await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="start-expedition"]'); if(b){b.click(); return true;} return false;})()`);
await wait(400);
log("=== C. PERFORMANCE (random expedition, 4 players) ===");
let acted = 0;
for (let i = 0; i < 110 && acted < 100; i++) {
  const saveRaw = await evalJs(c.send, `localStorage.getItem('classroom-rpg-save-v1')`);
  const save = saveRaw ? JSON.parse(saveRaw) : null;
  const exp = save && save.expedition;
  if (!exp || exp.roomStatus === "cleared" || exp.roomStatus === "defeat") {
    await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="advance-room"]'); if(b){b.click(); return true;} return false;})()`);
  } else if (exp.actionPhase === "choosing") {
    const t1 = await evalJs(c.send, `(()=>{const s=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); const a=Date.now(); const b=document.querySelector('[data-action="use-skill"]:not([disabled])')||document.querySelector('[data-action="primary-attack"]'); if(b) b.click(); const e=Date.now(); return e-a;})()`);
    acted++;
    if ([1, 25, 50, 100].includes(acted)) {
      const size = await evalJs(c.send, `(()=>{const s=JSON.parse(localStorage.getItem('classroom-rpg-save-v1')); return JSON.stringify(s).length;})()`);
      log(`mutate ~action ${acted}: click-handler ms=${t1} saveJsonBytes=${size}`);
    }
  } else if (exp.actionPhase === "acting" && exp.pending) {
    await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="judge-lang"][data-value="2"]'); if(b){b.click(); return true;} return false;})()`);
  } else {
    await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="use-skill"]:not([disabled])'); if(b){b.click(); return true;} const p=document.querySelector('.primary-step[data-action="primary-attack"]'); if(p){p.click(); return true;} return false;})()`);
  }
  await wait(60);
}

// readability at viewports + 200% zoom (index.html: stage + drawer, live state).
// Drive a fresh episode to scene 1 LISTEN so dialogue/cards/names are on screen,
// then re-measure at each viewport (state persists in localStorage across reloads).
log("");
log("=== D. READABILITY ===");
await evalJs(c.send, `(()=>{const b=document.getElementById('gm-drawer-open'); if(b&&!document.getElementById('gm-drawer').classList.contains('open')) b.click(); return true;})()`);
await wait(200);
await evalJs(c.send, `document.querySelector('[data-action="back-to-lobby"]') && document.querySelector('[data-action="back-to-lobby"]').click()`);
await wait(200);
await evalJs(c.send, `localStorage.removeItem('classroom-rpg-save-v1')`);
await evalJs(c.send, `(()=>{const b=document.getElementById('gm-drawer-open'); if(b&&!document.getElementById('gm-drawer').classList.contains('open')) b.click(); return true;})()`);
await wait(200);
await evalJs(c.send, `document.querySelectorAll('[data-action="quick-add-4"]').forEach(b=>b.click())`);
await wait(300);
await evalJs(c.send, `(()=>{const b=document.querySelector('[data-action="start-episode"]'); if(b){b.click(); return true;} return false;})()`);
await wait(400);
// advance LISTEN -> CHOOSE so cards are visible too
await evalJs(c.send, `(()=>{const b=document.querySelector('.primary-step[data-action="story-continue"]'); if(b){b.click(); return true;} return false;})()`);
await wait(300);
const VIEWPORTS = [
  { w: 1920, h: 1080, z: 1 },
  { w: 1366, h: 768, z: 1 },
  { w: 960, h: 540, z: 1 },
  { w: 960, h: 540, z: 2 },
];
for (const vp of VIEWPORTS) {
  await c.send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.z, mobile: false });
  await c.send("Page.navigate", { url: `${BASE}/index.html` });
  await wait(900);
  await evalJs(c.send, `(()=>{const b=document.getElementById('start-continue'); if(b){b.click(); return true;} return false;})()`);
  await wait(400);
  const r = await evalJs(c.send, `(()=>{
    const stage=document.querySelector('#stage');
    if(!stage) return JSON.stringify({err:'no stage'});
    const ss=parseFloat(stage.style.getPropertyValue('--ss')||'1')||1;
    const out={ss};
    const sel=['.story-dialogue','.approach-card','.story-title','.story-path','.story-item','.d20-face','.battle-menu .cmd','.prompt','.pname-tag'];
    for(const s0 of sel){ const el=stage.querySelector(s0); if(el){ const cs=getComputedStyle(el); out[s0]={fs:parseFloat(cs.fontSize)/ss, fg:cs.color, bg:cs.backgroundColor, clip:el.scrollHeight>el.clientHeight+1, overflow:el.scrollWidth>el.clientWidth+1}; } }
    out.hOverflow=document.documentElement.scrollWidth-document.documentElement.clientWidth;
    return JSON.stringify(out);
  })()`);
  log(`readability ${vp.w}x${vp.h} zoom${vp.z}: ${r}`);
}

log(`consoleExceptions=${c.exceptions.length}`);
log("=== DONE ===");
try { edge.kill(); } catch (e) {}
writeFileSync("C:/Users/luiza/Documents/protogame/REPORT/metrics-raw.txt", out.join("\n"), "utf8");
