// Entry point. Routes based on the current page:
//  - gm.html     -> GM console (authoritative) + broadcast on change
//  - stage.html  -> stage view, requests/ingests broadcast state
//  - index.html  -> single-window: stage fullscreen + GM drawer toggled by G
import { loadContent, ContentError } from "./engine/content.js";
import * as state from "./engine/state.js";
import { mountStage } from "./ui/stage.js";
import { mountGm } from "./ui/gm.js";
import { openGmChannel, openStageChannel } from "./sync/broadcast.js";

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
      state.ingest(msg.state);
    }
  });

  if (channel) {
    // Keep asking until the GM console answers (it may open later).
    const tryRequest = () => {
      if (!got) channel.request();
    };
    tryRequest();
    setInterval(tryRequest, 3000);
    window.addEventListener("focus", tryRequest);
  } else {
    showNoBroadcast();
  }
}

function bootGm() {
  state.init();
  mountGm(document.getElementById("gm"));
  const channel = openGmChannel(() => state.getState());
  if (channel) {
    // broadcast after every change (mutation or first init)
    state.subscribe(() => channel.broadcast());
    channel.broadcast();
    window.addEventListener("beforeunload", () => channel.close());
  }
}

function bootSingle() {
  state.init();
  mountStage(document.getElementById("stage"));
  mountGm(document.getElementById("gm"));

  const openBtn = document.getElementById("gm-drawer-open");
  const closeBtn = document.getElementById("gm-drawer-close");
  const drawer = document.getElementById("gm-drawer");
  openBtn.addEventListener("click", () => drawer.classList.toggle("open"));
  closeBtn.addEventListener("click", () => drawer.classList.remove("open"));

  window.addEventListener("keydown", (ev) => {
    const key = ev.key.toLowerCase();
    if (key === "g" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      drawer.classList.toggle("open");
    } else if (ev.key === "Escape") {
      drawer.classList.remove("open");
    }
  });
}

function chooseStart() {
  return new Promise((resolve) => {
    if (!state.hasSave()) {
      state.init();
      resolve();
      return;
    }
    const overlay = document.getElementById("start-overlay");
    overlay.classList.add("show");
    document.getElementById("start-continue").addEventListener("click", () => {
      overlay.classList.remove("show");
      resolve();
    });
    document.getElementById("start-new").addEventListener("click", () => {
      state.reset();
      overlay.classList.remove("show");
      resolve();
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

function showNoBroadcast() {
  const body = document.body;
  const el = document.createElement("div");
  el.className = "fatal";
  el.innerHTML = `<h1>No connection</h1>
<p>This browser does not support BroadcastChannel, so the Stage cannot sync with the GM console.
Please use a recent version of Chrome, Edge, Firefox or Safari, or try single-window mode (index.html).</p>`;
  body.appendChild(el);
}

boot();
