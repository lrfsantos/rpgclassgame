// Stage view (v2): what students see on the projector. Read-only, no spoilers,
// no teacher-only info (language hints stay in the GM console).
import { getState, subscribe } from "../engine/state.js";
import { getContent } from "../engine/content.js";
import { el, bar } from "./util.js";

export function mountStage(container) {
  const root = el("div", { class: "stage" });
  container.appendChild(root);
  render();
  subscribe(() => render());

  function render() {
    const state = getState();
    root.innerHTML = "";
    const mainRow = el("div", { class: "stage-main" });
    mainRow.appendChild(renderMain(state));
    const log = renderLog(state);
    if (log) mainRow.appendChild(log);
    root.appendChild(renderHeader(state));
    root.appendChild(renderRoster(state));
    root.appendChild(mainRow);
  }
}

function renderHeader(s) {
  const left = el("div", { class: "app-title" }, "Classroom RPG");
  const right = el("div", { class: "header-stats" });
  if (s.phase === "expedition") {
    const exp = s.expedition;
    right.appendChild(el("span", { class: "badge" }, `Room ${exp.current + 1}/${exp.rooms.length}`));
    right.appendChild(el("span", { class: "badge" }, exp.deckName));
  }
  if (s.party && (s.party.score > 0 || s.party.gold > 0)) {
    right.appendChild(el("span", { class: "badge" }, `Score ${s.party.score}`));
    right.appendChild(el("span", { class: "badge" }, `Gold ${s.party.gold}`));
  }
  return el("header", { class: "stage-header" }, [left, right]);
}

function renderRoster(s) {
  const wrap = el("div", { class: "roster" });
  if (s.players.length === 0) {
    wrap.appendChild(el("div", { class: "muted" }, "No players yet."));
    return wrap;
  }
  for (const p of s.players) {
    const card = el("div", { class: "roster-card" });
    card.appendChild(el("div", { class: "roster-name" }, `${p.name}${p.npc ? " (NPC)" : ""}`));
    card.appendChild(el("div", { class: "roster-class" }, p.classId ? className(p.classId) : "no class"));
    card.appendChild(bar(p.hp, p.maxHp, "hp"));
    card.appendChild(bar(p.focus, p.maxFocus, "focus"));
    card.classList.toggle("acting", s.phase === "expedition" && s.expedition && s.expedition.activePlayerId === p.id && s.expedition.actionPhase === "choosing");
    card.classList.toggle("dazed", p.hp === 0);
    wrap.appendChild(card);
  }
  return wrap;
}

function className(id) {
  const c = getContent().classes.find((x) => x.id === id);
  return c ? c.name : "?";
}

function renderMain(s) {
  if (s.phase === "lobby") {
    return el("section", { class: "big" },
      el("div", { class: "big-title" }, "The Adventure Awaits"),
      el("div", { class: "big-sub" }, `${s.players.length} hero(es) ready. Teacher: press G to open the GM console.`),
    );
  }
  if (s.phase === "victory" || s.phase === "defeated") {
    const won = s.phase === "victory";
    return el("section", { class: "big" },
      el("div", { class: "big-title " + (won ? "win" : "lose") }, won ? "Expedition Complete!" : "Expedition Over"),
      el("div", { class: "big-sub" }, won
        ? `The whole class wins! Score ${s.party.score} | Gold ${s.party.gold}`
        : `The party lives to try again. Score ${s.party.score} | Gold ${s.party.gold}`),
    );
  }
  return renderRoom(s);
}

function renderRoom(s) {
  const exp = s.expedition;
  const room = exp.rooms[exp.current];
  const section = el("section", { class: "room-pane" });
  section.appendChild(el("div", { class: "room-name" }, room.flavour));

  if (exp.monster) {
    const en = el("div", { class: "enemy" });
    en.appendChild(el("div", { class: "ename" }, exp.monster.name));
    en.appendChild(bar(exp.monster.hp, exp.monster.maxHp, "hp"));
    if (exp.monster.quirk) en.appendChild(el("div", { class: "muted" }, `Quirk: ${exp.monster.quirk}`));
    section.appendChild(en);
  }

  const actor = s.players.find((p) => p.id === exp.activePlayerId);
  if (actor && !actor.npc && (exp.roomStatus === "combat" || exp.roomStatus === "challenge" || exp.roomStatus === "trap") && exp.actionPhase === "choosing") {
    const ap = el("div", { class: "actor-panel" });
    ap.appendChild(el("div", { class: "actor-name" }, `${actor.name} (${className(actor.classId)}) — your turn!`));
    const cls = getContent().classes.find((c) => c.id === actor.classId);
    const skills = el("div", { class: "actor-skills" });
    skills.appendChild(el("span", {}, "Basic attack (free)"));
    for (const sid of cls.skillIds) {
      const sk = getContent().skills.find((x) => x.id === sid);
      skills.appendChild(el("span", {}, `${sk.name} (${sk.cost} Focus)`));
    }
    ap.appendChild(skills);
    section.appendChild(ap);
  }

  if (exp.actionPhase === "acting" && exp.langPrompt) {
    const say = el("div", { class: "sayit" });
    say.appendChild(el("div", { class: "prompt" }, `Say it: ${exp.langPrompt.text}`));
    section.appendChild(say);
  }

  if (exp.lastRoll) {
    const r = exp.lastRoll;
    const res = r.crit ? "CRIT!" : r.fumble ? "FUMBLE!" : r.success ? "success" : "fail";
    section.appendChild(el("div", { class: "roll-line" },
      el("span", { class: "big" }, `d20 ${r.d20}`),
      el("span", {}, ` + mod ${r.mod}`),
      el("span", {}, r.langBonus ? ` + language ${r.langBonus}` : ""),
      el("span", {}, r.assistBonus ? ` + assist ${r.assistBonus}` : ""),
      el("span", {}, ` = ${r.total} vs ${r.difficulty}`),
      el("span", { class: r.crit ? "roll-crit" : r.success ? "roll-success" : "roll-fail" }, ` → ${res}`),
    ));
  }

  const st = exp.roomStatus;
  if (st === "cleared") section.appendChild(el("div", { class: "muted" }, "Room cleared — wait for the teacher."));
  else if (st === "defeat") section.appendChild(el("div", { class: "roll-fail" }, "The party is overwhelmed..."));
  else if (st === "challenge") section.appendChild(el("div", { class: "muted" }, "A challenge! Whoever rolls leads the way."));
  else if (st === "trap") section.appendChild(el("div", { class: "muted" }, "Watch your step — a trap!"));

  return section;
}

function renderLog(s) {
  if (!s.expedition) return null;
  const feed = el("aside", { class: "log" });
  feed.appendChild(el("div", { class: "log-title" }, "Adventure Log"));
  const ul = el("ul", { class: "log-list" });
  for (const entry of s.expedition.log) {
    const li = el("li", { class: `log-entry log-${entry.kind}` }, entry.text);
    ul.appendChild(li);
  }
  feed.appendChild(ul);
  return feed;
}
