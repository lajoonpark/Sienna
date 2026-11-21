import { COLORS, SPACE, TYPE, injectTokens } from './ui/tokens.js';
import { FONT, onLettering } from './style.js';
import { layoutDabCluster } from './brushpaint.js';
import { createBarPaint, MARGIN } from './searchpaint.js';
import { icon } from './ui/icons.js';

const HEIGHT = SPACE[10] * 2 + SPACE[2];
const CSS = `
.list-bar { position: relative; height: calc(var(--sienna-space-10) * 2 + var(--sienna-space-2)); flex: none;
  transform: rotate(var(--sienna-tilt-sm)); transform-origin: 20% 40%; }
.list-bar canvas { position: absolute; left: -${MARGIN}px; top: -${MARGIN}px;
  width: calc(100% + ${MARGIN * 2}px); height: ${HEIGHT + MARGIN * 2}px; pointer-events: none; }
.list-bar-paper { position: absolute; left: var(--sienna-space-8); right: calc(var(--sienna-space-10) + var(--sienna-space-2));
  top: var(--sienna-space-4); bottom: var(--sienna-space-4); display: flex; align-items: center;
  padding: 0 var(--sienna-space-6) 0 var(--sienna-space-5); gap: var(--sienna-space-2); }
.list-bar-paper svg { flex: none; width: var(--sienna-space-8); height: var(--sienna-space-8); color: var(--sienna-indigo); }
.list-bar input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
  font: var(--sienna-text-xl)/1 var(--sienna-font); color: var(--sienna-ink); padding: var(--sienna-space-1) 0;
  caret-color: var(--sienna-terracotta); }
.list-bar input::placeholder { color: var(--sienna-ink-3); opacity: 1; }
.list-overlay { position: fixed; top: var(--sienna-space-6); left: 50%; transform: translateX(-50%);
  font-family: var(--sienna-font);
  width: min(calc(var(--sienna-space-10) * 16), 92vw); max-height: calc(100dvh - var(--sienna-space-6) - var(--sienna-space-10) - var(--sienna-space-2));
  z-index: var(--sienna-z-list); display: flex; flex-direction: column; visibility: hidden; pointer-events: none; }
.list-overlay.show { visibility: visible; pointer-events: auto; }
.list-overlay.closing { visibility: visible; }
.list-overlay > .ui-list { min-height: 0; flex: 1; }
.list-overlay .ui-list-scroll { min-height: 0; }
.list-overlay > .ui-seg { flex: none; margin: 0 var(--sienna-space-2) var(--sienna-space-2); }
.list-overlay.closing > :not(.list-bar) { opacity: 0; transition: opacity var(--sienna-dur-fast); }
.list-veil { position: fixed; inset: 0; z-index: var(--sienna-z-banner); background: var(--sienna-veil);
  backdrop-filter: var(--sienna-veil-filter); visibility: hidden; opacity: 0; pointer-events: none;
  transition: opacity var(--sienna-dur-mid), visibility var(--sienna-dur-mid); }
.list-veil.show { visibility: visible; opacity: 1; }
`;

function inject() {
  injectTokens();
  if (document.getElementById('sienna-list-bar')) return;
  const style = document.createElement('style');
  style.id = 'sienna-list-bar'; style.textContent = CSS; document.head.appendChild(style);
}

export function createListVeil(close) {
  inject();
  const el = document.createElement('div'); el.className = 'list-veil';
  el.addEventListener('pointerdown', close); document.body.appendChild(el);
  return { el, show: (on) => el.classList.toggle('show', on) };
}

export function createListBar({ prefix, label, placeholder, onClosed, seed = 21 }) {
  inject();
  const el = document.createElement('div'); el.className = `list-bar ${prefix}-bar`;
  const canvas = document.createElement('canvas'); canvas.className = `${prefix}-fx`;
  const paper = document.createElement('div'); paper.className = 'list-bar-paper';
  const glass = icon('search', { size: SPACE[8] });
  const input = document.createElement('input'); input.className = `${prefix}-input`;
  input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'off'); input.setAttribute('aria-label', label); input.placeholder = placeholder;
  paper.append(glass, input); el.append(canvas, paper);
  const paint = createBarPaint({ canvas, bar: el, glass, input, onClosed });
  let lastW = 0, opened = false;
  function repaint() {
    if (!opened) return;
    const w = Math.ceil(el.offsetWidth);
    if (!w || w === lastW) return;
    lastW = w;
    const paperRect = { x: paper.offsetLeft, y: paper.offsetTop, w: paper.offsetWidth, h: paper.offsetHeight };
    paint.setLayers({ w, h: HEIGHT, paperRect,
      inkDabs: layoutDabCluster(w, HEIGHT, { tones: [COLORS.indigo], seed, rows: 2, tilt: 0.05, overlap: 0.56, minCols: 4, impasto: 0.55, even: true }),
      paperDabs: layoutDabCluster(paperRect.w, paperRect.h, { tones: [COLORS.paper], seed: seed - SPACE[4], rows: 2, tilt: 0.05, overlap: 0.56, minCols: 3, impasto: 0.28, soft: true }),
    });
  }
  const ready = (document.fonts?.load(`${TYPE.xl}px ${FONT}`) ?? Promise.resolve()).then(repaint);
  new ResizeObserver(repaint).observe(el);
  onLettering(el, repaint);
  return { el, input, ready: () => ready, lead: paint.lead,
    play(on) { opened = on; if (on) repaint(); paint.play(on); },
  };
}
