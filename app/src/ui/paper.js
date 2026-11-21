// Hand-torn paper outlines for sheets, notes, banners and queue slips.
// Moved from settings-panel.js so every surface shares one tear generator.
import { rng } from '../rand.js';

// A hand-torn outline as numbers, for checks (scripts/tear-check.mjs) and torn().
// Each edge tears its own way: uneven spacing, a slow wander, calm stretches and rough ones,
// the odd bite, and a chipped corner or two. Nothing ever goes deeper than `cap` px into the paper,
// so keep `cap` below the card's smallest padding and the tear can never reach the text.
export function tornDepths(seed, amp = 5, cap = amp * 2) {
  const r = rng(seed);
  const edge = (n) => {
    // uneven spacing: steps between 40% and 160% of the even step, rescaled to end at exactly 1
    const steps = Array.from({ length: n }, () => 0.4 + r() * 1.2);
    const sum = steps.reduce((a, b) => a + b, 0);
    const f1 = 1 + r() * 1.5, f2 = 3 + r() * 4, p1 = r() * 6.3, p2 = r() * 6.3;
    const lean = r() * 0.5; // how far this edge sits in overall
    const pts = [];
    let t = 0;
    for (let i = 0; i <= n; i++) {
      // slow wander (0..1) and a roughness that also wanders, so some stretches are calm and some ragged
      const wander = 0.5 + 0.3 * Math.sin(t * f1 * 6.28 + p1) + 0.2 * Math.sin(t * f2 * 6.28 + p2);
      const rough = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * f2 * 3.1 + p1 * 1.7));
      let d = amp * (lean + 0.55 * wander) + (r() - 0.5) * amp * 1.3 * rough;
      if (r() < 0.1) d += amp * (0.7 + r() * 0.8); // a bite
      pts.push([t, Math.max(0, Math.min(cap, d))]);
      if (i < n) t += steps[i] / sum;
    }
    pts[n][0] = 1;
    return pts;
  };
  const count = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  // corner chips (px along each side from the corner); about half the corners get one
  const chips = [0, 1, 2, 3].map(() => (r() < 0.5 ? cap * (0.4 + r() * 0.6) : 0));
  return { top: edge(count(14, 22)), right: edge(count(5, 9)), bottom: edge(count(14, 22)), left: edge(count(5, 9)), chips, cap };
}

export function torn(seed, amp = 5, cap = amp * 2) {
  const { top, right, bottom, left, chips: [tl, tr, br, bl] } = tornDepths(seed, amp, cap);
  const f = (v) => v.toFixed(1);
  // a point t of the way along an edge of length 100%, moved in by `a` px from its start and `b` px from its end
  const along = (t, a, b) => `calc(${f(t * 100)}% + ${f(a * (1 - t) - b * t)}px)`;
  const pts = [];
  for (const [t, d] of top) pts.push(`${along(t, tl, tr)} ${f(d)}px`);
  for (const [t, d] of right) pts.push(`calc(100% - ${f(d)}px) ${along(t, tr, br)}`);
  for (const [t, d] of bottom) pts.push(`${along(1 - t, bl, br)} calc(100% - ${f(d)}px)`);
  for (const [t, d] of left) pts.push(`${f(d)}px ${along(1 - t, tl, bl)}`);
  return `polygon(${pts.join(',')})`;
}
