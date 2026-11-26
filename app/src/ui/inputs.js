// Secondary and tool controls for Sienna's 2D UI kit:
//   - inkButton():  secondary action lettered in ink with a cached painted brush underline
//   - segmented():  one choice of several (tabs or radio group) with roving tabindex + arrow keys, drawn
//                   as a record-player switch with a painted key that slides to the choice, or as a
//                   card's divider tabs (variant 'tabs', see ui/crate.js)
//   - stamp():      icon tool with terracotta oil-stamp on-state and a card tooltip (never title=)
import { dabCluster, TONES } from '../brushpaint.js';
import { COLORS, injectTokens } from './tokens.js';
import { cardGrain } from './paper.js';
import { injectCrateCss } from './crate.js';
import { icon } from './icons.js';
import { fontReady, onLettering } from '../style.js';

// ---- Cached painted strokes ----
const underlineCache = new Map();
let stampDotUrl = null;
let stampHoverUrl = null;
const stats = { paints: 0, hits: 0 };

export function inputsStats() {
  return { paints: stats.paints, hits: stats.hits, underlines: underlineCache.size };
}

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

/* ---- segmented: a switch, or divider tabs (crate.js) ---- */
.ui-seg { display: inline-flex; flex-wrap: wrap; align-items: center; }
.ui-seg-chip { position: relative; display: inline-flex; align-items: center; justify-content: center;
  margin: 0; border: 0; cursor: pointer; user-select: none;
  font-family: var(--sienna-font); font-size: var(--sienna-text-md); line-height: 1.15; letter-spacing: .01em; }
.ui-seg-chip:focus { outline: none; }
.ui-seg-chip:disabled,
.ui-seg-chip.is-disabled { cursor: not-allowed; opacity: var(--sienna-disabled); }
.ui-seg-label { position: relative; z-index: 1; display: block; white-space: nowrap; }
.ui-seg--switch { position: relative; gap: 2px; padding: 3px; border-radius: 10px;
  background: var(--sienna-paper-lo); box-shadow: inset 0 1px 3px rgba(84, 58, 32, 0.3); }
.ui-seg-thumb { position: absolute; left: 0; top: 0; width: 0; height: 0; border-radius: 7px; pointer-events: none;
  background: var(--sienna-indigo); box-shadow: 0 2px 0 rgba(16, 18, 40, 0.55), 0 3px 7px rgba(24, 18, 36, 0.3);
  transition: transform var(--sienna-dur-mid) var(--sienna-ease-out), width var(--sienna-dur-mid) var(--sienna-ease-out),
    height var(--sienna-dur-mid) var(--sienna-ease-out); }
.ui-seg-thumb[hidden] { display: none; }
.ui-seg--switch .ui-seg-chip { padding: 0; background: none; border-radius: 7px; color: var(--sienna-ink);
  transition: color var(--sienna-dur-fast) var(--sienna-ease-out); }
.ui-seg--switch .ui-seg-label { padding: 4px var(--sienna-space-3) 5px; }
.ui-seg--switch .ui-seg-chip:not(:disabled):hover,
.ui-seg--switch .ui-seg-chip:not(:disabled).is-hover { color: var(--sienna-terracotta); }
.ui-seg--switch .ui-seg-chip.is-on,
.ui-seg--switch .ui-seg-chip[aria-selected="true"],
.ui-seg--switch .ui-seg-chip[aria-checked="true"],
.ui-seg--switch .ui-seg-chip.is-on:not(:disabled):hover,
.ui-seg--switch .ui-seg-chip[aria-selected="true"]:not(:disabled):hover,
.ui-seg--switch .ui-seg-chip[aria-checked="true"]:not(:disabled):hover { color: var(--sienna-paper); }
.ui-seg--switch .ui-seg-chip:focus-visible,
.ui-seg--switch .ui-seg-chip.is-focus { box-shadow: var(--sienna-focus-ring); }

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
.ui-tip { display: block; padding: var(--sienna-space-1) var(--sienna-space-3); border-radius: 5px;
  background: var(--sienna-paper) var(--sienna-grain); box-shadow: 0 2px 0 var(--sienna-edge);
  color: var(--sienna-ink); font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-weight: 600;
  line-height: 1.25; white-space: nowrap; }
.ui-stamp:not(:disabled):hover .ui-tip-wrap,
.ui-stamp:not(:disabled):focus-visible .ui-tip-wrap,
.ui-stamp:not(:disabled).is-hover .ui-tip-wrap,
.ui-stamp:not(:disabled).is-focus .ui-tip-wrap {
  opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0);
  transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out), transform var(--sienna-dur-fast) var(--sienna-ease-out), visibility 0s; }
`;

function injectInputsCss() {
  injectTokens();
  injectCrateCss();
  if (typeof document !== 'undefined') cardGrain();
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

// One choice of several: search tabs (role 'tabs') and Settings options (role 'radio'). Drawn as a switch
// whose painted key slides to the choice, or (variant 'tabs') as divider tabs on a card.
export function segmented(options, {
  value = undefined,
  onChange = null,
  role = 'tabs',
  variant = 'switch',
  label = null,
  disabled = false,
} = {}) {
  injectInputsCss();
  const isRadio = role === 'radio';
  const groupRole = isRadio ? 'radiogroup' : 'tablist';
  const itemRole = isRadio ? 'radio' : 'tab';
  const stateAttr = isRadio ? 'aria-checked' : 'aria-selected';
  const dividers = variant === 'tabs';

  const items = options.map((opt) => (typeof opt === 'string'
    ? { value: opt, label: opt }
    : Array.isArray(opt)
      ? { value: opt[1], label: opt[0], font: opt[2] }
      : { ...opt }));

  const el = document.createElement('div');
  el.className = dividers ? 'ui-seg ui-seg--tabs crate-tabs' : 'ui-seg ui-seg--switch';
  el.setAttribute('role', groupRole);
  if (label) el.setAttribute('aria-label', label);

  let current = value !== undefined ? value : items[0]?.value;
  let groupDisabled = !!disabled;
  let destroyed = false;
  let placed = false;
  const entries = [];
  const thumb = dividers ? null : document.createElement('span');
  if (thumb) {
    thumb.className = 'ui-seg-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    thumb.hidden = true;
    el.appendChild(thumb);
  }

  // slide the switch's key under the choice (without sliding in from nowhere the first time)
  const place = () => {
    if (!thumb || destroyed) return;
    const on = entries.find((e) => e.opt.value === current)?.btn;
    if (!on?.offsetWidth) { thumb.hidden = true; placed = false; return; }
    thumb.hidden = false;
    if (!placed) thumb.style.transition = 'none';
    thumb.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    thumb.style.width = `${on.offsetWidth}px`;
    thumb.style.height = `${on.offsetHeight}px`;
    if (!placed) {
      void thumb.offsetWidth;
      thumb.style.transition = '';
      placed = true;
    }
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
    place();
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
    btn.className = dividers ? 'ui-seg-chip crate-tab' : 'ui-seg-chip';
    btn.setAttribute('role', itemRole);
    if (opt.font) btn.style.fontFamily = typeof opt.font === 'string' ? opt.font : opt.font.family;

    const lbl = document.createElement('span');
    lbl.className = 'ui-seg-label';
    lbl.textContent = opt.label;
    btn.append(lbl);

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
    entries.push({ opt, btn });
  });

  sync();
  fontReady.then(place);
  onLettering(el, place);

  let ro = null;
  if (thumb && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(place);
    ro.observe(el);
    for (const { btn } of entries) ro.observe(btn);
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
    repaint: place,
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
