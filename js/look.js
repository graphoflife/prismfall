// How the board itself is drawn in each graphics style: frame, cell markers,
// special-piece overlays and idle twinkles. Everything is in "art" units, where
// one tile is T wide; the pixel look draws into a low-res scene that gets scaled
// up, the smooth looks draw straight onto the full-resolution canvas.

import * as B from './board.js';
import { INK, pixelSprites } from './sprites.js';
import { smoothSprites, star4 } from './gems.js';
import { THEME } from './theme.js';

export const T = 20;                     // tile size in art units
export const PAD = 6;                    // frame around the board
export const BOARD = B.SIZE * T;
export const ART = BOARD + PAD * 2;      // scene size in art units

const TAU = Math.PI * 2;

export const STYLES = [
  { id: 'realistic', name: 'Realistic', blurb: 'Cut stones, soft light and glints' },
  { id: 'comic', name: 'Comic', blurb: 'Bold ink, flat colour and POW!' },
  { id: 'pixel', name: 'Pixel', blurb: 'Chunky retro pixel art' },
];

export const makeLook = (style) => (style === 'pixel' ? new PixelLook() : new SmoothLook(style));
export const styleSprites = (style) => (style === 'pixel' ? pixelSprites() : smoothSprites(style));

// Which bright spot of a piece is twinkling right now and how far along it is
// (0..1), or null between twinkles.
function twinkleAt(sprites, p, ms) {
  const PERIOD = 2.2, SHOW = 0.55;
  const cyc = ms / 1000 / PERIOD + p.phase * 7;
  const n = Math.floor(cyc);
  const k = ((cyc - n) * PERIOD) / SHOW;
  if (k >= 1) return null;
  const spots = p.special === B.PRISM ? sprites.prismSpots : sprites.pieces[p.type].spots;
  const [fx, fy] = spots[Math.abs((p.id * 7919 + n * 104729) | 0) % spots.length];
  return { fx, fy, k };
}

// ------------------------------------------------------------------ pixel

class PixelLook {
  constructor() {
    this.pixel = true;
    this.sprites = pixelSprites();
    this.shadow = { dx: 1, dy: 1, alpha: 0.35 };
  }

  buildFrame() {
    const c = document.createElement('canvas');
    c.width = c.height = ART;
    const ctx = c.getContext('2d');
    const { a, b, frame, light, dark } = THEME.board;
    const rect = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    // chunky comic frame with pixel-cut corners
    rect(2, 0, ART - 4, ART, INK); rect(0, 2, ART, ART - 4, INK); rect(1, 1, ART - 2, ART - 2, INK);
    rect(2, 2, ART - 4, ART - 4, frame);
    rect(2, 2, ART - 4, 1, light); rect(2, 2, 1, ART - 4, light);
    rect(2, ART - 3, ART - 4, 1, dark); rect(ART - 3, 2, 1, ART - 4, dark);
    rect(PAD - 1, PAD - 1, BOARD + 2, BOARD + 2, INK);
    for (const [x, y] of [[3, 3], [ART - 5, 3], [3, ART - 5], [ART - 5, ART - 5]]) { rect(x, y, 2, 2, light); rect(x + 1, y + 1, 1, 1, dark); }
    for (let r = 0; r < B.SIZE; r++) {
      for (let col = 0; col < B.SIZE; col++) rect(PAD + col * T, PAD + r * T, T, T, (r + col) % 2 ? b : a);
    }
    // halftone speckle on the tiles
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = PAD; y < PAD + BOARD; y += 3) for (let x = PAD + (y % 2); x < PAD + BOARD; x += 4) ctx.fillRect(x, y, 1, 1);
    return c;
  }

  markers(s, { time: t, selected, queue, hint }) {
    const bracket = (r, c, col, gap) => {
      const x = PAD + c * T - gap, y = PAD + r * T - gap, w = T + gap * 2;
      s.fillStyle = col;
      for (const [bx, by, sx, sy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + w - 1, 1, -1], [x + w - 1, y + w - 1, -1, -1]]) {
        s.fillRect(bx, by, 4 * sx || 1, 1 * sy || 1);
        s.fillRect(bx, by, 1 * sx || 1, 4 * sy || 1);
      }
    };
    if (selected) {
      const { r, c } = selected;
      s.fillStyle = 'rgba(255,255,255,0.18)';
      s.fillRect(PAD + c * T, PAD + r * T, T, T);
      bracket(r, c, Math.floor(t / 180) % 2 ? '#ffffff' : THEME.board.frame, 0);
    }
    // queued swaps waiting their turn: small corner ticks, brighter for the next one up
    queue.forEach((m, i) => {
      s.fillStyle = i === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)';
      for (const { r, c } of [m.a, m.b]) {
        const x = PAD + c * T, y = PAD + r * T;
        for (const [px, py, dx, dy] of [[x + 1, y + 1, 1, 1], [x + T - 2, y + 1, -1, 1], [x + 1, y + T - 2, 1, -1], [x + T - 2, y + T - 2, -1, -1]]) {
          s.fillRect(px, py, 1, 1);
          s.fillRect(px + dx, py, 1, 1);
          s.fillRect(px, py + dy, 1, 1);
        }
      }
    });
    if (hint) {
      const pulse = Math.floor((t - hint.since) / 260) % 2;
      for (const cell of [hint.a, hint.b]) {
        s.fillStyle = pulse ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
        s.fillRect(PAD + cell.c * T, PAD + cell.r * T, T, T);
        bracket(cell.r, cell.c, pulse ? '#ffffff' : THEME.board.frame, pulse);
      }
    }
  }

  // glow drawn underneath a special piece so it reads at a glance
  specialBack(s, p, dx, dy, w, h, ms) {
    const t = ms / 1000;
    const ramp = this.sprites.ramps[p.type];
    const mx = Math.round(dx + w / 2), my = Math.round(dy + h / 2);
    const pulse = 0.5 + 0.5 * Math.sin(t * 6 + p.phase * 6);
    if (p.special === B.NOVA) {
      const rad = 8 + Math.round(pulse * 2);
      s.fillStyle = ramp[3];
      s.globalAlpha = 0.55;
      for (let y = -rad; y <= rad; y++) {
        const half = Math.round(Math.sqrt(rad * rad - y * y));
        s.fillRect(mx - half, my + y, half * 2, 1);
      }
      s.globalAlpha = 1;
      s.fillStyle = ramp[5];
      const steps = 40;
      for (let i = 0; i < steps; i++) {
        if ((i + Math.floor(t * 12)) % 4 === 0) continue;
        const a = (i / steps) * TAU;
        s.fillRect(Math.round(mx + Math.cos(a) * rad), Math.round(my + Math.sin(a) * rad), 1, 1);
      }
    } else {
      s.globalAlpha = 0.35 + pulse * 0.35;
      s.fillStyle = ramp[4];
      s.fillRect(dx - 1, my - 2, w + 2, 4);
      s.fillRect(mx - 2, dy - 1, 4, h + 2);
      s.fillStyle = '#ffffff';
      s.fillRect(dx - 1, my - 1, w + 2, 1);
      s.fillRect(mx - 1, dy - 1, 1, h + 2);
      s.globalAlpha = 1;
    }
  }

  specialFront(s, p, dx, dy, w, h, ms) {
    const t = ms / 1000;
    const ramp = this.sprites.ramps[p.type];
    const mx = dx + w / 2, my = dy + h / 2;
    if (p.special === B.NOVA) {
      // four sparks orbiting the piece
      for (let i = 0; i < 4; i++) {
        const a = t * 3.5 + i * (Math.PI / 2);
        const ox = Math.round(mx + Math.cos(a) * 8), oy = Math.round(my + Math.sin(a) * 8);
        s.fillStyle = INK;
        s.fillRect(ox - 2, oy - 1, 5, 3); s.fillRect(ox - 1, oy - 2, 3, 5);
        s.fillStyle = ramp[5];
        s.fillRect(ox - 1, oy, 3, 1); s.fillRect(ox, oy - 1, 1, 3);
        s.fillStyle = '#ffffff';
        s.fillRect(ox, oy, 1, 1);
      }
    } else {
      // arrows pulsing outward along the row and column it will clear
      const k = (t * 2.5) % 1;
      const d = Math.round(7 + k * 2);
      for (const [ax, ay] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const px = Math.round(mx + ax * d), py = Math.round(my + ay * d);
        const pts = [[ax, ay], [0, 0], [-ay, ax], [ay, -ax], [-ay * 2 - ax, ax * 2 - ay], [ay * 2 - ax, -ax * 2 - ay]];
        s.fillStyle = INK;
        for (const [qx, qy] of pts) s.fillRect(px + qx - 1, py + qy - 1, 3, 3);
        s.fillStyle = k < 0.5 ? '#ffffff' : ramp[5];
        for (const [qx, qy] of pts) s.fillRect(px + qx, py + qy, 1, 1);
      }
    }
  }

  // A little four-point star that keeps popping up on a bright spot of each
  // piece, so the board always glitters a bit.
  twinkle(s, p, dx, dy, w, h, ms) {
    const tw = twinkleAt(this.sprites, p, ms);
    if (!tw) return;
    const x = Math.round(dx + tw.fx * w), y = Math.round(dy + tw.fy * h);
    const arm = tw.k < 0.2 ? 0 : tw.k < 0.45 ? 1 : tw.k < 0.75 ? 2 : 1;
    s.fillStyle = p.special === B.PRISM ? '#fff6c8' : this.sprites.ramps[p.type][5];
    for (let i = 1; i <= arm; i++) {
      s.fillRect(x - i, y, 1, 1); s.fillRect(x + i, y, 1, 1);
      s.fillRect(x, y - i, 1, 1); s.fillRect(x, y + i, 1, 1);
    }
    s.fillStyle = '#ffffff';
    s.fillRect(x, y, 1, 1);
    if (arm === 2) { s.fillRect(x - 1, y, 3, 1); s.fillRect(x, y - 1, 1, 3); }
  }
}

// ----------------------------------------------------------------- smooth

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function comicFrame(ctx) {
  const { a, b, frame, light, dark } = THEME.board;
  const inset = (k, r, fill) => { roundedRect(ctx, k, k, ART - 2 * k, ART - 2 * k, r); ctx.fillStyle = fill; ctx.fill(); };
  inset(0.3, 6, INK);
  inset(1.5, 5, frame);
  // flat cel shading on the gold band
  ctx.save();
  roundedRect(ctx, 1.5, 1.5, ART - 3, ART - 3, 5);
  ctx.clip();
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, ART, 2.5); ctx.fillRect(0, 0, 2.5, ART);
  ctx.fillStyle = dark;
  ctx.fillRect(0, ART - 2.5, ART, 2.5); ctx.fillRect(ART - 2.5, 0, 2.5, ART);
  ctx.restore();
  roundedRect(ctx, PAD - 1.2, PAD - 1.2, BOARD + 2.4, BOARD + 2.4, 2.5);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.save();
  roundedRect(ctx, PAD, PAD, BOARD, BOARD, 1.5);
  ctx.clip();
  for (let r = 0; r < B.SIZE; r++) {
    for (let c = 0; c < B.SIZE; c++) {
      ctx.fillStyle = (r + c) % 2 ? b : a;
      ctx.fillRect(PAD + c * T, PAD + r * T, T, T);
      if ((r + c) % 2 === 0) continue;
      // print dots on every other tile
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let y = 1.2; y < T; y += 2.4) {
        for (let x = 1.2; x < T; x += 2.4) {
          ctx.beginPath();
          ctx.arc(PAD + c * T + x, PAD + r * T + y, 0.42, 0, TAU);
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}

function realisticFrame(ctx) {
  // brushed gold around a recessed velvet tray
  const gold = ctx.createLinearGradient(0, 0, ART, ART);
  gold.addColorStop(0, '#fff4c0');
  gold.addColorStop(0.22, '#e0a92e');
  gold.addColorStop(0.5, '#8a5a10');
  gold.addColorStop(0.74, '#f2cd68');
  gold.addColorStop(1, '#8f6010');
  roundedRect(ctx, 0.2, 0.2, ART - 0.4, ART - 0.4, 4);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  roundedRect(ctx, 0.8, 0.8, ART - 1.6, ART - 1.6, 3.4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(50,25,0,0.6)';
  ctx.lineWidth = 0.5;
  roundedRect(ctx, 3.6, 3.6, ART - 7.2, ART - 7.2, 2);
  ctx.stroke();
  roundedRect(ctx, PAD - 0.8, PAD - 0.8, BOARD + 1.6, BOARD + 1.6, 1.6);
  ctx.fillStyle = '#080312';
  ctx.fill();
  for (let r = 0; r < B.SIZE; r++) {
    for (let c = 0; c < B.SIZE; c++) {
      const x = PAD + c * T, y = PAD + r * T;
      const g = ctx.createRadialGradient(x + T * 0.42, y + T * 0.38, 1, x + T / 2, y + T / 2, T * 0.76);
      const even = (r + c) % 2 === 0;
      g.addColorStop(0, even ? '#2f1a58' : '#3d2470');
      g.addColorStop(1, even ? '#160a30' : '#1f1040');
      roundedRect(ctx, x + 0.25, y + 0.25, T - 0.5, T - 0.5, 1.6);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }
  // the frame casts a shadow into the tray
  const top = ctx.createLinearGradient(0, PAD, 0, PAD + 7);
  top.addColorStop(0, 'rgba(0,0,0,0.6)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(PAD, PAD, BOARD, 7);
  const left = ctx.createLinearGradient(PAD, 0, PAD + 5, 0);
  left.addColorStop(0, 'rgba(0,0,0,0.45)');
  left.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = left;
  ctx.fillRect(PAD, PAD, 5, BOARD);
}

class SmoothLook {
  constructor(style) {
    this.pixel = false;
    this.comic = style === 'comic';
    this.sprites = smoothSprites(style);
    this.shadow = this.comic ? { dx: 0.8, dy: 1, alpha: 0.3 } : { dx: 0.3, dy: 0.9, alpha: 0.8 };
    this.fitted = null;
  }

  // Copies of every sprite at exactly the size a tile has on screen, with the drop
  // shadow already underneath: drawing a resting gem is then one plain 1:1 copy
  // instead of a filtered down-scale of a big sprite plus a separate shadow.
  fit(S) {
    const set = this.sprites;
    const px = Math.max(8, Math.round(T * S));
    const key = `${px}/${set.version}`;
    if (this.fitted?.key === key) return this.fitted;
    const sh = this.shadow;
    const copy = (src, shadow = null) => {
      const c = document.createElement('canvas');
      c.width = c.height = px;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      if (shadow) {
        ctx.globalAlpha = sh.alpha;
        ctx.drawImage(shadow, sh.dx * S, sh.dy * S, px, px);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(src, 0, 0, px, px);
      return c;
    };
    this.fitted = {
      key,
      animated: !!set.baked,
      pieces: set.pieces.map((p) => ({
        frames: (p.frames ?? [p.img]).map((f) => copy(f, p.shadow)),
        white: copy(p.white),
        shine: set.baked ? null : p.shine.map((f) => copy(f)),
      })),
      prism: set.prism.map((f) => copy(f, set.prismShadow)),
      prismWhite: copy(set.prismWhite),
    };
    return this.fitted;
  }

  buildFrame(S) {
    const px = Math.max(1, Math.round(ART * S));
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const ctx = c.getContext('2d');
    ctx.scale(px / ART, px / ART);
    if (this.comic) comicFrame(ctx); else realisticFrame(ctx);
    return c;
  }

  highlight(s, r, c, strength) {
    const x = PAD + c * T + 0.5, y = PAD + r * T + 0.5, w = T - 1;
    roundedRect(s, x, y, w, w, 3);
    if (this.comic) {
      s.fillStyle = `rgba(255,255,255,${0.2 * strength})`;
      s.fill();
      s.lineWidth = 1.6;
      s.strokeStyle = INK;
      s.stroke();
      s.lineWidth = 0.8;
      s.strokeStyle = strength > 0.75 ? '#ffffff' : THEME.board.frame;
      s.stroke();
    } else {
      s.fillStyle = `rgba(255,236,180,${0.16 * strength})`;
      s.fill();
      s.lineWidth = 2;
      s.strokeStyle = `rgba(255,214,120,${0.3 * strength})`;
      s.stroke();
      s.lineWidth = 0.55;
      s.strokeStyle = `rgba(255,240,190,${strength})`;
      s.stroke();
    }
  }

  markers(s, { time: t, selected, queue, hint }) {
    if (selected) this.highlight(s, selected.r, selected.c, 0.8 + 0.2 * Math.sin(t / 110));
    // queued swaps waiting their turn: corner dots, brighter for the next one up
    queue.forEach((m, i) => {
      for (const { r, c } of [m.a, m.b]) {
        const x = PAD + c * T, y = PAD + r * T;
        for (const [px, py] of [[x + 2, y + 2], [x + T - 2, y + 2], [x + 2, y + T - 2], [x + T - 2, y + T - 2]]) {
          s.beginPath();
          s.arc(px, py, 0.85, 0, TAU);
          if (this.comic) {
            s.lineWidth = 0.5;
            s.strokeStyle = INK;
            s.stroke();
          }
          s.fillStyle = i === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)';
          s.fill();
        }
      }
    });
    if (hint) {
      const strength = 0.55 + 0.45 * Math.sin((t - hint.since) / 170);
      for (const cell of [hint.a, hint.b]) this.highlight(s, cell.r, cell.c, strength);
    }
  }

  specialBack(s, p, dx, dy, w, h, ms) {
    const t = ms / 1000;
    const ramp = this.sprites.ramps[p.type];
    const mx = dx + w / 2, my = dy + h / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6 + p.phase * 6);
    if (p.special === B.NOVA) {
      if (this.comic) {
        // a spiky comic burst slowly turning behind the gem
        const spikes = 10, spin = t * 0.9;
        s.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const a = spin + (i / (spikes * 2)) * TAU;
          const q = i % 2 ? 7.6 : 10.2 + pulse * 0.8;
          s[i ? 'lineTo' : 'moveTo'](mx + Math.cos(a) * q, my + Math.sin(a) * q);
        }
        s.closePath();
        s.fillStyle = ramp[4];
        s.fill();
        s.lineWidth = 0.75;
        s.strokeStyle = INK;
        s.stroke();
      } else {
        const rad = 12 + pulse * 2.5;
        const g = s.createRadialGradient(mx, my, 3, mx, my, rad);
        g.addColorStop(0, rgba(ramp[4], 0.95));
        g.addColorStop(0.5, rgba(ramp[3], 0.5));
        g.addColorStop(1, rgba(ramp[3], 0));
        s.globalCompositeOperation = 'lighter';
        s.fillStyle = g;
        s.fillRect(mx - rad, my - rad, rad * 2, rad * 2);
        s.globalCompositeOperation = 'source-over';
      }
    } else if (this.comic) {
      // a chunky plus showing the row and column it will clear
      const a = 10.4, b = 2.4 + pulse * 0.4;
      s.beginPath();
      for (const [x, y] of [[-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b]]) s.lineTo(mx + x, my + y);
      s.closePath();
      s.fillStyle = ramp[4];
      s.fill();
      s.lineWidth = 0.75;
      s.strokeStyle = INK;
      s.stroke();
    } else {
      s.globalCompositeOperation = 'lighter';
      for (const horiz of [true, false]) {
        const half = 3.4;
        const g = horiz ? s.createLinearGradient(0, my - half, 0, my + half) : s.createLinearGradient(mx - half, 0, mx + half, 0);
        g.addColorStop(0, rgba(ramp[3], 0));
        g.addColorStop(0.5, rgba(ramp[5], 0.55 + pulse * 0.4));
        g.addColorStop(1, rgba(ramp[3], 0));
        s.fillStyle = g;
        if (horiz) s.fillRect(dx - 1, my - half, w + 2, half * 2);
        else s.fillRect(mx - half, dy - 1, half * 2, h + 2);
      }
      s.globalCompositeOperation = 'source-over';
    }
  }

  specialFront(s, p, dx, dy, w, h, ms) {
    const t = ms / 1000;
    const ramp = this.sprites.ramps[p.type];
    const mx = dx + w / 2, my = dy + h / 2;
    if (!this.comic) s.globalCompositeOperation = 'lighter';
    if (p.special === B.NOVA) {
      // four sparks orbiting the gem
      for (let i = 0; i < 4; i++) {
        const a = t * 3.5 + i * (Math.PI / 2);
        star4(s, mx + Math.cos(a) * 8.2, my + Math.sin(a) * 8.2, this.comic ? 2.6 : 2.8, 0.25);
        if (this.comic) {
          s.lineWidth = 0.55;
          s.strokeStyle = INK;
          s.stroke();
        }
        s.fillStyle = '#ffffff';
        s.fill();
      }
    } else {
      // chevrons pulsing outward along the row and column
      const k = (t * 2.5) % 1;
      const d = 7 + k * 2.2;
      for (const [ax, ay] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const px = mx + ax * d, py = my + ay * d;
        const chevron = () => {
          s.beginPath();
          s.moveTo(px - ay * 1.9 - ax * 1.3, py + ax * 1.9 - ay * 1.3);
          s.lineTo(px + ax * 0.6, py + ay * 0.6);
          s.lineTo(px + ay * 1.9 - ax * 1.3, py - ax * 1.9 - ay * 1.3);
        };
        s.lineCap = 'round';
        s.lineJoin = 'round';
        chevron();
        if (this.comic) {
          s.lineWidth = 1.9;
          s.strokeStyle = INK;
          s.stroke();
        }
        s.lineWidth = 0.9;
        s.strokeStyle = this.comic ? '#ffffff' : ramp[5];
        s.stroke();
      }
    }
    s.globalCompositeOperation = 'source-over';
  }

  twinkle(s, p, dx, dy, w, h, ms) {
    const tw = twinkleAt(this.sprites, p, ms);
    if (!tw) return;
    const x = dx + tw.fx * w, y = dy + tw.fy * h;
    const r = 0.5 + Math.sin(tw.k * Math.PI) * (this.comic ? 3.2 : 4);
    star4(s, x, y, r, 0.2);
    if (this.comic) {
      s.lineWidth = 0.5;
      s.strokeStyle = INK;
      s.stroke();
      s.fillStyle = '#ffffff';
      s.fill();
    } else {
      s.globalCompositeOperation = 'lighter';
      s.fillStyle = '#ffffff';
      s.fill();
      s.globalCompositeOperation = 'source-over';
    }
  }
}
