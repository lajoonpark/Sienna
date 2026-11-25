export function lockHover(focus, pointer, px, key) {
  focus.freeze = pointer ? { key, x: px.x, y: px.y } : null;
}

export function focusHover(focus, pointer, px, unfreezePx, pick) {
  const lock = focus.freeze;
  if (lock && (!pointer || Math.hypot(px.x - lock.x, px.y - lock.y) > unfreezePx)) focus.freeze = null;
  return pointer ? (focus.freeze?.key ?? pick()) : -1;
}

export function hoverPanBounds({ rec: [left, right, bottom, top], anchor }, keepX, keepY) {
  const ix = Math.min(keepX, 0.45 * (right - left)), iy = Math.min(keepY, 0.45 * (top - bottom));
  return [[anchor.x - right + ix, anchor.x - left - ix], [anchor.y - top + iy, anchor.y - bottom - iy]];
}

// Has the camera come to rest on the held-up record? (main.js updateFocus: from then on its framing holds)
// panLeft: steerClear's slide still to go (px); zoomLeft: share of the push-in still to go; swingLeft: radians.
export function framedAtRest({ settled, panLeft, zoomLeft, swingLeft }, { restPx, restZoom, restSwing }) {
  return settled && panLeft <= restPx && zoomLeft <= restZoom && swingLeft <= restSwing;
}
