// View test: drives a full episode through the engine and asserts the pure
// view (getView / getStageView / currentStep) is correct at every step of every
// scene, and that the Stage view never leaks teacher hints (target/example).
import { loadContent, getContent } from "file:///C:/Users/luiza/Documents/protogame/src/engine/content.js";
import * as stateMod from "file:///C:/Users/luiza/Documents/protogame/src/engine/state.js";
import * as actions from "file:///C:/Users/luiza/Documents/protogame/src/engine/actions.js";
import { getView, getStageView, currentStep } from "file:///C:/Users/luiza/Documents/protogame/src/engine/view.js";

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.fetch = async (url) => {
  const fs = await import("node:fs");
  const path = "C:/Users/luiza/Documents/protogame/" + url;
  if (!fs.existsSync(path)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path, "utf8")) };
};
globalThis.window = globalThis;
globalThis.BroadcastChannel = class { constructor() {} onmessage = null; postMessage() {} close() {} };

await loadContent();
function assert(cond, msg) { if (cond) console.log("ok:", msg); else { console.error("FAIL:", msg); process.exitCode = 1; } }

const ep = getContent().episodes[0];
assert(!!ep, "found an episode");

// setup: 4 players with distinct classes
stateMod.reset();
actions.setSettings({ languageCheck: "off" });
for (let i = 0; i < 4; i++) actions.addPlayer();
let s = stateMod.getState();
const classes = getContent().classes;
s.players.forEach((p, i) => actions.setPlayerClass(p.id, classes[i % classes.length].id));

actions.startEpisode(ep.id);
s = stateMod.getState();
assert(s.expedition.mode === "episode", "episode mode set");

let stepsSeen = {};
let scenes = 0;
let hintLeak = 0;
let loop = 0;
while (loop++ < 400) {
  s = stateMod.getState();
  if (s.phase !== "expedition") break;
  const v = getView(s);
  const sv = getStageView(s);
  const exp = s.expedition;

  // view invariants
  assert(v.stepIndex >= 0 && v.stepIndex <= 4, "stepIndex in range");
  assert(v.sceneIndex === exp.current, "sceneIndex matches state");
  stepsSeen[v.step] = (stepsSeen[v.step] || 0) + 1;

  // story scenes: cards at CHOOSE, read present, actor present
  if (exp.roomStatus === "story") {
    assert(v.title || v.goal, "story view has a title/goal");
    if (v.step === "choose") {
      assert(v.cards.length >= 1 && v.cards.length <= 3, "CHOOSE shows 1-3 cards");
      const keys = v.cards.map((c) => c.key).join("");
      assert(/^[ABC]+$/.test(keys), "card keys are A/B/C");
      assert(v.actor, "story CHOOSE has an actor");
    }
    if (v.step === "sayit") {
      assert(v.ask, "say-it has a prompt");
      assert(v.actor, "say-it has an actor");
    }
  }

  // stage view NEVER leaks hints
  if (sv.hints.target || sv.hints.example) { hintLeak++; }
  // stage cards must not carry target/example either
  for (const c of sv.cards) { if (c.target || c.example) hintLeak++; }

  // drive one action forward
  if (exp.roomStatus === "story") {
    if (v.step === "listen") actions.storyContinue();
    else if (v.step === "choose") actions.chooseStoryApproach(v.cards[0].id);
    else if (v.step === "sayit") actions.gradeStory(2);
    else if (v.step === "roll") actions.storyContinue();
    else if (v.step === "result") actions.storyContinue();
  } else if (exp.roomStatus === "combat") {
    if (exp.actionPhase === "choosing") {
      const actor = s.players.find((p) => p.id === exp.activePlayerId);
      if (actor && !actor.npc) actions.chooseAction(actor.id, null);
      else actions.passAction(actor ? actor.id : null);
    } else if (exp.actionPhase === "acting" && exp.pending) {
      actions.judgeLanguage(2);
    } else {
      actions.advanceRoom();
    }
  } else {
    actions.advanceRoom();
  }
}

s = stateMod.getState();
scenes = s.expedition.rooms.length;
assert(s.phase === "victory", "episode reached victory (got phase " + s.phase + ")");
assert(hintLeak === 0, "stage view never leaked target/example (0 leaks)");
assert(stepsSeen.listen > 0 && stepsSeen.choose > 0 && stepsSeen.sayit > 0 && stepsSeen.roll > 0 && stepsSeen.result > 0,
  "saw all 5 steps: " + JSON.stringify(stepsSeen));

// every story scene produced a CHOOSE at least once
assert(stepsSeen.choose >= (s.expedition.mode === "episode" ? 5 : 1), "saw CHOOSE in the story scenes (got " + stepsSeen.choose + ")");

// ---- M3a D4/D5 invariants: deterministic branches via rollStory(20)/rollStory(1) ----
function freshEpisode() {
  stateMod.reset();
  actions.setSettings({ languageCheck: "off" });
  for (let i = 0; i < 4; i++) actions.addPlayer();
  s = stateMod.getState();
  s.players.forEach((p, i) => actions.setPlayerClass(p.id, classes[i % classes.length].id));
  actions.startEpisode(ep.id);
}
function toRollStep() {
  let n = 0;
  while (n++ < 20) {
    s = stateMod.getState();
    const v = getView(s);
    if (expIsStoryAt(s, "roll")) return v;
    if (expIsStoryAt(s, "listen")) actions.storyContinue();
    else if (expIsStoryAt(s, "choose")) actions.chooseStoryApproach(v.cards[0].id);
    else if (expIsStoryAt(s, "sayit")) actions.gradeStory(2);
    else actions.storyContinue();
  }
  return null;
}
function expIsStoryAt(s, step) {
  return s.expedition.mode === "episode" && s.expedition.roomStatus === "story" && s.expedition.step === step;
}

// rollStory(20): guaranteed crit/success — outcome = onGood, no outcome text at ROLL, Spark +6
freshEpisode();
let v = toRollStep();
assert(v && v.step === "roll", "deterministic setup reached ROLL");
assert(v.roll === null, "at ROLL the view exposes no roll (dice have their own moment)");
assert(!v.read.includes("onGood") && !v.read.includes("onBad"), "at ROLL read has no outcome text");
const beforeSpark = stateMod.getState().party.score;
actions.grantAssist(stateMod.getState().players.find((p) => p.id !== stateMod.getState().expedition.pending.playerId && !p.npc).id);
actions.rollStory(20);
s = stateMod.getState();
v = getView(s);
assert(v.step === "result", "after rollStory(20) the step is RESULT");
assert(v.outcome && v.outcome.success === true, "rollStory(20) outcome.success true");
assert(v.outcome && v.outcome.text && v.outcome.text.length > 0, "rollStory(20) outcome.text set (onGood)");
assert(s.party.score === beforeSpark + 6, "rollStory(20) applied Spark +6 (got " + (s.party.score - beforeSpark) + ")");
assert(v.roll && v.roll.assistBonus >= 1, "assist given before the roll shows in the breakdown");

// rollStory(1): guaranteed fumble/fail — outcome = onBad, no item, Spark +1
freshEpisode();
v = toRollStep();
assert(v && v.step === "roll", "deterministic setup reached ROLL (second)");
const itemsBefore = (stateMod.getState().expedition.items || []).length;
const sparkBefore = stateMod.getState().party.score;
actions.rollStory(1);
s = stateMod.getState();
v = getView(s);
assert(v.outcome && v.outcome.success === false, "rollStory(1) outcome.success false");
assert(v.outcome && v.outcome.text && v.outcome.text.length > 0, "rollStory(1) outcome.text set (onBad)");
assert((stateMod.getState().expedition.items || []).length === itemsBefore, "rollStory(1) added no item");
assert(s.party.score === sparkBefore + 1, "rollStory(1) applied Spark +1 (got " + (s.party.score - sparkBefore) + ")");

// assist cap +2: two different assisters cap the bonus, a third is ignored
freshEpisode();
v = toRollStep();
assert(v && v.step === "roll", "deterministic setup reached ROLL (third)");
s = stateMod.getState();
const humans = s.players.filter((p) => !p.npc && p.id !== s.expedition.pending.playerId);
actions.grantAssist(humans[0].id);
actions.grantAssist(humans[1].id);
actions.grantAssist(humans[0].id); // repeat ignored
actions.grantAssist(humans.length > 2 ? humans[2].id : humans[0].id);
s = stateMod.getState();
assert(s.expedition.assistBonus === 2, "assist cap is +2 (got " + s.expedition.assistBonus + ")");

// ---- M3b-10 Talk it down: both branches ----
function driveToCombatChoose() {
  let n = 0;
  while (n++ < 60) {
    s = stateMod.getState();
    const v = getView(s);
    const exp = s.expedition;
    if (exp.roomStatus === "combat" && exp.actionPhase === "choosing" && exp.monster) return v;
    if (exp.roomStatus === "story") {
      if (exp.step === "listen") actions.storyContinue();
      else if (exp.step === "choose") actions.chooseStoryApproach(v.cards[0].id);
      else if (exp.step === "sayit") actions.gradeStory(2);
      else if (exp.step === "roll") actions.rollStory(10);
      else if (exp.step === "result") actions.storyContinue();
    } else {
      const actor = s.players.find((p) => p.id === exp.activePlayerId);
      if (exp.actionPhase === "choosing" && actor && !actor.npc) actions.chooseAction(actor.id, null);
      else actions.storyContinue();
    }
  }
  return null;
}

// success branch: rollStory(20) clears the room with the talk-down onGood
freshEpisode();
v = driveToCombatChoose();
assert(v && v.roomStatus === "combat", "drive reached the combat CHOOSE for talk-down");
assert(v.talkDown && v.talkDown.label, "combat scene exposes a talkDown card");
const roomBefore = stateMod.getState().expedition.current;
actions.chooseTalkDown();
s = stateMod.getState();
assert(s.expedition.roomStatus === "story" && s.expedition.step === "sayit" && s.expedition.talkDown === true, "chooseTalkDown enters the story sayit step");
actions.gradeStory(2);
actions.rollStory(20);
s = stateMod.getState();
v = getView(s);
assert(v.outcome && v.outcome.success === true, "talk-down rollStory(20) success");
assert(v.outcome && v.outcome.text.includes("golem"), "talk-down success outcome is the talk onGood");
assert(s.expedition.roomStatus === "cleared", "talk-down success clears the room (no combat)");
assert(s.expedition.current === roomBefore && s.phase === "expedition", "talk-down success advances to the next room on Continue");
actions.storyContinue();
assert(stateMod.getState().expedition.current === roomBefore + 1, "after talk-down success Continue advances to next scene");

// failure branch: rollStory(1) resumes combat, not advance
freshEpisode();
v = driveToCombatChoose();
const roomBefore2 = stateMod.getState().expedition.current;
actions.chooseTalkDown();
actions.gradeStory(2);
actions.rollStory(1);
s = stateMod.getState();
v = getView(s);
assert(v.outcome && v.outcome.success === false, "talk-down rollStory(1) fails");
assert(v.outcome && v.outcome.text.includes("golem"), "talk-down failure outcome is the talk onBad");
assert(s.expedition.talkDownFailed === true, "talk-down failure sets talkDownFailed");
actions.storyContinue();
s = stateMod.getState();
assert(s.expedition.roomStatus === "combat" && s.expedition.monster, "talk-down failure resumes the combat (monster present)");
assert(s.expedition.current === roomBefore2, "talk-down failure does NOT advance the room");

// ---- M3b-11 Reshuffle: a 4-choice scene shows 3; reshuffle changes the set ----
freshEpisode();
let nR = 0;
let firstSet = null, secondSet = null;
while (nR++ < 20) {
  s = stateMod.getState();
  v = getView(s);
  if (expIsStoryAt(s, "choose")) {
    if (!firstSet) {
      firstSet = v.cards.map((c) => c.id).join(",");
      actions.reshuffleOptions();
    } else {
      secondSet = v.cards.map((c) => c.id).join(",");
      break;
    }
  }
  if (expIsStoryAt(s, "listen")) actions.storyContinue();
  else if (expIsStoryAt(s, "sayit")) actions.gradeStory(2);
  else if (expIsStoryAt(s, "roll")) actions.rollStory(10);
  else if (expIsStoryAt(s, "result")) actions.storyContinue();
  else actions.storyContinue();
}
assert(firstSet && firstSet.split(",").length === 3, "a 4-choice scene shows exactly 3 cards at CHOOSE (got " + firstSet + ")");
assert(secondSet && secondSet !== firstSet, "reshuffle changes the set of shown cards (" + firstSet + " -> " + secondSet + ")");

// drive to the end so the currentStep assertion still holds
let n2 = 0;
while (n2++ < 40) {
  s = stateMod.getState();
  if (s.phase !== "expedition") break;
  v = getView(s);
  if (expIsStoryAt(s, "listen")) actions.storyContinue();
  else if (expIsStoryAt(s, "choose")) actions.chooseStoryApproach(v.cards[0].id);
  else if (expIsStoryAt(s, "sayit")) actions.gradeStory(2);
  else if (expIsStoryAt(s, "roll")) actions.rollStory(10);
  else if (expIsStoryAt(s, "result")) actions.storyContinue();
  else actions.storyContinue();
}

// view.mjs also powers currentStep used by both UIs
assert(currentStep(stateMod.getState()) === "result" || currentStep(stateMod.getState()) === null, "currentStep defined at end (victory => result-ish)");

console.log(process.exitCode ? "\nSOME VIEW TESTS FAILED" : "\nALL VIEW TESTS PASSED");
