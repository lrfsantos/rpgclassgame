// Stage view (v2 + B1): JRPG battle layout, title screen, sprites, d20, typewriter.
// Read-only, no spoilers, no teacher-only info (language hints stay in GM console).
import { getState, subscribe } from "../engine/state.js";
import { getContent } from "../engine/content.js";
import { loadSprites, mountSprite } from "../engine/sprites.js";
import * as audio from "../engine/audio.js";
import { el, bar } from "./util.js";
import { typewriterText } from "./typewriter.js";

let rootEl = null;
const REDUCED = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function mountStage(container) {
  rootEl = el("div", { class: "stage" });
  container.appendChild(rootEl);
  try {
    await loadSprites();
  } catch (e) { /* sprites optional */ }
  audio.initAudio();
  render();
  subscribe(() => render());
}

function className(id) {
  const c = getContent().classes.find((x) => x.id === id);
  return c ? c.name : "?";
}

function render() {
  const state = getState();
  if (!rootEl) return;
  rootEl.innerHTML = "";
  if (state.phase === "lobby") { rootEl.appendChild(renderTitle(state)); return; }
  if (state.phase === "victory" || state.phase === "defeated") { rootEl.appendChild(renderRecap(state)); return; }
  rootEl.appendChild(renderBattle(state));
}

// ---------- Title screen ----------
function renderTitle(s) {
  const wrap = el("div", { class: "title-screen" });
  const hills = el("canvas", { class: "title-hills" });
  hills.width = 320; hills.height = 100;
  const ctx = hills.getContext("2d");
  ctx.fillStyle = "#2a241d"; ctx.fillRect(0, 0, 320, 100);
  ctx.fillStyle = "#1b1713";
  for (let x = 0; x < 320; x += 8) { const y = 40 + ((x * 7) % 40); ctx.fillRect(x, y, 6, 100 - y); }
  ctx.fillStyle = "#3a5a2a";
  for (let x = 0; x < 320; x += 12) { const y = 62 + ((x * 5) % 24); ctx.fillRect(x, y, 8, 100 - y); }
  ctx.fillStyle = "#6a994e";
  for (let x = 4; x < 320; x += 16) { ctx.fillRect(x, 78 + ((x * 3) % 12), 6, 22); }
  wrap.appendChild(hills);

  const logo = el("h1", { class: "title-logo" }, "CLASSROOM RPG");
  wrap.appendChild(logo);
  wrap.appendChild(el("div", { class: "title-sub" }, "A tabletop adventure for your English class"));

  const menu = el("div", { class: "title-menu" });
  const hasSave = s.players.length > 0 || !!s.expedition;
  menu.appendChild(el("div", { class: (hasSave ? "title-state" : "title-state empty") }, hasSave ? "A saved game is waiting on the teacher console." : "No players yet."));
  menu.appendChild(el("div", { class: "muted" }, "Teacher: press G to open the GM console"));
  wrap.appendChild(menu);

  return wrap;
}

// ---------- Battle layout ----------
function renderBattle(s) {
  const exp = s.expedition;
  const room = exp.rooms[exp.current];
  const battle = el("div", { class: "battle" });

  const field = el("div", { class: "battle-field" });

  // enemies on the right
  if (exp.monster) {
    const en = el("div", { class: "battle-enemies" });
    const slot = el("div", { class: "enemy-slot" });
    const key = exp.monster.id || "grumble-slime";
    const frame = exp.monster.hp === 0 ? "down" : "idle-1";
    mountSprite(slot, key, frame, exp.monster.boss ? 2 : 1.6);
    slot.appendChild(el("div", { class: "pname-tag" }, exp.monster.name));
    slot.appendChild(bar(exp.monster.hp, exp.monster.maxHp, "hp"));
    en.appendChild(slot);
    field.appendChild(en);
  }

  // party on the left
  const party = el("div", { class: "battle-party" });
  for (const p of s.players) {
    const slot = el("div", { class: "party-slot" });
    mountSprite(slot, p.classId || "warrior", p.hp === 0 ? "down" : "idle-1", 1.2);
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
