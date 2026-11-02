// The jewel look: board colours, comic words, and the animated background
// behind the board in each graphics style.

import { star4 } from './gems.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const TAU = Math.PI * 2;

export const THEME = {
  board: { a: '#2a1650', b: '#341d61', frame: '#f6c445', light: '#fff0a8', dark: '#a8680c' },
  words: { nova: ['KA-BLAM!', 'BOOM!', 'BLAMMO!'], cross: ['ZAP!', 'KRAK!'], prism: ['DAZZLE!', 'BLINDING!'], mega: ['MEGA BLING!'], create: ['OOH!', 'SHINY!'] },
};

export const CHAIN_WORDS = ['', '', 'NICE!', 'GREAT!', 'SUPER!', 'AWESOME!', 'AMAZING!', 'INCREDIBLE!', 'UNSTOPPABLE!'];

// ------------------------------------------------------------- background

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function put(img, w, x, y, [r, g, b], a = 255) {
  const i = (y * w + x) * 4;
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
}

// Dithered vertical gradient through a list of colours.
function gradient(img, w, h, stops) {
  const cols = stops.map(hexToRgb);
  for (let y = 0; y < h; y++) {
    const f = (y / Math.max(1, h - 1)) * (cols.length - 1);
    for (let x = 0; x < w; x++) {
      let i = Math.floor(f);
      if (f - i > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16) i++;
      put(img, w, x, y, cols[Math.min(i, cols.length - 1)]);
    }
  }
}

function px(ctx, x, y, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function plus(ctx, x, y, core, arm, len) {
  px(ctx, x, y, core);
  for (let i = 1; i <= len; i++) {
    px(ctx, x - i, y, arm); px(ctx, x + i, y, arm); px(ctx, x, y - i, arm); px(ctx, x, y + i, arm);
  }
}

const rand = (a, b) => a + Math.random() * (b - a);

// Pixel style: deep velvet with a faint argyle lattice, drifting glitter and
// twinkling stars, in chunky low-resolution pixels.
class PixelBackground {
  constructor() { this.base = null; this.w = 0; this.h = 0; }

  resize(w, h) {
    this.w = w; this.h = h;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    gradient(img, w, h, ['#12062a', '#1b0a3c', '#28104f', '#371665', '#28104f']);
    const line = hexToRgb('#3f1c74');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((x + y) % 28 === 0 || ((x - y) % 28 + 28) % 28 === 0) put(img, w, x, y, line);
    }
    ctx.putImageData(img, 0, 0);
    this.base = c;
    this.sparks = Array.from({ length: Math.round(w * h / 260) }, () => ({ x: rand(0, w), y: rand(0, h), p: rand(0, TAU), s: rand(0.6, 1.6) }));
    this.glitter = Array.from({ length: Math.round(w / 3) }, () => ({ x: rand(0, w), y: rand(0, h), v: rand(3, 9), c: ['#ffd23f', '#ff8fd0', '#9fd2ff', '#ffffff'][Math.floor(rand(0, 4))] }));
  }

  draw(ctx, t, dt) {
    ctx.drawImage(this.base, 0, 0);
    for (const g of this.glitter) {
      g.y += g.v * dt; g.x += Math.sin(t * 0.8 + g.v) * 0.05;
      if (g.y > this.h) { g.y = -2; g.x = rand(0, this.w); }
      if (Math.sin(t * 4 + g.v * 10) > 0) px(ctx, g.x, g.y, g.c);
    }
    for (const s of this.sparks) {
      const k = Math.sin(t * s.s + s.p);
      if (k > 0.9) plus(ctx, s.x, s.y, '#ffffff', '#ffe28a', 2);
      else if (k > 0.6) plus(ctx, s.x, s.y, '#fff3c4', '#8a5bd1', 1);
    }
  }
}

function softSprite(size, colour) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, colour);
  g.addColorStop(0.55, colour);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, size, size);
  return c;
}

// Realistic style: a dark velvet cloth under soft out-of-focus lights.
class RealisticBackground {
  resize(w, h) {
    this.w = w; this.h = h;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.8);
    g.addColorStop(0, '#3b1c70');
    g.addColorStop(0.45, '#1f0d46');
    g.addColorStop(1, '#090316');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // fine fabric grain
    const tile = document.createElement('canvas');
    tile.width = tile.height = 96;
    const t = tile.getContext('2d');
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        t.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${rand(0, 0.035)})` : `rgba(0,0,0,${rand(0, 0.09)})`;
        t.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, w, h);
    this.base = c;
    const k = Math.sqrt(w * h) / 420;
    const cols = ['#ffd27a', '#b48cff', '#7fb8ff', '#ff9ac8'];
    this.bokeh = cols.map((col) => softSprite(128, col));
    this.lights = Array.from({ length: Math.round(16 * Math.max(1, k * 0.7)) }, () => ({
      x: rand(0, w), y: rand(0, h), r: rand(12, 46) * k, v: rand(1.5, 6) * k, p: rand(0, TAU), s: rand(0.3, 0.9), i: Math.floor(rand(0, cols.length)),
    }));
    this.glints = Array.from({ length: Math.round(9 * Math.max(1, k * 0.7)) }, () => ({ x: rand(0, w), y: rand(0, h), p: rand(0, TAU), s: rand(0.5, 1.2), r: rand(3, 8) * k }));
  }

  draw(ctx, t, dt) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.base, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      l.y -= l.v * dt;
      if (l.y < -l.r) { l.y = this.h + l.r; l.x = rand(0, this.w); }
      ctx.globalAlpha = 0.07 + 0.08 * (0.5 + 0.5 * Math.sin(t * l.s + l.p));
      ctx.drawImage(this.bokeh[l.i], l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.fillStyle = '#ffffff';
    for (const g of this.glints) {
      const k = Math.sin(t * g.s + g.p);
      if (k < 0.75) continue;
      ctx.globalAlpha = (k - 0.75) * 3.2;
      star4(ctx, g.x, g.y, g.r * (0.6 + k), 0.12);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Comic style: a printed page with slowly turning sunburst rays and halftone dots.
class ComicBackground {
  resize(w, h) {
    this.w = w; this.h = h;
    this.k = Math.sqrt(w * h) / 420;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const cx = w / 2, cy = h * 0.45, far = Math.hypot(w, h) / 2;
    const step = 11 * this.k;
    ctx.fillStyle = 'rgba(16,6,40,0.55)';
    for (let y = 0, row = 0; y < h + step; y += step, row++) {
      for (let x = row % 2 ? step / 2 : 0; x < w + step; x += step) {
        const r = (Math.hypot(x - cx, y - cy) / far) * step * 0.42;
        if (r < 0.4) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
    this.dots = c;
    this.stars = Array.from({ length: 10 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(5, 11) * this.k, p: rand(0, TAU), s: rand(0.7, 1.5), v: rand(2, 6) * this.k }));
  }

  draw(ctx, t, dt) {
    const { w, h } = this;
    const cx = w / 2, cy = h * 0.45, far = Math.hypot(w, h);
    ctx.fillStyle = '#2a1657';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3a2172';
    const rays = 14;
    for (let i = 0; i < rays; i++) {
      const a = t * 0.05 + (i / rays) * TAU, b = a + TAU / rays / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * far, cy + Math.sin(a) * far);
      ctx.lineTo(cx + Math.cos(b) * far, cy + Math.sin(b) * far);
      ctx.closePath();
      ctx.fill();
    }
    ctx.drawImage(this.dots, 0, 0);
    ctx.lineJoin = 'round';
    for (const s of this.stars) {
      s.y += s.v * dt;
      if (s.y > h + s.r) { s.y = -s.r; s.x = rand(0, w); }
      const k = 0.5 + 0.5 * Math.sin(t * s.s + s.p);
      star4(ctx, s.x, s.y, s.r * (0.45 + k * 0.75), 0.3);
      ctx.lineWidth = 2 * this.k;
      ctx.strokeStyle = '#1a0f26';
      ctx.stroke();
      ctx.fillStyle = k > 0.5 ? '#ffd23f' : '#fff0a8';
      ctx.fill();
    }
  }
}

export function makeBackground(style) {
  if (style === 'realistic') return new RealisticBackground();
  if (style === 'comic') return new ComicBackground();
  return new PixelBackground();
}
