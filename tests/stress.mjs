// Permanent stress test: many random full runs under node with stubbed browser globals.
import { loadContent, getContent } from "file:///C:/Users/luiza/Documents/protogame/src/engine/content.js";
import * as stateMod from "file:///C:/Users/luiza/Documents/protogame/src/engine/state.js";
import * as actions from "file:///C:/Users/luiza/Documents/protogame/src/engine/actions.js";
import { getView } from "file:///C:/Users/luiza/Documents/protogame/src/engine/view.js";

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

function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

let failures = 0;
const RUNS = 120;
const LANG_MODES = ["off", "light", "full"];

for (let r = 0; r < RUNS; r++) {
  try {
    stateMod.reset();
    let s = stateMod.getState();
    const n = 1 + Math.floor(Math.random() * 12);
    for (let i = 0; i < n; i++) actions.addPlayer();
    s = stateMod.getState();
    const classes = getContent().classes;
    s.players.forEach((p) => actions.setPlayerClass(p.id, randChoice(classes).id));

    actions.setSettings({
      languageCheck: randChoice(LANG_MODES),
      spotlight: 1 + Math.floor(Math.random() * 6),
      npcCompanion: Math.random() < 0.5,
    });

    actions.startExpedition();
    s = stateMod.getState();
    if (s.expedition.rooms.length < 8 || s.expedition.rooms.length > 10) throw new Error("room count " + s.expedition.rooms.length);
    const last = s.expedition.rooms[s.expedition.rooms.length - 1];
    if (last.event.type !== "combat") throw new Error("last room is not combat");

    let guard = 0;
    while (guard++ < 800) {
      s = stateMod.getState();
      if (s.phase !== "expedition") break;
      const exp = s.expedition;
      if (exp.roomType) throw new Error("dangling roomType");
      if (exp.roomStatus === "cleared" || exp.roomStatus === "defeat") { actions.advanceRoom(); continue; }

      // story step machine: episode story rooms + Random Expedition challenge/trap
      if (exp.roomStatus === "story") {
        if (exp.step === "listen") { actions.storyContinue(); continue; }
        if (exp.step === "choose") { const v = getView(s); if (v.cards.length) actions.chooseStoryApproach(randChoice(v.cards).id); continue; }
        if (exp.step === "sayit") {
          const others = s.players.filter((p) => !p.npc && p.hp > 0 && p.id !== exp.pending.playerId);
          if (others.length && Math.random() < 0.5) actions.grantAssist(randChoice(others).id);
          actions.gradeStory(randChoice([0, 2, 4]));
          continue;
        }
        if (exp.step === "roll") { actions.rollStory(); continue; }
        actions.storyContinue(); continue;
      }

      if (exp.actionPhase === "acting" && exp.langPrompt) {
        const actor = s.players.find((p) => p.id === exp.pending.playerId);
        const others = s.players.filter((p) => !p.npc && p.hp > 0 && p.id !== exp.pending.playerId);
        if (others.length && Math.random() < 0.5) actions.grantAssist(randChoice(others).id);
        actions.judgeLanguage(randChoice([0, 2, 4]));
        continue;
      }
      if (exp.actionPhase !== "choosing") { actions.advanceRoom(); continue; }

      const actor = s.players.find((p) => p.id === exp.activePlayerId);
      if (!actor) { actions.advanceRoom(); continue; }

      if (actor.npc) { actions.passAction(actor.id); continue; }

      const cls = getContent().classes.find((c) => c.id === actor.classId);
      const skillIds = cls.skillIds.filter((id) => {
        const sk = getContent().skills.find((x) => x.id === id);
        return sk && actor.focus >= sk.cost;
      });
      const chosen = skillIds.length ? randChoice(skillIds) : null;
      actions.chooseAction(actor.id, chosen);
    }
    s = stateMod.getState();
    const end = s.phase;
    if (end !== "victory" && end !== "defeated") {
      console.error("run", r, "no termination:", end, s.expedition.roomStatus, "actionPhase", s.expedition.actionPhase, "round", s.expedition.round, "monster", s.expedition.monster && `${s.expedition.monster.name} ${s.expedition.monster.hp}/${s.expedition.monster.maxHp}`);
      failures++;
    } else console.log("run", r, "ok ->", end, `(players=${n}, ${s.expedition.deckName})`);
  } catch (e) {
    console.error("run", r, "CRASH:", e.stack);
    failures++;
  }
}

console.log(failures ? `\n${failures} FAILURES` : `\nALL ${RUNS} RUNS OK`);
process.exitCode = failures ? 1 : 0;
