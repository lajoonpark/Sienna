// Brush-stroke words and the now-playing paper tag. The player itself is the 3D suitcase
// (suitcase.js); what lives here is its caption: title, artist and a progress line you can click to
// seek, plus the SIGN IN word. (createControls, the old stack of PLAY / SKIP / BACK / LIKE words,
// is kept until main.js stops using it.) Words are left as bare paper inside a dark watercolour
// brush stroke, the way a painter masks out whites.
import { rng } from './rand.js';
import { FONT, onLettering } from './style.js';
import { brushBand, TONES } from './brushpaint.js';

export const INK = '#2d3158';   // indigo wash
export const HOT = '#b4503a';   // terracotta on hover / liked
export const PAPER = '#fbf5e8';

// One broad brush stroke as an image: layered thin washes with ragged edges, a darker wet edge,
// dry-brush streaks trailing off the end and granulation speckle.
export function brushStroke(w, h, color, seed) {
  const c = document.createElement('canvas');
  const S = 2;
  c.width = w * S; c.height = h * S;
  const g = c.getContext('2d');
  g.scale(S, S);
  const r = rng(seed);
  const walk = (n, amp) => { let v = 0; return Array.from({ length: n }, () => (v = Math.max(-amp, Math.min(amp, v + (r() - 0.5) * amp * 0.9)))); };
  const step = 6;
  const n = Math.ceil(w / step) + 1;
  const x0 = h * 0.18, x1 = w - h * 0.3;
  let last = null;
  g.fillStyle = color;
  for (let pass = 0; pass < 12; pass++) {
    const top = walk(n, 3.5), bot = walk(n, 3.5);
    const p = new Path2D();
    const sk = h * 0.16; // the stroke leans like a fast italic swipe
    p.moveTo(x0 + sk + r() * 6, 5 + top[0]);
    for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i / (n - 1)); p.lineTo(x + sk, 5 + top[i] + pass * 0.15); }
    p.quadraticCurveTo(x1 + sk + h * 0.25, h * 0.45, x1 - sk * 0.2, h - 5 + bot[n - 1]);
    for (let i = n - 1; i >= 0; i--) { const x = x0 + (x1 - x0) * (i / (n - 1)); p.lineTo(x - sk, h - 5 + bot[i] - pass * 0.15); }
    p.quadraticCurveTo(x0 - sk - h * 0.2, h * 0.55, x0 + sk + r() * 6, 5 + top[0]);
    g.globalAlpha = 0.11;
    g.fill(p);
    last = p;
  }
  // wet edge: pigment pooled where the wash dried
  g.globalAlpha = 0.35;
  g.strokeStyle = color;
  g.lineWidth = 1.6;
  g.stroke(last);
  // dry brush streaks off the end of the stroke
  for (let i = 0; i < 9; i++) {
    const y = 8 + r() * (h - 16);
    g.globalAlpha = 0.25 + r() * 0.35;
    g.lineWidth = 0.8 + r() * 2.2;
    g.beginPath();
    g.moveTo(x1 - 20, y);
    g.lineTo(x1 + r() * h * 0.5, y + (r() - 0.5) * 3);
    g.stroke();
  }
  // granulation
  g.globalAlpha = 0.18;
  for (let i = 0; i < w * h * 0.03; i++) {
    g.fillRect(x0 + r() * (x1 - x0), 4 + r() * (h - 8), 0.6 + r() * 1.2, 0.6 + r() * 1.2);
  }
  return c.toDataURL();
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
.cad-tag .cap { pointer-events: auto; padding: 8px 20px 10px 16px; max-width: 100%; box-sizing: border-box; min-width: 200px;
  background: ${PAPER}; color: #2b2436;
  clip-path: polygon(0 6%, 18% 0, 47% 4%, 72% 0, 100% 5%, 98% 52%, 100% 96%, 66% 100%, 38% 95%, 9% 100%, 2% 60%);
  filter: drop-shadow(0 2px 0 rgba(60,40,30,.15)); transform: rotate(-2deg); transition: opacity .4s; }
.cad-tag.mini .cap { width: 100%; padding: 12px 26px 12px 24px; clip-path: none; filter: none; background: var(--cap) 0 0 / 100% 100% no-repeat; }
.cad-tag .cap .t { font-size: 27px; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cad-tag .cap .a { font-size: 19px; color: #7a5a40; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cad-tag .cap .bar { position: relative; height: 14px; margin-top: 5px; cursor: pointer; }
.cad-tag .cap .bar::before { content: ''; position: absolute; left: 0; right: 0; top: 5px; height: 2px; background: rgba(45,49,88,.2); border-radius: 2px; transition: height .15s, top .15s; }
.cad-tag .cap .bar:hover::before { top: 4px; height: 4px; }
.cad-tag .cap .bar i { position: absolute; left: 0; top: 3px; height: 6px; border-radius: 3px 6px 6px 3px; background: ${INK}; opacity: .85; transition: background .15s, height .15s, top .15s; }
.cad-tag .cap .bar:hover i { top: 2px; height: 8px; background: ${HOT}; }
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

// Title / artist / progress line on a torn paper tag, and the SIGN IN word when needed.
//   variant 'shop': fixed beside the suitcase in the bottom-left; 'mini': inside the small window's card.
export function createCaption({ parent = document.body, variant = 'shop', onSeek, onSignIn } = {}) {
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
  cap.innerHTML = '<div class="t"></div><div class="a"></div><div class="bar"><i></i></div>';
  turn.append(signin, cap);
  parent.appendChild(root);
  const capT = cap.querySelector('.t'), capA = cap.querySelector('.a'), bar = cap.querySelector('.bar'), fill = cap.querySelector('.bar i');

  const paint = () => {
    const { width, height } = signin.getBoundingClientRect();
    if (!width) return;
    const [cold, hot] = signin.querySelectorAll('.plate');
    cold.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), INK, 41)})`;
    hot.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), HOT, 41)})`;
  };
  // The small window's tag is brushed like its card; the shop's stays torn paper for now.
  let paintedW = 0;
  const paintCap = () => {
    const { width, height } = cap.getBoundingClientRect();
    const barW = bar.offsetWidth;
    if (variant !== 'mini' || !width || !barW || paintedW === width) return;
    paintedW = width;
    root.style.setProperty('--cap', `url(${brushBand(Math.ceil(width), Math.ceil(height), { tones: TONES.paper, seed: 61, rows: 3 })})`);
    root.style.setProperty('--barw', `${barW}px`);
    const line = (tones, seed) => `url(${brushBand(barW, 16, { tones, seed, rows: 1 })})`;
    root.style.setProperty('--track', line(['#dcd2c0', '#e2d9c8', '#d5cab6'], 62));
    root.style.setProperty('--fill', line(TONES.ink, 63));
    root.style.setProperty('--fillhot', line(TONES.hot, 64));
  };
  const fontReady = (document.fonts?.load(`38px ${FONT}`) ?? Promise.resolve()).then(() => { paint(); paintCap(); }, () => { paint(); paintCap(); });
  if (variant === 'mini') new ResizeObserver(() => fontReady.then(paintCap)).observe(cap);
  onLettering(root, () => { paint(); paintedW = 0; paintCap(); }); // Settings > Lettering

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
      root.style.maxWidth = `${Math.round(maxWidth)}px`;
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
    setScrub(p) { scrubP = p; fill.style.width = `${p == null ? lastP : p * 100}%`; },
    setState(s, { real = false } = {}) {
      const show = real && s.ready && !s.signedIn ? '' : 'none';
      if (signin.style.display !== show) { signin.style.display = show; if (!show) fontReady.then(paint); }
      const has = !!(s.title || s.adPlaying);
      cap.classList.toggle('empty', !has);
      capT.textContent = s.adPlaying ? 'A short ad…' : s.title ?? '';
      capA.textContent = s.adPlaying ? 'your record plays next' : [s.artist, s.album].filter(Boolean).join(' · ');
      duration = s.duration || 0;
      lastP = duration ? Math.min(100, (s.position / duration) * 100) : 0;
      if (scrubP == null) fill.style.width = `${lastP}%`;
    },
  };
}
