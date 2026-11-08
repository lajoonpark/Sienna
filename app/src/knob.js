// The volume knob's maths: how scrolling and dragging map to a volume, and where the pointer of
// the knob sits for a volume. Port of Sources/SiennaCore/VolumeKnob.swift.
//
// Volume is 0..1. The knob sweeps 270 degrees centred on 12 o'clock like a hi-fi knob, with a dead
// gap at the bottom. Angles are CLOCKWISE FROM 12 O'CLOCK, so a knob at minimum points at about
// 7 o'clock and at maximum at about 5 o'clock.

export const SWEEP = 1.5 * Math.PI;
export const MIN_ANGLE = -SWEEP / 2;
export const MAX_ANGLE = SWEEP / 2;

const clamp = (v) => Math.min(Math.max(v, 0), 1);

export class VolumeKnob {
  constructor(volume = 0.5) { this.volume = clamp(volume); }

  get angle() { return VolumeKnob.angle(this.volume); }

  static angle(volume) { return MIN_ANGLE + clamp(volume) * SWEEP; }
  static clamp(v) { return clamp(v); }

  // Volume change for one scroll event, positive = louder. `scrollDeltaY` is the physical wheel
  // direction (up = positive); the browser's deltaY is the opposite, so pass -deltaY. A trackpad
  // reports pixels (a full range takes about 300), a wheel reports lines (about 20 notches).
  static volumeChange(scrollDeltaY, { precise = false, invertedFromDevice = false } = {}) {
    const physical = invertedFromDevice ? -scrollDeltaY : scrollDeltaY;
    return physical * (precise ? 1 / 300 : 1 / 20);
  }

  adjust(delta) { this.volume = clamp(this.volume + delta); }
  set(value) { this.volume = clamp(value); }

  // Follows the pointer around the knob; `pointerAngle` is clockwise from 12 o'clock, any range.
  // Inside the gap at the bottom the knob stays at whichever end is nearer, so dragging past
  // maximum sticks at maximum instead of flipping to silence.
  drag(pointerAngle) {
    let a = pointerAngle % (2 * Math.PI);
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a < -Math.PI) a += 2 * Math.PI;
    if (a < MIN_ANGLE || a > MAX_ANGLE) this.volume = this.volume >= 0.5 ? 1 : 0;
    else this.volume = (a - MIN_ANGLE) / SWEEP;
  }
}
