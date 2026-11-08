// The lid's hinge as a physical thing, not an easing curve. Port of Sources/SiennaCore/LidHinge.swift.
//
// A real lid is flicked, goes over the top and falls onto its stop. Gravity pulls it shut until it
// passes vertical and open after that, so the swing slows near the top and then drops; the stop is
// hard and gives a little bounce, and a lid that is pushed shut meets the case with a small clack.
// A spring cannot do any of that: it has no top to slow at and no stop to land on.
//
// Angles are radians, 0 = shut, `stop` = fully open. No view in here, so the properties that
// matter (it always ends open, never stalls half way, never leaves its travel) are unit tested.

const TUNING = {
  gravity: 46,        // pull on the lid as an angular acceleration at the horizontal
  friction: 2.5,      // drag at the hinge, per second
  stopBounce: 0.38,   // share of its speed the lid keeps when it lands on the open stop
  maxBounce: 3,       // cap on that rebound, so a hard launch cannot bounce back below vertical
  shutBounce: 0.16,   // the same for the shut stop: a closing lid lands, it does not rattle
  restSpeed: 0.9,     // below this a landing is a settle and the lid stops dead
  pop: 1.5,           // launch speed from fully shut: the latch letting go
  driveTo: 0.25,      // the latch's push stays on until the lid has opened this far (~14 deg)
  drive: 400,
  closeStiffness: 520, // closing is a stiff, well damped spring aimed a little past shut
  closeDamping: 40,
  closeTarget: -0.07,
};

// A suitcase lid rests leaning a little past vertical.
export const DEFAULT_STOP = (112 * Math.PI) / 180;

export class LidHinge {
  constructor(stop = DEFAULT_STOP) {
    this.stop = Math.max(0.1, stop);
    this.angle = 0;
    this.velocity = 0;
    this.mode = 'resting'; // resting | opening | closing
    this.impact = 0;       // speed of the hardest landing in the last step(), or 0
  }

  // 0 = shut, 1 = fully open
  get openness() { return this.angle / this.stop; }
  get isMoving() { return this.mode !== 'resting'; }

  // Flicks the lid open from wherever it is. From shut it gets the latch's pop; from part way (a
  // reversed close) it is launched with enough speed to clear vertical, because a lid that stalls
  // at 80 degrees falls back shut and the case would flicker open and close on its own.
  release() {
    this.mode = 'opening';
    let launch;
    if (this.angle < 0.05) launch = TUNING.pop;
    else {
      const climb = Math.max(0, 2 * TUNING.gravity * (1 - Math.sin(this.angle)));
      launch = Math.sqrt(climb) * 1.2 + 2.5;
    }
    this.velocity = Math.max(this.velocity, launch);
  }

  // Pushes the lid shut.
  shut() { this.mode = 'closing'; }

  snapShut() { this.angle = 0; this.velocity = 0; this.mode = 'resting'; this.impact = 0; }
  snapOpen() { this.angle = this.stop; this.velocity = 0; this.mode = 'resting'; this.impact = 0; }

  // Advances by dt seconds and returns the hardest landing during it (0 if none). Sub-stepped at
  // 240 Hz so a stalled frame cannot make the lid tunnel through its stop.
  step(dt) {
    this.impact = 0;
    if (this.mode === 'resting') return 0;
    const clamped = Math.min(Math.max(dt, 0), 0.25);
    const steps = Math.max(1, Math.ceil(clamped * 240 - 1e-9));
    const h = clamped / steps;
    for (let i = 0; i < steps; i++) {
      let acc;
      if (this.mode === 'closing') {
        acc = -TUNING.closeStiffness * (this.angle - TUNING.closeTarget) - TUNING.closeDamping * this.velocity;
      } else {
        acc = -TUNING.gravity * Math.cos(this.angle) - TUNING.friction * this.velocity;
        if (this.angle < TUNING.driveTo) acc += TUNING.drive;
      }
      this.velocity += acc * h;
      this.angle += this.velocity * h;
      if (this.angle >= this.stop) {
        this.angle = this.stop;
        if (this.velocity > TUNING.restSpeed) {
          this.impact = Math.max(this.impact, this.velocity);
          this.velocity = -Math.min(TUNING.stopBounce * this.velocity, TUNING.maxBounce);
        } else this.velocity = 0;
      } else if (this.angle <= 0) {
        this.angle = 0;
        if (this.velocity < -TUNING.restSpeed) {
          this.impact = Math.max(this.impact, -this.velocity);
          this.velocity = -TUNING.shutBounce * this.velocity;
        } else this.velocity = 0;
      }
    }
    const landed = (this.mode === 'opening' && this.angle === this.stop) || (this.mode === 'closing' && this.angle === 0);
    if (landed && this.velocity === 0) this.mode = 'resting';
    return this.impact;
  }
}
