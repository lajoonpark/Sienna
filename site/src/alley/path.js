// The walk into the shop: the app's intro shot (app/src/nav.js), where the page's scroll stands in for
// the clock. Camera spots with their look-at points and lens, joined by one smooth curve; PACE is the
// relative speed over the shot, so the camera creeps behind the fruit stall, glides under the arch,
// slows to a beat under the sign while the doors open, and settles just inside. Pure maths (three's
// curves only), shared with the Node tests.
import { CatmullRomCurve3, Vector3 } from 'three';

export const T = { doorStart: 6.7, doorEnd: 8.4, enter: 10.0 };
export const HOME = { pos: [0, 1.75, -2.2], target: [0, 1.6, -12] };
const ARRIVE = 0.9; // share of the scroll that walks in; the rest lingers in the hall

const SHOT = [
  { pos: [-1.35, 0.55, 21.6], at: [0.6, 2.9, 4.0], fov: 38 },
  { pos: [-1.2, 0.65, 20.4], at: [0.5, 2.9, 4.0], fov: 38 },
  { pos: [-0.55, 1.45, 16.4], at: [0.2, 2.8, 2.0], fov: 41 },
  { pos: [0.35, 2.55, 12.2], at: [0.0, 3.0, 0.0], fov: 44 },
  { pos: [0.3, 2.15, 6.6], at: [0.0, 3.35, 0.0], fov: 47 },
  { pos: [0.1, 1.85, 4.5], at: [0.0, 3.55, -1.0], fov: 49 },
  { pos: [0.03, 1.8, 2.6], at: [0.0, 2.4, -6.0], fov: 51 },
  { pos: [0.0, 1.76, 0.5], at: [0.0, 1.8, -10.0], fov: 55 },
  { pos: HOME.pos, at: HOME.target, fov: 58 },
];
// [time s, relative speed] (the app's, starting a little above a standstill so scrolling always moves)
const PACE = [[0, 0.12], [1.2, 0.2], [2.8, 1], [4.4, 1.1], [5.7, 0.55], [6.6, 0.28], [7.7, 0.8], [8.8, 0.55], [T.enter, 0]];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function paceAt(t) {
  const n = PACE.length;
  if (t <= PACE[0][0]) return PACE[0][1];
  if (t >= PACE[n - 1][0]) return PACE[n - 1][1];
  let i = 0;
  while (t > PACE[i + 1][0]) i++;
  const slope = (k) => (k <= 0 || k >= n - 1 ? 0 : (PACE[k + 1][1] - PACE[k - 1][1]) / (PACE[k + 1][0] - PACE[k - 1][0]));
  const dt = PACE[i + 1][0] - PACE[i][0], u = (t - PACE[i][0]) / dt, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * PACE[i][1] + (u3 - 2 * u2 + u) * dt * slope(i) + (-2 * u3 + 3 * u2) * PACE[i + 1][1] + (u3 - u2) * dt * slope(i + 1);
}
const STEPS = 400;
const table = (() => {
  const a = new Float32Array(STEPS + 1);
  for (let i = 1; i <= STEPS; i++) {
    const t0 = ((i - 1) / STEPS) * T.enter, t1 = (i / STEPS) * T.enter;
    a[i] = a[i - 1] + ((paceAt(t0) + 4 * paceAt((t0 + t1) / 2) + paceAt(t1)) / 6) * (t1 - t0);
  }
  for (let i = 1; i <= STEPS; i++) a[i] /= a[STEPS];
  return a;
})();
function shareAt(t) {
  const x = clamp01(t / T.enter) * STEPS, i = Math.min(STEPS - 1, Math.floor(x));
  return lerp(table[i], table[i + 1], x - i);
}

const curvePos = new CatmullRomCurve3(SHOT.map((s) => new Vector3(...s.pos)), false, 'centripetal');
const curveAt = new CatmullRomCurve3(SHOT.map((s) => new Vector3(...s.at)), false, 'catmullrom', 0.5);
curvePos.arcLengthDivisions = 2000;

// The shot's clock for a scroll share p (0..1).
export const clockAt = (p) => clamp01(p / ARRIVE) * T.enter;

// How far open the doors are (0..1) at scroll share p.
export const DOOR_OPEN = (p) => smooth((clockAt(p) - T.doorStart) / (T.doorEnd - T.doorStart));

// The camera at scroll share p; `time` (s) only drives the small hand-held drift.
export function cameraAt(p, time = 0) {
  const t = clockAt(p);
  const u = curvePos.getUtoTmapping(shareAt(t));
  const pos = curvePos.getPoint(u);
  const target = curveAt.getPoint(u);
  const x = u * (SHOT.length - 1), i = Math.min(SHOT.length - 2, Math.floor(x));
  const fov = lerp(SHOT[i].fov, SHOT[i + 1].fov, smooth(x - i));
  const hand = 1 - smooth((t - 7.5) / 2.5);
  target.x += (Math.sin(time * 0.9) * 0.05 + Math.sin(time * 2.3 + 1) * 0.02) * hand;
  target.y += (Math.sin(time * 1.3 + 2) * 0.035 + Math.sin(time * 2.9) * 0.012) * hand;
  // past the doorway: a slow look up to the gallery and its geraniums
  const linger = smooth((p - ARRIVE) / (1 - ARRIVE));
  target.y += linger * 2.6;
  pos.z -= linger * 0.6;
  return { pos, target, fov };
}
