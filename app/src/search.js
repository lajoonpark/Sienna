import { setOverlayOpen } from './ui/sheet.js';
import { shortcuts, isMac } from './shortcuts.js';
import { createList } from './ui/list.js';
import { createCoverCarousel, createCoverTilt } from './ui/cover-carousel.js';
import { listenForCoverPickSkip } from './ui/cover-pick-input.js';
import { segmented, inkButton, stamp } from './ui/inputs.js';
import { createListBar, createListVeil } from './list-bar.js';
import { paperSurface } from './ui/paper.js';
import { cardMotion, signboard } from './ui/crate.js';
import { setLamp } from './ui/veil.js';
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
const SEARCH_CSS = `
.cs-head { display: flex; align-items: center; gap: var(--sienna-space-3); flex: none;
  padding: 0 var(--sienna-space-2) var(--sienna-space-2); font-size: var(--sienna-text-lg); color: var(--sienna-indigo); }
.cs-head[hidden] { display: none; }
/* the top five covers, spun through on the card above the list. The list gives way first; while the card
   is still growing to fit, the strip is cut at the card's edge instead of hanging below it (the clip
   margin leaves room for the selected sleeve's focus ring). */
.cs.list-overlay > .cs-result-strip { flex: 0 1 auto; min-height: 0; overflow: clip; overflow-clip-margin: 6px;
  margin-bottom: var(--sienna-space-1); padding-bottom: var(--sienna-space-2); border-bottom: 1px solid var(--sienna-hairline); }
.cs.list-overlay > .ui-list:not(.cs-result-strip) { flex-shrink: 1000; }
.cs-result-strip .la-wheel { flex: 0 0 clamp(80px, 17dvh, 126px); }
.cs-result-strip.is-active .la-cover[aria-selected="true"] .la-sleeve-front {
  box-shadow: 0 0 0 2px var(--sienna-paper), 0 0 0 5px var(--sienna-terracotta), 0 4px 10px rgba(36, 25, 18, 0.3); }
/* covers floating under the card (the mini player's Listen again): the card is only tabs and the search line */
.cs.cs-covering > :is(.cs-head, .ui-list-foot) { display: none; }
.cs.cover-picking { opacity: 0; transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out); }
.cs-stage { position: fixed; left: 0; right: 0; bottom: var(--stage-bottom, var(--sienna-space-4)); top: 40%;
  z-index: calc(var(--sienna-z-list) - 1); display: none; pointer-events: none;
  padding: 0 var(--stage-side, var(--sienna-space-4)); }
.cs-stage.show { display: flex; flex-direction: column; }
.cs-stage > .la-full { flex: 1; min-height: 0; pointer-events: auto; }
.cs-stage > .cs-sign { position: absolute; left: var(--stage-sign-left, var(--sienna-space-6)); top: var(--sienna-space-2); z-index: 2;
  max-width: 34vw; font-size: 22px; text-align: left; }
.cs-stage.is-fading { opacity: 0; transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out); }
.cs-stage:is(.is-fading, .is-leaving) > .la-full { pointer-events: none; }
.cs-stage:is(.is-leaving, .is-picking) > .cs-sign { opacity: 0; transition: opacity var(--sienna-dur-fast); }
.cs-stage.show > .cs-sign { animation: cs-sign-in 320ms var(--sienna-ease-out) both; }
@keyframes cs-sign-in { from { opacity: 0; transform: translateY(-10px); } }
`;
let openCount = 0;
export const searchOpen = () => openCount > 0;

// drawer (the mini player): the suitcase drawer the Listen again sleeves come out of and go back into,
// { open(), close(), origin() -> { x, y, size } }.
export function createSearch({ music, onPlay, suggest = null, coverSuggestions = false, onOpenCollection = null, drawer = null }) {
  const root = document.createElement('div'); root.className = 'cs list-overlay';
  const veil = createListVeil(() => close());
  const bar = createListBar({ prefix: 'cs', label: 'Search', placeholder: 'search songs' });
  const input = bar.input;
  bar.el.appendChild(stamp('close', { label: 'Close', tooltip: 'Close (Esc)', tooltipPos: 'bottom', onClick: () => close() }));
  const head = document.createElement('div'); head.className = 'cs-head'; head.hidden = true;
  const heading = document.createElement('span');
  const back = inkButton('Back', { icon: 'back', onClick: () => goBack() });
  head.append(back, heading);
  const tabs = segmented(FILTERS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })), {
    value: 'songs', role: 'tabs', variant: 'tabs', label: 'Search for', onChange: setFilter,
  });
  const list = createList({ label: 'Search results', showKind: 'mixed', lines: true, onPick: (_, i) => pick(i),
    onActiveChange: () => { if (stripActive) setStripActive(false); else syncActive(); },
  });
  const carousel = coverSuggestions && suggest
    ? createCoverCarousel({ fullSize: true, onPick: i => pick(i, true), onActiveChange: syncActive, onBackground: () => close() })
    : null;
  const coverTilt = carousel && createCoverTilt(carousel.stageEl);
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const resultStrip = createCoverCarousel({
    orientation: 'horizontal', onPick: i => pick(i),
    onActiveChange: source => { if (source === 'wheel') setStripActive(true); else syncActive(); },
  });
  resultStrip.el.classList.add('cs-result-strip');
  resultStrip.listboxEl.tabIndex = -1;
  if (!document.getElementById('sienna-search-css')) {
    const style = document.createElement('style');
    style.id = 'sienna-search-css'; style.textContent = SEARCH_CSS;
    document.head.appendChild(style);
  }
  list.el.classList.add('cs-list');
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', list.listboxEl.id);
  input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  root.append(tabs.el, bar.el, head, resultStrip.el, list.el, list.footEl);
  document.body.appendChild(root);
  paperSurface(root, { elevation: 'lift' });
  const card = cardMotion(root);
  // the covers float on the dimmed shop under the card, under a sign that says what they are
  let stage = null, sign = null;
  if (carousel) {
    stage = document.createElement('div'); stage.className = 'cs-stage';
    sign = document.createElement('div'); sign.className = 'cs-sign';
    signboard(sign, { seed: 43 });
    stage.append(sign, carousel.el);
    document.body.appendChild(stage);
    new ResizeObserver(() => placeStage()).observe(root);
  }
  const keepFocus = e => { if (e.target !== input) e.preventDefault(); };
  for (const el of [root, stage]) {
    el?.addEventListener('pointerdown', keepFocus);
    el?.addEventListener('mousedown', keepFocus);
  }
  let isOpen = false, seq = 0, timer = 0, shown = [], shownFor = null, filter = 'songs', artistView = null, pendingEnter = false;
  let suggestion = null, stripActive = false, opener = null;
  let pendingCover = null;
  let stripChord = STRIP_CHORDS[0];
  let coversOn = false, coverRun = 0;
  // `${filter}|${query}` -> results, so going back over what you typed is instant. The newest CACHE_MAX
  // are kept (every keystroke that paused long enough is a key).
  const cache = new Map();
  const CACHE_MAX = 80;
  const remember = (key, items) => {
    cache.delete(key);
    cache.set(key, items);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  };
  music.onAccount?.(() => cache.clear());
  const showingCovers = () => coversOn;
  const chordKeys = chord => (isMac
    ? `${chord.ctrlKey ? '⌃' : ''}${chord.altKey ? '⌥' : ''}${chord.shiftKey ? '⇧' : ''}↑`
    : `${chord.label}+↑`);
  // the one line of keys under the card, for whatever has the keyboard
  function syncHints() {
    if (stripActive) list.setFooterHints([['← →', 'choose'], ['Enter', 'play'], ['↓', 'back to the list']]);
    else list.setFooterHints([['↑ ↓', 'choose'], ['Enter', 'play'], ['Tab', 'filter'], ['Esc', 'close'],
      ...(resultStrip.el.hidden ? [] : [[chordKeys(stripChord), 'browse covers']])]);
  }
  function syncStripShortcut() {
    if (resultStrip.el.hidden) return;
    stripChord = STRIP_CHORDS.find(chord => !SHORTCUT_NAMES.some(name => shortcuts.matches(name, chord)));
    input.setAttribute('aria-keyshortcuts', `${stripChord.label}+ArrowUp`);
    syncHints();
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
    syncHints();
    syncActive();
  }
  function hideResultStrip() {
    resultStrip.stop();
    resultStrip.el.hidden = true;
    input.removeAttribute('aria-keyshortcuts');
    if (stripActive) setStripActive(false);
    else syncHints();
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
  function placeStage() {
    if (stage && coversOn) stage.style.top = `${root.offsetTop + root.offsetHeight + 4}px`;
  }
  function showCovers(items, title) {
    const fresh = !coversOn;
    coverRun++;
    coversOn = true;
    root.classList.add('cs-covering');
    stage.classList.remove('is-fading', 'is-leaving', 'is-picking');
    stage.classList.add('show');
    carousel.el.hidden = false;
    sign.textContent = title || 'Listen again';
    if (fresh && !calm.matches) {
      drawer?.open();
      setLamp(drawer?.origin());
    }
    placeStage();
    carousel.setItems(items, title || 'Listen again');
    if (fresh) carousel.enter({ origin: drawer?.origin, notBefore: performance.now() + 170 });
  }
  // how: 'leave' flies them back into the drawer, 'fade' (typing over them) and 'picked' fade,
  // 'instant' takes them away at once
  function dismissCovers(how) {
    if (!coversOn) return;
    coversOn = false;
    if (how === 'fade') root.classList.remove('cs-covering');
    const run = ++coverRun;
    const finish = () => {
      if (run !== coverRun) return;
      carousel.el.hidden = true;
      stage.classList.remove('show', 'is-fading', 'is-leaving', 'is-picking');
      root.classList.remove('cs-covering');
      if (how !== 'picked') drawer?.close();
      if (!isOpen) setOverlayOpen(root, false);
    };
    if (how === 'instant' || calm.matches) {
      carousel.settle();
      finish();
    } else if (how === 'fade') {
      stage.classList.add('is-fading');
      setTimeout(finish, MOTION.dur.fast);
    } else if (how === 'picked') setTimeout(finish, MOTION.dur.mid + 40);
    else {
      stage.classList.add('is-leaving');
      carousel.leave({ origin: drawer?.origin }).then(finish);
    }
  }
  function hideCovers() {
    if (!showingCovers()) return;
    carousel.stop();
    dismissCovers('fade');
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
    shown = []; shownFor = null; head.hidden = true;
    list.setItems([]);
    if (kind === 'loading') list.setLoading(text);
    else if (kind === 'error') list.setError(text, retry);
    else list.setEmpty(text);
    syncActive();
  }
  function render(items, title = null, { back: withBack = false, covers = false } = {}) {
    shown = items.slice(0, 20); head.hidden = !title;
    heading.textContent = title || ''; back.style.display = withBack ? '' : 'none';
    if (covers && shown.length) {
      list.stopScroll();
      list.el.hidden = true;
      showCovers(shown, title);
      syncActive();
      return;
    }
    hideCovers();
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
    const item = shown[i]; if (!isOpen || !item || pendingCover) return;
    if (item.kind === 'artist' && item.browseId && music.artistSongs) { openArtist(item); return; }
    const openCollection = ['album', 'playlist'].includes(item.kind) && onOpenCollection;
    if (fromCoverPicker && onPlay && !openCollection && !calm.matches) {
      root.classList.add('cover-picking');
      stage.classList.add('is-picking');
      veil.show(false);
      const mine = seq;
      const { done, hide } = carousel.extractDisc(i);
      pendingCover = { item, hide };
      done.then(rect => {
        if (mine !== seq || !isOpen || !rect) return;
        pendingCover = null;
        close({ covers: 'picked' });
        onPlay(item, { fromCoverPicker, from: { rect, ...coverTilt.pose(), hideSleeve: hide } });
      });
      return;
    }
    close(fromCoverPicker ? { covers: 'picked' } : undefined);
    if (openCollection) onOpenCollection(item);
    else onPlay?.(item, { fromCoverPicker, ...(fromCoverPicker ? { from: { instant: true } } : {}) });
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
    if (!isOpen || pendingCover) return;
    if (input.value.trim()) syncResultStrip();
    else if (carousel && suggestion) renderSuggestions();
  });
  async function showSuggestions() {
    suggestion = null;
    hideResultStrip();
    hideCovers();
    shown = []; shownFor = null; head.hidden = true; pendingEnter = false;
    list.setItems([]); list.el.hidden = !suggest;
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
      remember(key, items); apply(items, key);
    } catch {
      if (mine !== seq || !isOpen) return;
      pendingEnter = false; note('error', 'could not search', run);
    } finally { if (mine === seq) list.setStale(false); }
  }
  input.addEventListener('input', () => {
    if (pendingCover) return;
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
    setOverlayOpen(root, true); veil.show(true); root.classList.remove('cover-picking'); root.classList.add('show');
    if (!coversOn) root.classList.remove('cs-covering');   // covers still flying home from last time
    input.setAttribute('aria-expanded', 'true'); input.focus({ preventScroll: true }); input.select();
    if (!input.value.trim()) showSuggestions();
    else syncResultStrip();
    card.open();
  }
  function close({ covers = 'leave' } = {}) {
    if (!isOpen) return; isOpen = false; openCount--; seq++; clearTimeout(timer); pendingEnter = false;
    const coverPicking = root.classList.contains('cover-picking');
    const restore = document.activeElement === input || coverPicking ? opener : null;
    opener = null;
    if (!coversOn) setOverlayOpen(root, false);   // flying home, the covers keep the tag away until they land
    veil.show(false); input.setAttribute('aria-expanded', 'false');
    root.classList.remove('show'); input.blur();
    list.stopScroll();
    carousel?.stop();
    resultStrip.stop();
    if (stripActive) setStripActive(false);
    if (coverPicking) card.reset();   // already faded out for the pick
    else card.close();
    if (pendingCover) covers = 'picked';
    dismissCovers(covers);
    if (restore?.isConnected) restore.focus({ preventScroll: true });
    if (pendingCover) {
      const { item, hide } = pendingCover;
      pendingCover = null;
      hide();
      onPlay(item, { fromCoverPicker: true, from: { instant: true } });
    }
  }
  if (carousel) listenForCoverPickSkip(() => {
    if (!pendingCover) return false;
    close();
    return true;
  });
  window.addEventListener('keydown', e => {
    if (pendingCover) { e.preventDefault(); e.stopImmediatePropagation(); }
    else if (isToggle(e)) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) (isOpen ? close : open)(); }
    else if (isOpen && e.target !== input) { e.stopPropagation(); if (e.key === 'Escape') artistView ? goBack() : close(); }
  }, true);
  window.addEventListener('pointerdown', e => {
    if (isOpen && !root.contains(e.target) && !stage?.contains(e.target)) close();
  }, true);
  const params = new URLSearchParams(location.search);
  if (params.has('search')) {
    input.value = params.get('search'); open();
    run().then(() => { if (params.has('searchhl')) list.setActive(Number(params.get('searchhl')), { scroll: false }); });
  }
  syncHints();
  return { open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen, ready: bar.ready,
    // the mini player is shutting: nothing is drawn once it is hidden, so the covers go at once,
    // any still flying home included
    closeCoverPicker: () => {
      if (showingCovers()) close({ covers: 'instant' });
      else carousel?.settle();
    },
    tilt(tx, ty) { if (isOpen && showingCovers() && !pendingCover) coverTilt.update(tx, ty); },
  };
}
