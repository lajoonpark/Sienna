// The record drawer (mini window only). A song picked in search has no rack and no sleeve, so the bottom
// of the suitcase slides out like a tray with the record lying in it; the record lifts up out of the tray,
// tips towards you and flies onto the platter (flight.js, the same handoff as from a rack), and the
// drawer slides home again. At rest only its front shows: a slim leather strip with a brass pull along
// the foot of the case. The shop's case has no drawer (it still uses machine.js).
//
//   const tray = createRecordTray({ suitcase, kit, onDisc })
//     suitcase: createSuitcase(...) (the drawer is added to its case, so it leans with it)
//     kit:      suitcase.recordKit (to build the record in the tray)
//     onDisc({ matrixWorld, cover }): the record left the tray; pass it to flights.receive
//   tray.run(cover)     slide out with this cover's record in it
//   tray.update(dt)     every frame
//   tray.finish()       jump to the end: returns the record if it never left the tray (null otherwise)
//   tray.seek(at)       screenshots: freeze at time `at` of the current run
//   tray.active
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAYOUT as L } from '../tonearm.js';
import { COL } from './paint.js';
import { painted } from './model.js';

const SHOP_RADIUS = 0.145;   // the size flight.js assumes for a disc handed over (a rack's vinyl)
const Q_DISC_TO_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// the drawer, in case units (see model.js: case 4.6 x 3.2, base 0.95 high, front at z = +1.6)
const TRAY_W = 2.7;                       // between the brass corners
const TRAY_D = 2.5;                       // front to back, room for the record (2.24 across)
const TRAY_H = 0.13;                      // the front strip, under the speakers, over the foot welt
const TRAY_Y = 0.025;                     // its bottom edge
const OUT = 2.45;                         // how far it slides out
const REST_Y = TRAY_Y + 0.05;             // the record lying in the tray
const LIFT_Y = 1.05;                      // how high it rises before it flies
const TIP = 0.75;                         // and how far it tips its face towards you

// the beats, in seconds
const T_OPEN = 0.42, T_RISE = 0.36, T_HOLD = 0.15, T_SHUT = 0.34;
const T_HAND = T_OPEN + T_RISE;           // the record leaves here
const T_END = T_HAND + T_HOLD + T_SHUT;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutBack = (t) => { const c = 1.4; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

function build(mats) {
  const g = new THREE.Group();
  const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const leather = mats.leather, lining = painted(COL.lining), brass = painted(COL.brass), welt = painted(COL.leatherDark);
  // z = 0 is the drawer's front face; the tray reaches back to -TRAY_D
  add(rbox(TRAY_W, TRAY_H, 0.08, 0.03), leather, 0, TRAY_Y + TRAY_H / 2, -0.03);              // the front
  add(rbox(TRAY_W - 0.06, 0.025, 0.04, 0.01), welt, 0, TRAY_Y + TRAY_H - 0.02, 0.012);       // a dark seam along its top
  add(rbox(0.5, 0.05, 0.06, 0.02), brass, 0, TRAY_Y + TRAY_H / 2, 0.02);                      // the pull
  add(new THREE.BoxGeometry(TRAY_W - 0.1, 0.03, TRAY_D - 0.08), lining, 0, TRAY_Y + 0.015, -TRAY_D / 2);   // the floor
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.09, TRAY_D - 0.08), leather, sx * (TRAY_W / 2 - 0.08), TRAY_Y + 0.045, -TRAY_D / 2);
  add(new THREE.BoxGeometry(TRAY_W - 0.1, 0.09, 0.06), leather, 0, TRAY_Y + 0.045, -TRAY_D + 0.07);   // the back lip
  return g;
}

export function createRecordTray({ suitcase, kit, onDisc }) {
  const { caseRoot, mats } = suitcase.parts;
  const drawer = build(mats);
  const front = L.caseDepth / 2 + 0.035;   // the closed front sits just proud of the leather
  drawer.position.z = front;
  caseRoot.add(drawer);

  let t = 0, running = false, handed = false, frozen = false;
  let disc = null, cover = null;

  function clearDisc() {
    if (!disc) return;
    drawer.remove(disc.group);
    disc.labelMat.dispose();
    disc = null;
  }

  function run(tex) {
    clearDisc();
    cover = tex;
    disc = kit.build(cover);
    disc.group.position.set(0, REST_Y, -TRAY_D / 2);
    drawer.add(disc.group);
    t = 0;
    handed = false;
    frozen = false;
    running = true;
    update(0);
  }

  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  function handOff() {
    handed = true;
    drawer.updateWorldMatrix(true, true);
    disc.group.matrixWorld.decompose(_p, _q, _s);
    _q.multiply(Q_DISC_TO_FLAT);                                   // flight.js turns a rack disc (axis z) back to flat
    const k = (_s.x * L.recordRadius) / SHOP_RADIUS;               // so flight.js starts at this record's size
    const matrixWorld = new THREE.Matrix4().compose(_p, _q, new THREE.Vector3(k, k, k));
    const c = cover;
    clearDisc();
    onDisc?.({ matrixWorld, cover: c });
  }

  function update(dt) {
    if (!running) return;
    if (frozen) dt = 0;
    t += dt;
    // slides out with a little overshoot, waits while the record leaves, slides home
    const out = t < T_HAND + T_HOLD ? easeOutBack(t / T_OPEN) : 1 - easeInOut((t - T_HAND - T_HOLD) / T_SHUT);
    drawer.position.z = front + OUT * out;
    if (t < T_OPEN) suitcase.thump(0.015 * (1 - t / T_OPEN));
    if (disc) {
      const u = easeOut((t - T_OPEN) / T_RISE);
      disc.group.position.y = REST_Y + (LIFT_Y - REST_Y) * u;
      disc.group.rotation.x = TIP * u;
      if (!handed && t >= T_HAND) handOff();
    }
    if (t >= T_END) { running = false; drawer.position.z = front; clearDisc(); }
  }

  return {
    run, update,
    // jump to the end; a record that never left the tray is handed back (its cover) so it can go straight on
    finish() {
      if (!running) return null;
      const left = handed ? null : cover;
      clearDisc();
      running = false; frozen = false;
      drawer.position.z = front;
      return left;
    },
    seek(at) { if (!running) return; frozen = true; t = at; update(0); },
    get active() { return running; },
    duration: T_END,
    handAt: T_HAND,
    drawer,
  };
}
