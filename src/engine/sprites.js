// Sprite system: reads assets/sprites/manifest.json, loads PNGs, and draws
// code-generated pixel placeholders when a PNG is missing (drop-in system).
// FF4-style: chunky pixels, party 32x48, enemies 64x64, bosses 128x128.
import { getContent } from "./content.js";

const MANIFEST_URL = "assets/sprites/manifest.json";
const PLACEHOLDER_SCALE = 3; // internal pixel grid unit before upscale

let manifest = null;
const cache = new Map(); // key -> { frames: [canvas], meta }

export async function loadSprites() {
  if (manifest) return manifest;
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error("no manifest");
    manifest = await res.json();
  } catch (e) {
    manifest = { characters: {}, monsters: {} };
  }
  return manifest;
}

export function getSpriteMeta(key) {
  if (!manifest) return null;
  return manifest.characters[key] || manifest.monsters[key] || null;
}

function px(canvas, x, y, color) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// ---- tiny pixel-art placeholder bodies ----
// Each draws onto a canvas of the given pixel dimensions, then we upscale.

function drawHero(canvas, palette) {
  const w = canvas.width, h = canvas.height;
  const [hair, skin, cloth, dark, trim] = palette;
  const cx = w >> 1;
  // legs
  for (let i = 0; i < 2; i++) px(canvas, cx - 5 + i * 4, h - 4, dark);
  // body
  for (let y = h - 16; y < h - 5; y++) for (let x = cx - 6; x <= cx + 6; x++) px(canvas, x, y, cloth);
  for (let y = h - 14; y < h - 11; y++) for (let x = cx - 6; x <= cx + 6; x += 2) px(canvas, x, y, trim);
  // arms
  for (let y = h - 15; y < h - 8; y++) { px(canvas, cx - 8, y, cloth); px(canvas, cx + 8, y, cloth); }
  // head
  for (let y = h - 24; y < h - 17; y++) for (let x = cx - 5; x <= cx + 5; x++) px(canvas, x, y, skin);
  // hair
  for (let y = h - 26; y < h - 21; y++) for (let x = cx - 6; x <= cx + 6; x++) px(canvas, x, y, hair);
  px(canvas, cx - 6, h - 22, hair); px(canvas, cx + 6, h - 22, hair);
  px(canvas, cx - 6, h - 23, hair); px(canvas, cx + 6, h - 23, hair);
  // eyes
  px(canvas, cx - 3, h - 21, dark); px(canvas, cx + 3, h - 21, dark);
}

function drawSlime(canvas, palette) {
  const w = canvas.width, h = canvas.height;
  const [main, dark, light] = palette;
  const cx = w >> 1;
  for (let y = h - 20; y < h - 4; y++) {
    const half = 10 + ((y - (h - 20)) >> 1);
    for (let x = cx - half; x <= cx + half; x++) px(canvas, x, y, main);
  }
  for (let x = cx - 3; x <= cx + 3; x++) px(canvas, x, h - 4, dark);
  px(canvas, cx - 4, h - 3, dark); px(canvas, cx + 4, h - 3, dark);
  px(canvas, cx - 4, h - 5, light); px(canvas, cx + 4, h - 5, light);
}

function drawBat(canvas, palette) {
  const w = canvas.width, h = canvas.height;
  const [body, wing, eye] = palette;
  const cx = w >> 1;
  for (let y = h - 22; y < h - 8; y++) for (let x = cx - 5; x <= cx + 5; x++) px(canvas, x, y, body);
  for (let i = 0; i < 6; i++) { px(canvas, cx - 10 - i, h - 20 + i, wing); px(canvas, cx + 10 + i, h - 20 + i, wing); }
  for (let i = 0; i < 5; i++) { px(canvas, cx - 8 - i, h - 14 + i, wing); px(canvas, cx + 8 + i, h - 14 + i, wing); }
  px(canvas, cx - 4, h - 18, eye); px(canvas, cx + 4, h - 18, eye);
  for (let y = h - 10; y < h - 6; y++) { px(canvas, cx - 2, y, body); px(canvas, cx + 2, y, body); }
}

function drawGolem(canvas, palette) {
  const w = canvas.width, h = canvas.height;
  const [rock, dark, moss] = palette;
  const cx = w >> 1;
  for (let y = h - 26; y < h - 4; y++) for (let x = cx - 9; x <= cx + 9; x++) px(canvas, x, y, rock);
  for (let y = h - 26; y < h - 22; y++) for (let x = cx - 7; x <= cx + 7; x++) px(canvas, x, y, dark);
  px(canvas, cx - 5, h - 24, moss); px(canvas, cx + 5, h - 24, moss);
  for (let y = h - 8; y < h - 5; y++) for (let x = cx - 9; x <= cx + 9; x += 2) px(canvas, x, y, dark);
  // eyes
  px(canvas, cx - 5, h - 23, "#1b1713"); px(canvas, cx + 5, h - 23, "#1b1713");
}

function drawBird(canvas, palette) {
  const w = canvas.width, h = canvas.height;
  const [body, beak, wing, eye] = palette;
  const cx = w >> 1;
  for (let y = h - 18; y < h - 6; y++) for (let x = cx - 6; x <= cx + 6; x++) px(canvas, x, y, body);
  px(canvas, cx, h - 19, beak); px(canvas, cx, h - 20, beak);
  for (let i = 0; i < 5; i++) { px(canvas, cx - 9 - i, h - 16 + i, wing); px(canvas, cx + 9 + i, h - 16 + i, wing); }
  px(canvas, cx - 3, h - 14, eye); px(canvas, cx + 3, h - 14, eye);
}

// class id -> palette; monster id -> draw fn + palette
const HERO_PALETTES = {
  warrior: ["#8a4a2b", "#e0a877", "#b23a48", "#4a2a1a", "#d9a441"],
  thief: ["#2f3a4a", "#e0a877", "#2f9e94", "#1b2733", "#e8dcc3"],
  mage: ["#5a3a6a", "#e0a877", "#6a994e", "#2a1f33", "#ff8b2a"],
  cleric: ["#e8dcc3", "#e0a877", "#fdf6e3", "#8a7a5a", "#d9a441"],
  ranger: ["#3a5a2a", "#e0a877", "#6a994e", "#1f331f", "#e8dcc3"],
  bard: ["#7a2a3a", "#e0a877", "#d9a441", "#3a1a22", "#ff8b2a"],
};

const MONSTER_ART = {
  "grumble-slime": [drawSlime, ["#6a994e", "#3a5a2a", "#a8dba3"]],
  "charlotte-viii": [drawSlime, ["#d9a441", "#7a5a1a", "#ffd97a"]],
  "mossbeard": [drawGolem, ["#4a5a3a", "#2a3520", "#6a994e"]],
  "bone-rattler": [drawBat, ["#e8dcc3", "#b7a98d", "#b23a48"]],
  "grave-moth": [drawBat, ["#8a7a5a", "#4a4134", "#ff8b2a"]],
  "tomb-guard": [drawGolem, ["#7a6a5a", "#3a332a", "#b7a98d"]],
  "baron-bones": [drawGolem, ["#e8dcc3", "#8a7a5a", "#b23a48"]],
  "dust-sprite": [drawSlime, ["#b7a98d", "#6a5a4a", "#e8dcc3"]],
  "cracked-golem": [drawGolem, ["#5a5a6a", "#2f3038", "#6a994e"]],
  "rune-eagle": [drawBird, ["#7a4a2a", "#ff8b2a", "#4a2a1a", "#ffd97a"]],
  "restless-sentinel": [drawGolem, ["#2f9e94", "#173f3c", "#6a994e"]],
  "sneaky-imp": [drawBat, ["#b23a48", "#5a1a1a", "#ff9aa5"]],
};

function makePlaceholderCanvas(key, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w * PLACEHOLDER_SCALE;
  canvas.height = h * PLACEHOLDER_SCALE;
  const body = document.createElement("canvas");
  body.width = w; body.height = h;
  if (HERO_PALETTES[key]) {
    drawHero(body, HERO_PALETTES[key]);
  } else if (MONSTER_ART[key]) {
    MONSTER_ART[key][0](body, MONSTER_ART[key][1]);
  } else {
    const ctx = body.getContext("2d");
    ctx.fillStyle = "#4a4134"; ctx.fillRect(2, 2, w - 4, h - 4);
  }
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(body, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function applyFrameVariants(key, frameName, w, h) {
  const c = makePlaceholderCanvas(key, w, h);
  if (frameName === "hurt") {
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(178,58,72,0.55)"; ctx.fillRect(0, 0, c.width, c.height);
  }
  if (frameName === "down") {
    const ctx = c.getContext("2d");
    ctx.globalAlpha = 0.45;
  }
  if (frameName === "victory") {
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffd97a";
    for (let i = 0; i < 4; i++) ctx.fillRect(2 + i * 9, 2, 3, 3);
  }
  return c;
}

// Get the list of canvas frames for a character/monster key. If a real PNG
// exists it would be drawn here; placeholder is the default (art pending).
export function getSpriteFrames(key, frameName) {
  const meta = getSpriteMeta(key);
  const w = meta ? meta.frameWidth : 64;
  const h = meta ? meta.frameHeight : 64;
  const id = `${key}:${frameName}`;
  if (cache.has(id)) return cache.get(id);
  const canvas = applyFrameVariants(key, frameName, w, h);
  canvas.dataset.key = key;
  canvas.className = "pixel-sprite";
  cache.set(id, canvas);
  return canvas;
}

// Draw a character/monster into a container element, sized to pixel ratio.
export function mountSprite(container, key, frameName = "idle-1", scale = 4) {
  container.innerHTML = "";
  const canvas = getSpriteFrames(key, frameName);
  canvas.style.width = canvas.width * (scale / PLACEHOLDER_SCALE) + "px";
  canvas.style.height = canvas.height * (scale / PLACEHOLDER_SCALE) + "px";
  canvas.classList.add("pixel-sprite");
  container.appendChild(canvas);
  return canvas;
}
