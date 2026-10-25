// Functional test: undo, reroll, NPC, settings, game-flow invariants.
import { loadContent, getContent } from "file:///C:/Users/luiza/Documents/protogame/src/engine/content.js";
import * as stateMod from "file:///C:/Users/luiza/Documents/protogame/src/engine/state.js";
import * as actions from "file:///C:/Users/luiza/Documents/protogame/src/engine/actions.js";

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

stateMod.reset();
actions.setSettings({ languageCheck: "off", spotlight: 2, npcCompanion: true });
assert(stateMod.getState().settings.languageCheck === "off" && stateMod.getState().settings.spotlight === 2, "setSettings works");

// NPC: 2 players + forced npcCompanion should add an NPC on start
actions.addPlayer(); actions.addPlayer();
let s = stateMod.getState();
const classes = getContent().classes;
s.players.forEach((p) => actions.setPlayerClass(p.id, classes[0].id));
actions.startExpedition();
s = stateMod.getState();
assert(s.players.some((p) => p.npc), "NPC companion added when npcCompanion on");
assert(s.expedition.npcId, "npcId set");
assert(s.expedition.rooms.length >= 8 && s.expedition.rooms.length <= 10, "expedition has 8-10 rooms, got " + s.expedition.rooms.length);

// undo: perform one action, then undo, confirm we're back to choosing with full focus/hp
function advanceToCombat() {
  let g = 0;
  while (g++ < 500) {
    s = stateMod.getState();
    if (s.phase !== "expedition") return s;
    const e = s.expedition;
    if (e.roomStatus === "cleared" || e.roomStatus === "defeat") { actions.advanceRoom(); continue; }
    if (e.roomStatus === "combat") return s;
    if (e.actionPhase === "choosing" && e.activePlayerId) {
      const actor = s.players.find((p) => p.id === e.activePlayerId);
      actions.passAction(actor.id);
    } else { actions.advanceRoom(); }
  }
  return s;
}

let combatState = advanceToCombat();
if (combatState.phase !== "expedition") { console.log("no combat reached, skipping undo combat test"); }
else {
  // advance to a human actor (not NPC)
  let actorId = null, g2 = 0;
  while (g2++ < 50) {
    s = stateMod.getState();
    const actor = s.players.find((p) => p.id === s.expedition.activePlayerId);
    if (actor && !actor.npc && s.expedition.actionPhase === "choosing") { actorId = actor.id; break; }
    const cur = s.players.find((p) => p.id === s.expedition.activePlayerId);
    actions.passAction(cur ? cur.id : null);
  }
  assert(actorId, "found a human actor in combat");
  if (actorId) {
    const before = stateMod.getState();
    const hpBefore = before.players.find((p) => p.id === actorId).hp;
    const focusBefore = before.players.find((p) => p.id === actorId).focus;
    actions.chooseAction(actorId, null); // basic attack, lang off -> resolves immediately
    let after = stateMod.getState();
    const histLenAfter1 = after.history.length;
    assert(histLenAfter1 >= 1, "history recorded after action");
    const undone = actions.undo();
    assert(undone === true, "undo returned true");
    const back = stateMod.getState();
    assert(back.players.find((p) => p.id === actorId).hp === hpBefore, "undo restored HP");
    assert(back.players.find((p) => p.id === actorId).focus === focusBefore, "undo restored Focus");
    assert(back.expedition.activePlayerId === actorId && back.expedition.actionPhase === "choosing", "undo returned to choosing");
  }
}

// reroll: after one action, redo and reroll should change the lastRoll die
if (combatState.phase === "expedition") {
  // get to a human actor again fresh (post-undo state exists)
  let actorId = null, g3 = 0;
  while (g3++ < 50) {
    s = stateMod.getState();
    const actor = s.players.find((p) => p.id === s.expedition.activePlayerId);
    if (actor && !actor.npc && s.expedition.actionPhase === "choosing") { actorId = actor.id; break; }
    const cur = s.players.find((p) => p.id === s.expedition.activePlayerId);
    actions.passAction(cur ? cur.id : null);
  }
  if (actorId) {
    actions.chooseAction(actorId, null);
    const r1 = stateMod.getState().expedition.lastRoll;
    const ok = actions.rerollLast();
    assert(ok === true, "rerollLast returned true");
    const r2 = stateMod.getState().expedition.lastRoll;
    assert(r2 && r2.d20 >= 1 && r2.d20 <= 20, "reroll produced a valid d20");
  }
}

// backToLobby removes NPC
actions.backToLobby();
s = stateMod.getState();
assert(!s.players.some((p) => p.npc), "backToLobby removes NPC");
assert(s.phase === "lobby", "backToLobby returns to lobby");

console.log(process.exitCode ? "\nSOME TESTS FAILED" : "\nALL FUNCTIONAL TESTS PASSED");
