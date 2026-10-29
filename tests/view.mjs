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

// view.mjs also powers currentStep used by both UIs
assert(currentStep(stateMod.getState()) === "result" || currentStep(stateMod.getState()) === null, "currentStep defined at end (victory => result-ish)");

console.log(process.exitCode ? "\nSOME VIEW TESTS FAILED" : "\nALL VIEW TESTS PASSED");
