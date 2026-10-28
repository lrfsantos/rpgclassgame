// Content loader + validator.
// Every file in /content is loaded, validated on startup, and cached in memory.

export class ContentError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContentError";
  }
}

const FILES = [
  "classes.json",
  "skills.json",
  "monsters.json",
  "rooms.json",
  "vocabulary.json",
  "prompts.json",
  "episodes.json",
];

const STATS = ["might", "agility", "mind", "heart"];
const SKILL_TARGETS = ["enemy", "ally", "party", "self"];
const SKILL_EFFECTS = ["attack", "heal", "shield", "buff", "debuff"];
const ROOM_KINDS = ["combat", "challenge", "trap", "treasure", "rest", "event"];
const LEVELS = ["A2", "B1", "B2"];

const VALIDATORS = {
  "classes.json": validateClasses,
  "skills.json": validateSkills,
  "monsters.json": validateMonsters,
  "rooms.json": validateRooms,
  "vocabulary.json": validateVocabulary,
  "prompts.json": validatePrompts,
  "episodes.json": validateEpisodes,
};

let cache = null;

export async function loadContent() {
  if (cache) return cache;
  const loaded = {};
  const errors = [];

  for (const file of FILES) {
    try {
      const res = await fetch(`content/${file}`);
      if (!res.ok) {
        throw new ContentError(`could not load (HTTP ${res.status})`);
      }
      const data = await res.json();
      const validate = VALIDATORS[file];
      const errs = validate ? validate(data) : [];
      if (errs.length > 0) {
        errors.push(`content/${file}: ${errs.join("; ")}`);
      } else {
        loaded[file] = data;
      }
    } catch (e) {
      if (e instanceof ContentError) {
        errors.push(`content/${file}: ${e.message}`);
      } else {
        errors.push(`content/${file}: not valid JSON (${e.message})`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ContentError(errors.join("\n"));
  }

  cache = buildIndex(loaded);
  return cache;
}

// Cross-reference checks between files.
function buildIndex(loaded) {
  const classes = loaded["classes.json"].classes;
  const skills = loaded["skills.json"].skills;
  const monsters = loaded["monsters.json"].monsters;
  const decks = loaded["rooms.json"].decks;
  const episodes = loaded["episodes.json"] ? loaded["episodes.json"].episodes : [];
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const monsterById = new Map(monsters.map((m) => [m.id, m]));
  const errs = [];

  for (const c of classes) {
    for (const sid of c.skillIds) {
      if (!skillById.has(sid)) errs.push(`classes.json: class "${c.id}" references unknown skill "${sid}"`);
    }
  }
  for (const s of skills) {
    if (!classById.has(s.classId)) errs.push(`skills.json: skill "${s.id}" has unknown classId "${s.classId}"`);
  }
  for (const m of monsters) {
    if (!deckById.has(m.deck)) errs.push(`monsters.json: monster "${m.id}" has unknown deck "${m.deck}"`);
  }
  // every deck must have exactly one boss monster
  for (const d of decks) {
    const bosses = monsters.filter((m) => m.deck === d.id && m.boss);
    if (bosses.length !== 1) errs.push(`rooms.json: deck "${d.id}" needs exactly 1 boss monster (found ${bosses.length})`);
  }

  // every deck must have exactly one boss monster
  for (const d of decks) {
    const bosses = monsters.filter((m) => m.deck === d.id && m.boss);
    if (bosses.length !== 1) errs.push(`rooms.json: deck "${d.id}" needs exactly 1 boss monster (found ${bosses.length})`);
  }
  // episodes: every combat scene references an existing monster
  for (const ep of episodes) {
    for (const sc of (ep.scenes || [])) {
      if (sc.kind === "combat" && !monsterById.has(sc.monsterId)) errs.push(`episodes.json: episode "${ep.id}" scene "${sc.id}" references unknown monster "${sc.monsterId}"`);
    }
  }

  if (errs.length > 0) {
    throw new ContentError(`cross-reference: ${errs.join("; ")}`);
  }

  return {
    classes,
    skills,
    monsters,
    monsterNames: loaded["monsters.json"].names,
    decks,
    vocabPrompts: loaded["vocabulary.json"].prompts,
    npcNames: loaded["prompts.json"].npcNames,
    playerNames: loaded["prompts.json"].playerNames,
    narrations: loaded["prompts.json"].narrations,
    episodes,
  };
}

const SCENE_KINDS = ["story", "combat"];
const CHOICE_KEYS = ["id", "label", "stat", "difficulty", "text", "target", "example", "onGood", "onBad"];
function validateEpisodes(data) {
  if (!Array.isArray(data.episodes)) return ["missing array 'episodes'"];
  const errs = [];
  const seen = new Set();
  data.episodes.forEach((ep, i) => {
    errs.push(...fail(!seen.has(ep.id), `duplicate episode id "${ep.id}"`));
    seen.add(ep.id);
    errs.push(
      ...fail(typeof ep.id === "string" && ep.id, `[${i}] missing id`),
      ...fail(typeof ep.name === "string" && ep.name, `episode ${ep.id}: missing name`),
      ...fail(Array.isArray(ep.scenes) && ep.scenes.length >= 3, `episode ${ep.id}: need at least 3 scenes`),
      ...fail(Array.isArray(ep.scenes) && ep.scenes.every((sc) => SCENE_KINDS.includes(sc.kind) && typeof sc.id === "string" && typeof sc.flavour === "string"), `episode ${ep.id}: every scene needs id, kind (story|combat), flavour`)
    );
    if (!Array.isArray(ep.scenes)) return;
    const seenScene = new Set();
    ep.scenes.forEach((sc, j) => {
      errs.push(...fail(!seenScene.has(sc.id), `episode ${ep.id}: duplicate scene id "${sc.id}"`));
      seenScene.add(sc.id);
      if (sc.kind === "story") {
        const hasChoices = Array.isArray(sc.choices) && sc.choices.length >= 3;
        errs.push(...fail(hasChoices, `episode ${ep.id}: story scene ${sc.id} needs at least 3 choices`));
        if (hasChoices) {
          const seenChoice = new Set();
          sc.choices.forEach((c, k) => {
            errs.push(...fail(!seenChoice.has(c.id), `episode ${ep.id}: scene ${sc.id} duplicate choice id "${c.id}"`));
            seenChoice.add(c.id);
            errs.push(...fail(CHOICE_KEYS.filter((k) => k !== "difficulty").every((key) => typeof c[key] === "string"), `episode ${ep.id}: scene ${sc.id} choice ${c.id || k} needs ${CHOICE_KEYS.filter((x) => x !== "difficulty").join("/")} as strings`));
            errs.push(...fail(STATS.includes(c.stat), `episode ${ep.id}: scene ${sc.id} choice ${c.id} bad stat "${c.stat}"`));
            errs.push(...fail(Number.isFinite(c.difficulty), `episode ${ep.id}: scene ${sc.id} choice ${c.id} needs numeric difficulty`));
          });
        }
      } else {
        errs.push(
          ...fail(typeof sc.monsterId === "string", `episode ${ep.id}: combat scene ${sc.id} needs monsterId`),
          ...fail(sc.prompt && typeof sc.prompt.text === "string" && typeof sc.prompt.target === "string" && typeof sc.prompt.example === "string", `episode ${ep.id}: combat scene ${sc.id} needs prompt {text, target, example}`)
        );
      }
      errs.push(
        ...fail(sc.conditional === undefined || (typeof sc.conditional.flag === "string" && sc.conditional.whenSet && sc.conditional.whenUnset), `episode ${ep.id}: scene ${sc.id} conditional needs {flag, whenSet, whenUnset}`)
      );
    });
  });
  return errs;
}

function fail(cond, msg) {
  return cond ? [] : [msg];
}

function validateClasses(data) {
  if (!Array.isArray(data.classes)) return ["missing array 'classes'"];
  const errs = [];
  const seen = new Set();
  data.classes.forEach((c, i) => {
    errs.push(...fail(!seen.has(c.id), `duplicate class id "${c.id}"`));
    seen.add(c.id);
    errs.push(
      ...fail(typeof c.id === "string" && c.id, `[${i}] missing id`),
      ...fail(typeof c.name === "string" && c.name, `class ${c.id}: missing name`),
      ...fail(c.stats && STATS.every((k) => Number.isFinite(c.stats[k])), `class ${c.id}: stats must have ${STATS.join("/")} as numbers`),
      ...fail(Number.isFinite(c.maxHp), `class ${c.id}: maxHp must be a number`),
      ...fail(Number.isFinite(c.maxFocus), `class ${c.id}: maxFocus must be a number`),
      ...fail(c.basic && typeof c.basic.name === "string" && STATS.includes(c.basic.stat) && typeof c.basic.damage === "string", `class ${c.id}: basic {name, stat, damage} required`),
      ...fail(Array.isArray(c.skillIds) && c.skillIds.length === 3, `class ${c.id}: need exactly 3 skillIds`),
      ...fail(typeof c.blurb === "string" && c.blurb, `class ${c.id}: missing blurb`)
    );
  });
  return errs;
}

function validateSkills(data) {
  if (!Array.isArray(data.skills)) return ["missing array 'skills'"];
  const errs = [];
  const seen = new Set();
  data.skills.forEach((s, i) => {
    errs.push(...fail(!seen.has(s.id), `duplicate skill id "${s.id}"`));
    seen.add(s.id);
    errs.push(
      ...fail(typeof s.id === "string" && s.id, `[${i}] missing id`),
      ...fail(typeof s.name === "string" && s.name, `skill ${s.id}: missing name`),
      ...fail(typeof s.classId === "string" && s.classId, `skill ${s.id}: missing classId`),
      ...fail(STATS.includes(s.stat), `skill ${s.id}: bad stat "${s.stat}"`),
      ...fail(SKILL_TARGETS.includes(s.target), `skill ${s.id}: bad target "${s.target}"`),
      ...fail(SKILL_EFFECTS.includes(s.effect), `skill ${s.id}: bad effect "${s.effect}"`),
      ...fail(Number.isFinite(s.cost) && s.cost >= 1, `skill ${s.id}: cost must be >= 1`),
      ...fail(s.effect !== "debuff" || ["skip", "weaken"].includes(s.debuff), `skill ${s.id}: debuff must be skip|weaken`),
      ...fail(typeof s.flavour === "string" && s.flavour, `skill ${s.id}: missing flavour`)
    );
  });
  return errs;
}

function validateMonsters(data) {
  if (!Array.isArray(data.monsters)) return ["missing array 'monsters'"];
  const errs = [];
  const seen = new Set();
  data.monsters.forEach((m, i) => {
    errs.push(...fail(!seen.has(m.id), `duplicate monster id "${m.id}"`));
    seen.add(m.id);
    errs.push(
      ...fail(typeof m.id === "string" && m.id, `[${i}] missing id`),
      ...fail(typeof m.deck === "string" && m.deck, `monster ${m.id}: missing deck`),
      ...fail(Number.isFinite(m.level), `monster ${m.id}: level must be a number`),
      ...fail(typeof m.name === "string" && m.name, `monster ${m.id}: missing name`),
      ...fail(Number.isFinite(m.hp), `monster ${m.id}: hp must be a number`),
      ...fail(Number.isFinite(m.difficulty), `monster ${m.id}: difficulty must be a number`),
      ...fail(typeof m.damage === "string" && m.damage, `monster ${m.id}: damage must be a string like d4/d6`),
      ...fail(Number.isFinite(m.score), `monster ${m.id}: score must be a number`),
      ...fail(typeof m.quirk === "string" && m.quirk, `monster ${m.id}: missing quirk`),
      ...fail(typeof m.vocabHint === "string" && m.vocabHint, `monster ${m.id}: missing vocabHint`)
    );
  });
  return errs;
}

function validateRooms(data) {
  if (!Array.isArray(data.decks)) return ["missing array 'decks'"];
  const errs = [];
  const seenDeck = new Set();
  data.decks.forEach((d, i) => {
    errs.push(...fail(!seenDeck.has(d.id), `duplicate deck id "${d.id}"`));
    seenDeck.add(d.id);
    if (!Array.isArray(d.rooms)) { errs.push(`deck ${d.id}: missing rooms`); return; }
    const seenRoom = new Set();
    d.rooms.forEach((r, j) => {
      errs.push(...fail(!seenRoom.has(r.id), `deck ${d.id}: duplicate room id "${r.id}"`));
      seenRoom.add(r.id);
      errs.push(
        ...fail(typeof r.id === "string" && r.id, `deck ${d.id}[${j}] missing id`),
        ...fail(ROOM_KINDS.includes(r.kind), `deck ${d.id}: room ${r.id} bad kind "${r.kind}"`),
        ...fail(typeof r.flavour === "string" && r.flavour, `deck ${d.id}: room ${r.id} missing flavour`),
        ...fail(r.kind !== "combat" || Number.isFinite(r.level), `deck ${d.id}: combat room ${r.id} needs a level`),
        ...fail((r.kind !== "challenge" && r.kind !== "trap") || (STATS.includes(r.stat) && Number.isFinite(r.difficulty)), `deck ${d.id}: ${r.kind} room ${r.id} needs stat + difficulty`)
      );
    });
  });
  return errs;
}

function validateVocabulary(data) {
  if (!Array.isArray(data.prompts)) return ["missing array 'prompts'"];
  const errs = [];
  const seen = new Set();
  data.prompts.forEach((p, i) => {
    errs.push(...fail(!seen.has(p.id), `duplicate prompt id "${p.id}"`));
    seen.add(p.id);
    errs.push(
      ...fail(typeof p.id === "string" && p.id, `[${i}] missing id`),
      ...fail(LEVELS.includes(p.level), `prompt ${p.id}: bad level "${p.level}"`),
      ...fail(typeof p.text === "string" && p.text, `prompt ${p.id}: missing text`),
      ...fail(typeof p.target === "string" && p.target, `prompt ${p.id}: missing target (teacher hint)`),
      ...fail(typeof p.example === "string" && p.example, `prompt ${p.id}: missing example (teacher hint)`)
    );
  });
  return errs;
}

function validatePrompts(data) {
  const errs = [];
  for (const key of ["playerNames", "npcNames", "narrations"]) {
    if (!(key in data)) errs.push(`missing "${key}"`);
  }
  return errs;
}

export function getContent() {
  if (!cache) throw new ContentError("content not loaded yet");
  return cache;
}
