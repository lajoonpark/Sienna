// The shop's brush on a 2D canvas, for what the world's pinned strokes (brushstrokes.js) cannot reach:
// the search bars, the small window's card, everything the suitcase wears and (its shapes, via coverpaint.js) the covers. A mark here is the same
// mark as there (the same shape as atlasFragment: ragged sides, bristle tracks, a dry tail, a wet rim),
// and a coat is laid the same way: staggered rows, all pulled in one direction.
import { rng } from './rand.js';

// The diagonal the arm falls into, as brushstrokes.js LEAN (a canvas's y runs down, so the sign flips).
export const LEAN = 0.5;

export const STAMP_W = 192, STAMP_H = 48, VARIANTS = 6;
const W = STAMP_W, H = STAMP_H;
export const COVERED = 0.6;    // how much of a stamp's height the mark fills

// value noise from a table: stamps are made on the main thread, so this has to be cheap
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

// coverage, pigment density and wet rim of each variant, once (coverpaint.js presses these straight into pixels)
let shapes = null;
export function brushShapes() {
  if (shapes) return shapes;
  shapes = [];
  for (let k = 0; k < VARIANTS; k++) {
    const seed = k * 7.3 + 1, cover = new Float32Array(W * H), density = new Float32Array(W * H), rim = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = ((y + 0.5) / H) * 2 - 1;
      const body = smooth(0, 0.05, u) * (1 - smooth(0.7, 0.99, u) ** 2);
      const centre = (fbm(u * 1.3, seed + 9) - 0.5) * 0.45;
      const width = 0.6 * body * (1 + (fbm(u * 2.5, seed) - 0.5) * 0.6) + (fbm(u * 9, seed + 3) - 0.5) * 0.2 * body;
      const d = Math.abs(v - centre) / Math.max(width, 0.001) + (noise(u * 26, v * 7 + seed) - 0.5) * 0.22;
      const bristle = fbm(u * 1.5, v * 9 + seed * 2);
      const dry = smooth(0.35, 1, u) * 0.75 + (fbm(u * 6, v * 4 + seed) - 0.5) * 0.35;
      const c = (1 - smooth(0.84, 1, d)) * smooth(dry - 0.16, dry + 0.16, bristle + 0.14);
      const i = y * W + x;
      cover[i] = c;
      density[i] = 0.8 + 0.2 * smooth(0.25, 0.75, bristle);
      rim[i] = smooth(0.7, 0.98, d) * c;
    }
    shapes.push({ cover, density, rim });
  }
  return shapes;
}

const toRGB = (color) => {
  if (Array.isArray(color)) return color;
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const stamps = new Map();
function stamp(color, variant) {
  const rgb = toRGB(color);
  const key = rgb.join() + variant;
  let c = stamps.get(key);
  if (c) return c;
  if (stamps.size > 240) stamps.clear();   // only a few palettes are ever in use at once
  c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), { cover, density, rim } = brushShapes()[variant];
  const br = rgb[0], bg = rgb[1], bb = rgb[2];
  const br0 = br / 255, bg0 = bg / 255, bb0 = bb / 255;
  const d = img.data;
  for (let i = 0; i < W * H; i++) {
    const c0 = cover[i];
    if (c0 <= 0) continue;
    const streak = 0.9 + 0.5 * (density[i] - 0.8), ri = rim[i], o = i * 4;
    if (ri <= 0) {
      d[o] = br * streak;
      d[o + 1] = bg * streak;
      d[o + 2] = bb * streak;
    } else {
      const pool = 1 + ri * 0.45, k = 255 * streak; // pigment pools at the edge of the mark
      d[o] = br0 ** pool * k;
      d[o + 1] = bg0 ** pool * k;
      d[o + 2] = bb0 ** pool * k;
    }
    d[o + 3] = 255 * c0;
  }
  g.putImageData(img, 0, 0);
  stamps.set(key, c);
  return c;
}

// One mark, centred at x, y; wid is the width of the painted part.
export function mark(g, x, y, len, wid, angle, color, r, alpha = 1) {
  const h = wid / COVERED;
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(1, r() < 0.5 ? -1 : 1);
  g.globalAlpha = alpha;
  g.drawImage(stamp(color, Math.floor(r() * VARIANTS)), -len / 2, -h / 2, len, h);
  g.restore();
}

const pick = (tones, r) => tones[Math.floor(r() * tones.length)];

// A full coat over w x h in staggered rows pulled one way. Each row starts somewhere of its own, as in
// brushstrokes.js: evenly staggered rows line their ends up into a false second diagonal.
//   tones: colours to load the brush with, or (x, y, r) => colour
//   tile:  the coat wraps round (w and h are one tile of a repeating texture)
export function coat(g, w, h, { tones, len, wid, seed = 1, lean = LEAN, rowGap = 0.3, colGap = 0.62, alpha = 1, tile = false }) {
  const r = rng(seed);
  const tone = typeof tones === 'function' ? tones : () => pick(tones, r);
  const rowH = len * rowGap, colW = len * colGap;
  const put = (x, y) => {
    const a = lean + (r() - 0.5) * 0.14, m = r(), f = 0.85 + r() * 0.3, colour = tone(x, y, r);
    for (const [dx, dy] of tile ? [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h], [-w, -h], [w, -h], [-w, h], [w, h]] : [[0, 0]]) {
      const rs = rng(Math.floor(m * 1e6));   // the wrapped copies are the very same mark
      mark(g, x + dx, y + dy, len * f, wid * f, a, colour, rs, alpha);
    }
  };
  if (tile) {
    const rows = Math.round(h / rowH), cols = Math.round(w / colW);
    for (let j = 0; j < rows; j++) {
      const start = (j * 0.618) % 1;
      for (let i = 0; i < cols; i++) put(((i + start + (r() - 0.5) * 0.8) / cols) * w, ((j + (r() - 0.5) * 0.5) / rows) * h);
    }
    return;
  }
  // rows laid along the lean, wide enough to reach every corner of the box
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

// A swipe of paint for 2D UI, as an image: long pulls side by side make its body and ragged ends, then a
// coat on the same diagonal as the shop goes over, on this body only (as the world's strokes keep to their
// own surface), so it reads as brushwork and not as a flat label. Solid enough in the middle to carry text.
//   body: tones for the long pulls (coat tones default to the same)   rows: long pulls one above another
export const brushBand = (w, h, opts) => brushBandCanvas(w, h, opts).toDataURL();

// The same swipe as a canvas, for what draws it itself (searchpaint.js).
export function brushBandCanvas(w, h, { tones, coatTones = tones, seed = 1, rows = 2, scale = 2 }) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  const r = rng(seed);
  const pad = Math.max(2, h * 0.09), rowH = (h - pad * 2) / rows, wid = Math.min(h - pad * 2, rowH * 1.45);
  // Short enough pulls that only the last few px of the band run dry: a mark's tail is a share of its
  // length, and a long dry tail would open holes under the text at the right-hand end.
  const pulls = Math.max(1, Math.round(w / Math.max(h * 2.6, 70)));
  const len = (w / pulls) * 1.5;
  for (let pass = 0; pass < 3; pass++) {      // later passes close the gaps between earlier ones
    for (let j = 0; j < rows; j++) {
      const y = pad + rowH * (j + 0.5) + (r() - 0.5) * rowH * 0.1;
      for (let i = 0; i < pulls; i++) {
        const x = Math.max(len / 2, Math.min(w - len / 2, (w / pulls) * (i + 0.5 + pass * 0.33) + (r() - 0.5) * 14));
        mark(g, x, y, len, wid * (pass === 0 ? 1 : 0.9), (r() - 0.5) * 0.014, pick(tones, r), r);
      }
    }
  }
  g.globalCompositeOperation = 'source-atop';
  coat(g, w, h, { tones: coatTones, len: Math.max(h * 1.5, 46), wid: Math.max(h * 0.42, 13), seed: seed + 1, rowGap: 0.34, colGap: 0.72, alpha: 0.9 });
  return c;
}

// the palettes of the 2D paint
export const TONES = {
  ink: ['#2d3158', '#353a66', '#272b4e', '#3d4272', '#2f3a62'],
  hot: ['#b4503a', '#c05d44', '#a8472f', '#c86a4d', '#b8583c'],
  paper: ['#fbf5e8', '#f7eedb', '#f3e7cf', '#fdf9ef', '#f6ebd6'],
};
