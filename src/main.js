// Entry point. Routes based on the current page:
//  - gm.html     -> GM console (authoritative) + broadcast on change
//  - stage.html  -> stage view, requests/ingests broadcast state
//  - index.html  -> single-window: stage fullscreen + GM drawer toggled by G
import { loadContent, ContentError } from "./engine/content.js";
import * as state from "./engine/state.js";
import { mountStage } from "./ui/stage.js";
import { mountGm } from "./ui/gm.js";
import { openGmChannel, openStageChannel } from "./sync/broadcast.js";

export const VERSION = "v2.2.0";
const page = window.location.pathname.split("/").pop() || "index.html";

async function boot() {
  try {
    await loadContent();
  } catch (e) {
    renderContentError(e);
    return;
  }

  if (page === "stage.html") {
    bootStage();
  } else if (page === "gm.html") {
    await chooseStart();
    bootGm();
  } else {
    // index.html
    await chooseStart();
    bootSingle();
  }
}

function bootStage() {
  state.init();
  mountStage(document.getElementById("stage"));

  const DEBUG = new URLSearchParams(window.location.search).get("debug") === "1";
  let lastSource = "none";
  let lastUpdateAt = 0;
  let lastRenderError = "";

  let got = false;
  const channel = openStageChannel((msg) => {
    if (msg.state) {
      got = true;
      lastSource = "BC";
      applyIfNewer(msg.state);
      ack(msg.state);
    }
  });
  const stopWatch = state.watchStorage((s) => {
    if (s === null) { /* save cleared */ return; }
    lastSource = "storage";
    applyIfNewer(s);
    ack(s);
  });

  // (F2c) poll fallback: read the save key and apply if newer, covering dropped
  // storage/broadcast events. Writes the ack each time it sees a new revision.
  const poll = () => {
    try {
      const raw = localStorage.getItem("classroom-rpg-save-v1");
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || s.schema !== 2) return;
      lastSource = "poll";
      applyIfNewer(s);
      ack(s);
    } catch (e) { /* ignore */ }
  };
  setInterval(poll, 500);

  // (F2c) direct transport (Stage side): accept postMessage from the GM that
  // opened us, and pull window.opener.__rpgPublishable() every 300ms when the
  // opener is same-origin (covers dropped postMessage / BC / storage events).
  window.addEventListener("message", (ev) => {
    if (ev.origin !== location.origin) return;
    const msg = ev.data || {};
    if (msg.type === "state" && msg.state) {
      lastSource = "opener";
      applyIfNewer(msg.state);
      ack(msg.state);
    }
  });
  if (window.opener && window.opener !== window) {
    const pull = () => {
      try {
        if (window.opener && window.opener.__rpgPublishable) {
          const s = window.opener.__rpgPublishable();
          if (s) { lastSource = "opener-poll"; applyIfNewer(s); ack(s); }
        }
      } catch (e) { /* cross-origin or gone */ }
    };
    pull();
    setInterval(pull, 300);
  }

  // (F2d) Stage writes its ack to a dedicated key (never the save key) so the GM
  // can show the "Stage: in sync / behind / not detected" indicator.
  const ACK_KEY = "classroom-rpg-stage-ack";
  function ack(s) {
    if (!s || s.rev === undefined) return;
    try {
      lastUpdateAt = Date.now();
      localStorage.setItem(ACK_KEY, JSON.stringify({ session: s.session, rev: s.rev, t: Date.now() }));
    } catch (e) { /* ignore */ }
  }
  window.__rpgStageAck = ack;

  // (F2d) ?debug=1 corner overlay: session, rev, source, seconds since last
  // update, last render error.
  if (DEBUG) {
    const box = document.createElement("div");
    box.className = "stage-debug";
    box.id = "stage-debug";
    document.body.appendChild(box);
    const refresh = () => {
      const cur = state.getState();
      const since = lastUpdateAt ? ((Date.now() - lastUpdateAt) / 1000).toFixed(1) : "-";
      box.textContent = `session ${cur.session || "-"} rev ${cur.rev} src ${lastSource} last ${since}s err ${lastRenderError || "-"}`;
    };
    setInterval(refresh, 1000);
    refresh();
  }
  window.addEventListener("error", (ev) => { lastRenderError = ev.message + " " + (ev.filename || "").split("/").pop() + ":" + (ev.lineno || ""); });

  // Pending request so a freshly opened GM answers immediately.
  const tryRequest = () => {
    if (!got && channel) channel.request();
  };
  tryRequest();
  setInterval(tryRequest, 3000);
  window.addEventListener("focus", tryRequest);
  window.addEventListener("beforeunload", () => {
    if (channel) channel.close();
    stopWatch();
  });
}

function applyIfNewer(s) {
  const cur = state.getState();
  if (!cur || cur.rev === undefined || s.rev === undefined) return;
  // different session = the GM restarted fresh (storage cleared); accept it and
  // drop the old rev baseline so the Stage stops ignoring a lower-rev state (D15)
  if (cur.session && s.session && cur.session !== s.session) {
    if (s && s.schema === 2) state.ingest(s);
    return;
  }
  if (s.rev >= cur.rev) {
    // Keep schema guard: stage only ingests states it understands.
    if (s && s.schema === 2) state.ingest(s);
  }
}

function bootGm() {
  state.init();
  mountGm(document.getElementById("gm"));
  exposePublishable();
  const channel = openGmChannel(() => state.publishable());
  if (channel) {
    state.subscribe(() => { channel.broadcast(); pushToStage(); });
    channel.broadcast();
    window.addEventListener("beforeunload", () => channel.close());
  }
}

// (F2c) direct transport: the GM keeps a reference to the Stage window it opened
// and pushes state to it via postMessage after every mutation, in addition to
// BroadcastChannel + the storage event.
let stageWin = null;
function exposePublishable() {
  window.__rpgPublishable = () => state.publishable();
  window.__rpgSetStageWin = (w) => { stageWin = w; };
}
function pushToStage() {
  if (!stageWin) return;
  try {
    stageWin.postMessage({ type: "state", state: state.publishable() }, location.origin);
  } catch (e) { /* ignore */ }
}
export { pushToStage };

function bootSingle() {
  state.init();
  exposePublishable();
  mountStage(document.getElementById("stage"));
  mountGm(document.getElementById("gm"));
  const channel = openGmChannel(() => state.publishable());
  if (channel) {
    state.subscribe(() => { channel.broadcast(); pushToStage(); });
    channel.broadcast();
  }

  const openBtn = document.getElementById("gm-drawer-open");
  const closeBtn = document.getElementById("gm-drawer-close");
  const popStage = document.getElementById("gm-pop-stage");
  const drawer = document.getElementById("gm-drawer");
  const toggle = (force) => {
    const opening = typeof force === "boolean" ? force : !drawer.classList.contains("open");
    drawer.classList.toggle("open", opening);
    if (opening) closeBtn.focus();
    else openBtn.focus();
  };
  openBtn.addEventListener("click", () => toggle());
  closeBtn.addEventListener("click", () => toggle(false));
  if (popStage) popStage.addEventListener("click", () => openStageWindow());

  window.addEventListener("keydown", (ev) => {
    // D13: never toggle the drawer while typing in an input/select/textarea
    const t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const key = ev.key.toLowerCase();
    if (key === "g" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      toggle();
    } else if (ev.key === "Escape") {
      toggle(false);
    }
  });
}

function openStageWindow() {
  const w = window.open("stage.html", "classroom-stage");
  if (w) {
    if (window.__rpgSetStageWin) window.__rpgSetStageWin(w);
  }
}

export { openStageWindow };

function chooseStart() {
  return new Promise((resolve) => {
    if (!state.hasSave()) {
      state.init();
      resolve();
      return;
    }
    const overlay = document.getElementById("start-overlay");
    overlay.classList.add("show");
    const cont = document.getElementById("start-continue");
    const neu = document.getElementById("start-new");
    cont.focus();
    const done = () => {
      overlay.classList.remove("show");
      resolve();
    };
    cont.addEventListener("click", () => done());
    neu.addEventListener("click", () => {
      state.reset();
      done();
    });
  });
}

function renderContentError(e) {
  const body = document.body;
  body.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "fatal";
  wrap.innerHTML = `<h1>Oops — something is broken</h1>
<p>The game could not load its content. This is probably a typo in one of the JSON files.</p>
<pre></pre>`;
  wrap.querySelector("pre").textContent = e instanceof ContentError ? e.message : String(e);
  body.appendChild(wrap);
}

boot();
