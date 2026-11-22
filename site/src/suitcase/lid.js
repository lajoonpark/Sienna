// The lid's hinge as a physical thing, as in the app (app/src/lid.js): flicked open, it slows near the
// top and falls onto its stop with a little bounce; pushed shut, it lands with a small clack.
// Angles in radians, 0 = shut, `stop` = fully open. Pure maths.

const TUNING = {
  gravity: 46, friction: 2.5, stopBounce: 0.38, maxBounce: 3, shutBounce: 0.16, restSpeed: 0.9,
  pop: 1.5, driveTo: 0.25, drive: 400, closeStiffness: 520, closeDamping: 40, closeTarget: -0.07,
};

export const DEFAULT_STOP = (112 * Math.PI) / 180;

export class LidHinge {
  constructor(stop = DEFAULT_STOP) {
    this.stop = Math.max(0.1, stop);
    this.angle = 0;
    this.velocity = 0;
    this.mode = 'resting'; // resting | opening | closing
  }

  get openness() { return this.angle / this.stop; }

  release() {
    this.mode = 'opening';
    let launch;
    if (this.angle < 0.05) launch = TUNING.pop;
    else launch = Math.sqrt(Math.max(0, 2 * TUNING.gravity * (1 - Math.sin(this.angle)))) * 1.2 + 2.5;
    this.velocity = Math.max(this.velocity, launch);
  }

  shut() { this.mode = 'closing'; }
  snapShut() { this.angle = 0; this.velocity = 0; this.mode = 'resting'; }
  snapOpen() { this.angle = this.stop; this.velocity = 0; this.mode = 'resting'; }

  // Advances by dt seconds (sub-stepped at 240 Hz); returns the hardest landing during it, or 0.
  step(dt) {
    let impact = 0;
    if (this.mode === 'resting') return 0;
    const clamped = Math.min(Math.max(dt, 0), 0.25);
    const steps = Math.max(1, Math.ceil(clamped * 240 - 1e-9));
    const h = clamped / steps;
    for (let i = 0; i < steps; i++) {
      let acc;
      if (this.mode === 'closing') acc = -TUNING.closeStiffness * (this.angle - TUNING.closeTarget) - TUNING.closeDamping * this.velocity;
      else {
        acc = -TUNING.gravity * Math.cos(this.angle) - TUNING.friction * this.velocity;
        if (this.angle < TUNING.driveTo) acc += TUNING.drive;
      }
      this.velocity += acc * h;
      this.angle += this.velocity * h;
      if (this.angle >= this.stop) {
        this.angle = this.stop;
        if (this.velocity > TUNING.restSpeed) {
          impact = Math.max(impact, this.velocity);
          this.velocity = -Math.min(TUNING.stopBounce * this.velocity, TUNING.maxBounce);
        } else this.velocity = 0;
      } else if (this.angle <= 0) {
        this.angle = 0;
        if (this.velocity < -TUNING.restSpeed) {
          impact = Math.max(impact, -this.velocity);
          this.velocity = -TUNING.shutBounce * this.velocity;
        } else this.velocity = 0;
      }
    }
    const landed = (this.mode === 'opening' && this.angle === this.stop) || (this.mode === 'closing' && this.angle === 0);
    if (landed && this.velocity === 0) this.mode = 'resting';
    return impact;
  }
}
