// Particles for the first-run tour (src/tour.js): paint splats, paper confetti, music notes and little
// records that burst out of a button, a ticked shortcut or a note landing. One canvas over the whole
// window, just behind the notes (so paint never lands on what you are reading), that only draws while something is flying: when the last particle is gone it is cleared and the
// loop stops, so a tour at rest costs nothing. Nothing at all under prefers-reduced-motion or in shots.
import { INK, HOT } from './controls.js';

export const COLOURS = [HOT, INK, '#d9a441', '#7f9c6b', '#c76f8e', '#4f8fa8'];
const NOTES = ['♪', '♫', '♩', '♬'];

export function createFx({ still = false } = {}) {
  const calm = still || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'tr-fx';
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:7';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let dpr = 1, W = 0, H = 0;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  size();
  addEventListener('resize', size);

  let parts = [];
  let raf = 0, last = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  function spawn(x, y, kind, o) {
    const ang = o.angle != null ? o.angle + rnd(-o.spread, o.spread) : rnd(0, Math.PI * 2);
    const sp = rnd(0.35, 1) * o.power;
    const p = {
      kind, x, y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      g: kind === 'note' ? -60 : kind === 'strip' ? 380 : 620,   // notes float up, paper flutters down
      drag: kind === 'strip' ? 2.4 : kind === 'note' ? 1.6 : 1.1,
      rot: rnd(0, Math.PI * 2), vr: rnd(-8, 8),
      size: kind === 'note' ? rnd(18, 30) : kind === 'disc' ? rnd(9, 15) : kind === 'strip' ? rnd(6, 11) : rnd(3, 8),
      colour: o.colours ? pick(o.colours) : pick(COLOURS),
      life: 0, ttl: rnd(0.9, 1.6) * (kind === 'note' ? 1.5 : 1),
      ch: pick(NOTES),
      wob: rnd(0, 6), // strips flip, notes sway
      // a splat is a blob with a few droplets round it
      blobs: kind === 'splat' ? Array.from({ length: 3 + ((Math.random() * 3) | 0) }, () => [rnd(-1.4, 1.4), rnd(-1.4, 1.4), rnd(0.25, 0.6)]) : null,
    };
    parts.push(p);
  }

  // burst at (x, y) or out of an element. kinds: which particles, count, power (px/s), angle/spread (radians)
  function burst(at, { count = 24, kinds = ['splat', 'strip', 'note'], power = 520, angle = null, spread = Math.PI, colours = null } = {}) {
    if (calm) return;
    let x = at, y = 0;
    if (at && typeof at === 'object' && 'getBoundingClientRect' in at) {
      const r = at.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + r.height / 2;
    } else if (Array.isArray(at)) [x, y] = at;
    for (let i = 0; i < count; i++) spawn(x, y, kinds[i % kinds.length], { power, angle, spread, colours });
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  // party poppers from both bottom corners, angled into the room
  function cannons(count = 60) {
    burst([0, H], { count, power: 1200, angle: -Math.PI / 3.2, spread: 0.35, kinds: ['strip', 'splat', 'strip', 'note', 'splat', 'disc'] });
    burst([W, H], { count, power: 1200, angle: -Math.PI + Math.PI / 3.2, spread: 0.35, kinds: ['strip', 'splat', 'strip', 'note', 'splat', 'disc'] });
  }

  function draw(p, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = p.colour;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === 'splat') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      for (const [bx, by, br] of p.blobs) { ctx.moveTo(bx * p.size * 1.6 + br * p.size, by * p.size * 1.6); ctx.arc(bx * p.size * 1.6, by * p.size * 1.6, br * p.size, 0, Math.PI * 2); }
      ctx.fill();
    } else if (p.kind === 'strip') {
      ctx.scale(1, Math.cos(p.wob + p.life * 9));
      ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
    } else if (p.kind === 'disc') {
      ctx.fillStyle = '#1d1a20';
      ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, p.size * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = p.colour;
      ctx.beginPath(); ctx.arc(0, 0, p.size * 0.36, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.rotate(-p.rot + Math.sin(p.wob + p.life * 4) * 0.35);
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(251,245,232,.8)'; ctx.shadowBlur = 4;
      ctx.fillText(p.ch, 0, 0);
    }
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const keep = [];
    for (const p of parts) {
      p.life += dt;
      if (p.life >= p.ttl || p.y > H + 60) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.g * dt;
      if (p.kind === 'note') p.vx += Math.sin(p.wob + p.life * 3) * 30 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const t = p.life / p.ttl;
      draw(p, t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      keep.push(p);
    }
    ctx.globalAlpha = 1;
    parts = keep;
    raf = parts.length ? requestAnimationFrame(frame) : 0;
    if (!raf) ctx.clearRect(0, 0, W, H);
  }

  return { burst, cannons, calm };
}
