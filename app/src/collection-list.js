// Collection List overlay: styled like the oil-dab Search list (search.js), used when pressing the
// "Liked music" vinyl or any playlist / album with more than 15 songs.
//
// Features:
//   - Live search bar at the top (filters all songs instantaneously, even ~600+ liked songs)
//   - Field filter chips: All, Title, Artist, Album (Tab / Shift+Tab cycles them)
//   - Shuffle button (picks a random song from the filtered/full collection and enables shuffle)
//   - Progressive chunked rendering (40 slips per batch on scroll) so huge playlists open with zero lag
//
//   const colList = createCollectionList({ onPlay, onShuffle });
//   colList.open(collection, songsOrPromise)
//   colList.close()
//   colList.isOpen()
import { rng } from './rand.js';
import { FONT, onLettering } from './style.js';
import { COLORS, injectTokens } from './ui/tokens.js';
import { dabCluster, layoutDabCluster } from './brushpaint.js';
import { createBarPaint, slipMasks, MARGIN, SLIP_FRAMES } from './searchpaint.js';
import { paintedCoverURL } from './coverpaint.js';

const BAR_H = 88;
const SLIP_H = 66;
const SLIP_COATS = 5, HOT_COATS = 3;
const BATCH_SIZE = 40;

const CSS = `
.cl { position: fixed; top: 3.0vh; left: 50%; width: min(660px, 92vw); z-index: calc(var(--sienna-z-list) + 2); transform: translateX(-50%);
  pointer-events: none; visibility: hidden; font-family: var(--sienna-font); user-select: none; }
.cl.show { pointer-events: auto; visibility: visible; }
.cl.closing { visibility: visible; }
.cl-top { display: flex; align-items: center; justify-content: space-between; gap: var(--sienna-space-3); margin: 0 var(--sienna-space-6) -8px var(--sienna-space-6);
  position: relative; z-index: 2; opacity: 0; transform: translateY(-6px); transition: opacity var(--sienna-dur-mid) ease, transform var(--sienna-dur-mid) var(--sienna-ease-out); }
.cl.show .cl-top { opacity: 1; transform: none; }
.cl.closing .cl-top { opacity: 0; transform: translateY(-6px); transition: opacity var(--sienna-dur-fast) ease; }
.cl-badge { display: flex; align-items: center; gap: var(--sienna-space-3); padding: var(--sienna-space-1) var(--sienna-space-4) var(--sienna-space-1) var(--sienna-space-2); background: var(--sienna-indigo);
  color: var(--sienna-paper); border-radius: 3px; transform: rotate(var(--sienna-tilt-md)); box-shadow: var(--sienna-shadow-rest); max-width: 72%; }
.cl-bcov { flex: none; width: 32px; height: 32px; background: var(--sienna-paper-lo); overflow: hidden; transform: rotate(var(--sienna-tilt-lg)); }
.cl-bcov img { display: block; width: 100%; height: 100%; object-fit: cover; }
.cl-btitle { font-size: var(--sienna-text-lg); line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-bcount { flex: none; font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-variant-numeric: lining-nums tabular-nums; color: var(--sienna-paper-lo); white-space: nowrap; }
.cl-actions { display: flex; align-items: center; gap: var(--sienna-space-2); }
.cl-act { border: 0; background: var(--sienna-terracotta); color: var(--sienna-paper); font-family: var(--sienna-font); font-size: var(--sienna-text-md); line-height: 1;
  padding: var(--sienna-space-2) var(--sienna-space-4) var(--sienna-space-1); border-radius: 3px; cursor: pointer; transform: rotate(calc(var(--sienna-tilt-md) * -1));
  box-shadow: var(--sienna-shadow-rest); transition: transform var(--sienna-dur-fast), filter var(--sienna-dur-fast), background var(--sienna-dur-fast); white-space: nowrap; }
.cl-act:hover { transform: translateY(-2px) rotate(0deg); filter: brightness(1.08); }
.cl-act:active { transform: scale(.96); }
.cl-act.close { background: var(--sienna-paper-lo); color: var(--sienna-indigo); transform: rotate(var(--sienna-tilt-sm)); }
.cl-act.close:hover { background: var(--sienna-indigo); color: var(--sienna-paper); }
.cl-bar { position: relative; height: ${BAR_H}px; transform: rotate(var(--sienna-tilt-sm)); transform-origin: 20% 40%; }
.cl-fx { position: absolute; left: -${MARGIN}px; top: -${MARGIN}px; width: calc(100% + ${MARGIN * 2}px); height: ${BAR_H + MARGIN * 2}px; pointer-events: none; }
.cl-paper { position: absolute; left: var(--sienna-space-8); right: 50px; top: var(--sienna-space-4); bottom: var(--sienna-space-4); display: flex; align-items: center;
  padding: 0 var(--sienna-space-6) 0 var(--sienna-space-5); gap: var(--sienna-space-2); }
.cl-paper svg { flex: none; width: 30px; height: 30px; margin-top: 2px; }
.cl-input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: var(--sienna-text-xl)/1 var(--sienna-font); color: var(--sienna-ink); padding: var(--sienna-space-1) 0 2px;
  caret-color: var(--sienna-terracotta); letter-spacing: .01em; }
.cl-input::placeholder { color: var(--sienna-ink-3); opacity: 1; }
.cl-input::selection { background: rgba(166,68,47,.26); }
.cl-tabs { display: flex; align-items: center; justify-content: space-between; gap: var(--sienna-space-2); margin: -6px var(--sienna-space-6) var(--sienna-space-2) var(--sienna-space-6); pointer-events: auto; }
.cl-chips { display: flex; align-items: center; gap: var(--sienna-space-2); flex-wrap: wrap; }
.cl.closing .cl-tabs { opacity: 0; transition: opacity var(--sienna-dur-fast); }
.cl-tab { border: 0; background: var(--sienna-paper-lo); color: var(--sienna-ink-2); font-family: var(--sienna-font); font-size: var(--sienna-text-md);
  line-height: 1; padding: var(--sienna-space-1) var(--sienna-space-3) 3px; border-radius: 3px; cursor: pointer; transform: rotate(var(--sienna-tilt-sm));
  box-shadow: var(--sienna-shadow-rest); transition: background var(--sienna-dur-fast), color var(--sienna-dur-fast), transform var(--sienna-dur-fast); }
.cl-tab:nth-child(even) { transform: rotate(calc(var(--sienna-tilt-sm) * -1)); }
.cl-tab:hover { transform: translateY(-1px); color: var(--sienna-indigo); }
.cl-tab.on { background: var(--sienna-terracotta); color: var(--sienna-paper); }
.cl-list { margin: -6px 0 0 6px; padding: var(--sienna-space-3) var(--sienna-space-3) var(--sienna-space-6); width: calc(100% - 12px); box-sizing: border-box; list-style: none;
  max-height: calc(100vh - 3.0vh - ${BAR_H}px - 96px); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
  mask-image: linear-gradient(#000 calc(100% - 20px), transparent);
  scrollbar-width: thin; scrollbar-color: rgba(45,49,88,.45) transparent; }
.cl-list::-webkit-scrollbar { width: 6px; }
.cl-list::-webkit-scrollbar-thumb { background: rgba(45,49,88,.45); border-radius: 3px; }
.cl-slipwrap { --sx: -16px; margin-top: -7px; transform: rotate(var(--r)); cursor: pointer;
  mask-image: var(--mask-l); mask-repeat: no-repeat; mask-size: 100% ${SLIP_FRAMES * 100}%; }
.cl-slipwrap:nth-child(even) { --sx: 16px; mask-image: var(--mask-r); }
.cl.show .cl-slipwrap { --at: calc(var(--lead, 0ms) + var(--i) * 28ms);
  animation: cl-mask var(--sienna-dur-mid) steps(${SLIP_FRAMES}, jump-none) var(--at) both, cl-land var(--sienna-dur-mid) var(--sienna-ease-out) var(--at) both; }
.cl.closing .cl-slipwrap { animation: cl-mask var(--sienna-dur-fast) steps(${SLIP_FRAMES}, jump-none) var(--o, 0ms) reverse both, cl-lift var(--sienna-dur-fast) var(--sienna-ease-in) var(--o, 0ms) both; }
.cl:not(.show):not(.closing) .cl-slipwrap { animation: none; }
.cl .cl-slipwrap.set { animation: none; mask-image: none; }
@keyframes cl-mask { from { mask-position: 0 0%; } to { mask-position: 0 100%; } }
@keyframes cl-land { 0% { translate: var(--sx, -14px) -10px; scale: .92 .82; rotate: -1.6deg; } 55% { translate: 0 2px; scale: 1.015 1.05; rotate: .35deg; } 100% { translate: 0 0; scale: 1 1; rotate: 0deg; } }
@keyframes cl-lift { to { translate: 0 -10px; scale: 1 .86; opacity: 0; } }
.cl-slip { position: relative; height: ${SLIP_H}px; background-size: 100% 100%; display: flex; align-items: center; gap: var(--sienna-space-3);
  padding: 0 var(--sienna-space-8) 0 var(--sienna-space-5); color: var(--sienna-ink); transition: color var(--sienna-dur-fast); filter: drop-shadow(var(--sienna-shadow-rest)); }
.cl-hl { position: absolute; inset: 0; background-size: 100% 100%; opacity: 0; transition: opacity var(--sienna-dur-fast); pointer-events: none; }
.cl-slipwrap.on .cl-hl { opacity: 1; }
.cl-slipwrap.on .cl-slip { color: var(--sienna-paper); }
.cl-slipwrap.on .cl-a, .cl-slipwrap.on .cl-d, .cl-slipwrap.on .cl-n { color: var(--sienna-paper-lo); }
.cl-n { position: relative; flex: none; width: 28px; text-align: right; font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-variant-numeric: lining-nums tabular-nums; color: var(--sienna-ink-3); transition: color var(--sienna-dur-fast); }
.cl-cover { position: relative; flex: none; width: 44px; height: 44px; transform: rotate(var(--sienna-tilt-lg)); }
.cl-cover img, .cl-cover i { display: block; width: 100%; height: 100%; object-fit: cover; background: var(--sienna-paper-lo); }
.cl-txt { position: relative; flex: 1; min-width: 0; line-height: 1.08; }
.cl-t, .cl-a { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-t { font-size: var(--sienna-text-lg); }
.cl-a { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); line-height: 1.25; color: var(--sienna-ink-2); margin-top: 2px; transition: color var(--sienna-dur-fast); }
.cl-d { position: relative; flex: none; font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); font-variant-numeric: lining-nums tabular-nums; color: var(--sienna-ink-3); transition: color var(--sienna-dur-fast); }
.cl-note { position: relative; height: ${SLIP_H - 6}px; margin: 0 0 0 var(--sienna-space-3); display: flex; align-items: center; padding: 0 var(--sienna-space-10) 0 var(--sienna-space-8);
  color: var(--sienna-paper); font-size: var(--sienna-text-lg); background-size: 100% 100%; text-shadow: 0 0 1px rgba(248,241,226,.7); }
.cl-dots span { display: inline-block; animation: cl-dab 1.1s ease-in-out infinite; }
.cl-dots span:nth-child(2) { animation-delay: .18s; } .cl-dots span:nth-child(3) { animation-delay: .36s; }
@keyframes cl-dab { 0%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }
`;

const GLASS = `<svg viewBox="0 0 32 32" fill="none" stroke="${COLORS.indigo}" stroke-linecap="round"><filter id="cl-rough" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".38" numOctaves="2" seed="9"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter><g filter="url(#cl-rough)"><circle cx="13" cy="13" r="8.5" stroke-width="3.2"/><path d="M19.5 19.5 L28 28" stroke-width="4.2"/><path d="M9 11 Q10.5 8 13.5 7.5" stroke-width="1.6" opacity=".5"/></g></svg>`;

const FIELD_FILTERS = [
  ['all', 'All'],
  ['title', 'Title'],
  ['artist', 'Artist'],
  ['album', 'Album'],
];

const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

import { filterCollectionSongs } from './collection-filter.js';
export { filterCollectionSongs };

export function createCollectionList({ onPlay, onShuffle = null } = {}) {
  injectTokens();
  if (!document.getElementById('cl-css')) {
    const style = document.createElement('style');
    style.id = 'cl-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = document.createElement('div');
  root.className = 'cl';
  root.innerHTML = `
    <div class="cl-top">
      <div class="cl-badge">
        <div class="cl-bcov"></div>
        <div class="cl-btitle"></div>
        <div class="cl-bcount"></div>
      </div>
      <div class="cl-actions">
        <button type="button" class="cl-act shuffle" tabindex="-1" title="Shuffle and play">⇄ Shuffle</button>
        <button type="button" class="cl-act close" tabindex="-1" title="Close (Esc)">Close</button>
      </div>
    </div>
    <div class="cl-bar">
      <canvas class="cl-fx"></canvas>
      <div class="cl-paper">${GLASS}<input class="cl-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="filter songs" aria-label="Filter collection"></div>
    </div>
    <div class="cl-tabs"><div class="cl-chips"></div></div>
    <ul class="cl-list"></ul>
  `;
  document.body.appendChild(root);

  const bar = root.querySelector('.cl-bar');
  const paper = root.querySelector('.cl-paper');
  const input = root.querySelector('.cl-input');
  const chipsEl = root.querySelector('.cl-chips');
  const list = root.querySelector('.cl-list');
  const badgeCov = root.querySelector('.cl-bcov');
  const badgeTitle = root.querySelector('.cl-btitle');
  const badgeCount = root.querySelector('.cl-bcount');
  const shuffleBtn = root.querySelector('.cl-act.shuffle');
  const closeBtn = root.querySelector('.cl-act.close');

  const masks = slipMasks();
  root.style.setProperty('--mask-l', masks.fromLeft);
  root.style.setProperty('--mask-r', masks.fromRight);

  const paint = createBarPaint({
    canvas: root.querySelector('.cl-fx'),
    bar,
    input,
    glass: paper.querySelector('svg'),
    onClosed: () => root.classList.remove('closing'),
  });

  list.addEventListener('animationend', (e) => {
    if (e.animationName === 'cl-land' && root.classList.contains('show')) e.target.classList.add('set');
  });

  let paintedW = 0;
  const paintStrokes = () => {
    if (!isOpen) return;
    const w = Math.ceil(root.getBoundingClientRect().width || 0);
    if (!w || paintedW === w) return;
    paintedW = w;
    const slipW = Math.ceil((list.getBoundingClientRect().width || w - 12) - 24);
    const paperRect = { x: paper.offsetLeft, y: paper.offsetTop, w: paper.offsetWidth || w - 82, h: paper.offsetHeight || BAR_H - 32 };
    paint.setLayers({
      w, h: BAR_H, paperRect,
      inkDabs: layoutDabCluster(w, BAR_H, { tones: [COLORS.indigo], seed: 29, rows: 2, tilt: 0.05, overlap: 0.56, minCols: 4, impasto: 0.55, even: true }),
      paperDabs: layoutDabCluster(paperRect.w, paperRect.h, { tones: [COLORS.paper], seed: 11, rows: 2, tilt: 0.05, overlap: 0.56, minCols: 3, impasto: 0.28, soft: true }),
    });
    for (let i = 0; i < SLIP_COATS; i++) root.style.setProperty(`--slip${i}`, `url(${dabCluster(slipW, SLIP_H, { tones: [COLORS.paper], seed: 220 + i * 13, rows: 2, tilt: 0.05, overlap: 0.56, minCols: 4, impasto: 0.28, soft: true, solid: true })})`);
    for (let i = 0; i < HOT_COATS; i++) root.style.setProperty(`--hl${i}`, `url(${dabCluster(slipW, SLIP_H, { tones: [COLORS.terracotta], seed: 41 + i * 7, rows: 2, tilt: 0.05, overlap: 0.56, minCols: 4, impasto: 0.55, even: true, solid: true })})`);
    root.style.setProperty('--note', `url(${dabCluster(slipW - 10, SLIP_H - 6, { tones: [COLORS.indigo], seed: 53, rows: 2, tilt: 0.05, overlap: 0.56, minCols: 4, impasto: 0.55, even: true, solid: true })})`);
  };
  const fontReady = (document.fonts?.load(`36px ${FONT}`) ?? Promise.resolve()).then(paintStrokes, paintStrokes);
  new ResizeObserver(() => fontReady.then(paintStrokes)).observe(root);
  onLettering(root, () => { paintedW = 0; paintStrokes(); });

  // ---- state -----------------------------------------------------------------
  let isOpen = false;
  let seq = 0;
  let collection = null;
  let allSongs = [];
  let filtered = [];
  let renderedCount = 0;
  let field = 'all';
  let hl = -1;

  const chipBtns = {};
  FIELD_FILTERS.forEach(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cl-tab${id === field ? ' on' : ''}`;
    b.tabIndex = -1;
    b.textContent = label;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => setField(id));
    chipsEl.appendChild(b);
    chipBtns[id] = b;
  });

  function setField(next) {
    if (field === next) return;
    field = next;
    for (const [id, b] of Object.entries(chipBtns)) b.classList.toggle('on', id === field);
    input.placeholder = field === 'all' ? `filter ${collection?.title?.toLowerCase() || 'songs'}` : `filter by ${field}`;
    applyFilter();
  }

  function setHl(i, reveal = false) {
    hl = i;
    // ensure highlighted item is rendered if keyboard navigated near bottom
    while (hl >= renderedCount && renderedCount < filtered.length) appendBatch(false);
    [...list.children].forEach((el, k) => el.classList.toggle('on', k === i));
    if (reveal && i >= 0) list.children[i]?.scrollIntoView({ block: 'nearest' });
  }

  function note(text, { dots = false } = {}) {
    list.innerHTML = `<li class="cl-slipwrap" style="--i:0;--r:-.6deg;--lead:${paint.lead()}ms"><div class="cl-note" style="background-image:var(--note)"><span></span></div></li>`;
    const box = list.querySelector('.cl-note');
    box.firstChild.textContent = text;
    if (dots) {
      const d = document.createElement('span');
      d.className = 'cl-dots';
      d.innerHTML = '<span>.</span><span>.</span><span>.</span>';
      box.appendChild(d);
    }
  }

  function makeSlip(item, i, animate) {
    const r = rng(130 + i * 17);
    const li = document.createElement('li');
    li.className = animate ? 'cl-slipwrap' : 'cl-slipwrap set';
    li.style.setProperty('--i', Math.min(i, 10));
    li.style.setProperty('--lead', `${paint.lead()}ms`);
    li.style.setProperty('--r', `${((r() - 0.5) * 1.6).toFixed(2)}deg`);
    li.style.marginLeft = `${Math.round((r() - 0.5) * 12)}px`;
    li.style.marginRight = `${Math.round(r() * 10)}px`;

    const slip = document.createElement('div');
    slip.className = 'cl-slip';
    slip.style.backgroundImage = `var(--slip${i % SLIP_COATS})`;
    slip.innerHTML = `<div class="cl-hl" style="background-image:var(--hl${i % HOT_COATS})"></div><span class="cl-n"></span><div class="cl-cover"></div><div class="cl-txt"><div class="cl-t"></div><div class="cl-a"></div></div><div class="cl-d"></div>`;
    slip.querySelector('.cl-n').textContent = String(item.track ?? (i + 1));

    const cover = slip.querySelector('.cl-cover');
    if (item.art) {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.onerror = () => { cover.innerHTML = '<i></i>'; };
      cover.innerHTML = '<i></i>';
      paintedCoverURL(item.art).then((src) => { if (src) { img.src = src; cover.replaceChildren(img); } });
    } else cover.innerHTML = '<i></i>';

    slip.querySelector('.cl-t').textContent = item.title || 'Untitled';
    slip.querySelector('.cl-a').textContent = [item.subtitle, item.album && item.album !== item.title ? item.album : ''].filter(Boolean).join(' · ');
    slip.querySelector('.cl-d').textContent = mmss(item.duration);

    li.appendChild(slip);
    li.addEventListener('mouseenter', () => setHl(i));
    li.addEventListener('mousemove', () => hl !== i && setHl(i));
    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => pick(i));
    return li;
  }

  function appendBatch(animate = false) {
    const end = Math.min(filtered.length, renderedCount + BATCH_SIZE);
    const frag = document.createDocumentFragment();
    for (let i = renderedCount; i < end; i++) {
      frag.appendChild(makeSlip(filtered[i], i, animate && i < 14));
    }
    list.appendChild(frag);
    renderedCount = end;
  }

  function updateCount() {
    if (!allSongs.length) { badgeCount.textContent = ''; return; }
    badgeCount.textContent = filtered.length === allSongs.length
      ? `${allSongs.length} songs`
      : `${filtered.length} of ${allSongs.length}`;
  }

  function applyFilter(animate = false) {
    filtered = filterCollectionSongs(allSongs, input.value, field);
    updateCount();
    list.innerHTML = '';
    list.scrollTop = 0;
    renderedCount = 0;
    hl = -1;
    if (!filtered.length) {
      note(allSongs.length ? 'no matching songs' : 'no songs found');
      return;
    }
    appendBatch(animate);
  }

  // Load more batches seamlessly as user scrolls down large playlists (e.g. ~600 Liked Music songs)
  list.addEventListener('scroll', () => {
    if (renderedCount < filtered.length && list.scrollTop + list.clientHeight >= list.scrollHeight - 280) {
      appendBatch(false);
    }
  }, { passive: true });

  function pick(i) {
    const item = filtered[i];
    if (!item) return;
    close();
    onPlay?.(item, collection);
  }

  function triggerShuffle() {
    const pool = filtered.length ? filtered : allSongs;
    if (!pool.length) return;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    close();
    if (onShuffle) onShuffle(chosen, collection, pool);
    else onPlay?.(chosen, collection);
  }

  shuffleBtn.addEventListener('mousedown', (e) => e.preventDefault());
  shuffleBtn.addEventListener('click', (e) => { e.stopPropagation(); triggerShuffle(); });
  closeBtn.addEventListener('mousedown', (e) => e.preventDefault());
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });

  // ---- input & keyboard ------------------------------------------------------
  input.addEventListener('input', () => applyFilter(false));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (input.value) { input.value = ''; applyFilter(false); }
      else close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const idx = FIELD_FILTERS.findIndex(([id]) => id === field);
      setField(FIELD_FILTERS[(idx + (e.shiftKey ? -1 : 1) + FIELD_FILTERS.length) % FIELD_FILTERS.length][0]);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!filtered.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setHl(hl < 0 ? (d > 0 ? 0 : filtered.length - 1) : (hl + d + filtered.length) % filtered.length, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length) pick(hl >= 0 ? hl : 0);
    }
  });
  for (const type of ['keyup', 'keypress']) input.addEventListener(type, (e) => e.stopPropagation());
  input.addEventListener('blur', () => {
    if (isOpen) setTimeout(() => isOpen && document.hasFocus() && input.focus({ preventScroll: true }), 0);
  });

  // ---- open / close ----------------------------------------------------------
  async function open(col, songsOrPromise) {
    const mine = ++seq;
    collection = col;
    field = 'all';
    for (const [id, b] of Object.entries(chipBtns)) b.classList.toggle('on', id === field);
    input.value = '';
    input.placeholder = `filter ${(col?.title || 'songs').toLowerCase()}`;
    badgeTitle.textContent = col?.title || 'Collection';
    badgeCount.textContent = '';
    badgeCov.innerHTML = '';
    if (col?.art) {
      const img = new Image();
      img.alt = '';
      paintedCoverURL(col.art).then((src) => { if (src && mine === seq) { img.src = src; badgeCov.replaceChildren(img); } });
    }

    if (!isOpen) {
      isOpen = true;
      root.classList.remove('closing');
      root.classList.add('show');
      paintStrokes();
      fontReady.then(paintStrokes);
      paint.play(true);
    }
    input.focus({ preventScroll: true });

    if (Array.isArray(songsOrPromise)) {
      allSongs = songsOrPromise;
      applyFilter(true);
      return;
    }

    allSongs = [];
    filtered = [];
    note(`opening ${col?.title || 'songs'}`, { dots: true });
    try {
      const loaded = await songsOrPromise;
      if (mine !== seq || !isOpen) return;
      allSongs = Array.isArray(loaded) ? loaded : [];
      applyFilter(true);
    } catch {
      if (mine !== seq || !isOpen) return;
      note('could not load songs');
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    seq++;
    const box = list.getBoundingClientRect();
    const seen = [...list.children].filter((el) => { const b = el.getBoundingClientRect(); return b.bottom > box.top && b.top < box.bottom; });
    const step = Math.min(20, 120 / (seen.length || 1));
    seen.forEach((el, k) => el.style.setProperty('--o', `${Math.round((seen.length - 1 - k) * step)}ms`));
    for (const el of list.children) el.classList.remove('set');
    root.classList.replace('show', 'closing');
    paint.play(false);
    input.blur();
  }

  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.target !== input) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
  }, true);
  window.addEventListener('pointerdown', (e) => {
    if (isOpen && !root.contains(e.target)) close();
  }, true);

  return {
    open,
    close,
    isOpen: () => isOpen,
    ready: () => fontReady,
  };
}
