// Stage view (v2 + B1.5 + PART 1B + M2): fixed 16:9 virtual canvas, letterboxed,
// integer sprite scaling, pixelated. Renders ONLY from getStageView(state) —
// never reads the expedition log. Side effects (audio, typewriter) fire only on
// a change of (step, scene, rev), never on resize.
import { getState, subscribe } from "../engine/state.js";
import { getContent } from "../engine/content.js";
import { getStageView } from "../engine/view.js";
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
function px(v) { return `calc(${v}px * var(--ss))`; }

// last known step/scene/rev to gate side effects (D8)
let lastFx = { step: null, scene: -1, rev: -1 };

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
    const ro = new ResizeObserver(() => { measureStage(); });
    ro.observe(rootEl);
  } else {
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => measureStage(), 120);
    });
  }
}

function className(id) {
  const c = getContent().classes.find((x) => x.id === id);
  return c ? c.name : "?";
}

function classNameStat(stat) {
  return { might: "Might", agility: "Agility", mind: "Mind", heart: "Heart" }[stat] || stat;
}

function render() {
  const state = getState();
  if (!rootEl) return;
  measureStage();
  const v = getStageView(state);
  // fire one-shot effects only when the step, scene or revision changed (D8)
  const fxKey = v.step + "|" + v.sceneIndex + "|" + (state.rev || 0);
  if (fxKey !== lastFx.key) {
    if (v.roll) {
      if (v.roll.crit) audio.playSfx("crit");
      else if (v.roll.fumble) audio.playSfx("fumble");
      else if (v.roll.success) audio.playSfx("hit");
    }
    lastFx = { key: fxKey, step: v.step, scene: v.sceneIndex, rev: state.rev || 0 };
  }
  rootEl.innerHTML = "";
  if (state.phase === "lobby") { rootEl.appendChild(renderTitle(state)); return; }
  if (state.phase === "victory" || state.phase === "defeated") { rootEl.appendChild(renderRecap(state)); return; }
  rootEl.appendChild(renderPlay(v, state));
}

function stepBar(v) {
  const barEl = el("div", { class: "step-bar" });
  const STEPS = ["listen", "choose", "sayit", "roll", "result"];
  const LABEL = { listen: "LISTEN", choose: "CHOOSE", sayit: "SAY IT", roll: "ROLL", result: "RESULT" };
  for (const st of STEPS) {
    barEl.appendChild(el("span", { class: "step" + (st === v.step ? " current" : "") + (STEPS.indexOf(st) < v.stepIndex ? " done" : "") }, LABEL[st]));
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
function renderPlay(v, s) {
  if (v.roomStatus === "story") return renderStory(v, s);
  return renderCombat(v, s);
}

// ---------- Story layout (episode story scenes) ----------
function renderStory(v, s) {
  const wrap = el("div", { class: "story" });
  wrap.appendChild(stepBar(v));

  const top = el("div", { class: "story-top" });
  top.appendChild(el("span", { class: "story-title" }, v.title || v.goal || "Story"));
  top.appendChild(el("span", { class: "story-path" }, `Scene ${v.sceneIndex + 1}/${v.sceneCount}`));
  wrap.appendChild(top);

  const scene = el("div", { class: "story-scene" });
  const actor = s.players.find((p) => p.id === (v.actor ? v.actor.id : null));
  if (actor) {
    const slot = el("div", { class: "story-hero" });
    mountSprite(slot, actor.classId || "warrior", "idle-1", intSpriteScale(5));
    slot.appendChild(el("div", { class: "pname-tag" }, actor.name));
    scene.appendChild(slot);
  }
  // approach cards (CHOOSE step: display-only)
  if (v.step === "choose" && v.cards.length) {
    const cards = el("div", { class: "approach-cards" });
    v.cards.forEach((c) => {
      cards.appendChild(el("div", { class: "approach-card" },
        el("div", { class: "approach-num" }, c.key),
        el("div", { class: "approach-label" }, c.label),
        el("div", { class: "approach-stat" }, classNameStat(c.stat)),
      ));
    });
    scene.appendChild(cards);
  }
  // ROLL: big d20 + Spark count
  if (v.step === "roll" && v.roll) {
    const roll = el("div", { class: "story-roll" });
    const face = el("div", { class: "d20-face d20-big" + (v.roll.crit ? " d20-crit" : ""), style: `font-size:${px(64)}` }, String(v.roll.d20));
    if (!REDUCED) { face.classList.add("d20-rolling"); setTimeout(() => face.classList.remove("d20-rolling"), 700); }
    roll.appendChild(face);
    const spark = el("div", { class: "spark-count" }, `Spark ${v.spark}`);
    roll.appendChild(spark);
    scene.appendChild(roll);
  }
  wrap.appendChild(scene);

  // dialogue box = the scene's read text (D3: never the log line)
  if (v.read) {
    const dlg = el("div", { class: "story-dialogue" });
    dlg.appendChild(typewriterText(v.read, { speed: 18 }));
    dlg.setAttribute("data-narration", v.read);
    wrap.appendChild(dlg);
  }
  return wrap;
}

// ---------- Combat / challenge / trap / other ----------
function renderCombat(v, s) {
  const exp = s.expedition;
  const battle = el("div", { class: "battle" });
  battle.appendChild(stepBar(v));

  const field = el("div", { class: "battle-field" });
  const map = el("div", { class: "stage-map" });
  map.appendChild(el("div", { class: "map-title" }, v.title || exp.deckName || exp.deckId));
  const nodes = el("div", { class: "map-nodes" });
  exp.rooms.forEach((r, i) => {
    const cls = "map-node" + (i === v.sceneIndex ? " current" : "") + (r.kind === "combat" && r.boss ? " boss" : "");
    nodes.appendChild(el("span", { class: cls, title: r.kind }, String(i + 1)));
  });
  map.appendChild(nodes);
  field.appendChild(map);

  if (v.monster) {
    const en = el("div", { class: "battle-enemies" });
    const slot = el("div", { class: "enemy-slot" });
    const key = (exp.monster && exp.monster.id) || "grumble-slime";
    const frame = v.monster.hp === 0 ? "down" : "idle-1";
    mountSprite(slot, key, frame, exp.monster && exp.monster.boss ? intSpriteScale(2) : intSpriteScale(4));
    slot.appendChild(el("div", { class: "pname-tag" }, v.monster.name));
    slot.appendChild(bar(v.monster.hp, v.monster.maxHp, "hp"));
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
    if (v.actor && p.id === v.actor.id) slot.classList.add("acting");
    party.appendChild(slot);
  }
  field.appendChild(party);
  battle.appendChild(field);

  // bottom menu window
  const menu = el("div", { class: "battle-menu" });
  if (v.step === "sayit" && v.ask) {
    menu.appendChild(el("span", { class: "cmd-label" }, "Say it:"));
    menu.appendChild(el("span", { class: "prompt" }, v.ask));
  } else if (v.step === "choose" && v.actor && v.roomStatus !== "story") {
    menu.appendChild(el("span", { class: "cmd-label" }, `${v.actor.name} (${className(v.actor.classId)}) — your turn:`));
    // NOTE: D2 (skills as clickable buttons) is fixed in M4; here non-interactive labels only.
    const cls = getContent().classes.find((c) => c.id === v.actor.classId);
    const labels = el("div", { class: "cmd-labels" });
    labels.appendChild(el("span", { class: "cmd" }, "Basic attack (free)"));
    for (const sid of (cls ? cls.skillIds : [])) {
      const sk = getContent().skills.find((x) => x.id === sid);
      labels.appendChild(el("span", { class: "cmd" }, `${sk ? sk.name : "skill"} (${sk ? sk.cost : 0} F)`));
    }
    menu.appendChild(labels);
  } else if (v.roomStatus === "cleared") {
    menu.appendChild(el("span", { class: "muted" }, "Room cleared — wait for the teacher."));
  } else if (v.roomStatus === "defeat") {
    menu.appendChild(el("span", { class: "roll-fail" }, "The party is overwhelmed..."));
  } else if (v.read) {
    menu.appendChild(el("span", { class: "muted" }, v.read));
  }

  if (v.roll) {
    const r = v.roll;
    const rollWrap = el("div", { class: "d20-stage" });
    const face = el("div", { class: "d20-face" + (r.crit ? " d20-crit" : "") }, String(r.d20));
    if (!REDUCED) { face.classList.add("d20-rolling"); setTimeout(() => face.classList.remove("d20-rolling"), 700); }
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
