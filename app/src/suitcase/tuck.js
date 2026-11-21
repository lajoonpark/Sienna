// When the player is tucked at a rack, keep it awake while the cursor is on the visible paper
// caption beside it (or crossing the short gap between the case and the paper), without letting
// the invisible tucked caption area wake it.

export function createCaseHover() {
  let last = null, parked = false;
  return {
    update(point, onCanvas, touches) {
      if (!point || !onCanvas) { last = null; parked = false; return false; }
      if (!last || last.x !== point.x || last.y !== point.y) {
        last = { x: point.x, y: point.y };
        parked = false;
      }
      // A genuine hit stays awake as the rising case moves away from the still pointer.
      if (!parked) parked = touches();
      return parked;
    },
  };
}

export function isNearCaption({
  captionTucked,
  onCaption,
  onCanvas,
  pointerPx,
  captionRect,
  caseRect,
}) {
  if (captionTucked) return false;
  if (!onCaption && (!onCanvas || !pointerPx)) return false;
  if (!captionRect) return false;
  if (onCaption) return true;
  const left = caseRect ? Math.min(captionRect.left, caseRect.right - 20) : captionRect.left;
  return (
    pointerPx.x >= left &&
    pointerPx.x <= captionRect.right &&
    pointerPx.y >= captionRect.top &&
    pointerPx.y <= captionRect.bottom
  );
}
