# Prismfall

A relaxing jewel match-3 game for the browser. Zen mode only:
no timer, no game over, just combos, cascades and explosions.

**Play it:** https://graphoflife.github.io/prismfall/

Works on desktop and phones (swipe or tap to swap). You can add it to your home
screen and it runs like an app.

## Features

- **Three graphics styles**, switchable any time in the menu, even mid-game:
  - **Realistic**: ray-traced stones that really sparkle as they wobble, on velvet in a gold frame
  - **Comic**: bold ink, flat colour, halftone dots and "ZAP!" starbursts
  - **Pixel**: chunky retro pixel art
- **Seven jewels**, all drawn in code with no image files: faceted heart, hexagon,
  kite, emerald, round, trillion and pear cuts
- **Specials**
  - 4 in a row → **Nova**: blasts the 3×3 area around it
  - L or T shape → **Cross**: clears its whole row and column
  - 5 in a row → **Prism**: swap it with any piece to clear every piece of that colour
  - Swap two specials together for mega combos (Nova+Nova, Cross+Cross, Nova+Cross, Prism+anything)
- **Swipe ahead**: you can keep swapping while explosions are still playing. Each
  swap shows right away and waits its turn, and swaps play in the order you made
  them. If a cascade destroys or moves a piece you swapped, that swap (and any
  later swap that relied on it) flips back immediately.
- **Always alive**: every gem gently rocks, catches a shine and keeps twinkling
- **Chain reactions and cascades**: points are multiplied by the cascade depth, and
  the music climbs the scale as the chain grows
- **Smart board**: refills try several candidate fills and pick one that keeps
  plenty of moves on the board, with occasional free cascades. You never get
  stuck, and a hint appears if you idle for a while.
- **Sound**: every effect and the ambient music are synthesised with WebAudio,
  with glassy bells on a pentatonic scale.
- **Records** saved in the browser: high score, best single move, longest chain,
  highest level and pieces popped. Your current game is saved automatically.

## Run locally

It is a static site with no build step:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. ES modules need to be served over HTTP, so
opening `index.html` directly from disk won't work.

`tools/gallery.html` shows every gem sprite in every style at large size, and
`tools/bench.mjs` times the drawing of each style (see the comment at its top).

The realistic gems are pre-rendered: they are 3D models traced with refraction,
Fresnel reflection, total internal reflection and colour absorption, so the game
just plays the frames back. To re-render them (needs Python with Pillow for WebP):

```bash
node tools/bake-gems.mjs
```

## Tests

The rules engine (`js/board.js`) is DOM-free and covered by Node tests:

```bash
node tests/board.test.mjs
```

## Code map

| File | What it does |
| --- | --- |
| `js/board.js` | Match finding, specials, chain reactions, move search, smart refill, shuffle |
| `js/game.js` | Turn flow as awaited animations, the move queue, input and rendering |
| `js/sprites.js` | Pixel-art painter for every gem |
| `js/gems.js` | Gem outlines, the comic painter, and loading of the baked realistic gems |
| `tools/bake-gems.mjs` | Ray tracer that renders the realistic gems into `assets/gems` ahead of time |
| `js/look.js` | Per-style board drawing: frame, markers, special pieces, twinkles |
| `js/theme.js` | Board colours, comic words and the animated background of each style |
| `js/fx.js` | Particles, shockwaves, lightning, starbursts and score popups in each style |
| `js/audio.js` | WebAudio sound effects and generative ambient music |
| `js/main.js` | HUD, menus, persistence and the frame loop |
