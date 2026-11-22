// Pure layout maths for the records scene (no three.js, no DOM), shared with the Node tests.

// One layout per section of the page, in page order.
export const MODES = ['float', 'alley', 'rack', 'player', 'edge', 'ring'];
export const MODE = Object.fromEntries(MODES.map((m, i) => [m, i]));

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;

// Deterministic 0..1 random per (record, channel), so the page is the same on every visit.
export function rand(i, channel) {
  const x = Math.sin(i * 127.1 + channel * 311.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
}

// Scroll position (0..MODES.length-1, fractional) to the two modes to blend and how far.
export function modeBlend(s) {
  const max = MODES.length - 1;
  const c = clamp(s, 0, max);
  const a = Math.min(Math.floor(c), max - 1);
  return { a, b: a + 1, t: smoothstep(0.15, 0.85, c - a) };
}

// Where the page is (the middle of the view, in px) to a mode number, through anchors [{ y, s }]
// sorted by y: linear between anchors, held past the ends. Two anchors with the same s hold a layout
// over a stretch of page (the pinned shop section).
export function scrollToMode(y, anchors) {
  if (!anchors.length) return 0;
  if (y <= anchors[0].y) return anchors[0].s;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (y <= b.y) return b.y > a.y ? lerp(a.s, b.s, (y - a.y) / (b.y - a.y)) : b.s;
  }
  return anchors[anchors.length - 1].s;
}

// Progress of record i of n through a wave that runs over a shared 0..1 progress p: each record takes
// `share` of the whole, one after another (the slip into the sleeves, the walk out of them).
export function wave(p, i, n, share = 0.4) {
  const start = n > 1 ? (i / (n - 1)) * (1 - share) : 0;
  return clamp((p - start) / share, 0, 1);
}

// Records scattered through a box with no two closer than their sizes allow (they drift a little on
// top of this, `room` keeps space for that). box: { x0, x1, y0, y1, z0, z1 }, size(i) -> radius.
// Deterministic for a given box. Returns [{ x, y, z, r }].
export function scatter(n, box, size, { room = 0.6, seed = 1, tries = 400, side = null } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = size(i);
    let best = null, bestGap = -Infinity;
    for (let k = 0; k < tries; k++) {
      const u = rand(i * 977 + k, seed), v = rand(i * 977 + k, seed + 1), w = rand(i * 977 + k, seed + 2);
      let x = lerp(box.x0, box.x1, u);
      if (side) x = side(i) * lerp(box.x0, box.x1, u);
      const p = { x, y: lerp(box.y0, box.y1, v), z: lerp(box.z0, box.z1, w), r };
      let gap = Infinity;
      for (const q of out) gap = Math.min(gap, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) - p.r - q.r - room);
      if (gap >= 0) { best = p; break; }
      if (gap > bestGap) { bestGap = gap; best = p; }
    }
    out.push(best);
  }
  return out;
}

export function timeLabel(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
