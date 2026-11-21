// Secondary and tool controls for Sienna's 2D UI kit:
//   - inkButton():  secondary action lettered in ink with a cached painted brush underline
//   - segmented():  painted oil-dab chips (tabs or radio group) with roving tabindex + arrow keys
//   - stamp():      icon tool with terracotta oil-stamp on-state and painted tooltip (never title=)
import { dabCluster, TONES } from '../brushpaint.js';
import { COLORS, injectTokens } from './tokens.js';
import { torn } from './paper.js';
import { icon } from './icons.js';
import { fontReady, onLettering } from '../style.js';

// ---- Cached painted strokes & chips ----
const CHIP_STEP = 4;
const MAX_CHIPS = 128;
const underlineCache = new Map();
const chipCache = new Map();
let stampDotUrl = null;
let stampHoverUrl = null;
const stats = { paints: 0, hits: 0 };

export function inputsStats() {
  return { paints: stats.paints, hits: stats.hits, chips: chipCache.size, underlines: underlineCache.size };
}

const quantizeChip = (v) => Math.max(CHIP_STEP, Math.ceil(v / CHIP_STEP) * CHIP_STEP);

function getUnderlineUrl(color, seed = 11) {
  const bucket = Math.abs(seed) % 5 + 1;
  const key = `${color}-${bucket}`;
  const cached = underlineCache.get(key);
  if (cached) {
    stats.hits++;
    return cached;
  }
  const tones = color === COLORS.danger ? [COLORS.danger] : TONES.hot;
  const url = dabCluster(180, 14, {
    tones,
    seed: 500 + bucket * 13,
    rows: 1,
    tilt: 0.03,
    overlap: 0.56,
    minCols: 3,
    impasto: 0.45,
    even: true,
    solid: true,
    scale: 1.5,
  });
  underlineCache.set(key, url);
  stats.paints++;
  return url;
}

function getChipUrl(w, h, tone, seed) {
  const rw = quantizeChip(w);
  const rh = quantizeChip(h);
  const key = `${rw}x${rh}-${tone}-${seed}`;
  const cached = chipCache.get(key);
  if (cached) {
    chipCache.delete(key);
    chipCache.set(key, cached);
    stats.hits++;
    return cached;
  }
  const isHot = tone === 'hot';
  const url = dabCluster(rw, rh, {
    tones: isHot ? TONES.hot : TONES.track,
    seed,
    rows: 1,
    tilt: 0.04,
    overlap: 0.56,
    minCols: 2,
    impasto: isHot ? 0.52 : 0.28,
    even: isHot,
    soft: !isHot,
    solid: true,
    scale: 1.5,
  });
  if (chipCache.size >= MAX_CHIPS) {
    const oldest = chipCache.keys().next().value;
    chipCache.delete(oldest);
  }
  chipCache.set(key, url);
  stats.paints++;
  return url;
}

function getStampDotUrl(hot) {
  if (hot && stampDotUrl) { stats.hits++; return stampDotUrl; }
  if (!hot && stampHoverUrl) { stats.hits++; return stampHoverUrl; }
  const url = dabCluster(44, 44, {
    tones: hot ? TONES.hot : TONES.track,
    seed: hot ? 73 : 79,
    rows: 2,
    tilt: 0.14,
    overlap: 0.58,
    minCols: 1,
    impasto: hot ? 0.52 : 0.25,
    even: hot,
    soft: !hot,
    solid: true,
    scale: 1.5,
  });
  stats.paints++;
  if (hot) stampDotUrl = url;
  else stampHoverUrl = url;
  return url;
}

let tipSeq = 0;

const INPUTS_CSS = `
/* ---- inkButton ---- */
.ui-ink { position: relative; display: inline-flex; align-items: center; gap: var(--sienna-space-2);
  border: 0; padding: var(--sienna-space-1) var(--sienna-space-2) calc(var(--sienna-space-2) + 2px);
  margin: 0; background: none; cursor: pointer; user-select: none;
  font-family: var(--sienna-font); color: var(--sienna-indigo); line-height: 1.05; letter-spacing: .02em;
  transition: color var(--sienna-dur-fast) var(--sienna-ease-out), transform var(--sienna-dur-fast) var(--sienna-ease-pop), opacity var(--sienna-dur-fast); }
.ui-ink--sm { font-size: var(--sienna-text-md); }
.ui-ink--md { font-size: var(--sienna-text-lg); }
.ui-ink--lg { font-size: var(--sienna-text-xl); }
.ui-ink--danger { color: var(--sienna-danger); }
.ui-ink-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; }
.ui-ink--spin .ui-ink-icon { animation: ui-spin 900ms linear infinite; }
@keyframes ui-spin { to { transform: rotate(360deg); } }
.ui-ink-label { position: relative; white-space: nowrap; }
.ui-ink-line { position: absolute; left: 2px; right: 2px; bottom: 0; height: 9px; pointer-events: none;
  background-size: 100% 100%; background-repeat: no-repeat;
  opacity: 0; transform: scaleX(0.75) translateY(2px); transform-origin: left center;
  transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out), transform var(--sienna-dur-fast) var(--sienna-ease-out); }
.ui-ink:not(:disabled):hover,
.ui-ink:not(:disabled).is-hover { color: var(--sienna-terracotta); transform: translateY(-1.5px); }
.ui-ink--danger:not(:disabled):hover,
.ui-ink--danger:not(:disabled).is-hover { color: var(--sienna-danger); }
.ui-ink:not(:disabled):hover .ui-ink-line,
.ui-ink:not(:disabled).is-hover .ui-ink-line,
.ui-ink.is-on .ui-ink-line,
.ui-ink[aria-current="page"] .ui-ink-line { opacity: 1; transform: scaleX(1) translateY(0); }
.ui-ink.is-on,
.ui-ink[aria-current="page"] { color: var(--sienna-terracotta); }
.ui-ink--danger.is-on { color: var(--sienna-danger); }
.ui-ink:not(:disabled):active { transform: translateY(0) scale(.98); }
.ui-ink:focus { outline: none; }
.ui-ink:focus-visible,
.ui-ink.is-focus { border-radius: 6px 10px 8px 10px / 10px 6px 10px 8px; box-shadow: var(--sienna-focus-ring); }
.ui-ink:disabled,
.ui-ink.is-disabled { cursor: not-allowed; opacity: var(--sienna-disabled); transform: none; }

/* ---- segmented ---- */
.ui-seg { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--sienna-space-3); }
.ui-seg-chip { position: relative; display: inline-flex; align-items: center; justify-content: center;
  border: 0; padding: 0; margin: 0; background: none; cursor: pointer; user-select: none;
  font-family: var(--sienna-font); font-size: var(--sienna-text-md); color: var(--sienna-ink);
  line-height: 1.05; letter-spacing: .01em; transform: rotate(var(--sienna-tilt-sm));
  transition: color var(--sienna-dur-fast) var(--sienna-ease-out), transform var(--sienna-dur-fast) var(--sienna-ease-pop), opacity var(--sienna-dur-fast); }
.ui-seg-chip:nth-child(even) { transform: rotate(calc(var(--sienna-tilt-sm) * -0.5)); }
.ui-seg-plate { position: absolute; inset: -1px -5px; background-size: 100% 100%; background-repeat: no-repeat;
  pointer-events: none; filter: drop-shadow(var(--sienna-shadow-rest));
  transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out), filter var(--sienna-dur-fast); }
.ui-seg-plate--on { opacity: 0; }
.ui-seg-label { position: relative; z-index: 1; display: block; white-space: nowrap;
  padding: var(--sienna-space-2) var(--sienna-space-5) calc(var(--sienna-space-1) + 2px); }
.ui-seg-chip:not(:disabled):hover,
.ui-seg-chip:not(:disabled).is-hover { color: var(--sienna-terracotta); transform: translateY(-1.5px) rotate(0deg); }
.ui-seg-chip:not(:disabled):hover .ui-seg-plate,
.ui-seg-chip:not(:disabled).is-hover .ui-seg-plate { filter: drop-shadow(var(--sienna-shadow-lift)); }
.ui-seg-chip.is-on,
.ui-seg-chip[aria-selected="true"],
.ui-seg-chip[aria-checked="true"] { color: var(--sienna-paper); transform: translateY(-1px) rotate(0deg); }
.ui-seg-chip.is-on:not(:disabled):hover,
.ui-seg-chip[aria-selected="true"]:not(:disabled):hover,
.ui-seg-chip[aria-checked="true"]:not(:disabled):hover { color: var(--sienna-paper); }
.ui-seg-chip.is-on .ui-seg-plate--on,
.ui-seg-chip[aria-selected="true"] .ui-seg-plate--on,
.ui-seg-chip[aria-checked="true"] .ui-seg-plate--on { opacity: 1; }
.ui-seg-chip:focus { outline: none; }
.ui-seg-chip:focus-visible::after,
.ui-seg-chip.is-focus::after { content: ''; position: absolute; inset: -3px -5px; pointer-events: none;
  border-radius: 8px 12px 10px 12px / 12px 8px 12px 10px; box-shadow: var(--sienna-focus-ring); }
.ui-seg-chip:disabled,
.ui-seg-chip.is-disabled { cursor: not-allowed; opacity: var(--sienna-disabled); transform: none; }

/* ---- stamp ---- */
.ui-stamp { position: relative; display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border: 0; padding: 0; margin: 0; background: none; cursor: pointer;
  color: var(--sienna-indigo); user-select: none;
  transition: color var(--sienna-dur-fast) var(--sienna-ease-out), transform var(--sienna-dur-fast) var(--sienna-ease-pop), opacity var(--sienna-dur-fast); }
.ui-stamp--sm { width: 30px; height: 30px; }
.ui-stamp--lg { width: 44px; height: 44px; }
.ui-stamp-dab { position: absolute; inset: 0; background-size: 100% 100%; background-repeat: no-repeat;
  pointer-events: none; opacity: 0; transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out); }
.ui-stamp-dab--hot { filter: drop-shadow(var(--sienna-shadow-rest)); }
.ui-stamp-ico { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; }
.ui-stamp:not(:disabled):hover,
.ui-stamp:not(:disabled).is-hover { color: var(--sienna-terracotta); transform: translateY(-1.5px) rotate(var(--sienna-tilt-sm)); }
.ui-stamp:not(:disabled):hover .ui-stamp-dab--warm,
.ui-stamp:not(:disabled).is-hover .ui-stamp-dab--warm { opacity: 0.9; }
.ui-stamp.is-on,
.ui-stamp[aria-pressed="true"] { color: var(--sienna-paper); }
.ui-stamp.is-on:not(:disabled):hover,
.ui-stamp[aria-pressed="true"]:not(:disabled):hover { color: var(--sienna-paper); }
.ui-stamp.is-on .ui-stamp-dab--hot,
.ui-stamp[aria-pressed="true"] .ui-stamp-dab--hot { opacity: 1; }
.ui-stamp:not(:disabled):active { transform: translateY(0) scale(.94); }
.ui-stamp:focus { outline: none; }
.ui-stamp:focus-visible::after,
.ui-stamp.is-focus::after { content: ''; position: absolute; inset: -3px; pointer-events: none;
  border-radius: 50% 46% 52% 48% / 48% 52% 46% 50%; box-shadow: var(--sienna-focus-ring); }
.ui-stamp:disabled,
.ui-stamp.is-disabled { cursor: not-allowed; opacity: var(--sienna-disabled); transform: none; }
.ui-stamp--spin .ui-stamp-ico { animation: ui-spin 900ms linear infinite; }

/* ---- painted tooltip ---- */
.ui-tip-wrap { position: absolute; left: 50%; bottom: calc(100% + var(--sienna-space-2)); z-index: var(--sienna-z-modal);
  transform: translateX(-50%) translateY(4px); pointer-events: none; opacity: 0; visibility: hidden;
  filter: drop-shadow(var(--sienna-shadow-rest));
  transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out), transform var(--sienna-dur-fast) var(--sienna-ease-out), visibility 0s var(--sienna-dur-fast); }
.ui-stamp--tip-bottom .ui-tip-wrap { bottom: auto; top: calc(100% + var(--sienna-space-2)); transform: translateX(-50%) translateY(-4px); }
.ui-tip { display: block; padding: var(--sienna-space-1) var(--sienna-space-3); background: var(--sienna-paper);
  color: var(--sienna-ink); font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-weight: 600;
  line-height: 1.25; white-space: nowrap; }
.ui-stamp:not(:disabled):hover .ui-tip-wrap,
.ui-stamp:not(:disabled):focus-visible .ui-tip-wrap,
.ui-stamp:not(:disabled):focus .ui-tip-wrap,
.ui-stamp:not(:disabled).is-hover .ui-tip-wrap,
.ui-stamp:not(:disabled).is-focus .ui-tip-wrap {
  opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0);
  transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out), transform var(--sienna-dur-fast) var(--sienna-ease-out), visibility 0s; }
`;

function injectInputsCss() {
  injectTokens();
  if (typeof document === 'undefined' || !document.head || document.getElementById('sienna-ui-inputs')) return;
  const st = document.createElement('style');
  st.id = 'sienna-ui-inputs';
  st.textContent = INPUTS_CSS;
  document.head.appendChild(st);
}

// Secondary action lettered in ink with a cached painted brush underline on hover & selection.
export function inkButton(label, {
  icon: iconName = null,
  selected = false,
  danger = false,
  disabled = false,
  size = 'md',
  onClick = null,
  seed = 11,
  ariaLabel = null,
} = {}) {
  injectInputsCss();
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ui-ink ui-ink--${size}${danger ? ' ui-ink--danger' : ''}${selected ? ' is-on' : ''}`;
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  if (disabled) el.disabled = true;

  let icoWrap = null;
  if (iconName) {
    icoWrap = document.createElement('span');
    icoWrap.className = 'ui-ink-icon';
    const icoPx = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
    icoWrap.appendChild(icon(iconName, { size: icoPx }));
    el.appendChild(icoWrap);
  }

  const textEl = document.createElement('span');
  textEl.className = 'ui-ink-label';
  textEl.textContent = String(label ?? '');
  el.appendChild(textEl);

  const line = document.createElement('span');
  line.className = 'ui-ink-line';
  line.setAttribute('aria-hidden', 'true');
  line.style.backgroundImage = `url(${getUnderlineUrl(danger ? COLORS.danger : COLORS.terracotta, seed)})`;
  el.appendChild(line);

  if (onClick) {
    el.addEventListener('click', (e) => {
      if (el.disabled) return;
      onClick(e);
    });
  }

  el.setLabel = (next) => { textEl.textContent = String(next ?? ''); };
  el.setSelected = (on) => { el.classList.toggle('is-on', !!on); };
  el.setDisabled = (on) => { el.disabled = !!on; };
  el.setSpinning = (on) => { el.classList.toggle('ui-ink--spin', !!on); };
  el.destroy = () => {};

  return el;
}

// Painted oil-dab segmented chips for search tabs (role: 'tabs') and Settings options (role: 'radio').
export function segmented(options, {
  value = undefined,
  onChange = null,
  role = 'tabs',
  label = null,
  disabled = false,
  seed = 23,
} = {}) {
  injectInputsCss();
  const isRadio = role === 'radio';
  const groupRole = isRadio ? 'radiogroup' : 'tablist';
  const itemRole = isRadio ? 'radio' : 'tab';
  const stateAttr = isRadio ? 'aria-checked' : 'aria-selected';

  const items = options.map((opt) => (typeof opt === 'string'
    ? { value: opt, label: opt }
    : Array.isArray(opt)
      ? { value: opt[1], label: opt[0], font: opt[2] }
      : { ...opt }));

  const el = document.createElement('div');
  el.className = 'ui-seg';
  el.setAttribute('role', groupRole);
  if (label) el.setAttribute('aria-label', label);

  let current = value !== undefined ? value : items[0]?.value;
  let groupDisabled = !!disabled;
  let destroyed = false;
  const entries = [];

  const paintChip = (entry, force = false) => {
    if (destroyed) return;
    const w = Math.ceil(entry.btn.offsetWidth);
    const h = Math.ceil(entry.btn.offsetHeight);
    if (!w || !h) return;
    const rw = quantizeChip(w);
    const rh = quantizeChip(h);
    if (!force && rw === entry.w && rh === entry.h) return;
    entry.w = rw;
    entry.h = rh;
    entry.restPlate.style.backgroundImage = `url(${getChipUrl(rw, rh, 'rest', entry.seed)})`;
    entry.onPlate.style.backgroundImage = `url(${getChipUrl(rw, rh, 'hot', entry.seed)})`;
  };

  const paintAll = (force = false) => {
    for (const entry of entries) paintChip(entry, force);
  };

  const sync = () => {
    let focusTargetIdx = items.findIndex((o) => o.value === current && !o.disabled && !groupDisabled);
    if (focusTargetIdx < 0) focusTargetIdx = items.findIndex((o) => !o.disabled && !groupDisabled);
    entries.forEach((entry, i) => {
      const isOn = entry.opt.value === current;
      const isDis = groupDisabled || !!entry.opt.disabled;
      entry.btn.disabled = isDis;
      entry.btn.classList.toggle('is-on', isOn);
      entry.btn.setAttribute(stateAttr, String(isOn));
      entry.btn.tabIndex = i === focusTargetIdx ? 0 : -1;
    });
  };

  const selectIndex = (idx, { focus = false, notify = true } = {}) => {
    const entry = entries[idx];
    if (!entry || entry.btn.disabled) return;
    const changed = current !== entry.opt.value;
    current = entry.opt.value;
    sync();
    if (focus) entry.btn.focus({ preventScroll: true });
    if (notify && changed) onChange?.(current, entry.opt);
  };

  const enabledIndices = () => entries.map((e, i) => (e.btn.disabled ? -1 : i)).filter((i) => i >= 0);

  items.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ui-seg-chip';
    btn.setAttribute('role', itemRole);
    if (opt.font) btn.style.fontFamily = typeof opt.font === 'string' ? opt.font : opt.font.family;

    const restPlate = document.createElement('span');
    restPlate.className = 'ui-seg-plate ui-seg-plate--rest';
    restPlate.setAttribute('aria-hidden', 'true');
    const onPlate = document.createElement('span');
    onPlate.className = 'ui-seg-plate ui-seg-plate--on';
    onPlate.setAttribute('aria-hidden', 'true');
    const lbl = document.createElement('span');
    lbl.className = 'ui-seg-label';
    lbl.textContent = opt.label;
    btn.append(restPlate, onPlate, lbl);

    btn.addEventListener('click', () => selectIndex(i, { focus: false, notify: true }));
    btn.addEventListener('keydown', (e) => {
      const list = enabledIndices();
      if (!list.length) return;
      const pos = list.indexOf(i);
      let nextIdx = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = list[(pos + 1 + list.length) % list.length];
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIdx = list[(pos - 1 + list.length) % list.length];
      } else if (e.key === 'Home') {
        nextIdx = list[0];
      } else if (e.key === 'End') {
        nextIdx = list[list.length - 1];
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      selectIndex(nextIdx, { focus: true, notify: true });
    });

    el.appendChild(btn);
    entries.push({ opt, btn, restPlate, onPlate, seed: seed + i * 7, w: 0, h: 0 });
  });

  sync();

  let fontsLoaded = false;
  fontReady.then(() => {
    fontsLoaded = true;
    paintAll(false);
  });
  onLettering(el, () => {
    if (destroyed) return;
    for (const entry of entries) { entry.w = 0; entry.h = 0; }
    paintAll(true);
  });

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      if (!fontsLoaded || destroyed) return;
      paintAll(false);
    });
    ro.observe(el);
  }

  return {
    el,
    buttons: entries.map((e) => e.btn),
    getValue: () => current,
    setValue(next, { notify = false } = {}) {
      const idx = items.findIndex((o) => o.value === next);
      if (idx < 0) return;
      selectIndex(idx, { focus: false, notify });
    },
    setDisabled(on) {
      groupDisabled = !!on;
      sync();
    },
    repaint(force = false) { paintAll(force); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ro?.disconnect();
      ro = null;
    },
  };
}

// Hand-drawn icon tool stamp with terracotta on-state and painted tooltip (never native title=).
export function stamp(iconName, {
  label = '',
  toggle = false,
  on = false,
  onClick = null,
  size = 'md',
  disabled = false,
  tooltip = null,
  tooltipPos = 'top',
  seed = 31,
} = {}) {
  injectInputsCss();
  let curIcon = iconName;
  let curLabel = String(label || iconName);
  let isOn = !!on;
  let customTip = tooltip;

  const icoPx = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ui-stamp ui-stamp--${size}${tooltipPos === 'bottom' ? ' ui-stamp--tip-bottom' : ''}`;
  if (disabled) el.disabled = true;

  const warmDab = document.createElement('span');
  warmDab.className = 'ui-stamp-dab ui-stamp-dab--warm';
  warmDab.setAttribute('aria-hidden', 'true');
  warmDab.style.backgroundImage = `url(${getStampDotUrl(false)})`;

  const hotDab = document.createElement('span');
  hotDab.className = 'ui-stamp-dab ui-stamp-dab--hot';
  hotDab.setAttribute('aria-hidden', 'true');
  hotDab.style.backgroundImage = `url(${getStampDotUrl(true)})`;

  const icoWrap = document.createElement('span');
  icoWrap.className = 'ui-stamp-ico';
  icoWrap.appendChild(icon(curIcon, { size: icoPx }));

  const tipId = `ui-tip-${++tipSeq}`;
  const tipWrap = document.createElement('span');
  tipWrap.className = 'ui-tip-wrap';
  const tip = document.createElement('span');
  tip.className = 'ui-tip';
  tip.id = tipId;
  tip.setAttribute('role', 'tooltip');
  tip.style.clipPath = torn(seed, 2, 4);
  tipWrap.appendChild(tip);

  el.setAttribute('aria-describedby', tipId);
  el.append(warmDab, hotDab, icoWrap, tipWrap);

  const formatTip = () => {
    if (typeof customTip === 'function') return String(customTip(isOn));
    if (typeof customTip === 'string' && customTip) return customTip;
    return toggle ? `${curLabel}: ${isOn ? 'on' : 'off'}` : curLabel;
  };

  const sync = () => {
    el.classList.toggle('is-on', isOn);
    if (toggle) el.setAttribute('aria-pressed', String(isOn));
    const text = formatTip();
    tip.textContent = text;
    el.setAttribute('aria-label', text);
  };
  sync();

  el.addEventListener('click', (e) => {
    if (el.disabled) return;
    if (toggle) {
      isOn = !isOn;
      sync();
      onClick?.(isOn, e);
    } else {
      onClick?.(e);
    }
  });

  el.setOn = (next, nextTip = undefined) => {
    isOn = !!next;
    if (nextTip !== undefined) customTip = nextTip;
    sync();
  };
  el.isOn = () => isOn;
  el.setIcon = (nextName) => {
    if (curIcon === nextName) return;
    curIcon = nextName;
    icoWrap.replaceChildren(icon(curIcon, { size: icoPx }));
  };
  el.setLabel = (nextLabel, nextTip = undefined) => {
    curLabel = String(nextLabel || curIcon);
    if (nextTip !== undefined) customTip = nextTip;
    sync();
  };
  el.setDisabled = (next) => { el.disabled = !!next; };
  el.setSpinning = (next) => { el.classList.toggle('ui-stamp--spin', !!next); };
  el.tooltipEl = tip;
  el.destroy = () => {};

  return el;
}
