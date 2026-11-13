// Where the camera is and how it gets somewhere else: the intro (street, door, walk in), HOME just
// inside the shop, and one camera spot per station (stations.js). Flights between them follow
// waypoints along the shop's one winding aisle (down into the lounge, sideways through the stacks, up the
// glasshouse stair, out over the terrace and down into the garden) so the camera never goes through a wall
// or a piece of furniture; the gallery is reached over its railing.
//
// nav.js knows nothing about three.js scenes or the DOM: update(t, dt) returns { pos, target } and
// main.js points the camera rig at it.
import * as THREE from 'three';

export const AT_HOME = -1;
// intro timeline (seconds): a low crane up under the arch, across the piazza to a pause under the
// sign, the doors swing open, through them to HOME. enter = when the camera reaches HOME.
export const T = { doorStart: 6.7, doorEnd: 8.4, enter: 10.0 };
export const BASE_FOV = 58; // the camera's lens everywhere but the intro (main.js builds it with this)

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const TAU = Math.PI * 2;
const angleDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// look direction <-> yaw / pitch (yaw 0 looks down -z, positive yaw turns left; no roll ever)
const yawOf = (d) => Math.atan2(-d.x, -d.z);
const pitchOf = (d) => Math.asin(clamp(d.y / (d.length() || 1), -1, 1));
function aimOf(from, to) {
  const d = to.clone().sub(from);
  return { yaw: yawOf(d), pitch: pitchOf(d) };
}
function targetOf(pos, yaw, pitch, out, dist = 6) {
  const c = Math.cos(pitch);
  return out.set(pos.x - Math.sin(yaw) * c * dist, pos.y + Math.sin(pitch) * dist, pos.z - Math.cos(yaw) * c * dist);
}

// ---- the intro --------------------------------------------------------------------------------

// The shot, in two parts: WHERE the camera goes (SHOT: camera spots with their look-at point and
// vertical fov, joined by one smooth curve) and HOW FAST (PACE: relative speed over time, scaled so
// the whole path takes T.enter seconds). Starting and stopping are gentle because PACE starts and
// ends at 0 with a flat slope. Shot notes:
//   A-B  low (knee height) behind the fruit stall, long lens, looking up through the arch; barely moving
//   C-D  rises as it drifts right past the stall, under the arch lantern (y 4.1 there)
//   E-F  across the piazza, slowing to a beat under the sign while the doors open
//   G-I  through the doorway, the lens widening to BASE_FOV, settling at HOME
// Props it threads between: stall x -2.3 z 16.2, red scooter x 2.5 z 15.6, arch z 11..13.4,
// door leaves z ~ -0.3 (1 m wide, swing inwards). pos/at null = HOME's.
const SHOT = [
  { pos: [-1.35, 0.55, 21.6], at: [0.6, 2.9, 4.0], fov: 38 },   // A
  { pos: [-1.2, 0.65, 20.4], at: [0.5, 2.9, 4.0], fov: 38 },    // B
  { pos: [-0.55, 1.45, 16.4], at: [0.2, 2.8, 2.0], fov: 41 },   // C
  { pos: [0.35, 2.55, 12.2], at: [0.0, 3.0, 0.0], fov: 44 },    // D
  { pos: [0.3, 2.15, 6.6], at: [0.0, 3.35, 0.0], fov: 47 },     // E
  { pos: [0.1, 1.85, 4.5], at: [0.0, 3.55, -1.0], fov: 49 },    // F: the sign
  { pos: [0.03, 1.8, 2.6], at: [0.0, 2.4, -6.0], fov: 51 },     // G
  { pos: [0.0, 1.76, 0.5], at: [0.0, 1.8, -10.0], fov: 55 },    // H: the doorway
  { pos: null, at: null, fov: BASE_FOV },                       // I: HOME
];
// [time s, relative speed]: creep, glide under the arch, slow beat at the sign, through the door, settle
const PACE = [[0, 0], [1.2, 0.18], [2.8, 1], [4.4, 1.1], [5.7, 0.55], [6.6, 0.28], [7.7, 0.8], [8.8, 0.55], [T.enter, 0]];

// cubic Hermite through [time, value] keys, Catmull-Rom slopes, flat at both ends
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
// distance share covered by time t (0..1), from the integrated PACE
const PACE_STEPS = 400;
const paceTable = (() => {
  const a = new Float32Array(PACE_STEPS + 1);
  for (let i = 1; i <= PACE_STEPS; i++) {
    const t0 = ((i - 1) / PACE_STEPS) * T.enter, t1 = (i / PACE_STEPS) * T.enter;
    a[i] = a[i - 1] + (paceAt(t0) + 4 * paceAt((t0 + t1) / 2) + paceAt(t1)) / 6 * (t1 - t0);
  }
  for (let i = 1; i <= PACE_STEPS; i++) a[i] /= a[PACE_STEPS];
  return a;
})();
function shareAt(t) {
  const x = clamp01(t / T.enter) * PACE_STEPS, i = Math.min(PACE_STEPS - 1, Math.floor(x));
  return lerp(paceTable[i], paceTable[i + 1], x - i);
}

const shotCache = new WeakMap();
function shotCurves(home) {
  let c = shotCache.get(home);
  if (!c) {
    const P = (a, h) => (a ? V(...a) : h.clone());
    c = {
      pos: new THREE.CatmullRomCurve3(SHOT.map((s) => P(s.pos, home.pos)), false, 'centripetal'),
      at: new THREE.CatmullRomCurve3(SHOT.map((s) => P(s.at, home.target)), false, 'catmullrom', 0.5),
    };
    c.pos.arcLengthDivisions = 4000; // fine enough that speed has no steps at 120 fps
    shotCache.set(home, c);
  }
  return c;
}

function introPose(t, home, out) {
  const c = shotCurves(home);
  // even speed along the path (arc length), then the curve's own parameter for look-at and fov
  const u = c.pos.getUtoTmapping(shareAt(t));
  c.pos.getPoint(u, out.pos);
  c.at.getPoint(u, out.target);
  const x = u * (SHOT.length - 1), i = Math.min(SHOT.length - 2, Math.floor(x));
  out.fov = lerp(SHOT[i].fov, SHOT[i + 1].fov, smooth01(x - i));
  // a hand-held drift on the aim (a few cm at the look-at point), gone by the time we reach HOME
  const hand = 1 - smooth01((t - 7.5) / 2.5);
  out.target.x += (Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3 + 1) * 0.02) * hand;
  out.target.y += (Math.sin(t * 1.3 + 2) * 0.035 + Math.sin(t * 2.9) * 0.012) * hand;
  return out;
}

// 0..1: the cinema bars (painted letterbox) during the intro; they slide away as the camera arrives
export function introBars(t) { return 1 - smooth01((t - 8.4) / 1.6); }

// Where the camera will be: the spots brush strokes get placed from (brushstrokes.js).
export function paintViews(home, stations) {
  const views = [];
  const pose = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: BASE_FOV };
  // the intro: a spot about every second, each a little wider than the lens there (cursor tilt, drift)
  for (const t of [0, 1.5, 2.5, 3.3, 4.1, 4.9, 5.7, 6.5, 7.3, 8.1, 9]) {
    introPose(t, home, pose);
    views.push({ pos: pose.pos.clone(), target: pose.target.clone(), fov: pose.fov + 12 });
  }
  views.push({ pos: home.pos, target: home.target });
  // each station, and the way there and back: every waypoint of the route from home (the aisle winds through
  // walls, so a straight line between home and a station would stand inside them), looking ahead and back
  const { route } = createRouter(home, stations);
  const seen = new Set();
  stations.forEach((s, i) => {
    views.push({ pos: s.cam.pos, target: s.cam.target });
    const wps = route(AT_HOME, i);
    for (let k = 1; k < wps.length - 1; k++) {
      const key = wps[k].toArray().map((v) => v.toFixed(2)).join();
      if (seen.has(key)) continue;
      seen.add(key);
      views.push({ pos: wps[k], target: wps[k + 1] }, { pos: wps[k], target: wps[k - 1] });
    }
  });
  return views;
}

// ---- routes -----------------------------------------------------------------------------------
// The shop is one winding aisle with an arch or a doorway between each room and the next, so a route is:
// leave the station's camera spot, reach the aisle, ride the aisle to the other station's entry, step out
// to its camera spot. Points are written in world coordinates (see shop.js for the rooms and levels).
//
// The aisle ("spine") from the street inwards, at eye height over each floor (hall 0, lounge and stacks
// -0.6, glasshouse and terrace +1.2, garden 0). Over the crate table the camera climbs (hump) so it passes
// well above the sleeves; down the lounge steps, up the glasshouse stair and down the terrace steps it
// follows the treads.
const SPINE_ORDER = ['home', 'core', 'hump', 'hallEnd', 'arch', 'steps', 'lounge', 'stacksIn', 'stacks', 'stacksEnd',
  'stairFoot', 'stairMid', 'plants', 'plantsA', 'plantsB', 'door', 'terrace', 'stepsDown', 'court'];
const SPINE_FIXED = {
  hump: [0, 2.8, -5.7],
  hallEnd: [0, 1.75, -8.4],        // past the table and the bin tables; the lounge arch (z -10.5 .. -11) is next
  arch: [0, 1.72, -10.75],
  steps: [0.1, 1.35, -11.5],       // down the three steps
  stacksIn: [3.55, 1.05, -13.2],   // through the arch in the lounge's right wall
  stacksEnd: [9.5, 1.05, -13.5],
  stairFoot: [9.5, 1.15, -15.1],   // the stair's arch in the stacks' back wall
  stairMid: [9.5, 2.05, -16.6],
  plantsA: [10.8, 3.3, -20.0],     // the spinner stands in the middle: pass it on the right, above the bench plants
  plantsB: [10.8, 3.3, -22.0],
  door: [9.5, 2.95, -23.9],        // out through the glasshouse door
  terrace: [9.5, 2.95, -25.4],
  stepsDown: [9.5, 2.25, -26.9],
  court: [8.8, 1.7, -28.3],        // at the foot of the terrace steps; the stall's camera spot is west of here
};

// How each station reaches the aisle. `near`: for trips inside the hall; `far`: for trips deeper in.
// pts lead from the camera spot outwards to the aisle point named by join.
const P = (...p) => p;
const ATTACH = {
  table:     { near: { join: 'core', pts: [] }, far: { join: 'core', pts: [] } },
  cubby:     { near: { join: 'core', pts: [P(2.7, 1.75, -5.6), P(1.9, 1.85, -4.7)] },
               far:  { join: 'hump', pts: [P(2.6, 2.2, -6.0), P(1.0, 2.8, -4.9)] } },
  // first straight out from the counter, clear of the gallery post beside its camera spot (x 3.7, z -7.2)
  counter:   { near: { join: 'core', pts: [P(3.95, 1.8, -6.7), P(3.1, 1.8, -6.2), P(1.9, 1.85, -4.7)] },
               far:  { join: 'hump', pts: [P(3.95, 2.0, -6.7), P(2.9, 2.2, -6.6), P(1.1, 2.8, -5.0)] } },
  // up and over the railing (top rail y 3.95), then down toward the aisle
  gallery:   { near: { join: 'core', pts: [P(-3.0, 4.55, -5.4), P(-1.6, 3.1, -4.9)] },
               far:  { join: 'hump', pts: [P(-3.0, 4.55, -5.4), P(-1.2, 3.4, -4.6)] } },
  lounge:    { near: { join: 'lounge', pts: [] }, far: { join: 'lounge', pts: [] } },
  stacks:    { near: { join: 'stacks', pts: [] }, far: { join: 'stacks', pts: [] } },
  plants:    { near: { join: 'plants', pts: [] }, far: { join: 'plants', pts: [] } },
  courtyard: { near: { join: 'court', pts: [] }, far: { join: 'court', pts: [] } },
};
const HALL = new Set(['home', 'table', 'cubby', 'counter', 'gallery']);
// Straight-ish trips inside the hall that need no detour through the aisle (listed one way, used both ways).
const SHORT = {
  'home|table': [],
  'home|cubby': [P(2.2, 1.75, -2.9), P(3.0, 1.7, -4.5)],               // down the free strip between bin table and armchair
  'home|counter': [P(2.2, 1.75, -2.9), P(3.0, 1.75, -4.6), P(3.2, 1.75, -6.0), P(3.95, 1.75, -6.7)],
  'home|gallery': [P(-1.4, 2.9, -4.1), P(-3.0, 4.55, -5.5)],           // rises past the stair side, over the rail
  'cubby|counter': [],
};

const FLIGHT_TAU = 0.22;   // how long a flight that is interrupted keeps its momentum (s)
const LOOK_AHEAD = 2.4;
// A trip longer than JUMP_TRIP metres (home to the glasshouse or the garden: 27-43 m) is not flown all the way
// (Lajoon, 2026-11-13: 43 m in 4.4 s felt far too fast, and a slower or shorter way round was not wanted): the
// camera walks the first walkIn metres, broad oil strokes are pulled across the picture (oilpaint.js
// paintWipe), the camera cuts while they cover it, and they are dragged off the right-hand edge as it walks
// the last walkOut metres into the new section. t1 + t2 seconds in all.
const JUMP_TRIP = 20;
const JUMP = { walkIn: 3.5, walkOut: 4.5, t1: 1.15, t2: 1.4, cover: 0.42, hold: 0.08, uncover: 0.5 };
const FAR_TRIP = 11;       // metres: a flight this long goes through other rooms, and looks where it is going
const PACE_MAX = 12;       // m/s: cruising pace along a straight path
const PACE_LATERAL = 25;   // m/s2 of sideways acceleration a bend may ask for
const PACE_ACCEL = 20;     // m/s2: how fast the pace may build up or drop along the path    // metres of path either side used to read the direction of travel

// ---- the controller ---------------------------------------------------------------------------

// nav = createNav({ home, stations, startAt }): startAt = null plays the intro; a station index or
// AT_HOME starts settled there (no intro, doors open).
// Routing between camera spots (used by the controller below and by paintViews): route(a, b) -> waypoints
// from spot a to spot b (station indices, or AT_HOME); spine() -> the aisle's points in order.
function createRouter(home, stations) {
  const idOf = (i) => (i === AT_HOME ? 'home' : stations[i].id);
  const camOf = (i) => (i === AT_HOME ? home : stations[i].cam);
  const stationIndex = (id) => stations.findIndex((s) => s.id === id);

  // ---- routing ----
  function spinePoint(key) {
    const cam = (id) => stations[stationIndex(id)]?.cam.pos;
    switch (key) {
      case 'home': return home.pos.clone();
      case 'core': return (cam('table') ?? V(0, 1.82, -4.48)).clone();
      case 'lounge': return V(0.3, 1.05, -13.2);
      case 'stacks': { const c = cam('stacks'); return V(c?.x ?? 6.1, c?.y ?? 1.05, -13.5); }
      case 'plants': return (cam('plants') ?? V(9.5, 2.95, -18.45)).clone();
      default: return V(...SPINE_FIXED[key]);
    }
  }
  function spineSlice(j1, j2) {
    const a = SPINE_ORDER.indexOf(j1), b = SPINE_ORDER.indexOf(j2);
    const keys = a <= b ? SPINE_ORDER.slice(a, b + 1) : SPINE_ORDER.slice(b, a + 1).reverse();
    return keys.map(spinePoint);
  }
  const toV = (p) => V(...p);
  function dedupe(pts, eps = 0.1) {
    const out = [];
    for (const p of pts) {
      if (out.length && out[out.length - 1].distanceTo(p) < eps) { if (p === pts[pts.length - 1]) out[out.length - 1] = p; continue; }
      out.push(p);
    }
    return out;
  }
  // waypoints from station a's camera spot to station b's (indices, or AT_HOME)
  function route(a, b) {
    const A = camOf(a).pos, B = camOf(b).pos;
    if (a === b) return [A.clone()];
    const ia = idOf(a), ib = idOf(b);
    let mid;
    if (SHORT[`${ia}|${ib}`]) mid = SHORT[`${ia}|${ib}`].map(toV);
    else if (SHORT[`${ib}|${ia}`]) mid = SHORT[`${ib}|${ia}`].map(toV).reverse();
    else if ((ia !== 'home' && !ATTACH[ia]) || (ib !== 'home' && !ATTACH[ib])) mid = []; // unknown station: a straight line
    else {
      const far = !(HALL.has(ia) && HALL.has(ib));
      const at = (id) => (id === 'home' ? { join: 'home', pts: [] } : ATTACH[id][far ? 'far' : 'near']);
      const pa = at(ia), pb = at(ib);
      mid = [...pa.pts.map(toV), ...spineSlice(pa.join, pb.join), ...pb.pts.map(toV).reverse()];
    }
    return dedupe([A.clone(), ...mid, B.clone()]);
  }

  const spine = () => SPINE_ORDER.map(spinePoint);
  return { idOf, camOf, stationIndex, route, spine, dedupe };
}

export function createNav({ home, stations, startAt = null }) {
  const { idOf, camOf, stationIndex, route, dedupe } = createRouter(home, stations);

  // ---- a planned flight: a smooth curve through waypoints, and where the camera looks on the way ----
  function makePlan(wps, aimFrom, aimTo, durOverride) {
    const curve = new THREE.CatmullRomCurve3(wps, false, 'centripetal');
    const len = curve.getLength();
    // a long pan (turning round to face the new rack) takes time too
    const pan = Math.abs(angleDiff(aimFrom.yaw, aimTo.yaw));
    // the longest trips (end to end of the winding shop, 40-odd metres) get up to 4.4 s instead of 3
    const maxDur = 3.0 + clamp((len - 20) / 16, 0, 1.4);
    let dur = durOverride ?? clamp(Math.max(0.9 + 0.075 * len, 0.7 + pan / 1.6), 1.2, maxDur);
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), dir = new THREE.Vector3();
    const reach = LOOK_AHEAD / Math.max(len, 0.01);
    const far = len > FAR_TRIP;
    const yawEnd = aimFrom.yaw + angleDiff(aimFrom.yaw, aimTo.yaw); // pan the short way round, once

    // Slow into tight bends: the camera's pace along the path drops where the path curves sharply
    // (a hairpin from a re-route, a corner at an arch) and builds up again gently, so it never whips
    // round at full speed. pace[i] = metres/second the path allows at sample i; U[i] = share of the
    // flight's time spent before sample i.
    const N = 160;
    const pts = Array.from({ length: N + 1 }, (_, i) => curve.getPointAt(i / N));
    const ds = len / N;
    const pace = new Array(N + 1).fill(PACE_MAX);
    for (let i = 1; i < N; i++) {
      const a = pts[i].clone().sub(pts[i - 1]), b = pts[i + 1].clone().sub(pts[i]);
      const kappa = a.angleTo(b) / Math.max(0.02, (a.length() + b.length()) / 2);
      pace[i] = clamp(Math.sqrt(PACE_LATERAL / Math.max(kappa, 1e-3)), 1.5, PACE_MAX);
    }
    for (let i = 1; i <= N; i++) pace[i] = Math.min(pace[i], Math.sqrt(pace[i - 1] ** 2 + 2 * PACE_ACCEL * ds));
    for (let i = N - 1; i >= 0; i--) pace[i] = Math.min(pace[i], Math.sqrt(pace[i + 1] ** 2 + 2 * PACE_ACCEL * ds));
    const slow = pace.map((v) => PACE_MAX / v);
    const U = [0];
    for (let i = 1; i <= N; i++) U.push(U[i - 1] + (slow[i - 1] + slow[i]) / 2);
    const total = U[N];
    if (durOverride == null) dur = clamp(dur * Math.pow(total / N, 0.6), 1.2, maxDur);
    // a long trip: walk in, cut under the paint, walk out (JUMP)
    let jump = null;
    if (durOverride == null && len > JUMP_TRIP) {
      const s1 = JUMP.walkIn / len, s2 = 1 - JUMP.walkOut / len;
      dur = JUMP.t1 + JUMP.t2;
      jump = {
        s1, s2,
        // path fraction e seconds in: speeding up to the cut, slowing down after it
        sAt(e) {
          if (e < JUMP.t1) { const x = e / JUMP.t1; return s1 * x * x; }
          const x = clamp01((e - JUMP.t1) / JUMP.t2);
          return s2 + (1 - s2) * (1 - (1 - x) ** 2);
        },
        // 0..1 the paint goes on (the brush lands fast and slows), 1..2 it is dragged off, faster and faster
        wipe(e) {
          const a = e - (JUMP.t1 - JUMP.cover);
          if (a <= 0) return 0;
          if (a < JUMP.cover) return 1 - (1 - a / JUMP.cover) ** 2;
          const b = e - JUMP.t1 - JUMP.hold;
          if (b <= 0) return 1;
          return Math.min(2, 1 + (b / JUMP.uncover) ** 2);
        },
      };
    }
    // eased progress p (0..1 of the flight's time) -> fraction s of the path
    const sOf = (p) => {
      const target = clamp01(p) * total;
      let lo = 0, hi = N;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (U[mid] <= target) lo = mid; else hi = mid; }
      const span = U[hi] - U[lo] || 1;
      return (lo + (target - U[lo]) / span) / N;
    };
    return {
      wps, curve, len, dur, aimFrom, aimTo, sOf, jump,
      // Camera at path fraction s. The view pans smoothly from the old station's view to the new one;
      // in the middle of the trip it also turns toward the direction of travel (so it looks down the
      // aisle and through the arches), but only when that is a sensible turn: backing away from a rack
      // keeps looking at it instead of spinning round and back.
      at(s, out) {
        s = clamp01(s);
        curve.getPointAt(s, out.pos);
        const mix = smooth01(s);
        const baseYaw = lerp(aimFrom.yaw, yawEnd, mix), basePitch = lerp(aimFrom.pitch, aimTo.pitch, mix);
        curve.getPointAt(Math.min(1, s + reach), pa);
        curve.getPointAt(Math.max(0, s - reach), pb);
        dir.subVectors(pa, pb);
        const horiz = Math.hypot(dir.x, dir.z);
        const dy = horiz > 1e-4 ? angleDiff(baseYaw, yawOf(dir)) : 0;
        const compat = 1 - smooth01((Math.abs(dy) - 0.9) / 1.4);            // full up to ~50 deg off, none past ~130 deg
        const hz = smooth01((horiz - 0.2) / 0.6);
        if (far) {
          // a trip through other rooms (the shop winds: down into the lounge, sideways through the stacks, up the
          // glasshouse stair): in the middle of it the camera looks where it is going, whatever the two
          // stations face, and turns to the new station's view over the last fifth
          const w = smooth01(s / 0.15) * (1 - smooth01((s - 0.8) / 0.2)) * hz;
          out.yaw = baseYaw + dy * w;
          out.pitch = lerp(basePitch, clamp(Math.atan2(dir.y, horiz) * 0.5, -0.3, 0.3), 0.8 * w);
          return out;
        }
        const wYaw = smooth01(s / 0.25) * (1 - smooth01((s - 0.72) / 0.28)) * compat * hz;
        const wPitch = smooth01(s / 0.25) * (1 - smooth01((s - 0.4) / 0.6)) * compat * hz;
        // lean toward the direction of travel by at most ~35 degrees, never a snap
        out.yaw = baseYaw + 0.6 * Math.tanh(dy / 0.6) * wYaw;
        // a climb or drop does not point the camera at the ceiling: only a fraction of the slope
        out.pitch = lerp(basePitch, clamp(Math.atan2(dir.y, horiz) * 0.5, -0.3, 0.3), 0.7 * wPitch);
        return out;
      },
    };
  }

  // ---- state ----
  let phase = startAt === null ? 'intro' : 'rest'; // 'intro' | 'rest' | 'fly' | 'frozen'
  let at = startAt ?? AT_HOME;                     // where we are, or where the flight is heading
  let introDone = startAt !== null;
  let skipT = startAt === null ? null : -100;      // time the intro was skipped (door keeps opening); -100 = doors already open
  let skipFlight = false;
  let flight = null;                               // { plan, e, toId, backId, backPts, mom }
  let curT = 0;
  let tiltK = startAt === null ? 0.25 : (startAt === AT_HOME ? 1 : 0.35);
  const listeners = [];
  const pose = { pos: V(0, 1.7, 0), target: V(0, 1.7, -1), yaw: 0, pitch: 0, fov: BASE_FOV };
  const tmp = { pos: V(0, 0, 0), target: V(0, 0, 0), yaw: 0, pitch: 0, fov: BASE_FOV };
  const last = { pos: V(0, 0, 0), yaw: 0, pitch: 0, ok: false };
  const vel = V(0, 0, 0), scratch = V(0, 0, 0);
  let wYaw = 0, wPitch = 0;
  // the paint wipe (0..2, see JUMP) and the seed that varies its strokes from trip to trip; a wipe cut short by a
  // new flight runs on by itself (wipeCarry): back off the way it came if it had not covered yet, else off the edge
  let wipeNow = 0, wipeCarry = 0, wipeSeed = 0;
  let sections = [];

  const setAim = (pos, yaw, pitch) => {
    pose.pos.copy(pos); pose.yaw = yaw; pose.pitch = pitch;
    targetOf(pos, yaw, pitch, pose.target);
  };
  const setLook = (pos, target) => {
    pose.pos.copy(pos); pose.target.copy(target);
    const a = aimOf(pos, target); pose.yaw = a.yaw; pose.pitch = a.pitch;
  };
  const setRest = (i) => setLook(camOf(i).pos, camOf(i).target);
  const aimAt = (i) => aimOf(camOf(i).pos, camOf(i).target);
  const fire = (prev) => listeners.forEach((cb) => cb(at, prev));
  const tiltFor = () => (phase === 'fly' || phase === 'frozen' ? 0.6 : at === AT_HOME ? 1 : 0.35);

  if (startAt !== null) setRest(startAt);
  else introPose(0, home, tmp), setLook(tmp.pos, tmp.target), pose.fov = tmp.fov;

  // the camera's own velocity, so a flight that is interrupted can carry on a moment before turning
  function track(dt) {
    if (dt > 0 && dt < 0.2 && last.ok) {
      vel.lerp(scratch.copy(pose.pos).sub(last.pos).divideScalar(dt), 0.6);
      wYaw = lerp(wYaw, angleDiff(last.yaw, pose.yaw) / dt, 0.6);
      wPitch = lerp(wPitch, (pose.pitch - last.pitch) / dt, 0.6);
    } else { vel.set(0, 0, 0); wYaw = wPitch = 0; }
    last.pos.copy(pose.pos); last.yaw = pose.yaw; last.pitch = pose.pitch; last.ok = true;
  }

  function begin(plan, extra) {
    const mom = phase === 'rest' ? null : { v: vel.clone(), yaw: wYaw, pitch: wPitch };
    wipeCarry = wipeNow;
    if (plan.jump) wipeSeed = (wipeSeed + 1.618) % 50;
    flight = { plan, e: 0, mom, ...extra };
    phase = 'fly';
  }

  // closest point on the polyline to p -> index k of the segment [wps[k], wps[k+1]]
  function segmentOf(wps, p) {
    let best = 0, bd = Infinity;
    const line = new THREE.Line3(), q = new THREE.Vector3();
    for (let k = 0; k < wps.length - 1; k++) {
      line.set(wps[k], wps[k + 1]).closestPointToPoint(p, true, q);
      const d = q.distanceTo(p);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  const pathLen = (pts) => pts.reduce((s, p, i) => s + (i ? p.distanceTo(pts[i - 1]) : 0), 0);
  // A path that doubles back on itself (out to a station and back to the aisle, or back along the
  // way it came) would turn round at full speed. Cut such loops: when a later point lies on an
  // earlier stretch of the path, jump straight there.
  function eraseLoops(pts) {
    const out = pts.slice();
    const line = new THREE.Line3(), q = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let j = 2; j < out.length; j++) {
      for (let i = 0; i < j - 1; i++) {
        line.set(out[i], out[i + 1]).closestPointToPoint(out[j], true, q);
        // on the earlier stretch, or close to it and heading back the way it came (a hairpin)
        const d = q.distanceTo(out[j]);
        a.subVectors(out[i + 1], out[i]);
        b.subVectors(out[j], out[j - 1]);
        if (d < 0.5 || (d < 1.1 && a.dot(b) < 0)) {
          const joint = q.distanceTo(out[i]) < 0.15 ? [] : q.distanceTo(out[i + 1]) < 0.15 ? [out[i + 1]] : [q.clone()];
          if (joint.length >= j - i - 1) continue; // nothing to cut
          out.splice(i + 1, j - i - 1, ...joint);
          j = i; // start over from the joint
          break;
        }
      }
    }
    return out;
  }

  function startFlight(dest) {
    const prev = at;
    const aimTo = aimAt(dest);
    const aimFrom = { yaw: pose.yaw, pitch: pose.pitch };
    if (phase === 'rest') {
      const wps = route(at, dest);
      if (wps.length < 2) return;
      at = dest;
      begin(makePlan(wps, aimFrom, aimTo), { toId: dest, backId: prev, backPts: [] });
    } else {
      // interrupted: carry on to the old destination and from there to the new one, or turn back the
      // way we came and go from there, whichever is shorter
      const here = pose.pos.clone();
      const old = flight;
      const k = segmentOf(old.plan.wps, here);
      const ahead = old.plan.wps.slice(k + 1);
      const behind = old.plan.wps.slice(0, k + 1).reverse();
      const fwd = [here, ...ahead, ...route(old.toId, dest).slice(1)];
      const back = [here, ...behind, ...old.backPts, ...route(old.backId, dest).slice(1)];
      const useFwd = pathLen(fwd) <= pathLen(back) + 0.5;
      const wps = dedupe(eraseLoops(dedupe(useFwd ? fwd : back)));
      at = dest;
      if (wps.length < 2) { flight = null; phase = 'rest'; setRest(dest); return; }
      begin(makePlan(wps, aimFrom, aimTo), { toId: dest, backId: old.backId, backPts: [...behind, ...old.backPts] });
    }
    if (at !== prev) fire(prev);
  }

  function arrive() {
    phase = 'rest';
    setRest(at);
    flight = null;
    if (skipFlight) { skipFlight = false; introDone = true; }
  }

  // ---- public ----
  function skipIntro(t = curT) {
    if (phase !== 'intro') return;
    skipT = t;
    // a quick ease from the last frame's pose, carrying the walk's own momentum for a moment
    const plan = makePlan([pose.pos.clone(), home.pos.clone()], { yaw: pose.yaw, pitch: pose.pitch }, aimOf(home.pos, home.target));
    plan.dur = clamp(0.8 + 0.04 * plan.len, 0.9, 1.6);
    flight = { plan, e: 0, mom: { v: vel.clone(), yaw: wYaw, pitch: wPitch }, toId: AT_HOME, backId: AT_HOME, backPts: [], fov0: pose.fov };
    phase = 'fly';
    skipFlight = true;
    at = AT_HOME;
  }

  function go(dest) {
    if (dest === undefined || dest === null) return;
    if (phase === 'intro') { skipIntro(); return; }
    if (phase === 'frozen') return;
    if (dest === at) return;
    if (dest !== AT_HOME && (dest < 0 || dest >= stations.length)) return;
    startFlight(dest);
  }

  // next / previous section (Tab / Shift+Tab); from HOME, next goes to the first, previous to the last
  function step(dir) {
    if (!sections.length) return;
    if (phase === 'intro') { skipIntro(); return; }
    const i = sections.indexOf(at);
    let next;
    if (i < 0) next = dir > 0 ? sections[0] : sections[sections.length - 1];
    else next = sections[(i + dir + sections.length) % sections.length];
    go(next);
  }

  function jump(dest) {
    const prev = at;
    phase = 'rest'; flight = null; at = dest; introDone = true;
    if (skipT === null) skipT = -100; // doors open
    setRest(dest);
    tiltK = dest === AT_HOME ? 1 : 0.35;
    if (prev !== at) fire(prev);
  }

  // Hold a flight at path fraction p (for screenshots of mid-flight frames).
  function freeze(from, to, p) {
    const wps = route(from, to);
    const plan = makePlan(wps, aimAt(from), aimAt(to));
    phase = 'frozen'; introDone = true; at = to; skipT = skipT ?? -100;
    flight = { plan, p: clamp01(p), toId: to, backId: from, backPts: [] };
    plan.at(flight.p, tmp);
    setAim(tmp.pos, tmp.yaw, tmp.pitch);
    tiltK = 0.6;
  }

  function update(t, dt) {
    curT = t;
    if (phase === 'intro') {
      introPose(t, home, tmp);
      setLook(tmp.pos, tmp.target);
      pose.fov = tmp.fov;
      tiltK = 0.25 + 0.75 * clamp01((t - 8) / (T.enter - 8));
      if (t >= T.enter - 0.3) introDone = true;
      if (t >= T.enter) { phase = 'rest'; at = AT_HOME; setRest(AT_HOME); pose.fov = BASE_FOV; tiltK = 1; }
    } else if (phase === 'fly') {
      const e0 = flight.e;
      flight.e += dt;
      const tau = clamp01(flight.e / flight.plan.dur);
      const jmp = flight.plan.jump;
      flight.plan.at(jmp ? jmp.sAt(flight.e) : flight.plan.sOf(smooth01(tau)), tmp);
      if (flight.mom) {
        // keep a little of the old motion so the turn-around is not a sudden stop; gone after ~0.8 s
        const e = flight.e;
        const m = e * Math.exp(-e / FLIGHT_TAU) * (1 - smooth01((e - 0.5) / 0.3));
        tmp.pos.addScaledVector(flight.mom.v, m);
        tmp.yaw += flight.mom.yaw * m;
        tmp.pitch += flight.mom.pitch * m;
      }
      setAim(tmp.pos, tmp.yaw, tmp.pitch);
      // the cut: no speed is read from the jump (an interruption just after it carries no momentum)
      if (jmp && e0 < JUMP.t1 && flight.e >= JUMP.t1) last.ok = false;
      // a skipped intro eases its lens back to the normal one on the way home
      pose.fov = flight.fov0 == null ? BASE_FOV : lerp(flight.fov0, BASE_FOV, smooth01(tau));
      if (skipFlight && tau > 0.6) introDone = true;
      if (tau >= 1) arrive();
      tiltK += (tiltFor() - tiltK) * (1 - Math.exp(-3 * Math.min(dt, 0.2)));
    } else if (phase === 'rest') {
      tiltK += (tiltFor() - tiltK) * (1 - Math.exp(-3 * Math.min(dt, 0.2)));
    }
    if (phase === 'rest' || phase === 'frozen') pose.fov = BASE_FOV;
    // the wipe: this flight's own, else whatever an interrupted one left, running on
    if (wipeCarry > 0 && wipeCarry < 2) wipeCarry = wipeCarry < 1 ? Math.max(0, wipeCarry - dt / 0.25) : Math.min(2, wipeCarry + dt / JUMP.uncover);
    const own = phase === 'fly' && flight?.plan.jump ? flight.plan.jump.wipe(flight.e) : 0;
    wipeNow = own > 0 && own < 2 ? own : wipeCarry > 0 && wipeCarry < 2 ? wipeCarry : 0;
    track(dt);
    return pose;
  }

  // 0..1: how far the shop door is open. It keeps opening if the intro is skipped.
  function doorOpen(t) {
    if (skipT !== null && skipT < 0) return 1;
    const base = (x) => easeInOut(clamp01((x - T.doorStart) / (T.doorEnd - T.doorStart)));
    if (skipT === null) return base(t);
    return lerp(base(skipT), 1, easeInOut(clamp01((t - skipT) / 0.6)));
  }

  return {
    update, go, step, jump, freeze, skipIntro, doorOpen,
    setSections(list) { sections = list.slice(); },
    onChange(cb) { listeners.push(cb); },
    get pose() { return pose; },
    get phase() { return phase; },
    get at() { return at; },
    get introDone() { return introDone; },
    get intro() { return phase === 'intro'; },
    get flying() { return phase === 'fly' || phase === 'frozen'; },
    get settled() { return phase === 'rest'; },        // hover is allowed only when this is true
    get tilt() { return tiltK; },                        // 0..1 strength of the cursor tilt
    get progress() { return flight ? (flight.p ?? clamp01(flight.e / flight.plan.dur)) : 1; },
    get sections() { return sections.slice(); },
    get waypoints() { return flight ? flight.plan.wps : null; },
    get wipe() { return wipeNow; },          // 0..2: the paint wipe of a long trip (JUMP), for the painter
    get wipeSeed() { return wipeSeed; },
    // for the route check and the debug console
    route, plan: (a, b) => { const w = route(a, b); return makePlan(w, aimAt(a), aimAt(b)); },
  };
}
