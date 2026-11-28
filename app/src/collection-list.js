import { setOverlayOpen } from './ui/sheet.js';
import { createList } from './ui/list.js';
import { segmented, inkButton, stamp } from './ui/inputs.js';
import { brushButton } from './ui/brush.js';
import { paperSurface } from './ui/paper.js';
import { cardMotion } from './ui/crate.js';
import { paintedCoverURL } from './coverpaint.js';
import { createListBar, createListVeil } from './list-bar.js';
import { filterCollectionSongs } from './collection-filter.js';
export { filterCollectionSongs };

const FIELDS = ['all', 'title', 'artist', 'album'];
// the collection's sleeve and name on top, with Play and Shuffle
const CSS = `
.cl-top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sienna-space-2) var(--sienna-space-4); flex: none;
  margin: 0 var(--sienna-space-1) var(--sienna-space-2); }
.cl-bcov { width: 60px; height: 60px; flex: none; border-radius: 3px; background: var(--sienna-paper-lo) center / cover;
  box-shadow: 0 2px 7px rgba(36, 25, 18, 0.34); }
.cl-text { flex: 1 1 140px; min-width: 0; }
.cl-btitle { font: 700 var(--sienna-text-xl)/1.15 var(--sienna-font); color: var(--sienna-indigo);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cl-bcount { font: var(--sienna-text-xs)/1.4 var(--sienna-serif); color: var(--sienna-ink-2); }
`;

export function createCollectionList({ onPlay, onShuffle = null, music = null } = {}) {
  const root = document.createElement('div'); root.className = 'cl list-overlay';
  const veil = createListVeil(() => close());
  if (!document.getElementById('sienna-collection-css')) {
    const style = document.createElement('style');
    style.id = 'sienna-collection-css'; style.textContent = CSS; document.head.appendChild(style);
  }
  const header = document.createElement('div'); header.className = 'cl-top';
  const cover = document.createElement('div'); cover.className = 'cl-bcov';
  const text = document.createElement('div'); text.className = 'cl-text';
  const title = document.createElement('div'); title.className = 'cl-btitle';
  const count = document.createElement('div'); count.className = 'cl-bcount';
  text.append(title, count);
  const play = brushButton('Play', { onClick: () => pick(0) });
  const shuffle = inkButton('Shuffle', { size: 'sm', icon: 'shuffle', onClick: triggerShuffle });
  const closeBtn = stamp('close', { label: 'Close', tooltip: 'Close (Esc)', tooltipPos: 'bottom', onClick: () => close() });
  header.append(cover, text, play, shuffle, closeBtn);
  const bar = createListBar({ prefix: 'cl', label: 'Filter collection', placeholder: 'filter songs' });
  const input = bar.input;
  const tabs = segmented(FIELDS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })), {
    value: 'all', label: 'Filter songs by', role: 'tabs', onChange(next) {
      field = next; input.placeholder = field === 'all' ? 'filter songs' : `filter by ${field}`; applyFilter();
    },
  });
  const list = createList({ label: 'Collection songs', showIndex: true, showKind: false, batchSize: 40, lines: true,
    footerHints: [['↑ ↓', 'choose'], ['Enter', 'play'], ['Tab', 'filter by'], ['Esc', 'close']], onPick: (_, i) => pick(i),
    onActiveChange: () => {
      const id = list.listboxEl.getAttribute('aria-activedescendant');
      if (id) input.setAttribute('aria-activedescendant', id); else input.removeAttribute('aria-activedescendant');
    },
  });
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', list.listboxEl.id);
  input.setAttribute('aria-expanded', 'false');
  root.append(header, bar.el, tabs.el, list.el, list.footEl); document.body.appendChild(root);
  paperSurface(root, { elevation: 'lift' });
  const card = cardMotion(root);
  root.addEventListener('pointerdown', e => { if (e.target !== input) e.preventDefault(); });
  root.addEventListener('mousedown', e => { if (e.target !== input) e.preventDefault(); });
  let isOpen = false, seq = 0, collection = null, allSongs = [], filtered = [], field = 'all', source = null, playing = null;
  let nowId = music?.state?.videoId ?? null;   // the song playing, as the player last said (kept while shut too)
  function markNowPlaying(videoId, force = false) {
    if (!force && playing === videoId) return;
    playing = videoId;
    const item = filtered.find(it => (it.videoId ?? it.play?.videoId) === videoId);
    list.setNowPlaying(item ? (item.id ?? item.videoId ?? item.play?.videoId) : videoId ?? null);
  }
  function applyFilter() {
    filtered = filterCollectionSongs(allSongs, input.value, field);
    count.textContent = input.value.trim() ? `${filtered.length} of ${allSongs.length}` : `${allSongs.length} songs`;
    list.setItems(filtered, { emptyMessage: 'nothing found' });
    input.removeAttribute('aria-activedescendant');
    markNowPlaying(nowId, true);   // the rows are new: mark the playing one again
    play.setDisabled(!filtered.length); shuffle.setDisabled(!allSongs.length);
  }
  function pick(i) { const item = filtered[i]; if (!item) return; close(); onPlay?.(item, collection); }
  function triggerShuffle() {
    const pool = filtered.length ? filtered : allSongs; if (!pool.length) return;
    const chosen = pool[Math.floor(Math.random() * pool.length)]; close();
    if (onShuffle) onShuffle(chosen, collection, pool); else onPlay?.(chosen, collection);
  }
  input.addEventListener('input', applyFilter);
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); tabs.setValue(FIELDS[(FIELDS.indexOf(field) + (e.shiftKey ? -1 : 1) + FIELDS.length) % FIELDS.length], { notify: true }); }
    else list.handleKeyDown(e);
  });
  for (const type of ['keyup', 'keypress']) input.addEventListener(type, e => e.stopPropagation());
  input.addEventListener('blur', () => { if (isOpen) setTimeout(() => isOpen && document.hasFocus() && input.focus({ preventScroll: true }), 0); });
  async function load() {
    const mine = ++seq;
    allSongs = []; filtered = []; count.textContent = ''; play.setDisabled(true); shuffle.setDisabled(true);
    list.setItems([]); list.setLoading(`opening ${collection?.title || 'songs'}…`);
    input.removeAttribute('aria-activedescendant');
    try {
      const loaded = await (typeof source === 'function' ? source() : source);
      if (mine !== seq || !isOpen) return;
      allSongs = Array.isArray(loaded) ? loaded : []; applyFilter();
    } catch {
      if (mine !== seq || !isOpen) return;
      list.setError('could not load songs', load);
    }
  }
  async function open(col, songsOrPromise) {
    const wasOpen = isOpen;
    collection = col; source = songsOrPromise; field = 'all'; tabs.setValue(field); input.value = '';
    input.placeholder = 'filter songs'; title.textContent = col?.title || 'Collection';   // the title is just above
    cover.style.backgroundImage = '';
    const art = col?.art;
    if (art) paintedCoverURL(art).then(url => { if (url && collection === col && collection.art === art && isOpen) cover.style.backgroundImage = `url(${url})`; });
    if (!isOpen) { isOpen = true; setOverlayOpen(root, true); veil.show(true); root.classList.add('show'); }
    input.setAttribute('aria-expanded', 'true'); input.focus({ preventScroll: true });
    const p = load();
    if (!wasOpen) card.open();
    return p;
  }
  function close() {
    if (!isOpen) return; isOpen = false; seq++; setOverlayOpen(root, false); veil.show(false);
    list.stopScroll();
    input.setAttribute('aria-expanded', 'false'); root.classList.remove('show'); input.blur();
    card.close();
  }
  music?.onState?.(state => { nowId = state.videoId ?? null; if (isOpen) markNowPlaying(nowId); });
  window.addEventListener('keydown', e => { if (isOpen && e.target !== input) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } } }, true);
  window.addEventListener('pointerdown', e => { if (isOpen && !root.contains(e.target)) close(); }, true);
  return { open, close, isOpen: () => isOpen, ready: bar.ready };
}
