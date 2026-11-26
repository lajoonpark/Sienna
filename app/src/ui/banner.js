// Paper status & error banner for offline notices, load errors (with Retry), and restock status.
// Sits top-centre on --sienna-z-banner when floating, uses role="status" for offline/restock
// and role="alert" for errors, with an optional inkButton action and optional auto-hide.
import { injectTokens } from './tokens.js';
import { paperSurface } from './paper.js';
import { inkButton, stamp } from './inputs.js';
import { icon } from './icons.js';

const BANNER_CSS = `
.ui-banner { position: relative; display: flex; align-items: center; gap: var(--sienna-space-3);
  padding: var(--sienna-space-3) var(--sienna-space-6);
  max-width: min(640px, 90vw); box-sizing: border-box;
  font-family: var(--sienna-serif); color: var(--sienna-ink);
  transform: rotate(var(--sienna-tilt-sm)); }
.ui-banner--floating { position: fixed; top: var(--sienna-space-5); left: 50%; z-index: var(--sienna-z-banner);
  transform: translateX(-50%) translateY(-10px) rotate(var(--sienna-tilt-sm));
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity var(--sienna-dur-mid) var(--sienna-ease-out), transform var(--sienna-dur-mid) var(--sienna-ease-out), visibility 0s var(--sienna-dur-mid); }
.ui-banner--floating.show { opacity: 1; visibility: visible; pointer-events: auto;
  transform: translateX(-50%) translateY(0) rotate(var(--sienna-tilt-sm));
  transition: opacity var(--sienna-dur-mid) var(--sienna-ease-out), transform var(--sienna-dur-mid) var(--sienna-ease-out); }
.ui-banner-mark { flex: none; width: 4px; align-self: stretch; border-radius: 2px; background: var(--sienna-indigo); }
.ui-banner--error .ui-banner-mark { background: var(--sienna-danger); }
.ui-banner--restock .ui-banner-mark { background: var(--sienna-terracotta); }
.ui-banner-ico { flex: none; display: inline-flex; align-items: center; color: var(--sienna-terracotta); }
.ui-banner--spin .ui-banner-ico { animation: ui-spin 900ms linear infinite; }
.ui-banner-msg { flex: 1; min-width: 0; font-family: var(--sienna-serif); font-size: var(--sienna-text-md);
  line-height: 1.35; color: var(--sienna-ink); }
.ui-banner--error .ui-banner-msg { color: var(--sienna-danger); }
.ui-banner-act { flex: none; display: inline-flex; align-items: center; gap: var(--sienna-space-2); }
.ui-banner-act:empty { display: none; }
`;

function injectBannerCss() {
  injectTokens();
  if (typeof document === 'undefined' || !document.head || document.getElementById('sienna-ui-banner')) return;
  const st = document.createElement('style');
  st.id = 'sienna-ui-banner';
  st.textContent = BANNER_CSS;
  document.head.appendChild(st);
}

export function createBanner({ parent = null, floating = true } = {}) {
  injectBannerCss();
  const el = document.createElement('div');
  el.className = `ui-banner${floating ? ' ui-banner--floating' : ''}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  const mark = document.createElement('span');
  mark.className = 'ui-banner-mark';
  mark.setAttribute('aria-hidden', 'true');

  const icoSlot = document.createElement('span');
  icoSlot.className = 'ui-banner-ico';
  icoSlot.hidden = true;

  const msgEl = document.createElement('div');
  msgEl.className = 'ui-banner-msg';

  const actSlot = document.createElement('div');
  actSlot.className = 'ui-banner-act';

  el.append(mark, icoSlot, msgEl, actSlot);
  if (parent || floating) (parent ?? document.body).appendChild(el);

  const paper = paperSurface(el, { elevation: 'lift' });

  let visible = !floating;
  let hideTimer = 0;
  let actionBtn = null;
  let dismissBtn = null;

  function clearActions() {
    actionBtn?.destroy?.();
    actionBtn = null;
    dismissBtn?.destroy?.();
    dismissBtn = null;
    actSlot.replaceChildren();
  }

  function hide() {
    clearTimeout(hideTimer);
    hideTimer = 0;
    visible = false;
    el.classList.remove('show', 'ui-banner--spin');
  }

  function show({
    message = '',
    kind = 'status', // 'offline' | 'error' | 'restock' | 'status'
    actionLabel = null,
    onAction = null,
    autoHideMs = 0,
    dismissible = false,
    spinning = false,
  } = {}) {
    clearTimeout(hideTimer);
    hideTimer = 0;
    clearActions();

    if (!message) {
      hide();
      return;
    }

    const isErr = kind === 'error';
    el.setAttribute('role', isErr ? 'alert' : 'status');
    el.setAttribute('aria-live', isErr ? 'assertive' : 'polite');
    el.classList.toggle('ui-banner--error', isErr);
    el.classList.toggle('ui-banner--offline', kind === 'offline');
    el.classList.toggle('ui-banner--restock', kind === 'restock');
    el.classList.toggle('ui-banner--spin', !!spinning);

    if (kind === 'restock') {
      icoSlot.replaceChildren(icon('restock', { size: 18 }));
      icoSlot.hidden = false;
    } else {
      icoSlot.replaceChildren();
      icoSlot.hidden = true;
    }

    msgEl.textContent = String(message);

    if (actionLabel && onAction) {
      actionBtn = inkButton(actionLabel, {
        size: 'sm',
        danger: isErr,
        onClick: (e) => onAction(e),
      });
      actSlot.appendChild(actionBtn);
    }

    if (dismissible) {
      dismissBtn = stamp('close', {
        label: 'Dismiss',
        size: 'sm',
        tooltipPos: 'bottom',
        onClick: () => hide(),
      });
      actSlot.appendChild(dismissBtn);
    }

    visible = true;
    if (floating) el.classList.add('show');

    if (autoHideMs > 0) {
      hideTimer = setTimeout(() => {
        hideTimer = 0;
        hide();
      }, autoHideMs);
    }
  }

  function destroy() {
    clearTimeout(hideTimer);
    hideTimer = 0;
    clearActions();
    paper.destroy();
    el.remove();
  }

  return {
    el,
    show,
    hide,
    isVisible: () => visible,
    destroy,
  };
}
