// The now-playing paper tag beside the suitcase. The player itself is the 3D suitcase
// (suitcase.js); what lives here is its caption: title, artist and a progress line you can click to
// seek, plus the Sign in word.
import { FONT, onLettering } from './style.js';
import { dabCluster, TONES } from './brushpaint.js';
import { COLORS, SPACE, TYPE, injectTokens } from './ui/tokens.js';
import { brushButton } from './ui/brush.js';
import { paperSurface } from './ui/paper.js';
import { stamp } from './ui/inputs.js';
import { onOverlay, overlayOpen } from './ui/sheet.js';

// ---- the paper caption beside the suitcase ----
const lineCache = new Map();
const TAG_CSS = `
.cad-tag { position: fixed; z-index: var(--sienna-z-caption); pointer-events: none; opacity: 0; transition: opacity var(--sienna-dur-slow) ease; user-select: none;
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--sienna-space-1); font-family: var(--sienna-font); }
.cad-tag.show { opacity: 1; }
.cad-tag.shop { transition: opacity var(--sienna-dur-slow) ease, transform var(--sienna-dur-mid) var(--sienna-ease-out); }
.cad-tag.shop.show.tucked { opacity: 0; transform: translateY(28px); transition: opacity var(--sienna-dur-mid) ease, transform var(--sienna-dur-mid) var(--sienna-ease-out); pointer-events: none; }
.cad-tag.shop.tucked .cap, .cad-tag.shop.tucked button { pointer-events: none; }
.cad-tag.shop { left: 27vw; bottom: 3.4vh; width: max-content; max-width: min(34vw, 440px);
  perspective: 900px; }   /* the player docks it beside the case with dock() */
.cad-tag.shop > .turn { transform-origin: 0% 50%; will-change: transform; display: flex; flex-direction: column; align-items: flex-start; gap: var(--sienna-space-1); max-width: 100%; }
.cad-tag.mini { position: absolute; left: 50%; bottom: 8.5%; transform: translateX(-50%); width: 76%; align-items: center; }
.cad-tag.mini > .turn { width: 100%; }   /* else a long title's one-line width stretches it past the card */
.cad-tag .cap { pointer-events: auto; padding: var(--sienna-space-3) var(--sienna-space-5) var(--sienna-space-4) var(--sienna-space-5); max-width: 100%; box-sizing: border-box; min-width: 220px;
  color: var(--sienna-ink); transform: rotate(var(--sienna-tilt-lg)); transition: opacity var(--sienna-dur-mid); }
.cad-tag.mini .cap { width: 100%; }
.cad-tag .cap .t { font-size: var(--sienna-text-lg); line-height: 1.08; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cad-tag .cap .a { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); line-height: 1.3; color: var(--sienna-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* a title still too long once shrunk (fitLine) takes a second line, and only the end of that one is cut */
.cad-tag .cap .t.wrap { white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; padding-bottom: 2px; }
.cad-tag .cap .bar { position: relative; height: var(--sienna-space-4); margin-top: var(--sienna-space-1); cursor: pointer; }
.cad-tag .cap .bar::before { content: ''; position: absolute; inset: 0; background: var(--track) 0 0 / 100% 100% no-repeat; }
.cad-tag .cap .bar i { position: absolute; left: 0; top: 0; height: 100%; background: var(--fill) 0 0 / var(--barw) 100% no-repeat; }
.cad-tag .cap .bar:hover i { background-image: var(--fillhot); }
.cad-tag .cap .meta { display: flex; align-items: center; justify-content: space-between; gap: var(--sienna-space-2); margin-top: var(--sienna-space-1); padding-bottom: 2px;
  font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); color: var(--sienna-ink-3); line-height: 1.25; }
.cad-tag .cap .time { white-space: nowrap; font-variant-numeric: lining-nums tabular-nums; }
.cad-tag .cap .tools { display: flex; align-items: center; }
.cad-tag .cap.empty { display: none; }
.cad-tag .bar:focus-visible { box-shadow: var(--sienna-focus-ring); }
.cad-tag .ui-brush { pointer-events: auto; }
.cad-tag.tucked { visibility: hidden; }
.cad-tag .time { min-width: 10ch; }
`;

// Long lines on the tag: step the lettering down a few px until it fits on one line; if it still does not
// and `lines` is 2, let it wrap (clamped to two lines, the end cut with an ellipsis). The full text stays in the tooltip.
const fitLine = (el, big, small, lines) => {
  el.style.fontSize = '';
  el.classList.remove('wrap');
  el.title = el.textContent;
  if (!el.textContent || !el.clientWidth) return;
  for (let px = big; px >= small; px--) {
    el.style.fontSize = `${px}px`;
    if (el.scrollWidth <= el.clientWidth + 1) return;
  }
  if (lines > 1) el.classList.add('wrap');
};

const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const total = Math.floor(s);
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, '0');
  return `${m}:${sec}`;
};

// Title / artist / progress line on a torn paper tag, and the SIGN IN word when needed.
//   variant 'shop': fixed beside the suitcase in the bottom-left; 'mini': inside the small window's card.
export function createCaption({ parent = document.body, variant = 'shop', onSeek, onSignIn, onCommand, onQueue, onLyrics } = {}) {
  injectTokens();
  if (!document.getElementById('cad-tag-css')) {
    const st = document.createElement('style');
    st.id = 'cad-tag-css';
    st.textContent = TAG_CSS;
    document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = `cad-tag ${variant}`;
  const turn = document.createElement('div');
  turn.className = 'turn';
  root.appendChild(turn);
  const signin = brushButton('Sign in', { size: 'lg', onClick: () => onSignIn?.() });
  signin.style.display = 'none';
  const cap = document.createElement('div');
  cap.className = 'cap empty';
  cap.innerHTML = '<div class="t"></div><div class="a"></div><div class="bar"><i></i></div><div class="meta"><span class="time"></span><span class="tools"></span></div>';
  turn.append(signin, cap);
  parent.appendChild(root);
  paperSurface(cap, { seed: 61 });
  let suitcaseTucked = false;
  const syncTuck = () => root.classList.toggle('tucked', suitcaseTucked || overlayOpen());
  onOverlay(syncTuck);
  syncTuck();
  root.addEventListener('click', (e) => { e.stopPropagation(); if (e.detail) e.target.closest('button')?.blur(); });
  const capT = cap.querySelector('.t'), capA = cap.querySelector('.a'), bar = cap.querySelector('.bar'), fill = cap.querySelector('.bar i');
  const timeEl = cap.querySelector('.time'), toolsEl = cap.querySelector('.tools');

  const toolBtns = {};
  let muteIcon = 'volume', repeatIcon = 'repeat';
  const addTool = (id, iconName, label, click, toggle = false, tooltip) => {
    const b = stamp(iconName, { label, size: 'md', toggle, tooltip, onClick: click });
    toolsEl.appendChild(b);
    toolBtns[id] = b;
  };
  if (onCommand) {
    addTool('mute', 'volume', 'Mute', () => onCommand('mute'), true, (on) => `Mute (M): ${on ? 'on' : 'off'}`);
    addTool('shuffle', 'shuffle', 'Shuffle', () => onCommand('shuffle'), true);
    addTool('repeat', 'repeat', 'Repeat', () => onCommand('repeat'), true, 'Repeat: off');
  }
  if (onQueue) addTool('queue', 'queue', 'Up next', onQueue);
  if (onLyrics) addTool('lyrics', 'lyrics', 'Lyrics', onLyrics);

  let paintedW = 0;
  const paintCap = () => {
    const barW = Math.round(bar.offsetWidth);
    if (!barW || paintedW === barW) return;
    paintedW = barW;
    root.style.setProperty('--barw', `${barW}px`);
    const line = (tones, seed, opts) => {
      const key = `${barW}:${seed}`;
      if (!lineCache.has(key)) {
        lineCache.set(key, `url(${dabCluster(barW, SPACE[4], { tones, seed, rows: 1, tilt: 0.05, overlap: 0.56, minCols: 4, solid: true, ...opts })})`);
        if (lineCache.size > 96) lineCache.delete(lineCache.keys().next().value);
      }
      return lineCache.get(key);
    };
    root.style.setProperty('--track', line([TONES.track[0]], 62, { impasto: 0.28, soft: true }));
    root.style.setProperty('--fill', line([COLORS.indigo], 63, { impasto: 0.55, even: true }));
    root.style.setProperty('--fillhot', line([COLORS.terracotta], 64, { impasto: 0.55, even: true }));
  };
  const fit = () => { fitLine(capT, TYPE.lg, TYPE.md, 2); fitLine(capA, TYPE.sm, TYPE.xs, 1); };
  const fontReady = (document.fonts?.load(`${TYPE.xl}px ${FONT}`) ?? Promise.resolve()).then(() => { fit(); paintCap(); }, () => { fit(); paintCap(); });
  new ResizeObserver(() => fontReady.then(paintCap)).observe(cap);
  addEventListener('resize', () => fontReady.then(() => { fit(); paintCap(); }));
  onLettering(root, () => { fit(); paintCap(); }); // Settings > Lettering

  let duration = 0, scrubP = null, lastP = 0, lastAria = -Infinity;
  bar.tabIndex = 0;
  bar.setAttribute('role', 'slider');
  bar.setAttribute('aria-label', 'Playback position');
  bar.setAttribute('aria-valuemin', '0');
  const updateAria = (position) => {
    const now = performance.now();
    if (now - lastAria < 1000) return;
    lastAria = now;
    bar.setAttribute('aria-valuemax', String(duration));
    bar.setAttribute('aria-valuenow', String(Math.floor(position || 0)));
    bar.setAttribute('aria-valuetext', `${fmtTime(position)} of ${fmtTime(duration)}`);
  };
  bar.addEventListener('click', (e) => {
    const b = bar.getBoundingClientRect();
    if (duration > 0) onSeek?.(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * duration);
  });

  return {
    el: root,
    ready: () => fontReady,
    show(on, instant = false) {
      if (instant) root.style.transition = 'none';
      root.classList.toggle('show', on);
    },
    // Out of the way while the suitcase is tucked down (fades and drops a little).
    tuck(on) { suitcaseTucked = on; syncTuck(); },
    // Pin the tag beside the suitcase: CSS px from the left and the bottom of the view.
    dock({ left, bottom, maxWidth }) {
      root.style.left = `${Math.round(left)}px`;
      root.style.bottom = `${Math.round(bottom)}px`;
      const mw = `${Math.round(maxWidth)}px`;
      if (root.style.maxWidth !== mw) { root.style.maxWidth = mw; fit(); }
    },
    // Its box on screen while it shows something, else null.
    rect() {
      const has = !cap.classList.contains('empty') || signin.style.display !== 'none';
      return root.classList.contains('show') && has ? root.getBoundingClientRect() : null;
    },
    // Turned in toward the middle of the screen like the old word stack; tilts with the cursor (tx, ty in -1..1).
    tilt(tx, ty) {
      turn.style.transform = `rotateY(${14 + tx * 6}deg) rotateX(${-ty * 4}deg)`;
    },
    // Show this fraction instead of the player's position while the record is being dragged (null = follow the player).
    setScrub(p) {
      scrubP = p;
      updateAria((p == null ? lastP / 100 : p) * duration);
      fill.style.width = `${p == null ? lastP : p * 100}%`;
      if (duration > 0) timeEl.textContent = `${fmtTime(p == null ? (lastP / 100) * duration : p * duration)} / ${fmtTime(duration)}`;
    },
    setState(s, { real = false } = {}) {
      const show = real && s.ready && !s.signedIn ? '' : 'none';
      if (signin.style.display !== show) signin.style.display = show;
      const has = !!(s.title || s.adPlaying);
      cap.classList.toggle('empty', !has);
      const t = s.adPlaying ? 'A short ad…' : s.title ?? '';
      const a = s.adPlaying ? 'your record plays next' : [s.artist, s.album].filter(Boolean).join(' · ');
      if (capT.textContent !== t || capA.textContent !== a) { capT.textContent = t; capA.textContent = a; fit(); }
      duration = s.duration || 0;
      updateAria(scrubP == null ? s.position : scrubP * duration);
      lastP = duration ? Math.min(100, (s.position / duration) * 100) : 0;
      if (scrubP == null) {
        fill.style.width = `${lastP}%`;
        timeEl.textContent = duration > 0 && !s.adPlaying ? `${fmtTime(s.position)} / ${fmtTime(duration)}` : '';
      }
      if (toolBtns.mute) {
        if (toolBtns.mute.isOn() !== !!s.muted) toolBtns.mute.setOn(!!s.muted);
        const next = s.muted ? 'mute' : 'volume';
        if (muteIcon !== next) { muteIcon = next; toolBtns.mute.setIcon(next); }
      }
      if (toolBtns.shuffle && toolBtns.shuffle.isOn() !== !!s.shuffle) toolBtns.shuffle.setOn(!!s.shuffle);
      if (toolBtns.repeat) {
        const rep = s.repeat || 'OFF';
        const tip = `Repeat: ${rep.toLowerCase()}`;
        if (toolBtns.repeat.isOn() !== (rep !== 'OFF') || toolBtns.repeat.getAttribute('aria-label') !== tip) toolBtns.repeat.setOn(rep !== 'OFF', tip);
        const next = rep === 'ONE' ? 'repeat-one' : 'repeat';
        if (repeatIcon !== next) { repeatIcon = next; toolBtns.repeat.setIcon(next); }
      }
    },
  };
}
