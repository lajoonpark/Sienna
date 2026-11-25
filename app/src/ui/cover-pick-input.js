export function listenForCoverPickSkip(skip) {
  let swallowClick = false;
  const consume = e => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', e => {
    if (!e.repeat && (e.key === 'Escape' || e.key === 'Enter') && skip()) consume(e);
  }, true);
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
