// Where to slide a hovered record (and its tag) on screen so the window edge and the words drawn over
// the picture (section menu, Home, Settings) do not cut it off, without it leaving the cursor.
// Pure 2D, in CSS px (y down); main.js turns the slide into a camera move.
//
//   frameShift({ box, view, obstacles, keep })  -> [dx, dy]   the smallest slide that clears them
//     box:       { l, t, r, b }        the record and its tag together
//     view:      { l, t, r, b }        the part of the window that is clear (window minus a margin)
//     obstacles: [{ l, t, r, b }]      words to stay out from under
//     keep:      [[[x, y] x4], ...]    convex quads (the record shrunk by the cursor inset, as the cursor
//                                      sees it): each must still hold its cursor point after the slide.
//                                      Given as the allowed slides: quad k = cursor_k - record quad.
// When nothing clears everything, the slide that leaves the least of the box covered wins.

const area = (l, t, r, b) => Math.max(0, r - l) * Math.max(0, b - t);

// px² of the box outside the view or under a word
export function coveredArea(box, view, obstacles) {
  const all = area(box.l, box.t, box.r, box.b);
  let bad = all - area(Math.max(box.l, view.l), Math.max(box.t, view.t), Math.min(box.r, view.r), Math.min(box.b, view.b));
  for (const o of obstacles) bad += area(Math.max(box.l, o.l), Math.max(box.t, o.t), Math.min(box.r, o.r), Math.min(box.b, o.b));
  return bad;
}

function inside(quad, x, y) {
  let pos = 0, neg = 0;
  for (let i = 0; i < quad.length; i++) {
    const [ax, ay] = quad[i], [bx, by] = quad[(i + 1) % quad.length];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c > 1e-9) pos++; else if (c < -1e-9) neg++;
  }
  return !(pos && neg);
}
function nearestOnQuad(quad, x, y) {
  let best = Infinity, out = [x, y];
  for (let i = 0; i < quad.length; i++) {
    const [ax, ay] = quad[i], [bx, by] = quad[(i + 1) % quad.length], ex = bx - ax, ey = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
    const nx = ax + ex * t, ny = ay + ey * t, d = Math.hypot(x - nx, y - ny);
    if (d < best) { best = d; out = [nx, ny]; }
  }
  return out;
}
// the nearest slide every keep quad allows (alternating projections: exact for one quad, close for two)
export function clampToKeep(keep, x, y) {
  for (let it = 0; it < 8; it++) {
    let moved = false;
    for (const q of keep) if (!inside(q, x, y)) { [x, y] = nearestOnQuad(q, x, y); moved = true; }
    if (!moved) break;
  }
  return [x, y];
}

export function frameShift({ box, view, obstacles = [], keep = [] }) {
  const xs = [0, view.l - box.l, view.r - box.r], ys = [0, view.t - box.t, view.b - box.b];
  for (const o of obstacles) { xs.push(o.l - box.r, o.r - box.l); ys.push(o.t - box.b, o.b - box.t); }
  let best = null;
  for (const cx of xs) for (const cy of ys) {
    const [dx, dy] = clampToKeep(keep, cx, cy);
    const bad = coveredArea({ l: box.l + dx, t: box.t + dy, r: box.r + dx, b: box.b + dy }, view, obstacles);
    // any covering outweighs a long slide: 10 px² of record is worth a px of camera travel
    const cost = bad / 10 + Math.hypot(dx, dy);
    if (!best || cost < best.cost - 1e-6) best = { cost, d: [dx, dy] };
  }
  return best.d;
}
