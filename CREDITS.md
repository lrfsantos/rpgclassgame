# CREDITS.md — third-party and generated assets

Everything in this project is either open-licensed, generated in code, or
original work created for this game.

## Fonts (self-hosted, OFL)
- **Press Start 2P** — pixel font for the logo/titles.
  License: SIL Open Font License 1.1. Downloaded from Google Fonts.
- **VT323** — readable monospace/pixel font for panel text.
  License: SIL Open Font License 1.1. Downloaded from Google Fonts.

Both fonts are in `assets/fonts/` and loaded via `@font-face` in
`css/main.css`.

## Generated / original assets
- **Sprites** — all placeholder art is drawn in code (`src/engine/sprites.js`);
  no external images are used yet. Real art can be dropped in via
  `assets/sprites/manifest.json` (see SPRITE_GUIDE.md).
- **Audio** — all sound effects and the music loop are generated with the
  Web Audio API (`src/engine/audio.js`); no audio files.
- **All other assets, code and content** — original work for this project.

No copied names, characters, creatures, UI assets, music or logos are used.
