// GM Console view (v2): teacher's control panel.
// Authoritative — actions mutate the store; main.js broadcasts on change.
import { getState, subscribe } from "../engine/state.js";
import { getContent } from "../engine/content.js";
import * as actions from "../engine/actions.js";
import { el, bar } from "./util.js";

export function mountGm(container) {
  const root = el("div", { class: "gm" });
  container.appendChild(root);

  root.addEventListener("click", onAction);
  root.addEventListener("change", onChange);
  render();
  subscribe(() => render());

  function onChange(ev) {
    const sel = ev.target.closest("select[data-player]");
    if (sel) actions.setPlayerClass(sel.dataset.player, sel.value);
    const setting = ev.target.closest("[data-setting]");
    if (setting) {
      const name = setting.dataset.setting;
      const value = setting.type === "checkbox" ? setting.checked : setting.value;
      actions.setSettings({ [name]: value });
    }
  }

  function onAction(ev) {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const value = btn.dataset.value;
    switch (action) {
      case "add-player": {
        const name = (root.querySelector("#gm-name") || {}).value;
        const cls = (root.querySelector("#gm-new-class") || {}).value;
        actions.addPlayerWithClass(name, cls || "");
        const ni = root.querySelector("#gm-name");
        if (ni) ni.value = "";
        break;
      }
      case "quick-add-4":
        for (let i = 0; i < 4; i++) actions.addPlayerWithClass("", "");
        break;
      case "remove-player":
        actions.removePlayer(value);
        break;
      case "start-expedition":
        actions.startExpedition();
        break;
      case "use-skill": {
        const spec = JSON.parse(value);
        actions.chooseAction(spec.playerId, spec.skillId);
        break;
      }
      case "grant-assist":
        actions.grantAssist(value);
        break;
      case "judge-lang":
        actions.judgeLanguage(parseInt(value, 10));
        break;
      case "reroll":
        actions.rerollLast();
        break;
      case "undo":
        actions.undo();
        break;
      case "hp-plus":
        actions.adjustPlayerHp(value, 1);
        break;
      case "hp-minus":
        actions.adjustPlayerHp(value, -1);
        break;
      case "focus-plus":
        actions.adjustPlayerFocus(value, 1);
        break;
      case "focus-minus":
        actions.adjustPlayerFocus(value, -1);
        break;
      case "score-plus":
        actions.adjustScore(1);
        break;
      case "score-minus":
        actions.adjustScore(-1);
        break;
      case "narrate": {
        const ni = root.querySelector("#gm-narrate");
        actions.narrate(ni ? ni.value : "");
        if (ni) ni.value = "";
        break;
      }
      case "advance-room":
        actions.advanceRoom();
        break;
      case "skip-room":
        actions.skipRoom();
        break;
      case "retreat":
      case "back-to-lobby":
        actions.backToLobby();
        break;
      case "delete-save":
        actions.deleteSave();
        break;
    }
  }

  function render() {
    const s = getState();
    root.innerHTML = "";
    root.appendChild(renderTop(s));
    if (s.phase === "lobby") root.appendChild(renderLobby(s));
    else root.appendChild(renderPlay(s));
  }
}

function className(id) {
  const c = getContent().classes.find((x) => x.id === id);
  return c ? c.name : "?";
}

function nextHint(s) {
  const exp = s.expedition;
  if (!exp) return "Set up the party, then press Start Expedition.";
  if (s.phase === "victory") return "Expedition complete — review the recap, then go back to lobby.";
  if (s.phase === "defeated") return "The expedition is over — go back to lobby.";
  const st = exp.roomStatus;
  if (st === "cleared") return "Room cleared. Press Next room.";
  if (st === "defeat") return "The party was defeated. Press Next or Retreat.";
  const actor = s.players.find((p) => p.id === exp.activePlayerId);
  const who = actor ? `${actor.name} (${actor.npc ? "NPC" : className(actor.classId)})` : "the party";
  if (exp.actionPhase === "acting" && exp.langPrompt) {
    return `Listening to the class... then grade the Language Check (${who}).`;
  }
  if (exp.actionPhase === "choosing") {
    if (st === "combat") return `Waiting for ${who} to choose an action (Round ${exp.round}).`;
    return `Waiting for ${who} to roll for the ${st}.`;
  }
  return "Advance when ready.";
}

function renderTop(s) {
  return el("div", { class: "gm-hint" }, nextHint(s));
}

function renderLobby(s) {
  const body = el("div");
  body.appendChild(el("h2", {}, "Party setup"));

  const addRow = el("div", { class: "row" });
  addRow.appendChild(el("input", { id: "gm-name", placeholder: "Name (blank = random)" }));
  const clsSel = el("select", { id: "gm-new-class" });
  clsSel.appendChild(el("option", { value: "" }, "— random class —"));
  for (const c of getContent().classes) clsSel.appendChild(el("option", { value: c.id }, c.name));
  addRow.appendChild(clsSel);
  addRow.appendChild(el("button", { "data-action": "add-player", class: "primary" }, "Add player"));
  addRow.appendChild(el("button", { "data-action": "quick-add-4" }, "Quick test: add 4 players"));
  body.appendChild(addRow);

  if (s.players.length === 0) body.appendChild(el("p", { class: "muted" }, "No players yet. Add up to 12."));

  for (const p of s.players) {
    const row = el("div", { class: "player-row" });
    row.appendChild(el("span", { class: "pname" }, `${p.name}${p.npc ? " (NPC)" : ""}`));
    const sel = el("select", { "data-player": p.id });
    for (const c of getContent().classes) {
      const opt = el("option", { value: c.id }, c.name);
      opt.selected = c.id === p.classId;
      sel.appendChild(opt);
    }
    row.appendChild(sel);
    row.appendChild(el("button", { "data-action": "remove-player", "data-value": p.id, class: "danger" }, "Remove"));
    body.appendChild(row);
  }

  const ready = s.players.length > 0 && s.players.every((p) => p.classId);
  body.appendChild(el("button", {
    "data-action": "start-expedition",
    class: "primary",
    disabled: ready ? null : "",
  }, `Start Expedition (${s.players.length} players)`));
  if (!ready && s.players.length > 0) body.appendChild(el("p", { class: "muted" }, "All players need a class."));

  // settings
  const settings = el("div", { class: "window" });
  settings.appendChild(el("h3", {}, "Settings"));
  const row1 = el("div", { class: "row" });
  row1.appendChild(el("span", { class: "label" }, "Language Check"));
  const lc = el("select", { "data-setting": "languageCheck" });
  for (const mode of ["off", "light", "full"]) {
    const opt = el("option", { value: mode }, mode);
    opt.selected = mode === s.settings.languageCheck;
    lc.appendChild(opt);
  }
  row1.appendChild(lc);
  row1.appendChild(el("span", { class: "label" }, "Spotlight size"));
  const sp = el("input", { type: "number", min: "1", max: "12", value: String(s.settings.spotlight), "data-setting": "spotlight", style: "width:64px" });
  row1.appendChild(sp);
  row1.appendChild(el("span", { class: "label" }, "NPC companion"));
  const npc = el("input", { type: "checkbox", "data-setting": "npcCompanion" });
  npc.checked = !!s.settings.npcCompanion;
  row1.appendChild(npc);
  settings.appendChild(row1);
  body.appendChild(settings);

  body.appendChild(el("button", { "data-action": "delete-save", class: "danger" }, "Delete save"));
  return body;
}

function renderPlay(s) {
  const body = el("div");
  const exp = s.expedition;

  if (s.phase === "victory" || s.phase === "defeated") {
    const won = s.phase === "victory";
    body.appendChild(el("h2", {}, won ? "Expedition Complete!" : "Expedition Over"));
    body.appendChild(el("p", { class: "muted" }, `Score: ${s.party.score} | Gold: ${s.party.gold}`));
    body.appendChild(el("button", { "data-action": "back-to-lobby", class: "primary" }, "Back to lobby"));
    return body;
  }

  const room = exp.rooms[exp.current];
  const actor = s.players.find((p) => p.id === exp.activePlayerId);

  // current state panel
  const panel = el("div", { class: "window state-panel" });
  panel.appendChild(el("div", {}, `Room ${exp.current + 1}/${exp.rooms.length} (${exp.deckName}): ${room.flavour}`));
  if (exp.monster) {
    panel.appendChild(el("div", {}, `Enemy: ${exp.monster.name}`));
    panel.appendChild(bar(exp.monster.hp, exp.monster.maxHp, "hp"));
  }
  if (exp.roomStatus === "combat") {
    panel.appendChild(el("div", { class: "label" }, `Round ${exp.round} — Spotlight:`));
    const chips = el("div", {});
    for (const id of exp.spotlight) {
      const p = s.players.find((x) => x.id === id);
      chips.appendChild(el("span", { class: "spot-chip" + (id === exp.activePlayerId ? " acting" : "") }, p ? p.name : "?"));
    }
    panel.appendChild(chips);
  }
  if (actor) panel.appendChild(el("div", {}, `Turn: ${actor.name} (${actor.npc ? "NPC" : className(actor.classId)})`));
  body.appendChild(panel);

  // active player actions
  if ((exp.roomStatus === "combat" || exp.roomStatus === "challenge" || exp.roomStatus === "trap") && actor && !actor.npc && exp.actionPhase === "choosing") {
    const act = el("div", { class: "window actor-actions" });
    act.appendChild(el("h3", {}, `${actor.name} — choose an action`));
    act.appendChild(el("button", { "data-action": "use-skill", "data-value": JSON.stringify({ playerId: actor.id, skillId: null }), class: "skill-btn" }, `Basic attack (free)`));
    const cls = getContent().classes.find((c) => c.id === actor.classId);
    for (const sid of cls.skillIds) {
      const sk = getContent().skills.find((x) => x.id === sid);
      const afford = actor.focus >= sk.cost;
      act.appendChild(el("button", {
        "data-action": "use-skill",
        "data-value": JSON.stringify({ playerId: actor.id, skillId: sid }),
        class: "skill-btn",
        disabled: afford ? null : "",
      }, `${sk.name} (${sk.cost} Focus) — ${sk.flavour}`));
    }
    body.appendChild(act);
  }

  // assists (during an acting/rolled action, other players can assist)
  if (exp.actionPhase === "acting" && exp.pending) {
    const others = s.players.filter((p) => p.id !== exp.pending.playerId && !p.npc);
    if (others.length) {
      const ass = el("div", { class: "window" });
      ass.appendChild(el("h3", {}, "Assists (+1 each, max +2)"));
      const row = el("div", { class: "assist-row" });
      for (const p of others) {
        const used = exp.assistUsed.includes(p.id);
        row.appendChild(el("button", {
          "data-action": "grant-assist",
          "data-value": p.id,
          disabled: used ? "" : null,
        }, `${p.name} ${used ? "(helped)" : "+1"}`));
      }
      ass.appendChild(row);
      body.appendChild(ass);
    }
  }

  // language check
  if (exp.actionPhase === "acting" && exp.langPrompt) {
    const lp = exp.langPrompt;
    const lc = el("div", { class: "window" });
    lc.appendChild(el("h3", {}, "Language Check"));
    lc.appendChild(el("p", {}, `Say it: ${lp.text}`));
    lc.appendChild(el("p", { class: "muted" }, `Teacher hint — target: ${lp.target}`));
    lc.appendChild(el("p", { class: "muted" }, `Teacher hint — example: ${lp.example}`));
    const row = el("div", { class: "row" });
    row.appendChild(el("button", { "data-action": "judge-lang", "data-value": "0" }, "Weak (+0)"));
    row.appendChild(el("button", { "data-action": "judge-lang", "data-value": "2", class: "success" }, "Good (+2)"));
    row.appendChild(el("button", { "data-action": "judge-lang", "data-value": "4", class: "primary" }, "Great (+4)"));
    lc.appendChild(row);
    body.appendChild(lc);
  }

  // roll result (for the teacher to see too)
  if (exp.lastRoll) {
    const r = exp.lastRoll;
    const res = r.crit ? "CRIT" : r.fumble ? "FUMBLE" : r.success ? "success" : "fail";
    body.appendChild(el("div", { class: "window" }, `Roll: d20=${r.d20} + mod ${r.mod} + lang ${r.langBonus} + assist ${r.assistBonus} = ${r.total} vs ${r.difficulty} → ${res}`));
  }

  // tools
  const tools = el("div", { class: "window" });
  tools.appendChild(el("h3", {}, "Tools"));
  const trow = el("div", { class: "row" });
  trow.appendChild(el("button", { "data-action": "reroll", disabled: exp.lastAction ? null : "" }, "Reroll last"));
  trow.appendChild(el("button", { "data-action": "undo" }, "Undo"));
  trow.appendChild(el("button", { "data-action": "skip-room" }, "Skip room"));
  const advanceDisabled = !["cleared", "defeat"].includes(exp.roomStatus) ? "" : null;
  trow.appendChild(el("button", { "data-action": "advance-room", class: "primary", disabled: advanceDisabled }, "Next room"));
  tools.appendChild(trow);

  const narr = el("div", { class: "row" });
  narr.appendChild(el("input", { id: "gm-narrate", placeholder: "Narrate to Stage..." }));
  narr.appendChild(el("button", { "data-action": "narrate" }, "Send"));
  tools.appendChild(narr);

  const adj = el("div", { class: "party-adjust" });
  adj.appendChild(el("div", { class: "label" }, "Adjust party"));
  for (const p of s.players) {
    const rw = el("div", { class: "pa-row" });
    rw.appendChild(el("span", { style: "width:110px" }, p.name));
    rw.appendChild(el("button", { "data-action": "hp-minus", "data-value": p.id }, "-HP"));
    rw.appendChild(el("span", { class: "muted" }, `HP ${p.hp}/${p.maxHp}`));
    rw.appendChild(el("button", { "data-action": "hp-plus", "data-value": p.id }, "+HP"));
    rw.appendChild(el("button", { "data-action": "focus-minus", "data-value": p.id }, "-F"));
    rw.appendChild(el("span", { class: "muted" }, `F ${p.focus}/${p.maxFocus}`));
    rw.appendChild(el("button", { "data-action": "focus-plus", "data-value": p.id }, "+F"));
    adj.appendChild(rw);
  }
  const scoreRow = el("div", { class: "pa-row" });
  scoreRow.appendChild(el("span", { style: "width:110px" }, "Party score"));
  scoreRow.appendChild(el("button", { "data-action": "score-minus" }, "-1"));
  scoreRow.appendChild(el("span", { class: "muted" }, `Score ${s.party.score} | Gold ${s.party.gold}`));
  scoreRow.appendChild(el("button", { "data-action": "score-plus" }, "+1"));
  adj.appendChild(scoreRow);
  tools.appendChild(adj);
  body.appendChild(tools);

  body.appendChild(el("button", { "data-action": "retreat", class: "danger" }, "End expedition (retreat)"));
  body.appendChild(el("button", { "data-action": "back-to-lobby" }, "Back to lobby"));
  body.appendChild(el("button", { "data-action": "delete-save", class: "danger" }, "Delete save"));
  return body;
}
