// The lights going down behind a menu: a warm dark over the shop (or the mini player's card), left
// thin in a pool of lamplight on the suitcase, where the records come out of and go back into.
// The mini window sets --veil-inset/-radius/-feather so the dark stays inside its painted card.
import { injectTokens } from './tokens.js';

const CSS = `
.sienna-veil { position: fixed; inset: var(--veil-inset, 0px); border-radius: var(--veil-radius, 0px);
  --veil-dark: var(--sienna-veil);
  background: radial-gradient(ellipse 34vmax 27vmax at
      calc(var(--lamp-x, 18vw) - var(--veil-inset, 0px)) calc(var(--lamp-y, 80vh) - var(--veil-inset, 0px)),
    rgba(22, 13, 20, 0.04) 0%, rgba(22, 13, 20, 0.14) 40%, var(--veil-dark) 100%);
  box-shadow: 0 0 var(--veil-feather, 0px) var(--veil-feather, 0px) var(--veil-dark); }
.sienna-veil--night { --veil-dark: var(--sienna-night); }
`;

export function injectVeilCss() {
  injectTokens();
  if (document.getElementById('sienna-veil-css')) return;
  const style = document.createElement('style');
  style.id = 'sienna-veil-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

// Where the lamp falls, in CSS px from the top left of the window.
export function setLamp(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  document.documentElement.style.setProperty('--lamp-x', `${Math.round(point.x)}px`);
  document.documentElement.style.setProperty('--lamp-y', `${Math.round(point.y)}px`);
}
