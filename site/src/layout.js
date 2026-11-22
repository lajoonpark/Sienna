// Pure layout maths for the vinyl scene (no three.js, no DOM), shared with the Node tests.

export const MODES = ['float', 'rack', 'player', 'edge', 'ring'];

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Deterministic 0..1 random per (disk, channel), so the layout is the same on every visit.
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

// Tonearm: pivot sits off the record; the arm turns so the needle rests at radius r.
export const ARM = { pivot: [1.3, 0.95], length: 1.25, rest: 1.25, outer: 0.95, inner: 0.42 };

export function armAngle(r, arm = ARM) {
  const [px, py] = arm.pivot;
  const d = Math.hypot(px, py);
  const cos = (d * d + arm.length * arm.length - r * r) / (2 * d * arm.length);
  return Math.atan2(-py, -px) + Math.acos(clamp(cos, -1, 1));
}

// progress 0..1 through the song; null when the arm is parked.
export function needleRadius(progress, arm = ARM) {
  if (progress == null) return arm.rest;
  const p = clamp(progress, 0, 1);
  return arm.outer * (1 - p) + arm.inner * p;
}

export function timeLabel(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
