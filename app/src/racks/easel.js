// Station 3, on the shop counter: a painted three-step display stand with an easel frame behind
// it that carries the shelf's name. Big covers lean on the steps (three per step, nine to a page);
// a longer shelf is turned with the painted "more" / "back" plates on the stand's front. Hover
// brings a cover out over the counter's edge, in front of every row: the front step's come straight
// forward, the ones behind rise over the row in front first.
import * as THREE from 'three';
import { createRackCore, createSign, addBox, paint, WOOD, THICK } from './common.js';

const SZ = 0.33;
const PER_STEP = 3, PAGE = 9;
const PITCH = 0.36;
const TIER_Y = [0.12, 0.30, 0.48];      // step tops: front, middle, back
const TIER_Z = [0.2, 0.0, -0.2];        // step centres
const STEP_D = 0.2;
const LEAN = 0.2;
const WASH = ['#4f7a74', '#d9a64a', '#b4503a'];
const HOVER_Z = 0.38;                   // every hovered record ends here, in front of the front row
const FRONT_UP = 0.04;                  // a front record only rises enough to clear its step's lip
const CLEAR = 0.05;                     // m a record rising from behind clears the row in front by
const LIFT_RATE = [1, 0.8, 0.7];        // per step: further to travel, so a little slower
const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function createEaselRack({ onPick }) {
  const core = createRackCore({ onPick, sign: { w: 1.0, h: 0.13 }, tag: { w: 0.36, h: 0.106 }, sleeve: { size: SZ, thick: 0.014 } });
  const rest = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const restP = new THREE.Vector3();
  let page = 0, pages = 1;
  const plates = {};   // 'back' / 'more' -> { cold, hot }

  function furniture(g) {
    addBox(g, [1.2, 0.1, 0.66], WOOD.dark, [0, 0.05, 0]);
    TIER_Y.forEach((y, k) => {
      const z = TIER_Z[k];
      addBox(g, [1.1, y - 0.1, STEP_D], paint(WASH[k]), [0, 0.1 + (y - 0.1) / 2, z]);
      addBox(g, [1.14, 0.02, STEP_D + 0.03], WOOD.pale, [0, y + 0.01 - 0.0, z + 0.005]);
      addBox(g, [1.1, 0.03, 0.02], WOOD.light, [0, y + 0.035, z + STEP_D / 2 - 0.005]);   // lip
    });
    // the easel: two posts leaning back a touch, a cross bar and a painted header plank
    for (const s of [-1, 1]) {
      const post = addBox(g, [0.045, 0.95, 0.045], WOOD.dark, [s * 0.53, 0.1 + 0.475, -0.32]);
      post.rotation.x = -0.04;
    }
    addBox(g, [1.14, 0.05, 0.04], WOOD.dark, [0, 0.62, -0.335]);
    addBox(g, [1.16, 0.17, 0.03], WOOD.top, [0, 0.9, -0.335]);
    addBox(g, [1.2, 0.025, 0.05], WOOD.light, [0, 0.995, -0.335]);
    // small paper plates on the front board: "back" and "more"
    for (const [id, x, text] of [['back', -0.4, 'back'], ['more', 0.4, 'more']]) {
      const mk = (color) => { const s = createSign({ w: 0.26, h: 0.085, color, res: 512 }); s.setTitle(text); s.mesh.position.set(x, 0.05, 0.333); g.add(s.mesh); core.waitFor.push(s); return s; };
      plates[id] = { cold: mk('#2d3158'), hot: mk('#b4503a'), x };
      plates[id].hot.mesh.visible = false;
    }
  }

  // Put this page's sleeves on their steps and rebuild the hit boxes.
  function place(c, dropIn) {
    const n = c.sleeves.length;
    c.picker.clear();
    const m = Math.min(PAGE, n - page * PAGE);
    const tiers = m <= 3 ? [0] : m <= 6 ? [1, 0] : [2, 1, 0];
    const half = SZ / 2;
    c.sleeves.forEach((s, i) => {
      s.hidden = Math.floor(i / PAGE) !== page;
      if (s.hidden) return;
      const j = i - page * PAGE;
      const row = Math.floor(j / PER_STEP), col = j % PER_STEP;
      const inRow = Math.min(PER_STEP, m - row * PER_STEP);
      const tier = tiers[row];
      const t = LEAN + (s.seed % 5 - 2) * 0.012;
      s.tilt = t;
      s.tier = tier;
      s.liftRate = LIFT_RATE[tier];
      s.rx = (col - (inRow - 1) / 2) * PITCH;
      s.ry = TIER_Y[tier] + 0.035 + half * Math.cos(t);
      s.rz = TIER_Z[tier] + STEP_D / 2 - 0.05 - half * Math.sin(t);
      s.roll = ((s.seed * 7) % 5 - 2) * 0.01;
      if (dropIn) s.appear = -j * 0.04;
      e.set(-t, 0, s.roll, 'YXZ');
      q.setFromEuler(e);
      rest.compose(v.set(s.rx, s.ry, s.rz), q, one);
      c.picker.add(i, rest, [half + 0.01, half + 0.01, THICK / 2 + 0.03]);
    });
    for (const [id, x] of [['back', -0.4], ['more', 0.4]]) {
      const on = id === 'back' ? page > 0 : page < pages - 1;
      plates[id].cold.mesh.visible = on;
      plates[id].avail = on;
      if (on) { rest.makeTranslation(x, 0.05, 0.34); c.picker.add(id === 'back' ? 1000 : 1001, rest, [0.14, 0.05, 0.05]); }
    }
  }

  return core.contract({
    setup(c) {
      furniture(c.root);
      c.sign.mesh.position.set(0, 0.9, -0.318);
      c.tag.mesh.position.set(0.02, -SZ / 2 - 0.03, THICK / 2 + 0.004);
      c.tag.mesh.rotation.z = 0.035;
    },

    items(c, items) {
      pages = Math.max(1, Math.ceil(items.length / PAGE));
      page = 0;
      place(c, false);
    },

    control(c, id) {
      const next = id === 0 ? page - 1 : page + 1;
      if (next < 0 || next >= pages) return;
      page = next;
      c.sleeves.forEach((s) => { s.lift = 0; s.liftV = 0; });
      place(c, true);
    },

    layout(c, dt) {
      const cam = c.camLocal;
      c.sleeves.forEach((s) => {
        if (s.hidden) return;
        const L = s.lift, m = s.mesh;
        restP.set(s.rx, s.ry + 0.04 * s.peek + 0.06 * Math.sin(s.bump * Math.PI), s.rz + 0.03 * s.peek);
        const hoverY = s.tier === 0 ? s.ry + FRONT_UP : s.ry + (0.44 - s.ry) * 0.6;
        let T, y;
        if (s.tier === 0) {
          // front step: straight out, with only a small early rise over the lip
          T = ss(L);
          y = restP.y + (hoverY - restP.y) * ss(L / 0.35);
        } else {
          // a step behind: up until its bottom edge clears the tops of the row in front, forward over
          // them, and down to its hover height only once it is past them
          const half = SZ / 2;
          const frontTop = TIER_Y[s.tier - 1] + 0.035 + SZ * Math.cos(LEAN);
          const peak = restP.y + frontTop + CLEAR - (s.ry - half * Math.cos(s.tilt));
          T = ss((L - 0.35) / 0.45);
          y = restP.y + (peak - restP.y) * ss(L / 0.45) + (hoverY - peak) * ss((L - 0.7) / 0.3);
        }
        m.position.set(s.rx, y, restP.z + (HOVER_Z - restP.z) * T);
        m.position.y += s.drop * 0.7;
        const face = -Math.atan2(cam.y - m.position.y, Math.max(0.3, cam.z - m.position.z));
        m.rotation.set(-s.tilt * (1 - T) + face * T, 0, s.roll * (1 - T));
        m.scale.setScalar(1 + 0.05 * T);
      });
      for (const [id, k] of [['back', 0], ['more', 1]]) {
        const p = plates[id];
        const hot = p.avail && c.control === k;
        p.cold.mesh.visible = p.avail && !hot;
        p.hot.mesh.visible = hot;
        p.hot.mesh.scale.setScalar(1.1);
      }
    },
  });
}
