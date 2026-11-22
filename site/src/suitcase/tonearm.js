// Where everything sits on the suitcase and the tonearm's geometry, as in the app (app/src/tonearm.js).
// Case units: x right, y up, z toward the front of the case, centred on the origin. Pure maths.

export const LAYOUT = {
  caseWidth: 4.6,
  caseDepth: 3.2,
  baseHeight: 0.95,
  lidHeight: 0.55,
  deckInset: 0.14,
  get deckHeight() { return this.baseHeight + 0.01; },
  get deckHalfWidth() { return this.caseWidth / 2 - this.deckInset; },
  get deckHalfDepth() { return this.caseDepth / 2 - this.deckInset; },
  record: { x: -0.85, z: 0.12 },
  recordRadius: 1.12,
  platterRadius: 1.2,
  labelRadius: 0.5,
  get recordTop() { return this.deckHeight + 0.07; },
};

// The in-shop arrangement (bigger knob and buttons): the case is drawn small there, as it is here.
export const CONTROLS = {
  knob: { x: 1.4, z: -0.3 },
  knobRadius: 0.4,
  buttons: {
    previous: { x: 0.4, z: 1.09, radius: 0.28 },
    playPause: { x: 1.11, z: 1.09, radius: 0.32 },
    next: { x: 1.82, z: 1.09, radius: 0.28 },
    like: { x: 1.85, z: 0.47, radius: 0.24 },
  },
  ring: 0.04,
};

export const TONEARM = {
  pivot: { x: 1.75, z: -1.0 },
  length: 2.4,
  outerRadius: 1.0,
  innerRadius: 0.6,
  parkOffset: 0.16,
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The stylus for a distance from the record's centre: of the two points the arm can reach, the one
// toward the back of the case, so the arm never crosses the knob or the buttons. Null if out of reach.
export function stylusAt(radius) {
  const c = LAYOUT.record, p = TONEARM.pivot, L = TONEARM.length;
  const d = distance(p, c);
  const a = (L * L - radius * radius + d * d) / (2 * d);
  const h2 = L * L - a * a;
  if (h2 < 0) return null;
  const h = Math.sqrt(h2);
  const ux = (c.x - p.x) / d, uz = (c.z - p.z) / d;
  const mid = { x: p.x + a * ux, z: p.z + a * uz };
  const one = { x: mid.x - h * uz, z: mid.z + h * ux };
  const two = { x: mid.x + h * uz, z: mid.z - h * ux };
  return one.z <= two.z ? one : two;
}

// Turn about the vertical for an arm modelled along local -x, so its tip lands on the stylus.
export function armAngleAtRadius(radius) {
  const s = stylusAt(radius);
  if (!s) return null;
  return Math.atan2(s.z - TONEARM.pivot.z, -(s.x - TONEARM.pivot.x));
}

// 0 = start of the song, 1 = the end.
export function armAngleForProgress(progress) {
  const p = Math.min(Math.max(progress, 0), 1);
  return armAngleAtRadius(TONEARM.outerRadius + (TONEARM.innerRadius - TONEARM.outerRadius) * p) ?? 0;
}

export const parkedArmAngle = () => armAngleForProgress(0) - TONEARM.parkOffset;
