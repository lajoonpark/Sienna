import { createSheet, setOverlayOpen, sheetOpen } from './ui/sheet.js';
// The player's overlays, on the crate-card kit (ui/crate.js):
//   - Lyrics ("liner notes") on a card, pulled from YouTube Music's `next` -> Lyrics tab
//   - Up next: the record carousel, its sleeves dealt out of the suitcase's open drawer and sent back
//     into it, or (Settings > Look > Cover carousel > List) a card listing the queue
//   - Offline / load-error status banner with Retry button
//   - WebGL initialization fallback screen
import { injectTokens, MOTION } from './ui/tokens.js';
import { paperSurface } from './ui/paper.js';
import { cardMotion, signboard, CARD_OUT_MS } from './ui/crate.js';
import { injectVeilCss, setLamp } from './ui/veil.js';
import { createList } from './ui/list.js';
import { createCoverCarousel, createCoverTilt } from './ui/cover-carousel.js';
import { listenForCoverPickSkip } from './ui/cover-pick-input.js';
import { inkButton, stamp } from './ui/inputs.js';
import { createBanner } from './ui/banner.js';
import { createScrollCue } from './ui/scroll-cue.js';
import { settings } from './settings.js';

const CSS = `
.ln-lyrics { white-space: pre-wrap; font-family: var(--sienna-serif); font-size: var(--sienna-text-md); line-height: 1.6; color: var(--sienna-ink); user-select: text; }
.ln-src { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); color: var(--sienna-ink-3); flex: 1; }
.ln-sheet .ui-scroll-cue { display: none; }   /* the fade at the bottom says there is more */
.ln-empty { font-family: var(--sienna-serif); font-size: var(--sienna-text-md); color: var(--sienna-ink-2); padding: var(--sienna-space-5) 0; }
/* ---- Up next ---- */
.ln-qveil { position: fixed; inset: 0; z-index: var(--sienna-z-list); pointer-events: none; visibility: hidden; opacity: 0;
  transition: opacity var(--sienna-dur-mid), visibility var(--sienna-dur-mid); font-family: var(--sienna-font); }
.ln-qveil.show { pointer-events: auto; visibility: visible; opacity: 1; transition: opacity var(--sienna-dur-mid); }
.ln-qveil.closing { visibility: visible; opacity: 1; transition: none; }
.ln-qbackdrop { transition: opacity var(--sienna-dur-mid); }
.ln-qveil.closing .ln-qbackdrop { opacity: 0; transition: opacity 620ms cubic-bezier(0.55, 0, 0.8, 0.45); }
.ln-qveil.picking .ln-qbackdrop { opacity: 0; transition: opacity var(--sienna-dur-mid); }
.ln-qveil.picking .ln-qbox > :is(.ui-paper-layer, .ln-qtop, .ui-list-foot) { visibility: hidden; }
/* the list view: a card */
.ln-qbox { position: fixed; top: var(--list-top, var(--sienna-space-10)); left: 0; right: 0; margin-inline: auto;
  box-sizing: border-box; padding: var(--sienna-space-4) var(--sienna-space-5) var(--sienna-space-2);
  width: min(560px, calc(100vw - var(--sienna-space-8)));
  max-height: calc(100dvh - var(--list-top, var(--sienna-space-10)) - var(--list-bottom, 72px));
  display: flex; flex-direction: column; }
.ln-qtop { order: -1; margin: 0 var(--sienna-space-1) var(--sienna-space-1); padding-bottom: var(--sienna-space-2);
  border-bottom: 2px solid var(--sienna-indigo); }
.ln-qtitle { display: flex; align-items: center; justify-content: space-between; gap: var(--sienna-space-3);
  font: 700 var(--sienna-text-xl)/1.1 var(--sienna-font); color: var(--sienna-indigo); }
.ln-qbox:not(.is-floating) .ln-qtitle > .crate-sign { padding: 0; background-image: none !important; filter: none; color: var(--sienna-indigo); }
.ln-qbox > .ui-list { min-height: 0; flex: 1; overflow: clip; }
.ln-qbox .ui-list-scroll { min-height: 0; }
.ln-qbox > .ui-list-foot { position: absolute; left: 0; right: 0; top: calc(100% + var(--sienna-space-3) + 2px);
  justify-content: center; padding: 0; border: 0; }
.ln-qclose { display: flex; align-items: center; gap: var(--sienna-space-3); }
.ln-qclose .ui-ink[hidden] { display: none; }
/* the carousel: no card, the sleeves float on the dimmed shop under a painted sign */
.ln-qbox.is-floating { inset: 0; width: auto; max-height: none; margin: 0;
  padding: var(--sienna-space-5) var(--sienna-space-6) var(--sienna-space-5); }
.ln-qbox.is-floating > .ui-paper-layer { display: none; }
.ln-qbox.is-floating > .ln-qtop { margin: 0 min(3vw, var(--sienna-space-8)); padding: 0; border: 0; position: relative; z-index: 2; }
.ln-qbox.is-floating .ln-qtitle > .crate-sign { font-size: var(--sienna-text-xl); color: var(--sienna-paper); }
.ln-qbox.is-floating :is(.ln-qclose .ui-ink, .ln-qclose .ui-stamp) { color: var(--sienna-on-night);
  text-shadow: 0 2px 6px rgba(10, 4, 8, 0.7); font-size: var(--sienna-text-md); }
.ln-qbox.is-floating .ln-qclose .ui-stamp { filter: drop-shadow(0 2px 4px rgba(10, 4, 8, 0.7)); }
.ln-qbox.is-floating :is(.ln-qclose .ui-ink:hover, .ln-qclose .ui-stamp:hover) { color: #f0b49c; }
.ln-qbox.is-floating .ui-list-note { color: var(--sienna-on-night); justify-content: center; }
.ln-qbox.is-floating > .ui-list-foot { display: none; }
.ln-qveil.show .ln-qbox.is-floating > .ln-qtop { animation: ln-sign-in 320ms var(--sienna-ease-out) both; }
@keyframes ln-sign-in { from { opacity: 0; transform: translateY(-12px); } }
.ln-qveil.closing .ln-qbox.is-floating > .ln-qtop { opacity: 0; transition: opacity var(--sienna-dur-fast); }
@media (max-width: 720px) {
  .ln-qbox { padding: var(--sienna-space-3) var(--sienna-space-4) var(--sienna-space-1);
    width: min(560px, calc(100vw - var(--sienna-space-10))); }
  .ln-qbox.is-floating { padding: var(--floating-top, var(--sienna-space-4)) var(--sienna-space-4) var(--sienna-space-6); }
  .ln-qbox.is-floating > .ln-qtop { margin: 0 var(--sienna-space-2); }
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
  paperSurface(card, { elevation: 'lift' });
}

export function createLiner({ music, onQueueOpen = null, onQueueCovers = null, onQueueClose = null, getDrawerPos = null, onPickQueue = null } = {}) {
  injectTokens();
  if (!document.getElementById('ln-css')) {
    const st = document.createElement('style'); st.id = 'ln-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  const lyricsSheet = createSheet({ title: 'Liner notes',
    width: 'min(calc(var(--sienna-space-10) * 15), 90vw)',
    onClose: () => { if (mode === 'lyrics') { mode = null; seq++; } },
  });
  const veil = lyricsSheet.el;
  veil.classList.add('ln-sheet');
  const scroll = lyricsSheet.body;
  const srcEl = document.createElement('div');
  srcEl.className = 'ln-src';
  const cue = createScrollCue(scroll, { parent: lyricsSheet.footer });
  lyricsSheet.footer.appendChild(srcEl);

  // ---- Up next ----
  injectVeilCss();
  const qveil = document.createElement('div');
  qveil.className = 'ln-qveil';
  qveil.innerHTML = `<div class="ln-qbackdrop sienna-veil"></div><div class="ln-qbox">
    <div class="ln-qtop"><div class="ln-qtitle"><span>Up next</span><div class="ln-qclose"></div></div></div>
  </div>`;
  document.body.appendChild(qveil);
  const qBackdrop = qveil.querySelector('.ln-qbackdrop');
  const qBox = qveil.querySelector('.ln-qbox');
  signboard(qveil.querySelector('.ln-qtitle > span'), { seed: 61 });
  const qCloseWrap = qveil.querySelector('.ln-qclose');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const queueList = createList({ label: 'Up next', pinNowPlaying: true, showNowBadge: true,
    showIndex: true, showKind: 'mixed', lines: true, onPick: pickQueue,
    footerHints: [['↑ ↓', 'choose'], ['Enter', 'play'], ['Esc', 'close']],
  });
  const queueCarousel = createCoverCarousel({ orientation: 'horizontal', fullSize: true,
    onPick: idx => pickQueue(renderedItems[idx], idx),
    onBackground: () => close(),
  });
  const qTilt = createCoverTilt(queueCarousel.stageEl);
  qBox.prepend(queueCarousel.el);
  qBox.append(queueList.el, queueList.footEl);
  const qScroll = queueList.scrollEl;
  paperSurface(qBox, { elevation: 'lift' });
  const qCard = cardMotion(qBox);

  let mode = null; // null | 'lyrics' | 'queue'
  let qCloseTimer = 0;
  let qRefreshTimer = 0;
  let qRetryTimer = 0;
  let renderedItems = [];
  let queueOpener = null, nowIndex = -1, picking = false, pendingPick = null;
  let focusQueueAfterSettings = false;
  let drawerOpenedAt = 0, closeRun = 0;
  let seq = 0;
  const showingCovers = () => !queueCarousel.el.hidden;

  const qCloseBtn = stamp('close', { label: 'Close', tooltip: 'Close (Esc)', tooltipPos: 'bottom', onClick: () => close() });
  const qNowBtn = inkButton('Now playing', { size: 'sm', icon: 'song', onClick: () => {
    queueCarousel.center(nowIndex);
    queueCarousel.listboxEl.focus({ preventScroll: true });
  } });
  qNowBtn.hidden = true;
  qCloseWrap.append(qNowBtn, qCloseBtn);

  // in the carousel the window round the sleeves is the card, so a press on bare shop closes it
  qBox.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === qBox && qBox.classList.contains('is-floating')) close();
  });
  qBackdrop.addEventListener('click', () => close());

  function openLyricsSheet() {
    mode = 'lyrics';
    lyricsSheet.open();
    scroll.scrollTop = 0;
  }

  function drawerOrigin() {
    const pos = getDrawerPos?.();
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return pos;
    return { x: innerWidth * 0.16, y: innerHeight * 0.80, size: Math.min(innerWidth, innerHeight) * 0.16 };
  }

  // the carousel floats on the dimmed shop; the list sits on a card
  function setFloating(on) {
    qBox.classList.toggle('is-floating', on);
    qBackdrop.classList.toggle('sienna-veil--night', on);
    if (on) qCard.reset();
    else if (mode === 'queue') qCard.open();
  }

  function closeQueueOverlay({ keepDrawer = false, instant = false } = {}) {
    clearTimeout(qCloseTimer);
    clearTimeout(qRefreshTimer);
    clearTimeout(qRetryTimer);
    queueList.stopScroll();
    const floating = qBox.classList.contains('is-floating');
    if (floating) queueCarousel.stop();
    focusQueueAfterSettings = false;
    if (qveil.contains(document.activeElement)) {
      document.activeElement.blur();
      if (queueOpener?.isConnected) queueOpener.focus({ preventScroll: true });
    }
    qveil.classList.remove('show');
    qveil.classList.add('closing');
    const run = ++closeRun;
    const done = () => {
      if (run !== closeRun) return;
      qveil.classList.remove('closing', 'picking');
      setOverlayOpen(qveil, false);
      if (!keepDrawer) onQueueClose?.();
    };
    // flying home, the sleeves keep the now-playing tag away until they land
    if (!floating || picking) setOverlayOpen(qveil, false);
    const after = ms => { qCloseTimer = setTimeout(done, ms); };
    if (instant) {
      queueCarousel.settle();
      qCard.reset();
      done();
    } else if (!floating) {
      qCard.close();
      after(CARD_OUT_MS + 40);
    } else if (picking) after(MOTION.dur.mid + 60);     // the picked record leaves; the others just fade
    else {
      // the sleeves go back into the drawer, then it shuts
      queueCarousel.leave({ origin: drawerOrigin }).then(() => { if (run === closeRun) after(calm.matches ? MOTION.dur.fast : 40); });
    }
  }

  // instant: the mini player is shutting, and nothing is drawn once it is hidden
  function close({ keepDrawer = false, instant = false } = {}) {
    if (!mode) {
      if (instant) queueCarousel.settle();   // sleeves still flying home from a close just before
      return;
    }
    const prev = mode;
    mode = null;
    seq++;
    if (prev === 'lyrics') lyricsSheet.close();
    else if (prev === 'queue') closeQueueOverlay({ keepDrawer, instant });
    picking = false;
    if (pendingPick) {
      const { item, idx, hide } = pendingPick;
      pendingPick = null;
      hide();
      onPickQueue(item, idx, { instant: true });
    }
  }

  async function openLyrics(track) {
    if (mode === 'lyrics') { close(); return; }
    if (mode === 'queue') close();
    openLyricsSheet();
    return loadLyrics(track);
  }

  async function loadLyrics(track) {
    const my = ++seq;
    lyricsSheet.setTitle(track?.title || 'Liner notes');
    const album = track?.album && track.album !== track.title ? track.album : '';
    lyricsSheet.setDescription([track?.artist, album && `on ${album}`].filter(Boolean).join(', ') || 'Lyrics');
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
    if (!item || mode !== 'queue' || picking) return;
    if (onPickQueue && showingCovers() && !calm.matches) {
      picking = true;
      qveil.classList.add('picking');
      const my = seq;
      const { done, hide } = queueCarousel.extractDisc(idx);
      pendingPick = { item, idx, hide };
      done.then(rect => {
        if (my !== seq || mode !== 'queue' || !rect) return;
        const from = { rect, ...qTilt.pose(), hideSleeve: hide };
        pendingPick = null;
        close({ keepDrawer: true });
        onPickQueue(item, idx, from);
      });
    } else if (onPickQueue) {
      const from = showingCovers() ? { instant: true } : undefined;
      close({ keepDrawer: true });
      onPickQueue(item, idx, from);
    }
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
      queueList.stopScroll();
      queueList.el.hidden = true;
      queueCarousel.el.hidden = false;
      setFloating(true);
      queueCarousel.setItems(renderedItems, 'Up next', { index: Math.max(0, preferred < 0 ? selectedIdx : preferred) });
      applySelectedToDom(selectedIdx);
      if (animate) queueCarousel.enter({ origin: drawerOrigin, notBefore: drawerOpenedAt + 170 });
      if ((animate && (focused === queueOpener || focused === document.body)) || queueList.el.contains(focused)) {
        queueCarousel.listboxEl.focus({ preventScroll: true });
      }
      return;
    }
    queueCarousel.stop();
    queueCarousel.el.hidden = true;
    queueList.el.hidden = false;
    setFloating(false);
    const prevScroll = qScroll.scrollTop;
    queueList.setItems(renderedItems, { active: preferred, emptyMessage: 'Nothing in the queue yet — pick a record to start one.' });
    applySelectedToDom(selectedIdx);
    if (!animate) qScroll.scrollTop = prevScroll;
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
    if (mode !== 'queue' || picking || !renderedItems.length) return;
    const hadCovers = showingCovers();
    renderQueueView({ preferred: hadCovers ? queueCarousel.getActive() : queueList.getActive() });
    focusQueueAfterSettings = !hadCovers && showingCovers() && sheetOpen();
  });

  function restoreQueueFocusAfterSettings() {
    const restore = focusQueueAfterSettings && mode === 'queue' && showingCovers() && !sheetOpen();
    focusQueueAfterSettings = false;
    if (!restore) return;
    const focused = document.activeElement;
    if (qBox.contains(focused) && !focused.matches(':disabled') && focused.getClientRects().length
      && getComputedStyle(focused).visibility === 'visible') return;
    queueCarousel.listboxEl.focus({ preventScroll: true });
  }

  async function refreshQueue({ retryIfStale = true, expectedVideoId = null } = {}) {
    if (mode !== 'queue') return;
    const my = seq;
    clearTimeout(qRetryTimer);
    const items = await (music.queue?.().catch(() => null) ?? Promise.resolve(null));
    if (my !== seq || mode !== 'queue' || picking || !Array.isArray(items)) return;

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
    if (picking) return;
    if (mode === 'queue') { close(); return; }
    if (mode === 'lyrics') close();
    const my = ++seq;
    closeRun++;
    clearTimeout(qCloseTimer);
    clearTimeout(qRefreshTimer);
    clearTimeout(qRetryTimer);
    mode = 'queue';
    queueOpener = document.activeElement;
    setOverlayOpen(qveil, true);
    renderedItems = [];

    const covers = settings.get('coverCarousel');
    const showStack = !covers;
    const openDrawer = showStack || !calm.matches;
    const itemsPromise = music.queue?.().catch(() => []) ?? Promise.resolve([]);
    if (openDrawer) onQueueOpen?.({ showStack });
    drawerOpenedAt = performance.now();
    setLamp(drawerOrigin());

    queueCarousel.stop();
    queueCarousel.el.hidden = true;
    queueList.el.hidden = false;
    qNowBtn.hidden = true;
    queueList.setItems([]);
    qScroll.scrollTop = 0;
    qveil.classList.remove('closing', 'picking');
    qveil.classList.add('show');
    setFloating(covers);

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
    if (mode !== 'queue' || picking) return;
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

  listenForCoverPickSkip(() => {
    if (!pendingPick) return false;
    close();
    return true;
  });
  addEventListener('keydown', (e) => {
    if (mode !== 'queue' || sheetOpen()) return;
    if (picking) { e.preventDefault(); e.stopImmediatePropagation(); return; }
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
    tilt(tx, ty) {
      if (mode === 'queue' && !picking) qTilt.update(tx, ty);
    },
    isOpen: () => !!mode,
    isQueueCarouselOpen: () => mode === 'queue' && showingCovers(),
  };
}
