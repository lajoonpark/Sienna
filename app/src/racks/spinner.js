// Station 6, the plant room spinner: a painted wooden tower on a turning foot, three tiers of
// pockets on each of its four sides with covers faced out. It stands under the skylight; slide the
// cursor out to the left or right of it and it turns that way, so you can browse right round it.
// It also turns by hand: scroll sideways (trackpad swipe), or grab it and drag, and let go with a
// flick to send it spinning.
// Hover a cover and it lifts out of its pocket and turns toward you. Up to 12 records take one
// pocket each (3 per side), 13..24 take two per pocket.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, paint, WOOD, SLEEVE, smooth } from './common.js';
import { popNear, viewForward, stagePath } from './pop.js';

const HALF = 0.33;                    // half width of a tower side
const TIERS = [0.30, 0.86, 1.42];     // pocket floors
const LEAN = 0.2;
const OUT = 0.405;                    // where a cover's bottom edge stands (from the tower axis)
const TOP = 1.88;
const PULL = 0.36;                    // a hovered cover first comes this far straight out of its pocket
const CLEAR = 0.72, REACH_Y = 0.25;   // a lifted cover stays this far nearer you than the tower's axis (pocket corners reach 0.58, roof 0.64), over this much height
const WHEEL_RAD = 0.005;               // turn per px of sideways scroll
const HOLD = 0.25;                    // s after turning by hand before a record can lift again
const FRICTION = 2.2, MAX_SPIN = 9;   // a flick's slow-down (1/s) and top speed (rad/s)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _u = new THREE.Vector3();

export function createSpinnerRack({ onPick }) {
  const core = createRackCore({ onPick, sign: { w: 0.9, h: 0.115 } });
  const car = new THREE.Group();       // the turning part
  const rest = new THREE.Matrix4();
  let vel = 0;
  let ptr = null;
  // by hand: spin = rad/s left over from a flick or a scroll (friction slows it); drag = the grab in
  // progress (last pointer x, NDC radius of the tower, recent speed); hold = s left with no hovering
  let spin = 0, wheelTurn = 0, drag = null, hold = 0;
  const _rc = new THREE.Raycaster(), _cv = new THREE.Vector3();
  // how wide the tower is on screen (NDC x per radian of turn at its front face)
  const ndcRadius = (camera) => {
    car.getWorldPosition(_cv);
    _cv.applyMatrix4(camera.matrixWorldInverse);
    return Math.max(0.05, (camera.projectionMatrix.elements[0] * (HALF + 0.08)) / Math.max(0.3, -_cv.z));
  };
  const cam = new THREE.Vector3(), rp = new THREE.Vector3(), pp = new THREE.Vector3(), fw = new THREE.Vector3(), xp = new THREE.Vector3();

  return core.contract({
    setup(c) {
      const root = c.root;
      // foot: a round plate and a bearing drum, fixed
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.06, 28), WOOD.dark);
      plate.position.y = 0.03;
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 18), WOOD.deep);
      drum.position.y = 0.11;
      plate.castShadow = plate.receiveShadow = drum.castShadow = true;
      root.add(plate, drum);
      // the tower
      root.add(car);
      c.car = car; // checks (scripts/spin-check.mjs)
      car.rotation.y = 0.4;
      const teal = paint('#4f817a'), wood = paint('#9a6a3c');
      addBox(car, [HALF * 2 - 0.02, TOP - 0.16, HALF * 2 - 0.02], teal, [0, (TOP + 0.16) / 2, 0]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(car, [0.05, TOP - 0.16, 0.05], WOOD.dark, [sx * HALF, (TOP + 0.16) / 2, sz * HALF]);
      for (let s = 0; s < 4; s++) {
        const g = new THREE.Group();
        g.rotation.y = (s * Math.PI) / 2;
        car.add(g);
        for (const y of TIERS) {
          addBox(g, [HALF * 2 + 0.04, 0.03, 0.14], WOOD.top, [0, y - 0.015, HALF + 0.05]);          // pocket floor
          addBox(g, [HALF * 2 + 0.04, 0.032, 0.014], wood, [0, y + 0.014, HALF + 0.115]);           // lip
          addBox(g, [0.03, 0.05, 0.12], WOOD.dark, [0, y + 0.01, HALF + 0.055]);                    // divider between two
          addBox(g, [HALF * 2 - 0.1, 0.05, 0.02], WOOD.dark, [0, y - 0.055, HALF + 0.0]);          // apron under the floor
        }
      }
      addBox(car, [HALF * 2 + 0.16, 0.04, HALF * 2 + 0.16], WOOD.top, [0, TOP + 0.02, 0]);         // eaves
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.64, 0.3, 4, 1), paint('#c4673d'));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = TOP + 0.04 + 0.15;
      roof.castShadow = true;
      car.add(roof);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), paint('#e8b23a'));
      ball.position.y = TOP + 0.36;
      car.add(ball);
      addBox(car, [HALF * 2 - 0.1, 0.1, HALF * 2 - 0.1], WOOD.dark, [0, 0.19, 0]);                   // tower foot
      // a painted A-board with the shelf title, standing at the front right of the foot
      const board = new THREE.Group();
      board.position.set(1.0, 0, 0.45);
      board.rotation.y = -0.5;
      addBox(board, [1.0, 0.46, 0.025], paint('#e8d9b8'), [0, 0.63, 0], [-0.22, 0, 0]);
      addBox(board, [1.04, 0.04, 0.04], WOOD.dark, [0, 0.4, 0.0], [-0.22, 0, 0]);
      for (const sx of [-0.4, 0.4]) {
        addBox(board, [0.045, 0.62, 0.03], WOOD.dark, [sx, 0.31, 0.12], [0.3, 0, 0]);
        addBox(board, [0.045, 0.45, 0.03], WOOD.dark, [sx, 0.3, -0.12], [-0.48, 0, 0]);
      }
      board.add(c.sign.mesh);
      c.sign.mesh.position.set(0, 0.64, 0.028);
      c.sign.mesh.rotation.x = -0.22;
      root.add(board);
      c.tag.mesh.position.set(0.02, -SLEEVE / 2 - 0.03, 0.012);
    },

    items(c, items) {
      const n = items.length, r = rng(n * 19 + 3);
      const cols = n <= 12 ? 1 : 2, cap = 3 * cols;
      c.picker.clear();
      // the tower itself blocks picks (id -1 = nothing) so covers on its far side can't be hit through it
      rest.makeTranslation(0, (TOP + 0.16) / 2, 0);
      c.picker.add(-1, rest, [HALF - 0.005, (TOP - 0.16) / 2, HALF - 0.005]);
      c.sleeves.forEach((s, i) => {
        car.add(s.mesh);
        const side = Math.floor(i / cap), within = i % cap;
        const row = Math.floor(within / cols), colI = within % cols;
        const a = (side * Math.PI) / 2 + (r() - 0.5) * 0.03;
        const xc = cols === 1 ? 0 : (colI ? 1 : -1) * 0.165;
        const floor = TIERS[2 - row];
        s.a = a;
        s.d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        s.t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
        s.out = OUT - (SLEEVE / 2) * Math.sin(LEAN);
        s.xc = xc + (r() - 0.5) * 0.01;
        s.yc = floor + (SLEEVE / 2) * Math.cos(LEAN) + 0.002;
        s.roll = (r() - 0.5) * 0.03;
        s.base = new THREE.Vector3().addScaledVector(s.d, s.out).addScaledVector(s.t, s.xc);
        _q.setFromEuler(_e.set(-LEAN, a, 0, 'YXZ'));
        rest.compose(_p.set(s.base.x, s.yc, s.base.z), _q, _s);
        c.picker.add(i, rest, [0.158, 0.165, 0.045]);
      });
    },

    // remember the pointer for the turning (pick only runs when the rack is live)
    pick(c, pointer, camera) {
      ptr = pointer;
      return c.picker.pick(pointer, camera, car);
    },

    // records stay put while you turn the stand (and a moment after)
    turning: () => !!drag?.moving || hold > 0,

    // sideways scroll: macOS natural scrolling sends +dx as the fingers move left, the front face goes left
    wheel(c, dx) {
      wheelTurn -= dx * WHEEL_RAD;
      hold = HOLD;
      return true;
    },
    grab(c, pointer, camera) {
      _rc.setFromCamera(pointer, camera);
      if (!_rc.intersectObject(car, true).length) return false;
      drag = { x: pointer.x, r: ndcRadius(camera), v: 0, t: performance.now(), moving: false };
      spin = 0;
      return true;
    },
    dragTo(c, pointer) {
      if (!drag) return;
      const now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
      const d = (pointer.x - drag.x) / drag.r; // the face under the cursor follows it
      car.rotation.y += d;
      drag.v += (d / dt - drag.v) * Math.min(1, dt * 20);
      drag.x = pointer.x; drag.t = now; drag.moving = true;
      hold = HOLD;
    },
    release() {
      if (!drag) return;
      // a flick keeps it going; a drag that stopped before letting go does not
      if (drag.moving && performance.now() - drag.t < 80) spin = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, drag.v));
      drag = null;
    },

    layout(c, dt, camera, hovered) {
      // turn toward the cursor when it is out beside the tower and nothing is hovered
      let target = 0;
      if (hovered < 0 && ptr) {
        const ex = Math.abs(ptr.x) - 0.36;
        if (ex > 0) target = Math.sign(ptr.x) * Math.min(1, ex / 0.4) * 2.0;
      }
      if (drag || hold > 0) target = 0;
      ptr = null;
      vel += (target - vel) * smooth(5, dt);
      // a scroll eases in over a few frames; a flick runs down with friction
      const w = wheelTurn * smooth(14, dt);
      wheelTurn -= w;
      spin *= Math.exp(-FRICTION * dt);
      if (Math.abs(spin) < 0.02) spin = 0;
      if (!drag) car.rotation.y += vel * dt + w + spin * dt;
      if (!drag && Math.abs(wheelTurn) < 1e-3 && !spin) hold = Math.max(0, hold - dt);
      car.updateWorldMatrix(true, false);
      camera.getWorldPosition(cam);
      car.worldToLocal(cam);
      viewForward(fw, camera, car);
      c.sleeves.forEach((s) => {
        const L = s.lift, e = L * L * (3 - 2 * L);
        const out = 0.03 * s.peek + 0.03 * Math.sin(s.bump * Math.PI);
        rp.set(s.base.x + s.d.x * out, s.yc + 0.06 * s.peek, s.base.z + s.d.z * out);
        // straight out of its pocket first (radially, still leaning: clear of the pocket lip and the tier
        // above, so its vinyl has room to slide out), then toward you and turning
        xp.copy(rp).addScaledVector(s.d, PULL);
        popNear(pp, xp, cam, fw, 0.88);
        // a record from a side face, turned to face you, would swing its far edge (and its tag) back into
        // the tower's corner (Lajoon, msg 720). So it comes on along your line of sight until it is wholly in
        // front of the tower, and shrinks just as much: on screen it is the same size in the same place
        // (still under the cursor), in the room it is clear of the rack.
        const deep = pp.x * fw.x + pp.y * fw.y + pp.z * fw.z - (cam.x * fw.x + cam.y * fw.y + cam.z * fw.z);
        // the tower's axis, less its reach, at the nearest height the record spans (you look down or up at it)
        const front = xp.y * fw.y - REACH_Y * Math.abs(fw.y) - (cam.x * fw.x + cam.y * fw.y + cam.z * fw.z) - CLEAR;
        const near = deep > front && front > 0.3 ? front / deep : 1;
        let shrink = 1;
        if (near < 1) {
          // where it would have been at this point of the lift, to keep its size on screen all the way
          stagePath(_u, L, rp, xp, pp, { split: 0.75 });
          pp.sub(cam).multiplyScalar(near).add(cam);
        }
        const T = stagePath(_p, L, rp, xp, pp, { split: 0.75 }); // far out before the bend: the post is right behind
        if (near < 1) shrink = _p.distanceTo(cam) / Math.max(1e-3, _u.distanceTo(cam));
        rp.copy(_p);
        const e2 = T;
        rp.y += s.drop * 0.7;
        const dx = cam.x - rp.x, dz = cam.z - rp.z;
        const tyaw = s.a + wrap(Math.atan2(dx, dz) - s.a);
        const tpitch = -Math.atan2(cam.y - rp.y, Math.hypot(dx, dz));
        s.mesh.position.copy(rp);
        s.mesh.scale.setScalar((1 + 0.06 * e2) * shrink);
        s.mesh.rotation.set(-LEAN + (tpitch + LEAN) * e2, s.a + (tyaw - s.a) * e2, s.roll * (1 - e2));
      });
    },
  });
}
