// The volume knob and record scrubbing maths, as in the app (app/src/knob.js, app/src/scrub.js).
// Angles are clockwise from 12 o'clock. Pure maths.

export const SWEEP = 1.5 * Math.PI;
export const MIN_ANGLE = -SWEEP / 2;
export const MAX_ANGLE = SWEEP / 2;
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

export class VolumeKnob {
  constructor(volume = 0.5) { this.volume = clamp01(volume); }
  get angle() { return MIN_ANGLE + this.volume * SWEEP; }
  adjust(delta) { this.volume = clamp01(this.volume + delta); }
  // Follows the pointer; in the dead gap at the bottom it sticks at whichever end is nearer.
  drag(pointerAngle) {
    let a = pointerAngle % (2 * Math.PI);
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a < -Math.PI) a += 2 * Math.PI;
    if (a < MIN_ANGLE || a > MAX_ANGLE) this.volume = this.volume >= 0.5 ? 1 : 0;
    else this.volume = (a - MIN_ANGLE) / SWEEP;
  }
}

// Clockwise-from-12 angle of a point in [0, 2pi); y points toward the front of the case.
export function recordAngle(x, y) {
  let a = Math.atan2(x, -y);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

export const SECONDS_PER_TURN = 20;

// Turn the record clockwise to go forward, anticlockwise to go back.
export class RecordScrub {
  constructor(grabAngle, position, duration) {
    this.lastAngle = grabAngle;
    this.startPosition = Math.max(0, position);
    this.duration = Math.max(0, duration);
    this.turned = 0;
  }
  update(angle) {
    let step = angle - this.lastAngle;
    while (step > Math.PI) step -= 2 * Math.PI;
    while (step < -Math.PI) step += 2 * Math.PI;
    this.turned += step;
    this.lastAngle = angle;
  }
  get position() {
    return Math.min(Math.max(this.startPosition + (this.turned / (2 * Math.PI)) * SECONDS_PER_TURN, 0), this.duration);
  }
  get progress() { return this.duration > 0 ? this.position / this.duration : 0; }
}
