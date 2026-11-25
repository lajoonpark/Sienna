import { setOverlayOpen } from './ui/sheet.js';
import { shortcuts } from './shortcuts.js';
import { createList } from './ui/list.js';
import { createCoverCarousel } from './ui/cover-carousel.js';
import { segmented, inkButton } from './ui/inputs.js';
import { createListBar, createListVeil } from './list-bar.js';
import { paperSurface } from './ui/paper.js';
import { unrollSheet } from './ui/unroll.js';
import { MOTION } from './ui/tokens.js';
import { settings } from './settings.js';

const FILTERS = ['songs', 'albums', 'playlists', 'artists'];
const DEBOUNCE = 250;
const STRIP_LIMIT = 5;
const SHORTCUT_NAMES = ['search', 'app', 'mini'];
const STRIP_CHORDS = ['Alt', 'Shift', 'Alt+Shift', 'Control+Shift'].map(label => ({
  label, code: 'ArrowUp',
  altKey: label.includes('Alt'), shiftKey: label.includes('Shift'),
  ctrlKey: label.includes('Control'), metaKey: false,
}));
const STRIP_CSS = `
.cs:has(> .la-full:not([hidden])) {
  inset: var(--sienna-space-2); width: auto; height: 100dvh;
  max-height: calc(100dvh - 2 * var(--sienna-space-2)); transform: none; padding-block: var(--sienna-space-2);
  display: grid; grid-template: auto auto minmax(0, 1fr) / minmax(0, 1fr); }
.cs:has(> .la-full:not([hidden])) > .cs-head, .cs > .la-full { grid-area: 3 / 1; }
.cs:has(> .la-full:not([hidden])) > .cs-head {
  align-self: start; justify-self: start; z-index: 2; pointer-events: none; }
.cs:has(> .la-full:not([hidden])) > .cs-head > span {
  background: var(--sienna-paper); padding-inline: var(--sienna-space-1); border-radius: var(--sienna-space-1); }
/* While the sheet rolls up to the strip, the list collapses first, then the paper clips the covers. */
.cs > .cs-result-strip { flex: 0 0.00001 auto; min-height: 0; margin-bottom: var(--sienna-space-2); }
.cs-result-strip .la-wheel { flex: 0 0 clamp(64px, 16dvh, 116px); }
.cs-result-strip .la-cover { --cover-size: min(108px, 26cqw, 92cqh); }
.cs-result-strip .la-details { padding-top: 0; }
.cs-result-strip.is-active .la-wheel { outline: 1px solid var(--sienna-indigo); outline-offset: -1px; }
.cs-result-strip .ui-list-foot { white-space: normal; }
`;
let openCount = 0;
export const searchOpen = () => openCount > 0;

export function createSearch({ music, onPlay, suggest = null, coverSuggestions = false, coverDrawer = null, onOpenCollection = null }) {
  const root = document.createElement('div'); root.className = 'cs list-overlay';
  const veil = createListVeil(() => close());
  const bar = createListBar({ prefix: 'cs', label: 'Search', placeholder: 'search songs', onClosed: () => root.classList.remove('closing') });
  const input = bar.input;
  const head = document.createElement('div'); head.className = 'cs-head'; head.hidden = true;
  head.style.cssText = 'display:flex;align-items:center;gap:var(--sienna-space-2);padding:var(--sienna-space-2) var(--sienna-space-4);font-size:var(--sienna-text-lg);color:var(--sienna-ink)';
  const heading = document.createElement('span');
  const back = inkButton('Back', { icon: 'back', onClick: () => goBack() });
  head.append(back, heading);
  const tabs = segmented(FILTERS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })), {
    value: 'songs', role: 'tabs', label: 'Search for', onChange: setFilter,
  });
  const list = createList({ label: 'Search results', showKind: true, lines: true,
    footerHints: ['↑↓ choose · Enter play · Tab type · Esc close'], onPick: (_, i) => pick(i),
    onActiveChange: () => { if (stripActive) setStripActive(false); else syncActive(); },
  });
  const carousel = coverSuggestions && suggest ? createCoverCarousel({ fullSize: true, onPick: i => pick(i, true), onActiveChange: syncActive, drawer: coverDrawer }) : null;
  const resultStrip = createCoverCarousel({
    orientation: 'horizontal', onPick: i => pick(i),
    onActiveChange: source => { if (source === 'wheel') setStripActive(true); else syncActive(); },
  });
  resultStrip.el.classList.add('cs-result-strip');
  resultStrip.listboxEl.tabIndex = -1;
  if (!document.getElementById('sienna-search-strip')) {
    const style = document.createElement('style');
    style.id = 'sienna-search-strip'; style.textContent = STRIP_CSS;
    document.head.appendChild(style);
  }
  list.el.classList.add('cs-list');
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', list.listboxEl.id);
  input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  root.append(bar.el, tabs.el, head, resultStrip.el, list.el);
  if (carousel) root.appendChild(carousel.el);
  document.body.appendChild(root);
  paperSurface(root, { seed: 71, elevation: 'lift', amp: 5, cap: 10, crop: true });
  const sheet = unrollSheet(root, tabs.el);
  root.addEventListener('pointerdown', e => { if (e.target !== input) e.preventDefault(); });
  root.addEventListener('mousedown', e => { if (e.target !== input) e.preventDefault(); });
  let isOpen = false, seq = 0, timer = 0, shown = [], shownFor = null, filter = 'songs', artistView = null, pendingEnter = false;
  let suggestion = null, stripActive = false, opener = null;
  let stripChord = STRIP_CHORDS[0];
  const cache = new Map();
  const showingCovers = () => carousel && !carousel.el.hidden;
  function syncStripShortcut() {
    if (resultStrip.el.hidden) return;
    stripChord = STRIP_CHORDS.find(chord => !SHORTCUT_NAMES.some(name => shortcuts.matches(name, chord)));
    input.setAttribute('aria-keyshortcuts', `${stripChord.label}+ArrowUp`);
    resultStrip.setHint(`${stripChord.label}+↑ browse covers · ←→ choose · Enter play · ↓ list`);
  }
  shortcuts.on(syncStripShortcut);
  function syncActive() {
    const picker = showingCovers() ? carousel : stripActive ? resultStrip : null;
    const box = picker?.listboxEl ?? list.listboxEl;
    const id = picker ? picker.activeId() : box.getAttribute('aria-activedescendant');
    input.setAttribute('aria-controls', box.id);
    if (id) input.setAttribute('aria-activedescendant', id); else input.removeAttribute('aria-activedescendant');
  }
  function setStripActive(next) {
    stripActive = next;
    resultStrip.el.classList.toggle('is-active', next);
    syncActive();
  }
  function hideResultStrip() {
    resultStrip.stop();
    resultStrip.el.hidden = true;
    input.removeAttribute('aria-keyshortcuts');
    if (stripActive) setStripActive(false);
  }
  function syncResultStrip() {
    if (!settings.get('coverCarousel') || !shown.length || artistView || shownFor !== `${filter}|${input.value.trim()}`) {
      hideResultStrip();
      return;
    }
    resultStrip.el.hidden = false;
    syncStripShortcut();
    resultStrip.setItems(shown.slice(0, STRIP_LIMIT), 'Top search results');
  }
  resultStrip.listboxEl.addEventListener('pointerdown', e => {
    if (e.isPrimary && e.button === 0) setStripActive(true);
  });
  list.listboxEl.addEventListener('pointerdown', () => { if (stripActive) setStripActive(false); });
  function hideCovers() {
    if (!showingCovers()) return;
    carousel.stop();
    carousel.el.hidden = true;
    list.el.hidden = false;
    syncActive();
  }
  function setFilter(next) {
    if (filter === next && !artistView) return;
    filter = next; artistView = null; tabs.setValue(next); input.placeholder = `search ${filter}`;
    clearTimeout(timer); pendingEnter = false; run();
  }
  function goBack() { if (!artistView) return; artistView = null; run(); }
  function note(kind, text, retry = null) {
    hideResultStrip();
    shown = []; shownFor = null; head.hidden = true; head.style.display = 'none';
    list.setItems([], { animate: false });
    if (kind === 'loading') list.setLoading(text);
    else if (kind === 'error') list.setError(text, retry);
    else list.setEmpty(text);
    syncActive();
  }
  function render(items, title = null, { back: withBack = false, covers = false } = {}) {
    shown = items.slice(0, 20); head.hidden = !title; head.style.display = title ? 'flex' : 'none';
    heading.textContent = title || ''; back.style.display = withBack ? '' : 'none';
    if (title) head.animate([{ opacity: 0 }, { opacity: 1 }], { delay: bar.lead(), duration: MOTION.dur.mid, fill: 'backwards' });
    if (covers && shown.length) {
      list.stopScroll();
      list.el.hidden = true;
      carousel.el.hidden = false;
      carousel.setItems(shown, title || 'Listen again');
      return;
    }
    hideCovers();
    list.el.style.setProperty('--list-lead', `${bar.lead()}ms`);
    list.setStale(false);
    list.setItems(shown, { emptyMessage: 'nothing found' }); syncActive();
  }
  async function openArtist(item) {
    const mine = ++seq; artistView = item;
    note('loading', `opening ${item.title}…`);
    try {
      const res = await music.artistSongs(item.browseId);
      if (mine !== seq || !isOpen) return;
      render(res?.items ?? [], res?.name || item.title, { back: true });
    } catch { if (mine === seq && isOpen) note('error', 'could not open artist', () => openArtist(item)); }
  }
  function pick(i, fromCoverPicker = false) {
    const item = shown[i]; if (!item) return;
    if (item.kind === 'artist' && item.browseId && music.artistSongs) { openArtist(item); return; }
    close();
    if (['album', 'playlist'].includes(item.kind) && onOpenCollection) onOpenCollection(item);
    else onPlay?.(item, { fromCoverPicker });
  }
  function apply(items, key) {
    render(items); shownFor = key;
    if (pendingEnter) { pendingEnter = false; if (shown.length) pick(0); }
    if (isOpen && !artistView) syncResultStrip();
  }
  function renderSuggestions() {
    render(suggestion?.items ?? [], suggestion?.title ?? null, { covers: carousel && settings.get('coverCarousel') });
  }
  settings.on('coverCarousel', () => {
    if (!isOpen) return;
    if (input.value.trim()) syncResultStrip();
    else if (carousel && suggestion) renderSuggestions();
  });
  async function showSuggestions() {
    suggestion = null;
    hideResultStrip();
    hideCovers();
    shown = []; shownFor = null; head.hidden = true; head.style.display = 'none'; pendingEnter = false;
    list.setItems([], { animate: false }); list.el.hidden = !suggest;
    syncActive();
    const mine = ++seq;
    if (!suggest) return;
    list.setLoading('looking…');
    try {
      const s = await suggest();
      if (mine !== seq || input.value.trim() || !isOpen) return;
      suggestion = s;
      renderSuggestions();
    } catch { if (mine === seq && isOpen) note('error', 'could not search', showSuggestions); }
  }
  async function run() {
    const q = input.value.trim(); artistView = null;
    if (!q) return showSuggestions();
    hideResultStrip();
    hideCovers();
    list.el.hidden = false;
    const key = `${filter}|${q}`;
    if (cache.has(key)) { seq++; apply(cache.get(key), key); return; }
    const mine = ++seq;
    if (!shown.length) note('loading', 'looking…'); else list.setStale(true);
    try {
      const items = await music.search(q, filter);
      if (mine !== seq || !isOpen) return;
      cache.set(key, items); apply(items, key);
    } catch {
      if (mine !== seq || !isOpen) return;
      pendingEnter = false; note('error', 'could not search', run);
    } finally { if (mine === seq) list.setStale(false); }
  }
  input.addEventListener('input', () => {
    seq++; clearTimeout(timer); pendingEnter = false; artistView = null;
    hideResultStrip();
    if (!input.value.trim()) { run(); return; }
    if (showingCovers()) {
      hideCovers();
      note('loading', 'looking…');
    }
    if (shown.length) list.setStale(true);
    timer = setTimeout(run, DEBOUNCE);
  });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (artistView) goBack(); else close(); }
    else if (!resultStrip.el.hidden && e.key === 'ArrowUp' && e.ctrlKey === stripChord.ctrlKey && e.metaKey === stripChord.metaKey
      && e.altKey === stripChord.altKey && e.shiftKey === stripChord.shiftKey) {
      e.preventDefault(); setStripActive(true);
    } else if (e.key === 'Tab') {
      e.preventDefault(); tabs.setValue(FILTERS[(FILTERS.indexOf(filter) + (e.shiftKey ? -1 : 1) + FILTERS.length) % FILTERS.length], { notify: true });
    } else if (showingCovers()) carousel.handleKeyDown(e);
    else if (stripActive && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) resultStrip.handleKeyDown(e, { passHorizontalEdges: true });
    } else if (stripActive && ['Home', 'End', 'Enter'].includes(e.key)) resultStrip.handleKeyDown(e);
    else if (e.key === 'Enter') {
      e.preventDefault(); const q = input.value.trim();
      if (!q) { if (list.getActive() >= 0) pick(list.getActive()); return; }
      if ((shownFor === `${filter}|${q}` || artistView) && shown.length) list.handleKeyDown(e);
      else { pendingEnter = true; clearTimeout(timer); run(); }
    } else {
      if (stripActive && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) setStripActive(false);
      list.handleKeyDown(e);
    }
  });
  for (const type of ['keyup', 'keypress']) input.addEventListener(type, e => e.stopPropagation());
  input.addEventListener('blur', () => { if (isOpen) setTimeout(() => isOpen && document.hasFocus() && input.focus({ preventScroll: true }), 0); });
  function isToggle(e) { return !shortcuts.recording && shortcuts.matches('search', e); }
  function open() {
    if (isOpen) return; isOpen = true; openCount++;
    opener = document.activeElement;
    setOverlayOpen(root, true); veil.show(true); root.classList.remove('closing'); root.classList.add('show');
    input.setAttribute('aria-expanded', 'true'); bar.play(true); input.focus({ preventScroll: true }); input.select();
    if (!input.value.trim()) showSuggestions();
    else syncResultStrip();
    sheet.open();
  }
  function close() {
    if (!isOpen) return; isOpen = false; openCount--; seq++; clearTimeout(timer); pendingEnter = false;
    const restore = document.activeElement === input ? opener : null;
    opener = null;
    setOverlayOpen(root, false); veil.show(false); input.setAttribute('aria-expanded', 'false');
    root.classList.replace('show', 'closing'); bar.play(false); input.blur();
    list.stopScroll();
    carousel?.stop();
    resultStrip.stop();
    if (stripActive) setStripActive(false);
    sheet.close();
    if (restore?.isConnected) restore.focus({ preventScroll: true });
  }
  window.addEventListener('keydown', e => {
    if (isToggle(e)) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) (isOpen ? close : open)(); }
    else if (isOpen && e.target !== input) { e.stopPropagation(); if (e.key === 'Escape') artistView ? goBack() : close(); }
  }, true);
  window.addEventListener('pointerdown', e => { if (isOpen && !root.contains(e.target)) close(); }, true);
  const params = new URLSearchParams(location.search);
  if (params.has('search')) {
    input.value = params.get('search'); open();
    run().then(() => { if (params.has('searchhl')) list.setActive(Number(params.get('searchhl')), { scroll: false }); });
  }
  return { open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen, ready: bar.ready,
    closeCoverPicker: () => { if (showingCovers()) close(); },
  };
}
