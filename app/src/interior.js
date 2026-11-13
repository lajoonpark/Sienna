// Furniture and fittings for the shop interior, built with the instanced kit in a local frame M
// (x right, y up, +z towards the viewer/front of the piece).
import * as THREE from 'three';
import { trs, mul } from './kit.js';
import { blk, rod, chain, fernFronds, BRASS } from './details.js';
import { rng } from './rand.js';
import { glass } from './materials.js';

const C = new THREE.Color();
const SLEEVE_H = [0.04, 0.12, 0.58, 0.33, 0.95, 0.07, 0.5, 0.75];

// a decor record sleeve (kit.sleeve: no strokes pinned to it, Oil paint keeps its own colour; kit.js)
function sleeve(kit, M, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
  kit.sleeve.add(mul(M, trs(x, y, z, rx, ry, rz, sx, sy, sz)), color);
}

function sleeveColor(r) {
  return C.setHSL(SLEEVE_H[Math.floor(r() * SLEEVE_H.length)] + (r() - 0.5) * 0.05, 0.3 + r() * 0.4, 0.3 + r() * 0.45).clone();
}

// Open shelving packed with record spines; every so often a sleeve is turned to face out.
export function recordShelf(kit, M, { w, h = 2.4, levels = 4, d = 0.38, seed = 1, wood = '#9a6a3c' }) {
  const r = rng(seed);
  const gap = (h - 0.1) / levels;
  let spine = 0;
  for (const x of [-w / 2, w / 2]) blk(kit, M, x, h / 2, 0, 0.05, h, d, wood);
  blk(kit, M, 0, h / 2, -d / 2 + 0.01, w, h, 0.02, C.set(wood).offsetHSL(0, -0.1, -0.12).clone());
  for (let l = 0; l <= levels; l++) blk(kit, M, 0, 0.05 + l * gap, 0, w, 0.04, d, wood);
  for (let l = 0; l < levels; l++) {
    const y = 0.07 + l * gap;
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.08) {
      if (r() < 0.04 && x < w / 2 - 0.4) {
        // face-out sleeve leaning on the row
        sleeve(kit, M, x + 0.17, y + 0.16, d / 2 - 0.05, 0.31, 0.31, 0.01, sleeveColor(r), -0.12, 0, 0);
        kit.disc.add(mul(M, trs(x + 0.17, y + 0.16, d / 2 - 0.06, Math.PI / 2 - 0.12, 0, 0, 0.1, 0.004, 0.1)), sleeveColor(r));
        x += 0.36;
        continue;
      }
      if (r() < 0.05) { x += 0.08; continue; }
      const t = 0.012 + r() * 0.012;
      const lean = x > w / 2 - 0.3 && r() < 0.3 ? 0.25 : (r() - 0.5) * 0.04;
      // fronts a few millimetres in or out, spine by spine: flush, two leaning neighbours' fronts overlapped in
      // one plane and fought over which was in front (they flickered as the camera moved)
      sleeve(kit, M, x + t / 2, y + 0.155, 0.02 + (((++spine * 5) % 7) - 3) * 0.0015, t, 0.31, 0.31, sleeveColor(r), 0, 0, lean);
      x += t + 0.003;
    }
  }
}

// A table with two open crates of records to flip through.
export function binTable(kit, M, seed) {
  const wood = '#8a5a32';
  for (const [x, z] of [[-0.8, -0.32], [0.8, -0.32], [-0.8, 0.32], [0.8, 0.32]]) blk(kit, M, x, 0.36, z, 0.07, 0.72, 0.07, wood);
  blk(kit, M, 0, 0.72, 0, 1.8, 0.05, 0.8, '#a8743a');
  blk(kit, M, 0, 0.2, 0, 1.7, 0.03, 0.7, wood);
  const r = rng(seed);
  for (let k = 0; k < 2; k++) {
    const cm = mul(M, trs(-0.43 + k * 0.86, 0.745, 0, 0, (r() - 0.5) * 0.06, 0));
    crateOfRecords(kit, cm, 0.8, 0.66, seed * 3 + k);
  }
  // a couple of crates under the table
  crateOfRecords(kit, mul(M, trs(-0.4, 0.22, 0.02, 0, 0.05, 0)), 0.7, 0.6, seed * 3 + 7);
}

export function crateOfRecords(kit, M, w, d, seed) {
  const r = rng(seed);
  const h = 0.3;
  const wood = C.setHSL(0.08, 0.4, 0.55 + r() * 0.1).clone();
  blk(kit, M, 0, 0.015, 0, w, 0.03, d, wood);
  for (const s of [-1, 1]) {
    blk(kit, M, s * (w / 2 - 0.015), h / 2, 0, 0.03, h, d, wood);
    blk(kit, M, 0, h / 2, s * (d / 2 - 0.015), w, h, 0.03, wood);
  }
  const n = Math.floor((d - 0.08) / 0.035);
  for (let i = 0; i < n; i++) {
    const tilt = i === n - 1 ? 0.5 : -0.15 + (r() - 0.5) * 0.1;
    sleeve(kit, M, 0, 0.26, -d / 2 + 0.06 + i * 0.035, w - 0.08, 0.31, 0.012, sleeveColor(r), tilt, 0, 0);
  }
}

// Turntable on a little cabinet.
export function turntable(kit, M, { cabinet = true, color = '#7a5634' } = {}) {
  let y = 0;
  if (cabinet) {
    blk(kit, M, 0, 0.35, 0, 0.9, 0.7, 0.5, color);
    for (let i = 0; i < 4; i++) blk(kit, M, -0.3 + i * 0.2, 0.33, 0.255, 0.012, 0.5, 0.01, '#2a2420');
    y = 0.7;
  }
  blk(kit, M, 0, y + 0.05, 0, 0.5, 0.1, 0.38, '#d8c8aa');
  kit.disc.add(mul(M, trs(-0.05, y + 0.11, 0, 0, 0, 0, 0.32, 0.02, 0.32)), '#1d1b1d');
  kit.disc.add(mul(M, trs(-0.05, y + 0.122, 0, 0, 0, 0, 0.11, 0.01, 0.11)), '#e86a3a');
  rod(kit, M, [0.18, y + 0.13, -0.12], [0.02, y + 0.13, 0.06], 0.008, '#c9c2b8');
  return y + 0.1;
}

export function speaker(kit, M, h = 0.9) {
  blk(kit, M, 0, h / 2, 0, 0.4, h, 0.36, '#6b4a2c');
  kit.disc.add(mul(M, trs(0, h * 0.62, 0.185, Math.PI / 2, 0, 0, 0.28, 0.01, 0.28)), '#2a2622');
  kit.disc.add(mul(M, trs(0, h * 0.25, 0.185, Math.PI / 2, 0, 0, 0.18, 0.01, 0.18)), '#2a2622');
}

export function armchair(kit, M, color = '#b84a3a') {
  blk(kit, M, 0, 0.22, 0, 0.8, 0.3, 0.8, color);
  blk(kit, M, 0, 0.42, 0.04, 0.62, 0.14, 0.66, C.set(color).offsetHSL(0, 0, 0.06).clone());
  blk(kit, M, 0, 0.7, -0.33, 0.8, 0.75, 0.18, color, -0.12);
  for (const s of [-1, 1]) blk(kit, M, s * 0.36, 0.52, 0, 0.14, 0.3, 0.78, color);
  for (const [x, z] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) blk(kit, M, x, 0.04, z, 0.06, 0.08, 0.06, '#3a2a1a');
}

export function sofa(kit, M, color = '#6a86a0', w = 2.0) {
  blk(kit, M, 0, 0.22, 0, w, 0.3, 0.85, color);
  for (let i = 0; i < 3; i++) blk(kit, M, -w / 3 + (i * w) / 3, 0.43, 0.04, w / 3 - 0.04, 0.14, 0.68, C.set(color).offsetHSL(0, 0, 0.06).clone());
  blk(kit, M, 0, 0.7, -0.35, w, 0.75, 0.18, color, -0.1);
  for (const s of [-1, 1]) blk(kit, M, s * (w / 2 - 0.07), 0.52, 0, 0.14, 0.32, 0.84, color);
  blk(kit, M, -w / 3, 0.62, -0.2, 0.36, 0.34, 0.12, '#e8b23a', -0.3, 0.2, 0);
  blk(kit, M, w / 3, 0.62, -0.2, 0.36, 0.34, 0.12, '#f2e8d4', -0.3, -0.2, 0);
}

export function rug(kit, M, w, d, seed = 1) {
  const r = rng(seed);
  const cols = ['#b84a3a', '#e8b23a', '#3f6e6a', '#f2e8d4', '#6a3a4a'];
  blk(kit, M, 0, 0.04, 0, w, 0.02, d, cols[0]);
  const bands = 7;
  for (let i = 0; i < bands; i++) {
    const c = cols[(i + 1) % cols.length];
    blk(kit, M, 0, 0.052, -d / 2 + (i + 0.5) * (d / bands), w - 0.2, 0.01, (d / bands) * 0.45, c);
    for (let k = 0; k < 5; k++) kit.cone.add(mul(M, trs(-w / 2 + 0.3 + k * ((w - 0.6) / 4), 0.056, -d / 2 + (i + 0.5) * (d / bands), 0, Math.PI / 4, 0, 0.18, 0.01, 0.18)), cols[(i + 3) % cols.length]);
  }
  void r;
}

// Floor lamp with a fabric shade (the bulb is a glow mesh returned for the caller to add).
export function floorLamp(kit, M) {
  kit.disc.add(mul(M, trs(0, 0.02, 0, 0, 0, 0, 0.3, 0.04, 0.3)), '#2b2a2e');
  rod(kit, M, [0, 0, 0], [0, 1.5, 0], 0.015, '#2b2a2e');
  kit.pot.add(mul(M, trs(0, 1.55, 0, Math.PI, 0, 0, 0.42, 0.3, 0.42)), '#f2d9a8');
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe2a8' }));
  bulb.applyMatrix4(mul(M, trs(0, 1.48, 0)));
  return bulb;
}

// A hanging plant on brass chains (Lajoon, 2026-11-13: chains, not cords): a plate and hook at y = 0, one chain
// down by `drop` to a ring, three short chains from the ring to the pot's rim. kind: 'pothos' (trailing vines),
// 'pearls' (string-of-pearls strands, long) or 'fern' (arching fronds); left out, the seed picks one.
const HANGING = ['pothos', 'fern', 'pearls'];
export function hangingPlant(kit, M, drop, seed, kind) {
  const r = rng(seed);
  kind = kind ?? HANGING[Math.floor(r() * HANGING.length)];
  kit.disc.add(mul(M, trs(0, -0.005, 0, 0, 0, 0, 0.13, 0.02, 0.13)), BRASS);
  chain(kit, M, [0, -0.01, 0], [0, -drop + 0.02, 0], { phase: r() * Math.PI });
  // the ring the three short chains hang from, lying flat
  kit.link.add(mul(M, trs(0, -drop, 0, Math.PI / 2, 0, 0, 0.075, 0.075, 0.05)), BRASS);
  const rimY = -drop - 0.21;
  for (const a of [0, 2.1, 4.2]) chain(kit, M, [Math.cos(a) * 0.03, -drop, Math.sin(a) * 0.03], [Math.cos(a) * 0.14, rimY, Math.sin(a) * 0.14], { link: 0.045, width: 0.027, wire: 0.007, phase: a });
  kit.pot.add(mul(M, trs(0, -drop - 0.3, 0, 0, 0, 0, 0.3, 0.2, 0.3)), ['#c4673d', '#e0d6c4', '#d9b38a'][Math.floor(r() * 3)]);
  const P = mul(M, trs(0, -drop - 0.2, 0)); // the pot's top
  // a low mound of foliage over the rim
  const mound = kind === 'pearls' ? 0 : 26;
  for (let i = 0; i < mound; i++) {
    const a = r() * Math.PI * 2, rad = r() * 0.16;
    kit.leaf.add(mul(P, trs(Math.cos(a) * rad, 0.05 + r() * 0.1, Math.sin(a) * rad, r() * 2, r() * 6, r() * 2, 0.14, 0.05, 0.1)), C.setHSL(0.28 + r() * 0.06, 0.45, 0.3 + r() * 0.14).clone());
  }
  if (kind === 'fern') fernFronds(kit, P, r, { n: 18, len: 0.6, droop: 0.55 });
  else if (kind === 'pearls') {
    // string of pearls: a cushion of beads over the rim, then long strands of beads straight down
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.15;
      kit.bead.add(mul(P, trs(Math.cos(a) * rad, 0.02 + r() * 0.05, Math.sin(a) * rad, 0, 0, 0, 0.026, 0.026, 0.026)), C.setHSL(0.25 + r() * 0.05, 0.38, 0.42 + r() * 0.12).clone());
    }
    for (let v = 0; v < 14; v++) {
      const a = r() * Math.PI * 2;
      let x = Math.cos(a) * (0.13 + r() * 0.03), z = Math.sin(a) * (0.13 + r() * 0.03);
      const len = 10 + Math.floor(r() * 18);
      for (let k = 0; k < len; k++) {
        x += (r() - 0.5) * 0.012; z += (r() - 0.5) * 0.012;
        kit.bead.add(mul(P, trs(x, -0.04 - k * 0.042, z, 0, 0, 0, 0.026, 0.026, 0.026)), C.setHSL(0.25 + r() * 0.05, 0.38, 0.42 + r() * 0.12).clone());
      }
    }
  } else {
    for (let v = 0; v < 8; v++) {
      const a = r() * Math.PI * 2;
      const len = 4 + Math.floor(r() * 9);
      for (let k = 0; k < len; k++) {
        const t = k / len;
        kit.leaf.add(mul(P, trs(Math.cos(a) * (0.16 + t * 0.08), -0.1 - k * 0.075, Math.sin(a) * (0.16 + t * 0.08), r() * 2, r() * 6, r() * 2, 0.08, 0.04, 0.07)), C.setHSL(0.28 + r() * 0.05, 0.45, 0.32 + r() * 0.12).clone());
      }
    }
  }
}

// Trailing ivy hanging over an edge (a gallery rail), from x0..x1 at height y, local frame.
export function trailingIvy(kit, M, x0, x1, y, seed) {
  const r = rng(seed);
  for (let x = x0; x < x1; x += 0.12 + r() * 0.2) {
    const len = 3 + Math.floor(r() * 10);
    for (let k = 0; k < len; k++) kit.leaf.add(mul(M, trs(x + (r() - 0.5) * 0.06, y - k * 0.07, (r() - 0.5) * 0.06, r() * 2, r() * 6, r() * 2, 0.09, 0.04, 0.08)), C.setHSL(0.28 + r() * 0.06, 0.45, 0.3 + r() * 0.12).clone());
  }
}

// Tall fiddle-leaf / olive style tree in a big pot.
export function floorTree(kit, M, height, seed) {
  const r = rng(seed);
  kit.pot.add(mul(M, trs(0, 0.3, 0, 0, 0, 0, 0.6, 0.6, 0.6)), ['#c4673d', '#e0d6c4', '#4a4a52'][Math.floor(r() * 3)]);
  rod(kit, M, [0, 0.55, 0], [0.05, height, 0], 0.04, '#6b4a2c');
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2;
    const y = height * (0.45 + r() * 0.6);
    const rad = 0.2 + r() * 0.45;
    kit.leaf.add(mul(M, trs(Math.cos(a) * rad, y, Math.sin(a) * rad, r() * 1.5, a, r() * 0.8, 0.36, 0.08, 0.26)), C.setHSL(0.27 + r() * 0.06, 0.45, 0.26 + r() * 0.16).clone());
  }
}

// Spiral staircase: centre pole, wedge treads, helical handrail. Rises `rise` over `turn` radians.
export function spiralStair(kit, M, { radius = 0.8, rise = 3.0, turn = Math.PI * 1.5, start = 0, steps = 15 }) {
  const iron = '#2b2a2e';
  rod(kit, M, [0, 0, 0], [0, rise + 1.0, 0], 0.06, iron);
  const prev = [];
  for (let i = 0; i < steps; i++) {
    const a = start + (turn * (i + 0.5)) / steps;
    const y = (rise * (i + 1)) / steps;
    const T = mul(M, trs(0, y - 0.03, 0, 0, -a, 0));
    blk(kit, T, radius / 2 + 0.03, 0, 0, radius - 0.05, 0.05, 0.34, '#8a5a32');
    rod(kit, T, [radius - 0.04, 0, 0], [radius - 0.04, 0.9, 0], 0.012, iron);
    prev.push(new THREE.Vector3(Math.cos(a) * (radius - 0.04), y + 0.9, Math.sin(a) * (radius - 0.04)));
  }
  for (let i = 0; i < prev.length - 1; i++) rod(kit, M, prev[i].toArray(), prev[i + 1].toArray(), 0.022, '#6b4a2c');
}

// Pendant lamp hanging from height `top` by `hang`; returns glow meshes and a point light.
export function pendant(kit, M, top, hang, { light = true, shade = '#3f6e6a' } = {}) {
  rod(kit, M, [0, top, 0], [0, top - hang, 0], 0.008, '#2b2a2e');
  kit.pot.add(mul(M, trs(0, top - hang - 0.15, 0, Math.PI, 0, 0, 0.55, 0.3, 0.55)), shade);
  const out = [];
  // the shade's warm lining, where the bulb lights it: the shade's own underside (green on the hall's) lit that
  // close glowed lime, and Oil paint laid greenish dabs round the light (Lajoon, 2026-11-13)
  const lining = new THREE.Mesh(new THREE.CircleGeometry(0.27, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f7dfae' }));
  lining.applyMatrix4(mul(M, trs(0, top - hang - 0.302, 0)));
  out.push(lining);
  // the bulb is glass (materials.js glass): no dabs, shown as drawn
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glass(new THREE.MeshBasicMaterial({ color: '#ffe2a8' })));
  bulb.applyMatrix4(mul(M, trs(0, top - hang - 0.28, 0)));
  out.push(bulb);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffb85a', transparent: true, opacity: 0.14, depthWrite: false }));
  halo.applyMatrix4(mul(M, trs(0, top - hang - 0.3, 0)));
  out.push(halo);
  if (light) {
    const l = new THREE.PointLight('#ffb866', 4.5, 10, 1.5);
    l.position.set(0, top - hang - 0.4, 0).applyMatrix4(M);
    out.push(l);
  }
  return out;
}

// Library ladder leaning on a rail.
export function ladder(kit, M, h = 3.0) {
  const wood = '#7a5634';
  for (const x of [-0.22, 0.22]) rod(kit, M, [x, 0, 0.6], [x, h, 0], 0.025, wood);
  for (let i = 1; i < h / 0.3; i++) {
    const t = (i * 0.3) / h;
    rod(kit, M, [-0.22, i * 0.3, 0.6 * (1 - t)], [0.22, i * 0.3, 0.6 * (1 - t)], 0.018, wood);
  }
}
