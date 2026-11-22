// Hand-torn, oil-dabbed paper, ported from the app (app/src/ui/paper.js): one cream paper finish
// (a soft coat of cream dabs with linen tooth) under a torn outline, with the shadow following the tear.
import { rng } from '../paint/rand.js';
import { dabClusterCanvas, canvasWeavePattern, makeCanvas, TONES } from '../paint/brushpaint.js';
import { COLORS } from '../paint/tokens.js';

// A torn outline as numbers: each edge tears its own way, never deeper than `cap` px into the paper.
export function tornDepths(seed, amp = 5, cap = amp * 2) {
  const r = rng(seed);
  const edge = (n) => {
    const steps = Array.from({ length: n }, () => 0.4 + r() * 1.2);
    const sum = steps.reduce((a, b) => a + b, 0);
    const f1 = 1 + r() * 1.5, f2 = 3 + r() * 4, p1 = r() * 6.3, p2 = r() * 6.3;
    const lean = r() * 0.5;
    const pts = [];
    let t = 0;
    for (let i = 0; i <= n; i++) {
      const wander = 0.5 + 0.3 * Math.sin(t * f1 * 6.28 + p1) + 0.2 * Math.sin(t * f2 * 6.28 + p2);
      const rough = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * f2 * 3.1 + p1 * 1.7));
      let d = amp * (lean + 0.55 * wander) + (r() - 0.5) * amp * 1.3 * rough;
      if (r() < 0.1) d += amp * (0.7 + r() * 0.8);
      pts.push([t, Math.max(0, Math.min(cap, d))]);
      if (i < n) t += steps[i] / sum;
    }
    pts[n][0] = 1;
    return pts;
  };
  const count = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const chips = [0, 1, 2, 3].map(() => (r() < 0.5 ? cap * (0.4 + r() * 0.6) : 0));
  return { top: edge(count(14, 22)), right: edge(count(5, 9)), bottom: edge(count(14, 22)), left: edge(count(5, 9)), chips, cap };
}

// The outline as a CSS clip-path.
export function torn(seed, amp = 5, cap = amp * 2) {
  const { top, right, bottom, left, chips: [tl, tr, br, bl] } = tornDepths(seed, amp, cap);
  const f = (v) => v.toFixed(1);
  const along = (t, a, b) => `calc(${f(t * 100)}% + ${f(a * (1 - t) - b * t)}px)`;
  const pts = [];
  for (const [t, d] of top) pts.push(`${along(t, tl, tr)} ${f(d)}px`);
  for (const [t, d] of right) pts.push(`calc(100% - ${f(d)}px) ${along(t, tr, br)}`);
  for (const [t, d] of bottom) pts.push(`${along(1 - t, bl, br)} calc(100% - ${f(d)}px)`);
  for (const [t, d] of left) pts.push(`${f(d)}px ${along(1 - t, tl, bl)}`);
  return `polygon(${pts.join(',')})`;
}

// Only a torn top and bottom edge (the painted letterbox of the shop's intro).
export function tornBand(seed, amp = 10, edges = 'bottom') {
  const { top, bottom } = tornDepths(seed, amp, amp * 2);
  const f = (v) => v.toFixed(1);
  const pts = [];
  if (edges === 'top') {
    for (const [t, d] of top) pts.push(`${f(t * 100)}% ${f(d)}px`);
    pts.push('100% 100%', '0% 100%');
  } else {
    pts.push('0% 0%', '100% 0%');
    for (const [t, d] of bottom) pts.push(`${f((1 - t) * 100)}% calc(100% - ${f(d)}px)`);
  }
  return `polygon(${pts.join(',')})`;
}

const STEP = 8;
const cache = new Map();
const quant = (v) => Math.max(STEP, Math.ceil(v / STEP) * STEP);

function renderPaper(rw, rh, seed, tones) {
  const scale = Math.max(0.8, Math.min(1.6, 560 / Math.max(rw, rh, 1)));
  const [c, g] = makeCanvas(Math.max(8, Math.ceil(rw * scale)), Math.max(8, Math.ceil(rh * scale)));
  g.fillStyle = tones[0];
  g.fillRect(0, 0, c.width, c.height);
  const padX = Math.max(20, Math.round(rw * 0.1)), padY = Math.max(16, Math.round(rh * 0.14));
  const dw = rw + padX * 2, dh = rh + padY * 2;
  const dabs = dabClusterCanvas(dw, dh, {
    tones, seed, rows: Math.max(2, Math.min(7, Math.round(dh / 42))), tilt: 0.14, overlap: 0.68, minCols: 3, impasto: 0.12, soft: true, scale,
  });
  g.save();
  g.globalAlpha = 0.55;
  g.drawImage(dabs, -padX * scale, -padY * scale, dw * scale, dh * scale);
  g.restore();
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.22;
  g.fillStyle = canvasWeavePattern(g);
  g.fillRect(0, 0, c.width, c.height);
  g.restore();
  const webp = c.toDataURL('image/webp', 0.92);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
}

export function paperUrl(w, h, seed = 1, tones = TONES.paper) {
  const rw = quant(w), rh = quant(h);
  const key = `${rw}x${rh}-${seed}-${tones[0]}`;
  let url = cache.get(key);
  if (!url) {
    url = renderPaper(rw, rh, seed, tones);
    if (cache.size > 64) cache.delete(cache.keys().next().value);
    cache.set(key, url);
  }
  return url;
}

// Puts one torn, dabbed paper surface under `el` (CSS: .paper, .paper-layer, .paper-bg in style.css).
export function paperSurface(el, { seed = 1, amp = 5, cap = amp * 2, tones = TONES.paper } = {}) {
  el.classList.add('paper');
  const layer = document.createElement('span');
  layer.className = 'paper-layer';
  layer.setAttribute('aria-hidden', 'true');
  const bg = document.createElement('span');
  bg.className = 'paper-bg';
  bg.style.clipPath = torn(seed, amp, cap);
  bg.style.backgroundColor = tones[0];
  layer.append(bg);
  el.prepend(layer);
  let last = '';
  const paint = () => {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    const key = `${quant(w)}x${quant(h)}`;
    if (key === last) return;
    last = key;
    bg.style.backgroundImage = `url(${paperUrl(w, h, seed, tones)})`;
  };
  paint();
  new ResizeObserver(() => requestAnimationFrame(paint)).observe(el);
  return { repaint: () => { last = ''; paint(); } };
}

export { COLORS };
