// GM Console view (v2 + PART 1B): teacher's control panel.
// Authoritative. Step bar + ONE primary button per step (Space triggers),
// keys 1-4 pick approach, keys 1/2/3 grade. Tools collapsed. Disabled controls
// always show a reason. Read-only no spoilers on the Stage only.
import { getState, subscribe } from "../engine/state.js";
import { getContent } from "../engine/content.js";
import * as actions from "../engine/actions.js";
import { getView, currentStep } from "../engine/view.js";
import { el, bar } from "./util.js";

const STEPS = ["listen", "choose", "sayit", "roll", "result"];
const STEP_LABEL = { listen: "LISTEN", choose: "CHOOSE", sayit: "SAY IT", roll: "ROLL", result: "RESULT" };
const TEXT_SIZE_KEY = "classroom-rpg-gm-textsize";

export function mountGm(container) {
  const root = el("div", { class: "gm" });
  container.appendChild(root);

  // persisted text-size control (A+/A-)
  let textPct = parseInt(localStorage.getItem(TEXT_SIZE_KEY) || "100", 10);
  const applyText = () => { root.style.fontSize = `${textPct}%`; };
  applyText();

  root.addEventListener("click", onAction);
  root.addEventListener("change", onChange);
  render();
  subscribe(() => render());

  // keyboard: Space triggers the primary button; 1-4 approach; 1/2/3 grade
  window.addEventListener("keydown", onKey);

  function onKey(ev) {
    if (ev.repeat) return;
    if (ev.key === " " || ev.key === "Enter") {
      const primary = root.querySelector(".primary-step:not([disabled])");
      if (primary) { ev.preventDefault(); primary.click(); }
      return;
    }
    const s = getState();
    const step = currentStep(s);
    const isCombat = s.expedition && s.expedition.roomStatus === "combat";
    if (step === "choose") {
      const n = parseInt(ev.key, 10);
      if (isCombat) {
        if (n >= 1 && n <= 4) {
          const b = root.querySelector(`[data-skill-num="${n}"]`);
          if (b && !b.disabled) b.click();
        }
      } else {
        const letter = ev.key.toUpperCase();
        let chosen = null;
        if (n >= 1 && n <= 3) chosen = root.querySelector(`[data-approach-num="${n}"]`);
        else if (["A", "B", "C"].includes(letter)) chosen = root.querySelector(`[data-approach-key="${letter}"]`);
        if (chosen && !chosen.disabled) chosen.click();
      }
    } else if (step === "sayit") {
      const isCombat = s.expedition && s.expedition.roomStatus === "combat";
      const act = isCombat ? "judge-lang" : "grade-story";
      if (ev.key === "1") { const b = root.querySelector(`[data-action="${act}"][data-value="0"]`); if (b) b.click(); }
      else if (ev.key === "2") { const b = root.querySelector(`[data-action="${act}"][data-value="2"]`); if (b) b.click(); }
      else if (ev.key === "3") { const b = root.querySelector(`[data-action="${act}"][data-value="4"]`); if (b) b.click(); }
    }
  }

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
      case "start-episode": {
        actions.startEpisode(value);
        break;
      }
      case "story-continue":
        actions.storyContinue();
        break;
      case "primary-attack": {
        const exp = getState().expedition;
        if (exp && exp.activePlayerId) {
          actions.chooseAction(exp.activePlayerId, null);
        }
        break;
      }
      case "noop":
        break;
      case "choose-approach": {
        actions.chooseStoryApproach(value);
        break;
      }
      case "grade-story":
        actions.gradeStory(parseInt(value, 10));
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
      case "text-plus":
        textPct = Math.min(140, textPct + 10);
        localStorage.setItem(TEXT_SIZE_KEY, String(textPct));
        applyText();
        break;
      case "text-minus":
        textPct = Math.max(80, textPct - 10);
        localStorage.setItem(TEXT_SIZE_KEY, String(textPct));
        applyText();
        break;
      case "open-stage":
        window.open("stage.html", "classroom-stage");
        break;
    }
  }

  function render() {
    const s = getState();
    // D8: preserve UI state across the DOM rebuild
    const tools = root.querySelector(".tools");
    const toolsOpen = tools ? tools.open : null;
    const narr = root.querySelector("#gm-narrate");
    const narrValue = narr ? narr.value : null;
    const active = document.activeElement;
    const activeId = active && active.id ? active.id : null;
    root.innerHTML = "";
    root.appendChild(renderTop(s));
    if (s.phase === "lobby") root.appendChild(renderLobby(s));
    else root.appendChild(renderPlay(s));
    if (toolsOpen !== null) {
      const t2 = root.querySelector(".tools");
      if (t2) t2.open = toolsOpen;
    }
    if (narrValue !== null) {
      const n2 = root.querySelector("#gm-narrate");
      if (n2) n2.value = narrValue;
    }
    if (activeId) {
      const a2 = root.querySelector("#" + activeId);
      if (a2) a2.focus();
    }
  }
}

function className(id) {
  const c = getContent().classes.find((x) => x.id === id);
  return c ? c.name : "?";
}

function stepBar(s) {
  const cur = currentStep(s);
  if (!cur) return null;
  const barEl = el("div", { class: "step-bar" });
  for (const st of STEPS) {
    barEl.appendChild(el("span", { class: "step" + (st === cur ? " current" : "") + (STEPS.indexOf(st) < STEPS.indexOf(cur) ? " done" : "") }, STEP_LABEL[st]));
  }
  return barEl;
}

function primaryLabel(s) {
  const step = currentStep(s);
  if (!step) return null;
  const isCombat = s.expedition && s.expedition.roomStatus === "combat";
  if (step === "listen") return { text: "Continue", reason: null };
  if (step === "choose") return isCombat ? { text: "Attack (free) — or pick a skill (1-4)", reason: null } : { text: "Pick an approach (1-4)", reason: null };
  if (step === "sayit") return isCombat ? { text: "Grade the answer (1=Weak 2=Good 3=Great)", reason: "Choose a grade" } : { text: "Grade the answer (1=Weak 2=Good 3=Great)", reason: "Choose a grade" };
  if (step === "roll") return { text: "Roll d20", reason: null };
  if (step === "result") return { text: "Next scene", reason: null };
  return null;
}

function renderTop(s) {
  const wrap = el("div");
  const bar = stepBar(s);
  if (bar) wrap.appendChild(bar);
  wrap.appendChild(el("div", { class: "gm-hint" }, nextHint(s)));
  return wrap;
}

function nextHint(s) {
  const exp = s.expedition;
  if (!exp) return "Set up the party, then start a Story or an Expedition.";
  const step = currentStep(s);
  if (s.phase === "victory") return "Story complete — review the recap, then go back to lobby.";
  if (s.phase === "defeated") return "The story is over — go back to lobby.";
  if (step === "listen") return "The class is listening. Press Continue (Space) when ready.";
  if (step === "choose") return "The class picks an approach. Number keys 1-4.";
  if (step === "sayit") return "The class speaks. Grade it: 1=Weak, 2=Good, 3=Great.";
  if (step === "roll") return "The class spoke. Press Space to roll the d20.";
  if (step === "result") return "Outcome shown. Press Continue (Space) for the next scene.";
  return "Advance when ready.";
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

  // two-screen: open the Stage window
  const two = el("div", { class: "window" });
  two.appendChild(el("h3", {}, "Two screens"));
  two.appendChild(el("button", { "data-action": "open-stage", class: "primary" }, "Open Stage window"));
  two.appendChild(el("p", { class: "muted" }, "Drag it to the projector, press F11."));
  body.appendChild(two);

  // episodes (scripted stories)
  const eps = getContent().episodes;
  if (eps && eps.length > 0) {
    body.appendChild(el("h2", {}, "Story episodes"));
    for (const ep of eps) {
      const row = el("div", { class: "player-row" });
      row.appendChild(el("span", { class: "pname" }, ep.name));
      row.appendChild(el("button", { "data-action": "start-episode", "data-value": ep.id, class: "primary", disabled: ready ? null : "" }, `Play story (${ep.scenes.length} scenes)`));
      body.appendChild(row);
    }
  }

  body.appendChild(el("h2", {}, "Random Expedition"));
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

  // text size
  const ts = el("div", { class: "row" });
  ts.appendChild(el("span", { class: "label" }, "Text size"));
  ts.appendChild(el("button", { "data-action": "text-minus", class: "btn" }, "A-"));
  ts.appendChild(el("button", { "data-action": "text-plus", class: "btn" }, "A+"));
  body.appendChild(ts);

  body.appendChild(el("button", { "data-action": "delete-save", class: "danger" }, "Delete save"));
  return body;
}

function renderPlay(s) {
  const body = el("div");
  const exp = s.expedition;
  const view = getView(s);

  if (s.phase === "victory" || s.phase === "defeated") {
    const won = s.phase === "victory";
    body.appendChild(el("h2", {}, won ? "Story Complete!" : "Story Over"));
    body.appendChild(el("p", { class: "muted" }, `Spark: ${s.party.score}`));
    body.appendChild(el("button", { "data-action": "back-to-lobby", class: "primary" }, "Back to lobby"));
    return body;
  }

  const room = exp.rooms[exp.current];
  const actor = s.players.find((p) => p.id === exp.activePlayerId);
  const step = currentStep(s);

  // current state panel
  const panel = el("div", { class: "window state-panel" });
  panel.appendChild(el("div", {}, `Scene ${exp.current + 1}/${exp.rooms.length} — ${view.title || exp.deckName}`));
  if (view.read) panel.appendChild(el("p", { class: "read-aloud" }, view.read));
  if (view.monster) {
    panel.appendChild(el("div", {}, `Enemy: ${view.monster.name}`));
    panel.appendChild(bar(view.monster.hp, view.monster.maxHp, "hp"));
  }
  body.appendChild(panel);

  // primary step control
  const prim = primaryLabel(s);
  if (prim) {
    const p = el("div", { class: "primary-step-wrap" });
    const isCombat = exp.roomStatus === "combat";
    const act = step === "choose" && isCombat ? "primary-attack" : step === "sayit" ? "noop" : "story-continue";
    const btn = el("button", { "data-action": act, class: "primary primary-step", disabled: prim.reason ? "" : null }, prim.text);
    if (prim.reason) btn.title = prim.reason;
    p.appendChild(btn);
    if (prim.reason) p.appendChild(el("span", { class: "muted disabled-reason" }, prim.reason));
    body.appendChild(p);
  }

  // CHOOSE: approach cards (story, from the view) or skills (combat)
  if (step === "choose") {
    if (exp.storyChoices && view.cards.length) {
      const choose = el("div", { class: "window" });
      choose.appendChild(el("h3", {}, "Choose an approach (keys 1-4)"));
      const actorC = s.players.find((p) => p.id === exp.storyActor);
      if (actorC) choose.appendChild(el("p", { class: "muted" }, `Approach as ${actorC.name} (${className(actorC.classId)}):`));
      view.cards.forEach((c, i) => {
        choose.appendChild(el("button", {
          "data-action": "choose-approach",
          "data-value": c.id,
          "data-approach-num": String(i + 1),
          "data-approach-key": c.key,
          class: "approach-btn",
        }, `${c.key}. ${c.label} — ${classNameStat(c.stat)} (${c.stars})`));
      });
      body.appendChild(choose);
    } else if (exp.roomStatus === "combat") {
      const actorC = s.players.find((p) => p.id === exp.activePlayerId);
      if (actorC && !actorC.npc) {
        const choose = el("div", { class: "window" });
        choose.appendChild(el("h3", {}, `${actorC.name} — choose a skill (keys 1-4)`));
        const cls = getContent().classes.find((c) => c.id === actorC.classId);
        const skills = [null, ...cls.skillIds];
        skills.forEach((sid, i) => {
          const sk = sid ? getContent().skills.find((x) => x.id === sid) : null;
          const afford = !sk || actorC.focus >= sk.cost;
          choose.appendChild(el("button", {
            "data-action": "use-skill",
            "data-value": JSON.stringify({ playerId: actorC.id, skillId: sid }),
            "data-skill-num": String(i + 1),
            class: "approach-btn",
            disabled: afford ? null : "",
            title: afford ? null : "Not enough Focus",
          }, `${i + 1}. ${sk ? sk.name : "Basic attack"} ${sk ? `(${sk.cost} F) — ${sk.flavour}` : "(free)"}`));
        });
        body.appendChild(choose);
      }
    }
  }

  // SAY IT: prompt + grade buttons (keys 1/2/3) — combat uses judge-lang, story uses grade-story
  if (step === "sayit" && view.ask) {
    const isCombat = exp.roomStatus === "combat";
    const act = isCombat ? "judge-lang" : "grade-story";
    const say = el("div", { class: "window" });
    say.appendChild(el("h3", {}, "Say it"));
    say.appendChild(el("p", {}, `Say it: ${view.ask}`));
    if (view.hints.target) say.appendChild(el("p", { class: "muted" }, `Teacher hint — target: ${view.hints.target}`));
    if (view.hints.example) say.appendChild(el("p", { class: "muted" }, `Teacher hint — example: ${view.hints.example}`));
    const row = el("div", { class: "row" });
    row.appendChild(el("button", { "data-action": act, "data-value": "0" }, "1 · Weak (+0)"));
    row.appendChild(el("button", { "data-action": act, "data-value": "2", class: "success" }, "2 · Good (+2)"));
    row.appendChild(el("button", { "data-action": act, "data-value": "4", class: "primary" }, "3 · Great (+4)"));
    say.appendChild(row);
    body.appendChild(say);
  }

  // ROLL: show the d20 result (read-only on GM too)
  if (step === "roll" && exp.lastRoll) {
    const r = exp.lastRoll;
    const res = r.crit ? "CRIT!" : r.fumble ? "FUMBLE!" : r.success ? "success" : "fail";
    body.appendChild(el("div", { class: "window" }, `d20=${r.d20} + mod ${r.mod} + lang ${r.langBonus} + story ${r.assistBonus} = ${r.total} vs ${r.difficulty} → ${res}`));
  }

  // RESULT: (narration is in the log; primary advances)
  if (step === "result") {
    body.appendChild(el("div", { class: "window" }, "Outcome shown on the Stage. Press Next scene to continue."));
  }

  // assists (during sayit/acting, other players can add to the story) — episode
  // story sayit/roll too (D5)
  const assistStep = (exp.actionPhase === "acting" && exp.pending && exp.pending.playerId) || (exp.mode === "episode" && exp.roomStatus === "story" && (step === "sayit" || step === "roll") && exp.pending && exp.pending.playerId);
  if (assistStep) {
    const others = s.players.filter((p) => p.id !== exp.pending.playerId && !p.npc);
    if (others.length) {
      const ass = el("div", { class: "window" });
      ass.appendChild(el("h3", {}, "Add to the story (+1 each, max +2)"));
      const row = el("div", { class: "assist-row" });
      for (const p of others) {
        const used = exp.assistUsed.includes(p.id);
        row.appendChild(el("button", { "data-action": "grant-assist", "data-value": p.id, disabled: used ? "" : null }, `${p.name} ${used ? "(helped)" : "+1"}`));
      }
      ass.appendChild(row);
      body.appendChild(ass);
    }
  }

  // Tools (collapsed)
  const tools = el("details", { class: "tools" });
  tools.appendChild(el("summary", {}, "Tools"));
  const trow = el("div", { class: "row" });
  trow.appendChild(el("button", { "data-action": "reroll", disabled: exp.lastAction ? null : "", title: exp.lastAction ? null : "No action to reroll yet" }, "Reroll last"));
  trow.appendChild(el("button", { "data-action": "undo" }, "Undo"));
  trow.appendChild(el("button", { "data-action": "skip-room" }, "Skip room"));
  const advDisabled = !["cleared", "defeat"].includes(exp.roomStatus);
  trow.appendChild(el("button", { "data-action": "advance-room", class: "primary", disabled: advDisabled ? "" : null, title: advDisabled ? "Finish the current step first" : null }, "Next room"));
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
  scoreRow.appendChild(el("span", { style: "width:110px" }, "Spark"));
  scoreRow.appendChild(el("button", { "data-action": "score-minus" }, "-1"));
  scoreRow.appendChild(el("span", { class: "muted" }, `Spark ${s.party.score}`));
  scoreRow.appendChild(el("button", { "data-action": "score-plus" }, "+1"));
  adj.appendChild(scoreRow);
  tools.appendChild(adj);
  body.appendChild(tools);

  body.appendChild(el("button", { "data-action": "retreat", class: "danger" }, "End story (retreat)"));
  body.appendChild(el("button", { "data-action": "back-to-lobby" }, "Back to lobby"));
  body.appendChild(el("button", { "data-action": "delete-save", class: "danger" }, "Delete save"));
  return body;
}

function classNameStat(stat) {
  return { might: "Might", agility: "Agility", mind: "Mind", heart: "Heart" }[stat] || stat;
}
