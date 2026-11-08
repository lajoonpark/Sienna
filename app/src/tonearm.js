// Where everything sits on the suitcase, in scene units, and the tonearm's geometry. Port of
// Sources/SiennaCore/SuitcaseLayout.swift. The case sits with its centre over the origin: x runs
// left to right, z towards the viewer (the front of the case), y up. A deck point is {x, z}.
// Shared by the 3D suitcase (which builds it) and the tests (which check it hangs together).

export const LAYOUT = {
  caseWidth: 4.6,
  caseDepth: 3.2,
  baseHeight: 0.95,
  lidHeight: 0.55,
  deckInset: 0.14,            // leather frame left around the deck plate
  get deckHeight() { return this.baseHeight + 0.01; },
  get deckHalfWidth() { return this.caseWidth / 2 - this.deckInset; },
  get deckHalfDepth() { return this.caseDepth / 2 - this.deckInset; },

  record: { x: -0.85, z: 0.12 },
  recordRadius: 1.12,
  platterRadius: 1.2,
  labelRadius: 0.5,           // the cover in the middle (a bit larger than a real label: it must be readable)
  get recordTop() { return this.deckHeight + 0.07; },

  knob: { x: 1.5, z: 0.15 },
  knobRadius: 0.3,
};

// Buttons in a row along the front of the deck, to the right of the record.
export const BUTTONS = {
  previous: { x: 0.8, z: 1.05, radius: 0.15 },
  playPause: { x: 1.18, z: 1.05, radius: 0.19 },
  next: { x: 1.56, z: 1.05, radius: 0.15 },
  like: { x: 1.94, z: 1.05, radius: 0.14 },
};

// The controls on the deck. `big` is the arrangement the in-shop overlay uses: the case is drawn
// small there, so knob and buttons are about 1.8x larger (about 25-28 px buttons and a 35 px knob
// at 1280x720). The three transport buttons take the front row, like sits above them, the knob moves
// up. Same parts, same behaviour.
export function controlLayout(big = false) {
  if (!big) return { knob: LAYOUT.knob, knobRadius: LAYOUT.knobRadius, buttons: BUTTONS, ring: 0 };
  return {
    knob: { x: 1.4, z: -0.3 },
    knobRadius: 0.4,
    buttons: {
      previous: { x: 0.4, z: 1.09, radius: 0.28 },
      playPause: { x: 1.11, z: 1.09, radius: 0.32 },
      next: { x: 1.82, z: 1.09, radius: 0.28 },
      like: { x: 1.85, z: 0.47, radius: 0.24 },
    },
    ring: 0.04,   // the brass ring round each button, which the layout test counts too
  };
}

// What you can touch. Buttons are clicked; the knob and the record are dragged.
export const CONTROLS = ['previous', 'playPause', 'next', 'like', 'knob', 'record'];
export const isButton = (c) => c in BUTTONS;
export const COMMANDS = { previous: 'previous', playPause: 'toggle', next: 'next', like: 'like' };

export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// A straight arm of fixed length pivoting at the back right, whose stylus runs from the outer
// groove to the inner groove as the song plays.
export const TONEARM = {
  pivot: { x: 1.75, z: -1.0 },
  length: 2.4,
  outerRadius: 1.0,     // distance of the stylus from the record's centre at the start of the song
  innerRadius: 0.6,     // ...and at the end
  parkOffset: 0.16,     // how far the arm swings outward (radians) when parked: clear of the record, still on the deck
};

// The stylus position for a given distance from the record's centre: where a circle of that radius
// about the record meets the circle the arm can reach. Of the two meeting points the one towards
// the back of the case, so the arm never crosses the knob or buttons. Null if it cannot reach.
export function stylusAt(radius) {
  const c = LAYOUT.record, p = TONEARM.pivot, L = TONEARM.length;
  const d = distance(p, c);
  if (!(d > 0)) return null;
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

// Rotation about the vertical axis for an arm modelled pointing along local -x, so that its tip
// lands on the stylus. Null if the arm cannot reach that radius.
export function armAngleAtRadius(radius) {
  const s = stylusAt(radius);
  if (!s) return null;
  return Math.atan2(s.z - TONEARM.pivot.z, -(s.x - TONEARM.pivot.x));
}

// 0 = start of the song, 1 = end.
export function armAngleForProgress(progress) {
  const p = Math.min(Math.max(progress, 0), 1);
  const radius = TONEARM.outerRadius + (TONEARM.innerRadius - TONEARM.outerRadius) * p;
  return armAngleAtRadius(radius) ?? 0;
}

// Where the arm rests when nothing is playing: swung clear of the record. (The Swift version added
// the offset, which turned the arm the other way, over the label; a test now checks the park.)
export const parkedArmAngle = () => armAngleForProgress(0) - TONEARM.parkOffset;
