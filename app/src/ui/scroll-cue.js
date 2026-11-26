import { onLettering } from '../style.js';
import { injectTokens } from './tokens.js';
import { paperSurface } from './paper.js';

export function createScrollCue(scroller, { parent } = {}) {
  injectTokens();
  if (!document.getElementById('sienna-scroll-cue')) {
    const style = document.createElement('style');
    style.id = 'sienna-scroll-cue';
    style.textContent = `
      .ui-scroll-more { mask-image: linear-gradient(to bottom, black calc(100% - var(--sienna-space-6)), transparent); }
      .ui-scroll-cue { position: relative; display: inline-block; min-height: var(--sienna-space-6);
        padding: 0 var(--sienna-space-3); font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); color: var(--sienna-ink-2); }
      .ui-scroll-cue[aria-hidden="true"] { visibility: hidden; }
    `;
    document.head.appendChild(style);
  }
  const el = document.createElement('div');
  el.className = 'ui-scroll-cue';
  const text = document.createElement('span');
  text.textContent = 'Scroll for more ↓';
  el.appendChild(text);
  (parent ?? scroller.parentElement).appendChild(el);
  const paper = paperSurface(el);
  function refresh() {
    const more = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 2;
    scroller.classList.toggle('ui-scroll-more', more);
    el.setAttribute('aria-hidden', String(!more));
  }
  scroller.addEventListener('scroll', refresh, { passive: true });
  const resize = new ResizeObserver(refresh);
  resize.observe(scroller);
  const mutation = new MutationObserver(refresh);
  mutation.observe(scroller, { childList: true, subtree: true, characterData: true });
  onLettering(el, refresh);
  refresh();
  return {
    el,
    refresh,
    destroy() {
      scroller.classList.remove('ui-scroll-more');
      resize.disconnect();
      mutation.disconnect();
      scroller.removeEventListener('scroll', refresh);
      paper.destroy();
      el.remove();
    },
  };
}
