// The CSS matrix3d that lays a w x h box (transform-origin 0 0) onto four points on screen, given top left,
// top right, bottom right, bottom left. Perspective and all; null if the points fold flat.
export function quadTransform(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (!(Math.abs(den) > 1e-6) || !(w > 0) || !(h > 0)) return null;
  const p = (sx * dy2 - dx2 * sy) / den, q = (dx1 * sy - sx * dy1) / den;
  const m = [
    (x1 - x0 + p * x1) / w, (y1 - y0 + p * y1) / w, 0, p / w,
    (x3 - x0 + q * x3) / h, (y3 - y0 + q * y3) / h, 0, q / h,
    0, 0, 1, 0,
    x0, y0, 0, 1,
  ];
  return `matrix3d(${m.map((n) => +n.toFixed(8)).join(',')})`;
}
