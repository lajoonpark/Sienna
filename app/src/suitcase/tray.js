// The full-bottom record drawer. The entire lower half of the suitcase (model.js `parts.drawer`)
// slides forward out from underneath the turntable deck:
//   - On a search/list pick (`tray.run(cover)`): the drawer slides out with the record lying inside
//     the lined bed, the record lifts up, tips towards you and flies onto the platter (flight.js),
//     and the drawer slides home again.
//   - On opening the Up Next Queue (`tray.openHold(covers)` / `tray.closeHold()`): the entire bottom
//     drawer slides out and stays open with a stack of records peeking up inside while the Queue
//     slips emerge from it; closing the Queue tucks the slips back in and slides the drawer shut.
//
// Used by both the shop's case (suitcase/player.js) and the mini window (mini.js).
import * as THREE from 'three';
import { LAYOUT as L } from '../tonearm.js';

const SHOP_RADIUS = 0.145;   // the size flight.js assumes for a disc handed over (a rack's vinyl)
const Q_DISC_TO_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// Full-bottom drawer travel & record pose in case units (case 4.6 x 3.2, drawer height 0.44).
const OUT = 2.68;                         // how far the entire bottom slides out along +z
const REST_Y = 0.125;                     // the record lying on the lined drawer floor
const LIFT_Y = 1.25;                      // how high it rises before it flies to the platter
const TIP = 0.72;                         // and how far it tips its face towards you

// the beats, in seconds
const T_OPEN = 0.42, T_RISE = 0.36, T_HOLD = 0.15, T_SHUT = 0.36;
const T_LAUNCH = 0.38;                    // queue discs rise out of the drawer and hand off to the emerging list
const T_HAND = T_OPEN + T_RISE;           // the record leaves here
const T_END = T_HAND + T_HOLD + T_SHUT;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutBack = (t) => { const c = 1.35; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

export function createRecordTray({ suitcase, kit, onDisc, camera = null }) {
  const { drawer } = suitcase.parts;
  drawer.position.z = 0;

  // mode: 'idle' | 'dispense' | 'hold-open' | 'hold-close'
  let mode = 'idle';
  let t = 0, handed = false, frozen = false;
  let openFrac = 0;         // current normalized extension 0..1 (tracks drawer.position.z / OUT)
  let startFrac = 0;        // where a transition started from (smooth handoff between queue & dispense)
  let disc = null, cover = null;
  let stackDiscs = [];      // queue discs that launch out of the drawer as the list emerges
  let openResolvers = [];

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
      drawer.remove(d.group);
      d.labelMat.dispose();
    }
    stackDiscs = [];
  }

  function buildStack(covers = []) {
    clearStack();
    const list = covers.slice(0, 4);
    list.forEach((tex, i) => {
      const d = kit.build(tex);
      d.group.position.set(0, REST_Y + i * 0.026, 0.08);
      d.group.rotation.set(0, i * 0.14, 0);
      d.group.scale.setScalar(1);
      drawer.add(d.group);
      stackDiscs.push(d);
    });
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

  function openHold(covers = []) {
    clearDisc();
    if (covers.length) buildStack(covers);
    else clearStack();
    frozen = false;
    if (mode === 'hold-open' && openFrac >= 0.99) {
      clearStack();
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
    if (mode === 'idle') return;
    if (frozen) dt = 0;
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
      // As the drawer finishes opening, the discs launch up and out of the drawer (handing off to the
      // emerging Queue slips) and clear out completely so the open drawer is clean while browsing.
      if (stackDiscs.length && t >= T_OPEN * 0.88) {
        const elapsed = t - T_OPEN * 0.88;
        let allGone = true;
        stackDiscs.forEach((d, i) => {
          const idxFromTop = stackDiscs.length - 1 - i;
          const lu = clamp01((elapsed - idxFromTop * 0.045) / (T_LAUNCH * 0.72));
          if (lu <= 0) { allGone = false; return; }
          if (lu >= 1) { d.group.visible = false; return; }
          allGone = false;
          const e = easeOut(lu);
          d.group.position.y = REST_Y + i * 0.026 + e * 2.1;
          d.group.position.z = 0.08 + e * 0.45;
          d.group.rotation.x = e * 0.85;
          d.group.rotation.y += dt * 4.5;
          const sc = lu < 0.55 ? 1 : Math.max(0.01, 1 - (lu - 0.55) / 0.45);
          d.group.scale.setScalar(sc);
        });
        if (allGone) clearStack();
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
    run, openHold, closeHold, update, centerPoint,
    // jump to the end; a record that never left the tray is handed back (its cover) so it can go straight on
    finish() {
      if (mode === 'idle') return null;
      const left = mode === 'dispense' && !handed ? cover : null;
      clearDisc();
      clearStack();
      resolveOpened();
      mode = 'idle'; frozen = false; openFrac = 0;
      drawer.position.z = 0;
      return left;
    },
    seek(at) { if (mode === 'idle') return; frozen = true; t = at; update(0); },
    get active() { return mode !== 'idle'; },
    get moving() { return mode === 'dispense' || mode === 'hold-close' || (mode === 'hold-open' && (t < T_OPEN + T_LAUNCH + 0.08 || stackDiscs.length > 0)); },
    get isOpen() { return mode === 'hold-open' || openFrac > 0.25; },
    duration: T_END,
    handAt: T_HAND,
    drawer,
  };
}
