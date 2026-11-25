import { MOTION, injectTokens, prefersReducedMotion } from './tokens.js';
import { createPaperRoll, ROLL_HEIGHT, ROLL_MIDLINE } from './paper-roll.js';

export const OPEN_MS = 520, RESIZE_MS = 340, CLOSE_MS = 360;

const CSS = `
.ui-unroll { transform-origin: 50% 0; }
.ui-unroll > .ui-list, .ui-unroll-rolling > .la-full { overflow: clip; }
.ui-unroll-rolling > .la-full { min-height: 0; }
.ui-unroll-rolling.ui-paper:has(> .la-full:not([hidden])) > .ui-paper-layer { clip-path: none; }
.ui-unroll-rolling .ui-paper-bg { --ui-paper-bottom-tear: 0; }
.ui-unroll-roll { position: absolute; inset-inline: 0; top: calc(100% - ${ROLL_MIDLINE + 1}px);
  width: 100%; height: ${ROLL_HEIGHT}px; z-index: 3; pointer-events: none;
  filter: drop-shadow(0 2px 2px rgba(36, 25, 18, 0.18)); }
.list-overlay.closing > .ui-unroll-roll { opacity: 0;
  transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out) var(--sienna-dur-mid); }
`;

function inject() {
  injectTokens();
  if (document.getElementById('sienna-ui-unroll')) return;
  const st = document.createElement('style');
  st.id = 'sienna-ui-unroll'; st.textContent = CSS; document.head.appendChild(st);
}

// The animated height is also the contact line. It clips the live list while the
// paper past that line winds onto the roll, sampling from the same cropped texture.
export function unrollSheet(el, header) {
  inject();
  el.classList.add('ui-unroll');
  const roll = document.createElement('canvas');
  roll.className = 'ui-unroll-roll'; roll.setAttribute('aria-hidden', 'true'); roll.hidden = true;
  el.appendChild(roll);
  const draw = createPaperRoll(roll, el.querySelector(':scope > .ui-paper-layer > .ui-paper-bg'));
  let active = false, last = 0, size = null, full = null, raf = 0, openingUntil = 0, wide = false;

  const strip = () => header.offsetTop + header.offsetHeight
    + parseFloat(getComputedStyle(header).marginBottom) + parseFloat(getComputedStyle(el).paddingBottom);
  const isWide = () => !!el.querySelector(':scope > .la-full:not([hidden])');
  const running = () => size?.playState === 'running';
  const stop = () => { size?.cancel(); size = null; };
  const showRoll = show => {
    roll.hidden = !show;
    el.classList.toggle('ui-unroll-rolling', show);
  };
  function sample() {
    raf = 0;
    const flat = el.offsetHeight, remaining = full - flat;
    showRoll(remaining > 1);
    if (!roll.hidden) draw(el.clientWidth, flat, remaining);
    if (running()) raf = requestAnimationFrame(sample);
  }
  function clearRoll() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; full = null; showRoll(false);
  }

  function grow(from, to, duration, { overshoot = 0 } = {}) {
    last = to;
    if (prefersReducedMotion() || Math.abs(to - from) < 1) return;
    const frames = overshoot
      ? [{ height: `${from}px` }, { height: `${to + overshoot}px`, offset: 0.7 }, { height: `${to}px` }]
      : [{ height: `${from}px` }, { height: `${to}px` }];
    const mine = el.animate(frames, { duration, easing: MOTION.ease.out });
    mine.onfinish = () => { if (size === mine) { size = null; last = el.offsetHeight; } };
    size = mine;
  }

  function wind(from, to, length, { duration, delay = 0, closing = false }) {
    last = to;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (prefersReducedMotion()) { clearRoll(); return; }
    if (Math.abs(to - from) < 1) {
      if (closing && length - to > 1) { full = length; sample(); }
      else clearRoll();
      return;
    }
    full = length;
    const mine = el.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration, delay, easing: closing ? 'cubic-bezier(0.42, 0.05, 0.67, 0.82)' : 'cubic-bezier(0.22, 0.18, 0.35, 1)',
      fill: closing ? 'both' : 'backwards',
    });
    size = mine;
    mine.onfinish = () => {
      if (size !== mine) return;
      if (closing) return;
      size = null; clearRoll(); last = el.offsetHeight;
    };
    sample();
  }

  const mo = new MutationObserver((records) => {
    if (!active || !records.some((r) => !r.target.closest?.('.list-bar, .ui-unroll-roll'))) return;
    const from = running() ? el.offsetHeight : last;
    const remaining = running() ? size.effect.getComputedTiming().endTime - size.currentTime : 0;
    stop();
    const to = el.offsetHeight;
    const nextWide = isWide();
    const duration = to === last && remaining > 0 ? remaining : Math.max(RESIZE_MS, remaining);
    if (to > from && (full !== null || performance.now() < openingUntil || (nextWide && !wide))) {
      wind(from, to, to, { duration });
    } else {
      clearRoll();
      grow(from, to, duration, { overshoot: to > from ? 6 : 0 });
    }
    wide = nextWide;
  });
  mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  // Size changes nobody mutated for (fonts landing, the window resizing) just become the new resting height.
  new ResizeObserver(() => { if (active && !size) last = el.offsetHeight; }).observe(el);

  function open() {
    if (active) return;
    mo.takeRecords();
    const from = running() ? el.offsetHeight : strip();
    stop();
    active = true;
    wide = isWide();
    openingUntil = performance.now() + OPEN_MS;
    const to = el.offsetHeight;
    wind(Math.min(from, to), to, to, { duration: OPEN_MS });
  }

  function close({ delay = 0 } = {}) {
    if (!active) return;
    active = false; mo.takeRecords();
    const from = el.offsetHeight;
    const length = full ?? from;
    stop();
    wind(from, Math.min(from, strip()), length, { duration: CLOSE_MS, delay, closing: true });
  }

  return { open, close, isOpen: () => active };
}
