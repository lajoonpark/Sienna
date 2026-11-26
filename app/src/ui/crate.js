// The crate-card kit: the parts every menu is built from, on a card from paper.js.
//   - divider tabs: die-cut tabs standing up from a card's top edge, like the dividers in a record
//     crate. The open one is the card's own stock and runs into it (search filters, Settings pages).
//   - renderHints(): the one line of keys under a menu, each key drawn as a little card keycap.
//   - signboard(): a heading on a painted indigo plate, like the shelf signs round the shop.
//   - cardMotion(): a card tips up like a record flipped forward in a crate, tips back to leave, and
//     grows or shrinks smoothly when what is on it changes. Rigid card, so nothing bends or rolls.
import { onLettering, fontReady } from '../style.js';
import { cachedBrushPlate } from './brush.js';
import { COLORS, MOTION, injectTokens, prefersReducedMotion } from './tokens.js';

export const CARD_IN_MS = 440, CARD_OUT_MS = 200, CARD_RESIZE_MS = 240;

const CSS = `
.crate-card { transform-origin: 50% 100%; }
/* a card's divider tabs stand on its top edge */
.crate-card > .crate-tabs { position: absolute; left: var(--sienna-space-5); right: var(--sienna-space-5);
  bottom: calc(100% - 1px); z-index: 2; margin: 0; }
.crate-tabs { display: flex; flex-wrap: nowrap; align-items: flex-end; gap: 3px; }
.crate-tab { position: relative; isolation: isolate; flex: 0 1 auto; min-width: 0; margin: 0; border: 0; cursor: pointer;
  background: none; padding: 6px var(--sienna-space-4) 4px; white-space: nowrap; user-select: none;
  font-family: var(--sienna-font); font-size: var(--sienna-text-md); line-height: 1.15; color: var(--sienna-ink);
  transition: color var(--sienna-dur-fast), padding var(--sienna-dur-fast) var(--sienna-ease-out); }
.crate-tab::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: 8px 8px 0 0;
  background: var(--sienna-kraft) var(--sienna-grain); transform: perspective(40px) rotateX(3deg);
  transform-origin: 50% 100%; box-shadow: inset 0 -8px 8px -8px rgba(62, 36, 16, 0.6); }
.crate-tab:not(:disabled):hover::before { background-color: #d2ae80; }
.crate-tab.is-on, .crate-tab[aria-selected="true"], .crate-tab[aria-current="page"] {
  color: var(--sienna-indigo); padding-top: 10px; padding-bottom: 6px; }
.crate-tab.is-on::before, .crate-tab[aria-selected="true"]::before, .crate-tab[aria-current="page"]::before {
  bottom: -2px; background-color: var(--sienna-paper); box-shadow: none; }
.crate-tab:focus { outline: none; }
.crate-tab:focus-visible::after { content: ''; position: absolute; inset: 4px 6px 2px; border-radius: 5px;
  box-shadow: 0 0 0 2px var(--sienna-terracotta); pointer-events: none; }
.crate-tab:disabled { cursor: not-allowed; opacity: var(--sienna-disabled); }

/* the line of keys under a menu, on its own dark plate so it reads over any wall */
.crate-hints { box-sizing: border-box; width: fit-content; max-width: 100%; margin: 0 auto; padding: 5px var(--sienna-space-3) 6px;
  display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px var(--sienna-space-4);
  border-radius: 7px; background: rgba(22, 13, 20, 0.72); color: var(--sienna-on-night-2);
  font: var(--sienna-text-xs)/1.35 var(--sienna-serif); }
.crate-hint { white-space: nowrap; }
.crate-hints kbd { display: inline-block; box-sizing: border-box; min-width: 21px; margin-right: 5px; padding: 0 6px 1px;
  border-radius: 4px; text-align: center; background: var(--sienna-paper); box-shadow: 0 2px 0 var(--sienna-edge);
  color: var(--sienna-ink); font: 600 12px/1.45 var(--sienna-serif); }

/* a heading painted on a plate, like the shop's shelf signs */
.crate-sign { display: inline-block; padding: 3px 36px 8px 26px; background-size: 100% 100%; background-repeat: no-repeat;
  color: var(--sienna-paper); font-family: var(--sienna-font); line-height: 1.1; letter-spacing: .02em;
  filter: drop-shadow(0 4px 7px rgba(18, 8, 6, 0.48)); }
`;

export function injectCrateCss() {
  injectTokens();
  if (document.getElementById('sienna-crate')) return;
  const style = document.createElement('style');
  style.id = 'sienna-crate';
  style.textContent = CSS;
  document.head.appendChild(style);
}

// hints: [keys, what they do] pairs, or plain strings.
export function renderHints(el, hints = []) {
  injectCrateCss();
  el.replaceChildren(...hints.map(hint => {
    const span = document.createElement('span');
    span.className = 'crate-hint';
    if (typeof hint === 'string') span.textContent = hint;
    else {
      const key = document.createElement('kbd');
      key.textContent = hint[0];
      span.append(key, hint[1]);
    }
    return span;
  }));
}

export function signboard(el, { seed = 61, color = COLORS.indigo } = {}) {
  injectCrateCss();
  el.classList.add('crate-sign');
  const paint = () => {
    const w = Math.ceil(el.offsetWidth), h = Math.ceil(el.offsetHeight);
    if (w && h) el.style.backgroundImage = `url(${cachedBrushPlate(w, h, color, seed)})`;
  };
  fontReady.then(paint);
  new ResizeObserver(() => fontReady.then(paint)).observe(el);
  onLettering(el, paint);
  return { repaint: paint };
}

// Hinged along its bottom edge, tipped back like a sleeve leaning in a crate.
const TIPPED = 'perspective(1100px) translateY(28px) rotateX(34deg)';
const SWUNG = 'perspective(1100px) translateY(-2px) rotateX(-4.5deg)';
const REST = 'perspective(1100px) translateY(0px) rotateX(0deg)';
const AWAY = 'perspective(1100px) translateY(20px) rotateX(22deg)';

// open() and close() flip the card. The owner shows it first (.show), and hides it once close() has run:
// while a card is leaving it carries .closing.
export function cardMotion(el, { onClosed = null } = {}) {
  injectCrateCss();
  el.classList.add('crate-card');
  let isOpen = false, flip = null, size = null, last = 0;
  const pose = () => {
    const css = getComputedStyle(el);
    return { transform: css.transform === 'none' ? REST : css.transform, opacity: css.opacity };
  };
  const stopSize = () => { size?.cancel(); size = null; };

  // What is on the card changed: grow or shrink to fit it instead of jumping.
  const mutations = new MutationObserver(() => {
    if (!isOpen) return;
    const from = size?.playState === 'running' ? el.offsetHeight : last;
    stopSize();
    const to = el.offsetHeight;
    last = to;
    if (prefersReducedMotion() || !from || Math.abs(to - from) < 2) return;
    const mine = el.animate([{ height: `${from}px` }, { height: `${to}px` }],
      { duration: CARD_RESIZE_MS, easing: MOTION.ease.out });
    mine.onfinish = () => { if (size === mine) { size = null; last = el.offsetHeight; } };
    size = mine;
  });
  mutations.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  // fonts landing or the window resizing just set the new resting height
  new ResizeObserver(() => { if (isOpen && !size) last = el.offsetHeight; }).observe(el);

  function open() {
    if (isOpen) return;
    isOpen = true;
    mutations.takeRecords();
    const from = flip?.playState === 'running' ? pose() : { transform: TIPPED, opacity: 0 };
    flip?.cancel();
    flip = null;
    el.classList.remove('closing');
    last = el.offsetHeight;
    if (prefersReducedMotion()) return;
    // eased leg by leg, so the whole swing can be seen: up past upright, then back to rest
    flip = el.animate([{ ...from, easing: 'cubic-bezier(0.34, 0.5, 0.5, 1)' }, { opacity: 1, offset: 0.34 },
      { transform: SWUNG, opacity: 1, offset: 0.66, easing: 'cubic-bezier(0.42, 0, 0.58, 1)' },
      { transform: REST, opacity: 1 }], { duration: CARD_IN_MS });
  }

  function close({ delay = 0 } = {}) {
    if (!isOpen) return;
    isOpen = false;
    mutations.takeRecords();
    stopSize();
    const from = pose();
    flip?.cancel();
    flip = null;
    el.classList.add('closing');
    const done = () => {
      flip?.cancel();
      flip = null;
      el.classList.remove('closing');
      onClosed?.();
    };
    if (prefersReducedMotion()) { done(); return; }
    const mine = el.animate([from, { transform: AWAY, opacity: 0 }],
      { duration: CARD_OUT_MS, delay, easing: MOTION.ease.in, fill: 'both' });
    flip = mine;
    mine.onfinish = () => { if (flip === mine) done(); };
  }

  // Stop being a card at once, with no flip (the covers take over, say).
  function reset() {
    isOpen = false;
    mutations.takeRecords();
    stopSize();
    flip?.cancel();
    flip = null;
    el.classList.remove('closing');
  }

  return { open, close, reset, isOpen: () => isOpen };
}
