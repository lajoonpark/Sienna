// Small seeded random so the scene looks the same every run.
// next.state / next.state = v: where the sequence is, to pick it up again later (the stroke cache).
export function rng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Object.defineProperty(next, 'state', { get: () => s, set: (v) => { s = v >>> 0; } });
  return next;
}
