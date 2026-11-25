export function listenForCoverPickSkip(skip) {
  let swallowClick = false, swallowEscape = false;
  const consume = e => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!e.repeat) swallowEscape = skip();
      if (swallowEscape) consume(e);
    } else if (e.key === 'Enter' && !e.repeat && skip()) consume(e);
  }, true);
  window.addEventListener('keyup', e => { if (e.key === 'Escape') swallowEscape = false; }, true);
  window.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    swallowClick = skip();
    if (swallowClick) consume(e);
  }, true);
  window.addEventListener('pointercancel', e => { if (e.isPrimary) swallowClick = false; }, true);
  window.addEventListener('click', e => {
    const swallowedPress = e.detail > 0 && swallowClick;
    swallowClick = false;
    if (swallowedPress || skip()) consume(e);
  }, true);
}
