// Oil-paint brush plates behind words, ported from the app (app/src/ui/brush.js): the section menu,
// buttons, signs and stamps are thick opaque dabs of indigo (or terracotta) with the lettering left in
// paper colour, and hovering lays the terracotta plate over the indigo one.
import { dabCluster, TONES } from '../paint/brushpaint.js';
import { COLORS } from '../paint/tokens.js';

const STEP = 4;
const plates = new Map();
const quant = (v) => Math.max(STEP, Math.ceil(v / STEP) * STEP);

function tonesFor(color) {
  if (color === COLORS.indigo) return TONES.ink;
  if (color === COLORS.terracotta) return TONES.hot;
  if (color === COLORS.mustard) return TONES.mustard;
  if (color === COLORS.paper) return TONES.paper;
  if (color === COLORS.paperLo) return TONES.track;
  return [color];
}

export function brushStroke(w, h, color, seed, { flipX = false } = {}) {
  const soft = color === COLORS.paper || color === COLORS.paperLo;
  return dabCluster(w, h, {
    tones: tonesFor(color), seed, rows: h > 64 ? 2 : 1, flipX, tilt: 0.05, overlap: 0.56, minCols: 2,
    impasto: soft ? 0.28 : 0.55, even: !soft, soft, solid: true,
  });
}

export function plateUrl(w, h, color, seed, flipX = false) {
  const rw = quant(w), rh = quant(h);
  const key = `${rw}x${rh}-${color}-${seed}-${flipX ? 1 : 0}`;
  let url = plates.get(key);
  if (!url) {
    url = brushStroke(rw, rh, color, seed, { flipX });
    if (plates.size > 200) plates.delete(plates.keys().next().value);
    plates.set(key, url);
  }
  return url;
}

const COLOR = { ink: COLORS.indigo, hot: COLORS.terracotta, mustard: COLORS.mustard, paper: COLORS.paper, track: COLORS.paperLo };

// Paints a cold plate (and a hot one for hover) behind `el`. CSS: .brush, .plate in style.css.
export function brushPlate(el, { tone = 'ink', hot = 'hot', seed = 17, flipX = false } = {}) {
  el.classList.add('brush');
  const cold = document.createElement('span');
  cold.className = 'plate cold';
  cold.setAttribute('aria-hidden', 'true');
  el.prepend(cold);
  let warm = null;
  if (hot && hot !== tone) {
    warm = document.createElement('span');
    warm.className = 'plate hot';
    warm.setAttribute('aria-hidden', 'true');
    cold.after(warm);
  }
  let last = '';
  const paint = () => {
    const w = Math.ceil(el.offsetWidth), h = Math.ceil(el.offsetHeight);
    if (!w || !h) return;
    const key = `${quant(w)}x${quant(h)}`;
    if (key === last) return;
    last = key;
    cold.style.backgroundImage = `url(${plateUrl(w, h, COLOR[tone], seed, flipX)})`;
    if (warm) warm.style.backgroundImage = `url(${plateUrl(w, h, COLOR[hot], seed, flipX)})`;
  };
  paint();
  new ResizeObserver(() => requestAnimationFrame(paint)).observe(el);
  return { repaint: () => { last = ''; paint(); } };
}

// A short painted line (progress track, underline): returns a data URL sized w x h.
export function lineUrl(w, h, color, seed, { soft = false } = {}) {
  const key = `line-${quant(w)}x${quant(h)}-${color}-${seed}`;
  let url = plates.get(key);
  if (!url) {
    url = dabCluster(quant(w), quant(h), {
      tones: soft ? [color] : tonesFor(color), seed, rows: 1, tilt: 0.05, overlap: 0.56, minCols: 4, solid: true,
      impasto: soft ? 0.28 : 0.55, soft, even: !soft,
    });
    plates.set(key, url);
  }
  return url;
}
