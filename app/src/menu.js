// Section buttons: the shelf titles ("Quick picks", "Listen again"...) as paper words left inside
// indigo brush strokes, exactly like the player buttons in controls.js. Up to four stand on the left
// edge of the screen and up to four on the right, vertically centred, each stack turned in toward the
// middle and tilting after the cursor. The section you are in is painted terracotta, like a hover.
// A HOME word sits top-left whenever you are not home.
import { brushStroke, INK, PAPER } from './controls.js';
import { FONT } from './style.js';

const HOT = '#b4503a';
const PER_SIDE = 4;

const CSS = `
.mn { position: fixed; z-index: 5; pointer-events: none; opacity: 0; transition: opacity .9s ease; user-select: none; perspective: 900px; }
.mn.show { opacity: 1; }
.mn.l { left: 1.8vw; perspective-origin: 20% 50%; }
.mn.r { right: 1.8vw; perspective-origin: 80% 50%; }
.mn.h { left: 2.6vw; top: 3.4vh; perspective-origin: 20% 50%; transition: opacity .45s ease; }
.mn .stack { transform-style: preserve-3d; will-change: transform; display: flex; flex-direction: column; gap: 2px; }
.mn.l .stack, .mn.h .stack { align-items: flex-start; transform-origin: 0% 50%; }
.mn.r .stack { align-items: flex-end; transform-origin: 100% 50%; }
.mn button { pointer-events: auto; position: relative; border: 0; padding: 0; background: none; cursor: pointer;
  font-family: ${FONT}; color: ${PAPER}; line-height: 1; letter-spacing: .02em;
  transition: transform .18s cubic-bezier(.3,1.6,.5,1); }
.mn.h:not(.show) button { pointer-events: none; }
.mn button .plate { position: absolute; inset: 0; background-size: 100% 100%; transition: opacity .25s; }
.mn.r button .plate { transform: scaleX(-1); }
.mn button .plate.hot { opacity: 0; }
.mn button:hover .plate.hot, .mn button.on .plate.hot { opacity: 1; }
.mn.l button:hover, .mn.h button:hover { transform: translateX(6px) translateZ(18px) rotate(-1deg); }
.mn.r button:hover { transform: translateX(-6px) translateZ(18px) rotate(1deg); }
.mn button:active { transform: translateZ(4px) scale(.97); }
/* at a station the columns step back (smaller, nearer the edge, half faded) and let the cursor reach the racks */
.mn.l button, .mn.r button { opacity: var(--rec, 1); }
.mn.faded button { pointer-events: none; }
.mn button span { position: relative; display: block; padding: .16em 1.1em .1em .75em; text-shadow: 0 0 1px rgba(251,245,232,.7); }
.mn.r button span { padding: .16em .75em .1em 1.1em; text-align: right; }
.mn button span i { display: block; font-style: normal; white-space: nowrap; }
`;

// How the words of one title fit: one line if it fits (shrinking a little), else two balanced lines,
// else smaller type on up to three; the last resort cuts the end with an ellipsis. Measured with the
// real brush font so nothing ever overflows its brush stroke.
function makeFitter() {
  const g = document.createElement('canvas').getContext('2d');
  const width = (s, size) => { g.font = `${size}px ${FONT}`; return g.measureText(s).width; };
  // split the words into n lines as evenly as possible (shortest longest-line)
  const split = (words, n, size) => {
    if (n === 1) return [words.join(' ')];
    let best = null, bestW = Infinity;
    const rec = (from, left, acc) => {
      if (left === 1) {
        const lines = [...acc, words.slice(from).join(' ')];
        const w = Math.max(...lines.map((l) => width(l, size)));
        if (w < bestW) { bestW = w; best = lines; }
        return;
      }
      for (let i = from + 1; i <= words.length - left + 1; i++) rec(i, left - 1, [...acc, words.slice(from, i).join(' ')]);
    };
    rec(0, Math.min(n, words.length), []);
    return best;
  };
  // Shelf titles come from YouTube Music: a very long one would cost a lot of measuring (every way to
  // split it into lines is tried), and at most three lines of it ever show, so only its start is fitted.
  const MAX_CHARS = 120, MAX_WORDS = 24;
  return function fit(text, base, maxW) {
    const all = String(text ?? '');
    let words = all.slice(0, MAX_CHARS).split(/\s+/).filter(Boolean);
    const cutShort = all.length > MAX_CHARS || words.length > MAX_WORDS;
    if (words.length > MAX_WORDS) words = words.slice(0, MAX_WORDS);
    if (cutShort && words.length) words[words.length - 1] += '…';
    const ok = (lines, size) => lines.every((l) => width(l, size) <= maxW);
    for (const [k, n] of [[1, 1], [0.92, 1], [0.84, 1], [1, 2], [0.92, 2], [0.84, 2], [0.76, 2], [0.68, 3], [0.6, 3]]) {
      const size = Math.round(base * k);
      const lines = split(words, n, size);
      if (lines && ok(lines, size)) return { size, lines };
    }
    // last resort: smallest type, up to three lines, the end cut with an ellipsis
    const size = Math.round(base * 0.6);
    const cut = (t) => { while (t.length > 1 && width(`${t}…`, size) > maxW) t = t.slice(0, -1); return `${t}…`; };
    const lines = [];
    let line = '';
    let i = 0;
    for (; i < words.length && lines.length < 3; i++) {
      const next = line ? `${line} ${words[i]}` : words[i];
      if (width(next, size) <= maxW) { line = next; continue; }
      if (line) { lines.push(line); line = ''; i--; continue; }
      lines.push(cut(words[i])); // one word wider than the stroke
      i = words.length;
    }
    if (line && lines.length < 3) lines.push(line);
    if (i < words.length && lines.length) lines[lines.length - 1] = cut(lines[lines.length - 1].replace(/…$/, ''));
    return { size, lines };
  };
}

export function createMenu({ onGo, onHome, getAvoid = () => null } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const box = (cls) => {
    const el = document.createElement('div');
    el.className = `mn ${cls}`;
    const stack = document.createElement('div');
    stack.className = 'stack';
    el.appendChild(stack);
    document.body.appendChild(el);
    return { el, stack, scale: 1, k: 1, w: 0 }; // k: 1 = full size, 0 = stepped back
  };
  const L = box('l'), R = box('r'), H = box('h');
  const fit = makeFitter();

  let sections = [];       // [{ index, title }]
  let current = -1;
  let shown = false;
  let tiltX = 0, tiltY = 0;
  let over = 0;
  let receded = false, cursorX = null;
  const buttons = [];      // { el, side, seed, key }
  const plateCache = new Map();

  function makeButton(parent, label, seed, onClick) {
    const el = document.createElement('button');
    el.tabIndex = -1; // keys belong to the shop, not to focus
    el.innerHTML = '<div class="plate"></div><div class="plate hot"></div><span></span>';
    el.addEventListener('click', (e) => { e.stopPropagation(); el.blur(); onClick(); });
    el.addEventListener('pointerenter', () => { over++; });
    el.addEventListener('pointerleave', () => { over = Math.max(0, over - 1); });
    parent.stack.appendChild(el);
    return { el, side: parent, seed, label, fontPx: 0, lines: [] };
  }
  const home = makeButton(H, 'Home', 3, () => onHome?.());
  home.el.setAttribute('aria-label', 'Back to the entrance');
  home.indent = 0;

  // ---- plates: painted once per size ----
  function plate(w, h, color, seed) {
    const key = `${w}x${h}-${color}-${seed}`;
    let url = plateCache.get(key);
    if (!url) { url = brushStroke(w, h, color, seed); plateCache.set(key, url); }
    return `url(${url})`;
  }
  function paint(b) {
    const w = b.el.offsetWidth, h = b.el.offsetHeight;
    if (!w) return;
    const [cold, hot] = b.el.querySelectorAll('.plate');
    cold.style.backgroundImage = plate(w, h, INK, b.seed);
    hot.style.backgroundImage = plate(w, h, HOT, b.seed);
  }

  // ---- layout: fit the words, then place the stacks clear of the player on the left ----
  const fontReady = (document.fonts?.load(`40px ${FONT}`) ?? Promise.resolve()).catch(() => {});
  let fontsOk = false;
  fontReady.then(() => { fontsOk = true; layout(); });

  function setLabel(b, text, base, maxW) {
    const { size, lines } = fit(text, base, maxW);
    const span = b.el.querySelector('span');
    b.el.style.fontSize = `${size}px`;
    span.replaceChildren(...lines.map((l) => Object.assign(document.createElement('i'), { textContent: l })));
    b.el.setAttribute('aria-label', text);
  }

  function layout() {
    if (!fontsOk) return;
    const vw = innerWidth, vh = innerHeight;
    const base = Math.min(40, Math.max(26, vh * 0.052));
    const maxW = Math.min(250, Math.max(140, vw * 0.17));
    for (const b of buttons) setLabel(b, b.label, base, maxW);
    setLabel(home, 'Home', base, maxW);
    // stagger like the player's words: a hand-set look, not a column
    const nudge = [0, 0.5, 0.16, 0.7];
    for (const side of [L, R]) {
      side.stack.querySelectorAll('button').forEach((el, i) => {
        const px = Math.round(nudge[i % nudge.length] * base * 0.8);
        el.style.marginLeft = side === L ? `${px}px` : '';
        el.style.marginRight = side === R ? `${px}px` : '';
      });
    }
    [...buttons, home].forEach(paint);

    // the home word: top-left; the left stack must start below it
    const homeBottom = vh * 0.034 + home.el.offsetHeight + 8;
    // the player's room on screen: any box with left / top / right (/ bottom); the left menu stays above it
    const raw = getAvoid();
    const avoid = raw ? { left: raw.left, top: raw.top, right: raw.right ?? raw.left + (raw.width ?? 0), width: (raw.right ?? raw.left + (raw.width ?? 0)) - raw.left } : null;
    const place = (side, avoidRect) => {
      const H0 = side.stack.offsetHeight;
      if (!H0) { side.scale = 1; return { H0: 0, c: vh / 2 }; }
      const w0 = side.stack.offsetWidth;
      side.w = w0;
      const left = side === L ? vw * 0.018 : vw - vw * 0.018 - w0;
      let lo = side === L ? homeBottom : 12, hi = vh - 12;
      if (avoidRect && avoidRect.width && left < avoidRect.right + 8 && left + w0 > avoidRect.left - 8) hi = Math.min(hi, avoidRect.top - 14);
      const s = Math.min(1, Math.max(0.5, (hi - lo) / H0));
      const c = Math.min(Math.max(vh / 2, lo + (s * H0) / 2), hi - (s * H0) / 2);
      side.scale = s;
      return { H0, c };
    };
    const pl = place(L, avoid), pr = place(R, null);
    // both columns share one height and centre, so the pair reads as one composition
    const s = Math.min(L.scale, R.scale);
    L.scale = R.scale = s;
    const c = pl.H0 ? pl.c : pr.c;
    for (const [side, p] of [[L, pl], [R, pr]]) side.el.style.top = `${c - (p.H0 || 0) / 2}px`;
    apply();
  }

  function rebuild() {
    for (const b of buttons) b.el.remove();
    buttons.length = 0;
    over = 0;
    const list = sections.slice(0, PER_SIDE * 2);
    const nL = Math.min(PER_SIDE, Math.ceil(list.length / 2));
    list.forEach((sec, i) => {
      const side = i < nL ? L : R;
      const b = makeButton(side, sec.title, (side === L ? 31 : 77) + i * 7, () => onGo?.(sec.index));
      b.index = sec.index;
      buttons.push(b);
    });
    syncCurrent();
    layout();
  }

  function syncCurrent() {
    for (const b of buttons) b.el.classList.toggle('on', b.index === current);
    H.el.classList.toggle('show', shown && current !== -1);
  }

  // ---- tilt: turned in toward the middle of the screen, like the player's stack ----
  function apply() {
    const tx = tiltX, ty = tiltY;
    // stepped back: 0.7 size, slid a little toward the screen edge (the scale origin is already the edge)
    const back = (side) => ({ sc: side.scale * (0.7 + 0.3 * side.k), slide: (1 - side.k) * side.w * 0.07 });
    const bl = back(L), br = back(R);
    L.stack.style.transform = `translateX(${-bl.slide}px) scale(${bl.sc}) rotateY(${30 + tx * 10}deg) rotateX(${-ty * 8}deg) rotateZ(${-2 - tx * 1.5}deg)`;
    R.stack.style.transform = `translateX(${br.slide}px) scale(${br.sc}) rotateY(${-30 + tx * 10}deg) rotateX(${-ty * 8}deg) rotateZ(${2 - tx * 1.5}deg)`;
    H.stack.style.transform = `rotateY(${30 + tx * 10}deg) rotateX(${-ty * 8}deg) rotateZ(${-2 - tx * 1.5}deg)`;
  }

  // keep clear of whatever the player takes up on the left (it can change size)
  let avoidSig = '';
  const sig = () => { const r = getAvoid(); return r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right ?? r.left + r.width)}` : ''; };
  setInterval(() => { const s = sig(); if (s !== avoidSig) { avoidSig = s; layout(); } }, 400);
  let resizeTimer = 0;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });

  return {
    ready: () => fontReady,
    setSections(list) {
      const key = JSON.stringify(list.map((s) => [s.index, s.title]));
      if (key === JSON.stringify(sections.map((s) => [s.index, s.title]))) return;
      sections = list.map((s) => ({ index: s.index, title: String(s.title ?? '').trim() || 'Untitled' }));
      rebuild();
    },
    setCurrent(index) { current = index; syncCurrent(); },
    show(on, instant = false) {
      shown = on;
      for (const side of [L, R, H]) {
        if (instant) side.el.style.transition = 'none';
        if (side !== H) side.el.classList.toggle('show', on);
      }
      syncCurrent();
    },
    tilt(tx, ty) { tiltX = tx; tiltY = ty; apply(); },
    // Called every frame. `recede`: step the columns back (at a station or in flight). They come back
    // to full when the cursor is within 16% of their screen edge or over them. x01: cursor x in 0..1 or null.
    update(dt, x01, recede) {
      receded = recede;
      cursorX = x01;
      for (const side of [L, R]) {
        const near = x01 != null && (side === L ? x01 < 0.16 : x01 > 0.84);
        const full = !receded || near || over > 0;
        side.k += ((full ? 1 : 0) - side.k) * (1 - Math.exp(-12 * Math.min(dt, 0.2))); // ~0.25 s
        side.el.style.setProperty('--rec', String(0.5 + 0.5 * side.k));
        side.el.classList.toggle('faded', !full); // faded words let the cursor through to the racks
      }
      apply();
    },
    relayout: layout,
    get hovering() { return over > 0; },
    // for tests: where everything ended up
    rects() {
      const r = (b) => b.el.getBoundingClientRect();
      return { left: buttons.filter((b) => b.side === L).map(r), right: buttons.filter((b) => b.side === R).map(r), home: r(home) };
    },
  };
}
