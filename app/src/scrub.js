// Scrubbing with the record: turn it clockwise to go forward, anticlockwise to go back, like
// dragging a platter. Port of Sources/SiennaCore/RecordScrub.swift. Pure maths; the view feeds it
// the pointer's angle about the record's centre (clockwise from 12 o'clock, see recordAngle).

// Clockwise-from-12 angle of a point in [0, 2pi). y points DOWN the screen (towards the front of
// the case), as in RecordLayout.angle.
export function recordAngle(x, y) {
  let a = Math.atan2(x, -y);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

export const SECONDS_PER_TURN = 20; // how far one full turn of the record moves the song

export class RecordScrub {
  constructor(grabAngle, position, duration) {
    this.lastAngle = grabAngle;
    this.startPosition = Math.max(0, position);
    this.duration = Math.max(0, duration);
    this.turned = 0; // radians since the grab, unwrapped so it can pass a full circle
  }

  // Feeds the next pointer angle. The step is taken the short way round, so crossing 12 o'clock
  // (359 -> 1 degrees) is a 2 degree turn, not a 358 degree one.
  update(angle) {
    let step = angle - this.lastAngle;
    while (step > Math.PI) step -= 2 * Math.PI;
    while (step < -Math.PI) step += 2 * Math.PI;
    this.turned += step;
    this.lastAngle = angle;
  }

  // Where the song would be now, kept inside the song.
  get position() {
    const target = this.startPosition + (this.turned / (2 * Math.PI)) * SECONDS_PER_TURN;
    return Math.min(Math.max(target, 0), this.duration);
  }

  get progress() { return this.duration > 0 ? this.position / this.duration : 0; }
}
