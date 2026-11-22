// Covers painted in oil, ported from the app (app/src/coverpaint.js) at its default strength (Heavy):
// an under-coat of small dabs over every pixel, then three layers of opaque impasto dabs (coat, medium,
// fine) that stop where the picture changes colour, and a linen weave. Runs in the cover worker
// (OffscreenCanvas) or, without one, on the main thread.
import { rng } from './rand.js';
import { oilDabShapes, COVERED, LEAN, STAMP_W, STAMP_H, VARIANTS, makeCanvas } from './brushpaint.js';

const STRENGTH = 1.65;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the picture at 256 ... 16 px, so every size of a cover gets the same dabs
function colourLevels(source) {
  const levels = [];
  let from = source;
  for (let S = 256; S >= 16; S /= 2) {
    const [c, g] = makeCanvas(S, S);
    g.imageSmoothingQuality = 'high';
    g.drawImage(from, 0, 0, S, S);
    levels.push({ S, d: g.getImageData(0, 0, S, S).data });
    from = c;
  }
  return levels;
}

function colourAt({ S, d }, u, v, out) {
  const x = Math.max(0, Math.min(S - 1.001, u * S - 0.5)), y = Math.max(0, Math.min(S - 1.001, v * S - 0.5));
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, i = (iy * S + ix) * 4;
  for (let k = 0; k < 3; k++) {
    const top = d[i + k] + (d[i + 4 + k] - d[i + k]) * fx;
    const low = d[i + S * 4 + k] + (d[i + S * 4 + 4 + k] - d[i + S * 4 + k]) * fx;
    out[k] = (top + (low - top) * fy) / 255;
  }
  return out;
}

function paintUnderCoat(d, size, src, shapes, S, seed) {
  const r = rng(seed);
  const impasto = 0.65 + 0.35 * Math.min(1.6, S);
  const cellPx = Math.max(3, Math.round(size * (0.016 + 0.012 * Math.min(1.5, S))));
  const inv = 1 / cellPx;
  const cols = Math.ceil(size / cellPx) + 1;
  const cR = new Float32Array(cols * cols), cG = new Float32Array(cols * cols), cB = new Float32Array(cols * cols);
  const cV = new Uint8Array(cols * cols), cT = new Float32Array(cols * cols);
  for (let cy = 0; cy < cols; cy++) {
    const py = Math.min(size - 1, Math.floor((cy + 0.5) * cellPx));
    for (let cx = 0; cx < cols; cx++) {
      const px = Math.min(size - 1, Math.floor((cx + 0.5) * cellPx));
      const si = (py * size + px) * 4, idx = cy * cols + cx;
      cR[idx] = src[si] / 255; cG[idx] = src[si + 1] / 255; cB[idx] = src[si + 2] / 255;
      cV[idx] = Math.floor(r() * VARIANTS);
      cT[idx] = 0.95 + 0.1 * r();
    }
  }
  const ca = Math.cos(LEAN), sa = Math.sin(LEAN);
  for (let py = 0; py < size; py++) {
    const cy = Math.floor(py * inv), fy = py * inv - cy;
    for (let px = 0; px < size; px++) {
      const cx = Math.floor(px * inv), fx = px * inv - cx;
      const idx = cy * cols + cx, di = (py * size + px) * 4;
      const pr = src[di] / 255, pg = src[di + 1] / 255, pb = src[di + 2] / 255;
      const dist = Math.hypot(cR[idx] - pr, cG[idx] - pg, cB[idx] - pb);
      const blend = 1 - smooth(0.1, 0.24, dist);
      const cr = pr + (cR[idx] - pr) * blend, cg = pg + (cG[idx] - pg) * blend, cb = pb + (cB[idx] - pb) * blend;
      const sh = shapes[cV[idx]];
      const lx = fx - 0.5, ly = fy - 0.5;
      const su = Math.max(0, Math.min(0.999, lx * ca + ly * sa + 0.5));
      const sv = Math.max(0, Math.min(0.999, -lx * sa + ly * ca + 0.5));
      const si = Math.floor(sv * STAMP_H) * STAMP_W + Math.floor(su * STAMP_W);
      const gx = ca * sh.slopeU[si] - sa * sh.slopeV[si];
      const gy = sa * sh.slopeU[si] + ca * sh.slopeV[si];
      const rake = 0.5 * gx - 0.7 * gy;
      const shade = cT[idx] * (1 + rake * 1.4 * impasto);
      const spec = rake > 0 ? rake * rake * 0.7 * impasto : 0;
      d[di] = Math.max(0, Math.min(255, cr * 255 * shade + spec * 255));
      d[di + 1] = Math.max(0, Math.min(255, cg * 255 * shade + spec * 247));
      d[di + 2] = Math.max(0, Math.min(255, cb * 255 * shade + spec * 230));
    }
  }
}

const COVER_DABS = [
  { len: 0.165, wid: 0.068, rowGap: 0.34, colGap: 0.58, pick: 2, against: 2, gate: null, clip: [0.11, 0.23], opacity: 0.96, impasto: 1.15 },
  { len: 0.082, wid: 0.034, rowGap: 0.44, colGap: 0.52, pick: 1, against: 3, gate: [0.016, 0.06], clip: [0.11, 0.23], opacity: 0.97, impasto: 1.25 },
  { len: 0.038, wid: 0.016, rowGap: 0.42, colGap: 0.44, pick: 0, against: 2, gate: [0.028, 0.095], clip: [0.15, 0.32], opacity: 0.98, impasto: 1.3 },
];

// Repaints the square canvas behind `g` in place.
export function paintCover(g, size, seed = 1) {
  const S = STRENGTH;
  const [srcC, sg] = makeCanvas(size, size);
  sg.drawImage(g.canvas, 0, 0);
  const levels = colourLevels(srcC), shapes = oilDabShapes();
  const srcD = g.getImageData(0, 0, size, size).data;
  const outImg = g.createImageData(size, size);
  const d = outImg.data;
  d.set(srcD);
  paintUnderCoat(d, size, srcD, shapes, S, seed + 17);

  const r = rng(seed + 1);
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
        const grey = pig[0] * 0.299 + pig[1] * 0.587 + pig[2] * 0.114;
        const R1 = 255 * tone * (1.05 - 0.11 * hue) * Math.max(0, grey + (pig[0] - grey) * 1.18) ** 0.94;
        const G1 = 255 * tone * Math.max(0, grey + (pig[1] - grey) * 1.18) ** 0.94;
        const B1 = 255 * tone * (0.93 + 0.14 * hue) * Math.max(0, grey + (pig[2] - grey) * 1.18) ** 0.94;
        const R2 = streakHi ? R1 * 1.16 + 3 : R1 * 0.8;
        const G2 = streakHi ? G1 * 1.1 + 3 : G1 * 0.84;
        const B2 = streakHi ? B1 * 1.0 + 2 : B1 * 0.92;
        const L = len * f * size, Hh = (wid * f * size) / COVERED, x = u0 * size, y = v0 * size;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const hx = (Math.abs(ca) * L + Math.abs(sa) * Hh) / 2, hy = (Math.abs(sa) * L + Math.abs(ca) * Hh) / 2;
        const x0 = Math.max(0, Math.floor(x - hx)), x1 = Math.min(size - 1, Math.ceil(x + hx));
        const y0 = Math.max(0, Math.floor(y - hy)), y1 = Math.min(size - 1, Math.ceil(y + hy));
        const { alpha, slopeU, slopeV, streak } = shape;
        for (let py = y0; py <= y1; py++) {
          for (let px = x0; px <= x1; px++) {
            const dx = px + 0.5 - x, dy = py + 0.5 - y;
            const su = (dx * ca + dy * sa) / L + 0.5;
            let sv = (dy * ca - dx * sa) / Hh + 0.5;
            if (su < 0 || su >= 1 || sv < 0 || sv >= 1) continue;
            if (flip) sv = 0.9999 - sv;
            const si = Math.floor(sv * STAMP_H) * STAMP_W + Math.floor(su * STAMP_W);
            const c = alpha[si];
            if (c <= 0.004) continue;
            const hx2 = Math.max(0, Math.min(hereS - 1, Math.floor((px / size) * hereS)));
            const hy2 = Math.max(0, Math.min(hereS - 1, Math.floor((py / size) * hereS)));
            const hi = (hy2 * hereS + hx2) * 4;
            const far = Math.hypot(hd[hi] / 255 - pig[0], hd[hi + 1] / 255 - pig[1], hd[hi + 2] / 255 - pig[2]);
            if (far >= clipTo) continue;
            const a2 = c * fade * (1 - smooth(clipFrom, clipTo, far));
            const sm = smooth(0.52, 0.78, streak[si]);
            const R = R1 + (R2 - R1) * sm, G = G1 + (G2 - G1) * sm, B = B1 + (B2 - B1) * sm;
            const sU = slopeU[si], sV = flip ? -slopeV[si] : slopeV[si];
            const gx = ca * sU - sa * sV;
            const gy = sa * sU + ca * sV;
            const rake = 0.5 * gx - 0.7 * gy;
            const shade = 1 + rake * 2.3 * imp;
            const lum = (0.3 * R + 0.5 * G + 0.2 * B) / 255;
            const spec = rake > 0 ? rake * rake * 1.45 * imp * (0.3 + lum) * 255 : 0;
            const di = (py * size + px) * 4;
            d[di] += (Math.max(0, Math.min(255, R * shade + spec)) - d[di]) * a2;
            d[di + 1] += (Math.max(0, Math.min(255, G * shade + spec * 0.97)) - d[di + 1]) * a2;
            d[di + 2] += (Math.max(0, Math.min(255, B * shade + spec * 0.9)) - d[di + 2]) * a2;
          }
        }
      }
    }
  }
  const weaveStep = Math.max(1.1, 1.9 * (256 / size));
  const weaveAmt = 0.025 + 0.015 * Math.min(1.5, S);
  for (let py = 0; py < size; py++) {
    const sy = Math.sin(py * weaveStep + 1.3);
    for (let px = 0; px < size; px++) {
      const m = 1 - weaveAmt * (1 - (Math.sin(px * weaveStep) * sy * 0.5 + 0.5));
      const di = (py * size + px) * 4;
      d[di] *= m; d[di + 1] *= m; d[di + 2] *= m;
    }
  }
  g.putImageData(outImg, 0, 0);
}
