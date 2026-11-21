import { setOverlayOpen } from './ui/sheet.js';
// Torn-paper overlay sheets matching Sienna's Settings & Tour aesthetic:
//   - Lyrics sheet with 3D paper-unfold animation (pulled from YouTube Music's `next` -> Lyrics tab)
//   - Up Next Queue list that emerges directly from the open suitcase bottom drawer
//   - Offline / load-error status banner with Retry button
//   - WebGL initialization fallback screen
import { injectTokens, MOTION } from './ui/tokens.js';
import { torn, paperSurface } from './ui/paper.js';
import { createList } from './ui/list.js';
import { stamp } from './ui/inputs.js';
import { word } from './settings-panel.js';
import { onCursorTilt, tiltCSS } from './cursortilt.js';
import { onLettering } from './style.js';

const CSS = `
.ln-veil { position: fixed; inset: 0; z-index: var(--sienna-z-sheet); display: flex; align-items: center; justify-content: center;
  background: var(--sienna-veil); perspective: 1500px; opacity: 0; visibility: hidden;
  transition: opacity var(--sienna-dur-mid) ease, visibility 0s var(--sienna-dur-mid); font-family: var(--sienna-font); color: var(--sienna-ink); }
.ln-veil.show { opacity: 1; visibility: visible; transition: opacity var(--sienna-dur-mid) ease; }
.ln-veil.closing { opacity: 0; visibility: visible; pointer-events: none; transition: opacity var(--sienna-dur-mid) ease; }
.ln-lean { display: flex; justify-content: center; will-change: transform; transform-style: preserve-3d; }
.ln-card { position: relative; width: min(560px, 90vw); max-height: min(640px, 84vh); box-sizing: border-box;
  display: flex; flex-direction: column; padding: var(--sienna-space-6) var(--sienna-space-8) var(--sienna-space-5); filter: drop-shadow(var(--sienna-shadow-lift));
  transform-style: preserve-3d; transform-origin: 50% 54%; transform: rotate(var(--sienna-tilt-sm)); }
.ln-veil.show .ln-card.unfold { animation: ln-unfold var(--sienna-dur-slow) var(--sienna-ease-out) both; }
.ln-veil.closing .ln-card.unfold { animation: ln-fold var(--sienna-dur-mid) var(--sienna-ease-in) both; }
@keyframes ln-unfold {
  0%   { opacity: 0; transform: translateY(34px) translateZ(-90px) rotateX(66deg) rotateY(-10deg) rotateZ(-3.2deg) scaleY(.48) scaleX(.92); filter: drop-shadow(0 22px 26px rgba(45,30,20,.38)); }
  38%  { opacity: 1; transform: translateY(-6px) translateZ(18px) rotateX(-15deg) rotateY(3.6deg) rotateZ(.9deg) scaleY(1.03) scaleX(1.01); filter: drop-shadow(0 14px 18px rgba(45,30,20,.32)); }
  68%  { opacity: 1; transform: translateY(2px) translateZ(3px) rotateX(4.8deg) rotateY(-1.4deg) rotateZ(-.85deg) scaleY(.994) scaleX(1); filter: drop-shadow(0 9px 15px rgba(45,30,20,.29)); }
  86%  { opacity: 1; transform: translateY(0) translateZ(0) rotateX(-1.4deg) rotateY(.4deg) rotateZ(-.25deg) scale(1); }
  100% { opacity: 1; transform: rotate(var(--sienna-tilt-sm)); filter: drop-shadow(var(--sienna-shadow-lift)); }
}
@keyframes ln-fold {
  0%   { opacity: 1; transform: rotate(var(--sienna-tilt-sm)); }
  100% { opacity: 0; transform: translateY(26px) translateZ(-70px) rotateX(-52deg) rotateY(7deg) rotateZ(2.4deg) scaleY(.52) scaleX(.93); }
}
.ln-paper { position: absolute; inset: 0; background: var(--sienna-paper); }
/* transient 3D unfolding flap: visible only during the unfold/fold motion, completely gone once settled */
.ln-flap { position: absolute; left: 0; right: 0; top: 0; height: 50%; background: linear-gradient(180deg, var(--sienna-paper) 0%, var(--sienna-paper-lo) 100%);
  transform-origin: 50% 100%; backface-visibility: visible; pointer-events: none; opacity: 0; z-index: 3; }
.ln-veil.show .ln-card.unfold .ln-flap { animation: ln-flap-open var(--sienna-dur-slow) var(--sienna-ease-out) both; }
.ln-veil.closing .ln-card.unfold .ln-flap { animation: ln-flap-close var(--sienna-dur-mid) var(--sienna-ease-in) both; }
@keyframes ln-flap-open {
  0%   { opacity: .96; transform: rotateX(-165deg); box-shadow: 0 12px 24px rgba(55,38,24,.28); }
  55%  { opacity: .62; transform: rotateX(-14deg); box-shadow: 0 4px 10px rgba(55,38,24,.12); }
  85%  { opacity: .18; transform: rotateX(4deg); box-shadow: none; }
  100% { opacity: 0; transform: rotateX(0deg); box-shadow: none; }
}
@keyframes ln-flap-close {
  0%   { opacity: 0; transform: rotateX(0deg); }
  35%  { opacity: .55; transform: rotateX(-55deg); }
  100% { opacity: .9; transform: rotateX(-145deg); }
}
.ln-head { position: relative; flex: none; margin: 0 0 var(--sienna-space-1); font-size: var(--sienna-text-xl); line-height: 1.05; color: var(--sienna-indigo); }
.ln-sub { position: relative; flex: none; margin: 0 0 var(--sienna-space-4); font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); line-height: 1.35; color: var(--sienna-ink-2); }
.ln-scroll { position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
  margin-right: -12px; padding: var(--sienna-space-2) var(--sienna-space-4) var(--sienna-space-3) 0;
  -webkit-mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent);
  mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent);
  scrollbar-width: thin; scrollbar-color: rgba(112,87,66,.45) transparent; }
.ln-scroll::-webkit-scrollbar { width: 7px; }
.ln-scroll::-webkit-scrollbar-thumb { background: rgba(112,87,66,.45); border-radius: 4px; }
.ln-lyrics { white-space: pre-wrap; font-family: var(--sienna-serif); font-size: var(--sienna-text-md); line-height: 1.55; color: var(--sienna-ink); user-select: text; }
.ln-src { position: relative; flex: none; margin-top: var(--sienna-space-3); font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); color: var(--sienna-ink-3); }
.ln-foot { position: relative; flex: none; display: flex; justify-content: flex-end; gap: var(--sienna-space-3); padding-top: var(--sienna-space-3); font-size: var(--sienna-text-lg); }
.ln-empty { font-family: var(--sienna-serif); font-size: var(--sienna-text-md); color: var(--sienna-ink-2); padding: var(--sienna-space-5) 0; }

/* ---- Queue overlay ---- */
.ln-qveil { position: fixed; inset: 0; z-index: var(--sienna-z-list); pointer-events: none; visibility: hidden; opacity: 0;
  transition: opacity var(--sienna-dur-mid), visibility var(--sienna-dur-mid); font-family: var(--sienna-font); }
.ln-qveil.show { pointer-events: auto; visibility: visible; opacity: 1; }
.ln-qveil.closing { visibility: visible; opacity: 1; }
.ln-qveil.closing .ln-qbackdrop { opacity: 0; transition: opacity var(--sienna-dur-mid); }
.ln-qbackdrop { position: absolute; inset: 0; background: var(--sienna-veil); backdrop-filter: var(--sienna-veil-filter); }
.ln-qbox { position: fixed; left: 50%; top: var(--sienna-space-10); transform: translateX(-50%);
  width: min(calc(var(--sienna-space-10) * 14), 90vw); max-height: calc(100dvh - var(--sienna-space-10) * 2);
  display: flex; flex-direction: column; }
.ln-qtop { display: flex; align-items: center; justify-content: space-between; gap: var(--sienna-space-3);
  margin: 0 var(--sienna-space-2) var(--sienna-space-2); }
.ln-qtitle { padding: var(--sienna-space-2) var(--sienna-space-5); font-size: var(--sienna-text-xl);
  display: flex; align-items: center; gap: var(--sienna-space-3);
  line-height: 1; color: var(--sienna-indigo); transform: rotate(var(--sienna-tilt-md)); }
.ln-qbox > .ui-list { min-height: 0; flex: 1; }
.ln-qbox .ui-list-scroll { min-height: 0; }

/* offline / error banner at top centre */
.ln-banner { position: fixed; top: 3vh; left: 50%; z-index: var(--sienna-z-banner); transform: translateX(-50%) rotate(var(--sienna-tilt-sm));
  display: none; align-items: center; gap: var(--sienna-space-4); padding: var(--sienna-space-3) var(--sienna-space-6); font-family: var(--sienna-font);
  color: var(--sienna-ink); filter: drop-shadow(var(--sienna-shadow-lift)); max-width: min(640px, 90vw); }
.ln-banner.show { display: flex; }
.ln-banner .ln-bpaper { position: absolute; inset: 0; background: var(--sienna-paper); z-index: -1; }
.ln-banner .ln-bmsg { font-family: var(--sienna-serif); font-size: var(--sienna-text-md); line-height: 1.3; }
.ln-banner .ln-bact { flex: none; font-size: var(--sienna-text-md); }
/* WebGL fallback */
.ln-fatal { position: fixed; inset: 0; z-index: var(--sienna-z-fatal); display: flex; align-items: center; justify-content: center;
  background: #1b1410; padding: var(--sienna-space-6); font-family: var(--sienna-serif); }
.ln-fatal-card { max-width: 520px; background: var(--sienna-paper); color: var(--sienna-ink); padding: var(--sienna-space-8); border-radius: 8px;
  box-shadow: var(--sienna-shadow-lift); }
.ln-fatal-card h1 { margin: 0 0 var(--sienna-space-3); font-family: var(--sienna-font); font-size: var(--sienna-text-xl); color: var(--sienna-indigo); }
.ln-fatal-card p { margin: 0 0 var(--sienna-space-3); font-size: var(--sienna-text-sm); line-height: 1.5; }
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
  card.append(h1, p1, p2);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
}

export function createLiner({ music, onQueueOpen = null, onQueueCovers = null, onQueueClose = null, getDrawerPos = null, onPickQueue = null } = {}) {
  injectTokens();
  if (!document.getElementById('ln-css')) {
    const st = document.createElement('style'); st.id = 'ln-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  // ---- lyrics sheet (3D paper unfold) ----
  const veil = document.createElement('div');
  veil.className = 'ln-veil';
  veil.innerHTML = `<div class="ln-lean"><div class="ln-card unfold"><div class="ln-paper"></div><div class="ln-flap"></div>
    <div class="ln-head"></div><div class="ln-sub"></div>
    <div class="ln-scroll"></div><div class="ln-src"></div>
    <div class="ln-foot"></div></div></div>`;
  document.body.appendChild(veil);
  const leaner = veil.querySelector('.ln-lean');
  const card = veil.querySelector('.ln-card');
  const paper = veil.querySelector('.ln-paper');
  const flap = veil.querySelector('.ln-flap');
  const head = veil.querySelector('.ln-head');
  const sub = veil.querySelector('.ln-sub');
  const scroll = veil.querySelector('.ln-scroll');
  const srcEl = veil.querySelector('.ln-src');
  const foot = veil.querySelector('.ln-foot');
  paper.style.clipPath = torn(43);
  flap.style.clipPath = torn(43, 4, 8);

  // ---- queue drawer-to-list overlay ----
  const qveil = document.createElement('div');
  qveil.className = 'ln-qveil';
  qveil.innerHTML = `<div class="ln-qbackdrop"></div><div class="ln-qbox">
    <div class="ln-qtop"><div class="ln-qtitle"><span>Up next</span><div class="ln-qclose"></div></div></div>
  </div>`;
  document.body.appendChild(qveil);
  const qBackdrop = qveil.querySelector('.ln-qbackdrop');
  const qBox = qveil.querySelector('.ln-qbox');
  const qTitle = qveil.querySelector('.ln-qtitle');
  const qCloseWrap = qveil.querySelector('.ln-qclose');
  const queueList = createList({ label: 'Up next', pinNowPlaying: true, showNowBadge: true, showIndex: true, showKind: true,
    onPick: (item, idx) => {
      if (onPickQueue) { close({ keepDrawer: true }); onPickQueue(item, idx); }
      else {
        if (item.videoId) music.play({ videoId: item.videoId, ...(item.playlistId ? { playlistId: item.playlistId } : {}), ...(item.params ? { params: item.params } : {}) });
        else music.command('queueIndex', item.index ?? idx);
        close();
      }
    },
  });
  qBox.appendChild(queueList.el);
  const qScroll = queueList.scrollEl;
  paperSurface(qTitle, { seed: 61 });

  let mode = null; // null | 'lyrics' | 'queue'
  let unlean = null;
  let closeTimer = 0;
  let qCloseTimer = 0;
  let qRefreshTimer = 0;
  let qRetryTimer = 0;
  let renderedItems = [];
  let seq = 0;

  const closeBtn = word('Close', 73, () => close());
  foot.appendChild(closeBtn);
  const qCloseBtn = stamp('close', { label: 'Close', tooltip: 'Close (Esc)', onClick: () => close() });
  qCloseWrap.appendChild(qCloseBtn);

  card.addEventListener('click', (e) => e.stopPropagation());
  veil.addEventListener('click', () => close());
  qBox.addEventListener('click', (e) => e.stopPropagation());
  qBackdrop.addEventListener('click', () => close());

  function openLyricsSheet() {
    clearTimeout(closeTimer);
    mode = 'lyrics';
    setOverlayOpen(veil, true);
    veil.classList.remove('closing');
    veil.classList.remove('show');
    void card.offsetWidth;
    veil.classList.add('show');
    scroll.scrollTop = 0;
    requestAnimationFrame(() => closeBtn.paint());
    unlean ??= onCursorTilt((x, y) => { leaner.style.transform = tiltCSS(x, y, 5); });
  }

  function closeLyricsSheet() {
    clearTimeout(closeTimer);
    veil.classList.remove('show');
    veil.classList.add('closing');
    closeTimer = setTimeout(() => { veil.classList.remove('closing'); }, 280);
    unlean?.(); unlean = null;
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
    queueList.playDrawerFlight(drawerOrigin(), { entering: false });
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
    setOverlayOpen(prev === 'lyrics' ? veil : qveil, false);
    seq++;
    if (prev === 'lyrics') closeLyricsSheet();
    else if (prev === 'queue') closeQueueOverlay({ keepDrawer });
  }

  async function openLyrics(track) {
    if (mode === 'lyrics') { close(); return; }
    if (mode === 'queue') close();
    const my = ++seq;
    head.textContent = track?.title || 'Liner notes';
    sub.textContent = [track?.artist, track?.album].filter(Boolean).join(' · ') || 'Lyrics';
    srcEl.textContent = '';
    scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'ln-empty', textContent: 'Looking up the liner notes…' }));
    openLyricsSheet();
    if (!track?.videoId) {
      scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'ln-empty', textContent: 'Play a record first to read its lyrics.' }));
      return;
    }
    const res = await music.lyrics?.(track.videoId).catch(() => null);
    if (my !== seq || mode !== 'lyrics') return;
    if (!res?.lyrics) {
      scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'ln-empty', textContent: 'No lyrics are available for this track on YouTube Music.' }));
      return;
    }
    const body = document.createElement('div');
    body.className = 'ln-lyrics';
    body.textContent = res.lyrics;
    scroll.replaceChildren(body);
    srcEl.textContent = res.source || '';
  }

  function sameQueueTracks(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if ((a[i]?.videoId || a[i]?.title) !== (b[i]?.videoId || b[i]?.title)) return false;
    }
    return true;
  }

  function applySelectedToDom(selectedIdx) {
    queueList.setNowPlaying(`queue-${selectedIdx}`);
  }

  function syncQueueSelection(videoId) {
    if (!videoId || !renderedItems.length) return false;
    const idx = renderedItems.findIndex((it) => it.videoId === videoId);
    if (idx < 0) return false;
    renderedItems.forEach((it, i) => { it.selected = i === idx; });
    applySelectedToDom(idx, { smoothScroll: true });
    return true;
  }

  function renderQueueItems(items, { animate = false } = {}) {
    const prevScroll = qScroll.scrollTop;
    renderedItems = Array.isArray(items) ? items.map((it, i) => ({ ...it, kind: it.kind || 'song', id: `queue-${i}` })) : [];
    queueList.setItems(renderedItems, { animate: false, emptyMessage: 'Nothing in the queue yet — pick a record to start one.' });
    const selectedIdx = renderedItems.findIndex(it => it.selected);
    applySelectedToDom(selectedIdx);
    if (animate) queueList.playDrawerFlight(drawerOrigin(), { entering: true });
    else qScroll.scrollTop = prevScroll;
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
      renderedItems = items.map((it, i) => ({ ...it, selected: i === selectedIdx }));
      if (selectedIdx >= 0) applySelectedToDom(selectedIdx, { smoothScroll: true });
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
    setOverlayOpen(qveil, true);
    renderedItems = [];

    // Start fetching the queue AND opening the drawer + launching the sweeping vinyls immediately
    // in parallel so the Queue menu loads right in front of the vinyls while the animation plays.
    const itemsPromise = music.queue?.().catch(() => []) ?? Promise.resolve([]);
    onQueueOpen?.();

    queueList.setItems([], { animate: false });
    qScroll.scrollTop = 0;
    qveil.classList.remove('closing');
    qveil.classList.add('show');

    let loaded = false;
    const loadNoteTimer = setTimeout(() => {
      if (loaded || my !== seq || mode !== 'queue') return;
      queueList.setLoading('Loading queue…');
    }, 110);

    const items = await itemsPromise;
    loaded = true;
    clearTimeout(loadNoteTimer);
    if (my !== seq || mode !== 'queue') return;

    if (items?.length) onQueueCovers?.(items);
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
    if (mode !== 'queue') return;
    if (trackChanged || shuffleChanged || sigChanged) {
      if (trackChanged && s.videoId) syncQueueSelection(s.videoId);
      clearTimeout(qRefreshTimer);
      qRefreshTimer = setTimeout(() => {
        refreshQueue({ retryIfStale: true, expectedVideoId: s.videoId });
      }, 180);
    }
  });

  // ---- offline / error status banner ----
  const banner = document.createElement('div');
  banner.className = 'ln-banner';
  const bpaper = document.createElement('div'); bpaper.className = 'ln-bpaper';
  bpaper.style.clipPath = torn(89, 4, 8);
  const bmsg = document.createElement('div'); bmsg.className = 'ln-bmsg';
  const bact = document.createElement('div'); bact.className = 'ln-bact';
  let retryCb = null;
  const retryBtn = word('Retry', 97, () => retryCb?.());
  bact.appendChild(retryBtn);
  banner.append(bpaper, bmsg, bact);
  document.body.appendChild(banner);

  function setStatus(message, onRetry = null) {
    retryCb = onRetry;
    if (!message) {
      banner.classList.remove('show');
      return;
    }
    bmsg.textContent = message;
    bact.style.display = onRetry ? '' : 'none';
    banner.classList.add('show');
    requestAnimationFrame(() => retryBtn.paint());
  }

  onLettering(veil, () => { closeBtn.paint(); retryBtn.paint(); });

  addEventListener('keydown', (e) => {
    if (!mode) return;
    if (mode === 'queue' && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)) return;
    if (mode === 'queue' && ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter'].includes(e.key)) {
      if (e.key === 'Enter' && e.target.closest?.('button')) return;
      queueList.handleKeyDown(e); e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);

  return {
    openLyrics,
    openQueue,
    close,
    setStatus,
    isOpen: () => !!mode,
  };
}
