// Shared slip list for Search, Collection list (600+ songs with progressive 40-row batches),
// and Up Next Queue (pinned now-playing row + drawer flight hooks).
// Rows share a small LRU cache of painted oil-dab slips (never one paint per row), stay aligned
// at a fixed width with zero overlap, mark selection with a terracotta edge band (not a full red
// repaint), and mark now-playing with an indigo edge band & badge.
import { dabCluster, TONES } from '../brushpaint.js';
import { paintedCoverURL } from '../coverpaint.js';
import { COLORS, injectTokens } from './tokens.js';
import { paperSurface, PAPER_STEP, quantizePaperSize } from './paper.js';
import { inkButton } from './inputs.js';

const ROW_H = 66;
const SLIP_SEEDS = 4;
const MAX_SLIP_CACHE = 48;

const slipCache = new Map();
let bandHotUrl = null;
let bandNowUrl = null;
const stats = { paints: 0, hits: 0 };

export function listStats() {
  return { paints: stats.paints, hits: stats.hits, size: slipCache.size };
}

function getSlipUrl(w, seed) {
  const rw = quantizePaperSize(w);
  const key = `${rw}x${ROW_H}-${seed}`;
  const cached = slipCache.get(key);
  if (cached) {
    slipCache.delete(key);
    slipCache.set(key, cached);
    stats.hits++;
    return cached;
  }
  const url = dabCluster(rw, ROW_H, {
    tones: TONES.paper,
    seed,
    rows: 2,
    tilt: 0.04,
    overlap: 0.56,
    minCols: 4,
    impasto: 0.28,
    soft: true,
    solid: true,
    scale: 1.5,
  });
  if (slipCache.size >= MAX_SLIP_CACHE) {
    const oldest = slipCache.keys().next().value;
    slipCache.delete(oldest);
  }
  slipCache.set(key, url);
  stats.paints++;
  return url;
}

function getEdgeBandUrl(kind) {
  if (kind === 'now' && bandNowUrl) { stats.hits++; return bandNowUrl; }
  if (kind !== 'now' && bandHotUrl) { stats.hits++; return bandHotUrl; }
  const url = dabCluster(16, ROW_H, {
    tones: kind === 'now' ? TONES.ink : TONES.hot,
    seed: kind === 'now' ? 91 : 97,
    rows: 3,
    tilt: 0.08,
    overlap: 0.56,
    minCols: 1,
    impasto: 0.5,
    even: true,
    solid: true,
    scale: 1.5,
  });
  stats.paints++;
  if (kind === 'now') bandNowUrl = url;
  else bandHotUrl = url;
  return url;
}

const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

let listSeq = 0;

const LIST_CSS = `
.ui-list { display: flex; flex-direction: column; width: 100%; box-sizing: border-box; user-select: none; }
.ui-list-scroll { overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
  padding: var(--sienna-space-1) var(--sienna-space-2) var(--sienna-space-4);
  -webkit-mask-image: linear-gradient(#000 calc(100% - 14px), transparent);
  mask-image: linear-gradient(#000 calc(100% - 14px), transparent);
  scrollbar-width: thin; scrollbar-color: var(--sienna-scroll-thumb) transparent; }
.ui-list-scroll::-webkit-scrollbar { width: 6px; }
.ui-list-scroll::-webkit-scrollbar-thumb { background: var(--sienna-scroll-thumb); border-radius: 3px; }
.ui-list.is-stale .ui-list-rows { opacity: 0.55; transition: opacity var(--sienna-dur-fast); }
.ui-list-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sienna-space-2); }
.ui-list-rows:focus { outline: none; }
.ui-list-rows:focus-visible { border-radius: 6px; box-shadow: var(--sienna-focus-ring); }

.ui-list-row { position: relative; height: ${ROW_H}px; width: 100%; box-sizing: border-box;
  display: flex; align-items: center; gap: var(--sienna-space-3);
  padding: 0 var(--sienna-space-6) 0 var(--sienna-space-5);
  background-size: 100% 100%; background-repeat: no-repeat;
  color: var(--sienna-ink); cursor: pointer;
  filter: drop-shadow(var(--sienna-shadow-rest));
  transition: transform var(--sienna-dur-fast) var(--sienna-ease-out), filter var(--sienna-dur-fast) var(--sienna-ease-out); }
.ui-list-row.is-entering {
  animation: ui-list-rise var(--sienna-dur-mid) var(--sienna-ease-out) calc(var(--i, 0) * 26ms) both; }
@keyframes ui-list-rise {
  0%   { opacity: 0; transform: translateY(10px) scale(.985); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.ui-list-row.is-drawer-in {
  animation: ui-list-drawer-in var(--sienna-dur-slow) var(--sienna-ease-out) var(--delay, 0ms) both; }
.ui-list-row.is-drawer-out {
  animation: ui-list-drawer-out var(--sienna-dur-mid) var(--sienna-ease-in) var(--cdelay, 0ms) both; }
@keyframes ui-list-drawer-in {
  0%   { opacity: 0; transform: translate(var(--fx, -200px), var(--fy, 280px)) scale(.26) rotate(-10deg); }
  25%  { opacity: 1; }
  75%  { opacity: 1; transform: translate(0, -5px) scale(1.015); }
  100% { opacity: 1; transform: translate(0, 0) scale(1); }
}
@keyframes ui-list-drawer-out {
  0%   { opacity: 1; transform: translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(var(--fx, -200px), var(--fy, 280px)) scale(.26) rotate(-10deg); }
}

.ui-list-band { position: absolute; left: 6px; top: 6px; bottom: 6px; width: 7px;
  background-size: 100% 100%; background-repeat: no-repeat; pointer-events: none;
  opacity: 0; transform: scaleY(0.5);
  transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out), transform var(--sienna-dur-fast) var(--sienna-ease-out); }
.ui-list-row.is-active,
.ui-list-row.is-hover { transform: translateY(-1px); filter: drop-shadow(var(--sienna-shadow-lift)); }
.ui-list-row.is-active .ui-list-band--sel,
.ui-list-row.is-hover .ui-list-band--sel { opacity: 1; transform: scaleY(1); }
.ui-list-row.is-now .ui-list-band--now { opacity: 1; transform: scaleY(1); }
.ui-list-row.is-now.is-active .ui-list-band--now { opacity: 0; }
.ui-list-row.is-now.is-pinned { position: sticky; top: 0; bottom: 0; z-index: 3; }
.ui-list-row.is-focus::after { content: ''; position: absolute; inset: 1px 2px; pointer-events: none;
  border-radius: 6px 10px 8px 10px / 10px 6px 10px 8px; box-shadow: var(--sienna-focus-ring); }

.ui-list-idx { position: relative; flex: none; width: 24px; text-align: right;
  font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-weight: 600;
  font-variant-numeric: lining-nums tabular-nums; color: var(--sienna-ink-3); }
.ui-list-row.is-now .ui-list-idx { color: var(--sienna-indigo); }

.ui-list-cover { position: relative; flex: none; width: 44px; height: 44px;
  background: var(--sienna-paper-lo); transform: rotate(var(--sienna-tilt-lg));
  overflow: hidden; box-shadow: var(--sienna-shadow-rest); }
.ui-list-cover img { display: block; width: 100%; height: 100%; object-fit: cover; }

.ui-list-text { position: relative; flex: 1; min-width: 0; }
.ui-list-title { font-family: var(--sienna-font); font-size: var(--sienna-text-lg); line-height: 1.06;
  color: var(--sienna-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ui-list-row.is-now .ui-list-title { color: var(--sienna-indigo); }
.ui-list-row.is-active .ui-list-title { color: var(--sienna-terracotta); }
.ui-list-sub { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); line-height: 1.28;
  color: var(--sienna-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }

.ui-list-right { position: relative; flex: none; display: flex; align-items: center; gap: var(--sienna-space-2); }
.ui-list-kind { display: inline-flex; align-items: center; padding: 1px var(--sienna-space-2);
  font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-weight: 600;
  line-height: 1.2; text-transform: uppercase; letter-spacing: .05em;
  color: var(--sienna-ink-2); background: var(--sienna-paper-lo);
  border: 1px solid var(--sienna-hairline); border-radius: 3px; transform: rotate(var(--sienna-tilt-md)); }
.ui-list-row.is-now .ui-list-kind { color: var(--sienna-indigo); border-color: var(--sienna-indigo); }
.ui-list-now-tag { display: inline-flex; align-items: center; gap: 3px; padding: 1px var(--sienna-space-2);
  font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-weight: 600;
  line-height: 1.2; letter-spacing: .03em; color: var(--sienna-paper); background: var(--sienna-indigo);
  border-radius: 3px; transform: rotate(var(--sienna-tilt-sm)); }
.ui-list-meta { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm);
  font-variant-numeric: lining-nums tabular-nums; color: var(--sienna-ink-3); white-space: nowrap; min-width: 34px; text-align: right; }

/* ---- paper notes (loading / empty / error) ---- */
.ui-list-note { position: relative; display: flex; align-items: center; justify-content: space-between;
  gap: var(--sienna-space-4); padding: var(--sienna-space-4) var(--sienna-space-6);
  font-family: var(--sienna-serif); font-size: var(--sienna-text-md); color: var(--sienna-ink-2); }
.ui-list-note--error .ui-list-note-msg { color: var(--sienna-danger); }
.ui-list-note-msg { display: flex; align-items: baseline; gap: var(--sienna-space-1); }
.ui-list-dots span { display: inline-block; animation: ui-list-dot 1.1s ease-in-out infinite; }
.ui-list-dots span:nth-child(2) { animation-delay: .18s; }
.ui-list-dots span:nth-child(3) { animation-delay: .36s; }
@keyframes ui-list-dot { 0%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

/* ---- footer hints ---- */
.ui-list-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sienna-space-3);
  padding: var(--sienna-space-2) var(--sienna-space-3) 0;
  font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); color: var(--sienna-ink-3); }
.ui-list-foot:empty { display: none; }
`;

function injectListCss() {
  injectTokens();
  if (typeof document === 'undefined' || !document.head || document.getElementById('sienna-ui-list')) return;
  const st = document.createElement('style');
  st.id = 'sienna-ui-list';
  st.textContent = LIST_CSS;
  document.head.appendChild(st);
}

export function createList({
  label = 'Items',
  items = [],
  batchSize = 40,
  showIndex = false,
  showKind = true,
  showNowBadge = true,
  pinNowPlaying = false,
  footerHints = null,
  seed = 200,
  maxHeight = null,
  onPick = null,
  onActiveChange = null,
} = {}) {
  injectListCss();
  const id = ++listSeq;

  const root = document.createElement('div');
  root.className = 'ui-list';

  const scroll = document.createElement('div');
  scroll.className = 'ui-list-scroll';
  if (maxHeight) scroll.style.maxHeight = maxHeight;

  const listbox = document.createElement('ul');
  listbox.className = 'ui-list-rows';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', label);
  listbox.tabIndex = 0;

  const noteSlot = document.createElement('div');
  noteSlot.className = 'ui-list-note-slot';
  noteSlot.hidden = true;

  const foot = document.createElement('div');
  foot.className = 'ui-list-foot';

  scroll.append(listbox, noteSlot);
  root.append(scroll, foot);

  let data = [];
  let renderedCount = 0;
  let activeIdx = -1;
  let nowKey = null;
  let notePaper = null;
  let lastW = 0;
  let rafId = 0;
  let destroyed = false;

  const setHints = (hints) => {
    foot.replaceChildren();
    if (!hints || !hints.length) return;
    for (const h of hints) {
      const sp = document.createElement('span');
      sp.textContent = h;
      foot.appendChild(sp);
    }
  };
  if (footerHints) setHints(footerHints);

  const paintSlips = (force = false) => {
    if (destroyed) return;
    const w = Math.ceil(listbox.offsetWidth || scroll.clientWidth || root.offsetWidth);
    if (!w) return;
    if (!force && lastW > 0 && Math.abs(w - lastW) < PAPER_STEP) return;
    lastW = w;
    for (let i = 0; i < SLIP_SEEDS; i++) {
      root.style.setProperty(`--ui-slip-${i}`, `url(${getSlipUrl(w, seed + i * 13)})`);
    }
    root.style.setProperty('--ui-band-sel', `url(${getEdgeBandUrl('sel')})`);
    root.style.setProperty('--ui-band-now', `url(${getEdgeBandUrl('now')})`);
  };

  const schedulePaint = () => {
    if (destroyed || rafId) return;
    const w = Math.ceil(listbox.offsetWidth || scroll.clientWidth || root.offsetWidth);
    if (!w) return;
    if (lastW > 0 && Math.abs(w - lastW) < PAPER_STEP) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      paintSlips(false);
    });
  };

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => schedulePaint());
    ro.observe(root);
  }

  const isNowItem = (item) => {
    if (!item) return false;
    if (item.nowPlaying || item.selected) return true;
    if (nowKey == null) return false;
    return (item.id ?? item.videoId ?? item.play?.videoId) === nowKey;
  };

  const makeRow = (item, i, animate) => {
    const li = document.createElement('li');
    const isNow = isNowItem(item);
    li.id = `ui-list-${id}-opt-${i}`;
    li.className = `ui-list-row${animate ? ' is-entering' : ''}${isNow ? ' is-now' : ''}${isNow && pinNowPlaying ? ' is-pinned' : ''}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === activeIdx));
    if (i === activeIdx) li.classList.add('is-active');
    li.style.backgroundImage = `var(--ui-slip-${i % SLIP_SEEDS})`;
    if (animate) li.style.setProperty('--i', String(Math.min(i, 10)));

    const bandSel = document.createElement('span');
    bandSel.className = 'ui-list-band ui-list-band--sel';
    bandSel.setAttribute('aria-hidden', 'true');
    bandSel.style.backgroundImage = 'var(--ui-band-sel)';

    const bandNow = document.createElement('span');
    bandNow.className = 'ui-list-band ui-list-band--now';
    bandNow.setAttribute('aria-hidden', 'true');
    bandNow.style.backgroundImage = 'var(--ui-band-now)';

    li.append(bandSel, bandNow);

    if (showIndex) {
      const idxEl = document.createElement('span');
      idxEl.className = 'ui-list-idx';
      idxEl.textContent = isNow ? '♪' : String(item.track ?? item.displayIndex ?? (i + 1));
      li.appendChild(idxEl);
    }

    const cov = document.createElement('div');
    cov.className = 'ui-list-cover';
    if (item.art) {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.onerror = () => { cov.replaceChildren(); };
      paintedCoverURL(item.art).then((src) => {
        if (src && !destroyed) { img.src = src; cov.replaceChildren(img); }
      });
    }
    li.appendChild(cov);

    const txt = document.createElement('div');
    txt.className = 'ui-list-text';
    const titleEl = document.createElement('div');
    titleEl.className = 'ui-list-title';
    titleEl.textContent = item.title || 'Untitled';
    const subText = item.subtitle != null || item.artist != null || item.album != null
      ? [item.subtitle ?? item.artist, item.album && item.album !== item.title ? item.album : ''].filter(Boolean).join(' · ')
      : '';
    const subEl = document.createElement('div');
    subEl.className = 'ui-list-sub';
    subEl.textContent = subText;
    txt.append(titleEl, subEl);
    li.appendChild(txt);

    const right = document.createElement('div');
    right.className = 'ui-list-right';
    if (isNow && showNowBadge) {
      const badge = document.createElement('span');
      badge.className = 'ui-list-now-tag';
      badge.textContent = '♪ Now';
      right.appendChild(badge);
    }
    if (showKind && item.kind) {
      const kindEl = document.createElement('span');
      kindEl.className = 'ui-list-kind';
      kindEl.textContent = item.kind;
      right.appendChild(kindEl);
    }
    const metaText = item.meta ?? item.durationText ?? mmss(item.duration);
    if (metaText) {
      const metaEl = document.createElement('span');
      metaEl.className = 'ui-list-meta';
      metaEl.textContent = metaText;
      right.appendChild(metaEl);
    }
    li.appendChild(right);

    li.addEventListener('pointerenter', () => setActive(i, { scroll: false }));
    li.addEventListener('click', () => pick(i));

    return li;
  };

  listbox.addEventListener('animationend', (e) => {
    if (e.animationName === 'ui-list-rise') e.target.classList.remove('is-entering');
  });

  const appendBatch = (animate = false) => {
    if (renderedCount >= data.length) return 0;
    const end = Math.min(data.length, renderedCount + batchSize);
    const frag = document.createDocumentFragment();
    for (let i = renderedCount; i < end; i++) {
      frag.appendChild(makeRow(data[i], i, animate && i < 12));
    }
    listbox.appendChild(frag);
    const added = end - renderedCount;
    renderedCount = end;
    return added;
  };

  scroll.addEventListener('scroll', () => {
    if (renderedCount < data.length && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 240) {
      appendBatch(false);
    }
  }, { passive: true });

  const clearNote = () => {
    notePaper?.destroy();
    notePaper = null;
    noteSlot.replaceChildren();
    noteSlot.hidden = true;
    listbox.hidden = false;
  };

  function setNote(kind, message, { onRetry = null, retryLabel = 'Retry' } = {}) {
    clearNote();
    listbox.hidden = true;
    noteSlot.hidden = false;

    const note = document.createElement('div');
    note.className = `ui-list-note ui-list-note--${kind}`;
    note.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    const msgWrap = document.createElement('div');
    msgWrap.className = 'ui-list-note-msg';
    const text = document.createElement('span');
    text.textContent = String(message ?? '');
    msgWrap.appendChild(text);
    if (kind === 'loading') {
      const dots = document.createElement('span');
      dots.className = 'ui-list-dots';
      dots.setAttribute('aria-hidden', 'true');
      dots.innerHTML = '<span>.</span><span>.</span><span>.</span>';
      msgWrap.appendChild(dots);
    }
    note.appendChild(msgWrap);

    if (kind === 'error' && onRetry) {
      const retry = inkButton(retryLabel, { size: 'sm', onClick: () => onRetry() });
      note.appendChild(retry);
    }

    noteSlot.appendChild(note);
    notePaper = paperSurface(note, { seed: seed + 51, elevation: 'rest', amp: 4, cap: 8 });
    return note;
  }

  function setActive(idx, { scroll: reveal = true } = {}) {
    if (!data.length) {
      activeIdx = -1;
      listbox.removeAttribute('aria-activedescendant');
      return;
    }
    const clamped = idx < 0 ? -1 : Math.max(0, Math.min(data.length - 1, idx));
    while (clamped >= renderedCount && renderedCount < data.length) {
      appendBatch(false);
    }
    if (activeIdx >= 0 && listbox.children[activeIdx]) {
      listbox.children[activeIdx].classList.remove('is-active');
      listbox.children[activeIdx].setAttribute('aria-selected', 'false');
    }
    activeIdx = clamped;
    const row = activeIdx >= 0 ? listbox.children[activeIdx] : null;
    if (row) {
      row.classList.add('is-active');
      row.setAttribute('aria-selected', 'true');
      listbox.setAttribute('aria-activedescendant', row.id);
      if (reveal) row.scrollIntoView({ block: 'nearest' });
    } else {
      listbox.removeAttribute('aria-activedescendant');
    }
    onActiveChange?.(activeIdx, activeIdx >= 0 ? data[activeIdx] : null);
  }

  function pick(idx) {
    const target = idx >= 0 ? idx : 0;
    const item = data[target];
    if (!item) return;
    setActive(target, { scroll: false });
    onPick?.(item, target);
  }

  function handleKeyDown(e) {
    if (!data.length || listbox.hidden) return false;
    const pageStep = Math.max(1, Math.floor((scroll.clientHeight || ROW_H * 6) / ROW_H) - 1);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = activeIdx < 0 ? 0 : (activeIdx + 1) % data.length;
      setActive(next, { scroll: true });
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = activeIdx < 0 ? data.length - 1 : (activeIdx - 1 + data.length) % data.length;
      setActive(next, { scroll: true });
      return true;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setActive(0, { scroll: true });
      return true;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setActive(data.length - 1, { scroll: true });
      return true;
    }
    if (e.key === 'PageDown') {
      e.preventDefault();
      const next = activeIdx < 0 ? Math.min(data.length - 1, pageStep) : Math.min(data.length - 1, activeIdx + pageStep);
      setActive(next, { scroll: true });
      return true;
    }
    if (e.key === 'PageUp') {
      e.preventDefault();
      const next = activeIdx < 0 ? 0 : Math.max(0, activeIdx - pageStep);
      setActive(next, { scroll: true });
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(activeIdx >= 0 ? activeIdx : 0);
      return true;
    }
    return false;
  }

  listbox.addEventListener('keydown', handleKeyDown);

  function setItems(nextItems, { animate = true, active = -1, emptyMessage = 'Nothing here yet.' } = {}) {
    clearNote();
    data = Array.isArray(nextItems) ? nextItems : [];
    listbox.replaceChildren();
    scroll.scrollTop = 0;
    renderedCount = 0;
    activeIdx = -1;
    listbox.removeAttribute('aria-activedescendant');
    paintSlips(false);
    if (!data.length) {
      setNote('empty', emptyMessage);
      return;
    }
    appendBatch(animate);
    if (active >= 0 && active < data.length) setActive(active, { scroll: false });
  }

  function setNowPlaying(key) {
    nowKey = key;
    const rows = [...listbox.children];
    rows.forEach((row, i) => {
      const isNow = isNowItem(data[i]);
      row.classList.toggle('is-now', isNow);
      row.classList.toggle('is-pinned', isNow && pinNowPlaying);
      const idxEl = row.querySelector('.ui-list-idx');
      if (idxEl) idxEl.textContent = isNow ? '♪' : String(data[i]?.track ?? data[i]?.displayIndex ?? (i + 1));
    });
  }

  // Queue drawer-flight hook for Phase 4.
  function playDrawerFlight(origin, { entering = true } = {}) {
    if (!origin) return;
    const boxRect = scroll.getBoundingClientRect();
    const rows = [...listbox.children];
    const visible = rows.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom >= boxRect.top - 40 && r.top <= boxRect.bottom + 40;
    });
    visible.forEach((row, k) => {
      const r = row.getBoundingClientRect();
      row.style.setProperty('--fx', `${Math.round(origin.x - (r.left + r.width / 2))}px`);
      row.style.setProperty('--fy', `${Math.round(origin.y - (r.top + r.height / 2))}px`);
      row.classList.remove('is-entering', 'is-drawer-in', 'is-drawer-out');
      if (entering) {
        row.style.setProperty('--delay', `${Math.min(440, k * 36)}ms`);
        row.classList.add('is-drawer-in');
      } else {
        row.style.setProperty('--cdelay', `${Math.min(110, (visible.length - 1 - k) * 18)}ms`);
        row.classList.add('is-drawer-out');
      }
    });
  }

  if (items.length) setItems(items, { animate: false });

  return {
    el: root,
    scrollEl: scroll,
    listboxEl: listbox,
    setItems,
    setActive,
    getActive: () => activeIdx,
    getItems: () => data,
    getRenderedCount: () => renderedCount,
    getRows: () => [...listbox.children],
    setNowPlaying,
    setStale: (on) => root.classList.toggle('is-stale', !!on),
    setFooterHints: setHints,
    setNote,
    setLoading: (msg = 'Looking…') => setNote('loading', msg),
    setEmpty: (msg = 'Nothing found.') => setNote('empty', msg),
    setError: (msg = 'Could not load.', onRetry = null) => setNote('error', msg, { onRetry }),
    handleKeyDown,
    playDrawerFlight,
    repaint: (force = false) => paintSlips(force),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      ro?.disconnect();
      ro = null;
      clearNote();
    },
  };
}
