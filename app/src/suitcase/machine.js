// The disc machine. Playing a song from search has no rack and no sleeve for the record to come
// out of, so a little painted record-pressing machine pops into existence beside the suitcase: it
// squashes in, whirs (crank turning, bulb blinking, a shiver), spits the record up out of the slot in
// its top, the record flies onto the platter (flight.js, the same handoff as from a rack), and the
// machine pops away again. Only the shop uses it; the mini window slides the record out of a drawer
// in the case instead (tray.js).
//
//   const machine = createDiscMachine({ parent, camera, view, kit, onDisc })
//     parent: where it is drawn, in camera space (the shop's overlay scene, or a group on the camera)
//     camera: the world camera (the handoff matrix is a world pose, like a rack's)
//     view:   the camera whose fov/aspect place it on screen (overlay camera, or the camera itself)
//     kit:    suitcase.recordKit (to build the record it spits out)
//     onDisc({ matrixWorld, cover }): the record left the slot; pass it to flights.receive
//   machine.run(cover, { x, y, h })   x, y: where it stands on screen (NDC, its feet); h: its height as a share of the view
//   machine.update(dt)                every frame
//   machine.active
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toon, glow } from '../materials.js';
import { LAYOUT as L } from '../tonearm.js';
import { COL } from './paint.js';

const SHOP_RADIUS = 0.145;   // the size flight.js assumes for a disc handed over (a rack's vinyl)
const DEPTH = 4;             // how far in front of the camera it stands
const HEIGHT = 4.1;          // the machine's own height, feet to bulb, in its units
const Q_DISC_TO_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// the beats, in seconds
const T_IN = 0.34, T_WHIR = 0.6, T_SPIT = 0.3, T_HOLD = 0.35, T_OUT = 0.28;
const T_HAND = T_IN + T_WHIR + T_SPIT;          // the record leaves here
const T_END = T_HAND + T_HOLD + T_OUT;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutBack = (t) => { const c = 2.2; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
const easeIn = (t) => clamp01(t) ** 2;

function build() {
  const g = new THREE.Group();
  const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
  const add = (geo, color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, typeof color === 'string' ? toon(color) : color);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  // body and the arched top, like a little jukebox
  add(rbox(3.1, 2.0, 1.7, 0.28), '#c4613f', [0, 0.95, 0]);
  add(new THREE.CylinderGeometry(1.55, 1.55, 1.6, 40, 1, false, -Math.PI / 2, Math.PI), '#4f8a86', [0, 1.9, 0], [-Math.PI / 2, 0, 0]); // the round half up
  add(new THREE.TorusGeometry(1.55, 0.09, 8, 40, Math.PI), COL.brass, [0, 1.9, 0.82]);
  // the slot the record comes out of, along the top of the arch
  add(rbox(2.6, 0.16, 0.3, 0.05), COL.ink, [0, 3.42, 0]);
  // cream front panel: three dials and a grille
  add(rbox(2.3, 1.1, 0.12, 0.05), COL.lining, [0, 0.95, 0.86]);
  for (const x of [-0.7, 0, 0.7]) add(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), COL.brass, [x, 1.2, 0.95], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) add(rbox(1.7, 0.07, 0.06, 0.02), COL.leatherDark, [0, 0.72 - i * 0.16, 0.94]);
  // feet
  for (const x of [-1.2, 1.2]) for (const z of [-0.55, 0.55]) add(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 12), COL.ink, [x, -0.06, z]);
  // the crank on the right side
  const crank = new THREE.Group();
  crank.position.set(1.62, 1.0, 0);
  crank.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10).rotateZ(Math.PI / 2), toon(COL.steel)));
  const arm = new THREE.Mesh(rbox(0.12, 0.75, 0.12, 0.04), toon(COL.steel));
  arm.position.set(0.17, 0.3, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), toon(COL.hot));
  knob.position.set(0.3, 0.62, 0);
  crank.add(arm, knob);
  g.add(crank);
  // a bulb on a stalk that blinks while it works
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8), COL.ink, [-1.15, 3.05, 0.2]);
  const bulbOn = glow('#ffd36e'), bulbOff = toon('#e9d9a8');
  const bulb = add(new THREE.SphereGeometry(0.17, 14, 10), bulbOff, [-1.15, 3.33, 0.2]);
  return { group: g, crank, bulb, bulbOn, bulbOff };
}

export function createDiscMachine({ parent, camera, view, kit, onDisc }) {
  const m = build();
  const root = new THREE.Group();     // placed on screen; m.group squashes and shivers inside it
  root.add(m.group);
  root.visible = false;
  parent.add(root);

  let t = 0, running = false, handed = false, frozen = false;
  let disc = null, cover = null;

  function place({ x, y, h }) {
    const th = Math.tan(THREE.MathUtils.degToRad(view.fov) / 2);
    const s = (h * 2 * th * DEPTH) / HEIGHT;
    root.position.set(x * th * view.aspect * DEPTH, y * th * DEPTH, -DEPTH);
    root.scale.setScalar(s);
    // turned a little toward the middle of the screen and tipped back, so it reads as a 3D thing
    root.rotation.set(0.18, -Math.sign(x || 1) * 0.42, 0);
  }

  function clearDisc() {
    if (!disc) return;
    m.group.remove(disc.group);
    disc.labelMat.dispose();
    disc = null;
  }

  function run(tex, at) {
    clearDisc();
    cover = tex;
    place(at);
    disc = kit.build(cover);
    disc.group.rotation.x = Math.PI / 2;      // standing up in the slot, label to the front
    disc.group.position.set(0, 1.4, 0);        // hidden inside the body
    m.group.add(disc.group);
    t = 0;
    handed = false;
    running = true;
    root.visible = true;
    update(0);
  }

  const _inv = new THREE.Matrix4(), _view = new THREE.Matrix4(), _world = new THREE.Matrix4();
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  function handOff() {
    handed = true;
    root.updateWorldMatrix(true, true);
    // the record's pose in camera space, then in the world (what a rack would hand over)
    parent.updateWorldMatrix(true, false);
    _view.copy(_inv.copy(parent.matrixWorld).invert()).multiply(disc.group.matrixWorld);
    camera.updateWorldMatrix(true, false);
    _world.copy(camera.matrixWorld).multiply(_view);
    _world.decompose(_p, _q, _s);
    _q.multiply(Q_DISC_TO_FLAT);                                   // flight.js turns a rack disc (axis z) back to flat
    const k = (_s.x * L.recordRadius) / SHOP_RADIUS;               // so flight.js arrives at this record's size
    const matrixWorld = new THREE.Matrix4().compose(_p, _q, new THREE.Vector3(k, k, k));
    const c = cover;
    clearDisc();
    onDisc?.({ matrixWorld, cover: c });
  }

  function update(dt) {
    if (!running) return;
    if (frozen) dt = 0;
    t += dt;
    const g = m.group;
    // pop in: squash and stretch from nothing; pop out: a quick shrink with a hop
    let s = 1, sy = 1, hop = 0;
    if (t < T_IN) {
      const u = easeOutBack(t / T_IN);
      s = u;
      sy = 1 + 0.25 * Math.sin(Math.PI * clamp01(t / T_IN));
    } else if (t > T_END - T_OUT) {
      const u = easeIn((t - (T_END - T_OUT)) / T_OUT);
      s = 1 - u;
      hop = 0.4 * Math.sin(Math.PI * u);
    }
    // whir: a shiver, the crank turning, the bulb blinking
    const whir = t > T_IN * 0.6 && t < T_HAND;
    const shiver = whir ? 0.035 * Math.sin(t * 70) : 0;
    g.scale.set(s / Math.sqrt(sy), s * sy, s / Math.sqrt(sy));
    g.position.set(shiver, hop, 0);
    g.rotation.z = whir ? 0.02 * Math.sin(t * 53) : 0;
    if (whir) m.crank.rotation.x = frozen ? -t * 14 : m.crank.rotation.x - dt * 14;
    m.bulb.material = whir && Math.sin(t * 22) > 0 ? m.bulbOn : m.bulbOff;
    // spit: the record shoots up out of the slot (with a little overshoot), then is handed over
    if (disc) {
      const u = clamp01((t - T_IN - T_WHIR) / T_SPIT);
      disc.group.position.y = 1.4 + (3.42 + L.recordRadius + 0.35 - 1.4) * easeOutBack(u);
      disc.group.rotation.y = u * 0.6;
      if (!handed && t >= T_HAND) handOff();
    }
    if (t >= T_END) { running = false; root.visible = false; clearDisc(); }
  }

  return {
    run, update,
    // screenshots: jump to time `at` of the current run (hands the record over if it is past that beat)
    seek(at) { if (!running) return; frozen = true; t = at; update(0); },
    get active() { return running; },
    duration: T_END,
    handAt: T_HAND,
    root,
  };
}
