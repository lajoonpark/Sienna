// Oil-paint dabs on a 2D canvas, ported from the app (app/src/brushpaint.js) so the page is painted
// the same way: a rounded loaded start, a wandering centreline, torn sides, a dry ragged tail breaking
// into bristle tracks, raised impasto ridges lit from the upper left, and a second colour streaked along
// the bristles. Used for the button plates, paper, the suitcase's textures, the records and the covers.
import { rng } from './rand.js';
import { COLORS } from './tokens.js';

// The diagonal the arm falls into (a canvas's y runs down).
export const LEAN = 0.5;

export const STAMP_W = 160, STAMP_H = 56, VARIANTS = 8;
const W = STAMP_W, H = STAMP_H;
export const DAB_WIDTH = 0.62;
export const COVERED = DAB_WIDTH; // share of stamp height filled across

export function makeCanvas(w, h) {
  if (typeof document === 'undefined') {
    const c = new OffscreenCanvas(w, h);
    return [c, c.getContext('2d')];
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Value noise from a table: stamps and cover dabs are computed on the CPU, so this stays fast.
const TABLE = (() => { const r = rng(99); return Float32Array.from({ length: 65536 }, () => r()); })();
const cell = (x, y) => TABLE[(x & 255) | ((y & 255) << 8)];
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = cell(ix, iy), b = cell(ix + 1, iy), c = cell(ix, iy + 1), d = cell(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1 + 7.3, y * 2.1 + 7.3) * 0.3 + noise(x * 4.3 + 1.7, y * 4.3 + 1.7) * 0.15;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Precomputed dab shapes (alpha, height, slopes, streak), worker-safe (no DOM).
let shapes = null;
export function oilDabShapes() {
  if (shapes) return shapes;
  shapes = [];
  const rawH = new Float32Array(W * H);
  const blurH = new Float32Array(W * H);
  for (let k = 0; k < VARIANTS; k++) {
    const seed = (k % 4) * 7.3 + Math.floor(k / 4) * 13.1 + 1;
    const alpha = new Float32Array(W * H);
    const streak = new Float32Array(W * H);
    const slopeU = new Float32Array(W * H);
    const slopeV = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const v = ((y + 0.5) / H) * 2 - 1;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W;
        const centre = (fbm(u * 1.6, seed + 9) - 0.5) * 0.25 * (0.4 + u);
        const xv = v - centre;
        const w = DAB_WIDTH * (0.85 + 0.15 * Math.sin(Math.PI * Math.min(1, u * 1.1))) * (1 + (fbm(u * 6, seed + 2) - 0.5) * 0.18);
        const start = 0.05 + 0.04 * noise(xv * 4, seed + 3) + 0.06 * xv * xv;
        const end = 0.92 - 0.28 * fbm(xv * 5 + 2, seed + 4);
        const ax = Math.abs(xv) + (noise(u * 30, xv * 6 + seed) - 0.5) * 0.06;
        const body = (1 - smooth(w - 0.06, w, ax)) * smooth(start, start + 0.03, u) * (1 - smooth(end - 0.02, end + 0.015, u));
        const tracks = noise(xv * 22, u * 2 + seed) * 0.65 + noise(xv * 53, u * 3 + seed * 2) * 0.35;
        const dry = smooth(end - 0.3, end, u);
        const paint = body * smooth(dry * 0.65 - 0.07, dry * 0.65 + 0.07, tracks + 0.05);
        const ridge = smooth(w - 0.34, w - 0.07, ax);
        const heap = 1 - smooth(start, start + 0.22, u);
        const h = paint * (0.3 + 0.24 * tracks + 0.28 * ridge + 0.26 * heap + 0.08 * fbm(u * 5, xv * 5 + seed));
        const i = y * W + x;
        rawH[i] = Math.min(1, h);
        alpha[i] = smooth(0.3, 0.62, paint);
        streak[i] = fbm(xv * 3.4 + seed, u * 1.2);
      }
    }
    // a slight blur before the slopes, so broad ridges catch the light and pixel noise does not
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - 1), y1 = Math.min(H - 1, y + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - 1), x1 = Math.min(W - 1, x + 1);
        blurH[y * W + x] = (
          rawH[y0 * W + x0] + rawH[y0 * W + x] + rawH[y0 * W + x1] +
          rawH[y * W + x0] + rawH[y * W + x] + rawH[y * W + x1] +
          rawH[y1 * W + x0] + rawH[y1 * W + x] + rawH[y1 * W + x1]
        ) / 9;
      }
    }
    for (let y = 0; y < H; y++) {
      const ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
      for (let x = 0; x < W; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1);
        const i = y * W + x;
        slopeU[i] = (blurH[y * W + xp] - blurH[y * W + xm]) * 0.5;
        slopeV[i] = (blurH[yp * W + x] - blurH[ym * W + x]) * 0.5;
      }
    }
    shapes.push({ alpha, slopeU, slopeV, streak });
  }
  return shapes;
}

const toRGB = (color) => {
  if (Array.isArray(color)) return color;
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Cached lit stamps. Angle and tone are quantized so the cache stays small while the upper-left light
// stays consistent whichever way a dab points.
const stamps = new Map();
export function dabStamp(color, variant, { angle = LEAN, tone = 0.5, warm = 0.5, streakHi = true, impasto = 1.15, flipY = false, soft = false } = {}) {
  const rgb = toRGB(color);
  const aq = Math.round(angle * 4);
  const tq = Math.round(tone * 2);
  const wq = Math.round(warm * 2);
  const key = `${rgb.join()}|${variant}|${aq}|${tq}|${wq}|${streakHi ? 1 : 0}|${flipY ? 1 : 0}|${Math.round(impasto * 10)}|${soft ? 1 : 0}`;
  let c = stamps.get(key);
  if (c) return c;
  if (stamps.size > 640) stamps.clear();
  let g;
  [c, g] = makeCanvas(W, H);
  const img = g.createImageData(W, H), d = img.data;
  const { alpha, slopeU, slopeV, streak } = oilDabShapes()[variant];
  const aRad = aq / 4;
  const ca = Math.cos(aRad), sa = Math.sin(aRad);
  const toneMul = 0.92 + 0.16 * (tq / 2);
  const warmMix = wq / 2;
  const wR = 1.05 - 0.11 * warmMix, wG = 1.0, wB = 0.93 + 0.14 * warmMix;
  const c1 = [rgb[0] * toneMul * wR, rgb[1] * toneMul * wG, rgb[2] * toneMul * wB];
  const c2 = soft
    ? [c1[0] * 0.96, c1[1] * 0.95, c1[2] * 0.92]
    : streakHi
      ? [c1[0] * 1.15 + 4, c1[1] * 1.1 + 3, c1[2] * 1.0 + 2]
      : [c1[0] * 0.8, c1[1] * 0.84, c1[2] * 0.92];
  for (let i = 0; i < W * H; i++) {
    const a = alpha[i];
    if (a <= 0.004) continue;
    const sm = smooth(0.52, 0.78, streak[i]);
    const R = c1[0] + (c2[0] - c1[0]) * sm;
    const G = c1[1] + (c2[1] - c1[1]) * sm;
    const B = c1[2] + (c2[2] - c1[2]) * sm;
    const su = slopeU[i], sv = flipY ? -slopeV[i] : slopeV[i];
    const gx = ca * su - sa * sv;
    const gy = sa * su + ca * sv;
    const rake = 0.5 * gx - 0.7 * gy;
    const shade = 1 + rake * 2.4 * impasto;
    const lum = (0.3 * R + 0.5 * G + 0.2 * B) / 255;
    const spec = rake > 0 ? rake * rake * 1.5 * impasto * (0.3 + lum) * 255 : 0;
    d[i * 4] = Math.max(0, Math.min(255, R * shade + spec));
    d[i * 4 + 1] = Math.max(0, Math.min(255, G * shade + spec * 0.97));
    d[i * 4 + 2] = Math.max(0, Math.min(255, B * shade + spec * 0.9));
    d[i * 4 + 3] = Math.round(255 * a);
  }
  g.putImageData(img, 0, 0);
  stamps.set(key, c);
  return c;
}

// One oil dab centred at x, y; wid is the width of the painted body.
export function mark(g, x, y, len, wid, angle, color, r, alpha = 1, { impasto = 1.15, quiet = false } = {}) {
  const h = wid / COVERED;
  const variant = Math.floor(r() * VARIANTS);
  const tone = quiet ? 0.5 : r(), warm = quiet ? 0.5 : r(), streakHi = quiet ? false : r() > 0.5;
  const flipY = r() < 0.5;
  const st = dabStamp(color, variant, { angle, tone, warm, streakHi, impasto, flipY });
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(1, flipY ? -1 : 1);
  g.globalAlpha = alpha;
  g.drawImage(st, -len / 2, -h / 2, len, h);
  g.restore();
}

const pick = (tones, r) => tones[Math.floor(r() * tones.length)];

// A full coat of opaque dabs over w x h in staggered rows pulled one way.
//   tones: colours to load the brush with, or (x, y, r) => colour
//   tile:  the coat wraps round (w and h are one tile of a repeating texture)
export function coat(g, w, h, { tones, len, wid, seed = 1, lean = LEAN, rowGap = 0.28, colGap = 0.56, alpha = 1, tile = false, impasto = 1.1, quiet = false }) {
  const r = rng(seed);
  const tone = typeof tones === 'function' ? tones : () => pick(tones, r);
  const rowH = len * rowGap, colW = len * colGap;
  const put = (x, y) => {
    const a = lean + (r() - 0.5) * (quiet ? 0.12 : 0.2), m = r(), f = 0.85 + r() * 0.3, colour = tone(x, y, r);
    for (const [dx, dy] of tile ? [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h], [-w, -h], [w, -h], [-w, h], [w, h]] : [[0, 0]]) {
      const rs = rng(Math.floor(m * 1e6));
      mark(g, x + dx, y + dy, len * f, wid * f, a, colour, rs, alpha, { impasto, quiet });
    }
  };
  if (tile) {
    const rows = Math.max(1, Math.round(h / rowH)), cols = Math.max(1, Math.round(w / colW));
    for (let j = 0; j < rows; j++) {
      const start = (j * 0.618) % 1;
      for (let i = 0; i < cols; i++) put(((i + start + (r() - 0.5) * 0.8) / cols) * w, ((j + (r() - 0.5) * 0.5) / rows) * h);
    }
    return;
  }
  const reach = Math.hypot(w, h) / 2 + len, c = Math.cos(lean), s = Math.sin(lean);
  let j = 0;
  for (let b = -reach; b < reach; b += rowH, j++) {
    const start = ((j * 0.618) % 1) * colW;
    for (let a = -reach + start; a < reach; a += colW) {
      const aw = a + (r() - 0.5) * colW * 0.8, bw = b + (r() - 0.5) * rowH * 0.5;
      const x = w / 2 + aw * c - bw * s, y = h / 2 + aw * s + bw * c;
      if (x > -len && x < w + len && y > -len && y < h + len) put(x, y);
    }
  }
}

// Subtle woven linen tooth (tileable 128 px), as under the app's oil paint.
let weaveTile = null;
export function canvasWeavePattern(g) {
  if (!weaveTile) {
    const S = 128;
    const [c, cg] = makeCanvas(S, S);
    const img = cg.createImageData(S, S), d = img.data;
    const r = rng(404);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const weave = (Math.sin(x * 1.9) * Math.sin(y * 1.9 + 1.3)) * 0.5 + 0.5;
        const tooth = 0.86 + r() * 0.14;
        const v = Math.round(255 * (0.955 + 0.045 * (tooth * 0.65 + weave * 0.35)));
        const i = (y * S + x) * 4;
        d[i] = v; d[i + 1] = v; d[i + 2] = Math.max(0, v - 2); d[i + 3] = 255;
      }
    }
    cg.putImageData(img, 0, 0);
    weaveTile = c;
  }
  return g.createPattern(weaveTile, 'repeat');
}

// A deterministic layout of chunky dabs spanning w x h (button plates, chips, the progress line).
//   even: one coat of a single paint, so overlaps do not show as lighter and darker patches
//   soft: like even, with a gentler warm bristle streak for paper and cream coats
export function layoutDabCluster(w, h, { tones, seed = 1, rows = 1, flipX = false, tilt = 0.08, overlap = 0.52, minCols = 1, impasto = 1.25, even = false, soft = false } = {}) {
  const r = rng(seed);
  const rowH = h / rows;
  const edgeTilt = tilt * 0.5 + (rows > 1 ? (rows - 1) * 0.015 : 0);
  const targetDabW = Math.max(rowH * 1.55, 72);
  const cols = Math.max(minCols, Math.ceil(w / (targetDabW * overlap * 0.8)));
  const len = Math.min(w * 0.96, Math.max(targetDabW, (w / cols) * 1.95));
  const wid = rows === 1 ? Math.min(h * 0.74, h / 1.36) : Math.min(h * 0.65, rowH * 1.28);
  const edgeY = Math.min(h * 0.42, wid * 1.08 * 0.55 + len * Math.sin(edgeTilt) * 0.45 + 1.5);
  const jitterY = Math.max(1, Math.min(4, rowH * 0.08, rows === 1 ? h * 0.5 - edgeY : ((h - 2 * edgeY) / rows) * 0.25));
  const jitterX = Math.min(5, len * 0.045);
  const startInset = len * 0.45 + jitterX + 1;
  const tailInset = len * 0.34 + jitterX + 1;
  const minCx = Math.min(w * 0.46, flipX ? tailInset : startInset);
  const maxCx = Math.max(minCx, w - (flipX ? startInset : tailInset));
  const dabs = [];
  for (let j = 0; j < rows; j++) {
    const baseY = rows === 1 ? h * 0.5 : edgeY + (j / (rows - 1)) * (h - 2 * edgeY);
    for (let i = 0; i < cols; i++) {
      const t = cols === 1 ? 0.5 : i / (cols - 1);
      const baseCx = flipX ? maxCx + (minCx - maxCx) * t : minCx + (maxCx - minCx) * t;
      const cx = baseCx + (r() - 0.5) * 2 * jitterX;
      const cy = baseY + (r() - 0.5) * 2 * jitterY;
      const dLen = len * (0.92 + r() * 0.12);
      const dWid = wid * (0.92 + r() * 0.16);
      const angle = (r() - 0.5) * tilt + (j - (rows - 1) / 2) * 0.03;
      let color = pick(tones, r);
      const variant = Math.floor(r() * VARIANTS);
      let tone = r(), warm = r(), streakHi = r() > 0.5;
      const flipY = r() < 0.5;
      if (even || soft) { color = tones[0]; tone = 0.5; warm = 0.5; streakHi = false; }
      dabs.push({ x: cx, y: cy, len: dLen, wid: dWid, angle, color, variant, tone, warm, streakHi, flipY, flipX, impasto, soft });
    }
  }
  return dabs;
}

export function drawOilDab(g, dab, { alpha = 1 } = {}) {
  const effAngle = dab.flipX ? dab.angle + Math.PI : dab.angle;
  const st = dabStamp(dab.color, dab.variant, {
    angle: effAngle, tone: dab.tone, warm: dab.warm, streakHi: dab.streakHi, impasto: dab.impasto, flipY: dab.flipY, soft: dab.soft,
  });
  const h = dab.wid / COVERED;
  g.save();
  g.translate(dab.x, dab.y);
  g.rotate(effAngle);
  g.scale(1, dab.flipY ? -1 : 1);
  g.globalAlpha = alpha;
  g.drawImage(st, -dab.len / 2, -h / 2, dab.len, h);
  g.restore();
}

// One even, fully opaque coat inside the torn outline (the dabs' dry tails are see-through).
export function solidify(g, w, h) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = Math.round(255 * smooth(0.12, 0.45, d[i] / 255));
  g.putImageData(img, 0, 0);
}

export function dabClusterCanvas(w, h, opts) {
  const scale = opts.scale ?? 2;
  const [c, g] = makeCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
  g.scale(scale, scale);
  for (const dab of layoutDabCluster(w, h, opts)) drawOilDab(g, dab);
  if (opts.solid) solidify(g, c.width, c.height);
  return c;
}

export const dabCluster = (w, h, opts) => dabClusterCanvas(w, h, opts).toDataURL();

// The palettes of the 2D paint
export const TONES = {
  ink: [COLORS.indigo, '#353a66', '#272b4e', '#3d4272', '#2f3a62'],
  hot: [COLORS.terracotta, '#b34e38', '#983b28', '#bb583f', '#a2422d'],
  paper: [COLORS.paper, '#f5ecd9', '#f0e4cd', '#faf4e7', '#f3e8d2'],
  track: [COLORS.paperLo, '#e5d9c2', '#ded1b9', '#e2d6be'],
  mustard: [COLORS.mustard, '#f5cd55', '#e9b937', '#f0c447'],
};
