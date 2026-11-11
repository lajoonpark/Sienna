// Paper that tilts with the cursor: the tour's notes and the Settings card lean toward wherever the
// cursor is, like the side menu words. Its own easing loop, so the paper keeps turning even when the
// shop holds its camera still (a record up at a rack) or is not painting frames at all.
//
//   const off = onCursorTilt((x, y) => ...)   x, y: eased cursor position, -1..1 (left/top = -1)
//   tiltCSS(x, y, deg)                         'rotateY(..) rotateX(..)' for that much lean, in degrees
//
// The loop runs only while the paper is still catching up with the cursor, and only while someone listens.
const t = { x: 0, y: 0, tx: 0, ty: 0 };
const subs = new Set();
let raf = 0;
let last = 0;

function step(now) {
  raf = 0;
  const dt = Math.min(0.1, last ? (now - last) / 1000 : 1 / 60);
  last = now;
  const k = 1 - Math.exp(-dt * 6);
  t.x += (t.tx - t.x) * k;
  t.y += (t.ty - t.y) * k;
  const done = Math.abs(t.tx - t.x) < 1e-3 && Math.abs(t.ty - t.y) < 1e-3;
  if (done) { t.x = t.tx; t.y = t.ty; last = 0; }
  for (const fn of subs) fn(t.x, t.y);
  if (!done) raf = requestAnimationFrame(step);
}
const kick = () => { if (!raf && subs.size) raf = requestAnimationFrame(step); };

addEventListener('pointermove', (e) => {
  t.tx = Math.max(-1, Math.min(1, (e.clientX / innerWidth) * 2 - 1));
  t.ty = Math.max(-1, Math.min(1, (e.clientY / innerHeight) * 2 - 1));
  kick();
}, { passive: true });

export function onCursorTilt(fn) {
  subs.add(fn);
  fn(t.x, t.y);
  kick();
  return () => subs.delete(fn);
}

// same sense as the menu words: cursor right turns the paper's face to the right, cursor down tips it down
export const tiltCSS = (x, y, deg) => `rotateY(${(x * deg).toFixed(2)}deg) rotateX(${(-y * deg * 0.8).toFixed(2)}deg)`;

// the check scripts read the live values
export const cursorTilt = t;
