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

  let got = false;
  const channel = openStageChannel((msg) => {
    if (msg.state) {
      got = true;
      applyIfNewer(msg.state);
    }
  });
  const stopWatch = state.watchStorage((s) => {
    if (s === null) { /* save cleared */ return; }
    applyIfNewer(s);
  });

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
  if (!cur || cur.rev === undefined || s.rev === undefined || s.rev >= cur.rev) {
    // Keep schema guard: stage only ingests states it understands.
    if (s && s.schema === 2) state.ingest(s);
  }
}

function bootGm() {
  state.init();
  mountGm(document.getElementById("gm"));
  const channel = openGmChannel(() => state.publishable());
  if (channel) {
    state.subscribe(() => channel.broadcast());
    channel.broadcast();
    window.addEventListener("beforeunload", () => channel.close());
  }
}

function bootSingle() {
  state.init();
  mountStage(document.getElementById("stage"));
  mountGm(document.getElementById("gm"));
  const channel = openGmChannel(() => state.publishable());
  if (channel) {
    state.subscribe(() => channel.broadcast());
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
    const key = ev.key.toLowerCase();
    if (key === "g" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      toggle();
    } else if (ev.key === "Escape") {
      toggle(false);
    }
  });
}

function openStageWindow() {
  window.open("stage.html", "classroom-stage");
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
