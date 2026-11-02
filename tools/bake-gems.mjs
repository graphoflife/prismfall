// Bakes the realistic gems with a small ray tracer, so the game itself never has
// to compute any light. Each stone is a faceted 3D model that slowly wobbles in a
// studio of lights. Rays enter through the crown, refract, bounce around inside
// (Fresnel reflection and total internal reflection), lose colour with the length
// of their path (Beer-Lambert) and leave towards whatever light they find, which
// is what makes real stones flash as they move. The frames become one sprite sheet
// per gem in assets/gems.
//
//   node tools/bake-gems.mjs            bake everything (needs Python with Pillow for WebP)
//   node tools/bake-gems.mjs --only 4,5   re-bake just these gems
//   node tools/bake-gems.mjs --preview out.png   one quick contact sheet to judge the look

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shapes, bigFacetAnchors } from '../js/gems.js';

const FRAMES = 32, COLS = 8;       // keep in sync with BAKED in js/gems.js
const SIZE = 128, SUPER = 3;
const UNIT = 0.44;                 // sprite width per unit of shape space, as in js/gems.js
const MAX_BOUNCES = 8;
const EXPOSURE = 1.8;
const CAMERA = 3.2;                // viewing distance; rays fan out, so a light catches only part of a facet

// ior: refractive index (three values = per colour, which splits light into "fire").
// colour: what fraction of each colour survives one unit of travel inside the stone.
// gain: extra brightness for stones that would otherwise read as dull on the dark tray.
const GEMS = [
  { name: 'ruby', shape: 0, ior: 1.77, colour: [0.93, 0.03, 0.08] },
  { name: 'amber', shape: 1, ior: 1.62, colour: [0.98, 0.46, 0.04] },
  { name: 'citrine', shape: 2, ior: 1.55, colour: [0.97, 0.74, 0.04] },
  { name: 'emerald', shape: 3, ior: 1.58, colour: [0.03, 0.72, 0.2] },
  { name: 'blue topaz', shape: 4, ior: 1.62, colour: [0.1, 0.56, 1], gain: 1.7 },
  { name: 'amethyst', shape: 5, ior: 1.55, colour: [0.64, 0.16, 0.94] },
  { name: 'diamond', shape: 6, ior: [2.36, 2.42, 2.52], colour: [0.99, 0.99, 1] },
  { name: 'prism', shape: 4, ior: [1.9, 2.1, 2.4], colour: [1, 1, 1], rainbow: true },
];

// ------------------------------------------------------------------- model

// Outline points from anchor i to anchor i+1 (both included), for every anchor.
function girdleSections(poly, anchors) {
  const position = (p) => {
    let best = 0, bestD = Infinity;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)));
      const d = Math.hypot(a[0] + ex * k - p[0], a[1] + ey * k - p[1]);
      if (d < bestD) { bestD = d; best = i + k; }
    });
    return best;
  };
  const pos = anchors.map(position);
  return anchors.map((a, i) => {
    const b = anchors[(i + 1) % anchors.length];
    const from = pos[i];
    let to = pos[(i + 1) % anchors.length];
    if (to <= from) to += poly.length;
    const pts = [a];
    for (let v = Math.floor(from) + 1; v <= Math.ceil(to) - 1; v++) pts.push(poly[v % poly.length]);
    pts.push(b);
    return pts;
  });
}

// Triangles of a closed stone: crown above the girdle (z = 0), pavilion below.
function buildMesh(shape) {
  const [cx, cy] = shape.center;
  const scaled = (p, k) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const at = (p, z) => [p[0], p[1], z];
  const anchors = bigFacetAnchors(shape);
  const n = anchors.length;
  const sections = girdleSections(shape.poly, anchors);
  const tris = [];
  const add = (a, b, c, plane = null) => tris.push([a, b, c, plane]);
  // A facet reaching a curved stretch of girdle is many thin triangles, but they all
  // reflect like the one flat plane through its ends, so that it reads as a single facet.
  const fan = (i, apex) => {
    const g = sections[i];
    const plane = [at(g[0], 0), at(g[g.length - 1], 0), apex];
    for (let j = 0; j + 1 < g.length; j++) add(at(g[j], 0), at(g[j + 1], 0), apex, plane);
  };

  if (shape.step) {
    // emerald cut: terraces instead of triangles
    const rings = (levels) => levels.map(([k, z]) => anchors.map((a) => at(scaled(a, k), z)));
    const steps = (ring, tip) => {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        fan(i, ring[0][i]);
        add(at(anchors[j], 0), ring[0][i], ring[0][j]);
        for (let l = 0; l + 1 < ring.length; l++) {
          add(ring[l][i], ring[l][j], ring[l + 1][i]);
          add(ring[l][j], ring[l + 1][j], ring[l + 1][i]);
        }
        add(ring[ring.length - 1][i], ring[ring.length - 1][j], tip);
      }
    };
    steps(rings([[0.74, 0.22], [shape.table, 0.36]]), [cx, cy, 0.36]);
    steps(rings([[0.56, -0.42]]), [cx, cy, -0.8]);
    return tris;
  }

  // a clean cut: one flat table, one big facet per side above and below
  const crown = 0.34, depth = 0.86;
  const top = [cx, cy, crown], culet = [cx, cy, -depth];
  anchors.forEach((a, i) => {
    const b = anchors[(i + 1) % n];
    const t0 = scaled(a, shape.table), t1 = scaled(b, shape.table);
    const m = at(mid(t0, t1), crown);
    add(top, at(t0, crown), at(t1, crown));          // table
    add(at(a, 0), at(t0, crown), m);                 // crown facet, down to the curved girdle
    add(at(b, 0), at(t1, crown), m);
    fan(i, m);
    fan(i, culet);                                   // pavilion facet
  });
  return tris;
}

// ------------------------------------------------------------------ studio

function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function unit(x, y, z) { const m = Math.hypot(x, y, z); return [x / m, y / m, z / m]; }
const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// Big soft windows from all sides, so that no part of a stone stays dark...
const SOFTBOXES = [
  { d: unit(-0.45, -0.55, 0.7), inner: 0.95, outer: 0.88, i: 1.5 },
  { d: unit(0.55, -0.45, 0.7), inner: 0.96, outer: 0.89, i: 1.25 },
  { d: unit(0.5, 0.5, 0.7), inner: 0.97, outer: 0.91, i: 0.8 },
  { d: unit(-0.55, 0.45, 0.7), inner: 0.97, outer: 0.91, i: 0.8 },
];
// ...and many tiny hard lights, which are what makes a moving stone sparkle.
const PINS = (() => {
  const r = mulberry(4711);
  return Array.from({ length: 70 }, () => {
    const z = 0.3 + r() * 0.68, az = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    const size = (0.2 + r() * 0.3) * (Math.PI / 180);
    return { d: [Math.cos(az) * s, Math.sin(az) * s, z], inner: Math.cos(size), outer: Math.cos(size * 1.6), i: 50 + r() * 110 };
  });
})();

let envR = 0, envG = 0, envB = 0;
let rainbowStudio = false;

// The light arriving from direction (x, y, z); +z points at the viewer. The gains
// weaken the windows and pin lights, see the surface reflection in trace().
function env(x, y, z, softGain = 1, pinGain = 1) {
  let v;
  if (z <= 0) {
    // Light that leaks out through the back sees a softly lit tray, so that
    // stones with a low refractive index don't get black holes.
    envR = envG = envB = 0.2 + 0.1 * z;
    return;
  }
  const az = Math.atan2(y, x);
  const ring = smooth(0.25, 0.5, z) * (1 - smooth(0.86, 0.97, z));
  let add = 0;
  if (rainbowStudio) {
    // coloured windows: the wildcard stone flashes every colour of the board
    const a = az * 3 + z * 7;
    const wave = (ph) => { const w = 0.5 + 0.5 * Math.sin(a + ph); return 0.05 + ring * 3 * w * w * w; };
    envR = wave(0); envG = wave(2.094); envB = wave(4.189);
  } else {
    v = 0.12 + 0.08 * z;
    const w = 0.5 + 0.5 * Math.sin(az * 5 + 0.9);
    envR = envG = envB = v + softGain * ring * (0.2 + 0.85 * w * w);
    for (const s of SOFTBOXES) {
      const c = x * s.d[0] + y * s.d[1] + z * s.d[2];
      if (c > s.outer) add += softGain * s.i * smooth(s.outer, s.inner, c);
    }
  }
  if (pinGain > 0) {
    for (const p of PINS) {
      const c = x * p.d[0] + y * p.d[1] + z * p.d[2];
      if (c > p.outer) add += pinGain * p.i * smooth(p.outer, p.inner, c);
    }
  }
  envR += add; envG += add; envB += add;
}

// ------------------------------------------------------------------ tracer

const STRIDE = 15;
let TRI = new Float64Array(0), triCount = 0;
let hitT = 0, hitI = -1;

// Triangles of the stone in this frame's pose: corner, two edges, outward geometric
// normal (decides what a ray hits), outward facet normal (decides how light bends).
function poseMesh(mesh, center, rx, ry) {
  const [cx, cy] = center;
  const sx = Math.sin(rx), kx = Math.cos(rx), sy = Math.sin(ry), ky = Math.cos(ry);
  const turn = ([x0, y0, z0]) => {
    const x = x0 - cx, y = y0 - cy;
    const y1 = y * kx - z0 * sx, z1 = y * sx + z0 * kx;
    return [x * ky + z1 * sy + cx, y1 + cy, -x * sy + z1 * ky];
  };
  triCount = mesh.length;
  if (TRI.length < triCount * STRIDE) TRI = new Float64Array(triCount * STRIDE);
  const inner = turn([cx, cy, -0.15]);
  mesh.forEach(([a, b, c, plane], t) => {
    const v0 = turn(a), v1 = turn(b), v2 = turn(c);
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const [p0, p1, p2] = plane ? plane.map(turn) : [v0, v1, v2];
    const outward = (u, w, at) => {
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const m = Math.hypot(...n) || 1;
      n = n.map((q) => q / m);
      if (n[0] * (at[0] - inner[0]) + n[1] * (at[1] - inner[1]) + n[2] * (at[2] - inner[2]) < 0) n = n.map((q) => -q);
      return n;
    };
    const f1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const f2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    TRI.set([...v0, ...e1, ...e2, ...outward(e1, e2, v0), ...outward(f1, f2, p0)], t * STRIDE);
  });
}

// Nearest triangle along a ray; from outside only faces towards the ray count,
// from inside only faces away from it.
function nearest(ox, oy, oz, dx, dy, dz, inside) {
  hitT = Infinity; hitI = -1;
  for (let t = 0, o = 0; t < triCount; t++, o += STRIDE) {
    const facing = dx * TRI[o + 9] + dy * TRI[o + 10] + dz * TRI[o + 11];
    if (inside ? facing <= 1e-9 : facing >= -1e-9) continue;
    const e1x = TRI[o + 3], e1y = TRI[o + 4], e1z = TRI[o + 5];
    const e2x = TRI[o + 6], e2y = TRI[o + 7], e2z = TRI[o + 8];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det;
    const sx = ox - TRI[o], sy = oy - TRI[o + 1], sz = oz - TRI[o + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (d > 1e-7 && d < hitT) { hitT = d; hitI = o; }
  }
  return hitI >= 0;
}

function fresnel(cosI, cosT, n1, n2) {
  const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  const rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
  return (rs * rs + rp * rp) / 2;
}

let outR = 0, outG = 0, outB = 0;

// Follows the view ray through point (x, y) of the girdle plane. Returns false if it misses.
function trace(x, y, ior, ar, ag, ab) {
  outR = outG = outB = 0;
  const len = Math.hypot(x, y, CAMERA);
  const vx = x / len, vy = y / len, vz = -CAMERA / len;
  if (!nearest(0, 0, CAMERA, vx, vy, vz, false)) return false;
  let px = vx * hitT, py = vy * hitT, pz = CAMERA + vz * hitT;
  let nx = TRI[hitI + 12], ny = TRI[hitI + 13], nz = TRI[hitI + 14];

  // The mirror-like reflection off the surface. A studio photographer would hide
  // this: lamps mirrored in the flat table would veil the colour and show up as
  // round spots, so it is damped and the sparkle comes from inside the stone.
  const cosI = -(vx * nx + vy * ny + vz * nz);
  const sin2T = (1 - cosI * cosI) / (ior * ior);
  const cosT = Math.sqrt(1 - sin2T);
  const F = fresnel(cosI, cosT, 1, ior);
  env(vx + 2 * cosI * nx, vy + 2 * cosI * ny, vz + 2 * cosI * nz, 0.12, 0);
  outR += F * envR; outG += F * envG; outB += F * envB;

  // into the stone
  const eta = 1 / ior;
  const k = eta * cosI - cosT;
  let dx = eta * vx + k * nx, dy = eta * vy + k * ny, dz = eta * vz + k * nz;
  let tr = 1 - F, tg = 1 - F, tb = 1 - F;

  for (let b = 0; b <= MAX_BOUNCES; b++) {
    // light still inside after many bounces (or lost to the flat-facet shortcut)
    // simply joins the surroundings, rather than leaving a black hole
    if (b === MAX_BOUNCES || !nearest(px, py, pz, dx, dy, dz, true)) {
      env(dx, dy, dz);
      outR += tr * envR; outG += tg * envG; outB += tb * envB;
      break;
    }
    const d = hitT;
    tr *= Math.exp(-ar * d); tg *= Math.exp(-ag * d); tb *= Math.exp(-ab * d);
    px += dx * d; py += dy * d; pz += dz * d;
    nx = TRI[hitI + 12]; ny = TRI[hitI + 13]; nz = TRI[hitI + 14];
    let c = dx * nx + dy * ny + dz * nz; // leaving: c > 0
    if (c <= 1e-4) {
      // the flat facet normal disagrees with the real surface here, so use the real one
      nx = TRI[hitI + 9]; ny = TRI[hitI + 10]; nz = TRI[hitI + 11];
      c = dx * nx + dy * ny + dz * nz;
    }
    const s2 = ior * ior * (1 - c * c);
    if (s2 < 1) {
      // part of the light escapes towards the viewer's side of the room
      const ct = Math.sqrt(1 - s2);
      const f = fresnel(c, ct, ior, 1);
      const q = ior * c - ct;
      env(ior * dx - q * nx, ior * dy - q * ny, ior * dz - q * nz);
      outR += tr * (1 - f) * envR; outG += tg * (1 - f) * envG; outB += tb * (1 - f) * envB;
      tr *= f; tg *= f; tb *= f;
      if (tr + tg + tb < 0.015) break;
    }
    // total internal reflection, or the reflected remainder
    dx -= 2 * c * nx; dy -= 2 * c * ny; dz -= 2 * c * nz;
    px += dx * 1e-6; py += dy * 1e-6; pz += dz * 1e-6;
  }
  return true;
}

// Renders one pose to straight-alpha RGBA bytes, starburst flares included.
function renderFrame(gem, mesh, center, f, frames, size, ss, out, ox, oy) {
  // a closed wobble, so that the animation loops without a seam
  const a = (f / frames) * Math.PI * 2;
  poseMesh(mesh, center, Math.sin(a) * 0.2 + Math.sin(2 * a + 1) * 0.05, Math.cos(a) * 0.24 + Math.cos(3 * a) * 0.04);
  rainbowStudio = !!gem.rainbow;

  const absorb = gem.colour.map((c) => -Math.log(c));
  const iors = Array.isArray(gem.ior) ? gem.ior : null;
  const px = size * UNIT;
  const R = new Float32Array(size * size), G = new Float32Array(size * size), B = new Float32Array(size * size), A = new Float32Array(size * size);
  const weight = 1 / (ss * ss);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss - size / 2) / px, v = (y + (sy + 0.5) / ss - size / 2) / px;
          if (iors) {
            if (!trace(u, v, iors[0], absorb[0], absorb[1], absorb[2])) continue;
            R[i] += outR * weight;
            trace(u, v, iors[1], absorb[0], absorb[1], absorb[2]);
            G[i] += outG * weight;
            trace(u, v, iors[2], absorb[0], absorb[1], absorb[2]);
            B[i] += outB * weight;
          } else {
            if (!trace(u, v, gem.ior, absorb[0], absorb[1], absorb[2])) continue;
            R[i] += outR * weight; G[i] += outG * weight; B[i] += outB * weight;
          }
          A[i] += weight;
        }
      }
    }
  }

  // the brightest highlights bloom into little stars, as they do on a camera
  const scale = size / 128;
  const lum = (i) => (0.3 * R[i] + 0.59 * G[i] + 0.11 * B[i]) / Math.max(A[i], 0.001);
  const peaks = [];
  for (let y = 3; y < size - 3; y++) {
    for (let x = 3; x < size - 3; x++) {
      const i = y * size + x;
      if (A[i] < 0.5) continue;
      const l = lum(i);
      if (l < 3.2) continue;
      let top = true;
      for (let q = -3; q <= 3 && top; q++) for (let w = -3; w <= 3; w++) if (lum((y + q) * size + x + w) > l) { top = false; break; }
      if (top) peaks.push([x, y, l]);
    }
  }
  peaks.sort((p, q) => q[2] - p[2]);
  const flare = new Float32Array(size * size);
  for (const [x, y, l] of peaks.slice(0, 3)) {
    const strength = Math.min(1.2, 0.45 + l * 0.08);
    const len = Math.min(13, 5 + l * 0.8) * scale;
    const glow = 2 * scale;
    for (let q = -Math.ceil(len); q <= len; q++) {
      for (let w = -Math.ceil(len); w <= len; w++) {
        const X = x + w, Y = y + q;
        if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
        const across = Math.min(Math.abs(q), Math.abs(w)), along = Math.max(Math.abs(q), Math.abs(w));
        let v = 0;
        if (across < 1.2 * scale) v += (1 - across / (1.2 * scale)) * (1 - along / len) ** 2;
        const rr = Math.hypot(q, w);
        if (rr < glow * 2) v += 0.7 * Math.exp(-(rr * rr) / (glow * glow));
        flare[Y * size + X] += v * strength;
      }
    }
  }

  const exposure = EXPOSURE * (gem.gain ?? 1);
  const tone = (c) => Math.round(255 * Math.min(1, (1 - Math.exp(-c * exposure)) ** (1 / 2.2)));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const cover = A[i], fl = Math.min(1, flare[i]);
      const alpha = Math.max(cover, fl);
      if (alpha <= 0) continue;
      const o = ((oy + y) * out.width + ox + x) * 4;
      // straight colour under the coverage, then the flare added on top
      const c = Math.max(cover, 0.001);
      const add = (ch) => Math.min(255, Math.round((cover > 0 ? tone(ch / c) * (cover / alpha) : 0) + (255 * fl * (1 - cover / alpha) + (cover > 0 ? 255 * fl * 0.85 * (cover / alpha) : 0))));
      out.data[o] = add(R[i]);
      out.data[o + 1] = add(G[i]);
      out.data[o + 2] = add(B[i]);
      out.data[o + 3] = Math.round(alpha * 255);
    }
  }
}

// --------------------------------------------------------------------- PNG

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}
function encodePng({ width, height, data }) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const canvas = (width, height) => ({ width, height, data: new Uint8Array(width * height * 4) });

// -------------------------------------------------------------------- main

function bakeSheet(i) {
  const gem = GEMS[i], shape = shapes[gem.shape];
  const mesh = buildMesh(shape);
  const sheet = canvas(SIZE * COLS, SIZE * Math.ceil(FRAMES / COLS));
  for (let f = 0; f < FRAMES; f++) renderFrame(gem, mesh, shape.center, f, FRAMES, SIZE, SUPER, sheet, (f % COLS) * SIZE, Math.floor(f / COLS) * SIZE);
  return encodePng(sheet);
}

if (!isMainThread) {
  parentPort.postMessage({ i: workerData.i, png: bakeSheet(workerData.i) });
} else if (process.argv[2] === '--preview') {
  // two poses of every gem at a larger size, on the tray colour
  const size = 192, poses = [0, 11];
  const sheet = canvas(size * GEMS.length, size * poses.length);
  for (let n = 0; n < sheet.data.length; n += 4) { sheet.data[n] = 30; sheet.data[n + 1] = 15; sheet.data[n + 2] = 62; sheet.data[n + 3] = 255; }
  const cell = canvas(size, size);
  GEMS.forEach((gem, g) => {
    const shape = shapes[gem.shape], mesh = buildMesh(shape);
    poses.forEach((f, row) => {
      cell.data.fill(0);
      renderFrame(gem, mesh, shape.center, f, FRAMES, size, 2, cell, 0, 0);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const s = (y * size + x) * 4, o = ((row * size + y) * sheet.width + g * size + x) * 4, al = cell.data[s + 3] / 255;
          for (let c = 0; c < 3; c++) sheet.data[o + c] = cell.data[s + c] * al + sheet.data[o + c] * (1 - al);
        }
      }
    });
  });
  writeFileSync(process.argv[3], encodePng(sheet));
} else {
  const dir = fileURLToPath(new URL('../assets/gems/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const only = process.argv[2] === '--only' ? process.argv[3].split(',').map(Number) : GEMS.map((_, i) => i);
  let open = only.length;
  only.forEach((i) => {
    const gem = GEMS[i];
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { i } });
    w.on('message', ({ png }) => {
      writeFileSync(`${dir}${i}.png`, png);
      console.log(`${gem.name}: ${png.length} bytes`);
    });
    w.on('error', (e) => { console.error(gem.name, e); process.exitCode = 1; });
    w.on('exit', () => {
      if (--open) return;
      // far smaller than PNG, and every browser that can run the game reads it
      const py = `
from PIL import Image
import glob, os
for f in glob.glob(${JSON.stringify(dir)} + '*.png'):
    Image.open(f).save(f[:-4] + '.webp', quality=88, alpha_quality=95, method=6)
    os.remove(f)
    print(os.path.basename(f)[:-4] + '.webp', os.path.getsize(f[:-4] + '.webp'))
`;
      const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
      console.log(r.stdout, r.stderr);
    });
  });
}
