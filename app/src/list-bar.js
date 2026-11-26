// What Search and the collection lists share: the card they sit on, its search line (a magnifying
// glass and a hand-lettered input on a ruled line) and the dimmed shop behind.
import { injectTokens } from './ui/tokens.js';
import { icon } from './ui/icons.js';
import { injectCrateCss } from './ui/crate.js';
import { injectVeilCss } from './ui/veil.js';
import { fontReady } from './style.js';

const CSS = `
.list-bar { display: flex; align-items: center; gap: var(--sienna-space-3); flex: none;
  margin: 0 var(--sienna-space-1) var(--sienna-space-2); padding-bottom: var(--sienna-space-1);
  border-bottom: 2px solid var(--sienna-indigo); transition: border-color var(--sienna-dur-fast); }
.list-bar:focus-within { border-bottom-color: var(--sienna-terracotta); }
.list-bar > svg { flex: none; width: 26px; height: 26px; color: var(--sienna-indigo); }
.list-bar input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; padding: 2px 0;
  font: var(--sienna-text-xl)/1.2 var(--sienna-font); color: var(--sienna-ink); caret-color: var(--sienna-terracotta); }
.list-bar input::placeholder { color: var(--sienna-ink-3); opacity: 1; }
.list-bar > .ui-stamp { flex: none; }

/* A list card hangs near the top of the window, leaving room above for its tabs and below for its keys. */
.list-overlay { --card-top: var(--list-top, 66px); --card-bottom: var(--list-bottom, 72px);
  position: fixed; top: var(--card-top); left: 0; right: 0; margin-inline: auto; box-sizing: border-box;
  padding: var(--sienna-space-4) var(--sienna-space-5) var(--sienna-space-2);
  width: min(680px, calc(100vw - var(--sienna-space-8)));
  max-height: calc(100dvh - var(--card-top) - var(--card-bottom)); z-index: var(--sienna-z-list);
  display: flex; flex-direction: column; font-family: var(--sienna-font); visibility: hidden; pointer-events: none; }
.list-overlay.show { visibility: visible; pointer-events: auto; }
.list-overlay.closing { visibility: visible; }
.list-overlay > .ui-list { min-height: 0; flex: 1; overflow: clip; }
.list-overlay .ui-list-scroll { min-height: 0; }
.list-overlay > .ui-seg--switch { flex: none; align-self: flex-start; margin: 0 var(--sienna-space-1) var(--sienna-space-2); }
/* the keys sit under the card, on the dimmed shop */
.list-overlay > .ui-list-foot { position: absolute; left: 0; right: 0; top: calc(100% + var(--sienna-space-3) + 2px);
  justify-content: center; padding: 0; border: 0; }
.list-veil { z-index: var(--sienna-z-banner); visibility: hidden; opacity: 0; pointer-events: none;
  transition: opacity 460ms cubic-bezier(0.5, 0, 0.75, 0.5), visibility 0s 460ms; }
.list-veil.show { visibility: visible; opacity: 1; pointer-events: auto;
  transition: opacity var(--sienna-dur-mid), visibility 0s; }
@media (max-width: 720px) {
  .list-overlay { padding: var(--sienna-space-3) var(--sienna-space-4) var(--sienna-space-1);
    width: min(680px, calc(100vw - var(--sienna-space-10))); }
}
`;

function inject() {
  injectTokens();
  injectCrateCss();
  injectVeilCss();
  if (document.getElementById('sienna-list-bar')) return;
  const style = document.createElement('style');
  style.id = 'sienna-list-bar'; style.textContent = CSS; document.head.appendChild(style);
}

export function createListVeil(close) {
  inject();
  const el = document.createElement('div'); el.className = 'list-veil sienna-veil';
  el.addEventListener('pointerdown', close); document.body.appendChild(el);
  return { el, show: (on) => el.classList.toggle('show', on) };
}

export function createListBar({ prefix, label, placeholder }) {
  inject();
  const el = document.createElement('div'); el.className = `list-bar ${prefix}-bar`;
  const glass = icon('search', { size: 26 });
  const input = document.createElement('input'); input.className = `${prefix}-input`;
  input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'off'); input.setAttribute('aria-label', label); input.placeholder = placeholder;
  el.append(glass, input);
  return { el, input, ready: () => fontReady };
}
