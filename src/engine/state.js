// Authoritative game state + localStorage persistence + undo history.
// In two-window mode only the GM console calls mutate()/undo() and broadcasts
// the result; the stage replaces its local copy from the broadcast.

const SAVE_KEY = "classroom-rpg-save-v1";
const SCHEMA = 2;
const HISTORY_LIMIT = 60;

let state = null;
let monotonicRev = 0; // highest rev ever seen; resets never lower it
let sessionId = null; // random session id, fixed for the life of the page
const subscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function emit() {
  for (const fn of subscribers) fn(state);
}

export function getState() {
  return state;
}

// Stage side: replace local copy from a broadcast (no history, no save).
export function ingest(s) {
  state = clone(s);
  emit();
}

function clone(s) {
  return JSON.parse(JSON.stringify(s));
}

// GM side: snapshot, mutate, persist, notify. Returns the action's return.
export function mutate(fn) {
  const prev = clone(state);
  delete prev.history;
  const next = clone(state);
  const result = fn(next);
  state = next;
  bumpRev();
  if (state.history) {
    state.history.push(prev);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
  }
  save();
  emit();
  return result;
}

// GM side: step the game state back one action.
export function undo() {
  if (!state.history || state.history.length === 0) return false;
  const remaining = state.history.slice(0, -1);
  const prev = state.history[state.history.length - 1];
  state = prev;
  bumpRev();
  state.history = remaining;
  save();
  emit();
  return true;
}

export function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(publishable()));
  } catch (e) {
    console.warn("save failed", e);
  }
}

// State without history: safe to broadcast and persist. Carries the page's
// session id so a Stage that saw a different session (e.g. after the GM reloads
// with cleared storage) can accept it and reset its rev baseline (D15).
export function publishable() {
  const s = clone(state);
  delete s.history;
  if (!s.session) s.session = getSessionId();
  return s;
}

export function getSessionId() {
  if (!sessionId) {
    sessionId = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }
  return sessionId;
}

function bumpRev() {
  state.rev = (state.rev || 0) + 1;
  if (state.rev > monotonicRev) monotonicRev = state.rev;
}

// Stage side: receive the save key from another page (same origin).
// cb receives the parsed state (or null). Returns an unsubscribe fn.
export function watchStorage(cb) {
  const onStorage = (ev) => {
    if (ev.key !== SAVE_KEY) return;
    if (!ev.newValue) {
      cb(null);
      return;
    }
    try {
      cb(JSON.parse(ev.newValue));
    } catch (e) {
      /* ignore bad payload */
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.schema === SCHEMA && parsed.phase) return parsed;
    }
  } catch (e) {
    console.warn("load failed", e);
  }
  return null;
}

export function newGameState() {
  return {
    schema: SCHEMA,
    rev: monotonicRev,
    phase: "lobby",
    players: [],
    expedition: null,
    party: { score: 0, gold: 0 },
    settings: { languageCheck: "full", spotlight: 4, npcCompanion: false, startersOnStage: true },
    history: [],
  };
}

export function init() {
  const saved = load();
  state = saved ? Object.assign(newGameState(), saved, { history: [] }) : newGameState();
  if (state.rev > monotonicRev) monotonicRev = state.rev;
  emit();
  return state;
}

export function hasSave() {
  return load() !== null;
}

export function reset() {
  state = newGameState();
  save();
  emit();
  return state;
}
