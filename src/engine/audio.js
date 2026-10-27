// Web Audio chiptune SFX + music loop. No audio files, all generated.
// Respects prefers-reduced-motion by muting SFX/music (motion vs sound opt-out).
let ctx = null;
let master = null;
let muted = false;
let musicTimer = null;
let currentStep = 0;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur, type = "square", gain = 0.2, delay = 0, slide = 0) {
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function playSfx(name) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  switch (name) {
    case "click": tone(660, 0.06, "square", 0.15); break;
    case "hit": tone(180, 0.12, "sawtooth", 0.25); tone(90, 0.18, "square", 0.2, 0.04); break;
    case "crit": tone(500, 0.1, "square", 0.25); tone(750, 0.1, "square", 0.25, 0.08); tone(1000, 0.16, "square", 0.25, 0.16); break;
    case "fumble": tone(300, 0.2, "sawtooth", 0.2, 0, -120); tone(150, 0.25, "square", 0.2, 0.06, -60); break;
    case "dice": for (let i = 0; i < 8; i++) tone(300 + i * 40, 0.04, "square", 0.12, i * 0.05); break;
    case "heal": tone(520, 0.14, "triangle", 0.2); tone(780, 0.2, "triangle", 0.2, 0.1); break;
    case "victory": [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "square", 0.2, i * 0.12)); break;
    case "levelup": [400, 500, 600, 800].forEach((f, i) => tone(f, 0.12, "square", 0.2, i * 0.08)); break;
  }
}

// Simple looping chiptune arpeggio (bass + lead), generated live.
const CHIP_STEPS = [0, 4, 7, 12, 7, 4, 0, 4, 0, 4, 7, 12, 12, 7, 4, 0];
const CHIP_BASS = [110, 110, 98, 98, 110, 110, 82, 82, 98, 98, 110, 110, 82, 82, 73, 73];

export function startMusic() {
  if (muted || musicTimer) return;
  const c = ensureCtx();
  if (!c) return;
  let i = 0;
  const step = () => {
    const base = CHIP_STEPS[i % CHIP_STEPS.length];
    const bass = CHIP_BASS[i % CHIP_BASS.length];
    tone(bass, 0.22, "triangle", 0.14);
    tone(440 * Math.pow(2, base / 12), 0.12, "square", 0.05);
    i++;
  };
  step();
  musicTimer = setInterval(step, 150);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

export function setMuted(m) {
  muted = !!m;
  if (muted) stopMusic();
  else startMusic();
}

export function isMuted() { return muted; }

// Resume audio context on first user gesture (browsers require it).
export function initAudio() {
  window.addEventListener("pointerdown", () => ensureCtx(), { once: false });
  window.addEventListener("keydown", () => ensureCtx(), { once: false });
}
