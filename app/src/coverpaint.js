// Covers painted in oil to match the 3D shop: every album / playlist cover is repainted once, when
// it loads, in thick opaque dabs of oil paint with impasto ridges lit from the upper left, a second
// colour streaked along the bristles, an oil under-coat, and subtle linen canvas weave — full bleed,
// no paper margin. How strongly is Settings > Look > Cover art (settings key 'covers', COVER_LEVELS):
// Off, Light, Medium, Heavy (the default: you still know the cover at a glance, faces, titles, big
// shapes, while it reads unmistakably as impasto oil paint).
//
//   paintCover(ctx, size, seed, level)  repaints the square canvas in place (call after drawing the cover)
//   paintedCoverURL(url, size)          -> Promise<data: URL> of the painted cover (for <img> in the search slips)
// The racks' and the suitcase's covers are painted off the main thread in coverpaint.worker.js (coverworker.js).
import { rng } from './rand.js';
import { settings } from './settings.js';
import { safeArtUrl, artSizeOk, ART_TIMEOUT_MS } from './arturl.js';
import { oilDabShapes, COVERED, LEAN, STAMP_W, STAMP_H, VARIANTS } from './brushpaint.js';

// strength multipliers per level (2 = Medium, 3 = Heavy default)
export const COVER_LEVELS = [0, 0.55, 1, 1.65];
export const coverLevel = () => { const v = settings.get('covers'); return v >= 0 && v < COVER_LEVELS.length ? v : 3; };

// also runs in coverpaint.worker.js, where there is no document: OffscreenCanvas there
function canvas(w, h, options) {
  if (typeof document === 'undefined') { const c = new OffscreenCanvas(w, h); return [c, c.getContext('2d', options)]; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', options)];
}

// Light only scales the paint, so a near-black cover's ridges came out near-black too and the cover read as
// unpainted: the ridges' light and shadow also lift off a floor that grows as the paint darkens.
const DARK_LIFT = 75;
export const darkLift = (r, g, b) => { const k = 1 - (0.3 * r + 0.5 * g + 0.2 * b) / 255; return DARK_LIFT * k * k; };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The picture at 256, 128, 64, 32 and 16 px, whatever size is being painted, so a cover's small version and
// its big one (swapped in on hover) get the very same dabs.
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

// Oil under-coat: small canvas-aligned dabs filling every pixel so no raw photo remains,
// while borrowing cell colour only when the pixel agrees (keeping eyes & album titles legible).
function paintUnderCoat(d, size, sourceData, shapes, S, seed) {
  const r = rng(seed);
  const impasto = 0.65 + 0.35 * Math.min(1.6, S);
  const cellPx = Math.max(3, Math.round(size * (0.016 + 0.012 * Math.min(1.5, S))));
  const invCell = 1 / cellPx;
  const cols = Math.ceil(size / cellPx) + 1;
  const cellR = new Float32Array(cols * cols);
  const cellG = new Float32Array(cols * cols);
  const cellB = new Float32Array(cols * cols);
  const cellV = new Uint8Array(cols * cols);
  const cellTone = new Float32Array(cols * cols);
  for (let cy = 0; cy < cols; cy++) {
    const py = Math.min(size - 1, Math.floor((cy + 0.5) * cellPx));
    for (let cx = 0; cx < cols; cx++) {
      const px = Math.min(size - 1, Math.floor((cx + 0.5) * cellPx));
      const si = (py * size + px) * 4;
      const idx = cy * cols + cx;
      cellR[idx] = sourceData[si] / 255;
      cellG[idx] = sourceData[si + 1] / 255;
      cellB[idx] = sourceData[si + 2] / 255;
      cellV[idx] = Math.floor(r() * VARIANTS);
      cellTone[idx] = 0.95 + 0.1 * r();
    }
  }
  const ca = Math.cos(LEAN), sa = Math.sin(LEAN);
  const agreeFrom = 0.1, agreeTo = 0.24;
  for (let py = 0; py < size; py++) {
    const cy = Math.floor(py * invCell);
    const fy = py * invCell - cy;
    for (let px = 0; px < size; px++) {
      const cx = Math.floor(px * invCell);
      const fx = px * invCell - cx;
      const idx = cy * cols + cx;
      const di = (py * size + px) * 4;
      const pr = sourceData[di] / 255, pg = sourceData[di + 1] / 255, pb = sourceData[di + 2] / 255;
      const dr = cellR[idx] - pr, dg = cellG[idx] - pg, db = cellB[idx] - pb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      const blend = 1 - smooth(agreeFrom, agreeTo, dist);
      const cr = pr + (cellR[idx] - pr) * blend;
      const cg = pg + (cellG[idx] - pg) * blend;
      const cb = pb + (cellB[idx] - pb) * blend;
      const sh = shapes[cellV[idx]];
      // Rotate local cell coordinates along LEAN so under-coat texture aligns with the dabs
      const lx = fx - 0.5, ly = fy - 0.5;
      const su = Math.max(0, Math.min(0.999, lx * ca + ly * sa + 0.5));
      const sv = Math.max(0, Math.min(0.999, -lx * sa + ly * ca + 0.5));
      const si = Math.floor(sv * STAMP_H) * STAMP_W + Math.floor(su * STAMP_W);
      const gx = ca * sh.slopeU[si] - sa * sh.slopeV[si];
      const gy = sa * sh.slopeU[si] + ca * sh.slopeV[si];
      const rake = 0.5 * gx - 0.7 * gy;
      const shade = cellTone[idx] * (1 + rake * 1.4 * impasto);
      const spec = rake > 0 ? rake * rake * 0.7 * impasto : 0;
      const lift = (shade - 1) * darkLift(cr * 255, cg * 255, cb * 255);
      d[di] = Math.max(0, Math.min(255, cr * 255 * shade + lift + spec * 255));
      d[di + 1] = Math.max(0, Math.min(255, cg * 255 * shade + lift + spec * 247));
      d[di + 2] = Math.max(0, Math.min(255, cb * 255 * shade + lift + spec * 230));
    }
  }
}

// Three layers of opaque impasto oil dabs (coat, medium, fine), analogous to oilpaint.js + brushstrokes.js.
// Fat & short proportions (wider relative to length), contrast-gated detail, tight surface agreement.
const COVER_DABS = [
  { len: 0.165, wid: 0.068, rowGap: 0.34, colGap: 0.58, pick: 2, against: 2, gate: null, clip: [0.11, 0.23], opacity: 0.96, impasto: 1.15 },
  { len: 0.082, wid: 0.034, rowGap: 0.44, colGap: 0.52, pick: 1, against: 3, gate: [0.016, 0.06], clip: [0.11, 0.23], opacity: 0.97, impasto: 1.25 },
  { len: 0.038, wid: 0.016, rowGap: 0.42, colGap: 0.44, pick: 0, against: 2, gate: [0.028, 0.095], clip: [0.15, 0.32], opacity: 0.98, impasto: 1.3 },
];

// Presses opaque impasto oil dabs straight into the cover's pixels (works in worker OffscreenCanvas too).
function paintDabs(g, size, source, seed, S) {
  const levels = colourLevels(source), shapes = oilDabShapes();
  const srcImg = g.getImageData(0, 0, size, size);
  const outImg = g.createImageData(size, size);
  const srcD = srcImg.data, d = outImg.data;
  outImg.data.set(srcD);

  paintUnderCoat(d, size, srcD, shapes, S, seed + 17);

  const r = rng(seed + 1);   // deterministic stream: same marks at any cover resolution
  const scale = Math.min(1.08, 0.48 + S * 0.34);
  const strength = Math.min(1, 0.58 + S * 0.28);
  const impastoScale = 0.7 + 0.45 * Math.min(1.6, S);
  const here = levels[1], hereS = here.S, hd = here.d;
  const pig = [0, 0, 0], other = [0, 0, 0];
  const cosL = Math.cos(LEAN), sinL = Math.sin(LEAN);

  for (const m of COVER_DABS) {
    const [clipFrom, clipTo] = m.clip;
    const len = m.len * scale, wid = m.wid * scale, rowH = len * m.rowGap, colW = len * m.colGap, reach = Math.SQRT1_2 + len;
    const imp = m.impasto * impastoScale;
    let row = 0;
    for (let b = -reach; b < reach; b += rowH, row++) {
      for (let a = -reach + ((row * 0.618) % 1) * colW; a < reach; a += colW) {
        const aw = a + (r() - 0.5) * colW * 0.8, bw = b + (r() - 0.5) * rowH * 0.5;
        const angle = LEAN + (r() - 0.5) * 0.22, f = 0.86 + r() * 0.28, shape = shapes[Math.floor(r() * VARIANTS)];
        const flip = r() < 0.5, tone = 0.92 + 0.16 * r(), hue = r(), streakHi = r() > 0.5;
        const u0 = 0.5 + aw * cosL - bw * sinL, v0 = 0.5 + aw * sinL + bw * cosL;
        if (u0 < -len || u0 > 1 + len || v0 < -len || v0 > 1 + len) continue;
        colourAt(levels[m.pick], u0, v0, pig);
        let fade = strength * m.opacity;
        if (m.gate) {
          colourAt(levels[m.against], u0, v0, other);
          fade *= smooth(m.gate[0], m.gate[1], Math.hypot(pig[0] - other[0], pig[1] - other[1], pig[2] - other[2]));
          if (fade < 0.02) continue;
        }
        // Loaded oil pigment: slightly richer saturation & warm/cool brush load variation
        const grey = pig[0] * 0.299 + pig[1] * 0.587 + pig[2] * 0.114;
        const R1 = 255 * tone * (1.05 - 0.11 * hue) * Math.max(0, grey + (pig[0] - grey) * 1.18) ** 0.94;
        const G1 = 255 * tone * Math.max(0, grey + (pig[1] - grey) * 1.18) ** 0.94;
        const B1 = 255 * tone * (0.93 + 0.14 * hue) * Math.max(0, grey + (pig[2] - grey) * 1.18) ** 0.94;
        // Second colour streaked into the bristles
        const R2 = streakHi ? R1 * 1.16 + 3 : R1 * 0.8;
        const G2 = streakHi ? G1 * 1.1 + 3 : G1 * 0.84;
        const B2 = streakHi ? B1 * 1.0 + 2 : B1 * 0.92;
        const wr = pig[0], wg = pig[1], wb = pig[2];

        const L = len * f * size, H = (wid * f * size) / COVERED, x = u0 * size, y = v0 * size;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const hx = (Math.abs(ca) * L + Math.abs(sa) * H) / 2, hy = (Math.abs(sa) * L + Math.abs(ca) * H) / 2;
        const x0 = Math.max(0, Math.floor(x - hx)), x1 = Math.min(size - 1, Math.ceil(x + hx));
        const y0 = Math.max(0, Math.floor(y - hy)), y1 = Math.min(size - 1, Math.ceil(y + hy));
        const { alpha, slopeU, slopeV, streak } = shape;
        for (let py = y0; py <= y1; py++) {
          for (let px = x0; px <= x1; px++) {
            const dx = px + 0.5 - x, dy = py + 0.5 - y;
            const su = (dx * ca + dy * sa) / L + 0.5;
            let sv = (dy * ca - dx * sa) / H + 0.5;
            if (su < 0 || su >= 1 || sv < 0 || sv >= 1) continue;
            if (flip) sv = 0.9999 - sv;
            const si = Math.floor(sv * STAMP_H) * STAMP_W + Math.floor(su * STAMP_W);
            const c = alpha[si];
            if (c <= 0.004) continue;
            // Surface colour agreement: dab stops cleanly where the underlying cover changes colour
            const hx2 = Math.max(0, Math.min(hereS - 1, Math.floor((px / size) * hereS)));
            const hy2 = Math.max(0, Math.min(hereS - 1, Math.floor((py / size) * hereS)));
            const hi = (hy2 * hereS + hx2) * 4;
            const fr = hd[hi] / 255 - wr, fg = hd[hi + 1] / 255 - wg, fb = hd[hi + 2] / 255 - wb;
            const far = Math.sqrt(fr * fr + fg * fg + fb * fb);
            if (far >= clipTo) continue;
            const a2 = c * fade * (1 - smooth(clipFrom, clipTo, far));
            const sm = smooth(0.52, 0.78, streak[si]);
            let R = R1 + (R2 - R1) * sm;
            let G = G1 + (G2 - G1) * sm;
            let B = B1 + (B2 - B1) * sm;
            // Impasto ridges lit from the upper left of the cover
            const sU = slopeU[si], sV = flip ? -slopeV[si] : slopeV[si];
            const gx = ca * sU - sa * sV;
            const gy = sa * sU + ca * sV;
            const rake = 0.5 * gx - 0.7 * gy;
            const shade = 1 + rake * 2.3 * imp;
            const lum = (0.3 * R + 0.5 * G + 0.2 * B) / 255;
            const spec = rake > 0 ? rake * rake * 1.45 * imp * (0.3 + lum) * 255 : 0;
            const lift = (shade - 1) * darkLift(R, G, B);
            const rOut = Math.max(0, Math.min(255, R * shade + lift + spec));
            const gOut = Math.max(0, Math.min(255, G * shade + lift + spec * 0.97));
            const bOut = Math.max(0, Math.min(255, B * shade + lift + spec * 0.9));
            const di = (py * size + px) * 4;
            d[di] += (rOut - d[di]) * a2;
            d[di + 1] += (gOut - d[di + 1]) * a2;
            d[di + 2] += (bOut - d[di + 2]) * a2;
          }
        }
      }
    }
  }

  // Subtle woven linen canvas tooth across the full-bleed oil painting (matching oilpaint.js)
  const weaveStep = Math.max(1.1, 1.9 * (256 / size));
  const weaveAmt = 0.025 + 0.015 * Math.min(1.5, S);
  for (let py = 0; py < size; py++) {
    const sy = Math.sin(py * weaveStep + 1.3);
    for (let px = 0; px < size; px++) {
      const weave = Math.sin(px * weaveStep) * sy * 0.5 + 0.5;
      const m = 1 - weaveAmt * (1 - weave);
      const di = (py * size + px) * 4;
      d[di] *= m;
      d[di + 1] *= m;
      d[di + 2] *= m;
    }
  }
  g.putImageData(outImg, 0, 0);
}

export function paintCover(g, size, seed = 1, level = coverLevel()) {
  const S = COVER_LEVELS[level] ?? 1;
  if (!S) return; // Off: the cover as it is
  const [src, sg] = canvas(size, size);
  sg.drawImage(g.canvas, 0, 0);
  paintDabs(g, size, src, seed, S);
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
