// Pure view derivation: ONE source of truth for what the GM and Stage show.
// Both UIs render ONLY from getView()/getStageView(), never reading the log.
import { getContent } from "./content.js";

export const STEPS = ["listen", "choose", "sayit", "roll", "result"];
export const STEP_INDEX = { listen: 0, choose: 1, sayit: 2, roll: 3, result: 4 };
export const STEP_LABEL = { listen: "LISTEN", choose: "CHOOSE", sayit: "SAY IT", roll: "ROLL", result: "RESULT" };

export function currentStep(state) {
  const exp = state.expedition;
  if (!exp) return null;
  if (exp.mode === "episode") {
    if (exp.roomStatus === "story") return exp.step || "listen";
    if (exp.roomStatus === "cleared" || exp.roomStatus === "defeat") return "result";
    return currentCombatStep(state);
  }
  return currentCombatStep(state);
}

function currentCombatStep(state) {
  const exp = state.expedition;
  if (!exp) return null;
  if (exp.actionPhase === "choosing") return "choose";
  if (exp.actionPhase === "acting") return "sayit";
  if (exp.lastRoll) return "roll";
  return "listen";
}

function alive(state) {
  return state.players.filter((p) => p.hp > 0);
}

function aliveHumans(state) {
  return state.players.filter((p) => !p.npc && p.hp > 0);
}

function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}

function statMod(state, playerId, stat) {
  const p = playerById(state, playerId);
  if (!p) return 0;
  const cls = getContent().classes.find((c) => c.id === p.classId);
  if (!cls) return 0;
  return (cls.stats[stat] || 0) - 3;
}

function currentRoom(state) {
  const exp = state.expedition;
  if (!exp || !exp.rooms) return null;
  return exp.rooms[exp.current] || null;
}

// Build the 3 cards shown at CHOOSE. Story scenes carry 3-4 choices; show up
// to 3 in a stable order (seeded by scene only, so it does not reshuffle on
// every action). A teacher reshuffle is an M3 action that bumps the seed.
function buildCards(state, room, showHint) {
  const exp = state.expedition;
  const all = (room.event && room.event.choices) || [];
  if (all.length === 0) return [];
  // stable seed per (scene, reshuffleCount) so cards are fixed between actions
  let seed = (exp.current * 31 + (exp.reshuffle || 0) * 7 + 13) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  // deterministic pick of up to 3 (shuffle the pool, take 3)
  const pool = all.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, 3);
  const letters = ["A", "B", "C"];
  const actor = exp.storyActor ? playerById(state, exp.storyActor) : (exp.activePlayerId ? playerById(state, exp.activePlayerId) : null);
  return picked.map((c, i) => ({
    key: letters[i],
    id: c.id,
    label: c.label || c.text,
    kind: c.kind || "think",
    stat: c.stat || "wits",
    stars: c.difficulty,
    starter: c.starter || "",
    target: showHint ? c.target : null,
    example: showHint ? c.example : null,
    bonusForActor: actor ? statMod(state, actor.id, c.stat || "wits") : 0,
  }));
}

function buildParty(state) {
  const exp = state.expedition;
  if (!exp) return [];
  const activeId = exp.storyActor || exp.activePlayerId;
  const names = new Set(["wizard", "rogue", "warrior", "cleric", "bard", "ranger"]);
  return state.players.map((p) => ({
    id: p.id,
    name: p.name,
    classId: p.classId,
    npc: !!p.npc,
    hp: p.hp,
    maxHp: p.maxHp,
    active: p.id === activeId,
    actor: p.id === (exp.storyActor || exp.activePlayerId),
    classIcon: names.has(p.classId) ? p.classId : (p.classId || "default"),
  }));
}

function itemsOf(state) {
  const exp = state.expedition;
  if (!exp) return [];
  return (exp.items || []).map((it) => (typeof it === "string" ? { id: it, label: it } : it));
}

export function getView(state) {
  const exp = state.expedition;
  const phase = state.phase;
  const room = currentRoom(state);
  const ev = room && room.event ? room.event : {};
  const isStory = exp && exp.mode === "episode" && ev && ev.type === "story";
  const step = currentStep(state) || "listen";
  const sceneIndex = exp ? exp.current : 0;
  const sceneCount = exp && exp.rooms ? exp.rooms.length : 0;
  const showHints = state.settings && state.settings.startersOnStage !== false;

  const read = isStory
    ? (step === "result" && exp.outcome ? (exp.outcome.text || "") + (exp.outcome.bridge ? " " + exp.outcome.bridge : "") : (ev.read || room.flavour || ""))
    : (ev.scenePrompt && ev.scenePrompt.text ? ev.scenePrompt.text : (room && room.flavour) || "");

  let ask = "";
  if (step === "sayit" && exp.langPrompt && exp.langPrompt.text) ask = exp.langPrompt.text;
  else if (isStory) ask = ev.ask || "";

  let actor = null;
  if (exp) {
    const aId = exp.storyActor || exp.activePlayerId;
    if (aId) {
      const p = playerById(state, aId);
      if (p) actor = { id: p.id, name: p.name, classId: p.classId, npc: !!p.npc, hp: p.hp, maxHp: p.maxHp };
    }
  }

  const cards = step === "choose" ? buildCards(state, room, showHints) : [];

  const hints = {};
  if (step === "sayit" && exp.langPrompt) {
    if (showHints) {
      if (exp.langPrompt.target) hints.target = exp.langPrompt.target;
      if (exp.langPrompt.example) hints.example = exp.langPrompt.example;
    }
  }

  const roll = exp && exp.lastRoll ? {
    d20: exp.lastRoll.d20,
    mod: exp.lastRoll.mod,
    langBonus: exp.lastRoll.langBonus,
    assistBonus: exp.lastRoll.assistBonus,
    total: exp.lastRoll.total,
    difficulty: exp.lastRoll.difficulty,
    success: exp.lastRoll.success,
    crit: exp.lastRoll.crit,
    fumble: exp.lastRoll.fumble,
  } : null;

  let tip = "";
  if (isStory) {
    if (step === "listen") tip = ev.ask ? `Ask the class: ${ev.ask}` : "Read this aloud, then ask the class what they do.";
    else if (step === "choose") tip = "Ask the class: which approach?";
    else if (step === "sayit") tip = "Hear the class's sentence, then grade it.";
    else if (step === "roll") tip = "Press Space to roll the d20.";
    else if (step === "result") tip = "Share the outcome, then go to the next scene.";
  } else if (exp) {
    if (step === "choose") tip = exp.monster ? `${exp.monster.name} is here. Pick a skill.` : "Pick a skill or attack.";
    else if (step === "sayit") tip = "Hear the sentence, then grade it.";
  }

  return {
    step,
    stepIndex: STEP_INDEX[step] ?? 0,
    title: (room && room.name) || ev.title || "",
    goal: exp ? exp.goal || "" : "",
    chapters: exp && exp.rooms ? exp.rooms.map((r, i) => ({ id: r.id, name: r.name, done: i < sceneIndex, current: i === sceneIndex })) : [],
    read,
    ask,
    cards,
    actor,
    party: buildParty(state),
    items: itemsOf(state),
    spark: state.party ? state.party.score : 0,
    assistBonus: exp ? exp.assistBonus || 0 : 0,
    assistUsed: exp ? exp.assistUsed || [] : [],
    roll: step === "roll" ? null : roll,
    outcome: exp && exp.outcome ? { success: exp.outcome.success, crit: exp.outcome.crit, fumble: exp.outcome.fumble, text: exp.outcome.text, item: exp.outcome.item, bridge: exp.outcome.bridge } : null,
    hints,
    tip,
    mode: exp ? exp.mode : null,
    roomStatus: exp ? exp.roomStatus : null,
    isStory,
    phase,
    sceneIndex,
    sceneCount,
    monster: exp && exp.monster ? { name: exp.monster.name, hp: exp.monster.hp, maxHp: exp.monster.maxHp } : null,
    pending: exp && exp.pending ? { playerId: exp.pending.playerId, stat: exp.pending.stat, difficulty: exp.pending.difficulty, kind: exp.pending.kind } : null,
  };
}

// The Stage must never see teacher hints (target/example).
export function getStageView(state) {
  const v = getView(state);
  return {
    ...v,
    hints: {},
    cards: v.cards.map((c) => ({ key: c.key, id: c.id, label: c.label, kind: c.kind, stat: c.stat, stars: c.stars, starter: c.starter, bonusForActor: c.bonusForActor })),
  };
}
