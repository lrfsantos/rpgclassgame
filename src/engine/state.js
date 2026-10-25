// Authoritative game state + localStorage persistence + undo history.
// In two-window mode only the GM console calls mutate()/undo() and broadcasts
// the result; the stage replaces its local copy from the broadcast.

const SAVE_KEY = "classroom-rpg-save-v1";
const SCHEMA = 2;
const HISTORY_LIMIT = 60;

let state = null;
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
  state.history = remaining;
  save();
  emit();
  return true;
}

export function save() {
  try {
    const toSave = clone(state);
    delete toSave.history;
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn("save failed", e);
  }
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
    phase: "lobby",
    players: [],
    expedition: null,
    party: { score: 0, gold: 0 },
    settings: { languageCheck: "full", spotlight: 4, npcCompanion: false },
    history: [],
  };
}

export function init() {
  const saved = load();
  state = saved ? Object.assign(newGameState(), saved, { history: [] }) : newGameState();
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
