// Hand-torn, oil-dabbed paper surfaces for Sienna's 2D UI layer.
// One cream paper finish (dabCluster + TONES.paper under a torn() edge, with token drop-shadow
// following the tear) replaces the three separate recipes from Phase 1.
import { rng } from '../rand.js';
import { dabClusterCanvas, canvasWeavePattern, TONES } from '../brushpaint.js';
import { COLORS, injectTokens } from './tokens.js';

// A hand-torn outline as numbers, for checks (scripts/tear-check.mjs) and torn().
// Each edge tears its own way: uneven spacing, a slow wander, calm stretches and rough ones,
// the odd bite, and a chipped corner or two. Nothing ever goes deeper than `cap` px into the paper,
// so keep `cap` below the card's smallest padding and the tear can never reach the text.
export function tornDepths(seed, amp = 5, cap = amp * 2) {
  const r = rng(seed);
  const edge = (n) => {
    // uneven spacing: steps between 40% and 160% of the even step, rescaled to end at exactly 1
    const steps = Array.from({ length: n }, () => 0.4 + r() * 1.2);
    const sum = steps.reduce((a, b) => a + b, 0);
    const f1 = 1 + r() * 1.5, f2 = 3 + r() * 4, p1 = r() * 6.3, p2 = r() * 6.3;
    const lean = r() * 0.5; // how far this edge sits in overall
    const pts = [];
    let t = 0;
    for (let i = 0; i <= n; i++) {
      // slow wander (0..1) and a roughness that also wanders, so some stretches are calm and some ragged
      const wander = 0.5 + 0.3 * Math.sin(t * f1 * 6.28 + p1) + 0.2 * Math.sin(t * f2 * 6.28 + p2);
      const rough = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * f2 * 3.1 + p1 * 1.7));
      let d = amp * (lean + 0.55 * wander) + (r() - 0.5) * amp * 1.3 * rough;
      if (r() < 0.1) d += amp * (0.7 + r() * 0.8); // a bite
      pts.push([t, Math.max(0, Math.min(cap, d))]);
      if (i < n) t += steps[i] / sum;
    }
    pts[n][0] = 1;
    return pts;
  };
  const count = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  // corner chips (px along each side from the corner); about half the corners get one
  const chips = [0, 1, 2, 3].map(() => (r() < 0.5 ? cap * (0.4 + r() * 0.6) : 0));
  return { top: edge(count(14, 22)), right: edge(count(5, 9)), bottom: edge(count(14, 22)), left: edge(count(5, 9)), chips, cap };
}

export function torn(seed, amp = 5, cap = amp * 2) {
  const { top, right, bottom, left, chips: [tl, tr, br, bl] } = tornDepths(seed, amp, cap);
  const f = (v) => v.toFixed(1);
  // a point t of the way along an edge of length 100%, moved in by `a` px from its start and `b` px from its end
  const along = (t, a, b) => `calc(${f(t * 100)}% + ${f(a * (1 - t) - b * t)}px)`;
  const pts = [];
  for (const [t, d] of top) pts.push(`${along(t, tl, tr)} ${f(d)}px`);
  for (const [t, d] of right) pts.push(`calc(100% - ${f(d)}px) ${along(t, tr, br)}`);
  for (const [t, d] of bottom) pts.push(`${along(1 - t, bl, br)} calc(100% - ${f(d)}px)`);
  for (const [t, d] of left) pts.push(`${f(d)}px ${along(1 - t, tl, bl)}`);
  return `polygon(${pts.join(',')})`;
}

// ---- Shared oil-dabbed cream paper cache ----
export const PAPER_STEP = 8;
const MAX_CACHE = 48;
const paperCache = new Map();
const stats = { paints: 0, hits: 0 };

export function paperStats() {
  return { paints: stats.paints, hits: stats.hits, size: paperCache.size };
}

export const quantizePaperSize = (v) => Math.max(PAPER_STEP, Math.ceil(v / PAPER_STEP) * PAPER_STEP);

const PAPER_CSS = `
:where(.ui-paper) { position: relative; color: var(--sienna-ink); }
.ui-paper-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none;
  filter: drop-shadow(var(--ui-paper-shadow, var(--sienna-shadow-rest)));
  transition: filter var(--sienna-dur-fast) var(--sienna-ease-out); }
.ui-paper--lift > .ui-paper-layer { --ui-paper-shadow: var(--sienna-shadow-lift); }
.ui-paper--rest > .ui-paper-layer { --ui-paper-shadow: var(--sienna-shadow-rest); }
.ui-paper-bg { position: absolute; inset: 0; background-color: var(--sienna-paper);
  background-size: 100% 100%; background-repeat: no-repeat; }
:where(.ui-paper > :not(.ui-paper-layer)) { position: relative; z-index: 1; }
`;

function injectPaperCss() {
  injectTokens();
  if (typeof document === 'undefined' || !document.head || document.getElementById('sienna-ui-paper')) return;
  const st = document.createElement('style');
  st.id = 'sienna-ui-paper';
  st.textContent = PAPER_CSS;
  document.head.appendChild(st);
}

// Paint one oil-dabbed cream sheet at (rw, rh) with linen tooth, fully opaque inside the rect
// so the torn() clip-path defines the outer edge cleanly with no corner pinholes.
function renderPaperDataUrl(rw, rh, seed) {
  const maxDim = Math.max(rw, rh, 1);
  const scale = Math.max(0.8, Math.min(1.6, 560 / maxDim));
  const cw = Math.max(8, Math.ceil(rw * scale));
  const ch = Math.max(8, Math.ceil(rh * scale));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');

  // Warm cream base ensures uniform >=4.5:1 text contrast everywhere inside the torn boundary.
  g.fillStyle = COLORS.paper;
  g.fillRect(0, 0, cw, ch);

  // Oversize the dab cluster slightly so brush strokes bleed past all four edges before clipping.
  // Soft impasto + generous overlap blended gently over the cream base gives tactile oil tooth
  // without harsh horizontal row bands behind small body copy on large sheets.
  const padX = Math.max(20, Math.round(rw * 0.1));
  const padY = Math.max(16, Math.round(rh * 0.14));
  const dw = rw + padX * 2;
  const dh = rh + padY * 2;
  const rows = Math.max(2, Math.min(7, Math.round(dh / 42)));
  const dabs = dabClusterCanvas(dw, dh, {
    tones: TONES.paper,
    seed,
    rows,
    tilt: 0.14,
    overlap: 0.68,
    minCols: 3,
    impasto: 0.12,
    soft: true,
    scale,
  });
  g.save();
  g.globalAlpha = 0.55;
  g.drawImage(dabs, -padX * scale, -padY * scale, dw * scale, dh * scale);
  g.restore();

  // Subtle rag-paper linen weave matching the 3D oil canvas tooth.
  const weave = canvasWeavePattern(g);
  if (weave) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.22;
    g.fillStyle = weave;
    g.fillRect(0, 0, cw, ch);
    g.restore();
  }

  // Opaque image (clip-path supplies alpha), so WebP keeps cache compact and fast.
  const webp = c.toDataURL('image/webp', 0.93);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
}

export function getPaperUrl(w, h, seed = 1) {
  const rw = quantizePaperSize(w);
  const rh = quantizePaperSize(h);
  const key = `${rw}x${rh}-${seed}`;
  const cached = paperCache.get(key);
  if (cached) {
    // LRU touch
    paperCache.delete(key);
    paperCache.set(key, cached);
    stats.hits++;
    return cached;
  }
  const url = renderPaperDataUrl(rw, rh, seed);
  if (paperCache.size >= MAX_CACHE) {
    const oldest = paperCache.keys().next().value;
    paperCache.delete(oldest);
  }
  paperCache.set(key, url);
  stats.paints++;
  return url;
}

// Attach one oil-dabbed cream paper surface under a torn edge to `el`.
// Drop shadow sits on the wrapper layer so it follows the torn() polygon without flattening
// 3D children (e.g. sheet unfold flaps) on `el`.
export function paperSurface(el, { seed = 1, elevation = 'rest', amp = 5, cap = amp * 2, crop = false } = {}) {
  injectPaperCss();
  el.classList.add('ui-paper', elevation === 'lift' ? 'ui-paper--lift' : 'ui-paper--rest');

  const layer = document.createElement('div');
  layer.className = 'ui-paper-layer';
  layer.setAttribute('aria-hidden', 'true');
  const bg = document.createElement('div');
  bg.className = 'ui-paper-bg';
  bg.style.clipPath = torn(seed, amp, cap);
  layer.appendChild(bg);
  el.prepend(layer);

  let lastW = 0;
  let lastH = 0;
  let lastKey = '';
  let rafId = 0;
  let destroyed = false;

  // crop: paint once at the sheet's largest reach (its max-height) so an animated height
  // never repaints; the bg is then cropped from the top instead of stretched.
  const paintSize = () => {
    const w = el.offsetWidth;
    let h = el.offsetHeight;
    if (crop) {
      const maxH = parseFloat(getComputedStyle(el).maxHeight);
      if (Number.isFinite(maxH)) h = Math.max(h, maxH);
    }
    return [w, h];
  };

  const paintNow = (force = false) => {
    if (destroyed) return;
    const [w, h] = paintSize();
    if (!w || !h) return;
    // Hysteresis: ignore sub-step resizes (< 8 px in both axes) so small nudges paint nothing.
    if (!force && lastW > 0 && Math.abs(w - lastW) < PAPER_STEP && Math.abs(h - lastH) < PAPER_STEP) {
      return;
    }
    const rw = quantizePaperSize(w);
    const rh = quantizePaperSize(h);
    const key = `${rw}x${rh}-${seed}`;
    if (!force && key === lastKey) {
      lastW = w;
      lastH = h;
      return;
    }
    lastW = w;
    lastH = h;
    lastKey = key;
    bg.style.backgroundImage = `url(${getPaperUrl(w, h, seed)})`;
    if (crop) {
      bg.style.backgroundSize = `100% ${rh}px`;
      bg.style.backgroundPosition = 'top';
    }
  };

  const schedulePaint = () => {
    if (destroyed || rafId) return;
    const [w, h] = paintSize();
    if (!w || !h) return;
    if (lastW > 0 && Math.abs(w - lastW) < PAPER_STEP && Math.abs(h - lastH) < PAPER_STEP) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      paintNow(false);
    });
  };

  // Paint immediately if already laid out; ResizeObserver handles late mounts and resizes.
  paintNow(false);

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => schedulePaint());
    ro.observe(el);
  }

  return {
    el,
    layer,
    bg,
    repaint(force = false) {
      paintNow(force);
    },
    setElevation(next) {
      el.classList.toggle('ui-paper--lift', next === 'lift');
      el.classList.toggle('ui-paper--rest', next !== 'lift');
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      ro?.disconnect();
      ro = null;
      layer.remove();
      el.classList.remove('ui-paper', 'ui-paper--rest', 'ui-paper--lift');
    },
  };
}
