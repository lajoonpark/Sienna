// The now-playing paper tag beside the suitcase. The player itself is the 3D suitcase
// (suitcase.js); what lives here is its caption: title, artist and a progress line you can click to
// seek, plus the SIGN IN word. Words are left as bare cream inside thick opaque oil-paint dabs.
import { FONT, onLettering } from './style.js';
import { dabCluster, TONES } from './brushpaint.js';
import { COLORS, TYPE, injectTokens } from './ui/tokens.js';
import { brushStroke } from './ui/brush.js';

export const INK = COLORS.indigo;       // indigo oil paint
export const HOT = COLORS.terracotta;   // terracotta on hover / liked
export const PAPER = COLORS.paper;

// ---- the paper caption beside the suitcase ----
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
  background: var(--sienna-paper); color: var(--sienna-ink);
  clip-path: polygon(0 5%, 18% 0, 47% 3%, 72% 0, 100% 4%, 99% 52%, 100% 96%, 70% 100%, 38% 97%, 2% 100%, 1% 56%);
  filter: drop-shadow(var(--sienna-shadow-rest)); transform: rotate(var(--sienna-tilt-lg)); transition: opacity var(--sienna-dur-mid); }
.cad-tag.mini .cap { width: 100%; padding: var(--sienna-space-3) var(--sienna-space-6) var(--sienna-space-4) var(--sienna-space-6); clip-path: none; filter: drop-shadow(var(--sienna-shadow-rest)); background: var(--cap) 0 0 / 100% 100% no-repeat; }
.cad-tag .cap .t { font-size: var(--sienna-text-lg); line-height: 1.08; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cad-tag .cap .a { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); line-height: 1.3; color: var(--sienna-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* a title still too long once shrunk (fitLine) takes a second line, and only the end of that one is cut */
.cad-tag .cap .t.wrap { white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; padding-bottom: 2px; }
.cad-tag .cap .bar { position: relative; height: 14px; margin-top: var(--sienna-space-1); cursor: pointer; }
.cad-tag .cap .bar::before { content: ''; position: absolute; left: 0; right: 0; top: 5px; height: 2px; background: rgba(45,49,88,.22); border-radius: 2px; transition: height var(--sienna-dur-fast), top var(--sienna-dur-fast); }
.cad-tag .cap .bar:hover::before { top: 4px; height: 4px; }
.cad-tag .cap .bar i { position: absolute; left: 0; top: 3px; height: 6px; border-radius: 3px 6px 6px 3px; background: var(--sienna-indigo); opacity: .9; transition: background var(--sienna-dur-fast), height var(--sienna-dur-fast), top var(--sienna-dur-fast); }
.cad-tag .cap .bar:hover i { top: 2px; height: 8px; background: var(--sienna-terracotta); }
.cad-tag .cap .meta { display: flex; align-items: center; justify-content: space-between; gap: var(--sienna-space-2); margin-top: var(--sienna-space-1); padding-bottom: 2px;
  font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); color: var(--sienna-ink-3); line-height: 1.25; }
.cad-tag .cap .time { white-space: nowrap; font-variant-numeric: lining-nums tabular-nums; }
.cad-tag .cap .tools { display: flex; align-items: center; gap: var(--sienna-space-2); }
.cad-tag .cap .tool { pointer-events: auto; border: 0; background: none; padding: 2px var(--sienna-space-1); margin: 0; cursor: pointer;
  font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-weight: 600; line-height: 1.15; color: var(--sienna-ink-2); border-radius: 3px;
  transition: color var(--sienna-dur-fast), transform var(--sienna-dur-fast); }
.cad-tag .cap .tool:hover { color: var(--sienna-terracotta); transform: translateY(-1px); }
.cad-tag .cap .tool.on { color: var(--sienna-terracotta); text-decoration: underline; text-underline-offset: 2px; }
.cad-tag .cap.empty { opacity: 0; pointer-events: none; }
/* the small window's progress line is a pull of the brush, shown as far as the song has got */
.cad-tag.mini .cap .bar { height: 16px; }
.cad-tag.mini .cap .bar::before, .cad-tag.mini .cap .bar:hover::before { top: 0; height: 100%; background: var(--track) 0 0 / 100% 100% no-repeat; border-radius: 0; }
.cad-tag.mini .cap .bar i, .cad-tag.mini .cap .bar:hover i { top: 0; height: 100%; opacity: 1; border-radius: 0; background: var(--fill) 0 0 / var(--barw) 100% no-repeat;
  mask-image: linear-gradient(to left, transparent, #000 7px); }
.cad-tag.mini .cap .bar:hover i { background-image: var(--fillhot); }
.cad-tag button { pointer-events: auto; position: relative; border: 0; padding: 0; background: none; cursor: pointer;
  font-family: var(--sienna-font); color: var(--sienna-paper); line-height: 1; letter-spacing: .02em; margin-left: var(--sienna-space-2);
  transition: transform var(--sienna-dur-fast) var(--sienna-ease-pop); }
.cad-tag button .plate { position: absolute; inset: 0; background-size: 100% 100%; transition: opacity var(--sienna-dur-mid); }
.cad-tag button .plate.hot { opacity: 0; }
.cad-tag button:hover .plate.hot { opacity: 1; }
.cad-tag button:hover { transform: translateX(5px) rotate(var(--sienna-tilt-md)); }
.cad-tag button:active { transform: translateX(3px) scale(.97); }
.cad-tag button span { position: relative; display: block; text-shadow: 0 0 1px rgba(248,241,226,.7); font-size: var(--sienna-text-xl); padding: var(--sienna-space-1) var(--sienna-space-10) var(--sienna-space-1) var(--sienna-space-6); }
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
  const signin = document.createElement('button');
  signin.style.display = 'none';
  signin.innerHTML = '<div class="plate"></div><div class="plate hot"></div><span>SIGN IN</span>';
  signin.addEventListener('click', (e) => { e.stopPropagation(); onSignIn?.(); });
  const cap = document.createElement('div');
  cap.className = 'cap empty';
  cap.innerHTML = '<div class="t"></div><div class="a"></div><div class="bar"><i></i></div><div class="meta"><span class="time"></span><span class="tools"></span></div>';
  turn.append(signin, cap);
  parent.appendChild(root);
  const capT = cap.querySelector('.t'), capA = cap.querySelector('.a'), bar = cap.querySelector('.bar'), fill = cap.querySelector('.bar i');
  const timeEl = cap.querySelector('.time'), toolsEl = cap.querySelector('.tools');

  const toolBtns = {};
  const addTool = (id, label, title, click) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.tabIndex = -1;
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); click(); });
    toolsEl.appendChild(b);
    toolBtns[id] = b;
  };
  if (onCommand) {
    addTool('mute', 'Mute', 'Mute / Unmute (M)', () => onCommand('mute'));
    addTool('shuffle', 'Shuffle', 'Toggle shuffle', () => onCommand('shuffle'));
    addTool('repeat', 'Repeat', 'Cycle repeat (Off / All / One)', () => onCommand('repeat'));
  }
  if (onQueue) addTool('queue', 'Queue', 'Up next', () => onQueue());
  if (onLyrics) addTool('lyrics', 'Lyrics', 'Liner notes & lyrics', () => onLyrics());

  const paint = () => {
    const { width, height } = signin.getBoundingClientRect();
    if (!width) return;
    const [cold, hot] = signin.querySelectorAll('.plate');
    cold.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), COLORS.indigo, 41)})`;
    hot.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), COLORS.terracotta, 41)})`;
  };
  // The small window's tag is painted in an even oil coat with subtle overlap lines like the app buttons.
  let paintedW = 0, paintedH = 0;
  const paintCap = () => {
    const { width, height } = cap.getBoundingClientRect();
    const barW = bar.offsetWidth;
    if (variant !== 'mini' || !width || !barW || (paintedW === width && paintedH === height)) return;
    paintedW = width; paintedH = height;   // a title taking a second line makes the band taller
    root.style.setProperty('--cap', `url(${dabCluster(Math.ceil(width), Math.ceil(height), { tones: [COLORS.paper], seed: 61, rows: 3, tilt: 0.05, overlap: 0.56, minCols: 3, impasto: 0.28, soft: true, solid: true })})`);
    root.style.setProperty('--barw', `${barW}px`);
    const line = (tones, seed, opts) => `url(${dabCluster(barW, 16, { tones, seed, rows: 1, tilt: 0.05, overlap: 0.56, minCols: 4, solid: true, ...opts })})`;
    root.style.setProperty('--track', line([TONES.track[0]], 62, { impasto: 0.28, soft: true }));
    root.style.setProperty('--fill', line([COLORS.indigo], 63, { impasto: 0.55, even: true }));
    root.style.setProperty('--fillhot', line([COLORS.terracotta], 64, { impasto: 0.55, even: true }));
  };
  const fit = () => { fitLine(capT, TYPE.lg, TYPE.md, 2); fitLine(capA, TYPE.sm, TYPE.xs, 1); };
  const fontReady = (document.fonts?.load(`${TYPE.xl}px ${FONT}`) ?? Promise.resolve()).then(() => { fit(); paint(); paintCap(); }, () => { fit(); paint(); paintCap(); });
  if (variant === 'mini') new ResizeObserver(() => fontReady.then(paintCap)).observe(cap);
  addEventListener('resize', () => fontReady.then(() => { fit(); paintCap(); }));
  onLettering(root, () => { fit(); paint(); paintedW = 0; paintCap(); }); // Settings > Lettering

  let duration = 0, scrubP = null, lastP = 0;
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
    tuck(on) { root.classList.toggle('tucked', on); },
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
      fill.style.width = `${p == null ? lastP : p * 100}%`;
      if (duration > 0) timeEl.textContent = `${fmtTime(p == null ? (lastP / 100) * duration : p * duration)} / ${fmtTime(duration)}`;
    },
    setState(s, { real = false } = {}) {
      const show = real && s.ready && !s.signedIn ? '' : 'none';
      if (signin.style.display !== show) { signin.style.display = show; if (!show) fontReady.then(paint); }
      const has = !!(s.title || s.adPlaying);
      cap.classList.toggle('empty', !has);
      const t = s.adPlaying ? 'A short ad…' : s.title ?? '';
      const a = s.adPlaying ? 'your record plays next' : [s.artist, s.album].filter(Boolean).join(' · ');
      if (capT.textContent !== t || capA.textContent !== a) { capT.textContent = t; capA.textContent = a; fit(); }
      duration = s.duration || 0;
      lastP = duration ? Math.min(100, (s.position / duration) * 100) : 0;
      if (scrubP == null) {
        fill.style.width = `${lastP}%`;
        timeEl.textContent = duration > 0 && !s.adPlaying ? `${fmtTime(s.position)} / ${fmtTime(duration)}` : '';
      }
      if (toolBtns.mute) {
        toolBtns.mute.classList.toggle('on', !!s.muted);
        toolBtns.mute.textContent = s.muted ? 'Muted' : 'Mute';
      }
      if (toolBtns.shuffle) toolBtns.shuffle.classList.toggle('on', !!s.shuffle);
      if (toolBtns.repeat) {
        const rep = s.repeat || 'OFF';
        toolBtns.repeat.classList.toggle('on', rep !== 'OFF');
        toolBtns.repeat.textContent = rep === 'ONE' ? 'Repeat 1' : rep === 'ALL' ? 'Repeat all' : 'Repeat';
      }
    },
  };
}
