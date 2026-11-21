import { setOverlayOpen } from './ui/sheet.js';
import { shortcuts } from './shortcuts.js';
import { createList } from './ui/list.js';
import { segmented, inkButton } from './ui/inputs.js';
import { createListBar, createListVeil } from './list-bar.js';
import { paperSurface } from './ui/paper.js';
import { MOTION } from './ui/tokens.js';

const FILTERS = ['songs', 'albums', 'playlists', 'artists'];
const DEBOUNCE = 250;
let openCount = 0;
export const searchOpen = () => openCount > 0;

export function createSearch({ music, onPlay, suggest = null, onOpenCollection = null }) {
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
    onActiveChange: () => syncActive(),
  });
  list.el.classList.add('cs-list');
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', list.listboxEl.id);
  input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  root.append(bar.el, tabs.el, head, list.el); document.body.appendChild(root);
  paperSurface(root, { seed: 71, elevation: 'lift', amp: 5, cap: 10 });
  root.addEventListener('pointerdown', e => { if (e.target !== input) e.preventDefault(); });
  root.addEventListener('mousedown', e => { if (e.target !== input) e.preventDefault(); });
  let isOpen = false, seq = 0, timer = 0, shown = [], shownFor = null, filter = 'songs', artistView = null, pendingEnter = false;
  const cache = new Map();
  function syncActive() {
    const id = list.listboxEl.getAttribute('aria-activedescendant');
    if (id) input.setAttribute('aria-activedescendant', id); else input.removeAttribute('aria-activedescendant');
  }
  function setFilter(next) {
    if (filter === next && !artistView) return;
    filter = next; artistView = null; tabs.setValue(next); input.placeholder = `search ${filter}`;
    clearTimeout(timer); pendingEnter = false; run();
  }
  function goBack() { if (!artistView) return; artistView = null; run(); }
  function note(kind, text, retry = null) {
    shown = []; shownFor = null; head.hidden = true; head.style.display = 'none';
    list.setItems([], { animate: false });
    if (kind === 'loading') list.setLoading(text);
    else if (kind === 'error') list.setError(text, retry);
    else list.setEmpty(text);
    syncActive();
  }
  function render(items, title = null, { back: withBack = false } = {}) {
    shown = items.slice(0, 20); head.hidden = !title; head.style.display = title ? 'flex' : 'none';
    heading.textContent = title || ''; back.style.display = withBack ? '' : 'none';
    if (title) head.animate([{ opacity: 0 }, { opacity: 1 }], { delay: bar.lead(), duration: MOTION.dur.mid, fill: 'backwards' });
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
  function pick(i) {
    const item = shown[i]; if (!item) return;
    if (item.kind === 'artist' && item.browseId && music.artistSongs) { openArtist(item); return; }
    close();
    if (['album', 'playlist'].includes(item.kind) && onOpenCollection) onOpenCollection(item);
    else onPlay?.(item);
  }
  function apply(items, key) {
    render(items); shownFor = key;
    if (pendingEnter) { pendingEnter = false; if (shown.length) pick(0); }
  }
  async function showSuggestions() {
    shown = []; shownFor = null; head.hidden = true; head.style.display = 'none'; pendingEnter = false;
    list.setItems([], { animate: false }); list.el.hidden = !suggest;
    syncActive();
    const mine = ++seq;
    if (!suggest) return;
    list.setLoading('looking…');
    try {
      const s = await suggest();
      if (mine !== seq || input.value.trim() || !isOpen) return;
      render(s?.items ?? [], s?.title ?? null);
    } catch { if (mine === seq && isOpen) note('error', 'could not search', showSuggestions); }
  }
  async function run() {
    const q = input.value.trim(); artistView = null;
    if (!q) return showSuggestions();
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
    if (!input.value.trim()) { run(); return; }
    if (shown.length) list.setStale(true);
    timer = setTimeout(run, DEBOUNCE);
  });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (artistView) goBack(); else close(); }
    else if (e.key === 'Tab') {
      e.preventDefault(); tabs.setValue(FILTERS[(FILTERS.indexOf(filter) + (e.shiftKey ? -1 : 1) + FILTERS.length) % FILTERS.length], { notify: true });
    } else if (e.key === 'Enter') {
      e.preventDefault(); const q = input.value.trim();
      if (!q) { if (list.getActive() >= 0) pick(list.getActive()); return; }
      if ((shownFor === `${filter}|${q}` || artistView) && shown.length) list.handleKeyDown(e);
      else { pendingEnter = true; clearTimeout(timer); run(); }
    } else list.handleKeyDown(e);
  });
  for (const type of ['keyup', 'keypress']) input.addEventListener(type, e => e.stopPropagation());
  input.addEventListener('blur', () => { if (isOpen) setTimeout(() => isOpen && document.hasFocus() && input.focus({ preventScroll: true }), 0); });
  function isToggle(e) { return !shortcuts.recording && shortcuts.matches('search', e); }
  function open() {
    if (isOpen) return; isOpen = true; openCount++;
    setOverlayOpen(root, true); veil.show(true); root.classList.remove('closing'); root.classList.add('show');
    input.setAttribute('aria-expanded', 'true'); bar.play(true); input.focus({ preventScroll: true }); input.select();
    if (!input.value.trim()) showSuggestions();
  }
  function close() {
    if (!isOpen) return; isOpen = false; openCount--; seq++; clearTimeout(timer); pendingEnter = false;
    setOverlayOpen(root, false); veil.show(false); input.setAttribute('aria-expanded', 'false');
    root.classList.replace('show', 'closing'); bar.play(false); input.blur();
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
  return { open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen, ready: bar.ready };
}
