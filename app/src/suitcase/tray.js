// The full-bottom record drawer. The entire lower half of the suitcase (model.js `parts.drawer`)
// slides forward out from underneath the turntable deck:
//   - On a search/list pick (`tray.run(cover)`): the drawer slides out with the record lying inside
//     the lined bed, the record lifts up, tips towards you and flies onto the platter (flight.js),
//     and the drawer slides home again.
//   - On opening the Up Next Queue (`tray.openHold(covers)` / `tray.closeHold()`): the entire bottom
//     drawer slides out and stays open while a stack of vinyls all launch out of the drawer, sweep
//     across the screen behind the Queue menu, and exit cleanly through the right side of the screen;
//     closing the Queue slides the drawer shut.
//
// Used by both the shop's case (suitcase/player.js) and the mini window (mini.js).
import * as THREE from 'three';
import { LAYOUT as L } from '../tonearm.js';

const setLabelMap = (material, map) => { material.map = map; material.emissiveMap = map; };

const SHOP_RADIUS = 0.145;   // the size flight.js assumes for a disc handed over (a rack's vinyl)
const UP = new THREE.Vector3(0, 1, 0);
const Q_DISC_TO_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// Full-bottom drawer travel & record pose in case units (case 4.6 x 3.2, drawer height 0.44).
const OUT = 2.68;                         // how far the entire bottom slides out along +z
const REST_Y = 0.125;                     // the record lying on the lined drawer floor
const LIFT_Y = 1.25;                      // how high it rises before it flies to the platter
const TIP = 0.72;                         // and how far it tips its face towards you

// the beats, in seconds
const T_OPEN = 0.38, T_RISE = 0.36, T_HOLD = 0.15, T_SHUT = 0.36;
const T_HAND = T_OPEN + T_RISE;           // the record leaves here
const T_END = T_HAND + T_HOLD + T_SHUT;

// Queue vinyl wave: vinyls rise out of the open drawer, sweep across behind the menu, and exit right.
const STACK_COUNT = 5;
const LAUNCH_AT = T_OPEN * 0.60;
const FLY_STAGGER = 0.085;
const FLY_DUR = 1.15;
const FLY_EXIT_X = 1.48;                  // NDC x well past the right edge (+1.0) so discs never vanish on screen
const FLY_LANES = [0.65, -0.25, 0.20, -0.70, 0.90];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutBack = (t) => { const c = 1.35; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

function bezier2(out, p0, p1, p2, p3, t) {
  const u = 1 - t;
  out.x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
  out.y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
  return out;
}

// Compute a queue vinyl's screen-space NDC position, depth and apparent radius along its sweep
// from inside the open drawer (`s0`) up, across the screen, and cleanly off the right edge.
export function queueVinylPose(s0, u, lane = 0) {
  u = clamp01(u);
  const e = 0.72 * u + 0.28 * (1 - Math.pow(1 - u, 3));
  const p1 = { x: s0.x + 0.06, y: Math.min(0.75, s0.y + 0.68 + lane * 0.14) };
  const p2 = { x: 0.28 + lane * 0.10, y: 0.16 + lane * 0.26 };
  const p3 = { x: FLY_EXIT_X, y: 0.04 + lane * 0.34 };
  const q = bezier2({}, s0, p1, p2, p3, e);
  const arc = Math.sin(Math.PI * u);
  return {
    x: q.x,
    y: q.y,
    d: Math.max(0.4, s0.d * (1 - 0.12 * arc)),
    ra: s0.ra * (1 + 0.26 * arc),
  };
}

export function createRecordTray({ suitcase, kit, onDisc, camera = null, overlayScene = null, view = null }) {
  const { drawer } = suitcase.parts;
  drawer.position.z = 0;

  // mode: 'idle' | 'dispense' | 'hold-open' | 'hold-close'
  let mode = 'idle';
  let t = 0, handed = false, frozen = false;
  let openFrac = 0;         // current normalized extension 0..1 (tracks drawer.position.z / OUT)
  let startFrac = 0;        // where a transition started from (smooth handoff between queue & dispense)
  let disc = null, cover = null;
  let stackDiscs = [];      // queue discs waiting in the drawer before launching
  let flyingDiscs = [];     // queue discs currently sweeping across the screen and exiting right
  let openResolvers = [];

  const th = () => Math.tan(THREE.MathUtils.degToRad(view.fov) / 2);
  const toScreen = (pos, scale) => {
    const d = -pos.z, tanH = th();
    return { x: pos.x / (d * tanH * view.aspect), y: pos.y / (d * tanH), d, ra: (L.recordRadius * scale) / (d * tanH) };
  };
  const placeInView = (g, st) => {
    const tanH = th();
    g.position.set(st.x * tanH * view.aspect * st.d, st.y * tanH * st.d, -st.d);
    g.scale.setScalar((st.ra * st.d * tanH) / L.recordRadius);
  };

  function resolveOpened() {
    if (!openResolvers.length) return;
    const list = openResolvers;
    openResolvers = [];
    for (const fn of list) fn();
  }

  function clearDisc() {
    if (!disc) return;
    drawer.remove(disc.group);
    disc.labelMat.dispose();
    disc = null;
  }

  function clearStack() {
    for (const d of stackDiscs) {
      if (d.launched) continue;
      drawer.remove(d.group);
      d.labelMat.dispose();
    }
    stackDiscs = [];
  }

  function clearFlying() {
    for (const f of flyingDiscs) {
      f.parent.remove(f.group);
      f.labelMat.dispose();
    }
    flyingDiscs = [];
  }

  function buildStack(covers = []) {
    clearStack();
    const count = STACK_COUNT;
    for (let i = 0; i < count; i++) {
      const idxFromTop = count - 1 - i;
      const tex = covers.length ? covers[idxFromTop % covers.length] : null;
      const d = kit.build(tex);
      d.group.position.set(0, REST_Y + i * 0.024, 0.08);
      d.group.rotation.set(0, i * 0.14, 0);
      d.group.scale.setScalar(1);
      drawer.add(d.group);
      stackDiscs.push({ ...d, idxFromTop, coverIdx: idxFromTop, launched: false });
    }
  }

  // Update covers on any queue vinyls still stacked in the drawer or already sweeping across the screen.
  function setStackCovers(covers = []) {
    if (!covers?.length) return;
    for (const d of stackDiscs) if (!d.launched) setLabelMap(d.labelMat, covers[d.coverIdx % covers.length] ?? kit.fallback);
    for (const f of flyingDiscs) setLabelMap(f.labelMat, covers[f.coverIdx % covers.length] ?? kit.fallback);
  }

  function run(tex) {
    clearDisc();
    clearStack();
    resolveOpened();
    cover = tex;
    disc = kit.build(cover);
    disc.group.position.set(0, REST_Y, 0.12);
    drawer.add(disc.group);
    startFrac = openFrac;
    // if already open (e.g., picked directly from the open Queue drawer), skip waiting for open!
    t = openFrac > 0.85 ? T_OPEN * 0.82 : 0;
    handed = false;
    frozen = false;
    mode = 'dispense';
    update(0);
  }

  function openHold(covers = [], { showStack = true } = {}) {
    clearDisc();
    if (showStack) buildStack(covers);
    else clearStack();
    frozen = false;
    if (mode === 'hold-open' && openFrac >= 0.99) {
      startFrac = 1;
      t = LAUNCH_AT;
      return Promise.resolve();
    }
    startFrac = openFrac;
    t = 0;
    mode = 'hold-open';
    return new Promise((res) => { openResolvers.push(res); });
  }

  function closeHold() {
    if (mode !== 'hold-open') return;
    resolveOpened();
    clearStack();
    startFrac = openFrac;
    t = 0;
    mode = 'hold-close';
  }

  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _e = new THREE.Euler(), _qw = new THREE.Quaternion(), _qs = new THREE.Quaternion();

  function launchStackDisc(d) {
    d.launched = true;
    const lane = FLY_LANES[d.idxFromTop % FLY_LANES.length];
    if (overlayScene && view) {
      drawer.updateWorldMatrix(true, true);
      d.group.matrixWorld.decompose(_p, _q, _s);
      drawer.remove(d.group);
      overlayScene.add(d.group);
      const s0 = toScreen(_p, _s.x);
      const qFly = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(1.12 + lane * 0.10, -0.18, -0.24 + lane * 0.12),
      );
      const f = {
        parent: overlayScene,
        screenSpace: true,
        group: d.group,
        labelMat: d.labelMat,
        coverIdx: d.coverIdx,
        t: 0,
        dur: FLY_DUR,
        s0,
        q0: _q.clone(),
        qFly,
        lane,
        spin: 0,
        spinRate: 7.5 + (d.idxFromTop % 3) * 1.1,
      };
      placeInView(f.group, s0);
      f.group.quaternion.copy(f.q0);
      flyingDiscs.push(f);
    } else {
      // Fallback when no overlayScene/view is provided: launch out and off to the right in drawer space
      const f = {
        parent: drawer,
        screenSpace: false,
        group: d.group,
        labelMat: d.labelMat,
        coverIdx: d.coverIdx,
        t: 0,
        dur: FLY_DUR,
        p0: d.group.position.clone(),
        lane,
        spin: 0,
        spinRate: 7.5,
      };
      flyingDiscs.push(f);
    }
  }

  function updateFlying(dt) {
    for (let i = flyingDiscs.length - 1; i >= 0; i--) {
      const f = flyingDiscs[i];
      f.t += dt;
      f.spin += f.spinRate * dt;
      const u = clamp01(f.t / f.dur);
      if (f.screenSpace) {
        const st = queueVinylPose(f.s0, u, f.lane);
        placeInView(f.group, st);
        const turn = easeInOut(clamp01(u / 0.30));
        _q.copy(f.q0).slerp(f.qFly, turn);
        const wob = Math.sin(Math.PI * u) * 0.14;
        _qw.setFromEuler(_e.set(wob * Math.sin(f.t * 8.5), 0, wob * Math.cos(f.t * 6.8)));
        _qs.setFromAxisAngle(UP, -f.spin);
        f.group.quaternion.copy(_q).multiply(_qw).multiply(_qs);
      } else {
        const e = 0.72 * u + 0.28 * (1 - Math.pow(1 - u, 3));
        f.group.position.set(
          f.p0.x + e * 24,
          f.p0.y + Math.sin(Math.min(1, u * 1.4) * Math.PI * 0.65) * 3.2 + f.lane * 0.8 * e,
          f.p0.z + e * 0.5,
        );
        f.group.rotation.set(easeOut(clamp01(u / 0.3)) * 1.1, f.spin, -0.25 * e);
      }
      if (f.t >= f.dur) {
        f.parent.remove(f.group);
        f.labelMat.dispose();
        flyingDiscs.splice(i, 1);
      }
    }
  }

  function handOff() {
    handed = true;
    drawer.updateWorldMatrix(true, true);
    const m = new THREE.Matrix4().copy(disc.group.matrixWorld);
    if (camera) { camera.updateWorldMatrix(true, false); m.premultiply(camera.matrixWorld); }   // camera space -> world
    m.decompose(_p, _q, _s);
    _q.multiply(Q_DISC_TO_FLAT);                                   // flight.js turns a rack disc (axis z) back to flat
    const k = (_s.x * L.recordRadius) / SHOP_RADIUS;               // so flight.js starts at this record's size
    const matrixWorld = new THREE.Matrix4().compose(_p, _q, new THREE.Vector3(k, k, k));
    const c = cover;
    clearDisc();
    onDisc?.({ matrixWorld, cover: c });
  }

  function update(dt) {
    if (frozen) dt = 0;
    if (flyingDiscs.length) updateFlying(dt);
    if (mode === 'idle') return;
    t += dt;

    if (mode === 'dispense') {
      let out;
      if (t < T_HAND + T_HOLD) {
        const u = clamp01(t / T_OPEN);
        out = startFrac + (1 - startFrac) * easeOutBack(u);
      } else {
        out = 1 - easeInOut((t - T_HAND - T_HOLD) / T_SHUT);
      }
      openFrac = Math.max(0, out);
      drawer.position.z = OUT * out;
      if (t < T_OPEN && startFrac < 0.5) suitcase.thump(0.018 * (1 - t / T_OPEN));
      if (disc) {
        const u = easeOut((t - T_OPEN) / T_RISE);
        disc.group.position.y = REST_Y + (LIFT_Y - REST_Y) * u;
        disc.group.rotation.x = TIP * u;
        if (!handed && t >= T_HAND) handOff();
      }
      if (t >= T_END) {
        mode = 'idle';
        openFrac = 0;
        drawer.position.z = 0;
        clearDisc();
      }
      return;
    }

    if (mode === 'hold-open') {
      const u = clamp01(t / T_OPEN);
      const out = startFrac + (1 - startFrac) * easeOutBack(u);
      openFrac = Math.max(0, out);
      drawer.position.z = OUT * out;
      if (t < T_OPEN && startFrac < 0.5) suitcase.thump(0.016 * (1 - u));
      if (u >= 1) resolveOpened();
      // Launch every vinyl out of the open drawer one by one so they sweep across the screen
      // behind the Queue menu and exit cleanly off the right edge.
      if (stackDiscs.length && t >= LAUNCH_AT) {
        const elapsed = t - LAUNCH_AT;
        let remaining = false;
        for (const d of stackDiscs) {
          if (d.launched) continue;
          if (elapsed >= d.idxFromTop * FLY_STAGGER) launchStackDisc(d);
          else remaining = true;
        }
        if (!remaining) stackDiscs = [];
      }
      return;
    }

    if (mode === 'hold-close') {
      const u = clamp01(t / T_SHUT);
      const out = startFrac * (1 - easeInOut(u));
      openFrac = Math.max(0, out);
      drawer.position.z = OUT * out;
      if (u >= 1) {
        mode = 'idle';
        openFrac = 0;
        drawer.position.z = 0;
        clearStack();
      }
    }
  }

  // World (or overlay-scene) center of the open drawer cavity, for launching Queue slips out of it.
  function centerPoint(out = new THREE.Vector3()) {
    drawer.updateWorldMatrix(true, false);
    return out.set(0, 0.34, 0.3).applyMatrix4(drawer.matrixWorld);
  }

  return {
    run, openHold, closeHold, setStackCovers, update, centerPoint,
    // jump to the end; a record that never left the tray is handed back (its cover) so it can go straight on
    finish() {
      const left = mode === 'dispense' && !handed ? cover : null;
      clearDisc();
      clearStack();
      clearFlying();
      resolveOpened();
      mode = 'idle'; frozen = false; openFrac = 0;
      drawer.position.z = 0;
      return left;
    },
    seek(at) { if (mode === 'idle') return; frozen = true; t = at; update(0); },
    get active() { return mode !== 'idle'; },
    get moving() {
      return mode === 'dispense' || mode === 'hold-close' || flyingDiscs.length > 0
        || (mode === 'hold-open' && (t < T_OPEN || stackDiscs.length > 0));
    },
    get isOpen() { return mode === 'hold-open' || openFrac > 0.25; },
    duration: T_END,
    handAt: T_HAND,
    drawer,
  };
}
