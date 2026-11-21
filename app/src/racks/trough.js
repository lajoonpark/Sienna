// Station 0, the crate-digging table in the hall: sleeves stand in a long trough leaning in a row
// with their spines to you; slide the cursor along it and the one under it lifts out with a neighbour
// each side, fanned like a hand of cards, all three facing you. The one under the cursor is always the
// middle one and wears the paper tag with the name: move left and the right one drops back, a new one
// rises on the left and the three slide over. Click to play it.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, WOOD, SLEEVE, THICK, springTo } from './common.js';

const TABLE_H = 0.78;
const LEN = 2.1;               // trough length
const BASE = TABLE_H + 0.03;   // sleeves stand on the trough floor
const REST_YAW = 1.3;          // mostly edge-on, a sliver of cover showing
const LIFT = 0.3, FORWARD = 0.22, TILT_BACK = -0.26;
const FAN = 3, FAN_GAP = 0.27; // records up at once, and how far apart they stand
const SLIDE = 16;              // spring rate of a record sliding to its new place in the fan
const RISE = SLEEVE + 0.05;    // straight up this far first, clear of the row, before it turns and fans out
const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function buildTable(g) {
  const { dark: wood, top, light: trough } = WOOD;
  addBox(g, [2.4, 0.05, 0.62], top, [0, TABLE_H - 0.025, 0]);
  for (const x of [-1.1, 1.1]) for (const z of [-0.24, 0.24]) addBox(g, [0.07, TABLE_H - 0.05, 0.07], wood, [x, (TABLE_H - 0.05) / 2, z]);
  addBox(g, [2.3, 0.1, 0.02], wood, [0, TABLE_H - 0.1, 0.29]); // apron (the sign hangs here)
  addBox(g, [2.25, 0.03, 0.5], wood, [0, 0.18, 0]);            // low shelf
  // the trough: floor, a low lip in front, a taller back and rounded ends
  addBox(g, [LEN, 0.03, 0.42], trough, [0, TABLE_H + 0.015, -0.02]);
  addBox(g, [LEN, 0.07, 0.02], trough, [0, TABLE_H + 0.05, 0.19]);
  addBox(g, [LEN, 0.17, 0.02], trough, [0, TABLE_H + 0.1, -0.23]);
  for (const s of [-1, 1]) addBox(g, [0.025, 0.22, 0.44], trough, [s * (LEN / 2 + 0.012), TABLE_H + 0.11, -0.02]);
}

export function createTroughRack({ onPick }) {
  const core = createRackCore({ onPick, sign: { w: 1.2, h: 0.15 } });
  const rest = new THREE.Matrix4();

  return core.contract({
    setup(c) {
      buildTable(c.root);
      c.sign.mesh.position.set(0, TABLE_H - 0.1, 0.302);
      c.tag.mesh.position.set(0.02, -SLEEVE / 2 - 0.03, THICK / 2 + 0.004);
      c.tag.mesh.rotation.z = 0.035;
    },

    items(c, items) {
      const n = items.length;
      const spacing = Math.min(0.085, (LEN - 0.3) / Math.max(1, n - 1));
      const x0 = -((n - 1) * spacing) / 2 - 0.03;
      const r = rng(n * 31 + (c.shelf?.title?.length ?? 0));
      c.sleeves.forEach((s, i) => {
        s.x = x0 + i * spacing + (r() - 0.5) * 0.01;
        s.yaw = REST_YAW + (r() - 0.5) * 0.08;
        s.roll = (r() - 0.5) * 0.05;
        s.fx = s.fxT = s.x;       // where it stands in the fan: now, and heading to
        s.slot = s.slotT = 0;     // its place in the fan (-1 left, 0 middle, 1 right): now, and heading to
        // thin slab in front of the row (like reading x off the front plane), a little past the ends
        const a = i === 0 ? -0.12 : 0, b = i === n - 1 ? 0.12 : 0;
        const y0 = BASE - 0.05, y1 = BASE + SLEEVE + LIFT + 0.12;
        rest.makeTranslation(s.x + (b + a) / 2, (y0 + y1) / 2, 0.06);
        c.picker.add(i, rest, [spacing / 2 + (b - a) / 2, (y1 - y0) / 2, 0.04]);
      });
    },

    // Three up at once, centred on the record under the cursor. The cursor is always read against the
    // row (the fan never catches it), so a straight move sideways scrolls through the records instead of
    // stopping on the fan. At either end of the row there is no neighbour to raise on that side.
    layout(c, dt, camera, hovered) {
      const anchor = c.sleeves[hovered];
      c.sleeves.forEach((s, i) => {
        const k = i - hovered;
        const inFan = !!anchor && Math.abs(k) <= (FAN - 1) / 2;
        if (inFan) {
          s.slotT = k;
          s.fxT = anchor.x + k * FAN_GAP;
          // just coming up: it starts at its place. Already up: it slides there. A record leaving keeps
          // its last place, so it drops from where it stands.
          if ((s.fanA ?? 0) < 0.02) { s.slot = k; s.slotV = 0; s.fx = s.fxT; s.fxV = 0; }
        }
        springTo(s, 'slot', s.slotT, dt, SLIDE);
        springTo(s, 'fx', s.fxT, dt, SLIDE);
        springTo(s, 'fanA', inFan ? 1 : 0, dt, inFan ? 15 : 18, inFan ? 0.8 : 1, 0);
        s.held = s.fanA;
        const slot = s.slot;
        // the rest of the row stays put: the fan rises straight up out of it, so nothing needs to make
        // room (rows leaning away by different amounts ran into each other)
        s.pushed = 0;
        const F = s.fanA, L = s.lift, m = s.mesh;
        const fx = s.fx;
        // pulled straight up out of the row first (still edge-on, so it slides past its neighbours),
        // then it turns, steps forward and settles into the fan; down the same way
        // (the three spread apart and step forward before they turn and settle, so they never turn into each
        // other or come down onto the row)
        const up = ss(F / 0.45), spread = ss((F - 0.25) / 0.42), T = ss((F - 0.4) / 0.6); // overlapping, so it never stops between steps
        const fanY = LIFT * (1 - 0.12 * Math.abs(slot));
        m.position.set(
          (s.x + s.pushed) * (1 - spread) + fx * spread,
          BASE + SLEEVE / 2 + RISE * up + (fanY - RISE) * T + 0.04 * L + 0.045 * s.peek + 0.06 * Math.sin(s.bump * Math.PI) + s.drop * 0.7,
          -0.02 + (FORWARD + 0.05 * L - 0.03 * Math.abs(slot)) * spread, // in front of the row before it comes down
        );
        m.rotation.set(TILT_BACK * T, s.yaw * (1 - T) - slot * 0.12 * T, s.roll * (1 - T) - s.pushed * 1.6 * (1 - up) - slot * 0.09 * T);
      });
    },
  });
}
