// Shared sunken lounge corner, listening table, arched window, and courtyard vista.
// Used by both the full shop (shop.js) and the mini suitcase player (mini.js) so the
// small player looks out from the exact same room and furniture without duplicating geometry.
import * as THREE from 'three';
import { trs, mul, BRICK } from './kit.js';
import { brickWall, plasterPanel, lunetteShape, archHole, barrelVault, voussoirs, flagstones, PALETTES } from './masonry.js';
import { blk, rod, pottedPlant, railPlanter, bougainvillea } from './details.js';
import { crateOfRecords, turntable, sofa, rug, floorLamp, floorTree } from './interior.js';
import { cafeSet, stringLights } from './props.js';
import { toon } from './materials.js';
import { rng } from './rand.js';

export const PLASTER = '#ead6b4';
export const PAL = PALETTES.honey;

// Shared room coordinates (kept compatible with shop.js / nav.js routes).
export const LOUNGE = { y: -0.6, z0: -11, z1: -15, floorZ: -11.6, arch: { z: -13.2, w: 2.4, h: 3.0 } };
export const LOUNGE_VAULT = { vx: 3.3, spring: 3.0 };
export const LOUNGE_WINDOW = { x: 0, y: 0.3, w: 2.6, h: 3.0, deep: 0.6 };
export const STACKS = { x0: 3.8, x1: 11.8, z: -13, hw: 2, y: -0.6, spring: 4.4 };
export const GH = { x0: 7.0, x1: 12.0, xi0: 7.2, xi1: 11.8, z0: -15.2, z1: -24, y: 1.2, sx0: 8.3, sx1: 10.7, stairEnd: -17.9, eave: 4.8, ridge: 6.4, door: { x: 9.5, w: 1.4, h: 2.5 } };
export const GARDEN = { x0: -4.5, x1: 12.0, z0: -15.6, z1: -31, wall: 6.6, north: 7.6 };

// Side listening console beside the sofa near the arched window.
export const LISTENING_TABLE = {
  x: 2.02,
  y: LOUNGE.y,
  z: -14.48,
  w: 1.08,
  d: 0.60,
  h: 0.76,
  topY: LOUNGE.y + 0.76,
};
export const LOUNGE_LAMP = { x: 2.92, y: LOUNGE.y, z: -14.64 };

export function frame(o, along, normal) {
  const x = new THREE.Vector3(...along), z = new THREE.Vector3(...normal);
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...o);
}

// Lining for an arch opening through a wall of given thickness (local frame, from z=0 back).
export function reveal(M, o, depth, color = '#e0c9a0') {
  const r0 = o.w / 2, spring = o.y + o.h - r0, t = 0.09;
  const outer = new THREE.Shape();
  outer.moveTo(o.x - r0 - t, o.y - 0.05); outer.lineTo(o.x + r0 + t, o.y - 0.05); outer.lineTo(o.x + r0 + t, spring);
  outer.absarc(o.x, spring, r0 + t, 0, Math.PI, false); outer.closePath();
  outer.holes.push(archHole(o));
  const g = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, -depth);
  const m = new THREE.Mesh(g, toon(color));
  m.applyMatrix4(M);
  m.receiveShadow = true;
  return m;
}

// Terracotta floor tiles over a rectangle, floor at height y.
export function cotto(kit, x0, x1, z0, z1, seed, y = 0) {
  const r = rng(seed);
  const s = 0.4;
  for (let z = z0; z > z1 + 0.05; z -= s) {
    for (let x = x0; x < x1 - 0.05; x += s) {
      const w = Math.min(s, x1 - x), d = Math.min(s, z - z1);
      const c = new THREE.Color().setHSL((12 + r() * 12) / 360, 0.45 + r() * 0.15, 0.5 + r() * 0.12);
      kit.flag.add(trs(x + w / 2, y, z - d / 2, 0, (r() - 0.5) * 0.03, 0, w - 0.025, 0.35, d - 0.025), c);
    }
  }
  const under = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z0 - z1), toon('#d8c3a5'));
  under.rotation.x = -Math.PI / 2;
  under.position.set((x0 + x1) / 2, y - 0.005, (z0 + z1) / 2);
  under.receiveShadow = true;
  return under;
}

// An end wall of a vault in frame M: plaster lunette springing at `spring`, with a brick arch opening `o`.
export function lunetteWall(kit, out, M, w, spring, o, seed) {
  const sh = lunetteShape(w, spring);
  if (o) sh.holes.push(archHole(o));
  out.push(plasterPanel(sh, M, PLASTER));
  if (o) voussoirs(kit, M, rng(seed), PAL, o);
}

// A transverse wall between two rooms: plaster lunettes on both faces, a brick arch, lined opening.
export function crossWall(kit, out, z, wF, springF, wB, springB, o, seed, { y0F = 0, y0B = 0, depth = 0.5 } = {}) {
  const F = frame([-wF / 2, y0F, z], [1, 0, 0], [0, 0, 1]);
  const oF = { ...o, x: wF / 2, y: o.y - y0F };
  lunetteWall(kit, out, F, wF, springF - y0F, oF, seed);
  out.push(reveal(F, oF, depth));
  if (wB) {
    const B = frame([wB / 2, y0B, z - depth], [-1, 0, 0], [0, 0, -1]);
    lunetteWall(kit, out, B, wB, springB - y0B, { ...o, x: wB / 2, y: o.y - y0B }, seed + 1);
  }
}

// Plaster side walls of a room from z0 to z1 at x = ±hw, from floor y0 up past the vault spring (world).
export function sideWalls(kit, out, hw, z0, z1, spring, { y0 = 0, holes = [] } = {}) {
  for (const s of [-1, 1]) {
    const M = s < 0 ? frame([-hw, y0, z0], [0, 0, -1], [1, 0, 0]) : frame([hw, y0, z1], [0, 0, 1], [-1, 0, 0]);
    const sh = new THREE.Shape();
    const w = z0 - z1;
    sh.moveTo(0, -0.2); sh.lineTo(w, -0.2); sh.lineTo(w, spring - y0 + 0.3); sh.lineTo(0, spring - y0 + 0.3); sh.closePath();
    const mine = holes.filter((h) => h.side === s).map((h) => ({ type: 'arch', x: s < 0 ? z0 - h.z : h.z - z1, y: 0, w: h.w, h: h.h, ring: 0.26, depth: h.depth }));
    for (const o of mine) {
      sh.holes.push(archHole(o));
      voussoirs(kit, M, rng(Math.round(o.x * 10) + 7), PAL, o);
      if (o.depth) out.push(reveal(M, o, o.depth));
    }
    out.push(plasterPanel(sh, M, PLASTER));
    let a = 0;
    for (const b of [...mine.map((o) => [o.x - o.w / 2, o.x + o.w / 2]), [w, w]].sort((p, q) => p[0] - q[0])) {
      if (b[0] - a > 0.05) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(b[0] - a, 0.5, 0.03), toon('#d9a07a'));
        band.applyMatrix4(mul(M, trs((a + b[0]) / 2, 0.25, 0.03)));
        out.push(band);
      }
      a = Math.max(a, b[1]);
    }
  }
}

// White-painted glazing bars, stone sill, and sill ferns in the lounge's arched courtyard window.
export function buildLoungeWindow(kit) {
  const I = new THREE.Matrix4();
  const W = LOUNGE_WINDOW, r0 = W.w / 2, spring = W.y + W.h - r0, z = LOUNGE.z1 - W.deep / 2, bar = '#efe8da';
  for (const x of [-r0 / 2, 0, r0 / 2]) rod(kit, I, [W.x + x, W.y, z], [W.x + x, spring + Math.sqrt(r0 * r0 - x * x) - 0.02, z], 0.02, bar);
  for (const yy of [W.y + 0.95, spring]) rod(kit, I, [W.x - r0, yy, z], [W.x + r0, yy, z], 0.02, bar);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a0 = (Math.PI * i) / n, a1 = (Math.PI * (i + 1)) / n, k = r0 - 0.02;
    rod(kit, I, [W.x + Math.cos(a0) * k, spring + Math.sin(a0) * k, z], [W.x + Math.cos(a1) * k, spring + Math.sin(a1) * k, z], 0.02, bar);
  }
  blk(kit, I, W.x, W.y - 0.04, z, W.w + 0.14, 0.08, W.deep + 0.12, '#e2d4ba');
  for (const x of [-0.85, 0.85]) pottedPlant(kit, I, W.x + x, W.y, z - 0.05, 0.6, 149 + x, 'fern');
}

// Walnut listening console beside the sofa: overhanging tabletop, tapered legs with brass ferrules,
// a lower record storage shelf with a small crate and vinyl stack, and a terracotta plant on the right.
export function buildListeningTable(kit, T = LISTENING_TABLE) {
  const M = trs(T.x, T.y, T.z);
  const { w, d, h } = T;
  const topT = 0.044, apronH = 0.072, legW = 0.044, shelfY = 0.22;
  // Tabletop and recessed apron
  blk(kit, M, 0, h - topT / 2, 0, w, topT, d, '#855c39');
  blk(kit, M, 0, h - topT - apronH / 2, 0, w - 0.11, apronH, d - 0.11, '#5e3f25');
  // Four legs with brass foot ferrules
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = sx * (w / 2 - 0.068), lz = sz * (d / 2 - 0.068);
      blk(kit, M, lx, (h - topT) / 2, lz, legW, h - topT, legW, '#68462a');
      blk(kit, M, lx, 0.025, lz, legW + 0.004, 0.05, legW + 0.004, '#c9a85a');
    }
  }
  // Lower shelf with vinyl crate on the left and a neat small stack of sleeves on the right
  blk(kit, M, 0, shelfY, 0, w - 0.15, 0.028, d - 0.15, '#6e4a2d');
  crateOfRecords(kit, mul(M, trs(-0.22, shelfY + 0.014, 0.01)), 0.44, 0.36, 151);
  const sleevePalette = ['#c4673d', '#4c6684', '#d9b56c'];
  sleevePalette.forEach((col, i) => {
    blk(kit, M, 0.24, shelfY + 0.02 + i * 0.011, 0.01, 0.32, 0.009, 0.32, col, 0, 0.06 * (i - 1), 0);
  });
  // Terracotta plant on the back-right corner (keeps front-left clear for the suitcase / shop surface)
  pottedPlant(kit, M, w / 2 - 0.17, h, -d / 2 + 0.15, 0.44, 146, 'fern');
}

// Lounge interior core shared by shop.js and mini.js.
// capOpenings closes the adjacent hall and stacks passages invisibly behind/beside the lounge so sunlight
// in mini.html enters from the courtyard window and sky rather than flooding behind an unbuilt hall.
export function buildLoungeCore(kit, out, { capOpenings = false } = {}) {
  const L = LOUNGE, y = L.y, I = new THREE.Matrix4();
  const { vx, spring } = LOUNGE_VAULT;
  out.push(cotto(kit, -vx, vx, L.floorZ, L.z1, 2, y));
  sideWalls(kit, out, vx, L.z0, L.z1, spring, { y0: y, holes: [{ side: 1, z: L.arch.z, w: L.arch.w, h: L.arch.h, depth: STACKS.x0 - vx }] });
  out.push(barrelVault(kit, { spring, r: vx, z0: L.z0, z1: L.z1, seed: 40 }));
  crossWall(kit, out, L.z1, vx * 2, spring, 0, 0, { type: 'arch', y: LOUNGE_WINDOW.y, w: LOUNGE_WINDOW.w, h: LOUNGE_WINDOW.h, ring: 0.24 }, 50, { y0F: y, depth: LOUNGE_WINDOW.deep });
  buildLoungeWindow(kit);
  sofa(kit, frame([0, y, L.z1 + 0.55], [1, 0, 0], [0, 0, 1]), '#6a86a0', 2.4);
  rug(kit, trs(0, y, -13.4), 3.0, 2.2, 2);
  blk(kit, I, 0, y + 0.2, -13.6, 1.1, 0.4, 0.6, '#7a5634');
  turntable(kit, trs(0, y + 0.35, -13.6), { cabinet: false });
  buildListeningTable(kit);
  const lampBulb = floorLamp(kit, trs(LOUNGE_LAMP.x, y, LOUNGE_LAMP.z));
  out.push(lampBulb);
  pottedPlant(kit, I, 2.7, y, -11.95, 1.1, 148, 'monstera');

  if (capOpenings) {
    // Roof/wall shade caps for the adjoining hall (z > -11) and stacks (x > 3.8) so midday sun cannot leak through open seams.
    const capMat = toon(PLASTER);
    const addCap = (sx, sy, sz, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), capMat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.noStrokes = true;
      out.push(m);
    };
    addCap(12, 0.4, 11, 0, spring + vx + 0.2, -5.5);        // hall roof overhead (z -11 .. 0)
    addCap(12, 8.0, 0.4, 0, 3.0, -0.5);                    // street-side hall closure
    addCap(0.4, 8.0, 11, -5.5, 3.0, -5.5);                 // west hall wall
    addCap(8.4, 0.4, 6.0, STACKS.x0 + 4.0, STACKS.spring + STACKS.hw + 0.2, STACKS.z); // stacks roof
    addCap(0.4, 7.0, 6.0, STACKS.x1, 2.5, STACKS.z);       // stacks far east wall
    addCap(8.4, 7.0, 0.4, STACKS.x0 + 4.0, 2.5, -15.4);    // stacks south backing behind arch
    addCap(8.4, 7.0, 0.4, STACKS.x0 + 4.0, 2.5, -10.6);    // stacks north backing
  }
  return { lampBulb };
}

// A wall fountain in a blind arch (wall frame M, the arch at local x = u).
function fountain(kit, out, M, u) {
  blk(kit, M, u, 0.45, 0.35, 1.9, 0.9, 0.7, '#e2d4ba');
  const water = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: '#9fc3cc', transparent: true, opacity: 0.8 }));
  water.applyMatrix4(mul(M, trs(u, 0.86, 0.38)));
  out.push(water);
  const niche = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), toon('#c9a07a'));
  niche.applyMatrix4(mul(M, trs(u, 2.0, -0.18)));
  out.push(niche);
  kit.ball.add(mul(M, trs(u, 2.1, -0.05, 0, 0, 0, 0.35, 0.4, 0.3)), '#d8ccb6');
  rod(kit, M, [u, 1.95, 0.08], [u, 1.9, 0.3], 0.025, '#9a8a6a');
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.0, 6), new THREE.MeshBasicMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.7 }));
  spout.applyMatrix4(mul(M, trs(u, 1.4, 0.32)));
  out.push(spout);
}

// Climbing ivy: vines that wander up walls from the ground.
export function climbingIvy(kit, walls, h, seed, perWall = 7) {
  const r = rng(seed);
  for (const w of walls) {
    for (let v = 0; v < perWall; v++) {
      let a = 0.3 + r() * (w.len - 0.6);
      if (w.skip?.some(([s0, s1]) => a > s0 && a < s1)) continue;
      let y = 0;
      const top = h * (0.45 + r() * 0.5);
      const shoots = [];
      while (y < top) {
        a += (r() - 0.5) * 0.25;
        y += 0.07 + r() * 0.05;
        if (r() < 0.06) shoots.push([a, y]);
        for (let k = 0; k < 3; k++) {
          const da = a + (r() - 0.5) * 0.35, dy = y + (r() - 0.5) * 0.1;
          kit.leaf.add(trs(w.o[0] + w.u[0] * da, dy, w.o[2] + w.u[2] * da, r() * 3, r() * 6, r() * 3, 0.15, 0.06, 0.12), new THREE.Color().setHSL(0.27 + r() * 0.07, 0.45, 0.24 + r() * 0.16));
        }
      }
      for (const [sa, sy] of shoots) {
        let aa = sa, yy = sy;
        const dir = r() > 0.5 ? 1 : -1;
        for (let k = 0; k < 14; k++) {
          aa += dir * (0.06 + r() * 0.05); yy += (r() - 0.6) * 0.06;
          kit.leaf.add(trs(w.o[0] + w.u[0] * aa, yy, w.o[2] + w.u[2] * aa, r() * 3, r() * 6, r() * 3, 0.13, 0.05, 0.1), new THREE.Color().setHSL(0.28 + r() * 0.06, 0.45, 0.28 + r() * 0.14));
        }
      }
    }
  }
}

// A raised brick bed planted thick with low shrubs and flowers.
function raisedBed(kit, x, z, w, d, seed) {
  const I = new THREE.Matrix4(), r = rng(seed), h = 0.45;
  blk(kit, I, x, h / 2, z, w, h, d, '#b8784e');
  blk(kit, I, x, h + 0.02, z, w + 0.06, 0.05, d + 0.06, '#d9c3a0');
  blk(kit, I, x, h + 0.03, z, w - 0.1, 0.04, d - 0.1, '#5a3d2a');
  const flowers = ['#d63a2f', '#e86a8a', '#f2cc3a', '#f4efe4', '#9a6ad0'];
  for (let i = 0; i < (w * d) / 0.12; i++) {
    const px = x + (r() - 0.5) * (w - 0.2), pz = z + (r() - 0.5) * (d - 0.2), k = 0.6 + r() * 0.6;
    for (let j = 0; j < 9; j++) kit.leaf.add(trs(px + (r() - 0.5) * 0.25 * k, h + 0.08 + r() * 0.3 * k, pz + (r() - 0.5) * 0.25 * k, r() * 2, r() * 6, r() * 2, 0.15 * k, 0.06 * k, 0.11 * k), new THREE.Color().setHSL(0.26 + r() * 0.08, 0.45, 0.26 + r() * 0.16));
    if (r() < 0.6) { const c = flowers[Math.floor(r() * flowers.length)]; for (let j = 0; j < 4; j++) kit.bead.add(trs(px + (r() - 0.5) * 0.2 * k, h + 0.3 * k + r() * 0.12, pz + (r() - 0.5) * 0.2 * k, 0, 0, 0, 0.08, 0.07, 0.08), c); }
  }
}

// Courtyard enclosure & planting visible through the lounge window (shared by shop.js and mini.js).
export function buildCourtyardVista(root, kit, out) {
  const G = GARDEN, I = new THREE.Matrix4(), rose = PALETTES.rose;
  const ch = Math.round(G.wall / BRICK.row) * BRICK.row, nh = Math.round(G.north / BRICK.row) * BRICK.row;
  root.add(flagstones(kit, { x0: G.x0, x1: GH.x0, z0: G.z1, z1: G.z0, seed: 13, gutter: false, pal: rose }));
  const N = frame([GH.x0, 0, G.z0], [-1, 0, 0], [0, 0, -1]);
  const win = { type: 'arch', x: GH.x0 - LOUNGE_WINDOW.x, y: LOUNGE_WINDOW.y, w: LOUNGE_WINDOW.w, h: LOUNGE_WINDOW.h, ring: 0.22 };
  out.push(...brickWall(kit, N, { w: GH.x0 - G.x0, y1: nh, seed: 64, pal: rose, openings: [win] }));
  const W = frame([G.x0, 0, G.z0], [0, 0, -1], [1, 0, 0]);
  const fu = G.z0 - -24.0;
  out.push(...brickWall(kit, W, { w: G.z0 - G.z1, y1: ch, seed: 61, pal: rose, openings: [{ type: 'arch', x: fu, y: 0.9, w: 1.6, h: 2.3, ring: 0.22 }] }));
  fountain(kit, out, W, fu);
  out.push(...brickWall(kit, frame([G.x0, 0, G.z1], [1, 0, 0], [0, 0, 1]), { w: G.x1 - G.x0, y1: ch, seed: 62, pal: rose }));
  out.push(...brickWall(kit, frame([G.x1, 0, G.z1], [0, 0, 1], [-1, 0, 0]), { w: GH.z1 - G.z1, y1: ch, seed: 63, pal: rose }));
  climbingIvy(kit, [
    { o: [G.x0 + 0.1, 0, G.z0], u: [0, 0, -1], len: G.z0 - G.z1, skip: [[fu - 1.5, fu + 1.5]] },
    { o: [G.x0, 0, G.z1 + 0.1], u: [1, 0, 0], len: G.x1 - G.x0 },
    { o: [G.x1 - 0.1, 0, G.z1], u: [0, 0, 1], len: GH.z1 - G.z1 },
  ], ch, 66);

  pottedPlant(kit, I, 0.8, 0, -20.6, 2.6, 201, 'lemon');
  floorTree(kit, trs(G.x0 + 0.7, 0, G.z1 + 0.75), 2.6, 281);
  floorTree(kit, trs(G.x1 - 0.7, 0, G.z1 + 0.75), 2.4, 282);
  [[-3.9, -17.2, 'geranium', 1.3], [-3.9, -19.6, 'fern', 1.2], [-3.95, -21.6, 'monstera', 1.5], [-3.9, -26.4, 'bush', 1.6],
    [-3.9, -28.6, 'snake', 1.1], [-1.4, -30.4, 'geranium', 1.3], [1.6, -30.4, 'fern', 1.2], [6.2, -30.4, 'monstera', 1.4],
    [6.5, -16.3, 'fern', 1.1], [3.6, -16.25, 'geranium', 1.2], [-2.6, -16.25, 'snake', 1.0]].forEach(([x, z, kind, size], i) => pottedPlant(kit, I, x, 0, z, size, 290 + i, kind));
  blk(kit, I, LOUNGE_WINDOW.x, 0.22, G.z0 - 0.35, LOUNGE_WINDOW.w + 0.3, 0.44, 0.5, '#c4673d');
  railPlanter(kit, frame([LOUNGE_WINDOW.x + (LOUNGE_WINDOW.w + 0.1) / 2, 0.5, G.z0 - 0.5], [-1, 0, 0], [0, 0, -1]), LOUNGE_WINDOW.w + 0.1, 300);
  bougainvillea(kit, N, win, 211);
  bougainvillea(kit, W, { x: fu, y: 0.9, w: 1.6, h: 2.3 }, 212);
  raisedBed(kit, -1.6, -24.3, 2.6, 0.9, 301);
  raisedBed(kit, 4.7, -21.6, 0.9, 2.4, 302);
  floorTree(kit, trs(5.4, 0, -18.0), 2.8, 303);
  cafeSet(kit, trs(-2.4, 0, -27.6, 0, 0.4, 0), 202, null);
  cafeSet(kit, trs(-1.6, 0, -18.6, 0, -0.3, 0), 214, null);
  root.add(stringLights(kit, [G.x0, 4.4, -17.2], [GH.x0 - 0.2, 4.6, -29.6], { orderBase: 0.2, n: 18 }));
  root.add(stringLights(kit, [G.x0, 4.6, -29.6], [GH.x0 - 0.2, 4.4, -17.0], { orderBase: 0.22, n: 18 }));
  return { ch, rose };
}
