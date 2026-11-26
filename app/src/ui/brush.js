// Oil-paint brush stroke plates and the shared brushButton() component.
// Replaces the four duplicated brush-plate buttons across menu.js, settings-panel.js,
// controls.js, and the removed deck CSS.
import { dabCluster, TONES } from '../brushpaint.js';
import { COLORS, injectTokens } from './tokens.js';
import { fontReady, onLettering } from '../style.js';
import { icon } from './icons.js';

function tonesFor(color) {
  if (color === COLORS.indigo) return TONES.ink;
  if (color === COLORS.terracotta) return TONES.hot;
  const n = parseInt(String(color).replace('#', ''), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return [
    rgb,
    [clamp(rgb[0] * 1.07 + 3), clamp(rgb[1] * 1.03 + 2), clamp(rgb[2] * 0.97)],
    [clamp(rgb[0] * 0.91), clamp(rgb[1] * 0.94), clamp(rgb[2] * 1.05 + 3)],
  ];
}

// Thick, opaque loaded oil-paint dab plate (used for menu buttons, Settings words, Sign In, and rack signs).
export function brushStroke(w, h, color, seed, { flipX = false } = {}) {
  return dabCluster(w, h, {
    tones: tonesFor(color),
    seed,
    rows: h > 64 ? 2 : 1,
    flipX,
    tilt: 0.05,
    overlap: 0.56,
    minCols: 2,
    // One even, opaque coat: varied tones, strong ridges and see-through tails made the overlaps show
    // as brighter and darker patches across a word.
    impasto: 0.55,
    even: true,
    solid: true,
  });
}

// ---- Module-level LRU plate cache ----
const PLATE_STEP = 4;
const MAX_PLATES = 160;
const plateCache = new Map();
const stats = { paints: 0, hits: 0, repaints: 0 };

export function brushStats() {
  return { paints: stats.paints, hits: stats.hits, repaints: stats.repaints, size: plateCache.size };
}

const quantizePlate = (v) => Math.max(PLATE_STEP, Math.ceil(v / PLATE_STEP) * PLATE_STEP);

export function cachedBrushPlate(w, h, color, seed, flipX = false) {
  const rw = quantizePlate(w);
  const rh = quantizePlate(h);
  const key = `${rw}x${rh}-${color}-${seed}-${flipX ? 1 : 0}`;
  const cached = plateCache.get(key);
  if (cached) {
    plateCache.delete(key);
    plateCache.set(key, cached);
    stats.hits++;
    return cached;
  }
  const url = brushStroke(rw, rh, color, seed, { flipX });
  if (plateCache.size >= MAX_PLATES) {
    const oldest = plateCache.keys().next().value;
    plateCache.delete(oldest);
  }
  plateCache.set(key, url);
  stats.paints++;
  return url;
}

const BRUSH_CSS = `
.ui-brush { position: relative; display: inline-flex; align-items: center; justify-content: center;
  border: 0; padding: 0; margin: 0; background: none; cursor: pointer; user-select: none;
  font-family: var(--sienna-font); color: var(--sienna-paper); line-height: 1; letter-spacing: .02em;
  transition: transform var(--sienna-dur-fast) var(--sienna-ease-pop), opacity var(--sienna-dur-fast); }
.ui-brush--sm { font-size: var(--sienna-text-md); }
.ui-brush--md { font-size: var(--sienna-text-lg); }
.ui-brush--lg { font-size: var(--sienna-text-xl); }
.ui-brush-plate { position: absolute; inset: 0; background-size: 100% 100%; background-repeat: no-repeat;
  pointer-events: none; filter: drop-shadow(var(--sienna-shadow-rest));
  transition: opacity var(--sienna-dur-mid) var(--sienna-ease-out), filter var(--sienna-dur-fast) var(--sienna-ease-out); }
.ui-brush-plate--hot { opacity: 0; }
.ui-brush:not(:disabled):hover .ui-brush-plate--hot,
.ui-brush:not(:disabled).is-hover .ui-brush-plate--hot,
.ui-brush.is-on .ui-brush-plate--hot,
.ui-brush[aria-pressed="true"] .ui-brush-plate--hot { opacity: 1; }
.ui-brush:not(:disabled):hover,
.ui-brush:not(:disabled).is-hover { transform: translateY(-2px) rotate(var(--sienna-tilt-md)); }
.ui-brush--flip:not(:disabled):hover,
.ui-brush--flip:not(:disabled).is-hover { transform: translateY(-2px) rotate(calc(var(--sienna-tilt-md) * -1)); }
.ui-brush:not(:disabled):hover .ui-brush-plate,
.ui-brush:not(:disabled).is-hover .ui-brush-plate { filter: drop-shadow(var(--sienna-shadow-lift)); }
.ui-brush:not(:disabled):active { transform: translateY(0) scale(.97); }
.ui-brush:focus { outline: none; }
.ui-brush:focus-visible::after,
.ui-brush.is-focus::after { content: ''; position: absolute; inset: -4px -5px; pointer-events: none;
  border-radius: 10px 14px 12px 16px / 14px 10px 16px 12px;
  box-shadow: var(--sienna-focus-ring); }
.ui-brush:disabled,
.ui-brush.is-disabled { cursor: not-allowed; opacity: var(--sienna-disabled); transform: none; }
.ui-brush-label { position: relative; z-index: 1; display: block; white-space: nowrap;
  padding: .24em 1.25em .2em .9em; text-shadow: 0 0 1px rgba(248, 241, 226, 0.7); }
.ui-brush-line { display: block; }
.ui-brush-ico { position: relative; z-index: 1; display: inline-flex; flex: none; margin-left: .75em; }
.ui-brush-ico + .ui-brush-label { padding-left: .35em; }
.ui-brush--flip .ui-brush-ico { margin-left: 1.05em; }
.ui-brush--flip .ui-brush-ico + .ui-brush-label { padding-left: .35em; padding-right: .85em; }
.ui-brush--spin .ui-brush-ico { animation: ui-brush-spin 900ms linear infinite; }
@keyframes ui-brush-spin { to { transform: rotate(360deg); } }
.ui-brush--flip .ui-brush-label { padding: .24em .9em .2em 1.25em; }
.ui-brush--lg .ui-brush-label { padding: .22em 1.3em .18em .95em; }
.ui-brush--lg.ui-brush--flip .ui-brush-label { padding: .22em .95em .18em 1.3em; }
`;

function injectBrushCss() {
  injectTokens();
  if (typeof document === 'undefined' || !document.head || document.getElementById('sienna-ui-brush')) return;
  const st = document.createElement('style');
  st.id = 'sienna-ui-brush';
  st.textContent = BRUSH_CSS;
  document.head.appendChild(st);
}

// One brush-plate button replacing .mn button, .st-w / word(), and .cad-tag button.
// Returns the real focusable <button> element with { setLabel, setPressed, setCurrent, setDisabled, repaint, destroy }.
export function brushButton(label, {
  size = 'md',
  tone = 'ink',
  flipX = false,
  seed = 17,
  onClick = null,
  pressed = undefined,
  disabled = false,
  ariaLabel = null,
  icon: iconName = null,
} = {}) {
  injectBrushCss();
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ui-brush ui-brush--${size} ui-brush--${tone}${flipX ? ' ui-brush--flip' : ''}`;
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  if (disabled) el.disabled = true;

  const cold = document.createElement('span');
  cold.className = 'ui-brush-plate ui-brush-plate--cold';
  cold.setAttribute('aria-hidden', 'true');
  const hot = document.createElement('span');
  hot.className = 'ui-brush-plate ui-brush-plate--hot';
  hot.setAttribute('aria-hidden', 'true');
  const span = document.createElement('span');
  span.className = 'ui-brush-label';
  const labelLines = (next) => (Array.isArray(next) ? next : [next]).map((line) => String(line ?? ''));
  const renderLabel = (lines) => {
    span.replaceChildren(...lines.map((textContent) => Object.assign(document.createElement('span'), { className: 'ui-brush-line', textContent })));
    el.setAttribute('aria-label', ariaLabel ?? lines.join(' '));
  };
  let lines = labelLines(label);
  renderLabel(lines);
  el.append(cold, hot);
  if (iconName) {
    const mark = document.createElement('span');
    mark.className = 'ui-brush-ico';
    mark.appendChild(icon(iconName, { size: size === 'sm' ? 16 : size === 'lg' ? 24 : 20 }));
    el.appendChild(mark);
  }
  el.appendChild(span);

  const coldColor = tone === 'hot' ? COLORS.terracotta : tone === 'danger' ? COLORS.danger : COLORS.indigo;
  const hotColor = tone === 'danger' ? COLORS.danger : COLORS.terracotta;
  const needsHot = coldColor !== hotColor;

  if (pressed !== undefined) {
    el.setAttribute('aria-pressed', String(!!pressed));
    el.classList.toggle('is-on', !!pressed);
  }

  let lastW = 0;
  let lastH = 0;
  let destroyed = false;
  let ro = null;
  let queued = false, forceQueued = false;
  let current = false, pressedOn = !!pressed;

  const paint = (force = false) => {
    if (destroyed) return false;
    const w = Math.ceil(el.offsetWidth);
    const h = Math.ceil(el.offsetHeight);
    if (!w || !h) return false;
    const rw = quantizePlate(w);
    const rh = quantizePlate(h);
    if (!force && rw === lastW && rh === lastH) return false;
    lastW = rw;
    lastH = rh;
    cold.style.backgroundImage = `url(${cachedBrushPlate(rw, rh, coldColor, seed, flipX)})`;
    if (needsHot) {
      hot.style.backgroundImage = `url(${cachedBrushPlate(rw, rh, hotColor, seed, flipX)})`;
    } else {
      hot.style.backgroundImage = '';
    }
    stats.repaints++;
    return true;
  };

  const schedulePaint = (force = false) => {
    forceQueued ||= force;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const force = forceQueued;
      forceQueued = false;
      if (fontsLoaded) paint(force);
    });
  };

  if (onClick) {
    el.addEventListener('click', (e) => {
      if (el.disabled) return;
      onClick(e);
    });
  }

  // Paint at the measured size once the current lettering face has loaded.
  let fontsLoaded = false;
  fontReady.then(() => {
    fontsLoaded = true;
    paint(false);
  });

  // Repaint once when the lettering setting changes live.
  onLettering(el, () => {
    if (destroyed) return;
    schedulePaint(true);
  });

  // Catch late mount / visibility reveal (e.g. inside a sheet or hidden container) without double-painting.
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      if (!fontsLoaded || destroyed) return;
      const w = Math.ceil(el.offsetWidth);
      const h = Math.ceil(el.offsetHeight);
      if (!w || !h) return;
      if (lastW > 0 && Math.abs(w - lastW) < PLATE_STEP && Math.abs(h - lastH) < PLATE_STEP) return;
      paint(false);
    });
    ro.observe(el);
  }

  el.setLabel = (next, { fontPx } = {}) => {
    const nextLines = labelLines(next);
    const nextFont = fontPx === undefined ? el.style.fontSize : fontPx == null ? '' : `${fontPx}px`;
    if (JSON.stringify(lines) === JSON.stringify(nextLines) && el.style.fontSize === nextFont) return;
    lines = nextLines;
    renderLabel(lines);
    el.style.fontSize = nextFont;
    schedulePaint();
  };

  el.setPressed = (on) => {
    const val = !!on;
    pressedOn = val;
    el.setAttribute('aria-pressed', String(val));
    el.classList.toggle('is-on', val || current);
  };

  el.setCurrent = (on) => {
    current = !!on;
    if (current) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
    el.classList.toggle('is-on', current || pressedOn);
  };

  el.setDisabled = (on) => {
    el.disabled = !!on;
  };

  el.setSpinning = (on) => el.classList.toggle('ui-brush--spin', !!on);

  el.repaint = (force = false) => paint(force);

  el.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    ro?.disconnect();
    ro = null;
  };

  return el;
}
