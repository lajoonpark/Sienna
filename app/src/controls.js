// Oil-paint dab words and the now-playing paper tag. The player itself is the 3D suitcase
// (suitcase.js); what lives here is its caption: title, artist and a progress line you can click to
// seek, plus the SIGN IN word. Words are left as bare cream inside thick opaque oil-paint dabs.
import { FONT, onLettering } from './style.js';
import { dabCluster, TONES } from './brushpaint.js';

export const INK = '#2d3158';   // indigo oil paint
export const HOT = '#b4503a';   // terracotta on hover / liked
export const PAPER = '#fbf5e8';

function tonesFor(color) {
  if (color === INK) return TONES.ink;
  if (color === HOT) return TONES.hot;
  const n = parseInt(String(color).replace('#', ''), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return [
    rgb,
    [clamp(rgb[0] * 1.07 + 3), clamp(rgb[1] * 1.03 + 2), clamp(rgb[2] * 0.97)],
    [clamp(rgb[0] * 0.91), clamp(rgb[1] * 0.94), clamp(rgb[2] * 1.05 + 3)],
  ];
}

// Thick, opaque loaded oil-paint dab plate (used for menu buttons, Settings words, Sign In, and rack signs).
export function brushStroke(w, h, color, seed, { flipX = false } = {}) {
  return dabCluster(w, h, {
    tones: tonesFor(color),
    seed,
    rows: h > 64 ? 2 : 1,
    flipX,
    tilt: 0.05,
    overlap: 0.56,
    minCols: 2,
    // One even, opaque coat: varied tones, strong ridges and see-through tails made the overlaps show
    // as brighter and darker patches across a word.
    impasto: 0.55,
    even: true,
    solid: true,
  });
}

const CSS = `
.deck { position: fixed; left: 3.5vw; bottom: 6vh; perspective: 900px; perspective-origin: 20% 50%;
  pointer-events: none; opacity: 0; transition: opacity .9s ease; user-select: none; }
.deck.show { opacity: 1; }
.deck .stack { transform-style: preserve-3d; transform-origin: 0% 50%; will-change: transform;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.deck .caption { pointer-events: auto; margin: 0 0 10px 6px; padding: 10px 22px 12px 18px; max-width: 360px;
  background: ${PAPER}; color: #2b2436; font-family: var(--sienna-font);
  clip-path: polygon(0 6%, 18% 0, 47% 4%, 72% 0, 100% 5%, 98% 52%, 100% 96%, 66% 100%, 38% 95%, 9% 100%, 2% 60%);
  filter: drop-shadow(0 2px 0 rgba(60,40,30,.15)); transform: rotate(-1.5deg); transition: opacity .4s; }
.deck .caption .t { font-size: 30px; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.deck .caption .a { font-size: 20px; color: #7a5a40; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.deck .caption .bar { position: relative; height: 10px; margin-top: 6px; cursor: pointer; }
.deck .caption .bar::before { content: ''; position: absolute; left: 0; right: 0; top: 4px; height: 2px; background: rgba(45,49,88,.18); border-radius: 2px; }
.deck .caption .bar i { position: absolute; left: 0; top: 2px; height: 6px; border-radius: 3px 6px 6px 3px; background: ${INK}; opacity: .85; }
.deck .caption.empty { opacity: 0; pointer-events: none; }
.deck button { pointer-events: auto; position: relative; border: 0; padding: 0; background: none; cursor: pointer;
  font-family: var(--sienna-font); color: ${PAPER}; line-height: 1; letter-spacing: .02em;
  transition: transform .18s cubic-bezier(.3,1.6,.5,1); }
.deck button .plate { position: absolute; inset: 0; background-size: 100% 100%; transition: opacity .25s; }
.deck button .plate.hot { opacity: 0; }
.deck button:hover .plate.hot, .deck button.on .plate.hot { opacity: 1; }
.deck button:hover { transform: translateX(6px) translateZ(18px) rotate(-1deg); }
.deck button:active { transform: translateX(4px) translateZ(4px) scale(.97); }
.deck button span { position: relative; display: block; text-shadow: 0 0 1px rgba(251,245,232,.7); }
.deck button.big span { font-size: 84px; padding: 10px 74px 6px 40px; }
.deck button.small span { font-size: 44px; padding: 6px 48px 4px 30px; }
`;

const BUTTONS = [
  { id: 'signin', label: 'Sign in', size: 'small', indent: 0, hidden: true },
  { id: 'toggle', label: 'Play', size: 'big', indent: 0 },
  { id: 'next', label: 'Skip', size: 'small', indent: 34 },
  { id: 'previous', label: 'Back', size: 'small', indent: 14 },
  { id: 'like', label: 'Like', size: 'small', indent: 44 },
];

export function createControls({ onCommand, onSignIn }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const deck = document.createElement('div');
  deck.className = 'deck';
  const stack = document.createElement('div');
  stack.className = 'stack';
  deck.appendChild(stack);

  const caption = document.createElement('div');
  caption.className = 'caption empty';
  caption.innerHTML = '<div class="t"></div><div class="a"></div><div class="bar"><i></i></div>';
  stack.appendChild(caption);
  const capT = caption.querySelector('.t'), capA = caption.querySelector('.a'), capBar = caption.querySelector('.bar'), capFill = caption.querySelector('.bar i');

  const els = {};
  BUTTONS.forEach((b, i) => {
    const el = document.createElement('button');
    el.className = b.size;
    el.style.marginLeft = `${b.indent}px`;
    if (b.hidden) el.style.display = 'none';
    el.innerHTML = `<div class="plate"></div><div class="plate hot"></div><span>${b.label}</span>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); b.id === 'signin' ? onSignIn() : onCommand(b.id); });
    stack.appendChild(el);
    els[b.id] = el;
    el.dataset.seed = String(11 + i * 7);
  });
  document.body.appendChild(deck);

  // Plates are drawn to each button's size once the brush font has loaded (so the size is final).
  const paint = () => {
    for (const el of Object.values(els)) {
      const { width, height } = el.getBoundingClientRect();
      if (!width) continue;
      const seed = Number(el.dataset.seed);
      const [cold, hot] = el.querySelectorAll('.plate');
      cold.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), INK, seed)})`;
      hot.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), HOT, seed)})`;
    }
  };
  const fontReady = (document.fonts?.load(`84px ${FONT}`) ?? Promise.resolve()).then(paint, paint);
  onLettering(deck, paint); // Settings > Lettering: the words reflow (CSS var), so the plates are sized again

  let duration = 0;
  capBar.addEventListener('click', (e) => {
    const b = capBar.getBoundingClientRect();
    if (duration > 0) onCommand('seek', ((e.clientX - b.left) / b.width) * duration);
  });

  const setLabel = (id, text) => {
    const span = els[id].querySelector('span');
    if (span.textContent !== text) { span.textContent = text; fontReady.then(paint); }
  };

  return {
    ready: () => fontReady,
    show(on, instant = false) {
      if (instant) deck.style.transition = 'none';
      deck.classList.toggle('show', on);
    },
    // Turned in toward the middle of the screen; tilts after the cursor. tx, ty in -1..1.
    tilt(tx, ty) {
      stack.style.transform = `rotateY(${30 + tx * 10}deg) rotateX(${-ty * 8}deg) rotateZ(${-2 - tx * 1.5}deg)`;
    },
    setState(s, { real }) {
      const signIn = real && s.ready && !s.signedIn ? '' : 'none';
      if (els.signin.style.display !== signIn) {
        els.signin.style.display = signIn;
        if (!signIn) fontReady.then(paint); // it had no size while hidden, so no plate yet
      }
      setLabel('toggle', s.playerState === 1 || s.playerState === 3 ? 'Pause' : 'Play');
      const liked = s.like === 'LIKE';
      setLabel('like', liked ? 'Liked' : 'Like');
      els.like.classList.toggle('on', liked);
      const has = !!(s.title || s.adPlaying);
      caption.classList.toggle('empty', !has);
      capT.textContent = s.adPlaying ? 'A short ad…' : s.title ?? '';
      capA.textContent = s.adPlaying ? 'your record plays next' : [s.artist, s.album].filter(Boolean).join(' · ');
      duration = s.duration || 0;
      capFill.style.width = `${duration ? Math.min(100, (s.position / duration) * 100) : 0}%`;
    },
  };
}


// ---- the paper caption beside the suitcase ----
const TAG_CSS = `
.cad-tag { position: fixed; z-index: 2; pointer-events: none; opacity: 0; transition: opacity .9s ease; user-select: none;
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px; font-family: var(--sienna-font); }
.cad-tag.show { opacity: 1; }
.cad-tag.shop { transition: opacity .9s ease, transform .35s ease; }
.cad-tag.shop.show.tucked { opacity: 0; transform: translateY(28px); transition: opacity .3s ease, transform .35s ease; pointer-events: none; }
.cad-tag.shop.tucked .cap, .cad-tag.shop.tucked button { pointer-events: none; }
.cad-tag.shop { left: 27vw; bottom: 3.4vh; width: max-content; max-width: min(34vw, 440px);
  perspective: 900px; }   /* the player docks it beside the case with dock() */
.cad-tag.shop > .turn { transform-origin: 0% 50%; will-change: transform; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; max-width: 100%; }
.cad-tag.mini { position: absolute; left: 50%; bottom: 8.5%; transform: translateX(-50%); width: 76%; align-items: center; }
.cad-tag.mini > .turn { width: 100%; }   /* else a long title's one-line width stretches it past the card */
.cad-tag .cap { pointer-events: auto; padding: 8px 20px 10px 16px; max-width: 100%; box-sizing: border-box; min-width: 200px;
  background: ${PAPER}; color: #2b2436;
  clip-path: polygon(0 6%, 18% 0, 47% 4%, 72% 0, 100% 5%, 98% 52%, 100% 96%, 66% 100%, 38% 95%, 9% 100%, 2% 60%);
  filter: drop-shadow(0 2px 0 rgba(60,40,30,.15)); transform: rotate(-2deg); transition: opacity .4s; }
.cad-tag.mini .cap { width: 100%; padding: 12px 26px 12px 24px; clip-path: none; filter: drop-shadow(0 2px 3px rgba(45,30,20,.22)); background: var(--cap) 0 0 / 100% 100% no-repeat; }
.cad-tag .cap .t { font-size: 27px; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cad-tag .cap .a { font-size: 19px; color: #7a5a40; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* a title still too long once shrunk (fitLine) takes a second line, and only the end of that one is cut */
.cad-tag .cap .t.wrap { white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; padding-bottom: 2px; }
.cad-tag .cap .bar { position: relative; height: 14px; margin-top: 5px; cursor: pointer; }
.cad-tag .cap .bar::before { content: ''; position: absolute; left: 0; right: 0; top: 5px; height: 2px; background: rgba(45,49,88,.2); border-radius: 2px; transition: height .15s, top .15s; }
.cad-tag .cap .bar:hover::before { top: 4px; height: 4px; }
.cad-tag .cap .bar i { position: absolute; left: 0; top: 3px; height: 6px; border-radius: 3px 6px 6px 3px; background: ${INK}; opacity: .85; transition: background .15s, height .15s, top .15s; }
.cad-tag .cap .bar:hover i { top: 2px; height: 8px; background: ${HOT}; }
.cad-tag .cap .meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 3px; font-size: 16px; color: #7a5a40; line-height: 1; }
.cad-tag .cap .time { white-space: nowrap; font-variant-numeric: tabular-nums; }
.cad-tag .cap .tools { display: flex; align-items: center; gap: 7px; }
.cad-tag .cap .tool { pointer-events: auto; border: 0; background: none; padding: 1px 4px; margin: 0; cursor: pointer;
  font-family: var(--sienna-font); font-size: 16px; line-height: 1; color: #5a4636; opacity: .78; border-radius: 3px;
  transition: opacity .15s, color .15s, transform .15s; }
.cad-tag .cap .tool:hover { opacity: 1; color: ${HOT}; transform: translateY(-1px); }
.cad-tag .cap .tool.on { opacity: 1; color: ${HOT}; text-decoration: underline; text-underline-offset: 2px; }
.cad-tag.mini .cap .meta { font-size: 15px; margin-top: 4px; }
.cad-tag.mini .cap .tool { font-size: 15px; }
.cad-tag .cap.empty { opacity: 0; pointer-events: none; }
/* the small window's progress line is a pull of the brush, shown as far as the song has got */
.cad-tag.mini .cap .bar { height: 16px; }
.cad-tag.mini .cap .bar::before, .cad-tag.mini .cap .bar:hover::before { top: 0; height: 100%; background: var(--track) 0 0 / 100% 100% no-repeat; border-radius: 0; }
.cad-tag.mini .cap .bar i, .cad-tag.mini .cap .bar:hover i { top: 0; height: 100%; opacity: 1; border-radius: 0; background: var(--fill) 0 0 / var(--barw) 100% no-repeat;
  mask-image: linear-gradient(to left, transparent, #000 7px); }
.cad-tag.mini .cap .bar:hover i { background-image: var(--fillhot); }
.cad-tag button { pointer-events: auto; position: relative; border: 0; padding: 0; background: none; cursor: pointer;
  font-family: var(--sienna-font); color: ${PAPER}; line-height: 1; letter-spacing: .02em; margin-left: 10px;
  transition: transform .18s cubic-bezier(.3,1.6,.5,1); }
.cad-tag button .plate { position: absolute; inset: 0; background-size: 100% 100%; transition: opacity .25s; }
.cad-tag button .plate.hot { opacity: 0; }
.cad-tag button:hover .plate.hot { opacity: 1; }
.cad-tag button:hover { transform: translateX(5px) rotate(-1deg); }
.cad-tag button:active { transform: translateX(3px) scale(.97); }
.cad-tag button span { position: relative; display: block; text-shadow: 0 0 1px rgba(251,245,232,.7); font-size: 38px; padding: 5px 40px 3px 26px; }
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
    cold.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), INK, 41)})`;
    hot.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), HOT, 41)})`;
  };
  // The small window's tag is painted in an even oil coat with subtle overlap lines like the app buttons.
  let paintedW = 0, paintedH = 0;
  const paintCap = () => {
    const { width, height } = cap.getBoundingClientRect();
    const barW = bar.offsetWidth;
    if (variant !== 'mini' || !width || !barW || (paintedW === width && paintedH === height)) return;
    paintedW = width; paintedH = height;   // a title taking a second line makes the band taller
    root.style.setProperty('--cap', `url(${dabCluster(Math.ceil(width), Math.ceil(height), { tones: [PAPER], seed: 61, rows: 3, tilt: 0.05, overlap: 0.56, minCols: 3, impasto: 0.28, soft: true, solid: true })})`);
    root.style.setProperty('--barw', `${barW}px`);
    const line = (tones, seed, opts) => `url(${dabCluster(barW, 16, { tones, seed, rows: 1, tilt: 0.05, overlap: 0.56, minCols: 4, solid: true, ...opts })})`;
    root.style.setProperty('--track', line([TONES.track[0]], 62, { impasto: 0.28, soft: true }));
    root.style.setProperty('--fill', line([INK], 63, { impasto: 0.55, even: true }));
    root.style.setProperty('--fillhot', line([HOT], 64, { impasto: 0.55, even: true }));
  };
  const fit = () => { fitLine(capT, 27, 21, 2); fitLine(capA, 19, 15, 1); };
  const fontReady = (document.fonts?.load(`38px ${FONT}`) ?? Promise.resolve()).then(() => { fit(); paint(); paintCap(); }, () => { fit(); paint(); paintCap(); });
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
