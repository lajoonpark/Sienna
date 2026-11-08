// Search bar. Opens with Option+Cmd+S (macOS) or Ctrl+Alt+S: a swipe of cream paint on a swipe of indigo,
// top centre, with the results brushed in under it row by row, the chosen one painted over in terracotta.
// All of it is laid with the shop's brush (brushpaint.js). The bar is slapped on and flicked off as paint
// (searchpaint.js); the results follow in zigzag, one row each way, as a painter's arm goes.
//
//   const search = createSearch({ music, onPlay, suggest });   // music.search(q) -> Promise<items>
//   search.open() / close() / toggle() / isOpen()
//   searchOpen()   is any search bar open (for the wheel-for-volume handlers: while it is, the wheel scrolls the slips)
//
// suggest (optional, the mini window): async () => ({ title, items }), shown while the box is empty
// (the "Listen again" shelf there). The slips scroll when there are more than fit.
//
// onPlay(item) is called with the chosen song (the same item shape as a rack item), then the bar closes.
// While it is open it swallows every key (so the shop's hotkeys and Tab stay quiet) and re-grabs focus
// if anything steals it. Create it before the shop registers its own key handlers, or have those
// handlers check search.isOpen().
//
// Shot hooks (location.search): ?search=lemon opens it with that query, ?searchhl=N highlights slip N.
import { rng } from './rand.js';
import { FONT } from './style.js';
import { INK, PAPER } from './controls.js';
import { brushBand, brushBandCanvas, TONES } from './brushpaint.js';
import { createBarPaint, slipMasks, MARGIN, SLIP_FRAMES } from './searchpaint.js';
import { paintedCoverURL } from './coverpaint.js';

const HOT = '#b4503a';           // terracotta on the chosen slip
const DEBOUNCE = 250;
const MAX_SLIPS = 20;          // the slips scroll
const BAR_H = 88;
const SLIP_H = 66;
const SLIP_COATS = 5, HOT_COATS = 3;   // rows take turns with a few painted swipes: they are slow to paint, quick to reuse

const CSS = `
.cs { position: fixed; top: 3.2vh; left: 50%; width: min(640px, 92vw); z-index: 60; transform: translateX(-50%);
  pointer-events: none; visibility: hidden; font-family: ${FONT}; user-select: none; }
.cs.show { pointer-events: auto; visibility: visible; }
.cs.closing { visibility: visible; }
.cs-bar { position: relative; height: ${BAR_H}px; transform: rotate(-.6deg); transform-origin: 20% 40%; }
.cs-fx { position: absolute; left: -${MARGIN}px; top: -${MARGIN}px; width: calc(100% + ${MARGIN * 2}px); height: ${BAR_H + MARGIN * 2}px; pointer-events: none; }
.cs-paper { position: absolute; left: 32px; right: 50px; top: 16px; bottom: 16px; display: flex; align-items: center;
  padding: 0 26px 0 22px; gap: 8px; }
.cs-paper svg { flex: none; width: 32px; height: 32px; margin-top: 2px; }
.cs-input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 38px/1 ${FONT}; color: #2b2436; padding: 6px 0 2px;
  caret-color: ${HOT}; letter-spacing: .01em; }
.cs-input::placeholder { color: #a8957c; }
.cs-input::selection { background: rgba(180,80,58,.28); }
.cs-list { margin: -10px 0 0 6px; padding: 12px 12px 18px; width: calc(100% - 12px); box-sizing: border-box; list-style: none; transition: opacity .2s;
  max-height: calc(100vh - 3.2vh - ${BAR_H}px - var(--cs-bottom, 16px)); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
  mask-image: linear-gradient(#000 calc(100% - 20px), transparent);
  scrollbar-width: thin; scrollbar-color: rgba(45,49,88,.45) transparent; }
.cs-list::-webkit-scrollbar { width: 6px; } .cs-list::-webkit-scrollbar-thumb { background: rgba(45,49,88,.45); border-radius: 3px; }
.cs-head { position: relative; display: inline-block; margin: 0 0 4px 22px; padding: 4px 26px 4px 18px; color: ${PAPER}; font-size: 26px;
  background-size: 100% 100%; background-image: var(--note); transform: rotate(-1.2deg); }
.cs.show .cs-head { animation: cs-head .34s cubic-bezier(.2,.8,.3,1) var(--lead, 0ms) both; }
.cs.closing .cs-head { animation: cs-lift .16s ease-in both; }
.cs-head[hidden] { display: none; }
.cs-list.stale { opacity: .55; }
.cs-slipwrap { --sx: -16px; margin-top: -7px; transform: rotate(var(--r)); cursor: pointer;
  mask-image: var(--mask-l); mask-repeat: no-repeat; mask-size: 100% ${SLIP_FRAMES * 100}%; }
.cs-slipwrap:nth-child(even) { --sx: 16px; mask-image: var(--mask-r); }
.cs.show .cs-slipwrap { --at: calc(var(--lead, 0ms) + var(--i) * 34ms);
  animation: cs-mask .26s steps(${SLIP_FRAMES - 1}, jump-none) var(--at) both, cs-land .34s cubic-bezier(.2,.8,.3,1) var(--at) both; }
.cs.closing .cs-slipwrap { animation: cs-mask .17s steps(${SLIP_FRAMES - 1}, jump-none) var(--o, 0ms) reverse both, cs-lift .17s ease-in var(--o, 0ms) both; }
.cs:not(.show):not(.closing) .cs-slipwrap { animation: none; }
.cs .cs-slipwrap.set { animation: none; mask-image: none; }
@keyframes cs-mask { from { mask-position: 0 0%; } to { mask-position: 0 100%; } }
@keyframes cs-land { 0% { translate: var(--sx, -16px) -9px; scale: 1 .8; rotate: -1.6deg; } 55% { translate: 0 2px; scale: 1 1.07; rotate: .4deg; } 100% { translate: 0 0; scale: 1 1; rotate: 0deg; } }
@keyframes cs-head { 0% { opacity: 0; translate: -16px -9px; scale: 1 .8; } 55% { opacity: 1; translate: 0 2px; scale: 1 1.07; } 100% { translate: 0 0; scale: 1 1; } }   /* no mask to hide it while it waits */
@keyframes cs-lift { to { translate: 0 -10px; scale: 1 .86; opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .cs .cs-slipwrap, .cs .cs-head { animation: none !important; mask-image: none; } }
.cs-slip { position: relative; height: ${SLIP_H}px; background-size: 100% 100%; display: flex; align-items: center; gap: 14px;
  padding: 0 34px 0 22px; color: #2b2436; transition: color .15s; }
.cs-hl { position: absolute; inset: 0; background-size: 100% 100%; opacity: 0; transition: opacity .18s; pointer-events: none; }
.cs-slipwrap.on .cs-hl { opacity: 1; }
.cs-slipwrap.on .cs-slip { color: ${PAPER}; }
.cs-slipwrap.on .cs-a, .cs-slipwrap.on .cs-d { color: rgba(251,245,232,.85); }
.cs-cover { position: relative; flex: none; width: 46px; height: 46px; transform: rotate(-2.5deg); }
.cs-cover img, .cs-cover i { display: block; width: 100%; height: 100%; object-fit: cover; background: #d9cbb2; }
.cs-txt { position: relative; flex: 1; min-width: 0; line-height: 1; }
.cs-t, .cs-a { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cs-t { font-size: 28px; }
.cs-a { font-size: 19px; color: #7a5a40; margin-top: 3px; transition: color .15s; }
.cs-d { position: relative; flex: none; font-size: 20px; color: #7a5a40; transition: color .15s; }
.cs-note { position: relative; height: ${SLIP_H - 6}px; margin: 0 0 0 10px; display: flex; align-items: center; padding: 0 44px 0 34px;
  color: ${PAPER}; font-size: 32px; background-size: 100% 100%; text-shadow: 0 0 1px rgba(251,245,232,.7); }
.cs-dots span { display: inline-block; animation: cs-dab 1.1s ease-in-out infinite; }
.cs-dots span:nth-child(2) { animation-delay: .18s; } .cs-dots span:nth-child(3) { animation-delay: .36s; }
@keyframes cs-dab { 0%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }
`;

const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

// A tiny brushed magnifying glass, in indigo.
const GLASS = `<svg viewBox="0 0 32 32" fill="none" stroke="${INK}" stroke-linecap="round"><filter id="cs-rough" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".38" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter><g filter="url(#cs-rough)"><circle cx="13" cy="13" r="8.5" stroke-width="3.2"/><path d="M19.5 19.5 L28 28" stroke-width="4.2"/><path d="M9 11 Q10.5 8 13.5 7.5" stroke-width="1.6" opacity=".5"/></g></svg>`;

let openCount = 0;
export const searchOpen = () => openCount > 0;

export function createSearch({ music, onPlay, suggest = null }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'cs';
  root.innerHTML = `<div class="cs-bar"><canvas class="cs-fx"></canvas><div class="cs-paper">${GLASS}<input class="cs-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="search songs" aria-label="Search songs"></div></div><div class="cs-head" hidden></div><ul class="cs-list"></ul>`;
  document.body.appendChild(root);
  const bar = root.querySelector('.cs-bar');
  const paper = root.querySelector('.cs-paper');
  const input = root.querySelector('.cs-input');
  const list = root.querySelector('.cs-list');
  const head = root.querySelector('.cs-head');
  const masks = slipMasks();
  root.style.setProperty('--mask-l', masks.fromLeft);
  root.style.setProperty('--mask-r', masks.fromRight);
  const paint = createBarPaint({
    canvas: root.querySelector('.cs-fx'), bar, input,
    glass: paper.querySelector('svg'),
    onClosed: () => root.classList.remove('closing'),
  });
  // a slip has done its arriving: drop the mask, which would otherwise be redrawn with every hover
  list.addEventListener('animationend', (e) => {
    if (e.animationName === 'cs-land' && root.classList.contains('show')) e.target.classList.add('set');
  });

  // The paint is drawn to the final size once the brush font is in (sizes follow the window).
  let paintedW = 0;
  const paintStrokes = () => {
    const w = Math.ceil(root.getBoundingClientRect().width || 0);
    if (!w || paintedW === w) return;
    paintedW = w;
    const slipW = Math.ceil((list.getBoundingClientRect().width || w - 12) - 24);
    const paperRect = { x: paper.offsetLeft, y: paper.offsetTop, w: paper.offsetWidth || w - 82, h: paper.offsetHeight || BAR_H - 32 };
    paint.setLayers({
      w, h: BAR_H, paperRect,
      ink: brushBandCanvas(w, BAR_H, { tones: TONES.ink, seed: 21, rows: 3 }),
      paper: brushBandCanvas(paperRect.w, paperRect.h, { tones: TONES.paper, seed: 5, rows: 2 }),
    });
    for (let i = 0; i < SLIP_COATS; i++) root.style.setProperty(`--slip${i}`, `url(${brushBand(slipW, SLIP_H, { tones: TONES.paper, seed: 200 + i * 13, rows: 2 })})`);
    for (let i = 0; i < HOT_COATS; i++) root.style.setProperty(`--hl${i}`, `url(${brushBand(slipW, SLIP_H, { tones: TONES.hot, seed: 33 + i * 7, rows: 2 })})`);
    root.style.setProperty('--note', `url(${brushBand(slipW - 10, SLIP_H - 6, { tones: TONES.ink, seed: 47, rows: 2 })})`);
  };
  const fontReady = (document.fonts?.load(`38px ${FONT}`) ?? Promise.resolve()).then(paintStrokes, paintStrokes);
  new ResizeObserver(() => fontReady.then(paintStrokes)).observe(root);

  // ---- state -----------------------------------------------------------------
  let isOpen = false;
  let seq = 0;            // bumped on every keystroke and every search: a response only counts if it is still the latest
  let timer = 0;
  let shown = [];         // items on the slips
  let shownFor = null;    // the query those items answer
  let hl = -1;
  let pendingEnter = false;
  const cache = new Map();

  function setHl(i, reveal = false) {
    hl = i;
    [...list.children].forEach((el, k) => el.classList.toggle('on', k === i));
    if (reveal && i >= 0) list.children[i]?.scrollIntoView({ block: 'nearest' });
  }

  function note(html) {
    head.hidden = true;
    list.className = 'cs-list';
    list.innerHTML = `<li class="cs-slipwrap" style="--i:0;--r:-.6deg;--lead:${paint.lead()}ms"><div class="cs-note" style="background-image:var(--note)">${html}</div></li>`;
  }

  function render(items, title = null) {
    shown = items.slice(0, MAX_SLIPS);
    head.hidden = !title;
    head.textContent = title ?? '';
    head.style.setProperty('--lead', `${paint.lead()}ms`);
    list.className = 'cs-list';
    list.innerHTML = '';
    list.scrollTop = 0;
    if (!shown.length) { note('nothing found'); hl = -1; return; }
    shown.forEach((item, i) => {
      const r = rng(100 + i * 17);
      const li = document.createElement('li');
      li.className = 'cs-slipwrap';
      li.style.setProperty('--i', Math.min(i, 10));   // what is past the fold need not wait its turn
      li.style.setProperty('--lead', `${paint.lead()}ms`);
      li.style.setProperty('--r', `${((r() - 0.5) * 1.8).toFixed(2)}deg`);
      li.style.marginLeft = `${Math.round((r() - 0.5) * 14)}px`;
      li.style.marginRight = `${Math.round(r() * 12)}px`;
      const slip = document.createElement('div');
      slip.className = 'cs-slip';
      slip.style.backgroundImage = `var(--slip${i % SLIP_COATS})`;
      slip.innerHTML = `<div class="cs-hl" style="background-image:var(--hl${i % HOT_COATS})"></div><div class="cs-cover"></div><div class="cs-txt"><div class="cs-t"></div><div class="cs-a"></div></div><div class="cs-d"></div>`;
      const cover = slip.querySelector('.cs-cover');
      if (item.art) {
        const img = new Image();
        img.alt = '';
        img.decoding = 'async';
        img.onerror = () => { cover.innerHTML = '<i></i>'; };
        cover.innerHTML = '<i></i>'; // blank paper until the painted copy is ready
        paintedCoverURL(item.art).then((src) => { img.src = src; cover.replaceChildren(img); });
      } else cover.innerHTML = '<i></i>';
      slip.querySelector('.cs-t').textContent = item.title;
      slip.querySelector('.cs-a').textContent = [item.subtitle, item.album && item.album !== item.title ? item.album : ''].filter(Boolean).join(' · ');
      slip.querySelector('.cs-d').textContent = mmss(item.duration);
      li.appendChild(slip);
      li.addEventListener('mouseenter', () => setHl(i));
      li.addEventListener('mousemove', () => hl !== i && setHl(i)); // after a scroll moved another slip under a still cursor
      li.addEventListener('mousedown', (e) => e.preventDefault()); // keep the typing focus
      li.addEventListener('click', () => pick(i));
      list.appendChild(li);
    });
    setHl(-1);
  }

  function pick(i) {
    const item = shown[i];
    if (!item) return;
    close();
    onPlay(item);
  }

  function apply(items, q) {
    shownFor = q;
    render(items);
    if (pendingEnter) { pendingEnter = false; if (shown.length) pick(0); }
  }

  // the empty box: the suggestions (mini window), or nothing
  async function showSuggestions() {
    shown = []; shownFor = null; list.innerHTML = ''; head.hidden = true; pendingEnter = false;
    if (!suggest) return;
    const mine = ++seq;
    try {
      const s = await suggest();
      if (mine !== seq || input.value.trim() || !isOpen || !s?.items?.length) return;
      render(s.items, s.title);
    } catch (e) { console.warn('[sienna] suggestions failed', e); }
  }

  async function run() {
    const q = input.value.trim();
    if (!q) return showSuggestions();
    if (cache.has(q)) { seq++; apply(cache.get(q), q); return; }
    const mine = ++seq;
    if (!shown.length) note(`looking<span class="cs-dots"><span>.</span><span>.</span><span>.</span></span>`);
    try {
      const items = await music.search(q);
      if (mine !== seq) return; // typed on since: this answer is for an older query
      cache.set(q, items);
      apply(items, q);
    } catch (e) {
      if (mine !== seq) return;
      console.warn('[sienna] search failed', e);
      pendingEnter = false;
      note('could not search');
    }
  }

  // ---- input -----------------------------------------------------------------
  input.addEventListener('input', () => {
    seq++;
    clearTimeout(timer);
    pendingEnter = false;
    if (!input.value.trim()) { run(); return; }
    if (shown.length) list.classList.add('stale');
    timer = setTimeout(run, DEBOUNCE);
  });

  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // the shop never sees keys typed here
    if (isToggle(e)) return; // handled by the window listener below
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setHl(hl < 0 ? (d > 0 ? 0 : shown.length - 1) : (hl + d + shown.length) % shown.length, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) { if (shown.length && hl >= 0) pick(hl); return; } // a suggestion chosen with the arrows
      if (shownFor === q && shown.length) pick(hl >= 0 ? hl : 0);
      else { pendingEnter = true; clearTimeout(timer); run(); } // play the top result as soon as it arrives
    }
  });
  for (const type of ['keyup', 'keypress']) input.addEventListener(type, (e) => e.stopPropagation());
  // Anything that steals the focus while the bar is open (a click on the painting) hands it back.
  input.addEventListener('blur', () => { if (isOpen) setTimeout(() => isOpen && document.hasFocus() && input.focus({ preventScroll: true }), 0); }); // not when the whole window lost focus (switching apps)

  // ---- open / close ------------------------------------------------------------
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  function isToggle(e) {
    return e.code === 'KeyS' && e.altKey && (isMac ? e.metaKey : e.ctrlKey); // Option changes e.key on a Mac, so e.code
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    fontReady.then(paintStrokes);
    root.classList.remove('closing');
    root.classList.add('show');
    paint.play(true);
    for (const el of [head, ...list.children]) el.style.setProperty('--lead', `${paint.lead()}ms`);   // what is already there waits for the bar to land
    input.focus({ preventScroll: true });
    input.select();
    openCount++;
    if (!input.value.trim()) showSuggestions();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(timer);
    seq++; // answers still on their way are dropped
    pendingEnter = false;
    // bottom row first, in the time the bar takes to go; only the rows on screen count
    const box = list.getBoundingClientRect();
    const seen = [...list.children].filter((el) => { const b = el.getBoundingClientRect(); return b.bottom > box.top && b.top < box.bottom; });
    const step = Math.min(24, 130 / (seen.length || 1));
    seen.forEach((el, k) => el.style.setProperty('--o', `${Math.round((seen.length - 1 - k) * step)}ms`));
    for (const el of list.children) el.classList.remove('set');
    root.classList.replace('show', 'closing');
    paint.play(false);
    input.blur();
    openCount--;
  }

  // The hotkey, in the capture phase so nothing in the shop sees it. While open, any key that is not
  // going to the input (focus lost) is swallowed too.
  window.addEventListener('keydown', (e) => {
    if (isToggle(e)) {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) (isOpen ? close : open)();
    } else if (isOpen && e.target !== input) {
      e.stopPropagation();
      if (e.key === 'Escape') close();
    }
  }, true);
  // A click anywhere outside the bar puts it away (the click still reaches the shop).
  window.addEventListener('pointerdown', (e) => { if (isOpen && !root.contains(e.target)) close(); }, true);

  // ---- screenshot hooks ----------------------------------------------------------
  const params = new URLSearchParams(location.search);
  if (params.has('search')) {
    input.value = params.get('search');
    open();
    run().then(() => { if (params.has('searchhl')) setHl(Number(params.get('searchhl'))); });
  }

  return { open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen, ready: () => fontReady };
}
