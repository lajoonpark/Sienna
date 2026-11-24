export function lockHover(focus, pointer, px, key) {
  focus.freeze = pointer ? { key, x: px.x, y: px.y } : null;
}

export function focusHover(focus, pointer, px, unfreezePx, pick) {
  const lock = focus.freeze;
  if (lock && (!pointer || Math.hypot(px.x - lock.x, px.y - lock.y) > unfreezePx)) focus.freeze = null;
  return pointer ? (focus.freeze?.key ?? pick()) : -1;
}
