# SPRITE_GUIDE.md — how sprites work in Classroom RPG

All art is placeholder-pending: the game draws every sprite in code (pixel style,
no external images yet). The manifest + loader are the drop-in system you use to
add real PNG art later.

## File layout

```
assets/sprites/
  manifest.json        <- maps every character/monster/portrait to a PNG path + frame info
  characters/          <- real art goes here (party sprites 32x48, portraits 64x64)
  monsters/            <- real art goes here (64x64, bosses 128x128)
  portraits/           <- real art goes here (64x64)
```

The code that consumes the manifest is `src/engine/sprites.js`
(`getSpriteFrames`, `mountSprite`). Do not change the manifest shape without
updating that file and the `tests/validator.mjs` sprite checks.

## Manifest format

Top-level:

- `version`: manifest format version (currently 1).
- `frameRate`: default playback rate for idle animation in frames/second.
- `spriteSize`: the four standard sizes, in pixels: `party` 32x48, `enemy` 64x64,
  `boss` 128x128, `portrait` 64x64.
- `frames`: the canonical ordered frame list for every sprite.

Each character in `characters` has: `sprite` (PNG path), `portrait` (PNG path),
`frameWidth`, `frameHeight`, `frames`.

Each monster in `monsters` has: `sprite` (PNG path), `frameWidth`,
`frameHeight`, `boss` (true/false), `frames`.

Frames are named: `idle-1`, `idle-2`, `attack`, `hurt`, `down`, `victory`.

## Standard frame sizes

| kind   | width x height |
|--------|----------------|
| party  | 32 x 48        |
| enemy  | 64 x 64        |
| boss   | 128 x 128      |
| portrait| 64 x 64       |

Every entry lists all six frames, even if some share pixels.

## Adding real art (the drop-in workflow)

1. Draw a PNG at the correct frame size for the kind (see table above) with all
   frames laid out left-to-right in the manifest order (`idle-1`, `idle-2`,
   `attack`, `hurt`, `down`, `victory`).
2. Save it to the path named in the manifest, e.g.
   `assets/sprites/monsters/grumble-slime.png`.
3. That's it. `getSpriteFrames(key, frameName)` returns the matching frame; if
   the PNG is missing the loader falls back to the code-drawn placeholder so the
   game still works.

## Missing PNG -> placeholder fallback

- Placeholder frames are generated in `src/engine/sprites.js` by
  `makePlaceholderCanvas` + `applyFrameVariants`.
- `hurt` tints the frame red, `down` reduces opacity, `victory` adds gold
  sparkle pixels, idle alternates the two idle poses via the timer in
  `src/ui/stage.js`.
- The placeholder generator currently only ships the frames listed above; if a
  frame is missing it falls back to `idle-1` so nothing ever renders blank.

## Frame variants

`applyFrameVariants(key, frameName, w, h)` mutates a copy for special states:
`hurt` = red tint, `down` = 45% alpha, `victory` = gold sparkles. Idle animation
swaps `idle-1` / `idle-2` on a timer. When real PNGs arrive, keep these variant
handlers for the states so the animation code path does not change.
