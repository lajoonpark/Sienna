import { createSheet, setOverlayOpen, sheetOpen } from './ui/sheet.js';
// Torn-paper overlay sheets matching Sienna's Settings & Tour aesthetic:
//   - Lyrics sheet with 3D paper-unfold animation (pulled from YouTube Music's `next` -> Lyrics tab)
//   - Up Next Queue list that emerges directly from the open suitcase bottom drawer
//   - Offline / load-error status banner with Retry button
//   - WebGL initialization fallback screen
import { injectTokens, MOTION } from './ui/tokens.js';
import { paperSurface } from './ui/paper.js';
import { unrollSheet } from './ui/unroll.js';
import { createList } from './ui/list.js';
import { createCoverCarousel } from './ui/cover-carousel.js';
import { inkButton, stamp } from './ui/inputs.js';
import { createBanner } from './ui/banner.js';
import { createScrollCue } from './ui/scroll-cue.js';
import { settings } from './settings.js';

const CSS = `
.ln-lyrics { white-space: pre-wrap; font-family: var(--sienna-serif); font-size: var(--sienna-text-md); line-height: 1.6; color: var(--sienna-ink); user-select: text; }
.ln-src { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); color: var(--sienna-ink-3); flex: 1; }
.ln-empty { font-family: var(--sienna-serif); font-size: var(--sienna-text-md); color: var(--sienna-ink-2); padding: var(--sienna-space-5) 0; }
/* ---- Queue overlay ---- */
.ln-qveil { position: fixed; inset: 0; z-index: var(--sienna-z-list); pointer-events: none; visibility: hidden; opacity: 0;
  transition: opacity var(--sienna-dur-mid), visibility var(--sienna-dur-mid); font-family: var(--sienna-font); }
.ln-qveil.show { pointer-events: auto; visibility: visible; opacity: 1; transition: opacity var(--sienna-dur-mid); }
.ln-qveil.closing { visibility: visible; opacity: 1; }
.ln-qveil.closing .ln-qbackdrop { opacity: 0; transition: opacity var(--sienna-dur-mid); }
.ln-qveil.closing .la-carousel { opacity: 0; transition: opacity var(--sienna-dur-fast); }
.ln-qbackdrop { position: absolute; inset: 0; background: var(--sienna-veil); backdrop-filter: var(--sienna-veil-filter); }
.ln-qbox { position: fixed; left: 50%; top: var(--sienna-space-10); transform: translateX(-50%);
  box-sizing: border-box; padding: var(--sienna-space-6) var(--sienna-space-8) var(--sienna-space-5);
  width: min(calc(var(--sienna-space-10) * 14), 90vw); max-height: calc(100dvh - var(--sienna-space-10) * 2);
  display: flex; flex-direction: column; }
.ln-qtop { display: flex; align-items: center; justify-content: space-between; gap: var(--sienna-space-3);
  order: -1; margin: 0 var(--sienna-space-2) var(--sienna-space-2); }
.ln-qtitle { font: 700 var(--sienna-text-2xl)/1.02 var(--sienna-font); width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: var(--sienna-space-3);
  color: var(--sienna-indigo); }
.ln-qbox > .ui-list { min-height: 0; flex: 1; }
.ln-qbox .ui-list-scroll { min-height: 0; }
.ln-qclose { display: flex; align-items: center; gap: var(--sienna-space-2); }
.ln-qclose .ui-ink[hidden] { display: none; }
@media (max-width: 720px) {
  .ln-qbox { padding: var(--sienna-space-5) var(--sienna-space-5) var(--sienna-space-4); }
}

/* WebGL fallback */
.ln-fatal { position: fixed; inset: 0; z-index: var(--sienna-z-fatal); display: flex; align-items: center; justify-content: center;
  background: var(--sienna-ink); padding: var(--sienna-space-6); font-family: var(--sienna-serif); }
.ln-fatal-card { max-width: calc(var(--sienna-space-10) * 13); color: var(--sienna-ink); padding: var(--sienna-space-8);
  box-shadow: var(--sienna-shadow-lift); }
.ln-fatal-card h1 { margin: 0 0 var(--sienna-space-3); font-family: var(--sienna-font); font-size: var(--sienna-text-xl); color: var(--sienna-indigo); }
.ln-fatal-card p { margin: 0 0 var(--sienna-space-3); font-family: var(--sienna-serif); font-size: var(--sienna-text-md); line-height: 1.5; }
.ln-fatal-card code { font-size: var(--sienna-text-xs); background: var(--sienna-paper-lo); padding: 2px var(--sienna-space-2); border-radius: 4px; }
`;

const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

export function showWebGLError(err) {
  injectTokens();
  if (!document.getElementById('ln-css')) {
    const st = document.createElement('style'); st.id = 'ln-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const wrap = document.createElement('div');
  wrap.className = 'ln-fatal';
  const card = document.createElement('div');
  card.className = 'ln-fatal-card';
  const h1 = document.createElement('h1'); h1.textContent = 'Sienna could not start 3D graphics (WebGL)';
  const p1 = document.createElement('p'); p1.textContent = 'Sienna renders its painted Tuscan record shop with WebGL2, which is currently unavailable on this system or disabled in your GPU driver.';
  const p2 = document.createElement('p'); p2.textContent = `Details: ${String(err?.message ?? err ?? 'WebGL context creation failed')}`;
  card.setAttribute('role', 'alert');
  card.append(h1, p1, p2);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
  paperSurface(card, { seed: 91, elevation: 'lift' });
}

export function createLiner({ music, onQueueOpen = null, onQueueCovers = null, onQueueClose = null, getDrawerPos = null, onPickQueue = null } = {}) {
  injectTokens();
  if (!document.getElementById('ln-css')) {
    const st = document.createElement('style'); st.id = 'ln-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  const lyricsSheet = createSheet({ title: 'Liner notes', seed: 43,
    width: 'min(calc(var(--sienna-space-10) * 16), 90vw)',
    onClose: () => { if (mode === 'lyrics') { mode = null; seq++; } },
  });
  const veil = lyricsSheet.el;
  veil.classList.add('ln-sheet');
  const scroll = lyricsSheet.body;
  const srcEl = document.createElement('div');
  srcEl.className = 'ln-src';
  const cue = createScrollCue(scroll, { parent: lyricsSheet.footer });
  lyricsSheet.footer.appendChild(srcEl);

  // ---- queue overlay ----
  const qveil = document.createElement('div');
  qveil.className = 'ln-qveil';
  qveil.innerHTML = `<div class="ln-qbackdrop"></div><div class="ln-qbox">
    <div class="ln-qtop"><div class="ln-qtitle"><span>Up next</span><div class="ln-qclose"></div></div></div>
  </div>`;
  document.body.appendChild(qveil);
  const qBackdrop = qveil.querySelector('.ln-qbackdrop');
  const qBox = qveil.querySelector('.ln-qbox');
  const qCloseWrap = qveil.querySelector('.ln-qclose');
  const queueList = createList({ label: 'Up next', pinNowPlaying: true, showNowBadge: true,
    showIndex: true, showKind: true, lines: true, onPick: pickQueue,
  });
  const queueCarousel = createCoverCarousel({ orientation: 'horizontal',
    onPick: idx => pickQueue(renderedItems[idx], idx),
    drawer: { open: () => drawerReady, position: drawerOrigin, close() {} },
  });
  qBox.prepend(queueCarousel.el);
  qBox.appendChild(queueList.el);
  const qScroll = queueList.scrollEl;
  paperSurface(qBox, { seed: 61, elevation: 'lift', amp: 5, cap: 10, crop: true });
  const qSheet = unrollSheet(qBox);

  let mode = null; // null | 'lyrics' | 'queue'
  let qCloseTimer = 0;
  let qRefreshTimer = 0;
  let qRetryTimer = 0;
  let renderedItems = [];
  let drawerReady = null, queueOpener = null, nowIndex = -1;
  let focusQueueAfterSettings = false;
  let seq = 0;
  const showingCovers = () => !queueCarousel.el.hidden;

  const closeBtn = inkButton('Close', { onClick: () => close() });
  lyricsSheet.footer.appendChild(closeBtn);
  const qCloseBtn = stamp('close', { label: 'Close', tooltip: 'Close (Esc)', onClick: () => close() });
  const qNowBtn = inkButton('Now playing', { size: 'sm', icon: 'song', onClick: () => {
    queueCarousel.center(nowIndex);
    queueCarousel.listboxEl.focus({ preventScroll: true });
  } });
  qNowBtn.hidden = true;
  qCloseWrap.append(qNowBtn, qCloseBtn);

  qBox.addEventListener('click', (e) => e.stopPropagation());
  qBackdrop.addEventListener('click', () => close());

  function openLyricsSheet() {
    mode = 'lyrics';
    lyricsSheet.open();
    scroll.scrollTop = 0;
  }

  function drawerOrigin() {
    const pos = getDrawerPos?.();
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return pos;
    return { x: innerWidth * 0.16, y: innerHeight * 0.80 };
  }

  function closeQueueOverlay({ keepDrawer = false } = {}) {
    clearTimeout(qCloseTimer);
    clearTimeout(qRefreshTimer);
    clearTimeout(qRetryTimer);
    if (showingCovers()) queueCarousel.stop();
    else queueList.playDrawerFlight(drawerOrigin(), { entering: false });
    drawerReady = null;
    focusQueueAfterSettings = false;
    if (qveil.contains(document.activeElement)) {
      document.activeElement.blur();
      if (queueOpener?.isConnected) queueOpener.focus({ preventScroll: true });
    }
    qSheet.close({ delay: MOTION.dur.fast });
    qveil.classList.remove('show');
    qveil.classList.add('closing');
    qCloseTimer = setTimeout(() => {
      qveil.classList.remove('closing');
      if (!keepDrawer) onQueueClose?.();
    }, MOTION.dur.mid + MOTION.dur.fast);
  }

  function close({ keepDrawer = false } = {}) {
    if (!mode) return;
    const prev = mode;
    mode = null;
    if (prev === 'queue') setOverlayOpen(qveil, false);
    seq++;
    if (prev === 'lyrics') lyricsSheet.close();
    else if (prev === 'queue') closeQueueOverlay({ keepDrawer });
  }

  async function openLyrics(track) {
    if (mode === 'lyrics') { close(); return; }
    if (mode === 'queue') close();
    openLyricsSheet();
    return loadLyrics(track);
  }

  async function loadLyrics(track) {
    const my = ++seq;
    lyricsSheet.setTitle([track?.title || 'Liner notes', track?.artist].filter(Boolean).join(' · '));
    lyricsSheet.setDescription(track?.album || 'Lyrics');
    srcEl.textContent = '';
    const note = message => {
      const el = document.createElement('div');
      el.className = 'ln-empty';
      el.setAttribute('role', 'status');
      el.textContent = message;
      scroll.replaceChildren(el);
    };
    note('Looking up the liner notes…');
    if (!track?.videoId) { note('Play a record first to read its lyrics.'); return; }
    let res;
    try { res = await music.lyrics?.(track.videoId); }
    catch {
      if (my !== seq || mode !== 'lyrics') return;
      note('Could not load the lyrics just now.');
      scroll.appendChild(inkButton('Retry', { onClick: () => loadLyrics(track) }));
      cue.refresh();
      return;
    }
    if (my !== seq || mode !== 'lyrics') return;
    if (!res?.lyrics) { note('No lyrics are available for this track on YouTube Music.'); return; }
    const body = document.createElement('div');
    body.className = 'ln-lyrics';
    body.textContent = res.lyrics;
    scroll.replaceChildren(body);
    srcEl.textContent = res.source || '';
    cue.refresh();
  }

  function sameQueueTracks(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if ((a[i]?.videoId || a[i]?.title) !== (b[i]?.videoId || b[i]?.title)) return false;
    }
    return true;
  }

  function pickQueue(item, idx) {
    if (!item) return;
    if (onPickQueue) { close({ keepDrawer: true }); onPickQueue(item, idx); }
    else {
      if (item.videoId) music.play({ videoId: item.videoId, ...(item.playlistId ? { playlistId: item.playlistId } : {}), ...(item.params ? { params: item.params } : {}) });
      else music.command('queueIndex', item.index ?? idx);
      close();
    }
  }

  function applySelectedToDom(selectedIdx) {
    nowIndex = selectedIdx;
    qNowBtn.hidden = !showingCovers() || selectedIdx < 0;
    if (showingCovers()) queueCarousel.setNowPlaying(selectedIdx);
    else queueList.setNowPlaying(`queue-${selectedIdx}`);
  }

  function syncQueueSelection(videoId) {
    if (!videoId || !renderedItems.length) return false;
    const idx = renderedItems.findIndex((it) => it.videoId === videoId);
    if (idx < 0) return false;
    renderedItems.forEach((it, i) => { it.selected = i === idx; });
    applySelectedToDom(idx);
    return true;
  }

  function renderQueueView({ animate = false, preferred = -1 } = {}) {
    const focused = document.activeElement;
    const movingFocus = queueList.el.contains(focused) || queueCarousel.el.contains(focused) || focused === qNowBtn;
    const selectedIdx = renderedItems.findIndex(it => it.selected);
    if (settings.get('coverCarousel') && renderedItems.length) {
      queueList.el.hidden = true;
      queueCarousel.el.hidden = false;
      queueCarousel.setItems(renderedItems, 'Up next', { index: Math.max(0, preferred < 0 ? selectedIdx : preferred), entrance: animate });
      applySelectedToDom(selectedIdx);
      if ((animate && (focused === queueOpener || focused === document.body)) || queueList.el.contains(focused)) {
        queueCarousel.listboxEl.focus({ preventScroll: true });
      }
      return;
    }
    queueCarousel.stop();
    queueCarousel.el.hidden = true;
    queueList.el.hidden = false;
    const prevScroll = qScroll.scrollTop;
    queueList.setItems(renderedItems, { animate: false, active: preferred, emptyMessage: 'Nothing in the queue yet — pick a record to start one.' });
    applySelectedToDom(selectedIdx);
    if (animate) queueList.playDrawerFlight(drawerOrigin(), { entering: true });
    else qScroll.scrollTop = prevScroll;
    if (movingFocus) {
      (renderedItems.length ? queueList.listboxEl : qCloseBtn).focus({ preventScroll: true });
    }
  }

  function renderQueueItems(items, { animate = false } = {}) {
    const previous = showingCovers() ? renderedItems[queueCarousel.getActive()] : null;
    renderedItems = Array.isArray(items) ? items.map((it, i) => ({ ...it, kind: it.kind || 'song', id: `queue-${i}` })) : [];
    let preferred = -1;
    if (previous) {
      const matches = it => (it.videoId || it.title) === (previous.videoId || previous.title);
      if (previous.index != null) preferred = renderedItems.findIndex(it => it.index === previous.index && matches(it));
      if (preferred < 0) preferred = renderedItems.findIndex(matches);
    }
    renderQueueView({ animate, preferred });
  }

  settings.on('coverCarousel', () => {
    if (mode !== 'queue' || !renderedItems.length) return;
    const hadCovers = showingCovers();
    renderQueueView({ preferred: hadCovers ? queueCarousel.getActive() : queueList.getActive() });
    focusQueueAfterSettings = !hadCovers && showingCovers() && sheetOpen();
  });

  function restoreQueueFocusAfterSettings() {
    const restore = focusQueueAfterSettings && mode === 'queue' && showingCovers() && !sheetOpen();
    focusQueueAfterSettings = false;
    if (restore) queueCarousel.listboxEl.focus({ preventScroll: true });
  }

  async function refreshQueue({ retryIfStale = true, expectedVideoId = null } = {}) {
    if (mode !== 'queue') return;
    const my = seq;
    clearTimeout(qRetryTimer);
    const items = await (music.queue?.().catch(() => null) ?? Promise.resolve(null));
    if (my !== seq || mode !== 'queue' || !Array.isArray(items)) return;

    if (items.length && sameQueueTracks(renderedItems, items)) {
      let selectedIdx = items.findIndex((it) => it.selected);
      if (expectedVideoId && (selectedIdx < 0 || items[selectedIdx]?.videoId !== expectedVideoId)) {
        const byVid = items.findIndex((it) => it.videoId === expectedVideoId);
        if (byVid >= 0) selectedIdx = byVid;
      }
      renderedItems = items.map((it, i) => ({ ...it, kind: it.kind || 'song', id: `queue-${i}`, selected: i === selectedIdx }));
      if (selectedIdx >= 0 || showingCovers()) applySelectedToDom(selectedIdx);
    } else if (items.length || !renderedItems.length) {
      renderQueueItems(items, { animate: false });
    }

    if (retryIfStale && expectedVideoId) {
      const sel = items.find((it) => it.selected);
      if (!sel || sel.videoId !== expectedVideoId || items.length <= 1) {
        qRetryTimer = setTimeout(() => {
          refreshQueue({ retryIfStale: false, expectedVideoId });
        }, 550);
      }
    }
  }

  async function openQueue() {
    if (mode === 'queue') { close(); return; }
    if (mode === 'lyrics') close();
    const my = ++seq;
    clearTimeout(qCloseTimer);
    clearTimeout(qRefreshTimer);
    clearTimeout(qRetryTimer);
    mode = 'queue';
    queueOpener = document.activeElement;
    setOverlayOpen(qveil, true);
    renderedItems = [];

    const showStack = !settings.get('coverCarousel');
    const openDrawer = showStack || !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const itemsPromise = music.queue?.().catch(() => []) ?? Promise.resolve([]);
    const opened = openDrawer ? onQueueOpen?.({ showStack }) : null;
    drawerReady = !showStack && opened ? Promise.resolve(opened) : null;

    queueCarousel.stop();
    queueCarousel.el.hidden = true;
    queueList.el.hidden = false;
    qNowBtn.hidden = true;
    queueList.setItems([], { animate: false });
    qScroll.scrollTop = 0;
    qveil.classList.remove('closing');
    qveil.classList.add('show');
    qSheet.open();

    let loaded = false;
    const loadNoteTimer = setTimeout(() => {
      if (loaded || my !== seq || mode !== 'queue') return;
      queueList.setLoading('Loading queue…');
    }, 110);

    const items = await itemsPromise;
    loaded = true;
    clearTimeout(loadNoteTimer);
    if (my !== seq || mode !== 'queue') return;

    if (showStack && items?.length) onQueueCovers?.(items);
    renderQueueItems(items, { animate: true });
  }

  // Keep the Queue live-synced whenever the playing song, playlist, shuffle, or live queue order changes while open.
  let lastTrackKey = null;
  let lastShuffle = null;
  let lastQueueSig = null;
  music?.onState?.((s) => {
    if (!s || s.adPlaying) return;
    const trackKey = `${s.videoId || ''}|${s.playlistId || ''}`;
    const trackChanged = lastTrackKey !== null && trackKey !== lastTrackKey;
    const shuffleChanged = lastShuffle !== null && s.shuffle !== lastShuffle;
    const sigChanged = lastQueueSig !== null && s.queueSig !== undefined && s.queueSig !== lastQueueSig;
    lastTrackKey = trackKey;
    lastShuffle = s.shuffle;
    if (s.queueSig !== undefined) lastQueueSig = s.queueSig;
    if (mode === 'lyrics' && trackChanged) loadLyrics(s);
    if (mode !== 'queue') return;
    if (trackChanged || shuffleChanged || sigChanged) {
      if (trackChanged && s.videoId) syncQueueSelection(s.videoId);
      clearTimeout(qRefreshTimer);
      qRefreshTimer = setTimeout(() => {
        refreshQueue({ retryIfStale: true, expectedVideoId: s.videoId });
      }, 180);
    }
  });

  const banner = createBanner({ seed: 89 });
  function setStatus(message, onRetry = null, kind = onRetry ? 'error' : 'status') {
    if (!message) { banner.hide(); return; }
    banner.show({ message, kind, actionLabel: onRetry ? 'Retry' : null, onAction: onRetry });
  }

  addEventListener('keydown', (e) => {
    if (mode !== 'queue' || sheetOpen()) return;
    if (mode === 'queue' && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)) return;
    if (showingCovers() && e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const controls = [queueCarousel.listboxEl, ...(!qNowBtn.hidden ? [qNowBtn] : []), qCloseBtn];
      const index = controls.indexOf(document.activeElement);
      const next = index < 0 ? (e.shiftKey ? controls.length - 1 : 0)
        : (index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
      e.preventDefault();
      e.stopImmediatePropagation();
      controls[next].focus({ preventScroll: true });
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter'].includes(e.key)
      || showingCovers() && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (showingCovers() && e.target !== queueCarousel.listboxEl) return;
      if (e.key === 'Enter' && e.target.closest?.('button')) return;
      (showingCovers() ? queueCarousel : queueList).handleKeyDown(e);
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);

  return {
    openLyrics,
    openQueue,
    close,
    restoreQueueFocusAfterSettings,
    setStatus,
    isOpen: () => !!mode,
    isQueueCarouselOpen: () => mode === 'queue' && showingCovers(),
  };
}
