// Street furniture and life: scooters, bicycle, café tables, umbrellas, market stall, crates of
// records and fruit, chalkboard, bench, lamp posts, string lights and washing lines.
// All built in world space (or a given parent matrix) with the instanced kit.
import * as THREE from 'three';
import { trs, mul } from './kit.js';
import { blk, rod } from './details.js';
import { rng } from './rand.js';
import { glass as flagGlass } from './materials.js';
import { registerLamp, glowMesh } from './env.js';

const C = new THREE.Color();
const I = new THREE.Matrix4();
const place = (x, y, z, ry = 0) => trs(x, y, z, 0, ry, 0);

export function scooter(kit, M, color) {
  const dark = '#2a2422', chrome = '#c9c2b8';
  // rounded rear body, floorboard, leg shield, front mudguard
  kit.ball.add(mul(M, trs(0, 0.55, -0.35, 0, 0, 0, 0.62, 0.55, 0.9)), color);
  blk(kit, M, 0, 0.3, 0.15, 0.36, 0.08, 0.7, color);
  blk(kit, M, 0, 0.72, 0.5, 0.48, 0.85, 0.1, color, -0.25);
  kit.ball.add(mul(M, trs(0, 0.38, 0.68, 0, 0, 0, 0.26, 0.28, 0.45)), color);
  blk(kit, M, 0, 0.9, -0.3, 0.34, 0.1, 0.62, dark);
  rod(kit, M, [0, 0.4, 0.68], [0, 1.15, 0.55], 0.03, chrome);
  rod(kit, M, [-0.32, 1.15, 0.55], [0.32, 1.15, 0.55], 0.025, chrome);
  kit.ball.add(mul(M, trs(0, 1.1, 0.62, 0, 0, 0, 0.16, 0.12, 0.08)), '#f4ead0');
  for (const z of [-0.5, 0.68]) {
    kit.disc.add(mul(M, trs(0, 0.2, z, 0, 0, Math.PI / 2, 0.4, 0.12, 0.4)), '#1c1a1c');
    kit.disc.add(mul(M, trs(0, 0.2, z, 0, 0, Math.PI / 2, 0.2, 0.13, 0.2)), chrome);
  }
}

export function bicycle(kit, M, color = '#3f6e6a') {
  const tyre = '#1f1d1c';
  for (const z of [-0.5, 0.5]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, b = ((i + 1) / 16) * Math.PI * 2;
      rod(kit, M, [0, 0.34 + Math.sin(a) * 0.32, z + Math.cos(a) * 0.32], [0, 0.34 + Math.sin(b) * 0.32, z + Math.cos(b) * 0.32], 0.02, tyre);
    }
  }
  rod(kit, M, [0, 0.34, -0.5], [0, 0.62, -0.1], 0.02, color);
  rod(kit, M, [0, 0.34, -0.1], [0, 0.62, -0.1], 0.02, color);
  rod(kit, M, [0, 0.34, -0.1], [0, 0.34, -0.5], 0.02, color);
  rod(kit, M, [0, 0.62, -0.1], [0, 0.64, 0.38], 0.022, color);
  rod(kit, M, [0, 0.34, -0.1], [0, 0.64, 0.38], 0.022, color);
  rod(kit, M, [0, 0.34, 0.5], [0, 0.85, 0.4], 0.02, color);
  rod(kit, M, [-0.25, 0.88, 0.38], [0.25, 0.88, 0.38], 0.018, '#2a2420');
  blk(kit, M, 0, 0.7, -0.12, 0.12, 0.05, 0.22, '#4a3424');
  // front basket with a baguette and flowers
  blk(kit, M, 0, 0.82, 0.62, 0.32, 0.2, 0.26, '#b08a52');
  rod(kit, M, [0.05, 0.85, 0.55], [-0.02, 1.08, 0.66], 0.035, '#d9a85a');
  for (let i = 0; i < 5; i++) kit.ball.add(mul(M, trs(-0.08 + i * 0.04, 0.96, 0.66, 0, 0, 0, 0.07, 0.07, 0.07)), i % 2 ? '#e8b23a' : '#d63a2f');
}

export function cafeSet(kit, M, seed = 1, umbrella = '#c4673d') {
  const r = rng(seed);
  const iron = '#2b2a2e';
  rod(kit, M, [0, 0, 0], [0, 0.72, 0], 0.03, iron);
  kit.disc.add(mul(M, trs(0, 0.02, 0, 0, 0, 0, 0.4, 0.04, 0.4)), iron);
  kit.disc.add(mul(M, trs(0, 0.74, 0, 0, 0, 0, 0.7, 0.04, 0.7)), '#e9e1d0');
  // cups and a small vase
  kit.disc.add(mul(M, trs(0.15, 0.79, 0.1, 0, 0, 0, 0.08, 0.07, 0.08)), '#ffffff');
  kit.disc.add(mul(M, trs(-0.12, 0.79, -0.08, 0, 0, 0, 0.08, 0.07, 0.08)), '#ffffff');
  kit.ball.add(mul(M, trs(0, 0.85, 0, 0, 0, 0, 0.08, 0.14, 0.08)), '#6a86a0');
  kit.ball.add(mul(M, trs(0, 0.97, 0, 0, 0, 0, 0.12, 0.1, 0.12)), '#e8b23a');
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI + (r() - 0.5) * 0.6;
    const cm = mul(M, trs(Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62, 0, a + Math.PI, 0));
    for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) rod(kit, cm, [dx, 0, dz], [dx * 0.9, 0.45, dz * 0.9], 0.015, iron);
    blk(kit, cm, 0, 0.46, 0, 0.4, 0.04, 0.4, '#3f6e6a');
    blk(kit, cm, 0, 0.72, -0.19, 0.4, 0.42, 0.04, '#3f6e6a', 0.1);
  }
  if (umbrella) {
    rod(kit, M, [0, 0.7, 0], [0, 2.35, 0], 0.025, '#d8ccb6');
    // square market parasol with a cream fringe
    kit.cone.add(mul(M, trs(0, 2.3, 0, 0, Math.PI / 4, 0, 2.5, 0.42, 2.5)), umbrella);
    for (const [dx, dz, ry] of [[0, 0.88, 0], [0, -0.88, 0], [0.88, 0, Math.PI / 2], [-0.88, 0, Math.PI / 2]]) blk(kit, M, dx, 2.04, dz, 1.76, 0.1, 0.02, '#f2e8d4', 0, ry, 0);
  }
}

// Open wooden crate; filler: 'records' | 'fruit' | 'lemons'
export function crate(kit, M, w, d, h, seed, filler) {
  const r = rng(seed);
  const wood = C.setHSL(0.08, 0.45, 0.5 + r() * 0.1).clone();
  blk(kit, M, 0, 0.02, 0, w, 0.04, d, wood);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      blk(kit, M, s * (w / 2 - 0.015), 0.08 + k * (h / 2), 0, 0.03, h / 2 - 0.03, d, wood);
      blk(kit, M, 0, 0.08 + k * (h / 2), s * (d / 2 - 0.015), w, h / 2 - 0.03, 0.03, wood);
    }
  }
  if (filler === 'records') {
    const n = Math.floor(w / 0.05);
    for (let i = 0; i < n; i++) {
      const c = C.setHSL(r(), 0.35 + r() * 0.4, 0.35 + r() * 0.35).clone();
      blk(kit, M, -w / 2 + 0.06 + i * ((w - 0.12) / n), h * 0.62, 0, 0.018, 0.31, d - 0.08, c, 0, 0, -0.35 + (r() - 0.5) * 0.15);
    }
  } else {
    const color = filler === 'lemons' ? ['#f2cc3a', '#e8b23a', '#7cb356'] : ['#d9552b', '#e8b23a', '#7cb356', '#b8322a'];
    const base = color[Math.floor(r() * color.length)];
    for (let i = 0; i < w * d * 220; i++) {
      kit.ball.add(mul(M, trs((r() - 0.5) * (w - 0.1), h * 0.85 + r() * 0.08, (r() - 0.5) * (d - 0.1), 0, 0, 0, 0.1, 0.1, 0.1)), C.set(base).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.1).clone());
    }
  }
}

// Market stall: trestle table with crates and a striped canvas awning on poles.
export function stall(kit, M, seed, stripe = '#c4673d') {
  const r = rng(seed);
  const wood = '#8a5a32';
  for (const [x, z] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]]) rod(kit, M, [x, 0, z], [x, 0.78, z], 0.03, wood);
  blk(kit, M, 0, 0.8, 0, 2.0, 0.05, 0.8, '#a8743a');
  for (let i = 0; i < 3; i++) crate(kit, mul(M, trs(-0.62 + i * 0.62, 0.83, 0, 0, 0, -0.05)), 0.55, 0.62, 0.22, seed * 10 + i, i === 1 ? 'lemons' : 'fruit');
  for (const x of [-1.0, 1.0]) rod(kit, M, [x, 0, -0.45], [x, 2.3, -0.45], 0.03, wood);
  const n = 8;
  for (let i = 0; i < n; i++) {
    blk(kit, M, -1.05 + (i + 0.5) * (2.1 / n), 2.15, 0.1, 2.1 / n, 0.03, 1.3, i % 2 ? stripe : '#f2e8d4', 0.35);
  }
  for (let i = 0; i < n * 2; i++) {
    kit.disc.add(mul(M, trs(-1.05 + (i + 0.5) * (2.1 / (n * 2)), 1.9, 0.72, Math.PI / 2, 0, 0, 0.13, 0.02, 0.13)), Math.floor(i / 2) % 2 ? stripe : '#f2e8d4');
  }
  void r;
}

export function chalkboard(kit, M) {
  const wood = '#7a5634';
  for (const s of [-1, 1]) {
    const L = mul(M, trs(0, 0, s * 0.22, s * 0.22, 0, 0));
    blk(kit, L, 0, 0.5, 0, 0.6, 0.85, 0.04, wood);
    blk(kit, L, 0, 0.52, s * 0.025, 0.5, 0.72, 0.01, '#2c3530');
    // chalk scribbles: a little record and lines of "text"
    kit.disc.add(mul(L, trs(0, 0.7, s * 0.032, Math.PI / 2, 0, 0, 0.2, 0.004, 0.2)), '#e8e4da');
    kit.disc.add(mul(L, trs(0, 0.7, s * 0.034, Math.PI / 2, 0, 0, 0.07, 0.004, 0.07)), '#e86a5a');
    for (let k = 0; k < 3; k++) blk(kit, L, -0.02 + (k % 2) * 0.03, 0.44 - k * 0.09, s * 0.032, 0.3 - k * 0.06, 0.018, 0.004, '#e8e4da');
  }
}

export function bench(kit, M) {
  const wood = '#8a5a32', iron = '#2b2a2e';
  for (const x of [-0.7, 0.7]) {
    blk(kit, M, x, 0.22, 0, 0.05, 0.44, 0.45, iron);
    blk(kit, M, x, 0.65, -0.2, 0.05, 0.45, 0.05, iron);
  }
  for (let i = 0; i < 3; i++) blk(kit, M, 0, 0.45, -0.15 + i * 0.14, 1.6, 0.04, 0.11, wood);
  for (let i = 0; i < 2; i++) blk(kit, M, 0, 0.62 + i * 0.16, -0.22, 1.6, 0.11, 0.04, wood, -0.1);
}

// Iron lamp post with a lantern head.
export function lampPost(kit, M, order) {
  const iron = '#24211f';
  const meshes = [];
  kit.disc.add(mul(M, trs(0, 0.1, 0, 0, 0, 0, 0.36, 0.2, 0.36)), iron);
  rod(kit, M, [0, 0.1, 0], [0, 3.1, 0], 0.06, iron);
  rod(kit, M, [0, 2.6, 0], [0, 2.6, 0], 0.08, iron);
  kit.cone.add(mul(M, trs(0, 3.65, 0, 0, Math.PI / 4, 0, 0.5, 0.2, 0.5)), iron);
  blk(kit, M, 0, 3.12, 0, 0.26, 0.05, 0.26, iron);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) blk(kit, M, dx * 0.12, 3.35, dz * 0.12, 0.025, 0.45, 0.025, iron);
  const glassMat = flagGlass(new THREE.MeshBasicMaterial({ color: '#5a4c40' }));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.22), glassMat);
  glass.applyMatrix4(mul(M, trs(0, 3.35, 0)));
  const halo = glowMesh('sprite', 1.6, 0.75);
  halo.position.set(0, 3.35, 0).applyMatrix4(M);
  const pool = glowMesh('plane', 5, 0.3);
  pool.applyMatrix4(mul(M, trs(0, 0.1, 0, -Math.PI / 2, 0, 0)));
  pool.scale.set(5, 5, 1);
  const light = new THREE.PointLight('#ffb866', 6, 9, 1.6);
  light.position.set(0, 3.3, 0).applyMatrix4(M);
  registerLamp({ glass: glassMat, glows: [halo, pool], light, order });
  meshes.push(glass, halo, pool, light);
  return meshes;
}

function catenary(a, b, sag, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

// A string of little bulbs between two world points. Bulbs are lamps that switch on at dusk.
export function stringLights(kit, a, b, { sag = 0.6, n = 14, orderBase = 0.5 } = {}) {
  const pts = catenary(new THREE.Vector3(...a), new THREE.Vector3(...b), sag, n * 2);
  for (let i = 0; i < pts.length - 1; i++) rod(kit, I, pts[i].toArray(), pts[i + 1].toArray(), 0.008, '#2b2a2e');
  const glassMat = new THREE.MeshBasicMaterial({ color: '#5a4c40' });
  const geo = new THREE.SphereGeometry(0.055, 8, 6);
  const group = new THREE.Group();
  const glows = [];
  for (let i = 1; i < pts.length - 1; i += 2) {
    const m = new THREE.Mesh(geo, glassMat);
    m.position.copy(pts[i]).y -= 0.07;
    group.add(m);
    const h = glowMesh('sprite', 0.45, 0.55, '#ffc070');
    h.position.copy(m.position);
    group.add(h);
    glows.push(h);
  }
  registerLamp({ glass: glassMat, glows, order: orderBase });
  return group;
}

// Washing line between two world points with clothes pegged on.
export function washingLine(kit, a, b, seed = 1) {
  const r = rng(seed);
  const pts = catenary(new THREE.Vector3(...a), new THREE.Vector3(...b), 0.35, 16);
  for (let i = 0; i < pts.length - 1; i++) rod(kit, I, pts[i].toArray(), pts[i + 1].toArray(), 0.006, '#e8e2d4');
  const colors = ['#f4efe4', '#6a86a0', '#d9552b', '#e8b23a', '#f2c4c4', '#8a9a5b', '#ffffff'];
  const dir = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
  const ry = Math.atan2(dir.x, dir.z) - Math.PI / 2;
  for (let i = 2; i < pts.length - 2; i++) {
    if (r() < 0.3) continue;
    const w = 0.25 + r() * 0.3, h = 0.3 + r() * 0.4;
    const p = pts[i];
    blk(kit, I, p.x, p.y - h / 2, p.z, w, h, 0.015, colors[Math.floor(r() * colors.length)], (r() - 0.5) * 0.15, ry, (r() - 0.5) * 0.1);
  }
}

// Little bunting flags.
export function bunting(kit, a, b, seed = 2) {
  const r = rng(seed);
  const pts = catenary(new THREE.Vector3(...a), new THREE.Vector3(...b), 0.5, 22);
  for (let i = 0; i < pts.length - 1; i++) rod(kit, I, pts[i].toArray(), pts[i + 1].toArray(), 0.006, '#e8e2d4');
  const dir = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
  const ry = Math.atan2(dir.x, dir.z);
  const colors = ['#d9552b', '#e8b23a', '#3f6e6a', '#f2e8d4', '#6a86a0', '#c4673d'];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    kit.cone.add(trs(p.x, p.y - 0.12, p.z, Math.PI, ry, 0, 0.22, 0.24, 0.02), colors[(i + Math.floor(r() * 2)) % colors.length]);
  }
}

export { place };
