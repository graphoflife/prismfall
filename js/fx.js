// Visual effects in "art" units: particles, shockwave rings, lightning, comic
// starbursts and floating score text. The simulation is shared; each graphics
// style draws it differently. Words always go on the full-resolution canvas.

import { INK } from './sprites.js';
import { star4 } from './gems.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const FONT = '"Press Start 2P", monospace';
const COMIC_FONT = 'Bangers, Impact, sans-serif';
const REAL_FONT = 'Cinzel, Georgia, serif';

const outBack = (t) => { const c = 2.2; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

function line(ctx, x0, y0, x1, y1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function jaggedPath(x0, y0, x1, y1, jitter) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.round(len / 6));
  const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
  const pts = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const k = i / n, j = rand(-jitter, jitter);
    pts.push([x0 + (x1 - x0) * k + nx * j, y0 + (y1 - y0) * k + ny * j]);
  }
  pts.push([x1, y1]);
  return pts;
}

// Comic starburst sprite, cached by size and palette.
const burstCache = new Map();
function burstSprite(w, h, fill, inner) {
  const id = `${w}x${h}:${fill}:${inner}`;
  if (burstCache.has(id)) return burstCache.get(id);
  const c = document.createElement('canvas');
  c.width = w + 4; c.height = h + 4;
  const ctx = c.getContext('2d');
  const cx = c.width / 2, cy = c.height / 2;
  const spikes = 13;
  const outer = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU + rand(-0.06, 0.06);
    const r = i % 2 ? rand(0.66, 0.74) : rand(0.9, 1);
    outer.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const inside = (u, v, poly, s) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i].map((q) => q * s), [xj, yj] = poly[j].map((q) => q * s);
      if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const grid = [];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const u = (x + 0.5 - cx) / (w / 2), v = (y + 0.5 - cy) / (h / 2);
      grid[y * c.width + x] = inside(u, v, outer, 0.98) ? (inside(u, v, outer, 0.72) ? 2 : 1) : 0;
    }
  }
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const g = grid[y * c.width + x];
      const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= c.width || yy >= c.height ? 0 : grid[yy * c.width + xx]);
      if (g) {
        // halftone dots in the lower-right of the outer ring for that comic print look
        const dot = g === 1 && (x + y) % 3 === 0 && x % 3 === 0 && x + y > c.width;
        ctx.fillStyle = g === 2 ? inner : dot ? INK : fill;
        ctx.fillRect(x, y, 1, 1);
      } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
        ctx.fillStyle = INK;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  burstCache.set(id, c);
  return c;
}

// Tiny repeating dot pattern for comic print shading, made on first use.
let dotTile = null;
function dotPattern(ctx) {
  if (!dotTile) {
    dotTile = document.createElement('canvas');
    dotTile.width = dotTile.height = 8;
    const t = dotTile.getContext('2d');
    t.fillStyle = 'rgba(26,15,38,0.28)';
    t.beginPath();
    t.arc(2, 2, 1.2, 0, TAU);
    t.arc(6, 6, 1.2, 0, TAU);
    t.fill();
  }
  const pat = ctx.createPattern(dotTile, 'repeat');
  pat.setTransform?.(new DOMMatrix().scale(0.25));
  return pat;
}

function polyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

function starburstPoly(spikes = 13) {
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU + rand(-0.06, 0.06);
    const r = i % 2 ? rand(0.66, 0.74) : rand(0.9, 1);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

export class Fx {
  constructor() {
    this.style = 'pixel';
    this.parts = [];
    this.rings = [];
    this.beams = [];
    this.bolts = [];
    this.bursts = [];
    this.popups = [];
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.shake = 0;
    this.offset = { x: 0, y: 0 };
  }

  setStyle(style) {
    this.style = style;
    this.clear();
  }

  clear() {
    this.parts.length = this.rings.length = this.beams.length = this.bolts.length = 0;
    this.bursts.length = this.popups.length = 0;
    this.flash = this.shake = 0;
  }

  // ---------------------------------------------------------- spawners

  // gem shards flying out of a popped piece
  explode(x, y, ramp, count = 10, power = 1) {
    const cols = ramp ? ramp.slice(2) : ['#ff5a5a', '#ffd23f', '#5ee7ff', '#b468f0', '#7dff7a', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), sp = rand(25, 75) * power;
      this.parts.push({
        x: x + rand(-3, 3), y: y + rand(-3, 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        life: 0, max: rand(0.45, 0.9), c: pick(cols), size: Math.random() < 0.35 ? 2 : 1,
        g: 160, drag: 1.5, style: 'shard', rot: rand(0, TAU), spin: rand(-9, 9),
      });
    }
    for (let i = 0; i < Math.ceil(count / 4); i++) this.sparkle(x + rand(-6, 6), y + rand(-6, 6), ramp ? ramp[5] : '#ffffff');
  }

  sparkle(x, y, c = '#ffffff', life = 0.45) {
    this.parts.push({ x, y, vx: rand(-10, 10), vy: rand(-20, 0), life: 0, max: life, c, size: 1, g: 0, drag: 2, style: 'spark' });
  }

  confetti(w, h, count = 60) {
    const cols = ['#ff4d6d', '#ffd23f', '#5ee7ff', '#7dff7a', '#b468f0', '#ffffff', '#ff9a3c'];
    for (let i = 0; i < count; i++) {
      this.parts.push({
        x: rand(0, w), y: rand(-20, 0), vx: rand(-15, 15), vy: rand(20, 60), life: 0, max: rand(1.4, 2.4),
        c: pick(cols), size: 2, g: 30, drag: 0.6, style: 'confetti', sway: rand(0, TAU), rot: rand(0, TAU), spin: rand(-5, 5),
      });
    }
  }

  ring(x, y, c, maxR, dur = 0.35, thick = 2) {
    this.rings.push({ x, y, c, maxR, dur, t: 0, thick });
  }

  // straight electric band (rows / columns)
  beam(x0, y0, x1, y1, c, dur = 0.38) {
    this.beams.push({ x0, y0, x1, y1, c, dur, t: 0 });
  }

  bolt(x0, y0, x1, y1, c, dur = 0.45) {
    this.bolts.push({ x0, y0, x1, y1, c, dur, t: 0, pts: jaggedPath(x0, y0, x1, y1, 3), next: 0 });
  }

  // a word on a comic starburst. "flavor" words (BOOM!, ZAP!) are pure comic
  // sound effects, so the realistic style leaves them out and lets the light do the talking.
  burst(x, y, word, { size = 8, fill = '#ffd23f', inner = '#ffffff', text = '#ff3d6e', life = 0.95, tilt = rand(-0.14, 0.14), sub = '', flavor = false } = {}) {
    const b = { x, y, word, sub, size, fill, inner, text, life, t: 0, tilt };
    if (this.style === 'pixel') {
      const w = Math.max(36, Math.round(word.length * size * 0.95 + 18));
      const h = Math.round(size * 3.4 + (sub ? 6 : 0));
      b.sprite = burstSprite(w, h, fill, inner);
    } else if (this.style === 'comic') {
      b.w = Math.max(38, word.length * size * 0.92 + 22);
      b.h = size * 3.6 + (sub ? 7 : 0);
      b.poly = starburstPoly();
    } else {
      if (flavor) return;
      b.tilt = 0;
    }
    this.bursts.push(b);
    if (this.bursts.length > 4) this.bursts.shift();
  }

  popup(x, y, text, c = '#ffffff') {
    this.popups.push({ x, y, text, c, t: 0, life: 0.9 });
  }

  kick(shake, flash = 0, color = '#ffffff') {
    this.shake = Math.max(this.shake, shake);
    if (flash > this.flash) { this.flash = flash; this.flashColor = color; }
  }

  // ------------------------------------------------------------- update

  update(dt) {
    for (const p of this.parts) {
      p.life += dt;
      p.vx *= Math.exp(-p.drag * dt);
      p.vy *= Math.exp(-p.drag * dt);
      p.vy += p.g * dt;
      p.x += p.vx * dt + (p.sway !== undefined ? Math.sin(p.life * 6 + p.sway) * 12 * dt : 0);
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const list of [this.rings, this.beams, this.bolts, this.bursts, this.popups]) for (const e of list) e.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    this.beams = this.beams.filter((b) => b.t < b.dur);
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
    this.bursts = this.bursts.filter((b) => b.t < b.life);
    this.popups = this.popups.filter((p) => p.t < p.life);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 18);
    const s = Math.round(this.shake);
    this.offset = { x: s ? Math.round(rand(-s, s)) : 0, y: s ? Math.round(rand(-s, s)) : 0 };
  }

  // ----------------------------------------------------- low-res drawing

  drawScene(ctx, w, h) {
    if (this.style !== 'pixel') { this.drawSmooth(ctx, w, h); return; }
    for (const r of this.rings) {
      const k = r.t / r.dur;
      const rad = r.maxR * (1 - (1 - k) ** 3);
      ctx.fillStyle = k < 0.3 ? '#ffffff' : r.c;
      const steps = Math.max(16, Math.round(rad * 7));
      const thick = k > 0.7 ? 1 : r.thick;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * TAU;
        for (let d = 0; d < thick; d++) ctx.fillRect(Math.round(r.x + Math.cos(a) * (rad - d)), Math.round(r.y + Math.sin(a) * (rad - d)), 1, 1);
      }
    }

    for (const b of this.beams) {
      const k = b.t / b.dur;
      const half = Math.max(0, Math.round(4 * (1 - k)));
      const horiz = b.y0 === b.y1;
      const len = horiz ? Math.abs(b.x1 - b.x0) : Math.abs(b.y1 - b.y0);
      const sx = Math.min(b.x0, b.x1), sy = Math.min(b.y0, b.y1);
      for (let i = 0; i <= len; i += 2) {
        const j = Math.round(rand(-1, 1));
        const w2 = half + (Math.random() < 0.3 ? 1 : 0);
        ctx.fillStyle = b.c;
        if (horiz) ctx.fillRect(sx + i, b.y0 - w2 + j, 2, w2 * 2 + 1);
        else ctx.fillRect(b.x0 - w2 + j, sy + i, w2 * 2 + 1, 2);
      }
      ctx.fillStyle = '#ffffff';
      const core = Math.max(1, Math.round(2 * (1 - k)));
      if (horiz) ctx.fillRect(sx, b.y0 - Math.floor(core / 2), len, core);
      else ctx.fillRect(b.x0 - Math.floor(core / 2), sy, core, len);
    }

    for (const b of this.bolts) {
      if (b.t > b.next) { b.pts = jaggedPath(b.x0, b.y0, b.x1, b.y1, 3); b.next = b.t + 0.05; }
      for (const [col, off] of [[b.c, 1], ['#ffffff', 0]]) {
        ctx.fillStyle = col;
        for (let i = 1; i < b.pts.length; i++) {
          const [ax, ay] = b.pts[i - 1], [bx, by] = b.pts[i];
          line(ctx, ax + off, ay, bx + off, by);
          if (off) line(ctx, ax - off, ay, bx - off, by);
        }
      }
    }

    for (const p of this.parts) {
      const k = p.life / p.max;
      if (k > 0.75 && Math.floor(p.life * 30) % 2) continue; // flicker out
      ctx.fillStyle = p.c;
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.style === 'spark') {
        ctx.fillRect(x, y, 1, 1);
        if (k < 0.6) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
      } else if (p.style === 'confetti') {
        const flip = Math.sin(p.life * 14 + (p.sway || 0)) > 0;
        ctx.fillRect(x, y, flip ? p.size : 1, flip ? 1 : p.size);
      } else if (p.style === 'shard' && p.size === 2) {
        ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + 1, y, 1, 1);
      } else {
        ctx.fillRect(x, y, p.size, p.size);
      }
    }

    for (const b of this.bursts) {
      const { sw, sh } = this.burstScale(b);
      if (sw <= 0) continue;
      ctx.save();
      ctx.translate(Math.round(b.x), Math.round(b.y));
      ctx.rotate(b.tilt);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(b.sprite, -Math.round((b.sprite.width * sw) / 2), -Math.round((b.sprite.height * sh) / 2), Math.round(b.sprite.width * sw), Math.round(b.sprite.height * sh));
      ctx.restore();
    }

    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.85, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------ smooth drawing

  drawSmooth(ctx, w, h) {
    const comic = this.style === 'comic';
    const light = (on) => { ctx.globalCompositeOperation = on && !comic ? 'lighter' : 'source-over'; };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const r of this.rings) {
      const k = r.t / r.dur;
      const rad = r.maxR * (1 - (1 - k) ** 3);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      if (comic) {
        const lw = r.thick * (1.3 - k);
        ctx.lineWidth = lw + 1.2;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = lw;
        ctx.strokeStyle = k < 0.3 ? '#ffffff' : r.c;
        ctx.stroke();
      } else {
        light(true);
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.lineWidth = r.thick * 2.8;
        ctx.strokeStyle = r.c;
        ctx.stroke();
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = r.thick * 0.55;
        ctx.strokeStyle = k < 0.4 ? '#ffffff' : r.c;
        ctx.stroke();
        ctx.globalAlpha = 1;
        light(false);
      }
    }

    for (const b of this.beams) {
      const k = b.t / b.dur;
      if (comic) {
        if (!b.pts || b.t > b.next) { b.pts = jaggedPath(b.x0, b.y0, b.x1, b.y1, 2.6); b.next = b.t + 0.05; }
        polyline(ctx, b.pts);
        for (const [col, lw] of [[INK, 5.4 * (1 - k) + 1.4], [b.c, 3.8 * (1 - k) + 0.6], ['#ffffff', 1.5 * (1 - k) + 0.3]]) {
          ctx.lineWidth = lw;
          ctx.strokeStyle = col;
          ctx.stroke();
        }
      } else {
        const half = 6 * (1 - k) + 0.8;
        const horiz = b.y0 === b.y1;
        const g = horiz ? ctx.createLinearGradient(0, b.y0 - half, 0, b.y0 + half) : ctx.createLinearGradient(b.x0 - half, 0, b.x0 + half, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.38, b.c);
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(0.62, b.c);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        light(true);
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = g;
        if (horiz) ctx.fillRect(Math.min(b.x0, b.x1), b.y0 - half, Math.abs(b.x1 - b.x0), half * 2);
        else ctx.fillRect(b.x0 - half, Math.min(b.y0, b.y1), half * 2, Math.abs(b.y1 - b.y0));
        ctx.globalAlpha = 1;
        light(false);
      }
    }

    for (const b of this.bolts) {
      const k = b.t / b.dur;
      if (b.t > b.next) { b.pts = jaggedPath(b.x0, b.y0, b.x1, b.y1, 3); b.next = b.t + 0.05; }
      polyline(ctx, b.pts);
      if (comic) {
        for (const [col, lw] of [[INK, 2.4], [b.c, 1.3], ['#ffffff', 0.5]]) {
          ctx.lineWidth = lw;
          ctx.strokeStyle = col;
          ctx.stroke();
        }
      } else {
        light(true);
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.lineWidth = 2;
        ctx.strokeStyle = b.c;
        ctx.stroke();
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.globalAlpha = 1;
        light(false);
      }
    }

    for (const p of this.parts) {
      const k = p.life / p.max;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      if (p.style === 'spark') {
        star4(ctx, p.x, p.y, 0.5 + Math.sin(k * Math.PI) * 2.8, 0.22);
        if (comic) {
          ctx.lineWidth = 0.45;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
        light(true);
        ctx.fillStyle = comic ? '#ffffff' : p.c;
        ctx.fill();
        light(false);
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot || 0) + p.life * (p.spin || 0));
      const q = p.size * (comic ? 1.25 : 1.05);
      ctx.beginPath();
      if (p.style === 'confetti') {
        const flip = Math.abs(Math.sin(p.life * 7 + (p.sway || 0)));
        ctx.rect(-q * 0.6, (-q * 0.9 * flip) / 2, q * 1.2, q * 0.9 * flip + 0.1);
      } else {
        ctx.moveTo(0, -q);
        ctx.lineTo(q * 0.9, q * 0.65);
        ctx.lineTo(-q * 0.8, q * 0.5);
        ctx.closePath();
      }
      if (comic) {
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      ctx.fillStyle = p.c;
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (comic) {
      for (const b of this.bursts) {
        const { sw } = this.burstScale(b);
        if (sw <= 0) continue;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.tilt);
        ctx.scale(sw, sw);
        const shape = (k) => {
          ctx.beginPath();
          b.poly.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo']((x * k * b.w) / 2, (y * k * b.h) / 2));
          ctx.closePath();
        };
        shape(1);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.fillStyle = b.fill;
        ctx.fill();
        ctx.fillStyle = dotPattern(ctx);
        ctx.fill();
        shape(0.72);
        ctx.fillStyle = b.inner;
        ctx.fill();
        ctx.restore();
      }
    }

    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.85, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  burstScale(b) {
    const k = b.t / b.life;
    let s = k < 0.18 ? outBack(k / 0.18) : 1;
    if (k > 0.8) s = 1 - (k - 0.8) / 0.2;
    return { sw: s, sh: s };
  }

  // ------------------------------------------------- full-res text pass

  drawText(ctx, S, ox, oy) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const b of this.bursts) {
      const { sw } = this.burstScale(b);
      if (sw <= 0.05) continue;
      ctx.save();
      ctx.translate(ox + b.x * S, oy + b.y * S - (b.sub ? 3 * S : 0));
      ctx.rotate(b.tilt);
      ctx.scale(sw, sw);
      this.label(ctx, b.word, b.size * S, b.text, S, true);
      if (b.sub) {
        ctx.translate(0, b.size * S * 0.95 + 1.5 * S);
        this.label(ctx, b.sub, 5 * S, '#ffffff', S * 0.8);
      }
      ctx.restore();
    }
    for (const p of this.popups) {
      const k = p.t / p.life;
      const y = p.y - 14 * (1 - (1 - k) ** 2);
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.save();
      ctx.translate(ox + p.x * S, oy + y * S);
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.5 : k < 0.2 ? 1.1 - ((k - 0.12) / 0.08) * 0.1 : 1;
      ctx.scale(pop, pop);
      this.label(ctx, p.text, 5 * S, p.c, S * 0.8);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // size is the height the word would have in the wide pixel font; the other
  // fonts are narrower, so they get scaled up to fill about the same width.
  label(ctx, text, size, fill, S, headline = false) {
    if (this.style === 'realistic') {
      ctx.font = `700 ${Math.round(size * 1.2)}px ${REAL_FONT}`;
      ctx.save();
      ctx.shadowColor = 'rgba(8,2,20,0.9)';
      ctx.shadowBlur = S * 2.2;
      ctx.shadowOffsetY = S * 0.4;
      if (headline) {
        const g = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
        g.addColorStop(0, '#fff6d0');
        g.addColorStop(0.55, '#f6c445');
        g.addColorStop(1, '#b8821a');
        ctx.fillStyle = g;
      } else ctx.fillStyle = fill;
      ctx.fillText(text, 0, 0);
      ctx.restore();
      return;
    }
    ctx.font = this.style === 'comic' ? `${Math.round(size * 1.65)}px ${COMIC_FONT}` : `${Math.round(size)}px ${FONT}`;
    ctx.lineWidth = Math.max(2, S * 1.6);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.fillText(text, S * 0.9, S * 0.9);
    ctx.strokeText(text, S * 0.9, S * 0.9);
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
  }
}
