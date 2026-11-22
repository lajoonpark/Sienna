// How the list sheets (search, a collection's songs, the queue) move:
//   Open:   the paper unrolls down from its top strip (bar, tabs, title) with a little roll riding the bottom
//           edge, overshoots a hair and settles.
//   Resize: whenever the content changes (results arrive, a filter narrows them), the sheet eases to its new height.
//   Close:  it rolls back up to the strip; the caller fades what is left.
// The sheet's height is the only thing animated, so the torn bottom edge and its shadow travel with it.
// Pair it with paperSurface(el, { crop: true }) so the paper is cropped, not repainted, while the height moves.
//
//   const sheet = unrollSheet(el);   sheet.open();   sheet.close({ delay });
import { MOTION, injectTokens, prefersReducedMotion } from './tokens.js';

export const OPEN_MS = 520, RESIZE_MS = 340, CLOSE_MS = 360;

const CSS = `
.ui-unroll { transform-origin: 50% 0; }
.ui-unroll > .ui-list { overflow: clip; }
.ui-unroll-curl { position: absolute; left: var(--sienna-space-3); right: var(--sienna-space-3); bottom: 3px; height: 16px;
  z-index: 3; pointer-events: none; opacity: 0; transform-origin: 50% 100%; border-radius: 8px / 50%;
  background: linear-gradient(180deg, #d9c9ab 0%, var(--sienna-paper-lo) 22%, var(--sienna-paper) 48%, #fffaf0 58%, var(--sienna-paper-lo) 82%, #cdbb9a 100%);
  box-shadow: 0 4px 6px rgba(36, 25, 18, 0.26), inset 0 -1px 0 var(--sienna-hairline); }
`;

function inject() {
  injectTokens();
  if (document.getElementById('sienna-ui-unroll')) return;
  const st = document.createElement('style');
  st.id = 'sienna-ui-unroll'; st.textContent = CSS; document.head.appendChild(st);
}

export function unrollSheet(el) {
  inject();
  el.classList.add('ui-unroll');
  const curl = document.createElement('div');
  curl.className = 'ui-unroll-curl'; curl.setAttribute('aria-hidden', 'true');
  el.appendChild(curl);
  const calm = prefersReducedMotion();
  let active = false, last = 0, size = null, extras = [];

  // Everything above the list plus the bottom padding: the strip the paper unrolls from and rolls back to.
  const strip = () => {
    const list = el.querySelector(':scope > .ui-list');
    return list?.offsetParent ? list.offsetTop + parseFloat(getComputedStyle(el).paddingBottom) : el.offsetHeight;
  };
  const running = () => size?.playState === 'running';
  const left = () => (running() ? size.effect.getComputedTiming().endTime - size.currentTime : 0);
  const stop = () => { size?.cancel(); size = null; };
  const stopExtras = () => { for (const a of extras) a.cancel(); extras = []; };

  function grow(from, to, duration, { overshoot = 0 } = {}) {
    last = to;
    if (calm || Math.abs(to - from) < 1) return;
    const frames = overshoot
      ? [{ height: `${from}px` }, { height: `${to + overshoot}px`, offset: 0.7 }, { height: `${to}px` }]
      : [{ height: `${from}px` }, { height: `${to}px` }];
    const mine = el.animate(frames, { duration, easing: MOTION.ease.out });
    mine.onfinish = () => { if (size === mine) { size = null; last = el.offsetHeight; } };
    size = mine;
  }

  // Content changed while open: ease from the height on screen to the height the content now wants.
  // Mutation callbacks run before layout is painted, so the old height is `last` (or the animated one mid-move).
  const mo = new MutationObserver((records) => {
    if (!active || !records.some((r) => !r.target.closest?.('.list-bar, .ui-unroll-curl'))) return;
    const from = running() ? el.offsetHeight : last, remaining = left();
    stop();
    const to = el.offsetHeight;
    grow(from, to, Math.max(RESIZE_MS, remaining), { overshoot: to > from ? 6 : 0 });
  });
  mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  // Size changes nobody mutated for (fonts landing, the window resizing) just become the new resting height.
  new ResizeObserver(() => { if (active && !size) last = el.offsetHeight; }).observe(el);

  function open() {
    if (active) return;
    mo.takeRecords();
    const midClose = running();
    const from = midClose ? el.offsetHeight : strip();
    stop(); stopExtras();
    active = true;
    grow(from, el.offsetHeight, OPEN_MS, { overshoot: 8 });
    if (calm) return;
    const timing = { duration: OPEN_MS, easing: MOTION.ease.out };
    extras = [
      curl.animate([{ opacity: 1, scale: '1 1' }, { opacity: 1, scale: '0.98 0.8', offset: 0.72 }, { opacity: 0, scale: '0.94 0.3' }], timing),
    ];
    if (!midClose) extras.push(el.animate([
      { opacity: 0, translate: '0 -8px', rotate: '-0.8deg' },
      { opacity: 1, offset: 0.22 },
      { opacity: 1, translate: '0 0', rotate: '0deg' },
    ], timing));
  }

  function close({ delay = 0 } = {}) {
    if (!active) return;
    active = false; mo.takeRecords();
    const from = el.offsetHeight;
    stop(); stopExtras();
    if (calm) return;
    const to = strip();
    if (Math.abs(to - from) < 1) return;
    size = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: CLOSE_MS, delay, easing: MOTION.ease.in, fill: 'forwards' });
    extras = [curl.animate([
      { opacity: 0, scale: '0.94 0.3' },
      { opacity: 1, scale: '1 1', offset: 0.35 },
      { opacity: 1, scale: '1 1', offset: 0.85 },
      { opacity: 0, scale: '1 1' },
    ], { duration: CLOSE_MS, delay, easing: 'ease-out' })];
  }

  return { open, close, isOpen: () => active };
}
