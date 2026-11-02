// Smooth gems for the non-pixel styles, painted once with canvas paths at high
// resolution. Each cut is an outline plus a ring of facets around a flat table;
// the realistic and comic painters only differ in how they colour those facets.

import { GEM_RAMPS, INK, hsl } from './sprites.js';

const SIZE = 160;      // sprite resolution in pixels
const U = SIZE * 0.44; // pixels per unit of shape space
const TAU = Math.PI * 2;
const LIGHT = [-0.6, -0.8]; // 2-D direction the light comes from (top-left)

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------- shapes

const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

function withMidpoints(corners, parts = 2) {
  const out = [];
  corners.forEach((p, i) => {
    const q = corners[(i + 1) % corners.length];
    for (let k = 0; k < parts; k++) out.push(lerp(p, q, k / parts));
  });
  return out;
}

// Facet anchors on a curved outline: where rays from the centre leave it.
function rayAnchors(poly, center, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    poly.forEach((p, j) => {
      const q = poly[(j + 1) % poly.length];
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) return;
      const t = ((p[0] - center[0]) * ey - (p[1] - center[1]) * ex) / den;
      const u = ((p[0] - center[0]) * dy - (p[1] - center[1]) * dx) / den;
      if (t > best && u >= 0 && u <= 1) best = t;
    });
    out.push([center[0] + dx * best, center[1] + dy * best]);
  }
  return out;
}

const circle = (r, n = 96) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * TAU) * r, Math.sin((i / n) * TAU) * r]);

const HEART = Array.from({ length: 96 }, (_, i) => {
  const t = (i / 96) * TAU;
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  return [(16 * Math.sin(t) ** 3) / 17, (y - 2.5) / 15.5];
});

const PEAR = (() => {
  const r = 0.72, cy = 0.24, top = -0.98;
  const right = Array.from({ length: 24 }, (_, i) => {
    const k = i / 24;
    return [r * k ** 0.72, top + (cy - top) * k];
  });
  const arc = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI;
    return [Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  const left = right.slice(1).reverse().map(([x, y]) => [-x, y]);
  return [...right, ...arc, ...left];
})();

const HEX = [[0, -0.98], [0.86, -0.49], [0.86, 0.49], [0, 0.98], [-0.86, 0.49], [-0.86, -0.49]];
const KITE = [[0, -1], [0.94, 0], [0, 1], [-0.94, 0]];
const OCTA = [[-0.52, -0.96], [0.52, -0.96], [0.76, -0.72], [0.76, 0.72], [0.52, 0.96], [-0.52, 0.96], [-0.76, 0.72], [-0.76, -0.72]];
const TRI = [[-1, -0.72], [1, -0.72], [0, 0.98]];
const ROUND = circle(0.96);

// Softens every sharp corner of an outline: the stretch within r of the corner,
// measured along the outline, becomes a smooth curve. Real stones have no
// needle-sharp points either.
export function roundCorners(poly, r = 0.15) {
  const n = poly.length;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const turn = (i) => {
    const a = poly[(i + n - 1) % n], b = poly[i], c = poly[(i + 1) % n];
    const u = Math.atan2(b[1] - a[1], b[0] - a[0]), v = Math.atan2(c[1] - b[1], c[0] - b[0]);
    return Math.abs(Math.atan2(Math.sin(v - u), Math.cos(v - u)));
  };
  const skipped = new Set();
  // walks r along the outline, marking the vertices that the curve replaces
  const walk = (i, dir) => {
    let left = r, j = i;
    for (;;) {
      const k = (j + dir + n) % n;
      const d = dist(poly[j], poly[k]);
      if (d >= left) return lerp(poly[j], poly[k], left / d);
      left -= d;
      j = k;
      skipped.add(j);
    }
  };
  const curves = new Map();
  for (let i = 0; i < n; i++) {
    if (skipped.has(i) || turn(i) < 0.3) continue;
    const a = walk(i, -1), b = walk(i, 1);
    const pts = [];
    for (let q = 0; q <= 8; q++) {
      const k = q / 8;
      pts.push(lerp(lerp(a, poly[i], k), lerp(poly[i], b, k), k));
    }
    curves.set(i, pts);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (curves.has(i)) out.push(...curves.get(i));
    else if (!skipped.has(i)) out.push(poly[i]);
  }
  return out;
}

function nearestOnOutline(poly, p) {
  let best = poly[0], bestD = Infinity;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    const q = [a[0] + ex * k, a[1] + ey * k];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bestD) { bestD = d; best = q; }
  });
  return best;
}

// A finished cut: rounded outline, with the facet anchors moved onto it.
function cut(poly, center, anchors, rest) {
  const outline = roundCorners(poly);
  const verts = anchors(outline).map((v) => nearestOnOutline(outline, v));
  const out = { poly: outline, center, verts, ...rest };
  if (rest.comicVerts) out.comicVerts = rest.comicVerts.map((v) => nearestOnOutline(outline, v));
  return out;
}

// The heart's landmarks, clockwise from the dip: comic facets radiate from these
// so they reach right into the lobes.
const HEART_LANDMARKS = (() => {
  const right = HEART.filter(([x]) => x > 0);
  const top = right.reduce((a, b) => (b[1] < a[1] ? b : a));
  const side = right.reduce((a, b) => (b[0] > a[0] ? b : a));
  const tip = HEART.reduce((a, b) => (b[1] > a[1] ? b : a));
  const dip = [0, (-5 - 2.5) / 15.5];
  return [dip, top, side, tip, [-side[0], side[1]], [-top[0], top[1]]];
})();

export const shapes = [
  cut(HEART, [0, -0.06], (o) => rayAnchors(o, [0, -0.06], 12), { comicVerts: HEART_LANDMARKS, shine: 0.95, table: 0.48 }),
  cut(HEX, [0, 0], () => withMidpoints(HEX), { table: 0.54 }),
  cut(KITE, [0, 0], () => withMidpoints(KITE), { table: 0.5 }),
  cut(OCTA, [0, 0], () => OCTA, { step: true, coarse: 1, table: 0.46 }),
  cut(ROUND, [0, 0], (o) => rayAnchors(o, [0, 0], 16), { table: 0.56 }),
  cut(TRI, [0, -0.15], () => withMidpoints(TRI, 3), { coarse: 3, table: 0.48 }),
  cut(PEAR, [0, 0.14], (o) => rayAnchors(o, [0, 0.14], 12), { shine: 0.93, table: 0.5 }),
];

function scaled(p, center, k) { return lerp(center, p, k); }

// Splits a cut into crown facets: for each outline edge, the outer "girdle"
// triangle plus the two inner triangles that meet the table.
function crownSegments(shape) {
  const { center, verts, table } = shape;
  return verts.map((o0, i) => {
    const o1 = verts[(i + 1) % verts.length];
    const t0 = scaled(o0, center, table), t1 = scaled(o1, center, table);
    const m = scaled(lerp(t0, t1, 0.5), center, 1.22);
    const mid = lerp(o0, o1, 0.5);
    const d = Math.hypot(mid[0] - center[0], mid[1] - center[1]) || 1;
    const nx = (mid[0] - center[0]) / d, ny = (mid[1] - center[1]) / d;
    return { o0, o1, t0, t1, m, e0: scaled(o0, center, 1.3), e1: scaled(o1, center, 1.3), lit: nx * LIGHT[0] + ny * LIGHT[1], i };
  });
}

// Emerald cut: concentric steps instead of triangles.
function stepRings(shape) {
  const { center, verts } = shape;
  const levels = [1.3, 0.8, 0.62, shape.table];
  const rings = [];
  for (let l = 0; l < levels.length - 1; l++) {
    verts.forEach((v, i) => {
      const w = verts[(i + 1) % verts.length];
      const mid = lerp(v, w, 0.5);
      const d = Math.hypot(mid[0], mid[1]) || 1;
      const nx = mid[0] / d, ny = mid[1] / d;
      rings.push({
        quad: [scaled(v, center, levels[l]), scaled(w, center, levels[l]), scaled(w, center, levels[l + 1]), scaled(v, center, levels[l + 1])],
        lit: nx * LIGHT[0] + ny * LIGHT[1],
        step: l,
        i,
      });
    });
  }
  return rings;
}

// ---------------------------------------------------------------- drawing

function newCanvas(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// All painting happens in shape units with the origin at the sprite's centre.
function unitContext(c) {
  const ctx = c.getContext('2d');
  ctx.setTransform(U, 0, 0, U, SIZE / 2, SIZE / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return ctx;
}

function polyPath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function fillPoly(ctx, pts, fill) {
  polyPath(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function star4(ctx, x, y, r, waist = 0.18) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const q = i % 2 ? r * waist : r;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  ctx.closePath();
}

function tablePoints(shape) {
  return shape.poly.map((p) => scaled(p, shape.center, shape.table));
}

// -------------------------------------------------------------- realistic

// paint(l, facet): colour at lightness l (0..1) for a given facet index.
function paintRealistic(ctx, shape, paint, seed) {
  const rnd = seeded(seed);
  const [cx, cy] = shape.center;
  ctx.save();
  polyPath(ctx, shape.poly);
  ctx.clip();

  // the body: light enters at the top-left and dies away towards the far edge
  const body = ctx.createRadialGradient(cx - 0.28, cy - 0.34, 0.05, cx, cy, 1.3);
  body.addColorStop(0, paint(0.6, 0));
  body.addColorStop(0.5, paint(0.36, 0));
  body.addColorStop(1, paint(0.1, 0));
  ctx.fillStyle = body;
  ctx.fillRect(-1.3, -1.3, 2.6, 2.6);

  if (shape.step) {
    for (const f of stepRings(shape)) {
      const l = 0.36 + 0.34 * f.lit + (f.step === 1 ? 0.12 : f.step === 2 ? -0.06 : 0) + (rnd() - 0.5) * 0.1;
      const g = ctx.createLinearGradient(f.quad[0][0], f.quad[0][1], f.quad[3][0], f.quad[3][1]);
      g.addColorStop(0, paint(l - 0.1, f.i));
      g.addColorStop(1, paint(l + 0.1, f.i));
      fillPoly(ctx, f.quad, g);
    }
  } else {
    const segs = crownSegments(shape);
    for (const s of segs) {
      const base = 0.24 + 0.2 * s.lit + (rnd() - 0.5) * 0.14;
      const g = ctx.createLinearGradient(s.m[0], s.m[1], (s.o0[0] + s.o1[0]) / 2, (s.o0[1] + s.o1[1]) / 2);
      g.addColorStop(0, paint(base + 0.16, s.i));
      g.addColorStop(1, paint(base - 0.08, s.i));
      fillPoly(ctx, [s.e0, s.e1, s.m], g);
    }
    for (const s of segs) {
      const a = 0.38 + 0.28 * s.lit + (s.i % 2 ? 0.12 : -0.06) + (rnd() - 0.5) * 0.12;
      const b = 0.38 + 0.28 * s.lit + (s.i % 2 ? -0.06 : 0.12) + (rnd() - 0.5) * 0.12;
      fillPoly(ctx, [s.o0, s.t0, s.m], paint(a, s.i));
      fillPoly(ctx, [s.o1, s.t1, s.m], paint(b, s.i + 1));
    }
  }

  // the table, looking down into the stone
  const table = tablePoints(shape);
  ctx.save();
  polyPath(ctx, table);
  ctx.clip();
  const tg = ctx.createLinearGradient(cx - 0.5, cy - 0.5, cx + 0.5, cy + 0.5);
  tg.addColorStop(0, paint(0.72, 0));
  tg.addColorStop(0.55, paint(0.44, 0));
  tg.addColorStop(1, paint(0.3, 0));
  ctx.fillStyle = tg;
  ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
  if (shape.step) {
    // an emerald cut reflects long parallel bands, like a hall of mirrors
    for (let i = 0; i < 5; i++) {
      const x = -0.34 + i * 0.17;
      ctx.fillStyle = paint(i % 2 ? 0.82 : 0.2, i);
      ctx.globalAlpha = 0.38;
      ctx.fillRect(x, -1, 0.085, 2);
    }
    ctx.globalAlpha = 1;
  } else {
    // pavilion facets seen through the table: sharp light and dark arrows
    const wedges = shape.verts.length * 2;
    for (let i = 0; i < wedges; i++) {
      const a0 = (i / wedges) * TAU, a1 = ((i + 1) / wedges) * TAU;
      const bright = rnd();
      ctx.globalAlpha = 0.34 + rnd() * 0.3;
      fillPoly(ctx, [[cx, cy], [cx + Math.cos(a0) * 1.4, cy + Math.sin(a0) * 1.4], [cx + Math.cos(a1) * 1.4, cy + Math.sin(a1) * 1.4]],
        bright > 0.58 ? paint(0.86, i) : bright < 0.34 ? paint(0.14, i) : paint(0.5, i));
    }
    ctx.globalAlpha = 0.7;
    star4(ctx, cx, cy, 0.3, 0.42);
    ctx.fillStyle = paint(0.9, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // facet edges catch the light
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  polyPath(ctx, table);
  ctx.stroke();
  if (!shape.step) {
    for (const s of crownSegments(shape)) {
      ctx.beginPath();
      ctx.moveTo(s.o0[0], s.o0[1]); ctx.lineTo(s.t0[0], s.t0[1]);
      ctx.moveTo(s.o0[0], s.o0[1]); ctx.lineTo(s.m[0], s.m[1]); ctx.lineTo(s.o1[0], s.o1[1]);
      ctx.strokeStyle = s.lit > 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)';
      ctx.stroke();
    }
  }

  // light gathers where it leaves the stone, opposite the source
  ctx.globalCompositeOperation = 'lighter';
  const caustic = ctx.createRadialGradient(cx + 0.3, cy + 0.42, 0, cx + 0.3, cy + 0.42, 0.62);
  caustic.addColorStop(0, paint(0.62, 3));
  caustic.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = caustic;
  ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
  // soft window reflection on the crown
  const sheen = ctx.createRadialGradient(cx - 0.42, cy - 0.5, 0, cx - 0.42, cy - 0.5, 0.62);
  sheen.addColorStop(0, 'rgba(255,255,255,0.62)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
  ctx.globalCompositeOperation = 'source-over';

  // polished rim: bright towards the light, dark away from it
  const rim = ctx.createLinearGradient(-0.8, -0.9, 0.8, 0.9);
  rim.addColorStop(0, 'rgba(255,255,255,0.75)');
  rim.addColorStop(0.42, 'rgba(255,255,255,0.05)');
  rim.addColorStop(0.62, 'rgba(0,0,0,0.05)');
  rim.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.lineWidth = 0.09;
  ctx.strokeStyle = rim;
  polyPath(ctx, shape.poly);
  ctx.stroke();
  ctx.restore();

  ctx.lineWidth = 0.022;
  ctx.strokeStyle = 'rgba(10,2,24,0.55)';
  polyPath(ctx, shape.poly);
  ctx.stroke();

  // sharp glints
  ctx.fillStyle = '#ffffff';
  star4(ctx, cx - 0.3, cy - 0.34, 0.27);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  star4(ctx, cx + 0.24, cy + 0.26, 0.12);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ comic

// tone(i, facet): flat colour i of a dark-to-light ramp; facet -1 is the table.
function paintComic(ctx, shape, tone) {
  const [cx, cy] = shape.center;
  const flat = (v, facet) => tone(v < 0.3 ? 1 : v < 0.5 ? 2 : v < 0.74 ? 3 : 4, facet);
  // comic art uses far fewer, bigger facets than the real cut
  const coarse = { ...shape, verts: shape.comicVerts ?? shape.verts.filter((_, i) => i % (shape.coarse ?? 2) === 0) };
  const segs = crownSegments(coarse);

  // heavier ink on the shadow side
  ctx.save();
  ctx.translate(0.03, 0.045);
  polyPath(ctx, shape.poly);
  ctx.lineWidth = 0.09;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  polyPath(ctx, shape.poly);
  ctx.clip();

  fillPoly(ctx, shape.poly, tone(3, 0));
  for (const s of segs) fillPoly(ctx, [s.e0, s.e1, s.t1, s.t0], flat(0.56 + 0.46 * s.lit, s.i));

  // halftone print dots on the facets facing away from the light
  for (const s of segs) {
    if (s.lit > -0.25) continue;
    ctx.save();
    polyPath(ctx, [s.e0, s.e1, s.t1, s.t0]);
    ctx.clip();
    ctx.fillStyle = tone(0, s.i);
    const step = 0.13;
    for (let y = -1.2; y < 1.2; y += step) {
      for (let x = -1.2 + ((Math.round(y / step) & 1) * step) / 2; x < 1.2; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 0.03, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // table in flat light with a hard diagonal shadow
  // the table repeats the outline: a heart has a little heart in it
  const table = tablePoints(shape);
  fillPoly(ctx, table, tone(4, -1));
  ctx.save();
  polyPath(ctx, table);
  ctx.clip();
  fillPoly(ctx, [[cx - 1.4, cy + 0.42], [cx + 0.5, cy - 1.4], [cx + 1.4, cy - 1.4], [cx + 1.4, cy + 1.4], [cx - 1.4, cy + 1.4]], tone(3, -1));
  fillPoly(ctx, [[cx - 1.4, cy + 1.06], [cx + 1.1, cy - 1.4], [cx + 1.4, cy - 1.4], [cx + 1.4, cy + 1.4], [cx - 1.4, cy + 1.4]], tone(2, -1));
  ctx.restore();

  // inked facet lines
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.036;
  ctx.beginPath();
  for (const s of segs) { ctx.moveTo(s.e0[0], s.e0[1]); ctx.lineTo(s.t0[0], s.t0[1]); }
  ctx.stroke();
  polyPath(ctx, table);
  ctx.stroke();

  // a bold cartoon shine following the upper-left edge
  const inner = shape.poly.map((p) => scaled(p, shape.center, 0.8));
  const dense = withMidpoints(inner, 4);
  const reach = shape.shine ?? 0.8;
  const toLight = (p) => {
    const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1;
    return (dx * LIGHT[0] + dy * LIGHT[1]) / d;
  };
  const first = dense.findIndex((p) => toLight(p) <= reach);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.095;
  ctx.beginPath();
  let drawing = false;
  for (let i = 0; i < dense.length; i++) {
    const p = dense[(first + i) % dense.length];
    if (toLight(p) > reach) { ctx[drawing ? 'lineTo' : 'moveTo'](p[0], p[1]); drawing = true; }
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  star4(ctx, cx - 0.14, cy - 0.16, 0.24, 0.2);
  ctx.fill();
  ctx.restore();

  // the outer ink line
  ctx.lineWidth = 0.075;
  ctx.strokeStyle = INK;
  polyPath(ctx, shape.poly);
  ctx.stroke();
}

// --------------------------------------------------------------- the sets

const REAL_COLOURS = [
  (l) => hsl(0.965, 0.92, l),                // ruby
  (l) => hsl(0.085, 0.95, l),                // amber
  (l) => hsl(0.135, 0.95, l),                // citrine
  (l) => hsl(0.405, 0.85, l),                // emerald
  (l) => hsl(0.605, 0.9, l),                 // sapphire
  (l) => hsl(0.775, 0.8, l),                 // amethyst
  (l, i) => (i % 5 === 2 && l > 0.5 ? hsl(i * 0.17, 0.75, 0.82) : hsl(0.6, 0.3, 0.38 + Math.max(0, Math.min(1, l)) * 0.62)), // diamond with fire
];

const clampL = (l) => Math.max(0, Math.min(1, l));

function paintGem(style, type) {
  const c = newCanvas();
  const ctx = unitContext(c);
  if (style === 'comic') paintComic(ctx, shapes[type], (i) => GEM_RAMPS[type][i]);
  else paintRealistic(ctx, shapes[type], (l, i) => REAL_COLOURS[type](clampL(l), i), 7 + type);
  return c;
}

function paintPrism(style, phase) {
  const c = newCanvas();
  const ctx = unitContext(c);
  const shape = shapes[4];
  const n = shape.verts.length;
  if (style === 'comic') {
    const L = [0.2, 0.36, 0.52, 0.66, 0.8, 0.95];
    paintComic(ctx, shape, (i, facet) => (facet < 0 ? hsl(phase, 0.9, L[i] + 0.12) : hsl((2 * facet) / n + phase, 0.95, L[i] + 0.06)));
  } else {
    paintRealistic(ctx, shape, (l, i) => hsl(i / n + phase, 0.92, clampL(l * 0.82 + 0.1)), 303);
  }
  return c;
}

function silhouette(src, colour) {
  const c = newCanvas(src.width);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, src.width, src.width);
  return c;
}

// Realistic stones cast a soft shadow, comic ones a hard ink one.
function shadowOf(src, soft) {
  if (!soft) return silhouette(src, INK);
  const size = src.width;
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  // drawn off-canvas so that only its blurred shadow lands on the sprite
  ctx.shadowColor = '#07010f';
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetX = size * 2;
  ctx.drawImage(src, -size * 2, 0);
  return c;
}

function shineFrames(src, hard, frames = 7) {
  return Array.from({ length: frames }, (_, f) => {
    const c = newCanvas();
    const ctx = c.getContext('2d');
    const at = -0.2 + (f / (frames - 1)) * 1.4;
    const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    const band = (k, col) => g.addColorStop(Math.max(0, Math.min(1, k)), col);
    band(at - 0.14, 'rgba(255,255,255,0)');
    if (hard) { band(at - 0.05, 'rgba(255,255,255,0)'); band(at - 0.05, 'rgba(255,255,255,0.75)'); band(at + 0.05, 'rgba(255,255,255,0.75)'); band(at + 0.05, 'rgba(255,255,255,0)'); } else band(at, 'rgba(255,255,255,0.95)');
    band(at + 0.14, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(src, 0, 0);
    return c;
  });
}

// The brightest spots of a sprite, as 0..1 fractions: where sparkles appear.
function brightSpots(src) {
  const size = src.width;
  const d = src.getContext('2d').getImageData(0, 0, size, size).data;
  const pts = [];
  for (let y = 0; y < size; y += 6) {
    for (let x = 0; x < size; x += 6) {
      const i = (y * size + x) * 4;
      if (d[i + 3] < 250) continue;
      pts.push([x / size, y / size, 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]]);
    }
  }
  pts.sort((a, b) => b[2] - a[2]);
  return pts.slice(0, Math.max(6, Math.floor(pts.length / 3))).map(([x, y]) => [x, y]);
}

const cache = new Map();

// Every image the board needs for 'realistic' or 'comic', built once on first use.
export function smoothSprites(style) {
  if (cache.has(style)) return cache.get(style);
  const soft = style === 'realistic';
  const pieces = Array.from({ length: 7 }, (_, t) => {
    const img = paintGem(style, t);
    return { img, white: silhouette(img, '#ffffff'), shadow: shadowOf(img, soft), shine: shineFrames(img, !soft), spots: brightSpots(img) };
  });
  const prism = Array.from({ length: 12 }, (_, f) => paintPrism(style, f / 12));
  const set = {
    pieces,
    prism,
    prismWhite: silhouette(prism[0], '#ffffff'),
    prismShadow: shadowOf(prism[0], soft),
    prismSpots: brightSpots(prism[0]),
    ramps: GEM_RAMPS,
  };
  cache.set(style, set);
  return set;
}

// ------------------------------------------------------------- baked gems

// The realistic gems are ray traced ahead of time (tools/bake-gems.mjs): one sprite
// sheet per gem, recording it through a wobble in a studio of lights. The painted
// stones above stand in until these arrive, and for good if they cannot be fetched.
const BAKED = { gems: 7, frames: 32, cols: 8, size: 128 };
const SHEETS = new URL('../assets/gems/', import.meta.url);

function sliceSheet(sheet) {
  return Array.from({ length: BAKED.frames }, (_, f) => {
    const c = newCanvas(BAKED.size);
    const x = (f % BAKED.cols) * BAKED.size, y = Math.floor(f / BAKED.cols) * BAKED.size;
    c.getContext('2d').drawImage(sheet, x, y, BAKED.size, BAKED.size, 0, 0, BAKED.size, BAKED.size);
    return c;
  });
}

function fetchSheet(i) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = new URL(`${i}.webp`, SHEETS).href;
  });
}

let bakedLoad = null;

// Upgrades the realistic set in place once the sheets have loaded.
export function loadBakedGems() {
  if (bakedLoad) return bakedLoad;
  bakedLoad = Promise.all(Array.from({ length: BAKED.gems + 1 }, (_, i) => fetchSheet(i))).then((sheets) => {
    const set = smoothSprites('realistic');
    sheets.forEach((sheet, i) => {
      const frames = sliceSheet(sheet);
      if (i < BAKED.gems) {
        Object.assign(set.pieces[i], { frames, img: frames[0], white: silhouette(frames[0], '#ffffff'), shadow: shadowOf(frames[0], true), spots: brightSpots(frames[0]) });
      } else {
        Object.assign(set, { prism: frames, prismWhite: silhouette(frames[0], '#ffffff'), prismShadow: shadowOf(frames[0], true), prismSpots: brightSpots(frames[0]) });
      }
    });
    set.baked = true;
  }).catch(() => { /* keep the painted stones */ });
  return bakedLoad;
}
