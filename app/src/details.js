// Facade details, built in a wall's local frame (x along the wall, y up, +z out of the face,
// face at z = 0): windows with louvred shutters, doors, balconies, lanterns, eaves, drainpipes,
// flower boxes and pots. Small repeated parts go through the instanced kit.
import * as THREE from 'three';
import { trs, mul, LINK } from './kit.js';
import { toon, glass as flagGlass } from './materials.js';
import { rng } from './rand.js';
import { registerLamp, registerWindow, glowMesh } from './env.js';

const C = new THREE.Color();

// block in local frame: centre (x,y,z), size (sx,sy,sz), optional rotation
export function blk(kit, M, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
  kit.block.add(mul(M, trs(x, y, z, rx, ry, rz, sx, sy, sz)), color);
}

// rod between two local points
// Rods up to THIN_ROD (railings, balusters, cords, wires) go to kit.wire: see kit.js.
export const THIN_ROD = 0.036;
export function rod(kit, M, a, b, radius, color, part = radius <= THIN_ROD ? 'wire' : 'rod') {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const dir = B.clone().sub(A);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(radius * 2, len, radius * 2));
  kit[part].add(mul(M, m), color);
}

// A chain of interlocking oval links from local point a to b (kit.link), each link turned 90 degrees about the
// chain from the one before. link = outer length, width = outer width, wire = wire thickness (metres).
export const BRASS = '#c9a85a';
const _chQ = new THREE.Quaternion(), _chT = new THREE.Quaternion(), _chM = new THREE.Matrix4(), _chY = new THREE.Vector3(0, 1, 0);
export function chain(kit, M, a, b, { link = 0.065, width = 0.038, wire = 0.009, color = BRASS, phase = 0 } = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  dir.normalize();
  const outer = 2 * (LINK.r + LINK.tube);
  const s = new THREE.Vector3(width / outer, link / outer, wire / (2 * LINK.tube));
  // links overlap by their wire at both ends: the next one's end passes through this one's hole
  const pitch = link - 2 * (2 * LINK.tube * s.y) - wire * 0.5;
  const n = Math.max(1, Math.round((len - link) / pitch) + 1);
  const step = n > 1 ? (len - link) / (n - 1) : 0;
  _chQ.setFromUnitVectors(_chY, dir);
  const base = new THREE.Color(color), c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const p = A.clone().addScaledVector(dir, link / 2 + k * step);
    _chT.setFromAxisAngle(_chY, phase + (k % 2) * Math.PI / 2);
    _chM.compose(p, _chQ.clone().multiply(_chT), s);
    // the turned links catch the light a little differently
    kit.link.add(mul(M, _chM), c.copy(base).offsetHSL(0, 0, k % 2 ? -0.05 : 0.02));
  }
}

export const SHUTTER_COLORS =['#5d7a52', '#3f6e6a', '#7a4a30', '#6a86a0', '#8a9a5b', '#a0553a'];
const WOOD = ['#6b4a2c', '#5a3d24', '#7a5634', '#4f3a2a'];

// One louvred shutter leaf. side: -1 = left leaf (hinged on the left edge), +1 = right.
function shutterLeaf(kit, M, o, side, angle, color) {
  const lw = o.w / 2, h = o.h;
  const hinge = trs(o.x + side * o.w / 2, o.y + h / 2, 0.03, 0, side * angle, 0);
  const L = mul(M, hinge);
  const cx = -side * lw / 2;
  blk(kit, L, cx - side * (lw / 2 - 0.03), 0, 0, 0.06, h, 0.05, color);
  blk(kit, L, cx + side * (lw / 2 - 0.03), 0, 0, 0.06, h, 0.05, color);
  blk(kit, L, cx, h / 2 - 0.04, 0, lw, 0.08, 0.05, color);
  blk(kit, L, cx, -h / 2 + 0.04, 0, lw, 0.08, 0.05, color);
  blk(kit, L, cx, 0, 0, lw, 0.06, 0.05, color);
  const n = Math.floor((h - 0.2) / 0.075);
  const c2 = C.set(color).offsetHSL(0, 0, -0.04).clone();
  for (let i = 0; i < n; i++) {
    const y = -h / 2 + 0.1 + (i + 0.5) * ((h - 0.2) / n);
    if (Math.abs(y) < 0.04) continue;
    kit.slat.add(mul(L, trs(cx, y, 0, -0.6, 0, 0, lw - 0.1, 0.012, 0.07)), c2);
  }
}

// A window in an already-cut opening. opts: shutters ('open'|'half'|'closed'|null), color, box (flower box),
// curtain, frame (plaster surround colour), sill, lit order.
export function windowUnit(kit, M, o, opts = {}) {
  const r = rng(opts.seed ?? 1);
  const meshes = [];
  const wood = opts.wood ?? '#f0e6d2';
  // glass recessed into the wall, its own material so it can light up in the evening
  const glassMat = flagGlass(new THREE.MeshBasicMaterial({ color: '#6e7a86' }));
  registerWindow(glassMat, { order: r() });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.type === 'arch' ? o.h - o.w / 2 : o.h), glassMat);
  glass.applyMatrix4(mul(M, trs(o.x, o.y + (o.type === 'arch' ? (o.h - o.w / 2) / 2 : o.h / 2), -0.17)));
  meshes.push(glass);
  if (o.type === 'arch') {
    const fan = new THREE.Mesh(new THREE.CircleGeometry(o.w / 2, 16, 0, Math.PI), glassMat);
    fan.applyMatrix4(mul(M, trs(o.x, o.y + o.h - o.w / 2, -0.17)));
    meshes.push(fan);
  }
  // casement frame and glazing bars
  const fh = o.type === 'arch' ? o.h - o.w / 2 : o.h;
  const fz = -0.14;
  blk(kit, M, o.x - o.w / 2 + 0.04, o.y + fh / 2, fz, 0.08, fh, 0.06, wood);
  blk(kit, M, o.x + o.w / 2 - 0.04, o.y + fh / 2, fz, 0.08, fh, 0.06, wood);
  blk(kit, M, o.x, o.y + 0.04, fz, o.w, 0.08, 0.06, wood);
  blk(kit, M, o.x, o.y + fh - 0.04, fz, o.w, 0.08, 0.06, wood);
  blk(kit, M, o.x, o.y + fh / 2, fz, 0.05, fh, 0.05, wood);
  for (let k = 1; k < 3; k++) blk(kit, M, o.x, o.y + (fh * k) / 3, fz, o.w, 0.035, 0.04, wood);
  // curtain drawn to one side
  if (opts.curtain) {
    const cw = o.w * (0.3 + r() * 0.2);
    const side = r() > 0.5 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      blk(kit, M, o.x + side * (o.w / 2 - cw / 2) + (i - 1) * cw * 0.3, o.y + fh / 2, -0.155, cw * 0.36, fh - 0.12, 0.02, opts.curtain);
    }
  }
  // sill
  if (opts.sill !== false) blk(kit, M, o.x, o.y - 0.05, 0.05, o.w + 0.24, 0.09, 0.3, opts.sillColor ?? '#e9dcc2');
  // painted surround on plaster walls
  if (opts.frame) {
    const t = 0.13;
    blk(kit, M, o.x - o.w / 2 - t / 2, o.y + o.h / 2, 0.025, t, o.h + t, 0.04, opts.frame);
    blk(kit, M, o.x + o.w / 2 + t / 2, o.y + o.h / 2, 0.025, t, o.h + t, 0.04, opts.frame);
    blk(kit, M, o.x, o.y + o.h + t / 2, 0.025, o.w + t * 2, t, 0.04, opts.frame);
  }
  if (opts.shutters) {
    const color = opts.color ?? SHUTTER_COLORS[Math.floor(r() * SHUTTER_COLORS.length)];
    const ang = { open: Math.PI - 0.06, half: 1.9 + r() * 0.6, closed: 0.02 }[opts.shutters];
    const so = { ...o, h: fh };
    shutterLeaf(kit, M, so, -1, opts.shutters === 'half' ? ang : ang, color);
    shutterLeaf(kit, M, so, 1, opts.shutters === 'half' ? Math.PI - 0.06 : ang, color);
  }
  if (opts.box) flowerBox(kit, M, o.x, o.y - 0.02, 0.32, o.w + 0.1, opts.seed ?? 1, opts.box);
  return meshes;
}

// Window box with leaves and flowers. flowers: CSS colour of the blooms.
export function flowerBox(kit, M, x, y, z, w, seed, flowers = '#d63a2f') {
  const r = rng(seed + 31);
  blk(kit, M, x, y + 0.13, z, w, 0.24, 0.28, '#8a4f2c');
  for (let i = 0; i < w * 26; i++) {
    const lx = x + (r() - 0.5) * w * 0.95;
    kit.leaf.add(mul(M, trs(lx, y + 0.3 + r() * 0.1, z + (r() - 0.5) * 0.2, r(), r() * 6, r(), 0.16, 0.06, 0.12)), C.setHSL(0.27 + r() * 0.08, 0.45, 0.32 + r() * 0.12).clone());
  }
  // trailing ivy over the front
  for (let i = 0; i < w * 6; i++) {
    const lx = x + (r() - 0.5) * w;
    const len = 2 + Math.floor(r() * 5);
    for (let k = 0; k < len; k++) kit.leaf.add(mul(M, trs(lx + (r() - 0.5) * 0.05, y + 0.1 - k * 0.07, z + 0.15, r(), r() * 6, r(), 0.09, 0.05, 0.08)), C.setHSL(0.28, 0.45, 0.3 + r() * 0.1).clone());
  }
  for (let i = 0; i < w * 12; i++) {
    const c = C.set(flowers).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.12).clone();
    kit.ball.add(mul(M, trs(x + (r() - 0.5) * w * 0.9, y + 0.38 + r() * 0.14, z + (r() - 0.5) * 0.2, 0, 0, 0, 0.1, 0.09, 0.1)), c);
  }
}

// A plank door in a recess, with a stone step. o is the opening.
export function doorUnit(kit, M, o, { color = '#5a3d24', seed = 1, step = true, open = 0 } = {}) {
  const r = rng(seed + 7);
  const h = o.type === 'arch' ? o.h - o.w / 2 : o.h;
  const n = Math.max(4, Math.round(o.w / 0.16));
  const pw = o.w / n;
  const leafs = open > 0 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const c = C.set(color).offsetHSL(0, 0, (r() - 0.5) * 0.06).clone();
    blk(kit, M, o.x - o.w / 2 + pw * (i + 0.5), o.y + h / 2, -0.14, pw - 0.012, h - 0.02, 0.06, c);
  }
  // ledges and iron studs
  for (const y of [0.25, h / 2, h - 0.25]) blk(kit, M, o.x, o.y + y, -0.1, o.w - 0.06, 0.1, 0.03, C.set(color).offsetHSL(0, 0, -0.06).clone());
  if (o.type === 'arch') {
    const fanMat = toon(C.set(color).offsetHSL(0, 0, -0.04).getStyle());
    const fan = new THREE.Mesh(new THREE.CircleGeometry(o.w / 2, 16, 0, Math.PI), fanMat);
    fan.applyMatrix4(mul(M, trs(o.x, o.y + h, -0.15)));
    return [fan, ...(step ? [] : [])];
  }
  if (step) blk(kit, M, o.x, 0.08, 0.2, o.w + 0.4, 0.16, 0.45, '#d8ccb6');
  blk(kit, M, o.x + o.w * 0.3, o.y + h * 0.48, -0.08, 0.04, 0.12, 0.05, '#2a2420');
  void leafs;
  return [];
}

// A balcony slab on corbels with a wrought-iron railing.
export function balcony(kit, M, x, y, w, { seed = 1, plants = true } = {}) {
  const r = rng(seed + 3);
  const d = 0.65;
  blk(kit, M, x, y, d / 2, w, 0.14, d, '#e2d4ba');
  for (const cx of [-w / 2 + 0.25, 0, w / 2 - 0.25]) {
    blk(kit, M, x + cx, y - 0.16, 0.2, 0.14, 0.2, 0.36, '#d8c8aa');
    blk(kit, M, x + cx, y - 0.3, 0.1, 0.12, 0.14, 0.16, '#d8c8aa');
  }
  const iron = '#2b2a2e';
  const top = y + 0.95;
  rod(kit, M, [x - w / 2 + 0.03, top, d - 0.04], [x + w / 2 - 0.03, top, d - 0.04], 0.025, iron);
  rod(kit, M, [x - w / 2 + 0.03, y + 0.12, d - 0.04], [x + w / 2 - 0.03, y + 0.12, d - 0.04], 0.02, iron);
  for (const s of [-1, 1]) {
    rod(kit, M, [x + s * (w / 2 - 0.03), top, 0.02], [x + s * (w / 2 - 0.03), top, d - 0.04], 0.025, iron);
    rod(kit, M, [x + s * (w / 2 - 0.03), y + 0.12, d - 0.04], [x + s * (w / 2 - 0.03), top, d - 0.04], 0.02, iron);
    for (let z = 0.12; z < d - 0.08; z += 0.12) rod(kit, M, [x + s * (w / 2 - 0.03), y + 0.07, z], [x + s * (w / 2 - 0.03), top, z], 0.01, iron);
  }
  for (let bx = -w / 2 + 0.12; bx < w / 2 - 0.08; bx += 0.12) {
    rod(kit, M, [x + bx, y + 0.07, d - 0.04], [x + bx, top, d - 0.04], 0.01, iron);
  }
  rod(kit, M, [x - w / 2 + 0.03, top - 0.16, d - 0.04], [x + w / 2 - 0.03, top - 0.16, d - 0.04], 0.012, iron);
  if (plants) {
    for (let i = 0; i < 3; i++) {
      if (r() < 0.3) continue;
      pottedPlant(kit, M, x - w / 2 + 0.3 + i * (w - 0.6) / 2, y + 0.07, d / 2, 0.55 + r() * 0.3, seed * 7 + i);
    }
  }
}

const _up = new THREE.Vector3(0, 1, 0), _leafN = new THREE.Vector3(), _leafP = new THREE.Vector3(), _leafS = new THREE.Vector3();
const _leafQ = new THREE.Quaternion(), _spin = new THREE.Quaternion(), _leafM = new THREE.Matrix4();
const POT_COLORS = ['#c4673d', '#b85a33', '#d9a27a', '#a64b2a'];
// Terracotta pot with a bushy plant; kind: 'bush' | 'geranium' | 'lemon'
export function pottedPlant(kit, M, x, y, z, size, seed, kind) {
  const r = rng(seed + 101);
  kind = kind ?? ['bush', 'geranium', 'lemon'][Math.floor(r() * 3)];
  const ph = 0.32 * size;
  kit.pot.add(mul(M, trs(x, y + ph / 2, z, 0, 0, 0, 0.36 * size, ph, 0.36 * size)), POT_COLORS[Math.floor(r() * POT_COLORS.length)]);
  kit.disc.add(mul(M, trs(x, y + ph, z, 0, 0, 0, 0.38 * size, 0.05, 0.38 * size)), '#b25a35');
  if (kind === 'lemon') {
    // A closed, lumpy crown that holds up close (the intro pushes right past the pair at the shop
    // door): a few dark inner masses fill the volume so nothing shows through, a dense skin of
    // leaves sits on their surface, branches fork into it and the lemons hang at the skin.
    const cy = y + ph + 1.0 * size, RX = 0.36 * size, RY = 0.3 * size;
    const top = [x, y + ph + 0.62 * size, z];
    rod(kit, M, [x, y + ph, z], top, 0.03 * size, '#6b4a2c');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + r() * 0.8;
      rod(kit, M, top, [x + Math.cos(a) * RX * 0.55, cy - RY * 0.1 + r() * RY * 0.4, z + Math.sin(a) * RX * 0.55], 0.016 * size, '#6b4a2c');
    }
    // inner masses: overlapping blobs; together they make the outline lumpy rather than a ball
    const blobs = [[0, 0, 0, 1]];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.6, e = (r() - 0.35) * 1.1;
      const d = 0.5 + r() * 0.18;
      blobs.push([Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d, 0.5 + r() * 0.2]);
    }
    for (const [bx, by, bz, s] of blobs) {
      kit.ball.add(mul(M, trs(x + bx * RX, cy + by * RY, z + bz * RX, r(), r() * 6, r(), 1.7 * RX * s, 1.7 * RY * s, 1.7 * RX * s)), C.setHSL(0.29, 0.42, 0.17 + r() * 0.04).clone());
    }
    // the leaf skin: points on the blob surfaces, each leaf lying roughly along the surface
    const skin = (out = 0) => {
      const [bx, by, bz, s] = blobs[Math.floor(r() * blobs.length)];
      const u = r() * 2 - 1, a = r() * Math.PI * 2, k = Math.sqrt(1 - u * u);
      const n = [k * Math.cos(a), u, k * Math.sin(a)];
      const d = 0.85 * s * (0.95 + out + r() * 0.25);
      return { n, p: [x + (bx + n[0] * d) * RX, cy + (by + n[1] * d) * RY, z + (bz + n[2] * d) * RX] };
    };
    for (let i = 0; i < 220; i++) {
      const { n, p } = skin();
      // flat side (local y) faces out along the surface, tipped a little at random
      _leafN.set(n[0] + (r() - 0.5) * 1.6, n[1] + (r() - 0.5) * 1.6, n[2] + (r() - 0.5) * 1.6).normalize();
      _leafQ.setFromUnitVectors(_up, _leafN).multiply(_spin.setFromAxisAngle(_up, r() * 6.3));
      _leafM.compose(_leafP.set(...p), _leafQ, _leafS.set(0.15 * size, 0.04 * size, 0.09 * size));
      kit.leaf.add(mul(M, _leafM), C.setHSL(0.27 + r() * 0.05, 0.45, 0.22 + r() * 0.2 + Math.max(0, n[1]) * 0.08).clone());
    }
    for (let i = 0; i < 12; i++) {
      let s;
      do s = skin(0.3); while (s.n[1] > 0.6); // lemons hang on the sides and underneath, just proud of the leaves
      kit.ball.add(mul(M, trs(...s.p, r() * 0.4, r() * 6, 0.25, 0.085 * size, 0.1 * size, 0.085 * size)), r() > 0.25 ? '#f2cc3a' : '#e8b23a');
    }
    return;
  }
  if (kind === 'fern') {
    // a Boston fern: a dense fountain of fronds
    fernFronds(kit, mul(M, trs(x, y + ph, z)), r, { n: 22, len: 0.5 * size, droop: 0.35, rise: 0.22 * size });
    return;
  }
  if (kind === 'snake') {
    // snake plant: stiff upright blades, dark with lighter bands
    for (let i = 0; i < 11; i++) {
      const a = r() * Math.PI * 2, rad = r() * 0.1 * size, h = (0.45 + r() * 0.4) * size;
      kit.leaf.add(mul(M, trs(x + Math.cos(a) * rad, y + ph + h / 2, z + Math.sin(a) * rad, (r() - 0.5) * 0.25, r() * 6, (r() - 0.5) * 0.25, 0.09 * size, h, 0.025 * size)), C.setHSL(0.3 + r() * 0.05, 0.42, i % 3 ? 0.22 + r() * 0.06 : 0.34).clone());
    }
    return;
  }
  if (kind === 'monstera') {
    // monstera: leaves on long stalks, each a midrib of lobe pairs with gaps between (the splits)
    const top = [x, y + ph, z];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.5;
      const out = (0.15 + r() * 0.25) * size, up = (0.35 + r() * 0.5) * size;
      const E = [x + Math.cos(a) * out, y + ph + up, z + Math.sin(a) * out];
      rod(kit, M, top, E, 0.012 * size, '#4f7a3a');
      // leaf frame: x out along the midrib, y the leaf's face, tipped down a little more for the low ones
      const L = mul(M, trs(...E, 0, -a, -0.35 - r() * 0.4));
      const col = C.setHSL(0.31 + r() * 0.04, 0.5, 0.2 + r() * 0.08).clone();
      const s = (0.85 + r() * 0.3) * size;
      for (let k = 0; k < 4; k++) {
        const u = (0.06 + k * 0.075) * s, w = (0.12 - Math.abs(k - 1.2) * 0.02) * s;
        for (const side of [-1, 1]) kit.leaf.add(mul(L, trs(u, 0, side * w * 0.55, 0, side * 0.45, 0, 0.07 * s, 0.012 * s, w)), col);
      }
      kit.leaf.add(mul(L, trs(0.33 * s, 0, 0, 0, 0, 0, 0.09 * s, 0.012 * s, 0.07 * s)), col);
    }
    return;
  }
  const n = kind === 'geranium' ? 30 : 45;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rad = 0.22 * size * r();
    kit.leaf.add(mul(M, trs(x + Math.cos(a) * rad, y + ph + (0.08 + r() * 0.3) * size, z + Math.sin(a) * rad, r() * 2, r() * 6, r() * 2, 0.16 * size, 0.06 * size, 0.12 * size)), C.setHSL(0.27 + r() * 0.07, 0.45, 0.28 + r() * 0.14).clone());
  }
  if (kind === 'geranium') {
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2;
      kit.ball.add(mul(M, trs(x + Math.cos(a) * 0.18 * size, y + ph + (0.32 + r() * 0.15) * size, z + Math.sin(a) * 0.18 * size, 0, 0, 0, 0.09 * size, 0.08 * size, 0.09 * size)), r() > 0.3 ? '#d63a2f' : '#e86a8a');
    }
  }
}

// Fern fronds arching out of a pot top (local frame P, y up): each frond rises a little, curves out and droops,
// with pairs of leaflets along it that get smaller towards the tip. Shared by the hanging and potted ferns.
export function fernFronds(kit, P, r, { n = 16, len = 0.55, droop = 0.4, rise = 0.12 } = {}) {
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + r() * 0.4;
    const L = len * (0.7 + r() * 0.4);
    const F = mul(P, trs(0, 0, 0, 0, a, 0));
    const pts = 11;
    for (let i = 1; i <= pts; i++) {
      const t = i / pts;
      const x = 0.04 + t * L, y = rise * Math.sin(Math.PI * t * 0.9) - droop * L * t * t;
      // slope of the frond here: leaflets lie along it
      const dy = rise * Math.PI * 0.9 * Math.cos(Math.PI * t * 0.9) / L - 2 * droop * t;
      const tilt = Math.atan(dy);
      const size = 1 - t * 0.6;
      const col = C.setHSL(0.27 + r() * 0.05, 0.5, 0.36 + r() * 0.12).clone();
      for (const side of [-1, 1]) {
        kit.bead.add(mul(F, trs(x, y, side * 0.035 * size, 0, side * 0.5, tilt, 0.06 * size, 0.012, 0.075 * size)), col);
      }
    }
  }
}

// Bougainvillea grown up beside an arch and over it (wall frame M: face at z = 0, +z out of the wall; o = the
// opening {x, y, w, h}): a woody stem up one side, then a thick band of leaves and magenta bracts along the
// arch's outside, with sprays falling from the top.
export function bougainvillea(kit, M, o, seed = 1) {
  const r = rng(seed);
  const r0 = o.w / 2, spring = o.y + o.h - r0;
  const side = r() > 0.5 ? 1 : -1;
  const sx = o.x + side * (r0 + 0.45);
  rod(kit, M, [sx, 0, 0.08], [sx - side * 0.1, spring, 0.1], 0.03, '#6b4a2c');
  const bract = () => C.setHSL(0.89 + r() * 0.05, 0.75, 0.56 + r() * 0.12).clone();
  const leaf = () => C.setHSL(0.27 + r() * 0.06, 0.45, 0.24 + r() * 0.14).clone();
  const at = (u, rad, dz) => [o.x + Math.cos(u) * rad, spring + Math.sin(u) * rad, dz];
  // up the stem side, then round the arch: u from the side's spring line over the top and a little down the far side
  const u0 = side > 0 ? -0.15 : Math.PI + 0.15, u1 = side > 0 ? Math.PI * 0.85 : Math.PI * 0.15;
  for (let y = 0.6; y < spring; y += 0.06) {
    for (let k = 0; k < 3; k++) kit.bead.add(mul(M, trs(sx + (r() - 0.5) * 0.3, y, 0.1 + r() * 0.12, r() * 3, r() * 6, r() * 3, 0.12, 0.05, 0.09)), leaf());
    if (y > spring * 0.55 && r() < 0.5) kit.bead.add(mul(M, trs(sx + (r() - 0.5) * 0.35, y, 0.18 + r() * 0.1, 0, 0, 0, 0.07, 0.06, 0.07)), bract());
  }
  for (let i = 0; i < 520; i++) {
    const u = u0 + (u1 - u0) * r();
    const rad = r0 + 0.12 + r() * 0.5;
    const p = at(u, rad, 0.08 + r() * 0.22);
    if (r() < 0.42) kit.bead.add(mul(M, trs(...p, 0, 0, 0, 0.065 + r() * 0.04, 0.055, 0.065)), bract());
    else kit.bead.add(mul(M, trs(...p, r() * 3, r() * 6, r() * 3, 0.13, 0.05, 0.1)), leaf());
  }
  // sprays falling from over the arch
  for (let v = 0; v < 9; v++) {
    const u = Math.PI * (0.15 + r() * 0.7);
    let [x, y] = at(u, r0 + 0.2 + r() * 0.3, 0);
    const len = 4 + Math.floor(r() * 8);
    for (let k = 0; k < len; k++) {
      y -= 0.07; x += (r() - 0.5) * 0.05;
      if (r() < 0.45) kit.bead.add(mul(M, trs(x, y, 0.25 + r() * 0.08, 0, 0, 0, 0.06, 0.05, 0.06)), bract());
      else kit.bead.add(mul(M, trs(x, y, 0.22 + r() * 0.08, r() * 3, r() * 6, r() * 3, 0.11, 0.045, 0.08)), leaf());
    }
  }
}

// A planter box hooked over a railing's top rail (local frame: x along the rail, +z out over the drop, rail top
// at y = 0): red geraniums and a fringe of trailing ivy over the front.
export function railPlanter(kit, M, w, seed = 1) {
  const r = rng(seed);
  blk(kit, M, 0, -0.16, 0.16, w, 0.22, 0.22, '#c4673d');
  blk(kit, M, 0, -0.05, 0.16, w + 0.03, 0.03, 0.25, '#b25a35');
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) blk(kit, M, x, -0.02, 0.04, 0.03, 0.06, 0.12, '#2b2a2e'); // hooks
  for (let i = 0; i < 40 * w; i++) {
    const x = (r() - 0.5) * (w - 0.08);
    kit.leaf.add(mul(M, trs(x, -0.02 + r() * 0.14, 0.16 + (r() - 0.5) * 0.15, r() * 2, r() * 6, r() * 2, 0.12, 0.05, 0.1)), C.setHSL(0.27 + r() * 0.06, 0.45, 0.28 + r() * 0.14).clone());
  }
  for (let i = 0; i < 14 * w; i++) {
    const x = (r() - 0.5) * (w - 0.1);
    kit.ball.add(mul(M, trs(x, 0.12 + r() * 0.1, 0.16 + (r() - 0.5) * 0.12, 0, 0, 0, 0.08, 0.07, 0.08)), r() > 0.3 ? '#d63a2f' : '#e86a8a');
  }
  for (let x = -w / 2 + 0.05; x < w / 2; x += 0.1 + r() * 0.12) {
    const len = 3 + Math.floor(r() * 8);
    for (let k = 0; k < len; k++) kit.leaf.add(mul(M, trs(x + (r() - 0.5) * 0.05, -0.08 - k * 0.07, 0.29 + r() * 0.03, r() * 2, r() * 6, r() * 2, 0.09, 0.04, 0.08)), C.setHSL(0.28 + r() * 0.06, 0.45, 0.3 + r() * 0.12).clone());
  }
}

// Ivy climbing a post from the floor (post centre x, z at y 0..h, radius rad): a vine winding up it.
export function postIvy(kit, M, x, z, h, rad, seed = 1) {
  const r = rng(seed);
  let a = r() * 6.3;
  for (let y = 0.15; y < h; y += 0.045) {
    a += 0.12 + r() * 0.1;
    const k = rad + 0.03 + r() * 0.05;
    kit.leaf.add(mul(M, trs(x + Math.cos(a) * k, y, z + Math.sin(a) * k, r() * 2, r() * 6, r() * 2, 0.11, 0.045, 0.085)), C.setHSL(0.28 + r() * 0.06, 0.45, 0.26 + r() * 0.14).clone());
    if (r() < 0.35) kit.leaf.add(mul(M, trs(x + Math.cos(a + 2) * k, y + 0.02, z + Math.sin(a + 2) * k, r() * 2, r() * 6, r() * 2, 0.1, 0.04, 0.08)), C.setHSL(0.28 + r() * 0.06, 0.45, 0.3 + r() * 0.12).clone());
  }
}

// Wall lantern on an iron bracket. Always present; the time of day decides whether it glows.
export function wallLantern(kit, M, x, y, { order, out = 0.45 } = {}) {
  const iron = '#24211f';
  rod(kit, M, [x, y + 0.1, 0.02], [x, y + 0.1, out], 0.018, iron);
  rod(kit, M, [x, y - 0.25, 0.02], [x, y + 0.1, out * 0.7], 0.012, iron);
  blk(kit, M, x, y + 0.1, 0.03, 0.08, 0.3, 0.04, iron);
  const lx = x, ly = y - 0.12, lz = out;
  // cap, frame, glass
  kit.cone.add(mul(M, trs(lx, ly + 0.25, lz, 0, Math.PI / 4, 0, 0.3, 0.14, 0.3)), iron);
  blk(kit, M, lx, ly - 0.17, lz, 0.18, 0.04, 0.18, iron);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) blk(kit, M, lx + dx * 0.085, ly + 0.03, lz + dz * 0.085, 0.02, 0.36, 0.02, iron);
  const glassMat = flagGlass(new THREE.MeshBasicMaterial({ color: '#5a4c40' }));
  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 0.15), glassMat);
  pane.applyMatrix4(mul(M, trs(lx, ly + 0.03, lz)));
  const halo = glowMesh('sprite', 1.3, 0.7);
  halo.position.set(lx, ly + 0.03, lz).applyMatrix4(M);
  const wash = glowMesh('plane', 3.2, 0.32);
  wash.applyMatrix4(mul(M, trs(lx, ly - 0.2, 0.04)));
  wash.scale.set(3.2, 3.2, 1);
  const pool = glowMesh('plane', 3.6, 0.3);
  pool.applyMatrix4(mul(M, trs(lx, 0.1, 1.3, -Math.PI / 2, 0, 0)));
  pool.scale.set(3.6, 3.6, 1);
  registerLamp({ glass: glassMat, glows: [halo, wash, pool], order });
  return [pane, halo, wash, pool];
}

// Roof edge: cornice, rafter ends, and a course of terracotta canal tiles.
export function eaves(kit, M, w, h, seed = 1) {
  const r = rng(seed + 55);
  blk(kit, M, w / 2, h - 0.12, 0.06, w + 0.04, 0.12, 0.12, '#e6d7bb');
  blk(kit, M, w / 2, h - 0.02, 0.12, w + 0.1, 0.1, 0.24, '#d9c8a8');
  for (let x = 0.15; x < w; x += 0.42) blk(kit, M, x, h + 0.08, 0.32, 0.09, 0.11, 0.64, WOOD[Math.floor(r() * WOOD.length)]);
  const pitch = 0.32;
  blk(kit, M, w / 2, h + 0.16, 0.3, w + 0.5, 0.04, 0.9, '#7a5634', -pitch * 0.4);
  for (let x = -0.15; x < w + 0.2; x += 0.23) {
    const c = C.setHSL((10 + r() * 14) / 360, 0.5 + r() * 0.15, 0.42 + r() * 0.12).clone();
    kit.tile.add(mul(M, trs(x, h + 0.3 + (r() - 0.5) * 0.02, 0.15, -pitch, (r() - 0.5) * 0.05, 0, 1, 1, 1.4)), c);
    // ridge/top of roof slopes back up and away, a second row a bit higher
    kit.tile.add(mul(M, trs(x + 0.115, h + 0.62, -0.95, -pitch, 0, Math.PI, 0.9, 0.9, 1.4)), c.clone().offsetHSL(0, 0, -0.05));
  }
}

// Drainpipe down a wall at local x.
export function drainpipe(kit, M, x, h) {
  const c = '#8a7d70';
  rod(kit, M, [x, 0.15, 0.1], [x, h - 0.25, 0.1], 0.05, c);
  kit.cone.add(mul(M, trs(x, h - 0.12, 0.14, Math.PI, Math.PI / 4, 0, 0.28, 0.25, 0.28)), c);
  rod(kit, M, [x, 0.15, 0.1], [x, 0.05, 0.25], 0.05, c);
  for (let y = 1.2; y < h - 0.5; y += 1.6) blk(kit, M, x, y, 0.06, 0.14, 0.04, 0.1, '#5a5048');
}
