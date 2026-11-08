// The record handoff. When a record is picked, its vinyl leaves the sleeve, pops up, flies in a
// lively arc (spinning, with a little wobble) across the screen and drops onto the suitcase's
// platter; the record that was on the platter lifts off and flies away. Both fly in the overlay
// scene (camera space, drawn over the world with the depth cleared), so shop geometry never
// hides them. Positions are in camera space; the platter is found live, so the case may lean.
import * as THREE from 'three';
import { LAYOUT as L } from '../tonearm.js';

const SHOP_RADIUS = 0.145;                       // the vinyl in a rack sleeve (racks/common.js disc)
const UP = new THREE.Vector3(0, 1, 0);
const Q_FLAT_TO_DISC = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); // my record's axis is y, the rack disc's is z
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t) => clamp01(t) * clamp01(t);

const T_POP = 0.28, T_FLY = 0.95, T_DROP = 0.34;
const T_IN = T_POP + T_FLY + T_DROP;
const T_OUT = 0.9;

const _qw = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const _e = new THREE.Euler(), _m = new THREE.Matrix4();

function bezier2(out, p0, p1, p2, p3, t) {
  const u = 1 - t;
  out.x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
  out.y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
  return out;
}

// A pose from a world matrix, in camera space. `discAxis`: the matrix is a rack disc (axis z), so
// turn it into my record's frame (axis y).
function poseIn(camera, matrixWorld, discAxis, radius = SHOP_RADIUS) {
  camera.updateWorldMatrix(true, false);
  _m.copy(camera.matrixWorld).invert().multiply(matrixWorld);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
  _m.decompose(pos, quat, sc);
  if (discAxis) quat.multiply(Q_FLAT_TO_DISC);
  return { pos, quat, scale: (radius / L.recordRadius) * (sc.x || 1) };
}

// The record flies in SCREEN space: a path of (x, y) on the screen, a depth and an apparent size.
// The case sits far from the camera and the sleeve close to it, so a straight 3D arc between them
// would leave the picture; this way the record always crosses the view and grows smoothly.
// scene: where the flying records go, in camera space (the shop's overlay scene, or a group parented to
// the camera). worldCase: the suitcase lives in the world (the mini window), not in camera space, so
// its platter is brought into camera space first.
export function createFlights({ scene, suitcase, camera, view, worldCase = false }) {
  const _inv = new THREE.Matrix4();
  const toView = (m) => {
    if (!worldCase) return m;
    camera.updateWorldMatrix(true, false);
    return _inv.copy(camera.matrixWorld).invert().multiply(m);
  };
  const flights = [];
  let frozen = false;
  const th = () => Math.tan(THREE.MathUtils.degToRad(view.fov) / 2);
  const toScreen = (pos, scale) => {
    const d = -pos.z, t = th();
    return { x: pos.x / (d * t * view.aspect), y: pos.y / (d * t), d, ra: (L.recordRadius * scale) / (d * t) };
  };
  // where a screen-space state puts the group: position, and the scale that gives that apparent size
  const place = (g, st) => {
    const t = th();
    g.position.set(st.x * t * view.aspect * st.d, st.y * t * st.d, -st.d);
    g.scale.setScalar((st.ra * st.d * t) / L.recordRadius);
  };
  const mix = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), d: lerp(a.d, b.d, k), ra: lerp(a.ra, b.ra, k) });

  const seat = () => {
    const m = toView(suitcase.seatMatrix());     // camera space
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(pos, quat, sc);
    const seatS = toScreen(pos, sc.x);
    // the approach ends straight above the platter ON SCREEN (the case's own "up" tips towards the
    // camera, and perspective would slide the record sideways), then it drops
    const hover = { x: seatS.x, y: seatS.y + 0.2, d: seatS.d, ra: seatS.ra * 1.08 };
    return { quat, seat: seatS, hover };
  };

  function launch(kind, from, cover, extra = {}) {
    const { group, labelMat } = suitcase.recordKit.build(cover);
    scene.add(group);
    const f = { kind, t: 0, wall0: performance.now(), from, group, labelMat, cover, spin: extra.spin ?? 0, s0: toScreen(from.pos, from.scale), ...extra };
    flights.push(f);
    pose(f);
    return f;
  }

  // The disc: { matrixWorld (world pose of the vinyl leaving the sleeve), cover (THREE.Texture) }.
  function receive(disc) {
    for (const f of [...flights]) if (f.kind === 'in') land(f);      // a quicker pick: the last one lands now
    // whatever is on the platter lifts off and flies away
    const old = suitcase.liftRecord();
    if (old) {
      const sp = new THREE.Vector3(), sq = new THREE.Quaternion(), ss = new THREE.Vector3();
      toView(old.matrixWorld.clone()).decompose(sp, sq, ss);
      launch('out', { pos: sp, quat: sq, scale: ss.x }, old.cover, { spin: old.spin });
    }
    suitcase.held = true;
    return launch('in', poseIn(camera, disc.matrixWorld, true), disc.cover, { baseVideoId: suitcase.videoId });
  }

  function remove(f) {
    scene.remove(f.group);
    f.labelMat.dispose();                          // the vinyl's materials are shared; only the label is this record's own
    flights.splice(flights.indexOf(f), 1);
  }

  function land(f) {
    remove(f);
    suitcase.held = false;
    suitcase.placeRecord(f.cover, { claimFor: { baseVideoId: f.baseVideoId } });
    suitcase.thump(0.05);
  }

  // Where the incoming record is at time f.t: pop, fly, drop.
  function pose(f) {
    if (f.kind === 'out') return poseOut(f);
    const g = f.group, t = f.t;
    const S = seat();
    const a = f.s0;
    const popped = { x: a.x + 0.015, y: a.y + 0.09, d: Math.max(0.5, a.d - 0.6), ra: a.ra * 1.2 };
    const quat = new THREE.Quaternion();
    let rate;
    if (t < T_POP) {
      const u = easeOut(t / T_POP);
      place(g, mix(a, popped, u));
      quat.copy(f.from.quat);
      rate = lerp(5, 14, u);
    } else if (t < T_POP + T_FLY) {
      const u = (t - T_POP) / T_FLY;
      const e = smooth(u * 0.85 + 0.15 * u * u);
      const H = S.hover;
      // an arc that rises well above both ends (but stays on screen) and comes down onto the platter
      const top = Math.min(0.62, 0.95 - Math.max(popped.y, H.y));
      const c1 = { x: lerp(popped.x, H.x, 0.25), y: popped.y + top * 1.5 };
      const c2 = { x: lerp(popped.x, H.x, 0.85) + 0.05, y: H.y + top * 1.45 };
      const q = bezier2({}, popped, c1, c2, H, e);
      const sz = lerp(popped.ra, H.ra, e) * (1 + 0.5 * Math.sin(Math.PI * e));   // swells as it swoops over, then settles
      place(g, { x: q.x, y: q.y, d: lerp(popped.d, H.d, e), ra: sz });
      quat.copy(f.from.quat).slerp(S.quat, smooth((u - 0.1) / 0.8));   // from the sleeve's pose to lying flat
      rate = lerp(14, 4, e);
    } else {
      const u = (t - T_POP - T_FLY) / T_DROP;
      place(g, mix(S.hover, S.seat, easeIn(u)));
      quat.copy(S.quat);
      rate = 3.5;
    }
    const wob = 1 - clamp01((t - T_POP) / (T_FLY + T_DROP * 0.6));   // the wobble dies away before it lands
    _qw.setFromEuler(_e.set(0.38 * wob * Math.sin(t * 9.5), 0, 0.3 * wob * Math.cos(t * 7.3)));
    _qs.setFromAxisAngle(UP, -f.spin);
    g.quaternion.copy(quat).multiply(_qw).multiply(_qs);
    f.rate = rate;
  }

  // The old record: lifts, tumbles, and leaves over the top of the screen.
  function poseOut(f) {
    const g = f.group, t = f.t;
    const a = f.s0;
    const lift = easeOut(clamp01(t / 0.25));
    const away = easeIn((t - 0.15) / (T_OUT - 0.15));
    place(g, {
      x: a.x + 0.35 * away,
      y: a.y + 0.12 * lift + (1.4 - a.y) * away,
      d: a.d,
      ra: a.ra * (1 + 0.2 * lift) * lerp(1, 0.8, away),
    });
    _qw.setFromEuler(_e.set(0.5 * away + 0.1 * lift * Math.sin(t * 11), 0, 0.7 * away));
    _qs.setFromAxisAngle(UP, -f.spin);
    g.quaternion.copy(f.from.quat).multiply(_qw).multiply(_qs);
    f.rate = lerp(3.5, 14, easeOut(t / 0.5));
  }

  function update(dt) {
    if (frozen) { for (const f of flights) pose(f); return; }
    dt = Math.min(dt, 1);
    const now = performance.now();
    for (const f of [...flights]) {
      f.t += dt;
      // a flight that somehow outlasts its time by a lot (a stalled loop) lands now: a record never hangs
      if (now - f.wall0 > (T_IN + 4) * 1000) f.t = Math.max(f.t, T_IN);
      f.spin += (f.rate ?? 4) * dt;
      pose(f);
      if (f.kind === 'in' && f.t >= T_IN) land(f);
      else if (f.kind === 'out' && f.t >= T_OUT) remove(f);
    }
  }

  return {
    receive, update,
    // jump to the end: incoming records land now, outgoing ones are gone (the mini window closing mid-flight)
    finish() { for (const f of [...flights]) (f.kind === 'in' ? land(f) : remove(f)); frozen = false; },
    get active() { return flights.length > 0; },
    duration: T_IN,
    get list() { return flights; },
    // screenshots: freeze the latest handoff at progress p (0..1)
    freezeAt(p) {
      frozen = true;
      for (const f of flights) {
        f.t = (f.kind === 'in' ? T_IN : T_OUT) * Math.min(0.999, p);
        f.spin = f.t * 9;
        pose(f);
      }
    },
  };
}
