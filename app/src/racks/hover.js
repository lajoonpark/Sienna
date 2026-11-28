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

function axisZoomCutNeeded(dv, aLo, aHi, rLo, rHi, sLo, sHi, anc, ins) {
  if (aHi - aLo > sHi - sLo + 1e-4) return true;
  if (aLo + dv < sLo - 1e-4) {
    if (anc - ins >= sLo - 1e-4) return true;
    if (rLo - aLo > 1e-4 && anc - ins > -1 + 1e-4 && aLo + dv < -1 - 1e-4) return true;
  }
  if (aHi + dv > sHi + 1e-4) {
    if (anc + ins <= sHi + 1e-4) return true;
    if (aHi - rHi > 1e-4 && anc + ins < 1 - 1e-4 && aHi + dv > 1 + 1e-4) return true;
  }
  return false;
}

// Can giving up zoom (focus.cut) actually clear the remaining edge or button clash?
// Any allowed pan keeps the cursor's keep-box inside the cover, so if the cursor itself is already past
// a safe margin (e.g. hovering the bottom row below FOCUS.floor with the tag flipped above), zooming out
// cannot move that cover edge past the cursor — cutting zoom would only bounce the camera back out.
export function zoomCutNeeded({ rec: [cl, cr, cb, ct], all: [l, r, b, t], anchor }, d, safe, [keepX, keepY], boxes = [], bestO = 0) {
  const ix = Math.min(keepX, 0.45 * (cr - cl)), iy = Math.min(keepY, 0.45 * (ct - cb));
  if (axisZoomCutNeeded(d[0], l, r, cl, cr, safe[0][0], safe[0][1], anchor.x, ix)) return true;
  if (axisZoomCutNeeded(d[1], b, t, cb, ct, safe[1][0], safe[1][1], anchor.y, iy)) return true;
  if (bestO <= 0) return false;
  const kl = anchor.x - ix, kr = anchor.x + ix, kb = anchor.y - iy, kt = anchor.y + iy;
  const minO = boxes.reduce((a, o) => a + Math.max(0, Math.min(kr, o[1]) - Math.max(kl, o[0]) - 1e-5)
    * Math.max(0, Math.min(kt, o[3]) - Math.max(kb, o[2]) - 1e-5), 0);
  return bestO > minO + 1e-9;
}
