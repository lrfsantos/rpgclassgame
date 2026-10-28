// All mutating game actions. Only the GM console calls these.
import { mutate, getState, undo, newGameState } from "./state.js";
import { getContent } from "./content.js";
import { generateExpedition } from "./expedition.js";
import { buildEpisodeExpedition } from "./episode.js";
import { Dice, newSeed } from "./rng.js";

const BASE_DIFFICULTY = 10;

// ---------- helpers ----------

function statMod(player, stat) {
  const cls = getContent().classes.find((c) => c.id === player.classId);
  if (!cls) return 0;
  return (cls.stats[stat] || 0) - 3;
}

function rollDice(dice, str) {
  const m = /^(\d*)d(\d+)$/.exec(str || "d4");
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  let total = 0;
  for (let i = 0; i < count; i++) total += dice.roll(sides);
  return total;
}

function humans(s) {
  return s.players.filter((p) => !p.npc);
}

function aliveHumans(s) {
  return s.players.filter((p) => !p.npc && p.hp > 0);
}

function allAlive(s) {
  return s.players.filter((p) => p.hp > 0);
}

function playerById(s, id) {
  return s.players.find((p) => p.id === id);
}

function currentRoom(s) {
  return s.expedition.rooms[s.expedition.current];
}

function log(s, text, kind = "system") {
  s.expedition.log.unshift({ text, kind, t: Date.now() });
  // episodes are stories: keep the whole transcript (combat can push past 60)
  const cap = s.expedition.mode === "episode" ? 400 : 60;
  if (s.expedition.log.length > cap) s.expedition.log.length = cap;
}

function pickNarration(s, key, vars = {}) {
  const list = getContent().narrations[key] || [];
  if (list.length === 0) return "";
  let text = new Dice(newSeed()).pick(list);
  for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

function monsterDifficulty(s) {
  const m = s.expedition.monster;
  if (!m) return BASE_DIFFICULTY;
  return m.difficulty - (s.expedition.monsterWeaken > 0 ? 2 : 0);
}

function pickLangPrompt(s) {
  const pool = getContent().vocabPrompts.filter((p) => !s.expedition.usedPromptIds.includes(p.id));
  const dice = new Dice(newSeed());
  const prompt = dice.pick(pool.length ? pool : getContent().vocabPrompts);
  if (s.expedition.usedPromptIds.length >= getContent().vocabPrompts.length) s.expedition.usedPromptIds = [];
  s.expedition.usedPromptIds.push(prompt.id);
  return prompt;
}

// ---------- lobby ----------

export function addPlayer(name) {
  return mutate((s) => {
    if (s.phase !== "lobby" || s.players.length >= 12) return s;
    const dice = new Dice(newSeed());
    const finalName = (name || "").trim() || dice.pick(getContent().playerNames);
    s.players.push({
      id: `p-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name: finalName,
      classId: null,
      npc: false,
      hp: 0, maxHp: 0, focus: 0, maxFocus: 0,
    });
    return s;
  });
}

// Add a player with a class in one step; blank name/class = random.
export function addPlayerWithClass(name, classId) {
  return mutate((s) => {
    if (s.phase !== "lobby" || s.players.length >= 12) return s;
    const dice = new Dice(newSeed());
    const finalName = (name || "").trim() || dice.pick(getContent().playerNames);
    const cls = classId ? getContent().classes.find((c) => c.id === classId) : dice.pick(getContent().classes);
    if (!cls) return s;
    s.players.push({
      id: `p-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name: finalName,
      classId: cls.id,
      npc: false,
      hp: cls.maxHp, maxHp: cls.maxHp, focus: cls.maxFocus, maxFocus: cls.maxFocus,
    });
    return s;
  });
}

export function removePlayer(id) {
  return mutate((s) => {
    if (s.phase !== "lobby") return s;
    s.players = s.players.filter((p) => p.id !== id);
    return s;
  });
}

export function setPlayerClass(id, classId) {
  return mutate((s) => {
    if (s.phase !== "lobby") return s;
    const cls = getContent().classes.find((c) => c.id === classId);
    const p = s.players.find((x) => x.id === id && !x.npc);
    if (!cls || !p) return s;
    p.classId = cls.id;
    p.maxHp = cls.maxHp;
    p.maxFocus = cls.maxFocus;
    p.hp = cls.maxHp;
    p.focus = cls.maxFocus;
    return s;
  });
}

export function randomizePlayerNames() {
  return mutate((s) => {
    if (s.phase !== "lobby") return s;
    const shuffled = new Dice(newSeed()).shuffle(getContent().playerNames);
    s.players.filter((p) => !p.npc).forEach((p, i) => {
      p.name = shuffled[i % shuffled.length];
    });
    return s;
  });
}

// ---------- settings (teacher tools, engine-side) ----------

export function setSettings(patch) {
  return mutate((s) => {
    if (!s.settings) s.settings = { languageCheck: "full", spotlight: 4, npcCompanion: false };
    if (patch.languageCheck !== undefined) s.settings.languageCheck = patch.languageCheck;
    if (patch.spotlight !== undefined) s.settings.spotlight = Math.max(1, Math.min(12, patch.spotlight));
    if (patch.npcCompanion !== undefined) s.settings.npcCompanion = !!patch.npcCompanion;
    return s;
  });
}

// ---------- expedition ----------

export function startExpedition() {
  return mutate((s) => {
    if (s.phase !== "lobby") return s;
    if (s.players.length === 0 || s.players.some((p) => !p.classId)) return s;
    s.phase = "expedition";
    s.party = { score: 0, gold: 0 };
    s.expedition = generateExpedition();
    s.expedition.log = [];
    s.expedition.monster = null;
    s.expedition.round = 1;
    s.expedition.roundStart = 0;
    s.expedition.spotlight = [];
    s.expedition.spotlightIndex = 0;
    s.expedition.activePlayerId = null;
    s.expedition.actionPhase = "idle";
    s.expedition.pending = null;
    s.expedition.langPrompt = null;
    s.expedition.langBonus = 0;
    s.expedition.assistBonus = 0;
    s.expedition.assistUsed = [];
    s.expedition.lastRoll = null;
    s.expedition.lastAction = null;
    s.expedition.guard = 0;
    s.expedition.monsterSkip = 0;
    s.expedition.monsterWeaken = 0;
    s.expedition.buff = 0;
    s.expedition.challengeIndex = 0;
    s.expedition.usedPromptIds = [];
    s.expedition.npcId = null;

    log(s, pickNarration(s, "expeditionStart", { deck: s.expedition.deckName }), "system");
    maybeAddNpc(s);
    enterCurrentRoom(s);
    return s;
  });
}

// ---------- episode (story mode) ----------

export function startEpisode(episodeId) {
  return mutate((s) => {
    if (s.phase !== "lobby") return s;
    if (s.players.length === 0 || s.players.some((p) => !p.classId)) return s;
    const ep = getContent().episodes.find((e) => e.id === episodeId);
    if (!ep) return s;
    s.phase = "expedition";
    s.party = { score: 0, gold: 0 };
    s.expedition = buildEpisodeExpedition(ep);
    s.expedition.log = [];
    s.expedition.monster = null;
    s.expedition.round = 1;
    s.expedition.roundStart = 0;
    s.expedition.spotlight = [];
    s.expedition.spotlightIndex = 0;
    s.expedition.activePlayerId = null;
    s.expedition.actionPhase = "idle";
    s.expedition.pending = null;
    s.expedition.langPrompt = null;
    s.expedition.langBonus = 0;
    s.expedition.assistBonus = 0;
    s.expedition.assistUsed = [];
    s.expedition.lastRoll = null;
    s.expedition.lastAction = null;
    s.expedition.guard = 0;
    s.expedition.monsterSkip = 0;
    s.expedition.monsterWeaken = 0;
    s.expedition.buff = 0;
    s.expedition.challengeIndex = 0;
    s.expedition.usedPromptIds = [];
    s.expedition.npcId = null;
    s.expedition.mode = "episode";
    s.expedition.flags = {};
    s.expedition.step = "listen";
    s.expedition.storyChoices = null;
    s.expedition.storyChoiceId = null;
    s.expedition.storyActor = null;
    s.expedition.storyDiffBonus = 0;

    log(s, `${ep.name}: ${ep.flavour}`, "system");
    maybeAddNpc(s);
    enterCurrentRoom(s);
    return s;
  });
}

// ---------- episode story steps (LISTEN -> CHOOSE -> SAY IT -> ROLL -> RESULT) ----------

// GM primary button. Behavior depends on the current step.
export function storyContinue() {
  return mutate((s) => {
    const exp = s.expedition;
    if (!exp || exp.mode !== "episode") return s;
    if (exp.step === "listen" && exp.roomStatus === "story") {
      // choose a rotating actor for this scene
      const alive = aliveHumans(s);
      if (alive.length === 0) return s;
      exp.storyActor = alive[exp.challengeIndex % alive.length].id;
      exp.step = "choose";
      log(s, `${playerById(s, exp.storyActor).name} picks the approach.`, "system");
    } else if (exp.step === "roll" && exp.roomStatus === "story") {
      applyStoryOutcome(s);
      exp.step = "result";
    } else if (exp.step === "result" || ["cleared", "defeat"].includes(exp.roomStatus)) {
      advanceAfterRoom(s, "cleared");
    }
    return s;
  });
}

// CHOOSE: pick one approach card (keys 1-4). Sets the pending roll.
export function chooseStoryApproach(choiceId) {
  return mutate((s) => {
    const exp = s.expedition;
    const room = currentRoom(s);
    if (!exp || exp.mode !== "episode" || exp.roomStatus !== "story" || exp.step !== "choose") return s;
    const choice = (room.event.choices || []).find((c) => c.id === choiceId);
    if (!choice) return s;
    exp.storyChoiceId = choiceId;
    exp.pending = {
      playerId: exp.storyActor,
      choiceId,
      stat: choice.stat,
      difficulty: choice.difficulty + (exp.storyDiffBonus || 0),
      kind: "story",
      effect: "room",
    };
    exp.langPrompt = { text: choice.text, target: choice.target, example: choice.example };
    exp.langBonus = 0;
    exp.assistBonus = 0;
    exp.step = "sayit";
    log(s, `Say it! ${choice.text}`, "language");
    return s;
  });
}

// SAY IT: teacher grades Weak(0)/Good(2)/Great(4) with keys 1/2/3. Rolls the d20.
export function gradeStory(bonus) {
  return mutate((s) => {
    const exp = s.expedition;
    if (!exp || exp.mode !== "episode" || exp.roomStatus !== "story" || exp.step !== "sayit") return s;
    exp.langBonus = bonus;
    exp.langPrompt = null;
    const room = currentRoom(s);
    const choice = (room.event.choices || []).find((c) => c.id === exp.storyChoiceId) || {};
    const actor = playerById(s, exp.pending.playerId);
    const good = bonus >= 2;
    if (choice.onGood && good) log(s, choice.onGood, "challenge");
    else if (choice.onBad && !good) log(s, choice.onBad, "challenge");
    if (good && choice.flag) exp.flags[choice.flag] = true;
    // roll the d20 (shown during ROLL step)
    resolveStoryRoll(s);
    exp.step = "roll";
    return s;
  });
}

function resolveStoryRoll(s) {
  const exp = s.expedition;
  const p = exp.pending;
  if (!p) return;
  const actor = playerById(s, p.playerId);
  const dice = new Dice(newSeed());
  const d20 = dice.roll(20);
  const mod = statMod(actor, p.stat);
  const total = d20 + mod + exp.langBonus + exp.assistBonus;
  const crit = d20 === 20;
  const fumble = d20 === 1;
  const success = crit ? true : fumble ? false : total >= p.difficulty;
  exp.lastRoll = { playerId: p.playerId, d20, mod, langBonus: exp.langBonus, assistBonus: exp.assistBonus, total, difficulty: p.difficulty, success, crit, fumble, kind: "story", effect: "room" };
  const verb = `${actor.name} rolls ${d20} (+${mod}${exp.langBonus ? ` lang ${exp.langBonus}` : ""}${exp.assistBonus ? ` assist ${exp.assistBonus}` : ""}) = ${total} vs ${p.difficulty}`;
  if (crit) log(s, `${verb} - CRIT! ${pickNarration(s, "crit", {})}`, "combat");
  else if (fumble) log(s, `${verb} - ${pickNarration(s, "fumble", {})}`, "combat");
  else log(s, `${verb} - ${success ? "success!" : "fail."}`, "combat");
}

function applyStoryOutcome(s) {
  const exp = s.expedition;
  const r = exp.lastRoll;
  if (!r) return;
  if (r.success) {
    s.party.score += (r.crit ? 6 : 4);
    log(s, `Spark +${r.crit ? 6 : 4} — the story moves forward.`, "challenge");
  } else {
    s.party.score += 1;
    log(s, `Spark +1 — a stumble, but the story continues.`, "challenge");
  }
  exp.roomStatus = "cleared";
  exp.activePlayerId = null;
  exp.actionPhase = "idle";
  exp.challengeIndex += 1;
}

function maybeAddNpc(s) {
  const hs = humans(s);
  const wantNpc = s.settings.npcCompanion || hs.length <= 2;
  if (!wantNpc || s.players.some((p) => p.npc)) return;
  const hasCleric = hs.some((p) => p.classId === "cleric");
  const npcClass = hasCleric ? "warrior" : "cleric";
  const cls = getContent().classes.find((c) => c.id === npcClass);
  const npc = {
    id: "npc",
    name: getContent().npcNames[0],
    classId: npcClass,
    npc: true,
    maxHp: cls.maxHp, hp: cls.maxHp,
    maxFocus: cls.maxFocus, focus: cls.maxFocus,
  };
  s.players.push(npc);
  s.expedition.npcId = "npc";
  log(s, `${npc.name} joins the party to help!`, "system");
}

function enterCurrentRoom(s) {
  const room = currentRoom(s);
  const ev = room.event;
  s.expedition.actionPhase = "idle";
  s.expedition.pending = null;
  s.expedition.langPrompt = null;
  s.expedition.langBonus = 0;
  s.expedition.assistBonus = 0;
  s.expedition.assistUsed = [];
  s.expedition.lastRoll = null;
  // reset story-scene state so a combat/other room never shows stale cards
  s.expedition.storyChoices = null;
  s.expedition.storyChoiceId = null;
  s.expedition.storyActor = null;
  s.expedition.storyDiffBonus = 0;

  // episode conditional scenes: resolve difficulty/flavour from flags at entry
  if (ev.conditional) {
    const branch = s.expedition.flags && s.expedition.flags[ev.conditional.flag] ? ev.conditional.whenSet : ev.conditional.whenUnset;
    if (branch) {
      if (Number.isFinite(branch.difficulty)) ev.difficulty = branch.difficulty;
      if (Number.isFinite(branch.difficultyBonus)) s.expedition.storyDiffBonus = branch.difficultyBonus;
      if (branch.flavour) room.flavour = branch.flavour;
    }
  }

  if (ev.type === "story") {
    s.expedition.roomStatus = "story";
    s.expedition.step = "listen";
    s.expedition.storyChoices = ev.choices;
    s.expedition.storyChoiceId = null;
    s.expedition.storyActor = null;
    s.expedition.lastRoll = null;
    log(s, room.flavour, "system");
    return;
  }

  if (ev.type === "combat") {
    if (aliveHumans(s).length === 0) {
      s.expedition.roomStatus = "cleared";
      log(s, "Everyone is dazed — the party retreats through this room.", "combat");
      return;
    }
    spawnMonster(s);
    s.expedition.round = 1;
    s.expedition.roundStart = 0;
    s.expedition.guard = 0;
    s.expedition.monsterSkip = 0;
    s.expedition.monsterWeaken = 0;
    s.expedition.buff = 0;
    buildSpotlight(s);
    s.expedition.spotlightIndex = 0;
    startActor(s);
  } else if (ev.type === "challenge" || ev.type === "trap") {
    s.expedition.roomStatus = ev.type;
    const alive = aliveHumans(s);
    if (alive.length > 0) {
      s.expedition.activePlayerId = alive[s.expedition.challengeIndex % alive.length].id;
      s.expedition.actionPhase = "choosing";
      const actor = playerById(s, s.expedition.activePlayerId);
      log(s, `${actor.name} faces the ${ev.type}!`, ev.type);
    } else {
      s.expedition.roomStatus = "cleared";
    }
  } else if (ev.type === "rest") {
    for (const p of s.players) { p.hp = p.maxHp; p.focus = p.maxFocus; }
    s.party.score += 2;
    s.expedition.roomStatus = "cleared";
    log(s, pickNarration(s, "rest", {}), "rest");
  } else if (ev.type === "treasure") {
    const gold = new Dice(newSeed()).int(6, 16);
    s.party.gold += gold;
    s.party.score += 4;
    s.expedition.roomStatus = "cleared";
    log(s, pickNarration(s, "treasure", {}), "treasure");
    log(s, `The party pockets ${gold} gold.`, "treasure");
  } else if (ev.type === "event") {
    s.party.score += 5;
    s.party.gold += 4;
    s.expedition.roomStatus = "cleared";
    log(s, pickNarration(s, "event", {}), "event");
    log(s, `Score +5, gold +4.`, "event");
  }
}

function spawnMonster(s) {
  const room = currentRoom(s);
  const t = room.event.monsterTemplate;
  const acting = Math.max(1, Math.min(allAlive(s).length, s.settings.spotlight || 4));
  const maxHp = t.hp + (acting - 1) * 5;
  s.expedition.monster = {
    id: t.id,
    name: room.event.monsterName,
    hp: maxHp, maxHp,
    difficulty: t.difficulty,
    damage: t.damage,
    score: t.score,
    quirk: t.quirk,
    vocabHint: t.vocabHint,
    boss: !!t.boss,
  };
  s.expedition.roomStatus = "combat";
  log(s, pickNarration(s, "monsterAppears", { monster: s.expedition.monster.name }), "combat");
  if (s.expedition.monster.quirk) log(s, `Quirk: ${s.expedition.monster.quirk}`, "combat");
}

// Fair spotlight rotation: everyone acts across rounds; only N per round.
function buildSpotlight(s) {
  const queue = allAlive(s).map((p) => p.id);
  const size = Math.max(1, Math.min(s.settings.spotlight, queue.length));
  if (queue.length === 0) { s.expedition.spotlight = []; return; }
  const start = s.expedition.roundStart % queue.length;
  const ids = [];
  for (let i = 0; i < size; i++) ids.push(queue[(start + i) % queue.length]);
  s.expedition.spotlight = ids;
}

function startActor(s) {
  const ids = s.expedition.spotlight;
  if (s.expedition.spotlightIndex >= ids.length) return;
  const id = ids[s.expedition.spotlightIndex];
  s.expedition.activePlayerId = id;
  s.expedition.actionPhase = "choosing";
  const p = playerById(s, id);
  log(s, `It's ${p.name}'s turn! (Round ${s.expedition.round})`, "combat");
  if (p && p.npc) resolveNpc(s);
}

function resolveNpc(s) {
  const npc = playerById(s, s.expedition.npcId);
  if (!npc || npc.hp <= 0) { advanceActor(s); return; }
  const m = s.expedition.monster;
  const hurt = aliveHumans(s).find((p) => p.hp < p.maxHp * 0.5);
  let skillId = null;
  if (npc.classId === "cleric" && hurt) skillId = "healing-word";
  s.expedition.lastAction = { playerId: npc.id, skillId };
  applyAction(s, npc.id, skillId, { skipLanguage: true });
}

// ---------- part 1 end ----------

// ---------- action resolution ----------

function langCheckEnabled(s) {
  const mode = s.settings.languageCheck;
  if (mode === "off") return false;
  if (mode === "full") return true;
  return new Dice(newSeed()).next() < 0.5; // light mode: sometimes
}

function buildPending(s, playerId, skillId) {
  const room = currentRoom(s);
  const actor = playerById(s, playerId);
  const cls = getContent().classes.find((c) => c.id === actor.classId);
  const skill = skillId ? getContent().skills.find((x) => x.id === skillId) : null;
  if (room.event.type === "combat") {
    if (skill) {
      return {
        playerId, skillId, stat: skill.stat, difficulty: monsterDifficulty(s), kind: "combat",
        effect: skill.effect, target: skill.target, damage: skill.damage, bonus: skill.bonus || 3,
        debuff: skill.debuff, steal: skill.steal, cost: skill.cost,
      };
    }
    return {
      playerId, skillId: null, stat: cls.basic.stat, difficulty: monsterDifficulty(s), kind: "combat",
      effect: "attack", target: "enemy", damage: cls.basic.damage, bonus: 0, debuff: null, steal: false, cost: 0,
    };
  }
  const ev = room.event;
  return {
    playerId, skillId, stat: ev.stat, difficulty: ev.difficulty, kind: room.event.type,
    effect: "room", target: "self", damage: null, bonus: 0, debuff: null, steal: false, cost: skill ? skill.cost : 0,
  };
}

// Lower-level: used by chooseAction and by rerollLast.
function applyAction(s, playerId, skillId, opts = {}) {
  const exp = s.expedition;
  const p = playerById(s, playerId);
  const skill = skillId ? getContent().skills.find((x) => x.id === skillId) : null;
  if (skill) p.focus -= skill.cost;
  exp.pending = buildPending(s, playerId, skillId);
  exp.assistBonus = opts.assistBonus || 0;
  exp.lastAction = { playerId, skillId, langBonus: opts.langBonus || 0, assistBonus: exp.assistBonus };
  if (opts.skipLanguage) {
    exp.actionPhase = "acting";
    exp.langBonus = opts.langBonus || 0;
    resolveRoll(s, exp.langBonus, exp.assistBonus, opts.forceD20 || null);
  } else {
    exp.actionPhase = "acting";
    exp.langPrompt = currentRoom(s).event.scenePrompt || pickLangPrompt(s);
    exp.langBonus = 0;
    log(s, `Say it! ${exp.langPrompt.text}`, "language");
  }
}

export function chooseAction(playerId, skillId) {
  return mutate((s) => {
    const exp = s.expedition;
    if (!exp || !["combat", "challenge", "trap"].includes(exp.roomStatus)) return s;
    if (exp.activePlayerId !== playerId || exp.actionPhase !== "choosing") return s;
    const p = playerById(s, playerId);
    if (!p || p.npc) return s;
    const skill = skillId ? getContent().skills.find((x) => x.id === skillId) : null;
    if (skill && (skill.classId !== p.classId || p.focus < skill.cost)) return s;
    applyAction(s, playerId, skillId, { skipLanguage: !langCheckEnabled(s) });
    return s;
  });
}

export function judgeLanguage(bonus) {
  return mutate((s) => {
    const exp = s.expedition;
    if (!exp || exp.actionPhase !== "acting" || !exp.langPrompt) return s;
    exp.langPrompt = null;
    exp.langBonus = bonus;
    if (exp.lastAction) exp.lastAction.langBonus = bonus;
    const actor = playerById(s, exp.pending.playerId);
    const key = bonus >= 4 ? "languageGood" : bonus >= 2 ? "languageMid" : "languageWeak";
    log(s, pickNarration(s, key, { player: actor.name }), "language");
    // episode story scenes: the English grade decides the narrated outcome + flags
    // (applies to story AND combat scenes that carry an onGood/onBad outcome)
    {
      const room = currentRoom(s);
      const scene = room.event.scene;
      const good = bonus >= 2;
      if (scene) {
        if (scene.onGood && good) log(s, scene.onGood, "challenge");
        else if (scene.onBad && !good) log(s, scene.onBad, "challenge");
        if (good && scene.flags) Object.assign(exp.flags || (exp.flags = {}), scene.flags);
      }
    }
    resolveRoll(s, bonus, exp.assistBonus, null);
    return s;
  });
}

export function grantAssist(assisterId) {
  return mutate((s) => {
    const exp = s.expedition;
    if (!exp || exp.actionPhase !== "acting" || !exp.pending) return s;
    if (exp.assistBonus >= 2 || exp.assistUsed.includes(assisterId)) return s;
    if (assisterId === exp.activePlayerId) return s;
    const a = playerById(s, assisterId);
    if (!a || a.npc) return s;
    // dazed players may still assist (they just cannot act)
    exp.assistUsed.push(assisterId);
    exp.assistBonus += 1;
    if (exp.lastAction) exp.lastAction.assistBonus = exp.assistBonus;
    log(s, `${a.name} assists with a word of advice (+1).`, "combat");
    return s;
  });
}

export function passAction(playerId) {
  return mutate((s) => {
    const exp = s.expedition;
    if (!exp || exp.actionPhase !== "choosing" || exp.activePlayerId !== playerId) return s;
    const p = playerById(s, playerId);
    if (!p) return s;
    log(s, `${p.name} passes.`, "combat");
    if (exp.roomStatus === "combat") advanceActor(s);
    else { exp.roomStatus = "cleared"; exp.activePlayerId = null; exp.actionPhase = "idle"; }
    return s;
  });
}

// ---------- part 2a end ----------

function lowestAlive(s) {
  const alive = allAlive(s).sort((a, b) => a.hp - b.hp);
  return alive[0];
}

function getSkillName(skillId) {
  const sk = getContent().skills.find((x) => x.id === skillId);
  return sk ? sk.name : "attack";
}

function resolveRoll(s, langBonus, assistBonus, forceD20) {
  const exp = s.expedition;
  const p = exp.pending;
  if (!p) return;
  const actor = playerById(s, p.playerId);
  const dice = new Dice(newSeed());
  const d20 = forceD20 || dice.roll(20);
  const mod = statMod(actor, p.stat);
  const total = d20 + mod + langBonus + assistBonus + exp.buff;
  exp.buff = 0;
  const difficulty = p.difficulty;
  const crit = d20 === 20;
  const fumble = d20 === 1;
  const success = crit ? true : fumble ? false : total >= difficulty;
  exp.lastRoll = { playerId: p.playerId, d20, mod, langBonus, assistBonus, total, difficulty, success, crit, fumble, kind: p.kind, effect: p.effect };
  const verb = `${actor.name} rolls ${d20} (+${mod}${langBonus ? ` lang ${langBonus}` : ""}${assistBonus ? ` assist ${assistBonus}` : ""}) = ${total} vs ${difficulty}`;
  if (crit) log(s, `${verb} - CRIT! ${pickNarration(s, "crit", {})}`, "combat");
  else if (fumble) log(s, `${verb} - ${pickNarration(s, "fumble", {})}`, "combat");
  else log(s, `${verb} - ${success ? "success!" : "fail."}`, "combat");

  if (p.kind === "challenge" || p.kind === "trap") {
    resolveRoomRoll(s, p, success, crit);
    return;
  }
  const m = exp.monster;
  if (!m) { advanceActor(s); return; }
  switch (p.effect) {
    case "attack": {
      if (success) {
        let dmg = rollDice(dice, p.damage) + Math.max(0, mod);
        if (crit) dmg += rollDice(dice, p.damage);
        if (p.steal) { const g = dice.int(1, 6); s.party.gold += g; log(s, `${actor.name} lifts ${g} gold!`, "combat"); }
        m.hp = Math.max(0, m.hp - dmg);
        log(s, `${actor.name} hits for ${dmg} damage!`, "combat");
        if (m.hp === 0) { onMonsterDown(s); return; }
      } else {
        log(s, `${actor.name}'s ${p.skillId ? getSkillName(p.skillId) : "attack"} misses.`, "combat");
      }
      break;
    }
    case "heal": {
      const amount = (success ? rollDice(dice, p.damage) + Math.max(0, mod) : 1) * (crit ? 2 : 1);
      if (p.target === "party") {
        let healed = 0;
        for (const a of allAlive(s)) { const b = a.hp; a.hp = Math.min(a.maxHp, a.hp + amount); healed += a.hp - b; }
        log(s, `${getSkillName(p.skillId)} restores ${healed} HP to the party.`, "combat");
      } else {
        const target = lowestAlive(s);
        if (target) { const b = target.hp; target.hp = Math.min(target.maxHp, target.hp + amount); log(s, `${target.name} recovers ${target.hp - b} HP.`, "combat"); }
      }
      break;
    }
    case "shield":
      if (success) { exp.guard += 1; log(s, "The party gains a guard (absorbs 1 hit).", "combat"); }
      break;
    case "buff":
      if (success) { exp.buff += p.bonus || 3; log(s, `The next roll gets +${p.bonus || 3}.`, "combat"); }
      break;
    case "debuff":
      if (success) {
        if (p.debuff === "skip") { exp.monsterSkip += 1; log(s, "The monster skips its next attack!", "combat"); }
        else { exp.monsterWeaken = 1; log(s, "The monster is weakened (-2 difficulty).", "combat"); }
      }
      break;
  }
  advanceActor(s);
}

function resolveRoomRoll(s, p, success, crit) {
  const exp = s.expedition;
  const actor = playerById(s, p.playerId);
  if (p.kind === "challenge") {
    if (success) {
      s.party.score += 4;
      for (const a of allAlive(s)) a.hp = Math.min(a.maxHp, a.hp + 2);
      log(s, `${actor.name} masters the challenge! Party heals 2, score +4.`, "challenge");
    } else {
      log(s, "The challenge proves too tricky this time.", "challenge");
    }
  } else {
    if (success) {
      s.party.score += 2;
      log(s, `${actor.name} dodges the trap! Score +2.`, "trap");
    } else {
      const dmg = new Dice(newSeed()).roll(6);
      actor.hp = Math.max(0, actor.hp - dmg);
      log(s, pickNarration(s, "trapFail", { player: actor.name }), "trap");
      log(s, `${actor.name} takes ${dmg} damage from the trap.`, "trap");
    }
  }
  exp.roomStatus = "cleared";
  exp.activePlayerId = null;
  exp.actionPhase = "idle";
  // rotate fairly to the next player for the next challenge/trap room
  exp.challengeIndex += 1;
}

// ---------- part 2b end ----------

function advanceActor(s) {
  const exp = s.expedition;
  exp.pending = null;
  exp.langPrompt = null;
  exp.assistBonus = 0;
  exp.activePlayerId = null;
  exp.actionPhase = "idle";
  exp.spotlightIndex += 1;
  if (exp.spotlightIndex >= exp.spotlight.length) monsterTurn(s);
  else startActor(s);
}

function monsterTurn(s) {
  const exp = s.expedition;
  const m = exp.monster;
  if (exp.monsterSkip > 0) {
    exp.monsterSkip -= 1;
    log(s, `${m.name} is held and misses its turn.`, "combat");
    proceedToNextRound(s);
    return;
  }
  const alive = aliveHumans(s);
  if (alive.length === 0) { onDefeat(s); return; }
  const dice = new Dice(newSeed());
  const target = alive[dice.int(0, alive.length - 1)];
  const dmg = rollDice(dice, m.damage);
  if (exp.guard > 0) {
    exp.guard -= 1;
    log(s, `${m.name} attacks ${target.name} but the guard absorbs it!`, "combat");
  } else {
    target.hp = Math.max(0, target.hp - dmg);
    log(s, `${m.name} hits ${target.name} for ${dmg} damage!`, "combat");
    if (target.hp === 0) log(s, `${target.name} is dazed!`, "combat");
  }
  if (aliveHumans(s).length === 0) onDefeat(s);
  else proceedToNextRound(s);
}

function proceedToNextRound(s) {
  const exp = s.expedition;
  // Bound combat: after 12 rounds the monster retreats (half score).
  if (exp.round >= 12) {
    const m = exp.monster;
    s.party.score += Math.max(1, Math.ceil(m.score / 2));
    log(s, `${m.name} has had enough and retreats into the shadows. Partial victory (+${Math.max(1, Math.ceil(m.score / 2))} score)!`, "combat");
    exp.roomStatus = "cleared";
    exp.activePlayerId = null;
    exp.actionPhase = "idle";
    return;
  }
  exp.round += 1;
  if (exp.monsterWeaken > 0) exp.monsterWeaken -= 1;
  for (const p of allAlive(s)) p.focus = Math.min(p.maxFocus, p.focus + 1);
  const queueLen = Math.max(1, allAlive(s).length);
  exp.roundStart = (exp.roundStart + exp.spotlight.length) % queueLen;
  buildSpotlight(s);
  exp.spotlightIndex = 0;
  startActor(s);
}

function onMonsterDown(s) {
  const m = s.expedition.monster;
  s.party.score += m.score;
  log(s, pickNarration(s, "victory", { monster: m.name }), "combat");
  log(s, `The party earns ${m.score} score.`, "combat");
  s.expedition.roomStatus = "cleared";
  s.expedition.activePlayerId = null;
  s.expedition.actionPhase = "idle";
}

function onDefeat(s) {
  log(s, pickNarration(s, "defeat", {}), "combat");
  s.expedition.roomStatus = "defeat";
  s.expedition.activePlayerId = null;
  s.expedition.actionPhase = "idle";
}

// Teacher tool: undo the last action and re-resolve it with a fresh die,
// keeping the same language and assist bonuses.
export function rerollLast() {
  const s = getState();
  const exp = s.expedition;
  const a = exp && exp.lastAction;
  if (!a || !s.history || s.history.length === 0) return false;
  const prior = s.history[s.history.length - 1];
  if (!prior.expedition) return false;
  const pre = prior.expedition;
  const matches = pre.activePlayerId === a.playerId && (pre.actionPhase === "choosing" || pre.actionPhase === "acting");
  if (!matches) return false;
  undo();
  mutate((n) => {
    const nExp = n.expedition;
    if (nExp.actionPhase === "acting" && nExp.pending && nExp.pending.playerId === a.playerId) {
      nExp.langPrompt = null;
      nExp.langBonus = a.langBonus || 0;
      nExp.assistBonus = a.assistBonus || 0;
      nExp.lastAction = { ...a };
      resolveRoll(n, nExp.langBonus, nExp.assistBonus, null);
    } else {
      applyAction(n, a.playerId, a.skillId, { skipLanguage: true, langBonus: a.langBonus || 0, assistBonus: a.assistBonus || 0 });
    }
    return n;
  });
  return true;
}

export function advanceRoom() {
  return mutate((s) => {
    if (s.phase !== "expedition") return s;
    const st = s.expedition.roomStatus;
    if (!["cleared", "defeat"].includes(st)) return s;
    advanceAfterRoom(s, st);
    return s;
  });
}

function advanceAfterRoom(s, st) {
  s.expedition.monster = null;
  s.expedition.activePlayerId = null;
  s.expedition.actionPhase = "idle";
  if (st === "defeat") {
    s.phase = "defeated";
    log(s, "The expedition ends here. The party lives to try again.", "system");
    return;
  }
  if (s.expedition.current >= s.expedition.rooms.length - 1) {
    s.phase = "victory";
    log(s, "The expedition is complete! The whole class wins!", "system");
    return;
  }
  s.expedition.current += 1;
  enterCurrentRoom(s);
}

// Teacher tool: force the party to the next room, skipping the current one.
export function skipRoom() {
  return mutate((s) => {
    if (s.phase !== "expedition") return s;
    log(s, "The GM skips this room.", "system");
    advanceAfterRoom(s, "cleared");
    return s;
  });
}

// Teacher tools: direct HP / Focus / score adjusters.
export function adjustPlayerHp(id, delta) {
  return mutate((s) => {
    const p = s.players.find((x) => x.id === id);
    if (!p) return s;
    p.hp = Math.max(0, Math.min(p.maxHp, p.hp + delta));
    return s;
  });
}

export function adjustPlayerFocus(id, delta) {
  return mutate((s) => {
    const p = s.players.find((x) => x.id === id);
    if (!p) return s;
    p.focus = Math.max(0, Math.min(p.maxFocus, p.focus + delta));
    return s;
  });
}

export function adjustScore(delta) {
  return mutate((s) => {
    s.party.score = Math.max(0, s.party.score + delta);
    return s;
  });
}

// Teacher tool: send a free-text narration line to the Stage.
export function narrate(text) {
  return mutate((s) => {
    const t = (text || "").trim();
    if (!t) return s;
    log(s, t, "narrate");
    return s;
  });
}

export function backToLobby() {
  return mutate((s) => {
    s.players = s.players.filter((p) => !p.npc);
    s.phase = "lobby";
    s.expedition = null;
    for (const p of s.players) { p.hp = p.maxHp; p.focus = p.maxFocus; }
    return s;
  });
}

export function deleteSave() {
  localStorage.removeItem("classroom-rpg-save-v1");
  return mutate((s) => {
    Object.assign(s, newGameState());
    return s;
  });
}

export { undo }; // passthrough to the state layer for the GM tools
