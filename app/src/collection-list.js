import { setOverlayOpen } from './ui/sheet.js';
import { createList } from './ui/list.js';
import { segmented, inkButton, stamp } from './ui/inputs.js';
import { brushButton } from './ui/brush.js';
import { paperSurface } from './ui/paper.js';
import { paintedCoverURL } from './coverpaint.js';
import { createListBar, createListVeil } from './list-bar.js';
import { filterCollectionSongs } from './collection-filter.js';
export { filterCollectionSongs };

const FIELDS = ['all', 'title', 'artist', 'album'];

export function createCollectionList({ onPlay, onShuffle = null, music = null } = {}) {
  const root = document.createElement('div'); root.className = 'cl list-overlay';
  const veil = createListVeil(() => close());
  const header = document.createElement('div'); header.className = 'cl-top';
  header.style.cssText = 'display:flex;align-items:center;gap:var(--sienna-space-3);padding:var(--sienna-space-4) var(--sienna-space-5);flex:none';
  const cover = document.createElement('div'); cover.className = 'cl-bcov';
  cover.style.cssText = 'width:var(--sienna-space-10);height:var(--sienna-space-10);flex:none;background:var(--sienna-paper-lo);background-size:cover';
  const text = document.createElement('div'); text.style.cssText = 'flex:1;min-width:0';
  const title = document.createElement('div'); title.className = 'cl-btitle';
  title.style.cssText = 'font:var(--sienna-text-lg)/1.1 var(--sienna-font);color:var(--sienna-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  const count = document.createElement('div'); count.className = 'cl-bcount';
  count.style.cssText = 'font:var(--sienna-text-sm)/1.3 var(--sienna-serif);color:var(--sienna-ink-2)';
  text.append(title, count);
  const play = brushButton('Play', { onClick: () => pick(0) });
  const shuffle = inkButton('Shuffle', { icon: 'shuffle', onClick: triggerShuffle });
  const closeBtn = stamp('close', { label: 'Close', tooltip: 'Close (Esc)', onClick: () => close() });
  header.append(cover, text, play, shuffle, closeBtn);
  const bar = createListBar({ prefix: 'cl', label: 'Filter collection', placeholder: 'filter songs', seed: 29,
    onClosed: () => root.classList.remove('closing') });
  const input = bar.input;
  const tabs = segmented(FIELDS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })), {
    value: 'all', label: 'Filter songs by', role: 'tabs', onChange(next) {
      field = next; input.placeholder = field === 'all' ? `filter ${collection?.title?.toLowerCase() || 'songs'}` : `filter by ${field}`; applyFilter();
    },
  });
  const list = createList({ label: 'Collection songs', showIndex: true, showKind: false, batchSize: 40, lines: true,
    footerHints: ['↑↓ choose · Enter play · Tab field · Esc close'], onPick: (_, i) => pick(i),
    onActiveChange: () => {
      const id = list.listboxEl.getAttribute('aria-activedescendant');
      if (id) input.setAttribute('aria-activedescendant', id); else input.removeAttribute('aria-activedescendant');
    },
  });
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', list.listboxEl.id);
  input.setAttribute('aria-expanded', 'false');
  root.append(header, bar.el, tabs.el, list.el); document.body.appendChild(root);
  paperSurface(root, { seed: 83, elevation: 'lift', amp: 5, cap: 10 });
  root.addEventListener('pointerdown', e => { if (e.target !== input) e.preventDefault(); });
  root.addEventListener('mousedown', e => { if (e.target !== input) e.preventDefault(); });
  let isOpen = false, seq = 0, collection = null, allSongs = [], filtered = [], field = 'all', source = null, playing = null;
  function markNowPlaying(videoId, force = false) {
    if (!force && playing === videoId) return;
    playing = videoId;
    const item = filtered.find(it => (it.videoId ?? it.play?.videoId) === videoId);
    list.setNowPlaying(item ? (item.id ?? item.videoId ?? item.play?.videoId) : videoId ?? null);
  }
  function applyFilter() {
    filtered = filterCollectionSongs(allSongs, input.value, field);
    count.textContent = input.value.trim() ? `${filtered.length} of ${allSongs.length}` : `${allSongs.length} songs`;
    list.setItems(filtered, { animate: false, emptyMessage: 'nothing found' });
    input.removeAttribute('aria-activedescendant');
    markNowPlaying(music?.state?.videoId ?? null, true);
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
    list.setItems([], { animate: false }); list.setLoading(`opening ${collection?.title || 'songs'}…`);
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
    collection = col; source = songsOrPromise; field = 'all'; tabs.setValue(field); input.value = '';
    input.placeholder = `filter ${col?.title?.toLowerCase() || 'songs'}`; title.textContent = col?.title || 'Collection';
    cover.style.backgroundImage = '';
    const art = col?.art;
    if (art) paintedCoverURL(art).then(url => { if (url && collection === col && collection.art === art && isOpen) cover.style.backgroundImage = `url(${url})`; });
    if (!isOpen) { isOpen = true; setOverlayOpen(root, true); veil.show(true); root.classList.remove('closing'); root.classList.add('show'); bar.play(true); }
    input.setAttribute('aria-expanded', 'true'); input.focus({ preventScroll: true });
    return load();
  }
  function close() {
    if (!isOpen) return; isOpen = false; seq++; setOverlayOpen(root, false); veil.show(false);
    input.setAttribute('aria-expanded', 'false'); root.classList.replace('show', 'closing'); bar.play(false); input.blur();
  }
  music?.onState?.(state => { if (isOpen) markNowPlaying(state.videoId ?? null); });
  window.addEventListener('keydown', e => { if (isOpen && e.target !== input) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } } }, true);
  window.addEventListener('pointerdown', e => { if (isOpen && !root.contains(e.target)) close(); }, true);
  return { open, close, isOpen: () => isOpen, ready: bar.ready };
}
