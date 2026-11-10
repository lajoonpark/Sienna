// Covers painted to match the shop: every album / playlist cover is repainted once, when it loads,
// as if copied by hand with the shop's brush. Under a first wash (fine detail softens, colour runs past
// its edges, it dries unevenly with darker rims) go real brush strokes (paintStrokes), then paper grain,
// and the margin stays unpainted. How strongly is Settings > Cover art (settings key 'covers',
// COVER_LEVELS): Off, Light, Medium, Heavy (the default: you still know the cover at a glance, faces,
// titles, big shapes, but it reads as painted).
//
//   paintCover(ctx, size, seed, level)  repaints the square canvas in place (call after drawing the cover)
//   paintedCoverURL(url, size)    -> Promise<data: URL> of the painted cover (for <img> in the search slips)
// The racks' and the suitcase's covers are painted off the main thread in coverpaint.worker.js (coverworker.js).
import { rng } from './rand.js';
import { settings } from './settings.js';
import { safeArtUrl, artSizeOk, ART_TIMEOUT_MS } from './arturl.js';
import { brushShapes, COVERED, LEAN, STAMP_W, STAMP_H, VARIANTS } from './brushpaint.js';

// strength multipliers per level (2 = the old "medium" look, tuned first)
export const COVER_LEVELS = [0, 0.55, 1, 1.75];
export const coverLevel = () => { const v = settings.get('covers'); return v >= 0 && v < COVER_LEVELS.length ? v : 3; };

const PAPER = '#f4ead6';
let grain = null;

// also runs in coverpaint.worker.js, where there is no document: OffscreenCanvas there
function canvas(w, h, options) {
  if (typeof document === 'undefined') { const c = new OffscreenCanvas(w, h); return [c, c.getContext('2d', options)]; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', options)];
}

// paper tooth, light grey speckle around mid-white (multiplied over the paint)
function grainCanvas() {
  if (grain) return grain;
  const S = 256;
  const [c, g] = canvas(S, S);
  const r = rng(77);
  g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {
    const v = Math.round(185 + r() * 70);
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},.55)`;
    const s = 0.8 + r() * 2.4;
    g.fillRect(r() * S, r() * S, s, s);
  }
  g.filter = 'blur(0.5px)';
  g.drawImage(c, 0, 0);
  grain = c;
  return c;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The picture at 256, 128, 64, 32 and 16 px, whatever size is being painted, so a cover's small version and
// its big one (swapped in on hover) get the very same strokes.
function colourLevels(source) {
  const levels = [];
  let from = source;
  for (let S = 256; S >= 16; S /= 2) {
    const [c, g] = canvas(S, S, { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(from, 0, 0, S, S);
    levels.push({ S, d: g.getImageData(0, 0, S, S).data });
    from = c;
  }
  return levels;
}
// the colour at u, v (0..1) of one level, 0..1 per channel
const colour = [0, 0, 0];
function colourAt({ S, d }, u, v, out = colour) {
  const x = Math.max(0, Math.min(S - 1.001, u * S - 0.5)), y = Math.max(0, Math.min(S - 1.001, v * S - 0.5));
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, i = (iy * S + ix) * 4;
  for (let k = 0; k < 3; k++) {
    const top = d[i + k] + (d[i + 4 + k] - d[i + k]) * fx;
    const low = d[i + S * 4 + k] + (d[i + S * 4 + 4 + k] - d[i + S * 4 + k]) * fx;
    out[k] = (top + (low - top) * fy) / 255;
  }
  return out;
}

// As brushstrokes.js LAYERS, in shares of the cover's side. The coat goes on first; smaller marks then add
// only what it could not hold. pick / against: colour levels a mark's colour is read from and compared with,
// gate: that difference where the mark starts / is fully there. clip: colour distance from what the mark is
// painting where it starts to break / stops, so it ends raggedly at the edge of a shape, keeping titles.
const COVER_MARKS = [
  { len: 0.19, wid: 0.05, rowGap: 0.3, colGap: 0.62, pick: 2, against: 2, gate: null, clip: [0.1, 0.24], opacity: 0.94 },
  { len: 0.085, wid: 0.024, rowGap: 0.5, colGap: 0.5, pick: 1, against: 3, gate: [0.012, 0.05], clip: [0.1, 0.24], opacity: 0.95 },
  { len: 0.036, wid: 0.011, rowGap: 0.42, colGap: 0.42, pick: 0, against: 2, gate: [0.025, 0.09], clip: [0.16, 0.36], opacity: 0.95 },
];

// Presses brush marks straight into the pixels: every mark has its own colour, which stamps on a canvas
// could not do at this rate, and it works in the worker too. S is the level's strength (COVER_LEVELS).
function paintStrokes(g, size, source, seed, S) {
  const levels = colourLevels(source), shapes = brushShapes();
  const image = g.getImageData(0, 0, size, size), d = image.data;
  const r = rng(seed + 1);   // its own stream, and every number drawn before a mark can be skipped: same marks at any size
  const scale = Math.min(1, 0.5 + S * 0.29), strength = Math.min(1, 0.45 + S * 0.32);
  const here = levels[1], hereS = here.S, hd = here.d;
  const pig = [0, 0, 0], other = [0, 0, 0];
  const cosL = Math.cos(LEAN), sinL = Math.sin(LEAN);
  for (const m of COVER_MARKS) {
    const [clipFrom, clipTo] = m.clip;
    const len = m.len * scale, wid = m.wid * scale, rowH = len * m.rowGap, colW = len * m.colGap, reach = Math.SQRT1_2 + len;
    let row = 0;
    for (let b = -reach; b < reach; b += rowH, row++) {
      // rows laid along the lean, each starting somewhere of its own (as coat() in brushpaint.js)
      for (let a = -reach + ((row * 0.618) % 1) * colW; a < reach; a += colW) {
        const aw = a + (r() - 0.5) * colW * 0.8, bw = b + (r() - 0.5) * rowH * 0.5;
        const angle = LEAN + (r() - 0.5) * 0.14, f = 0.85 + r() * 0.3, shape = shapes[Math.floor(r() * VARIANTS)];
        const flip = r() < 0.5, tone = 0.96 + 0.08 * r(), hue = r();
        const u0 = 0.5 + aw * cosL - bw * sinL, v0 = 0.5 + aw * sinL + bw * cosL;
        if (u0 < -len || u0 > 1 + len || v0 < -len || v0 > 1 + len) continue;
        colourAt(levels[m.pick], u0, v0, pig);
        let fade = strength * m.opacity;
        if (m.gate) {
          colourAt(levels[m.against], u0, v0, other);
          fade *= smooth(m.gate[0], m.gate[1], Math.hypot(pig[0] - other[0], pig[1] - other[1], pig[2] - other[2]));
          if (fade < 0.02) continue;
        }
        // a little richer and lighter than the picture, as the shop's coat, and each load of the brush
        // leans warm or cool
        const grey = pig[0] * 0.299 + pig[1] * 0.587 + pig[2] * 0.114;
        const R = 255 * tone * (1.04 - 0.08 * hue) * Math.max(0, grey + (pig[0] - grey) * 1.2) ** 0.92;
        const G = 255 * tone * Math.max(0, grey + (pig[1] - grey) * 1.2) ** 0.92;
        const B = 255 * tone * (0.95 + 0.1 * hue) * Math.max(0, grey + (pig[2] - grey) * 1.2) ** 0.92;
        const wr = pig[0], wg = pig[1], wb = pig[2];

        const L = len * f * size, H = (wid * f * size) / COVERED, x = u0 * size, y = v0 * size;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const hx = (Math.abs(ca) * L + Math.abs(sa) * H) / 2, hy = (Math.abs(sa) * L + Math.abs(ca) * H) / 2;
        const x0 = Math.max(0, Math.floor(x - hx)), x1 = Math.min(size - 1, Math.ceil(x + hx));
        const y0 = Math.max(0, Math.floor(y - hy)), y1 = Math.min(size - 1, Math.ceil(y + hy));
        const { cover, density, rim } = shape;
        for (let py = y0; py <= y1; py++) {
          for (let px = x0; px <= x1; px++) {
            const dx = px + 0.5 - x, dy = py + 0.5 - y;
            const su = (dx * ca + dy * sa) / L + 0.5;
            let sv = (dy * ca - dx * sa) / H + 0.5;
            if (su < 0 || su >= 1 || sv < 0 || sv >= 1) continue;
            if (flip) sv = 0.9999 - sv;
            const si = Math.floor(sv * STAMP_H) * STAMP_W + Math.floor(su * STAMP_W);
            const c = cover[si];
            if (c <= 0) continue;
            // where the picture stops being this colour the mark stops too; the bristles shift where it looks
            const shift = (density[si] - 0.9) * 0.05;
            const hx2 = Math.max(0, Math.min(hereS - 1, Math.floor((px / size + shift) * hereS)));
            const hy2 = Math.max(0, Math.min(hereS - 1, Math.floor((py / size - shift) * hereS)));
            const hi = (hy2 * hereS + hx2) * 4;
            const fr = hd[hi] / 255 - wr, fg = hd[hi + 1] / 255 - wg, fb = hd[hi + 2] / 255 - wb;
            const far = Math.sqrt(fr * fr + fg * fg + fb * fb);   // (per pixel: Math.hypot costs too much here)
            if (far >= clipTo) continue;
            const a2 = c * fade * (1 - smooth(clipFrom, clipTo, far));
            const shade = (0.9 + 0.5 * (density[si] - 0.8)) * (1 - rim[si] * 0.16);   // bristle streaks, pigment pooled at the rim
            const di = (py * size + px) * 4;
            d[di] += (R * shade - d[di]) * a2;
            d[di + 1] += (G * shade - d[di + 1]) * a2;
            d[di + 2] += (B * shade - d[di + 2]) * a2;
          }
        }
      }
    }
  }
  g.putImageData(image, 0, 0);
}

export function paintCover(g, size, seed = 1, level = coverLevel()) {
  const S = COVER_LEVELS[level] ?? 1;
  if (!S) return; // Off: the cover as it is
  const r = rng(seed);
  const cap = (v) => Math.min(0.92, v);
  const [src, sg] = canvas(size, size);
  sg.drawImage(g.canvas, 0, 0);
  const k = size / 256; // effects are tuned at 256 px

  g.save();
  // 1. soften: fine detail melts into the wash (half blurred, so edges still read)
  const more = Math.max(0, S - 1); // how far past Medium
  g.filter = `blur(${1.1 * (1 + 0.35 * more) * k}px)`;
  g.globalAlpha = cap(0.55 * Math.min(1, S) + 0.1 * more);
  g.drawImage(src, 0, 0);

  // 2. bleed: two blurred copies nudged in different directions, so colour runs past its edges
  for (let i = 0; i < (S > 1 ? 3 : 2); i++) {
    const a = r() * Math.PI * 2;
    const d = (3 + r() * 3) * (1 + 0.6 * more) * Math.min(1, S) * k;
    g.filter = `blur(${4 * Math.min(1, S) * (1 + 0.25 * more) * k}px)`;
    g.globalAlpha = cap(0.2 * Math.min(1, S) * (1 - 0.15 * more));
    g.drawImage(src, Math.cos(a) * d, Math.sin(a) * d);
  }
  g.filter = 'none';

  // 3. uneven drying: a few soft pale blooms with a slightly darker rim where the pigment pooled
  for (let i = 0; i < 4 + Math.round(2 * more); i++) {
    const x = r() * size, y = r() * size, rad = (30 + r() * 50) * k;
    const lift = g.createRadialGradient(x, y, 0, x, y, rad);
    lift.addColorStop(0, `rgba(255,250,240,${(0.045 * (S + 0.5 * more)).toFixed(3)})`);
    lift.addColorStop(0.8, `rgba(255,250,240,${(0.02 * (S + 0.5 * more)).toFixed(3)})`);
    lift.addColorStop(1, 'rgba(255,250,240,0)');
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'screen';
    g.fillStyle = lift;
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = `rgba(120,90,70,${cap(0.09 * Math.min(1, S) * (1 + 0.3 * more)).toFixed(3)})`;
    g.lineWidth = (2 + r() * 2) * k;
    g.filter = `blur(${1.2 * k}px)`;
    g.beginPath();
    // a lumpy, open rim (cauliflower), never a clean circle: random harmonics, and only part of the way round
    const p1 = r() * 6, p2 = r() * 6, from = r() * Math.PI * 2, span = Math.PI * (0.9 + r() * 0.8);
    for (let t = 0; t <= 24; t++) {
      const ang = from + (t / 24) * span;
      const rr = rad * (0.85 + Math.sin(ang * 3 + p1) * 0.08 + Math.sin(ang * 7 + p2) * 0.04 + r() * 0.04);
      t ? g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr) : g.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    g.stroke();
    g.filter = 'none';
  }

  // 4. the colours are a transparent wash over paper: lift a touch toward the paper
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = cap(0.04 * S);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, size, size);

  // 5. brush strokes over the wash
  paintStrokes(g, size, src, seed, S);

  // 6. paper grain, pigment settling in the tooth
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = cap(0.6 * Math.min(1, S) + 0.15 * more);
  const pat = g.createPattern(grainCanvas(), 'repeat');
  g.translate(r() * 256, r() * 256);
  g.fillStyle = pat;
  g.fillRect(-256, -256, size + 512, size + 512);
  g.setTransform(1, 0, 0, 1, 0, 0);

  // 7. a thin unpainted margin with a ragged, slightly darker wet edge
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  const m = 5 * k;
  const edge = new Path2D();
  const n = 40;
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([(i / n) * size, m + r() * 2.5 * k]);
  for (let i = 0; i < n; i++) pts.push([size - m - r() * 2.5 * k, (i / n) * size]);
  for (let i = n; i > 0; i--) pts.push([(i / n) * size, size - m - r() * 2.5 * k]);
  for (let i = n; i > 0; i--) pts.push([m + r() * 2.5 * k, (i / n) * size]);
  pts.forEach(([x, y], i) => (i ? edge.lineTo(x, y) : edge.moveTo(x, y)));
  edge.closePath();
  g.globalCompositeOperation = 'multiply';
  g.strokeStyle = 'rgba(110,80,60,.25)';
  g.lineWidth = 2 * k;
  g.filter = `blur(${0.8 * k}px)`;
  g.stroke(edge);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  const outside = new Path2D();
  outside.rect(0, 0, size, size);
  outside.addPath(edge);
  g.fillStyle = PAPER;
  g.fill(outside, 'evenodd');
  g.restore();
}

// same seed for the same picture, so a cover always dries the same way
export function coverSeed(url = '') {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000 + 1;
}

const urls = new Map();
// Resolves '' for a url that may not be loaded (see arturl.js).
export function paintedCoverURL(url, size = 96) {
  if (!safeArtUrl(url)) return Promise.resolve('');
  const level = coverLevel();
  const key = `${size}|${level}|${url}`;
  if (!urls.has(key)) {
    urls.set(key, new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const t = setTimeout(() => { img.src = ''; res(url); }, ART_TIMEOUT_MS);
      img.onload = () => {
        clearTimeout(t);
        if (!artSizeOk(img.naturalWidth, img.naturalHeight)) { res(''); return; }
        const [c, g] = canvas(size, size);
        const s = Math.min(img.width, img.height);
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        paintCover(g, size, coverSeed(url), level);
        try { res(c.toDataURL('image/jpeg', 0.9)); } catch { res(url); } // tainted: show it unpainted
      };
      img.onerror = () => { clearTimeout(t); res(url); };
      img.src = url;
    }));
    if (urls.size > 200) urls.delete(urls.keys().next().value);
  }
  return urls.get(key);
}
