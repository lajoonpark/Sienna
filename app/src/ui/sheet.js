// Shared modal card for Settings and Lyrics: the lights go down (veil.js), a crate card (paper.js) tips
// up like a sleeve flipped forward and tips back to leave, Esc + backdrop close, focus trap + opener
// restore, and the shared overlayOpen/onOverlay signal.
import { MOTION, injectTokens } from './tokens.js';
import { paperSurface } from './paper.js';
import { stamp } from './inputs.js';
import { injectVeilCss } from './veil.js';
import { smoothWheel } from './smooth-scroll.js';

// ---- Shared overlay signal (sheets, search, lists, queue) ----
const openOverlays = new Set();
const overlayListeners = new Set();
const openSheets = [];

export function sheetOpen() {
  return openSheets.length > 0;
}

export function overlayOpen() {
  return openOverlays.size > 0;
}

export function onOverlay(fn) {
  overlayListeners.add(fn);
  return () => overlayListeners.delete(fn);
}

export function setOverlayOpen(owner, isOpen) {
  const prev = openOverlays.size > 0;
  if (isOpen) openOverlays.add(owner);
  else openOverlays.delete(owner);
  const next = openOverlays.size > 0;
  if (next !== prev) {
    for (const fn of overlayListeners) {
      try { fn(next); } catch (e) { console.error('overlay listener', e); }
    }
  }
}

let sheetSeq = 0;

const SHEET_CSS = `
.ui-sheet-veil { z-index: var(--sienna-z-sheet);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity var(--sienna-dur-mid) var(--sienna-ease-out), visibility 0s var(--sienna-dur-mid); }
.ui-sheet-veil.show { opacity: 1; visibility: visible; pointer-events: auto;
  transition: opacity var(--sienna-dur-mid) var(--sienna-ease-out); }
.ui-sheet-veil.closing { opacity: 0; visibility: visible; pointer-events: none;
  transition: opacity var(--sienna-dur-mid) var(--sienna-ease-in); }
.ui-sheet-lean { display: flex; justify-content: center; }
.ui-sheet-card { position: relative; box-sizing: border-box;
  width: var(--ui-sheet-w, min(760px, 92vw));
  max-height: var(--ui-sheet-max-h, min(620px, 88vh));
  display: flex; flex-direction: column;
  padding: var(--sienna-space-5) var(--sienna-space-6) var(--sienna-space-4);
  color: var(--sienna-ink); font-family: var(--sienna-serif); transform-origin: 50% 100%; }
.ui-sheet-card:focus { outline: none; }
.ui-sheet-veil.show .ui-sheet-card { animation: ui-sheet-flip-up 440ms cubic-bezier(0.4, 0.4, 0.5, 1) both; }
.ui-sheet-veil.closing .ui-sheet-card { animation: ui-sheet-flip-back 200ms var(--sienna-ease-in) both; }
@keyframes ui-sheet-flip-up {
  0%   { opacity: 0; transform: perspective(1100px) translateY(28px) rotateX(34deg); }
  34%  { opacity: 1; }
  66%  { opacity: 1; transform: perspective(1100px) translateY(-2px) rotateX(-4.5deg); }
  100% { opacity: 1; transform: none; }   /* flat at rest, so its text stays crisp */
}
@keyframes ui-sheet-flip-back {
  0%   { opacity: 1; transform: perspective(1100px) translateY(0) rotateX(0deg); }
  100% { opacity: 0; transform: perspective(1100px) translateY(20px) rotateX(22deg); }
}
.ui-sheet-head { position: relative; flex: none; display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--sienna-space-4); margin-bottom: var(--sienna-space-3); }
.ui-sheet-head-text { min-width: 0; flex: 1; }
.ui-sheet-title { margin: 0; font-family: var(--sienna-font); font-size: var(--sienna-text-xl); line-height: 1.1;
  font-weight: 700; color: var(--sienna-indigo); }
.ui-sheet-desc { margin: var(--sienna-space-1) 0 0; font-family: var(--sienna-serif); font-size: var(--sienna-text-sm);
  line-height: 1.4; color: var(--sienna-ink-2); }
.ui-sheet-desc:empty { display: none; }
.ui-sheet-body { position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: var(--sienna-space-1) var(--sienna-space-2) var(--sienna-space-2) 0;
  font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); line-height: 1.5; color: var(--sienna-ink);
  scrollbar-width: thin; scrollbar-color: var(--sienna-scroll-thumb) transparent; }
.ui-sheet-body::-webkit-scrollbar { width: 7px; }
.ui-sheet-body::-webkit-scrollbar-thumb { background: var(--sienna-scroll-thumb); border-radius: 4px; }
.ui-sheet-foot { position: relative; flex: none; display: flex; align-items: center; justify-content: flex-end;
  gap: var(--sienna-space-3); padding-top: var(--sienna-space-3); }
.ui-sheet-foot:empty { display: none; }
@media (max-width: 720px) {
  .ui-sheet-card { padding: var(--sienna-space-5) var(--sienna-space-5) var(--sienna-space-4); }
}
`;

function injectSheetCss() {
  injectTokens();
  injectVeilCss();
  if (typeof document === 'undefined' || !document.head || document.getElementById('sienna-ui-sheet')) return;
  const st = document.createElement('style');
  st.id = 'sienna-ui-sheet';
  st.textContent = SHEET_CSS;
  document.head.appendChild(st);
}

const FOCUSABLE_SEL = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusables(container) {
  return [...container.querySelectorAll(FOCUSABLE_SEL)].filter((el) => {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });
}

export function createSheet({
  title = '',
  description = '',
  width = null,
  maxHeight = null,
  showClose = true,
  parent = null,
  onClose = null,
  onOpen = null,
} = {}) {
  injectSheetCss();
  const id = ++sheetSeq;
  const owner = Symbol(`sheet-${id}`);

  const veil = document.createElement('div');
  veil.className = 'ui-sheet-veil sienna-veil';

  const lean = document.createElement('div');
  lean.className = 'ui-sheet-lean';

  const card = document.createElement('div');
  card.className = 'ui-sheet-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.tabIndex = -1;
  if (width) card.style.setProperty('--ui-sheet-w', width);
  if (maxHeight) card.style.setProperty('--ui-sheet-max-h', maxHeight);

  const header = document.createElement('div');
  header.className = 'ui-sheet-head';
  const headText = document.createElement('div');
  headText.className = 'ui-sheet-head-text';

  const titleEl = document.createElement('h2');
  titleEl.className = 'ui-sheet-title';
  titleEl.id = `ui-sheet-title-${id}`;
  titleEl.textContent = String(title ?? '');
  card.setAttribute('aria-labelledby', titleEl.id);

  const descEl = document.createElement('p');
  descEl.className = 'ui-sheet-desc';
  descEl.id = `ui-sheet-desc-${id}`;
  descEl.textContent = String(description ?? '');
  if (descEl.textContent) card.setAttribute('aria-describedby', descEl.id);

  headText.append(titleEl, descEl);
  header.appendChild(headText);

  let closeBtn = null;
  if (showClose) {
    closeBtn = stamp('close', {
      label: 'Close',
      size: 'sm',
      tooltipPos: 'bottom',
      onClick: () => close(),
    });
    header.appendChild(closeBtn);
  }

  const body = document.createElement('div');
  body.className = 'ui-sheet-body';
  const stopScroll = smoothWheel(body);

  const footer = document.createElement('div');
  footer.className = 'ui-sheet-foot';

  card.append(header, body, footer);
  lean.appendChild(card);
  veil.appendChild(lean);

  const host = parent ?? document.body;
  host.appendChild(veil);

  const paper = paperSurface(card, { elevation: 'lift' });

  let openNow = false;
  let closeTimer = 0;
  let opener = null;
  let destroyed = false;

  card.addEventListener('click', (e) => e.stopPropagation());
  veil.addEventListener('click', () => close());

  // Stop any key handled inside the sheet from bubbling out to the shop's window listeners.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    veil.addEventListener(type, (e) => {
      if (openNow) e.stopPropagation();
    });
  }

  function handleWindowKeyDown(e) {
    if (!openNow || !isTopmost()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const list = getFocusables(card);
      if (!list.length) {
        card.focus({ preventScroll: true });
        return;
      }
      const cur = document.activeElement;
      const idx = list.indexOf(cur);
      let nextIdx;
      if (e.shiftKey) {
        nextIdx = idx <= 0 ? list.length - 1 : idx - 1;
      } else {
        nextIdx = idx < 0 || idx >= list.length - 1 ? 0 : idx + 1;
      }
      list[nextIdx].focus();
      return;
    }
    // If focus is somehow outside the sheet while open, swallow keys so nothing reaches the shop.
    if (!card.contains(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  function isTopmost() {
    return openSheets.at(-1) === veil;
  }

  function open({ returnFocusTo = null } = {}) {
    if (destroyed || openNow) return;
    clearTimeout(closeTimer);
    opener = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    openNow = true;
    openSheets.push(veil);
    host.appendChild(veil);
    setOverlayOpen(owner, true);

    veil.classList.remove('closing');
    veil.classList.remove('show');
    void card.offsetWidth;
    veil.classList.add('show');
    void veil.offsetHeight;
    body.scrollTop = 0;

    window.addEventListener('keydown', handleWindowKeyDown, true);

    // Move keyboard focus inside immediately (prefer first focusable in body, then any in card, else card).
    const bodyFocusables = getFocusables(body);
    const allFocusables = bodyFocusables.length ? bodyFocusables : getFocusables(card);
    const target = allFocusables[0] ?? card;
    target.focus({ preventScroll: true });

    onOpen?.();
  }

  function close() {
    if (!openNow) return;
    stopScroll();
    const wasTopmost = isTopmost();
    openNow = false;
    openSheets.splice(openSheets.indexOf(veil), 1);
    window.removeEventListener('keydown', handleWindowKeyDown, true);
    setOverlayOpen(owner, false);

    clearTimeout(closeTimer);
    veil.classList.remove('show');
    veil.classList.add('closing');
    closeTimer = setTimeout(() => {
      closeTimer = 0;
      veil.classList.remove('closing');
    }, MOTION.dur.mid);

    const top = openSheets.at(-1);
    const restore = top && !top.contains(opener)
      ? getFocusables(top)[0] ?? top.querySelector('.ui-sheet-card')
      : opener;
    opener = null;
    if (wasTopmost && restore && restore.isConnected && typeof restore.focus === 'function') {
      restore.focus({ preventScroll: true });
    }
    onClose?.();
  }

  function setTitle(next) {
    titleEl.textContent = String(next ?? '');
  }

  function setDescription(next) {
    const text = String(next ?? '');
    descEl.textContent = text;
    if (text) card.setAttribute('aria-describedby', descEl.id);
    else card.removeAttribute('aria-describedby');
  }

  function destroy() {
    if (destroyed) return;
    if (openNow) close();
    clearTimeout(closeTimer);
    closeTimer = 0;
    destroyed = true;
    paper.destroy();
    closeBtn?.destroy?.();
    veil.remove();
  }

  return {
    el: veil,
    card,
    header,
    titleEl,
    descEl,
    body,
    footer,
    open,
    close,
    isOpen: () => openNow,
    isTopmost,
    setTitle,
    setDescription,
    destroy,
  };
}
