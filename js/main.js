// App shell: persistence, HUD, menus and the frame loop.

import { Game } from './game.js';
import { Audio } from './audio.js';
import { makeBackground } from './theme.js';
import { STYLES, styleSprites } from './look.js';
import { loadBakedGems } from './gems.js';

const KEY = 'pixelpop.v1'; // from the game's first name; kept so existing saves carry over
const DEFAULTS = {
  settings: { style: 'realistic', sfx: true, music: true, vibrate: true },
  stats: { best: 0, bestMove: 0, bestChain: 0, bestLevel: 1, popped: 0, games: 1 },
};

function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage unavailable */ }
  return {
    settings: { ...DEFAULTS.settings, ...d?.settings },
    stats: { ...DEFAULTS.stats, ...d?.stats },
    game: d?.game ?? null,
  };
}

const data = load();
if (!STYLES.some((s) => s.id === data.settings.style)) data.settings.style = DEFAULTS.settings.style;
const persist = () => {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode etc. */ }
};

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// ---------------------------------------------------------------- HUD

const hud = {
  shown: 0,
  target: 0,
  bumpedAt: 0,
  set({ score, best, level, progress }) {
    // a little pop on the score; the Web Animations API needs no forced layout
    const now = performance.now();
    if (score > this.target && now - this.bumpedAt > 200) {
      this.bumpedAt = now;
      $('score').animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 250, easing: 'ease-out' });
    }
    this.target = score;
    if (score < this.shown) this.shown = score;
    $('best').textContent = fmt(best);
    $('level').textContent = level;
    $('bar').style.width = `${Math.min(100, progress * 100)}%`;
  },
  tick(dt) {
    if (this.shown === this.target) return;
    this.shown = Math.min(this.target, this.shown + Math.max(1, (this.target - this.shown) * Math.min(1, dt * 8)));
    $('score').textContent = fmt(this.shown);
  },
};

// --------------------------------------------------------------- game

const audio = new Audio();
audio.sfxOn = data.settings.sfx;
audio.musicOn = data.settings.music;

const game = new Game({
  canvas: $('board'),
  frameCanvas: $('board-frame'),
  audio,
  hooks: {
    save(g) { data.game = g; persist(); },
    score(s) { hud.set(s); },
  },
});
game.vibrate = data.settings.vibrate;

// ---------------------------------------------------------- background

// How hard the device is pushed. Slow devices are detected while playing and
// switched to the light settings, see watchFrameRate().
const quality = {
  maxDpr: 2,        // more resolution than 2x is not visible on a phone, but costs 2.25x the pixels
  idleFps: 24,      // when only the idle shimmer moves
  activeFps: 60,    // swaps, cascades and explosions; also caps 120 Hz displays
  backgroundFps: 20,
  backgroundScale: 1, // background pixels per css pixel in the smooth styles: it is soft anyway
  light: false,
};

const bgCanvas = $('bg');
const bgCtx = bgCanvas.getContext('2d', { alpha: false });
let bg = null;
let bgTime = 0;

function sizeBackground() {
  // the pixel style uses 3 css pixels per background pixel, the others draw at screen resolution
  const scale = data.settings.style === 'pixel' ? 1 / 3 : quality.backgroundScale;
  const w = Math.ceil(window.innerWidth * scale), h = Math.ceil(window.innerHeight * scale);
  bgCanvas.width = w; bgCanvas.height = h;
  bg.resize(w, h);
}

// ---------------------------------------------------------------- style

const FONT_OF = { pixel: '10px "Press Start 2P"', comic: '10px Bangers', realistic: '700 10px Cinzel' };

function applyStyle(id) {
  data.settings.style = id;
  persist();
  document.body.dataset.style = id;
  document.fonts?.load(FONT_OF[id]);
  game.setStyle(id);
  if (id === 'realistic') loadBakedGems();
  bg = makeBackground(id);
  sizeBackground();
  sizeParade();
  document.querySelectorAll('[data-style-id]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.styleId === id)));
}

function stylePreview(id) {
  const set = styleSprites(id);
  const k = id === 'pixel' ? 1 : 3; // pixel previews stay at sprite size and scale up crisply
  const c = document.createElement('canvas');
  c.width = (7 * 22 + 2) * k;
  c.height = 24 * k;
  const ctx = c.getContext('2d');
  const paint = () => {
    ctx.fillStyle = '#2a1650';
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 7; i++) ctx.drawImage(set.pieces[i].img, (2 + i * 22) * k, 2 * k, 20 * k, 20 * k);
  };
  paint();
  if (id === 'realistic') loadBakedGems().then(paint);
  return c;
}

// The previews need every style's sprites, so they are built when the menu first opens.
let pickerBuilt = false;
function buildStylePicker() {
  if (pickerBuilt) return;
  pickerBuilt = true;
  for (const { id, name, blurb } of STYLES) {
    const card = document.createElement('button');
    card.className = 'style-card';
    card.dataset.styleId = id;
    card.setAttribute('aria-pressed', String(id === data.settings.style));
    const preview = stylePreview(id);
    if (id === 'pixel') preview.classList.add('crisp');
    const label = document.createElement('b'); label.textContent = name.toUpperCase();
    const text = document.createElement('small'); text.textContent = blurb;
    card.append(preview, label, text);
    card.addEventListener('click', () => { audio.unlock(); applyStyle(id); audio.select(); });
    $('style-grid').append(card);
  }
}

// ------------------------------------------------------------- overlays

function open(id) { $(id).classList.remove('hidden'); }
function close(id) { $(id).classList.add('hidden'); }

function fillRecords() {
  const s = data.stats;
  $('rec-best').textContent = fmt(s.best);
  $('rec-move').textContent = fmt(s.bestMove);
  $('rec-chain').textContent = s.bestChain ? `x${s.bestChain}` : '-';
  $('rec-level').textContent = s.bestLevel;
  $('rec-popped').textContent = fmt(s.popped);
}

function syncSoundToggles() {
  $('opt-sfx').checked = data.settings.sfx;
  $('opt-music').checked = data.settings.music;
  $('opt-vibrate').checked = data.settings.vibrate;
}

function setSound(sfx, music) {
  data.settings.sfx = sfx;
  data.settings.music = music;
  audio.setSfx(sfx);
  audio.setMusic(music);
  syncSoundToggles();
  persist();
}

function wireUi() {
  $('btn-hint').addEventListener('click', () => { audio.unlock(); game.showHint(true); });
  $('btn-menu').addEventListener('click', () => { audio.unlock(); buildStylePicker(); fillRecords(); open('menu'); });
  $('btn-new').addEventListener('click', () => { close('menu'); open('confirm'); });
  $('btn-confirm-new').addEventListener('click', async () => {
    close('confirm');
    await game.newGame();
    persist();
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('.overlay').classList.add('hidden')));
  document.querySelectorAll('#menu, #confirm').forEach((o) => o.addEventListener('pointerdown', (e) => { if (e.target === o) o.classList.add('hidden'); }));

  $('opt-sfx').addEventListener('change', (e) => setSound(e.target.checked, data.settings.music));
  $('opt-music').addEventListener('change', (e) => setSound(data.settings.sfx, e.target.checked));
  $('opt-vibrate').addEventListener('change', (e) => {
    data.settings.vibrate = game.vibrate = e.target.checked;
    persist();
    if (e.target.checked) navigator.vibrate?.(30);
  });

  $('btn-play').addEventListener('click', () => {
    audio.unlock();
    close('splash');
    splashOpen = false;
    game.intro();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('#menu, #confirm').forEach((o) => o.classList.add('hidden'));
    if (e.key === 'h' || e.key === 'H') game.showHint(true);
  });

  // iOS only unlocks audio inside touchend/click handlers
  for (const type of ['touchend', 'click']) document.addEventListener(type, () => audio.unlock(), { passive: true });
  $('board').addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { audio.suspend(); persist(); } else audio.resume();
  });
  window.addEventListener('pagehide', persist);
}

// --------------------------------------------------------------- layout

const stage = $('stage');
function layout() {
  const rect = stage.getBoundingClientRect();
  const size = Math.floor(Math.min(rect.width, rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
  for (const cv of [$('board'), $('board-frame')]) {
    cv.style.width = `${size}px`;
    cv.style.height = `${size}px`;
  }
  game.resize(size, size, dpr);
}
new ResizeObserver(layout).observe(stage);
// zooming changes devicePixelRatio without resizing the stage
window.addEventListener('resize', () => { layout(); sizeBackground(); });

// ---------------------------------------------------------- splash parade

let splashOpen = true;
const parade = $('parade');
const paradeCtx = parade.getContext('2d');
const PARADE_W = 168, PARADE_H = 34;
let paradeScale = 1;

function sizeParade() {
  paradeScale = data.settings.style === 'pixel' ? 1 : 3;
  parade.width = PARADE_W * paradeScale;
  parade.height = PARADE_H * paradeScale;
}

function drawParade(t) {
  const set = game.sprites;
  paradeCtx.setTransform(paradeScale, 0, 0, paradeScale, 0, 0);
  paradeCtx.clearRect(0, 0, PARADE_W, PARADE_H);
  const crisp = paradeScale === 1;
  for (let i = 0; i < 7; i++) {
    const wave = Math.sin(t * 4 + i * 0.8) * 4;
    const y = 8 + (crisp ? Math.round(wave) : wave);
    const { frames } = set.pieces[i];
    const img = frames ? frames[Math.floor(t * 9 + i * 5) % frames.length] : set.pieces[i].img;
    paradeCtx.globalAlpha = 0.5;
    paradeCtx.drawImage(set.pieces[i].shadow, 4 + i * 23 + 1, y + 1, 20, 20);
    paradeCtx.globalAlpha = 1;
    paradeCtx.drawImage(img, 4 + i * 23, y, 20, 20);
  }
}

// ----------------------------------------------------------------- loop

// The game logic advances on every display frame, but drawing is paced: the board
// at full rate only while something moves, the slow background less often still.
let last = performance.now(), lastBoard = 0, lastBg = 0;
let vsync = 16.7; // the display's own frame interval, smoothed
// true when drawing now keeps closest to the wanted rate on this display
const due = (since, fps) => since + vsync / 2 >= 1000 / fps;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(50, now - last);
  last = now;
  vsync += (dt - vsync) * 0.1;
  bgTime += dt / 1000;
  game.update(dt);
  hud.tick(dt / 1000);

  const lively = game.lively;
  const fps = lively ? quality.activeFps : quality.idleFps;
  if (due(now - lastBoard, fps)) {
    watchFrameRate(now - lastBoard, lively && fps === quality.activeFps);
    lastBoard = now;
    game.render();
    if (splashOpen) drawParade(bgTime);
  }
  if (due(now - lastBg, quality.backgroundFps)) {
    bg.draw(bgCtx, bgTime, Math.min(0.2, (now - lastBg) / 1000));
    lastBg = now;
  }
}

// If busy stretches keep running well below the target rate, this device needs
// the light settings: less resolution, a calmer background, no frame blending.
const slow = { frames: 0, time: 0 };
function watchFrameRate(gap, measuring) {
  if (quality.light || !measuring || gap > 200) return;
  slow.frames++;
  slow.time += gap;
  if (slow.frames < 120) return;
  if (slow.time / slow.frames > 26) goLight();
  slow.frames = slow.time = 0;
}

function goLight() {
  Object.assign(quality, { light: true, maxDpr: 1.5, idleFps: 15, activeFps: 40, backgroundFps: 10, backgroundScale: 0.5 });
  game.blend = false;
  layout();
  sizeBackground();
}

// ----------------------------------------------------------------- boot

wireUi();
applyStyle(data.settings.style);
syncSoundToggles();
game.start(data.game, data.stats);
// hide the board until PLAY drops it in
game.grid.flat().forEach((p) => { p.y = -20; });
$('splash-best').textContent = fmt(data.stats.best);
$('btn-play').textContent = data.game ? 'CONTINUE' : 'PLAY';
hud.shown = hud.target;
$('score').textContent = fmt(hud.shown);
layout();
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { game, quality, goLight });
requestAnimationFrame(frame);
