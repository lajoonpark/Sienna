// Station 7, the courtyard: a little market stall, a trestle table under a striped awning with
// wooden crates of records on it, covers toward you. Point at a crate and all its records pop out
// and float in the air in front of you, spread out in a row or two so every cover shows; the one
// under the cursor grows, comes forward and shows its name tag. Move off the crate and the floating
// records and they drop back in. Always a single crate: it gets deeper (and the records stand closer)
// the more records there are.
// Lemon crates, a striped cloth and a painted title board dress the stall.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, paint, WOOD, SLEEVE } from './common.js';

const TABLE = 0.72;                 // table top height
const CW = 0.4;                     // crate outer width
const SP = 0.05;                    // record to record (closer when the crate is full)
const DMAX = 0.9;                   // deepest crate the table takes
const FLOOR = 0.06, LIP = 0.15;     // crate floor top and the low front
const LEAN = 0.2;
const WOODS = ['#c9a06a', '#b88a58', '#d0aa74', '#a87a4a'];
const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const _rq = new THREE.Quaternion(), _fq = new THREE.Quaternion(), _iq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3(), _o = new THREE.Vector3();
const _hit = new THREE.Vector3(), _bx = new THREE.Box3(), _ray = new THREE.Ray(), _lr = new THREE.Ray(), _m4 = new THREE.Matrix4();
const caster = new THREE.Raycaster();
const now = () => performance.now() / 1000;

// the fan of floating records
const GAP = 0.05;                   // between floating records
const FIT_W = 0.56, FIT_H = 0.6;    // the fan fills at most this much of the view
const DIST = 1.1;                   // m from the camera: always in front of the stall, so records shrink to fit instead
const SHIFT_X = 0.05, SHIFT_Y = 0.07; // fan centre, as a fraction of the view, right and up (clear of the suitcase)
const GROW = 0.3, FORWARD = 0.14;   // the hovered one
const HOLD = 0.35;                  // s the fan stays open after the cursor leaves it

// ray (rack root space) against a box given by its matrix (root space) and half size; distance or Infinity
function hitBox(ray, m, half) {
  _ray.copy(ray).applyMatrix4(_m4.copy(m).invert());
  _bx.min.copy(half).negate(); _bx.max.copy(half);
  return _ray.intersectBox(_bx, _hit) ? _hit.distanceTo(_ray.origin) : Infinity;
}

const crateDepth = (per) => Math.min(DMAX, Math.max(0.32, per * SP + 0.16));
const spacing = (per) => Math.min(SP, (DMAX - 0.16) / Math.max(1, per));

// slatted crate (open top, low front) with the given wood; `closed` = a solid empty box to stand on
function buildCrate(parent, Dc, mat, { closed = false, height = LIP + 0.09 } = {}) {
  const g = new THREE.Group();
  parent.add(g);
  if (closed) {
    addBox(g, [CW, 0.26, Dc], mat, [0, 0.13, 0]);
    for (const y of [0.09, 0.18]) addBox(g, [CW + 0.006, 0.012, Dc + 0.006], WOOD.dark, [0, y, 0]);
    return g;
  }
  for (const x of [-0.12, 0.12]) addBox(g, [0.04, 0.03, Dc + 0.02], WOOD.dark, [x, 0.015, 0]);      // runners
  addBox(g, [CW - 0.04, 0.02, Dc], mat, [0, 0.05, 0]);                                              // floor
  for (const s of [-1, 1]) {
    for (const y of [0.105, 0.215]) addBox(g, [0.02, 0.09, Dc], mat, [s * (CW / 2 - 0.01), y, 0]);   // side slats
    addBox(g, [0.03, height + 0.02, 0.03], WOOD.dark, [s * (CW / 2 - 0.015), (height + 0.02) / 2 + 0.03, Dc / 2 - 0.015]);
    addBox(g, [0.03, height + 0.02, 0.03], WOOD.dark, [s * (CW / 2 - 0.015), (height + 0.02) / 2 + 0.03, -Dc / 2 + 0.015]);
  }
  addBox(g, [CW - 0.06, 0.09, 0.02], mat, [0, 0.105, Dc / 2 - 0.01]);                               // low front
  for (const y of [0.105, 0.215]) addBox(g, [CW - 0.06, 0.09, 0.02], mat, [0, y, -Dc / 2 + 0.01]);  // back
  return g;
}

export function createCratesRack({ onPick }) {
  const core = createRackCore({ onPick, sign: { w: 1.1, h: 0.14 }, tag: { w: 0.34, h: 0.1, wrap: false } });
  const stall = new THREE.Group();
  const lemonGeo = new THREE.IcosahedronGeometry(0.052, 1);
  const rp = new THREE.Vector3(), fp = new THREE.Vector3();
  // the fan: which crate is open, when the cursor last was on it, its outline for the hit test
  const fan = { cr: null, seen: 0, m: new THREE.Matrix4(), half: new THREE.Vector3(), t: 0, lastPick: 0 };
  let crates = [];

  // trestle table, awning on four poles, striped cloth on the front, fixed
  function buildStall() {
    const wood = paint('#a87a4a');
    addBox(stall, [2.1, 0.05, 1.3], paint('#c9a06a'), [0, TABLE - 0.025, 0]);
    for (const x of [-0.9, 0.9]) for (const z of [-0.5, 0.5]) addBox(stall, [0.06, TABLE - 0.05, 0.06], wood, [x, (TABLE - 0.05) / 2, z], [0, 0, x * 0.06]);
    for (const x of [-0.9, 0.9]) addBox(stall, [0.05, 0.05, 1.1], wood, [x, 0.2, 0]);
    // cloth hanging over the front edge, painted stripes
    for (let i = 0; i < 10; i++) addBox(stall, [0.21, 0.26, 0.012], paint(i % 2 ? '#f2e8d4' : '#c4673d'), [-0.945 + i * 0.21, TABLE - 0.15, 0.665]);
    // poles, awning stretched from the back (high) to the front (low), valance on the front edge
    for (const [x, z, h] of [[-1.0, -0.62, 2.15], [1.0, -0.62, 2.15], [-1.0, 0.68, 1.9], [1.0, 0.68, 1.9]]) addBox(stall, [0.05, h, 0.05], wood, [x, h / 2, z]);
    const len = Math.hypot(1.3, 0.25), tilt = Math.atan2(0.25, 1.3);
    for (let i = 0; i < 8; i++) {
      const m = addBox(stall, [0.27, 0.025, len], paint(i % 2 ? '#f2e8d4' : '#c4673d'), [-0.945 + i * 0.27, 2.03, 0.03], [tilt, 0, 0]);
      m.castShadow = true;
      addBox(stall, [0.27, 0.12, 0.012], paint(i % 2 ? '#f2e8d4' : '#c4673d'), [-0.945 + i * 0.27, 1.85, 0.7]);
    }
  }

  return core.contract({
    setup(c) {
      c.root.add(stall);
      buildStall();
      stall.userData.fixed = stall.children.length;
      c.tag.mesh.position.set(0.02, SLEEVE / 2 + 0.075, 0.012);
    },

    items(c, items) {
      const n = items.length, r = rng(n * 23 + 11);
      while (stall.children.length > stall.userData.fixed) stall.remove(stall.children[stall.children.length - 1]);
      // one crate, always (Lajoon): deeper for more records
      const nc = 1, per = Math.max(1, n);
      const slots = [[0, Math.min(0.15, 0.6 - crateDepth(per) / 2)]];
      crates = slots.map(([x, z], k) => ({
        x: x + (r() - 0.5) * 0.03, z: z + (r() - 0.5) * 0.04, up: TABLE, yaw: (r() - 0.5) * 0.08,
        Dc: crateDepth(per), sp: spacing(per), start: k * per, count: Math.max(0, Math.min(per, n - k * per)),
      }));
      fan.cr = null;
      crates.forEach((cr, k) => {
        const g = buildCrate(stall, cr.Dc, paint(WOODS[k % WOODS.length]));
        g.position.set(cr.x, cr.up, cr.z);
        g.rotation.y = cr.yaw;
        // hit box: the crate and the records standing up out of it
        cr.box = new THREE.Matrix4().compose(new THREE.Vector3(cr.x, cr.up + 0.2, cr.z), _q.setFromEuler(_e.set(0, cr.yaw, 0)), _s);
        cr.half = new THREE.Vector3(CW / 2 + 0.02, 0.2, cr.Dc / 2 + 0.02);
      });
      // records in the crates
      c.sleeves.forEach((s, i) => {
        const cr = crates[Math.min(nc - 1, Math.floor(i / per))];
        s.cr = cr;
        s.k = i - cr.start;                       // 0 = front-most
        s.lx = (r() - 0.5) * 0.015;
        s.lean = LEAN + (r() - 0.5) * 0.08;
        const zb = cr.Dc / 2 - 0.075 - s.k * cr.sp; // bottom edge
        s.lz = zb - (SLEEVE / 2) * Math.sin(s.lean);
        s.ly = cr.up + FLOOR + (SLEEVE / 2) * Math.cos(s.lean);
        s.roll = (r() - 0.5) * 0.03;
      });
      // lemon crates at the table ends
      const lem = (x, z, up, yaw, full) => {
        const g = buildCrate(stall, 0.4, paint(WOODS[x > 0 ? 1 : 2]));
        g.position.set(x, up, z);
        g.rotation.y = yaw;
        if (full) for (let q = 0; q < 14; q++) {
          const m = new THREE.Mesh(lemonGeo, paint(q % 3 ? '#e6c23a' : '#d9b02e'));
          const lx = (r() - 0.5) * 0.24, lz = (r() - 0.5) * 0.26, ly = 0.1 + (q > 8 ? 0.07 : 0.0);
          m.position.set(x + lx * Math.cos(yaw) + lz * Math.sin(yaw), up + ly, z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
          m.scale.set(1, 0.82, 1.15);
          m.rotation.y = r() * 3;
          m.castShadow = true;
          stall.add(m);
        }
      };
      lem(0.78, 0.05, TABLE, -0.3, true);
      lem(-0.78, 0.05, TABLE, 0.25, true);
      lem(-0.5, -0.1, 0.0, 0.1, true);           // one more under the table
      // the title board hangs between the back poles
      addBox(stall, [1.5, 0.22, 0.03], paint('#e8d9b8'), [0, 1.38, -0.62]);
      c.sign.mesh.position.set(0, 1.38, -0.62 + 0.018);
    },

    // Closed: pointing at a crate opens it. Open: the floating records (nearest wins); the fan's
    // outline and the open crate keep it open; anywhere else closes it after HOLD seconds.
    pick(c, pointer, camera) {
      fan.lastPick = now();
      caster.setFromCamera(pointer, camera);
      c.root.updateWorldMatrix(true, false);
      _lr.copy(caster.ray).applyMatrix4(_m4.copy(c.root.matrixWorld).invert());
      if (fan.cr) {
        let best = -1, bestD = Infinity;
        c.sleeves.forEach((s, i) => {
          if (s.cr !== fan.cr || !s.floatM || s.picking || !c.play.canPick(s.item)) return;
          const d = hitBox(_lr, s.floatM, s.floatHalf);
          if (d < bestD) { bestD = d; best = i; }
        });
        if (best >= 0 || hitBox(_lr, fan.m, fan.half) < Infinity || hitBox(_lr, fan.cr.box, fan.cr.half) < Infinity) fan.seen = now();
        if (best >= 0) return best;
        if (now() - fan.seen < HOLD) return -1;
        fan.cr = null;
      }
      let bestD = Infinity;
      for (const cr of crates) {
        if (!cr.count) continue;
        const d = hitBox(_lr, cr.box, cr.half);
        if (d < bestD) { bestD = d; fan.cr = cr; fan.seen = now(); }
      }
      return -1;
    },

    layout(c, dt, camera, hovered) {
      fan.t += dt;
      // a forced hover (?hover=N) opens that record's crate; losing the cursor closes the fan
      if (hovered >= 0 && c.sleeves[hovered]) { fan.cr = c.sleeves[hovered].cr; fan.seen = now(); }
      else if (fan.cr && now() - fan.lastPick > HOLD && now() - fan.seen > HOLD) fan.cr = null;

      // the fan hangs in the camera rig's frame (the station view without the cursor tilt), so it
      // floats still in the air while the view sways a little around it
      const frame = camera.parent ?? camera;
      frame.updateWorldMatrix(true, false);
      c.root.getWorldQuaternion(_iq).invert();
      frame.getWorldQuaternion(_wq);
      _fq.copy(_iq).multiply(_wq);                      // rig orientation in root space
      _ax.set(1, 0, 0).applyQuaternion(_fq);
      _ay.set(0, 1, 0).applyQuaternion(_fq);
      _az.set(0, 0, 1).applyQuaternion(_fq);            // toward the viewer
      frame.getWorldPosition(_o);
      c.root.worldToLocal(_o);

      const cr = fan.cr;
      let cols = 1, rows = 1, fs = 1, cellW = SLEEVE + GAP, cellH = SLEEVE + GAP + 0.06;
      if (cr) {
        const m = cr.count;
        cols = m <= 4 ? m : m <= 12 ? Math.ceil(m / 2) : Math.ceil(m / 3);
        rows = Math.ceil(m / cols);
        const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect;
        const D = DIST;
        fs = Math.min(1, (FIT_W * 2 * tanH * D) / (cols * cellW - GAP), (FIT_H * 2 * tanV * D) / (rows * cellH - GAP + 0.12));
        cellW *= fs; cellH *= fs;
        const W = cols * cellW - GAP * fs, H = rows * cellH - GAP * fs;
        fan.cx = SHIFT_X * 2 * tanH * D;
        fan.cy = SHIFT_Y * 2 * tanV * D;
        fan.D = D;
        fan.fs = fs;
        fan.half.set(W / 2 + 0.08, H / 2 + 0.14, 0.12);
        fp.copy(_o).addScaledVector(_ax, fan.cx).addScaledVector(_ay, fan.cy).addScaledVector(_az, -D);
        fan.m.compose(fp, _fq, _s);
      }

      c.sleeves.forEach((s, i) => {
        const scr = s.cr;
        const open = scr === cr && !!cr;
        // staggered: records leave front to back and come home together
        if (open && s.fl <= 0 && !s.flying) s.fl = -0.05 * s.k;
        s.flying = open;
        s.fl = Math.min(1, Math.max(open ? -1 : 0, (s.fl ?? 0) + (open ? 3.2 : -3.6) * dt));
        const f = ss(s.fl);

        // standing in the crate
        const ly = s.ly + 0.07 * s.peek + 0.03 * Math.sin(s.bump * Math.PI);
        rp.copy(place(scr, s.lx, ly, s.lz + 0.01 * s.peek));
        _rq.setFromEuler(_e.set(-s.lean, scr.yaw, s.roll, 'YXZ'));

        if (open) {
          // its cell in the fan, filled row by row from the top left; a short last row is centred
          const k = s.k, row = Math.floor(k / cols), inRow = row < rows - 1 ? cols : scr.count - row * cols;
          const col = k - row * cols;
          const x = fan.cx + (col - (inRow - 1) / 2) * cellW;
          const y = fan.cy + ((rows - 1) / 2 - row) * cellH - 0.03;
          const bob = 0.008 * Math.sin(fan.t * 1.5 + i * 1.7);
          fp.copy(_o).addScaledVector(_ax, x).addScaledVector(_ay, y + bob).addScaledVector(_az, -fan.D);
          // the hit box sits at the resting cell (no bob, no grow), so nothing shifts under the cursor
          s.floatM ??= new THREE.Matrix4();
          (s.floatHalf ??= new THREE.Vector3()).set(cellW / 2, cellH / 2, 0.02);
          s.floatM.compose(_p.copy(fp).addScaledVector(_ay, -bob), _fq, _s);
          // the hovered one grows and comes forward
          const e = ss(s.lift);
          fp.addScaledVector(_az, FORWARD * e);
          // faces you, each with its own small tilt
          _q.setFromEuler(_e.set(0.03 * Math.sin(i * 2.3), 0.05 * Math.sin(i * 3.1), (0.045 * Math.sin(i * 5.7)) * (1 - e)));
          _q.premultiply(_fq);
          if (f > 0) outThenFloat(rp, _rq, fp, _q, s.fl);
          s.mesh.scale.setScalar(1 + (fan.fs * (1 + GROW * e) - 1) * f);
          s.floatScale = fan.fs;
        } else {
          if (f > 0) {
            // on its way home: same path, back
            fp.copy(s.lastFloat ?? rp);
            _q.copy(s.lastFloatQ ?? _rq);
            outThenFloat(rp, _rq, fp, _q, s.fl);
          }
          s.mesh.scale.setScalar(1 + ((s.floatScale ?? 1) - 1) * f);
        }
        if (open) {
          (s.lastFloat ??= new THREE.Vector3()).copy(fp);
          (s.lastFloatQ ??= new THREE.Quaternion()).copy(_q);
        }
        s.mesh.position.set(rp.x, rp.y + s.drop * 0.7, rp.z);
        s.mesh.quaternion.copy(_rq);
      });
    },
  });
}

// Straight up out of the crate first (still leaning in its slot, so it slides past the records either
// side and over the crate's front), then it flies to its spot in the fan and turns to face you.
// rp/rq: the pose in the crate (changed in place), fp/fq: the floating pose, fl: 0..1 along the way.
const _up = new THREE.Vector3(), _d = new THREE.Vector3();
function outThenFloat(rp, rq, fp, fq, fl) {
  const up = ss(fl / 0.4), go = ss((fl - 0.24) / 0.76);
  _up.copy(rp);
  _up.y += (SLEEVE + 0.08) * up;
  // across first, toward you last: the records rise one behind the other, so they part sideways before
  // they line up at the same depth (_az: toward the viewer, set in layout)
  _d.copy(fp).sub(_up);
  const dz = _d.dot(_az);
  _d.addScaledVector(_az, -dz);
  rp.copy(_up).addScaledVector(_d, go).addScaledVector(_az, dz * ss((fl - 0.5) / 0.5)).addScaledVector(_yUp, 0.06 * Math.sin(Math.PI * go));
  rq.slerp(fq, ss((fl - 0.7) / 0.3)); // turns once it is well away from the others
}
const _yUp = new THREE.Vector3(0, 1, 0);

// crate-space point -> rack space
const _out = new THREE.Vector3();
function place(cr, lx, ly, lz) {
  const c = Math.cos(cr.yaw), s = Math.sin(cr.yaw);
  return _out.set(cr.x + lx * c + lz * s, ly, cr.z - lx * s + lz * c);
}
