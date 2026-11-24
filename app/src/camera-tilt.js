const OMEGA = 22;
const MAX_SPEED = 4.5; // cursor coordinates per second, shared across both axes
const MAX_GAP = 2 * MAX_SPEED / OMEGA;

export function createCameraTilt() {
  let vx = 0, vy = 0;
  return {
    x: 0, y: 0, tx: 0, ty: 0,
    step(dt, held) {
      if (held) { vx = vy = 0; return; }
      if (dt <= 0 || (this.x === this.tx && this.y === this.ty && !vx && !vy)) return;

      // Limit the spring's drive on wide sweeps and resample it in steps of at most 1/60 s.
      const steps = Math.ceil(dt * 60);
      const h = dt / steps, decay = Math.exp(-OMEGA * h);
      for (let i = 0; i < steps; i++) {
        const dx = this.tx - this.x, dy = this.ty - this.y;
        const gain = Math.min(1, MAX_GAP / Math.hypot(dx, dy));
        const gx = dx * gain, gy = dy * gain;
        // Exact critically damped step, retaining velocity when the cursor changes direction.
        const cx = vx - OMEGA * gx, cy = vy - OMEGA * gy;
        this.x += gx * (1 - decay) + cx * h * decay;
        this.y += gy * (1 - decay) + cy * h * decay;
        vx = (vx - OMEGA * cx * h) * decay;
        vy = (vy - OMEGA * cy * h) * decay;
      }
      // End at an exact rest so the painter can reuse the still frame.
      if (Math.hypot(this.tx - this.x, this.ty - this.y) < 1e-4 && Math.hypot(vx, vy) < 1e-3) {
        this.x = this.tx;
        this.y = this.ty;
        vx = vy = 0;
      }
    },
  };
}
