// Rough rendering benchmark, run from the console of the game opened with ?debug:
//   const { bench } = await import('./tools/bench.mjs'); await bench();
// Every timed draw is followed by a 1-pixel read, which makes the browser finish
// the GPU work too, so the numbers include graphics cost and not just JavaScript.

import { makeBackground } from '../js/theme.js';
import * as B from '../js/board.js';

const flush = (ctx) => ctx.getImageData(0, 0, 1, 1);

function timeIt(n, fn, ctx) {
  fn(); flush(ctx);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { fn(); flush(ctx); }
  return (performance.now() - t0) / n;
}

async function step(game, ms) {
  for (let t = 0; t < ms; t += 16) { game.update(16); for (let k = 0; k < 30; k++) await null; }
}

export async function bench(styles = ['realistic', 'comic', 'pixel']) {
  const game = window.game;
  const out = {};
  for (const id of styles) {
    document.querySelector(`.style-card[data-style-id="${id}"]`)?.click();
    await step(game, 300);
    const board = game.canvas.getContext('2d');
    const idle = timeIt(40, () => game.render(), board);
    const g = game.grid;
    g[3][2].special = B.NOVA; g[3][3].special = B.CROSS;
    game.queueSwap({ r: 3, c: 2 }, { r: 3, c: 3 });
    await step(game, 330);
    const busy = timeIt(30, () => game.render(), board);
    let guard = 0;
    while ((game.busy || game.queue.length) && guard++ < 300) await step(game, 100);

    const scale = id === 'pixel' ? 1 / 3 : (window.benchBgScale ?? 1);
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = Math.ceil(innerWidth * scale); bgCanvas.height = Math.ceil(innerHeight * scale);
    const bg = makeBackground(id);
    bg.resize(bgCanvas.width, bgCanvas.height);
    const bctx = bgCanvas.getContext('2d');
    let t = 0;
    const back = timeIt(40, () => { t += 0.016; bg.draw(bctx, t, 0.016); }, bctx);
    out[id] = { boardIdleMs: +idle.toFixed(2), boardBusyMs: +busy.toFixed(2), backgroundMs: +back.toFixed(2), boardPx: game.canvas.width * game.canvas.height, bgPx: bgCanvas.width * bgCanvas.height };
  }
  return out;
}
