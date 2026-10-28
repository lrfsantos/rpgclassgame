// Stage view (v2 + B1.5 + PART 1B): fixed 16:9 virtual canvas, letterboxed,
// integer sprite scaling, pixelated. Step bar LISTEN/CHOOSE/SAY IT/ROLL/RESULT,
// story zones, typewriter dialogue. Read-only, no spoilers, no teacher hints.
import { getState, subscribe } from "../engine/state.js";
import { getContent } from "../engine/content.js";
import { loadSprites, mountSprite } from "../engine/sprites.js";
import * as audio from "../engine/audio.js";
import { el, bar } from "./util.js";
import { typewriterText } from "./typewriter.js";

let rootEl = null;
const REDUCED = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let stageScaleFactor = 1;
function measureStage() {
  if (!rootEl) return;
  stageScaleFactor = rootEl.clientWidth > 0 ? rootEl.clientWidth / 1920 : 1;
  rootEl.style.setProperty("--ss", String(stageScaleFactor));
}
function intSpriteScale(base) {
  return Math.max(1, Math.round(base * stageScaleFactor));
}
// virtual-px -> CSS px (all stage text scales off the 16:9 box)
function px(v) { return `calc(${v}px * var(--ss))`; }

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

// Derive the step-bar label from state for ANY mode.
export function currentStep(s) {
  const exp = s.expedition;
  if (!exp) return null;
  if (exp.mode === "episode" && exp.roomStatus === "story" && exp.step) return exp.step;
  if (["cleared", "defeat"].includes(exp.roomStatus)) return "result";
  if (exp.langPrompt) return "sayit";
  if (exp.lastRoll && exp.actionPhase !== "choosing") return "roll";
  if (exp.actionPhase === "choosing") return "choose";
  return "listen";
}
const STEPS = ["listen", "choose", "sayit", "roll", "result"];
const STEP_LABEL = { listen: "LISTEN", choose: "CHOOSE", sayit: "SAY IT", roll: "ROLL", result: "RESULT" };

function render() {
  const state = getState();
  if (!rootEl) return;
  measureStage();
  rootEl.innerHTML = "";
  if (state.phase === "lobby") { rootEl.appendChild(renderTitle(state)); return; }
  if (state.phase === "victory" || state.phase === "defeated") { rootEl.appendChild(renderRecap(state)); return; }
  rootEl.appendChild(renderPlay(state));
}

function stepBar(s) {
  const cur = currentStep(s);
  const barEl = el("div", { class: "step-bar" });
  for (const st of STEPS) {
    barEl.appendChild(el("span", { class: "step" + (st === cur ? " current" : "") + (STEPS.indexOf(st) < STEPS.indexOf(cur) ? " done" : "") }, STEP_LABEL[st]));
  }
  return barEl;
}

// ---------- Title screen ----------
function renderTitle(s) {
  const wrap = el("div", { class: "title-screen" });
  const hills = el("canvas", { class: "title-hills" });
  const w = Math.max(320, rootEl.clientWidth || 320);
  const h = Math.max(180, rootEl.clientHeight || 180);
  hills.width = w; hills.height = h;
  const ctx = hills.getContext("2d");
  ctx.fillStyle = "#2a241d"; ctx.fillRect(0, 0, w, h);
  const g = Math.max(4, Math.round(w / 320));
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

// ---------- Play ----------
function renderPlay(s) {
  const exp = s.expedition;
  const room = exp.rooms[exp.current];
  const isStory = exp.roomStatus === "story";
  if (isStory) return renderStory(s, room);
  return renderCombat(s, room);
}

// ---------- Story layout (episode story scenes) ----------
function renderStory(s, room) {
  const exp = s.expedition;
  const wrap = el("div", { class: "story" });
  wrap.appendChild(stepBar(s));

  // top bar: title + room path (no narration)
  const top = el("div", { class: "story-top" });
  top.appendChild(el("span", { class: "story-title" }, exp.deckName));
  top.appendChild(el("span", { class: "story-path" }, `Scene ${exp.current + 1}/${exp.rooms.length}`));
  wrap.appendChild(top);

  // scene area: sprite + zone
  const scene = el("div", { class: "story-scene" });
  const actor = s.players.find((p) => p.id === exp.storyActor);
  if (actor) {
    const slot = el("div", { class: "story-hero" });
    mountSprite(slot, actor.classId || "warrior", "idle-1", intSpriteScale(5));
    slot.appendChild(el("div", { class: "pname-tag" }, actor.name));
    scene.appendChild(slot);
  }
  // approach cards (CHOOSE step: display-only)
  if (exp.step === "choose" && exp.storyChoices) {
    const cards = el("div", { class: "approach-cards" });
    exp.storyChoices.forEach((c, i) => {
      cards.appendChild(el("div", { class: "approach-card" },
        el("div", { class: "approach-num" }, String(i + 1)),
        el("div", { class: "approach-label" }, c.label),
        el("div", { class: "approach-stat" }, classNameStat(c.stat)),
      ));
    });
    scene.appendChild(cards);
  }
  // ROLL: big d20 + Spark count
  if (exp.step === "roll" && exp.lastRoll) {
    const r = exp.lastRoll;
    const roll = el("div", { class: "story-roll" });
    const face = el("div", { class: "d20-face d20-big" + (r.crit ? " d20-crit" : ""), style: `font-size:${px(64)}` }, String(r.d20));
    if (!REDUCED) { face.classList.add("d20-rolling"); setTimeout(() => face.classList.remove("d20-rolling"), 700); }
    roll.appendChild(face);
    const spark = el("div", { class: "spark-count" }, `Spark ${s.party.score}`);
    roll.appendChild(spark);
    scene.appendChild(roll);
  }
  wrap.appendChild(scene);

  // dialogue box (typewriter, latest narration)
  if (exp.log.length && exp.log[0] && exp.log[0].text) {
    const dlg = el("div", { class: "story-dialogue" });
    const tw = typewriterText(exp.log[0].text, { speed: 18 });
    dlg.appendChild(tw);
    dlg.setAttribute("data-narration", exp.log[0].text);
    wrap.appendChild(dlg);
  }
  return wrap;
}

function classNameStat(stat) {
  return { might: "Might", agility: "Agility", mind: "Mind", heart: "Heart" }[stat] || stat;
}

// ---------- Combat / challenge / trap / other ----------
function renderCombat(s, room) {
  const exp = s.expedition;
  const battle = el("div", { class: "battle" });
  battle.appendChild(stepBar(s));

  const field = el("div", { class: "battle-field" });
  const map = el("div", { class: "stage-map" });
  map.appendChild(el("div", { class: "map-title" }, exp.deckName || exp.deckId));
  const nodes = el("div", { class: "map-nodes" });
  exp.rooms.forEach((r, i) => {
    const cls = "map-node" + (i === exp.current ? " current" : "") + (r.kind === "combat" && r.boss ? " boss" : "");
    nodes.appendChild(el("span", { class: cls, title: r.kind }, String(i + 1)));
  });
  map.appendChild(nodes);
  field.appendChild(map);

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
    menu.appendChild(el("span", { class: "prompt" }, exp.langPrompt.text));
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
      el("span", {}, r.assistBonus ? ` + story ${r.assistBonus}` : ""),
      el("span", {}, ` = ${r.total} vs ${r.difficulty}`),
      el("span", { class: r.crit ? "roll-crit" : r.success ? "roll-success" : "roll-fail" }, ` → ${res}`),
    );
    rollWrap.appendChild(line);
    menu.appendChild(rollWrap);
  }
  battle.appendChild(menu);

  if (exp.log.length && exp.log[0] && exp.log[0].text) {
    const tw = el("div", { class: "typewriter-wrap" });
    tw.appendChild(typewriterText(exp.log[0].text, { speed: 18 }));
    tw.setAttribute("data-narration", exp.log[0].text);
    battle.appendChild(tw);
  }
  return battle;
}

// ---------- Recap ----------
function renderRecap(s) {
  const won = s.phase === "victory";
  const wrap = el("div", { class: "title-screen" });
  wrap.appendChild(el("h1", { class: "title-logo " + (won ? "win" : "lose") }, won ? "STORY COMPLETE!" : "STORY OVER"));
  wrap.appendChild(el("div", { class: "title-sub" }, won
    ? `The whole class wins! Spark ${s.party.score}`
    : `The party lives to try again. Spark ${s.party.score}`));
  if (won) audio.playSfx("victory");
  return wrap;
}
