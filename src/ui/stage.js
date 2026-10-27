// Stage view (v2 + B1.5): fixed 16:9 virtual canvas, letterboxed, integer sprite
// scaling, pixelated rendering. Title screen, JRPG battle layout, minimap
// placeholder, sprites, d20, typewriter. Read-only, no spoilers.
import { getState, subscribe } from "../engine/state.js";
import { getContent } from "../engine/content.js";
import { loadSprites, mountSprite } from "../engine/sprites.js";
import * as audio from "../engine/audio.js";
import { el, bar } from "./util.js";
import { typewriterText } from "./typewriter.js";

let rootEl = null;
const REDUCED = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Stage is a fixed 16:9 box. scaleFactor = stageWidth/1920 so that at 1080p it
// is 1.0; text and sprites scale off it. Sprites use INTEGER scales only.
let stageScaleFactor = 1;
function measureStage() {
  if (!rootEl) return;
  stageScaleFactor = rootEl.clientWidth > 0 ? rootEl.clientWidth / 1920 : 1;
  rootEl.style.setProperty("--ss", String(stageScaleFactor));
}
function intSpriteScale(base) {
  return Math.max(1, Math.round(base * stageScaleFactor));
}

export async function mountStage(container) {
  rootEl = el("div", { class: "stage" });
  container.appendChild(rootEl);
  try {
    await loadSprites();
  } catch (e) { /* sprites optional */ }
  audio.initAudio();
  measureStage();
  render();
  subscribe(() => render());
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => { measureStage(); render(); });
    ro.observe(rootEl);
  } else {
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { measureStage(); render(); }, 120);
    });
  }
}

function className(id) {
  const c = getContent().classes.find((x) => x.id === id);
  return c ? c.name : "?";
}

function render() {
  const state = getState();
  if (!rootEl) return;
  measureStage();
  rootEl.innerHTML = "";
  if (state.phase === "lobby") { rootEl.appendChild(renderTitle(state)); return; }
  if (state.phase === "victory" || state.phase === "defeated") { rootEl.appendChild(renderRecap(state)); return; }
  rootEl.appendChild(renderBattle(state));
}

// ---------- Title screen ----------
function renderTitle(s) {
  const wrap = el("div", { class: "title-screen" });
  const hills = el("canvas", { class: "title-hills" });
  const w = Math.max(320, rootEl.clientWidth || 320);
  const h = Math.max(180, rootEl.clientHeight || 180);
  hills.width = w; hills.height = h;
  const ctx = hills.getContext("2d");
  // sky
  ctx.fillStyle = "#2a241d"; ctx.fillRect(0, 0, w, h);
  // parallax hills (integer pixel grid)
  const g = Math.max(4, Math.round(w / 320)); // pixels per art-pixel
  ctx.fillStyle = "#1b1713";
  for (let x = 0; x < w; x += 8 * g) { const y = Math.round(h * 0.5) + ((x * 7) % (h * 0.3)); ctx.fillRect(x, y, 6 * g, h - y); }
  ctx.fillStyle = "#3a5a2a";
  for (let x = 0; x < w; x += 12 * g) { const y = Math.round(h * 0.62) + ((x * 5) % (h * 0.22)); ctx.fillRect(x, y, 8 * g, h - y); }
  ctx.fillStyle = "#6a994e";
  for (let x = 4 * g; x < w; x += 16 * g) { ctx.fillRect(x, Math.round(h * 0.72) + ((x * 3) % (h * 0.12)), 6 * g, h * 0.2); }
  wrap.appendChild(hills);

  const content = el("div", { class: "title-content" });
  content.appendChild(el("h1", { class: "title-logo" }, "CLASSROOM RPG"));
  content.appendChild(el("div", { class: "title-sub" }, "A tabletop adventure for your English class"));

  const menu = el("div", { class: "title-menu" });
  const hasSave = s.players.length > 0 || !!s.expedition;
  menu.appendChild(el("div", { class: (hasSave ? "title-state" : "title-state empty") }, hasSave ? "A saved game is waiting on the teacher console." : "No players yet."));
  wrap.appendChild(content);
  wrap.appendChild(menu);
  wrap.appendChild(el("div", { class: "title-hint" }, "Teacher: press G to open the GM console"));

  return wrap;
}

// ---------- Battle layout ----------
function renderBattle(s) {
  const exp = s.expedition;
  const room = exp.rooms[exp.current];
  const battle = el("div", { class: "battle" });

  const field = el("div", { class: "battle-field" });

  // minimap placeholder (top-right): expedition rooms as nodes
  const map = el("div", { class: "stage-map" });
  map.appendChild(el("div", { class: "map-title" }, exp.deckName));
  const nodes = el("div", { class: "map-nodes" });
  exp.rooms.forEach((r, i) => {
    const cls = "map-node" + (i === exp.current ? " current" : "") + (r.kind === "combat" && r.boss ? " boss" : "");
    nodes.appendChild(el("span", { class: cls, title: r.kind }, String(i + 1)));
  });
  map.appendChild(nodes);
  field.appendChild(map);

  // enemies on the right
  if (exp.monster) {
    const en = el("div", { class: "battle-enemies" });
    const slot = el("div", { class: "enemy-slot" });
    const key = exp.monster.id || "grumble-slime";
    const frame = exp.monster.hp === 0 ? "down" : "idle-1";
    mountSprite(slot, key, frame, exp.monster.boss ? intSpriteScale(2) : intSpriteScale(4));
    slot.appendChild(el("div", { class: "pname-tag" }, exp.monster.name));
    slot.appendChild(bar(exp.monster.hp, exp.monster.maxHp, "hp"));
    en.appendChild(slot);
    field.appendChild(en);
  }

  // party on the left
  const party = el("div", { class: "battle-party" });
  for (const p of s.players) {
    const slot = el("div", { class: "party-slot" });
    mountSprite(slot, p.classId || "warrior", p.hp === 0 ? "down" : "idle-1", intSpriteScale(4));
    slot.appendChild(el("div", { class: "pname-tag" }, `${p.name}${p.npc ? " (NPC)" : ""}`));
    slot.appendChild(bar(p.hp, p.maxHp, "hp"));
    slot.appendChild(bar(p.focus, p.maxFocus, "focus"));
    if (exp.activePlayerId === p.id) slot.classList.add("acting");
    party.appendChild(slot);
  }
  field.appendChild(party);
  battle.appendChild(field);

  // bottom menu window
  const menu = el("div", { class: "battle-menu" });
  const actor = s.players.find((p) => p.id === exp.activePlayerId);
  const acting = !!actor && !actor.npc && (exp.roomStatus === "combat" || exp.roomStatus === "challenge" || exp.roomStatus === "trap") && exp.actionPhase === "choosing";

  if (exp.langPrompt) {
    menu.appendChild(el("span", { class: "cmd-label" }, "Say it:"));
    const say = el("span", { class: "prompt" }, exp.langPrompt.text);
    menu.appendChild(say);
  } else if (acting && actor) {
    menu.appendChild(el("span", { class: "cmd-label" }, `${actor.name} (${className(actor.classId)}) — your turn:`));
    const cls = getContent().classes.find((c) => c.id === actor.classId);
    const basic = el("button", { class: "cmd" }, `Basic attack (free)`);
    basic.addEventListener("click", () => audio.playSfx("click"));
    menu.appendChild(basic);
    for (const sid of cls.skillIds) {
      const sk = getContent().skills.find((x) => x.id === sid);
      const btn = el("button", { class: "cmd", disabled: actor.focus < sk.cost ? "" : null }, `${sk.name} (${sk.cost} F)`);
      btn.addEventListener("click", () => audio.playSfx("click"));
      menu.appendChild(btn);
    }
  } else if (exp.roomStatus === "cleared") {
    menu.appendChild(el("span", { class: "muted" }, "Room cleared — wait for the teacher."));
  } else if (exp.roomStatus === "defeat") {
    menu.appendChild(el("span", { class: "roll-fail" }, "The party is overwhelmed..."));
  } else {
    menu.appendChild(el("span", { class: "muted" }, room.flavour));
  }

  // d20 + roll breakdown
  if (exp.lastRoll) {
    const r = exp.lastRoll;
    const rollWrap = el("div", { class: "d20-stage" });
    const face = el("div", { class: "d20-face" + (r.crit ? " d20-crit" : "") }, String(r.d20));
    if (!REDUCED) { face.classList.add("d20-rolling"); setTimeout(() => face.classList.remove("d20-rolling"), 700); }
    if (r.crit) audio.playSfx("crit");
    else if (r.fumble) audio.playSfx("fumble");
    else if (r.success) audio.playSfx("hit");
    rollWrap.appendChild(face);
    const res = r.crit ? "CRIT!" : r.fumble ? "FUMBLE!" : r.success ? "success" : "fail";
    const line = el("div", { class: "roll-line" },
      el("span", { class: "big" }, `d20 ${r.d20}`),
      el("span", {}, ` + mod ${r.mod}`),
      el("span", {}, r.langBonus ? ` + language ${r.langBonus}` : ""),
      el("span", {}, r.assistBonus ? ` + assist ${r.assistBonus}` : ""),
      el("span", {}, ` = ${r.total} vs ${r.difficulty}`),
      el("span", { class: r.crit ? "roll-crit" : r.success ? "roll-success" : "roll-fail" }, ` → ${res}`),
    );
    rollWrap.appendChild(line);
    menu.appendChild(rollWrap);
  }

  battle.appendChild(menu);

  // narration via typewriter
  const log = exp.log;
  if (log.length) {
    const last = log[log.length - 1];
    if (last && last.text) {
      const tw = el("div", { class: "typewriter-wrap" });
      tw.appendChild(typewriterText(last.text, { speed: 18 }));
      battle.appendChild(tw);
    }
  }

  return battle;
}

// ---------- Recap ----------
function renderRecap(s) {
  const won = s.phase === "victory";
  const wrap = el("div", { class: "title-screen" });
  wrap.appendChild(el("h1", { class: "title-logo " + (won ? "win" : "lose") }, won ? "EXPEDITION COMPLETE!" : "EXPEDITION OVER"));
  wrap.appendChild(el("div", { class: "title-sub" }, won
    ? `The whole class wins! Score ${s.party.score} | Gold ${s.party.gold}`
    : `The party lives to try again. Score ${s.party.score} | Gold ${s.party.gold}`));
  if (won) audio.playSfx("victory");
  return wrap;
}
