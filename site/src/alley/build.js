// The Tuscan alley, the Sienna shopfront and the hall inside, rebuilt lighter for the page from the app's
// street.js / shop.js (same layout and colours: a narrow alley of brick and stucco houses, an arch over
// it, a little piazza, the shop with lemon trees by its door and a record for a sign). Everything static
// is merged into one mesh per surface, painted through world-space oil-dab textures.
import {
  Group, Mesh, InstancedMesh, BoxGeometry, CylinderGeometry, PlaneGeometry, CircleGeometry, IcosahedronGeometry, ConeGeometry,
  ExtrudeGeometry, Shape, Path, Matrix4, Quaternion, Euler, Vector3, Color, BufferAttribute, MeshBasicMaterial, CanvasTexture, SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../paint/rand.js';

export const STREET_HALF = 3.4;
export const PIAZZA_HALF = 5.4;
const ALLEY = { z0: 4.6, z1: 28 };
const DOOR = { w: 2.0, h: 3.0 };
const GF = 3.1;
const HALL = { x: 5.4, z0: -0.3, z1: -10.5, spring: 3.6 };
const GALLERY = { y: 3.0, inner: 3.7, front: -2.6, back: -9.3 };
const PLASTERS = ['#e9b98a', '#efd2a2', '#e3a07a', '#f0dcc0', '#d9a07a', '#ecc690', '#e8c8b0'];
const SHUTTERS = ['#5d7a52', '#3f6e6a', '#7a4a30', '#6a86a0', '#8a9a5b', '#a0553a'];
const POTS = ['#c4673d', '#b85a33', '#d9a27a', '#a64b2a'];
const IRON = '#2b2a2e';

const col = new Color();
const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _s = new Vector3(), _p = new Vector3();
export function trs(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}
const mul = (a, b) => new Matrix4().multiplyMatrices(a, b);
// a wall's frame: origin o, local x along `along`, +z out of the face
function frame(o, along, normal) {
  const x = new Vector3(...along), z = new Vector3(...normal);
  return new Matrix4().makeBasis(x, new Vector3().crossVectors(z, x), z).setPosition(...o);
}

// ---- collecting geometry ----
function worldUV(geo) {
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = -p.getZ(i); }
    else if (ax >= az) { uv[i * 2] = -p.getZ(i) * Math.sign(n.getX(i)); uv[i * 2 + 1] = p.getY(i); }
    else { uv[i * 2] = p.getX(i) * Math.sign(n.getZ(i)); uv[i * 2 + 1] = p.getY(i); }
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
}

class Parts {
  constructor() { this.sets = new Map(); this.leaves = []; this.rods = []; this.glows = []; this.windows = []; }
  push(key, geo, color, M) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(M);
    worldUV(g);
    col.set(color);
    const c = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < c.length; i += 3) { c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; }
    g.setAttribute('color', new BufferAttribute(c, 3));
    if (!this.sets.has(key)) this.sets.set(key, []);
    this.sets.get(key).push(g);
    return g;
  }
  box(key, M, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) { return this.push(key, new BoxGeometry(1, 1, 1), color, mul(M, trs(x, y, z, rx, ry, rz, sx, sy, sz))); }
  cyl(key, M, x, y, z, r, h, color, n = 14, rx = 0, ry = 0, rz = 0) { return this.push(key, new CylinderGeometry(r, r, h, n), color, mul(M, trs(x, y, z, rx, ry, rz))); }
  rod(M, a, b, r, color = IRON) {
    const A = new Vector3(...a).applyMatrix4(M), B = new Vector3(...b).applyMatrix4(M);
    const d = B.clone().sub(A), len = d.length();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
    this.rods.push({ m: new Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new Vector3(r * 2, len, r * 2)), c: color });
  }
  leaf(M, x, y, z, s, color, sy = s * 0.55) { this.leaves.push({ m: mul(M, trs(x, y, z, x * 7.1, y * 3.3, z * 5.7, s, sy, s * 0.8)), c: color }); }
  build(materials) {
    const g = new Group();
    for (const [key, list] of this.sets) {
      const mesh = new Mesh(mergeGeometries(list, false), materials[key]);
      mesh.castShadow = key !== 'glass' && key !== 'floor' && key !== 'paving' && key !== 'piazza';
      mesh.receiveShadow = key !== 'glass';
      mesh.name = key;
      g.add(mesh);
    }
    const inst = (geo, items, mat, cast = true) => {
      const m = new InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, col.set(it.c)); });
      m.castShadow = cast;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    if (this.leaves.length) inst(new IcosahedronGeometry(1, 0), this.leaves, materials.leaf);
    if (this.rods.length) inst(new CylinderGeometry(0.5, 0.5, 1, 6), this.rods, materials.iron);
    return g;
  }
}

// ---- facade details (after details.js) ----
function opening(o) {
  // a hole in a wall shape: arch (o.type 'arch', o.h includes the half circle) or rectangle
  const p = new Path();
  if (o.type === 'arch') {
    const r = o.w / 2, spring = o.y + o.h - r;
    p.moveTo(o.x - r, o.y); p.lineTo(o.x + r, o.y); p.lineTo(o.x + r, spring);
    p.absarc(o.x, spring, r, 0, Math.PI, false); p.closePath();
  } else {
    p.moveTo(o.x - o.w / 2, o.y); p.lineTo(o.x + o.w / 2, o.y); p.lineTo(o.x + o.w / 2, o.y + o.h); p.lineTo(o.x - o.w / 2, o.y + o.h); p.closePath();
  }
  return p;
}
// a slab of wall between y0 and y1 (local frame), with openings, `depth` thick behind the face
function wall(parts, key, M, { w, y0 = 0, y1, openings = [], color, depth = 0.3, x0 = 0, top = null }) {
  const s = new Shape();
  s.moveTo(x0, y0); s.lineTo(w, y0); s.lineTo(w, y1);
  if (top) top(s); else s.lineTo(x0, y1);
  s.closePath();
  for (const o of openings) s.holes.push(opening(o));
  const geo = new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 14 });
  geo.translate(0, 0, -depth);
  parts.push(key, geo, color, M);
}

function windowUnit(parts, M, o, { seed = 1, shutters = 'open', color, frame: surround = null, sill = true, box = null, curtain = null } = {}) {
  const r = rng(seed);
  const fh = o.type === 'arch' ? o.h - o.w / 2 : o.h;
  parts.windows.push({ M, o, order: r() });
  const wood = '#f0e6d2', fz = -0.14;
  parts.box('paint', M, o.x - o.w / 2 + 0.04, o.y + fh / 2, fz, 0.08, fh, 0.06, wood);
  parts.box('paint', M, o.x + o.w / 2 - 0.04, o.y + fh / 2, fz, 0.08, fh, 0.06, wood);
  parts.box('paint', M, o.x, o.y + 0.04, fz, o.w, 0.08, 0.06, wood);
  parts.box('paint', M, o.x, o.y + fh - 0.04, fz, o.w, 0.08, 0.06, wood);
  parts.box('paint', M, o.x, o.y + fh / 2, fz, 0.05, fh, 0.05, wood);
  parts.box('paint', M, o.x, o.y + fh * 0.62, fz, o.w, 0.035, 0.04, wood);
  if (curtain) parts.box('paint', M, o.x + (r() > 0.5 ? 1 : -1) * o.w * 0.3, o.y + fh / 2, -0.16, o.w * 0.3, fh - 0.12, 0.02, curtain);
  if (sill) parts.box('paint', M, o.x, o.y - 0.05, 0.05, o.w + 0.24, 0.09, 0.3, '#e9dcc2');
  if (surround) {
    const t = 0.13;
    parts.box('paint', M, o.x - o.w / 2 - t / 2, o.y + o.h / 2, 0.025, t, o.h + t, 0.04, surround);
    parts.box('paint', M, o.x + o.w / 2 + t / 2, o.y + o.h / 2, 0.025, t, o.h + t, 0.04, surround);
    parts.box('paint', M, o.x, o.y + o.h + t / 2, 0.025, o.w + t * 2, t, 0.04, surround);
  }
  if (shutters) {
    const c = color ?? SHUTTERS[Math.floor(r() * SHUTTERS.length)];
    const ang = { open: Math.PI - 0.06, half: 1.9 + r() * 0.6, closed: 0.02 }[shutters];
    for (const side of [-1, 1]) {
      const a = side < 0 || shutters !== 'half' ? ang : Math.PI - 0.06;
      const L = mul(M, trs(o.x + side * o.w / 2, o.y + fh / 2, 0.03, 0, side * a, 0));
      const lw = o.w / 2, cx = -side * lw / 2;
      parts.box('paint', L, cx, 0, 0, lw, fh, 0.04, c);
      const dark = col.set(c).offsetHSL(0, 0, -0.07).getStyle();
      for (let y = -fh / 2 + 0.12; y < fh / 2 - 0.08; y += 0.11) parts.box('paint', L, cx, y, 0.025, lw - 0.1, 0.022, 0.012, dark);
    }
  }
  if (box) flowerBox(parts, M, o.x, o.y - 0.02, 0.32, o.w + 0.1, seed, box);
}

function flowerBox(parts, M, x, y, z, w, seed, flowers = '#d63a2f') {
  const r = rng(seed + 31);
  parts.box('paint', M, x, y + 0.13, z, w, 0.24, 0.28, '#8a4f2c');
  for (let i = 0; i < w * 16; i++) parts.leaf(M, x + (r() - 0.5) * w * 0.95, y + 0.3 + r() * 0.1, z + (r() - 0.5) * 0.2, 0.09, col.setHSL(0.27 + r() * 0.08, 0.45, 0.32 + r() * 0.12).getStyle());
  for (let i = 0; i < w * 5; i++) {
    const lx = x + (r() - 0.5) * w, n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) parts.leaf(M, lx, y + 0.1 - k * 0.08, z + 0.16, 0.055, col.setHSL(0.28, 0.45, 0.3 + r() * 0.1).getStyle());
  }
  for (let i = 0; i < w * 8; i++) parts.leaf(M, x + (r() - 0.5) * w * 0.9, y + 0.38 + r() * 0.12, z + (r() - 0.5) * 0.2, 0.06, col.set(flowers).offsetHSL(0, 0, (r() - 0.5) * 0.12).getStyle());
}

function balcony(parts, M, x, y, w, seed = 1) {
  const d = 0.65, top = y + 0.95;
  parts.box('paint', M, x, y, d / 2, w, 0.14, d, '#e2d4ba');
  for (const cx of [-w / 2 + 0.25, 0, w / 2 - 0.25]) parts.box('paint', M, x + cx, y - 0.16, 0.2, 0.14, 0.2, 0.36, '#d8c8aa');
  parts.rod(M, [x - w / 2, top, d - 0.04], [x + w / 2, top, d - 0.04], 0.025);
  parts.rod(M, [x - w / 2, y + 0.12, d - 0.04], [x + w / 2, y + 0.12, d - 0.04], 0.02);
  for (const s of [-1, 1]) {
    parts.rod(M, [x + s * w / 2, top, 0.02], [x + s * w / 2, top, d - 0.04], 0.025);
    for (let z = 0.12; z < d - 0.08; z += 0.13) parts.rod(M, [x + s * w / 2, y + 0.07, z], [x + s * w / 2, top, z], 0.01);
  }
  for (let bx = -w / 2 + 0.12; bx < w / 2 - 0.08; bx += 0.13) parts.rod(M, [x + bx, y + 0.07, d - 0.04], [x + bx, top, d - 0.04], 0.01);
  const r = rng(seed + 3);
  for (let i = 0; i < 2; i++) pottedPlant(parts, M, x - w / 2 + 0.35 + i * (w - 0.7), y + 0.07, d / 2, 0.6 + r() * 0.2, seed * 7 + i, i ? 'geranium' : 'bush');
}

function pottedPlant(parts, M, x, y, z, size, seed, kind = 'bush') {
  const r = rng(seed + 101);
  const ph = 0.32 * size;
  parts.push('paint', new CylinderGeometry(0.2 * size, 0.14 * size, ph, 12), POTS[Math.floor(r() * POTS.length)], mul(M, trs(x, y + ph / 2, z)));
  if (kind === 'lemon') {
    const cy = y + ph + 1.0 * size, RX = 0.36 * size, RY = 0.3 * size;
    parts.cyl('paint', M, x, y + ph + 0.31 * size, z, 0.03 * size, 0.62 * size, '#6b4a2c', 6);
    for (let i = 0; i < 70; i++) {
      const a = r() * 6.28, e = (r() - 0.4) * 2.4, d = 0.7 + r() * 0.35;
      parts.leaf(M, x + Math.cos(a) * Math.cos(e) * RX * d, cy + Math.sin(e) * RY * d * 0.9, z + Math.sin(a) * Math.cos(e) * RX * d, 0.07 * size + r() * 0.03 * size, col.setHSL(0.28 + r() * 0.04, 0.42, 0.22 + r() * 0.12).getStyle(), 0.05 * size);
    }
    parts.leaf(M, x, cy, z, RX * 0.85, '#36502a', RY * 0.85);
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.28, e = (r() - 0.5) * 1.6;
      parts.leaf(M, x + Math.cos(a) * Math.cos(e) * RX, cy + Math.sin(e) * RY, z + Math.sin(a) * Math.cos(e) * RX, 0.05 * size, '#ecc53a', 0.065 * size);
    }
  } else {
    const n = kind === 'geranium' ? 26 : 34;
    for (let i = 0; i < n; i++) parts.leaf(M, x + (r() - 0.5) * 0.4 * size, y + ph + (0.08 + r() * 0.28) * size, z + (r() - 0.5) * 0.4 * size, 0.09 * size, col.setHSL(0.27 + r() * 0.07, 0.42, 0.26 + r() * 0.12).getStyle());
    if (kind === 'geranium') for (let i = 0; i < 9; i++) parts.leaf(M, x + (r() - 0.5) * 0.36 * size, y + ph + (0.28 + r() * 0.12) * size, z + (r() - 0.5) * 0.36 * size, 0.06 * size, '#d63a2f');
  }
}

function eaves(parts, M, w, h, seed = 1) {
  const r = rng(seed + 55);
  parts.box('paint', M, w / 2, h - 0.12, 0.06, w + 0.04, 0.12, 0.12, '#e6d7bb');
  parts.box('paint', M, w / 2, h - 0.02, 0.12, w + 0.1, 0.1, 0.24, '#d9c8a8');
  for (let x = 0.15; x < w; x += 0.42) parts.box('paint', M, x, h + 0.08, 0.32, 0.09, 0.11, 0.64, '#5a3d24');
  parts.box('paint', M, w / 2, h + 0.16, 0.3, w + 0.5, 0.04, 0.9, '#7a5634', -0.13);
  for (let x = -0.15; x < w + 0.2; x += 0.23) {
    const c = col.setHSL((10 + r() * 14) / 360, 0.5 + r() * 0.15, 0.42 + r() * 0.12).getStyle();
    parts.push('paint', new CylinderGeometry(0.11, 0.11, 0.62, 6, 1, false, 0, Math.PI), c, mul(M, trs(x, h + 0.3, 0.3, Math.PI / 2 - 0.32, 0, 0)));
  }
  parts.box('paint', M, w / 2, h + 0.45, -1.2, w + 0.3, 0.06, 2.6, '#a8573a', -0.32);
}

function lantern(parts, M, x, y, { order = 0.5, out = 0.45 } = {}) {
  parts.rod(M, [x, y + 0.1, 0.02], [x, y + 0.1, out], 0.018);
  parts.rod(M, [x, y - 0.25, 0.02], [x, y + 0.1, out * 0.7], 0.012);
  const ly = y - 0.12;
  parts.push('paint', new ConeGeometry(0.17, 0.14, 4), IRON, mul(M, trs(x, ly + 0.25, out, 0, Math.PI / 4, 0)));
  parts.box('paint', M, x, ly - 0.17, out, 0.18, 0.04, 0.18, IRON);
  const p = new Vector3(x, ly + 0.03, out).applyMatrix4(M);
  parts.glows.push({ p, order, size: 1.4, pane: true, M: mul(M, trs(x, ly + 0.03, out)) });
}

function drainpipe(parts, M, x, h) {
  parts.cyl('paint', M, x, h / 2, 0.1, 0.05, h - 0.3, '#8a7d70', 8);
}

// One house front in frame M (after street.js house()).
function house(parts, M, spec) {
  const { w, seed } = spec;
  const r = rng(seed);
  const h = spec.h;
  const color = spec.color ?? PLASTERS[Math.floor(r() * PLASTERS.length)];
  const nf = h > 9.4 ? 3 : 2;
  const ground = [];
  const kind = spec.ground ?? ['shop', 'door', 'garage'][Math.floor(r() * 3)];
  let shopO = null, doorO = null;
  if (kind === 'shop') ground.push(shopO = { type: 'arch', x: w / 2, y: 0, w: Math.min(2.5, w - 1.6), h: 2.9 });
  else if (kind === 'garage') ground.push(doorO = { type: 'arch', x: w / 2, y: 0, w: Math.min(2.4, w - 1.6), h: 2.85 });
  else ground.push(doorO = { type: 'rect', x: w * 0.32, y: 0, w: 1.1, h: 2.3 }, { type: 'rect', x: w * 0.74, y: 1.0, w: 0.8, h: 1.1, win: true });
  const upper = [];
  const nwin = Math.max(1, Math.floor((w - 0.5) / 1.85));
  for (let f = 1; f <= nf; f++) {
    const fy = GF + 0.12 + (f - 1) * 2.55;
    for (let i = 0; i < nwin; i++) {
      const isBalc = spec.balcony && f === 1 && i === Math.floor(nwin / 2);
      upper.push({ type: 'rect', x: ((i + 0.5) * w) / nwin, y: isBalc ? fy + 0.05 : fy + 0.5, w: isBalc ? 0.95 : 0.82, h: isBalc ? 2.1 : f === nf ? 1.25 : 1.45, f, isBalc });
    }
  }
  if (spec.brick) wall(parts, 'stone', M, { w, y1: h, openings: [...ground, ...upper], color: '#ffffff' });
  else {
    wall(parts, 'stone', M, { w, y1: GF, openings: ground, color: '#ffffff' });
    parts.box('paint', M, w / 2, GF + 0.04, 0.05, w, 0.1, 0.12, '#e6d7bb');
    wall(parts, 'plaster', M, { w, y0: GF, y1: h, openings: upper, color });
  }
  // a dark room behind every opening, so nothing shows through
  parts.box('paint', M, w / 2, h / 2, -2.6, w - 0.1, h, 0.1, '#3a2c26');
  if (shopO) {
    parts.box('paint', M, shopO.x, 1.6, -1.4, shopO.w + 0.6, 3.2, 0.1, '#f0c890');
    for (let k = 0; k < 3; k++) {
      parts.box('paint', M, shopO.x, 1.0 + k * 0.5, -1.2, shopO.w, 0.04, 0.3, '#8a5a32');
      for (let j = 0; j < 7; j++) parts.box('paint', M, shopO.x - shopO.w / 2 + 0.25 + j * ((shopO.w - 0.5) / 6), 1.14 + k * 0.5, -1.2, 0.12, 0.2, 0.12, col.setHSL(r(), 0.4, 0.5 + r() * 0.2).getStyle());
    }
    parts.box('paint', M, shopO.x, 0.45, -0.6, shopO.w - 0.4, 0.9, 0.5, '#9a6a3c');
    const stripe = ['#c4673d', '#3f6e6a', '#6a86a0', '#8a9a5b'][Math.floor(r() * 4)];
    const aw = shopO.w + 0.6;
    for (let i = 0; i < 9; i++) parts.box('paint', M, shopO.x - aw / 2 + (i + 0.5) * (aw / 9), 3.35, 0.55, aw / 9, 0.03, 1.15, i % 2 ? stripe : '#f2e8d4', 0.42);
    crate(parts, mul(M, trs(shopO.x - 0.7, 0, 0.45, 0, 0.1, 0)), 0.6, 0.45, 0.32, seed + 5, 'fruit');
    crate(parts, mul(M, trs(shopO.x + 0.75, 0, 0.4, 0, -0.08, 0)), 0.6, 0.45, 0.32, seed + 6, 'lemons');
  }
  if (doorO) {
    const dh = doorO.type === 'arch' ? doorO.h - doorO.w / 2 : doorO.h;
    const dc = ['#5a3d24', '#3f5e4a', '#6a4a3a', '#2f4e5a'][Math.floor(r() * 4)];
    const n = Math.max(4, Math.round(doorO.w / 0.16));
    for (let i = 0; i < n; i++) parts.box('paint', M, doorO.x - doorO.w / 2 + (doorO.w / n) * (i + 0.5), dh / 2, -0.14, doorO.w / n - 0.012, dh - 0.02, 0.06, col.set(dc).offsetHSL(0, 0, (r() - 0.5) * 0.06).getStyle());
    if (doorO.type === 'arch') parts.push('paint', new CircleGeometry(doorO.w / 2, 14, 0, Math.PI), dc, mul(M, trs(doorO.x, dh, -0.15)));
    else { parts.box('paint', M, doorO.x, 0.08, 0.2, doorO.w + 0.4, 0.16, 0.45, '#d8ccb6'); pottedPlant(parts, M, doorO.x - 0.85, 0, 0.35, 0.9, seed + 3); }
  }
  for (const o of ground) if (o.win) windowUnit(parts, M, o, { seed: seed + 8, shutters: null, curtain: '#f4efe4' });
  for (const o of upper) {
    windowUnit(parts, M, o, {
      seed: seed * 13 + o.x * 7 + o.f, shutters: o.isBalc ? 'open' : ['open', 'open', 'half', 'closed'][Math.floor(r() * 4)], color: spec.shutter,
      curtain: ['#f4efe4', '#f2d9c4', null][Math.floor(r() * 3)], frame: spec.brick ? null : '#f2e6d0', sill: !o.isBalc,
      box: !o.isBalc && o.f === 1 && r() > 0.35 ? (r() > 0.3 ? '#d63a2f' : '#e86a8a') : null,
    });
    if (o.isBalc) balcony(parts, M, o.x, o.y - 0.02, 1.7, seed);
  }
  eaves(parts, M, w, h, seed);
  if (spec.pipe !== false) drainpipe(parts, M, w - 0.12, h);
  if (spec.lantern) lantern(parts, M, spec.lantern === 'left' ? 0.5 : w - 0.55, 3.45, { order: r() });
}

function crate(parts, M, w, d, h, seed, filler) {
  const r = rng(seed);
  for (const s of [-1, 1]) parts.box('paint', M, s * (w / 2 - 0.015), h / 2, 0, 0.03, h, d, '#b88a58');
  for (const s of [-1, 1]) parts.box('paint', M, 0, h / 2, s * (d / 2 - 0.015), w, h, 0.03, '#c9a06a');
  parts.box('paint', M, 0, 0.03, 0, w, 0.03, d, '#a87a4a');
  if (filler === 'records') {
    const n = Math.floor(d / 0.03);
    for (let i = 0; i < n; i++) parts.box('paint', M, 0, h * 0.55 + 0.1, -d / 2 + 0.03 + i * 0.03, w - 0.08, 0.31, 0.012, col.setHSL(r(), 0.45, 0.45 + r() * 0.2).getStyle(), -0.15 + (r() - 0.5) * 0.1);
  } else {
    const fruit = filler === 'lemons' ? ['#ecc53a', '#e2b52e'] : ['#d64a2f', '#e8823a', '#6a9a3a', '#c43a3a'];
    for (let i = 0; i < 14; i++) parts.leaf(M, (r() - 0.5) * (w - 0.1), h - 0.02 + r() * 0.06, (r() - 0.5) * (d - 0.1), 0.06, fruit[Math.floor(r() * fruit.length)]);
  }
}

// The painted sign over the door: hand lettering in paper colour on a green board.
function signTexture(font) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  const draw = () => {
    g.clearRect(0, 0, 1024, 256);
    g.font = `700 200px ${font}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.fillStyle = '#141414'; g.fillText('Sienna', 522, 140);
    g.lineWidth = 24; g.strokeStyle = '#141414'; g.strokeText('Sienna', 512, 128);
    g.fillStyle = '#fbf3e2'; g.fillText('Sienna', 512, 128);
    t.needsUpdate = true;
  };
  draw();
  document.fonts?.load(`700 200px ${font}`).then(draw, () => {});
  return t;
}

// The Sienna shop's front: brick ground floor with two arched display windows and an arched door,
// terracotta stucco above with a balcony; faces +z at z = 0.
function shopFront(parts, root, extras) {
  const M = frame([-PIAZZA_HALF, 0, 0], [1, 0, 0], [0, 0, 1]);
  const w = PIAZZA_HALF * 2, cx = w / 2, h = 9.4, top = 4.9;
  const door = { type: 'arch', x: cx, y: 0, w: DOOR.w, h: DOOR.h + DOOR.w / 2 };
  const wins = [-3.0, 3.0].map((dx) => ({ type: 'arch', x: cx + dx, y: 0.55, w: 2.3, h: 3.4 }));
  wall(parts, 'stone', M, { w, y1: top, openings: [door, ...wins], color: '#ffffff', depth: 0.55 });
  parts.box('paint', M, cx, top + 0.05, 0.06, w, 0.12, 0.14, '#e6d7bb');
  const upper = [-3.2, 0, 3.2].map((dx) => ({ type: 'rect', x: cx + dx, y: dx === 0 ? top + 0.15 : top + 0.6, w: dx === 0 ? 1.1 : 0.9, h: dx === 0 ? 2.15 : 1.5, mid: dx === 0 }));
  const upper2 = [-3.2, 0, 3.2].map((dx) => ({ type: 'rect', x: cx + dx, y: top + 2.9, w: 0.8, h: 1.1 }));
  wall(parts, 'plaster', M, { w, y0: top, y1: h, openings: [...upper, ...upper2], color: '#e3a07a' });
  upper.forEach((o, i) => windowUnit(parts, M, o, { seed: 520 + i, shutters: 'open', color: '#3f6e6a', frame: '#f2e6d0', sill: !o.mid, curtain: '#f4efe4', box: o.mid ? null : '#d63a2f' }));
  upper2.forEach((o, i) => windowUnit(parts, M, o, { seed: 530 + i, shutters: i === 1 ? 'closed' : 'half', color: '#3f6e6a', frame: '#f2e6d0' }));
  balcony(parts, M, cx, top + 0.13, 2.6, 540);
  eaves(parts, M, w, h, 503);
  drainpipe(parts, M, 0.15, h);
  drainpipe(parts, M, w - 0.15, h);
  // lined openings, so the deep wall never shows its gap
  for (const o of [door, ...wins]) {
    const r0 = o.w / 2, spring = o.y + o.h - r0;
    const outer = new Shape();
    outer.moveTo(o.x - r0 - 0.08, o.y - 0.05); outer.lineTo(o.x + r0 + 0.08, o.y - 0.05); outer.lineTo(o.x + r0 + 0.08, spring);
    outer.absarc(o.x, spring, r0 + 0.08, 0, Math.PI, false); outer.closePath();
    outer.holes.push(opening({ ...o, x: o.x, w: o.w - 0.024 }));
    const g = new ExtrudeGeometry(outer, { depth: 0.5, bevelEnabled: false, curveSegments: 16 });
    g.translate(0, 0, -0.56);
    parts.push('paint', g, '#e0c9a0', M);
  }
  // display windows: glass, a ledge of records facing the street
  for (const o of wins) {
    const spring = o.y + o.h - o.w / 2;
    parts.windows.push({ M, o: { ...o, glassZ: -0.25 }, order: 2, shop: true });
    for (const [x, y, sx, sy] of [[o.x, o.y + 0.04, o.w, 0.08], [o.x, spring, o.w, 0.06], [o.x, (o.y + spring) / 2, 0.06, spring - o.y]]) parts.box('paint', M, x, y, -0.24, sx, sy, 0.08, '#3f6e6a');
    parts.box('paint', M, o.x, o.y + 0.02, 0.06, o.w + 0.3, 0.1, 0.32, '#e9dcc2');
    parts.box('paint', M, o.x, o.y + 0.08, -0.4, o.w - 0.1, 0.06, 0.28, '#8a5a32');
    const r = rng(o.x * 10);
    for (let k = 0; k < 3; k++) parts.box('paint', M, o.x - 0.65 + k * 0.65, o.y + 0.42, -0.42, 0.55, 0.55, 0.02, col.setHSL(r(), 0.45, 0.5).getStyle(), -0.15, (k - 1) * 0.2, 0);
  }
  // the sign board, its lettering, and the hanging record
  parts.box('paint', M, cx, top - 0.42, 0.04, 3.6, 0.62, 0.08, '#3f6e6a');
  const sign = new Mesh(new PlaneGeometry(3.3, 0.82), new MeshBasicMaterial({ map: signTexture(extras.font), transparent: true, alphaTest: 0.4 }));
  sign.applyMatrix4(mul(M, trs(cx, top - 0.4, 0.1, 0, 0, -0.03)));
  root.add(sign);
  parts.rod(M, [cx + 4.95, 3.9, 0.02], [cx + 4.95, 3.9, 1.1], 0.025);
  parts.rod(M, [cx + 4.95, 3.5, 0.02], [cx + 4.95, 3.9, 0.7], 0.015);
  parts.cyl('paint', M, cx + 4.95, 3.35, 0.7, 0.47, 0.04, '#1d1b1d', 28, 0, 0, Math.PI / 2);
  parts.cyl('paint', M, cx + 4.95, 3.35, 0.7, 0.18, 0.05, '#e86a3a', 20, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    lantern(parts, M, cx + s * 1.55, 3.0, { order: 0.05 + (s > 0 ? 0.02 : 0) });
    pottedPlant(parts, M, cx + s * 1.55, 0, 0.5, 1.4, 560 + s, 'lemon');
  }
  for (const o of wins) {
    const T = mul(M, trs(o.x, 0, 0.75));
    for (const [x, z] of [[-0.75, -0.25], [0.75, -0.25], [-0.75, 0.25], [0.75, 0.25]]) parts.cyl('paint', T, x, 0.31, z, 0.025, 0.62, '#5a3d24', 6);
    parts.box('paint', T, 0, 0.64, 0, 1.75, 0.05, 0.7, '#8a5a32');
    crate(parts, mul(T, trs(-0.43, 0.66, 0, 0, 0.04, 0)), 0.8, 0.62, 0.32, Math.round(o.x * 3), 'records');
    crate(parts, mul(T, trs(0.43, 0.66, 0, 0, -0.05, 0)), 0.8, 0.62, 0.32, Math.round(o.x * 3) + 1, 'records');
  }
  // chalkboard and bicycle
  const B = mul(M, trs(cx - 1.4, 0, 1.6, 0, 0.5, 0));
  parts.box('paint', B, 0, 0.55, 0, 0.6, 0.85, 0.04, '#2a2a2a', -0.12);
  parts.box('paint', B, 0, 0.55, 0.03, 0.66, 0.91, 0.03, '#8a5a32', -0.12);
  const K = mul(M, trs(cx + 4.55, 0, 0.35, 0, Math.PI / 2 + 0.15, 0));
  for (const s of [-1, 1]) parts.push('paint', new CylinderGeometry(0.33, 0.33, 0.03, 18, 1, true), '#2b2a2e', mul(K, trs(s * 0.5, 0.34, 0, Math.PI / 2, 0, 0)));
  parts.rod(K, [-0.5, 0.34, 0], [0.05, 0.75, 0], 0.02, '#3f6e6a');
  parts.rod(K, [0.05, 0.75, 0], [0.5, 0.34, 0], 0.02, '#3f6e6a');
  parts.rod(K, [-0.25, 0.34, 0], [0.05, 0.75, 0], 0.02, '#3f6e6a');
  parts.rod(K, [0.4, 0.95, 0], [0.5, 0.34, 0], 0.02, '#3f6e6a');
  // the door's step and the fanlight over it
  parts.box('paint', new Matrix4(), 0, 0.06, 0.25, DOOR.w + 0.6, 0.12, 0.5, '#d8ccb6');
  parts.windows.push({ M: new Matrix4(), o: { type: 'fan', x: 0, y: DOOR.h, w: DOOR.w, glassZ: -0.3 }, order: 2, shop: true });
  for (let k = 1; k < 5; k++) {
    const a = (k / 5) * Math.PI;
    parts.rod(new Matrix4(), [0, DOOR.h, -0.28], [Math.cos(a) * 0.98, DOOR.h + Math.sin(a) * 0.98, -0.28], 0.018, '#3f6e6a');
  }
  parts.box('paint', new Matrix4(), 0, DOOR.h + 0.03, -0.28, DOOR.w, 0.07, 0.08, '#3f6e6a');
}

// The door leaves, hinged at the jambs and opening inward (the scroll opens them).
function doorLeaves(root, toonMat) {
  const leaves = [];
  const lw = DOOR.w / 2 - 0.02;
  const wood = toonMat('#3f6e6a');
  const glassMat = new MeshBasicMaterial({ color: '#f6dca8', transparent: true, opacity: 0.35, depthWrite: false });
  for (const s of [-1, 1]) {
    const pivot = new Group();
    pivot.position.set(s * (DOOR.w / 2), DOOR.h / 2, -0.3);
    const L = new Group();
    L.scale.x = -s;
    const add = (geo, mat, x, y, z) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; L.add(m); };
    add(new BoxGeometry(0.1, DOOR.h, 0.1), wood, 0.05, 0, 0);
    add(new BoxGeometry(0.1, DOOR.h, 0.1), wood, lw - 0.05, 0, 0);
    add(new BoxGeometry(lw, 0.12, 0.1), wood, lw / 2, DOOR.h / 2 - 0.06, 0);
    add(new BoxGeometry(lw, 0.9, 0.08), wood, lw / 2, -DOOR.h / 2 + 0.45, 0);
    add(new BoxGeometry(lw - 0.1, 2.0, 0.02), glassMat, lw / 2, 0.45, 0);
    add(new BoxGeometry(0.035, 2.0, 0.04), wood, lw / 2, 0.45, 0);
    add(new BoxGeometry(0.05, 0.32, 0.06), toonMat('#d8b25c'), lw - 0.14, -0.15, 0.08);
    pivot.add(L);
    root.add(pivot);
    leaves.push({ pivot, side: s });
  }
  return leaves;
}

// The arch over the alley: an arched passage under a plastered house, stone round the opening.
function archBridge(parts) {
  const M = frame([-STREET_HALF, 0, 13.4], [1, 0, 0], [0, 0, 1]);
  const w = STREET_HALF * 2, h = 9.6, d = 2.4, aw = 5.4, ah = 5.0;
  const hole = { type: 'arch', x: w / 2, y: 0, w: aw, h: ah };
  for (const z of [0, -d + 0.3]) {
    const F = mul(M, trs(0, 0, z));
    wall(parts, 'stone', F, { w, y1: 6.2, openings: [hole], color: '#ffffff' });
    wall(parts, 'plaster', F, { w, y0: 6.2, y1: h, openings: [{ type: 'rect', x: w / 2, y: 7.0, w: 0.9, h: 1.3 }], color: '#efd2a2' });
  }
  windowUnit(parts, M, { type: 'rect', x: w / 2, y: 7.0, w: 0.9, h: 1.3 }, { seed: 41, shutters: 'half', color: '#3f6e6a', box: '#d63a2f' });
  // the vault of the passage
  const vault = new CylinderGeometry(aw / 2, aw / 2, d - 0.3, 20, 1, true, -Math.PI / 2, Math.PI);
  parts.push('stone', vault, '#ffffff', mul(M, trs(w / 2, ah - aw / 2, -(d - 0.3) / 2, -Math.PI / 2, 0, 0)));
  for (const s of [-1, 1]) parts.box('stone', M, w / 2 + s * (aw / 2 + 0.01), (ah - aw / 2) / 2, -(d - 0.3) / 2, 0.02, ah - aw / 2, d - 0.3, '#ffffff');
  eaves(parts, M, w, h, 41);
  parts.rod(new Matrix4(), [0, 5.05, 12.2], [0, 4.4, 12.2], 0.012);
  parts.push('paint', new ConeGeometry(0.22, 0.16, 4), IRON, trs(0, 4.45, 12.2, 0, Math.PI / 4, 0));
  parts.glows.push({ p: new Vector3(0, 4.25, 12.2), order: 0.3, size: 1.5, pane: true, M: trs(0, 4.25, 12.2) });
}

function streetLife(parts) {
  // the red scooter by the arch (and two more down the alley)
  for (const [x, z, ry, c] of [[2.5, 15.6, -0.25, '#d1342c'], [2.55, 8.2, -0.3, '#e8d6b0'], [2.45, 22.5, 2.9, '#6a9ab0']]) {
    const S = trs(x, 0, z, 0, ry, 0);
    parts.box('paint', S, 0, 0.55, 0.1, 0.42, 0.5, 0.95, c);
    parts.box('paint', S, 0, 0.82, -0.05, 0.36, 0.14, 0.7, '#3a2a24');
    parts.box('paint', S, 0, 0.75, 0.62, 0.36, 0.7, 0.14, c, 0.25);
    parts.rod(S, [-0.32, 1.22, 0.66], [0.32, 1.22, 0.66], 0.02, '#c8c0b0');
    for (const zz of [-0.45, 0.62]) parts.push('paint', new CylinderGeometry(0.2, 0.2, 0.1, 14), '#2b2a2e', mul(S, trs(0, 0.2, zz, 0, 0, Math.PI / 2)));
  }
  // the fruit stall with its striped awning
  const T = trs(-2.3, 0, 16.2, 0, Math.PI / 2, 0);
  parts.box('paint', T, 0, 0.82, 0, 1.6, 0.05, 0.75, '#a87a4a');
  for (const [x, z] of [[-0.75, -0.33], [0.75, -0.33], [-0.75, 0.33], [0.75, 0.33]]) parts.cyl('paint', T, x, 0.41, z, 0.03, 0.82, '#6b4a2c', 6);
  for (const [x, h] of [[-0.78, 2.3], [0.78, 2.3]]) parts.cyl('paint', T, x, h / 2, -0.35, 0.03, h, '#6b4a2c', 6);
  for (let i = 0; i < 8; i++) parts.box('paint', T, -0.875 + i * 0.25, 2.2, 0.15, 0.25, 0.03, 1.2, i % 2 ? '#f2e8d4' : '#3f6e6a', 0.38);
  crate(parts, mul(T, trs(-0.4, 0.85, 0)), 0.6, 0.5, 0.25, 61, 'fruit');
  crate(parts, mul(T, trs(0.35, 0.85, 0.02)), 0.6, 0.5, 0.25, 62, 'lemons');
  // a bench, potted plants, a café table
  const Bn = trs(2.75, 0, 18.2, 0, -Math.PI / 2, 0);
  parts.box('paint', Bn, 0, 0.45, 0, 1.4, 0.06, 0.42, '#7a5634');
  parts.box('paint', Bn, 0, 0.75, -0.2, 1.4, 0.3, 0.05, '#7a5634', 0.1);
  for (const x of [-0.6, 0.6]) parts.box('paint', Bn, x, 0.22, 0, 0.06, 0.45, 0.4, IRON);
  pottedPlant(parts, new Matrix4(), 2.85, 0, 19.4, 1.2, 70, 'lemon');
  pottedPlant(parts, new Matrix4(), -2.95, 0, 9.4, 1.0, 71, 'bush');
  pottedPlant(parts, new Matrix4(), -2.95, 0, 14.2, 0.9, 72, 'geranium');
  const Cf = trs(-3.9, 0, 2.7, 0, 0.3, 0);
  parts.cyl('paint', Cf, 0, 0.72, 0, 0.36, 0.04, '#e9dcc2', 18);
  parts.cyl('paint', Cf, 0, 0.36, 0, 0.03, 0.72, IRON, 6);
  for (const a of [0, 2.2, 4.2]) parts.box('paint', Cf, Math.cos(a) * 0.65, 0.45, Math.sin(a) * 0.65, 0.4, 0.05, 0.4, '#3f6e6a');
  parts.cyl('paint', Cf, 0, 1.2, 0, 0.025, 2.4, '#e9dcc2', 6);
  parts.push('paint', new ConeGeometry(1.2, 0.45, 12), '#c4673d', mul(Cf, trs(0, 2.35, 0)));
}

// String lights across the piazza: a sagging wire with bulbs that glow at dusk.
function stringLights(parts, a, b, n, orderBase) {
  const A = new Vector3(...a), B = new Vector3(...b);
  let prev = A.clone();
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = A.clone().lerp(B, t);
    p.y -= Math.sin(Math.PI * t) * 0.7;
    parts.rod(new Matrix4(), prev.toArray(), p.toArray(), 0.006, '#2a2420');
    if (i < n) parts.glows.push({ p: p.clone().add(new Vector3(0, -0.06, 0)), order: orderBase + t * 0.15, size: 0.55, bulb: true });
    prev = p;
  }
}

// ---- the hall (after shop.js): crate tables, a U-shaped gallery, a brick vault ----
function hall(parts, root, extras) {
  const I = new Matrix4();
  const X = HALL.x;
  // floor, walls, the vault
  parts.box('floor', I, 0, -0.05, (HALL.z0 + HALL.z1) / 2, X * 2, 0.1, HALL.z0 - HALL.z1, '#ffffff');
  for (const s of [-1, 1]) parts.box('plaster', I, s * (X + 0.15), HALL.spring / 2, (HALL.z0 + HALL.z1) / 2, 0.3, HALL.spring, HALL.z0 - HALL.z1, '#e8c9a0');
  const vault = new CylinderGeometry(X, X, HALL.z0 - HALL.z1, 28, 1, true, -Math.PI / 2, Math.PI);
  parts.push('brick', vault, '#ffffff', trs(0, HALL.spring, (HALL.z0 + HALL.z1) / 2, -Math.PI / 2, 0, 0));
  // the back wall: an arch to the lounge, the lunette under the vault above it
  const B = frame([-X, 0, HALL.z1], [1, 0, 0], [0, 0, 1]);
  const arch = { type: 'arch', x: X, y: 0, w: 2.6, h: 3.5 };
  wall(parts, 'plaster', B, {
    w: X * 2, y1: HALL.spring, openings: [arch], color: '#e8c9a0',
    top: (s) => { s.absarc(X, HALL.spring, X, 0, Math.PI, false); },
  });
  // the lounge seen through the arch, its big window onto the garden glowing
  parts.box('plaster', I, 0, 1.8, HALL.z1 - 3.4, 4.2, 3.6, 0.2, '#d9b48a');
  for (const s of [-1, 1]) parts.box('plaster', I, s * 2.1, 1.8, HALL.z1 - 1.7, 0.2, 3.6, 3.4, '#d9b48a');
  parts.box('paint', I, 0, -0.55, HALL.z1 - 1.7, 4.2, 0.1, 3.4, '#8a5a3c');
  parts.windows.push({ M: trs(0, 0, HALL.z1 - 3.28), o: { type: 'arch', x: 0, y: 0.6, w: 2.2, h: 2.8, glassZ: 0 }, order: 3, garden: true });
  parts.box('paint', I, 0, 0.35, HALL.z1 - 2.7, 2.0, 0.5, 0.8, '#6a86a0');
  // the gallery: decks along both sides and the back, posts, railings
  const { y, inner, front, back } = GALLERY;
  const Z1 = HALL.z1;
  parts.box('paint', I, -(X + inner) / 2, y, (front + back) / 2, X - inner, 0.12, front - back, '#a8743a');
  parts.box('paint', I, (X + inner) / 2, y, (front + back) / 2, X - inner, 0.12, front - back, '#a8743a');
  parts.box('paint', I, 0, y, (back + Z1) / 2, X * 2, 0.12, back - Z1, '#a8743a');
  parts.box('paint', I, -inner, y - 0.1, (front + back) / 2, 0.16, 0.26, front - back + 0.16, '#8a5a32');
  parts.box('paint', I, inner, y - 0.1, (front + back) / 2, 0.16, 0.26, front - back + 0.16, '#8a5a32');
  parts.box('paint', I, 0, y - 0.1, back, inner * 2 + 0.16, 0.26, 0.16, '#8a5a32');
  for (const [x, z] of [[-inner, front], [-inner, -5.0], [-inner, -7.2], [-inner, back], [inner, front], [inner, -5.0], [inner, -7.2], [inner, back], [-2.45, back], [2.45, back]]) {
    parts.box('paint', I, x, (y - 0.2) / 2, z, 0.14, y - 0.2, 0.14, '#8a5a32');
  }
  const rail = (a, b) => {
    parts.rod(I, [a[0], y + 0.95, a[1]], [b[0], y + 0.95, b[1]], 0.035, '#6b4a2c');
    parts.rod(I, [a[0], y + 0.1, a[1]], [b[0], y + 0.1, b[1]], 0.015);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= len; t += 0.16) parts.rod(I, [a[0] + ((b[0] - a[0]) * t) / len, y + 0.03, a[1] + ((b[1] - a[1]) * t) / len], [a[0] + ((b[0] - a[0]) * t) / len, y + 0.95, a[1] + ((b[1] - a[1]) * t) / len], 0.008);
  };
  rail([-inner, front], [-inner, back]);
  rail([inner, front], [inner, back]);
  rail([-inner, back], [inner, back]);
  // planters of geraniums over the back rail, ivy trailing over the side rails
  const r = rng(77);
  for (const x of [-2.5, 0, 2.5]) {
    parts.box('paint', I, x, y + 1.05, back + 0.12, 0.95, 0.22, 0.26, '#8a4f2c');
    for (let i = 0; i < 14; i++) parts.leaf(I, x + (r() - 0.5) * 0.9, y + 1.2 + r() * 0.1, back + 0.12 + (r() - 0.5) * 0.2, 0.08, col.setHSL(0.27 + r() * 0.07, 0.45, 0.3 + r() * 0.1).getStyle());
    for (let i = 0; i < 9; i++) parts.leaf(I, x + (r() - 0.5) * 0.85, y + 1.3 + r() * 0.08, back + 0.12 + (r() - 0.5) * 0.2, 0.055, '#d63a2f');
    for (let i = 0; i < 6; i++) { const lx = x + (r() - 0.5) * 0.9; for (let k = 0; k < 5; k++) parts.leaf(I, lx, y + 1.0 - k * 0.12, back + 0.27, 0.05, col.setHSL(0.29, 0.45, 0.28 + r() * 0.1).getStyle()); }
  }
  for (const s of [-1, 1]) for (let z = front - 0.2; z > back; z -= 0.35) { const n = 2 + Math.floor(r() * 5); for (let k = 0; k < n; k++) parts.leaf(I, s * inner + (r() - 0.5) * 0.08, y + 0.95 - k * 0.11, z + (r() - 0.5) * 0.1, 0.05, col.setHSL(0.29, 0.45, 0.27 + r() * 0.1).getStyle()); }
  // record shelves along the walls, under the gallery and up on it
  for (const s of [-1, 1]) for (const [yy, z0, z1] of [[0, -1.2, -9.2], [y + 0.03, -3.2, -9.0]]) {
    const len = z0 - z1;
    parts.box('paint', I, s * (X - 0.2), yy + 0.9, (z0 + z1) / 2, 0.4, 1.8, len, '#7a5634');
    for (let lv = 0; lv < 3; lv++) for (let z = z0 - 0.06; z > z1 + 0.04; z -= 0.035) parts.box('paint', I, s * (X - 0.42), yy + 0.3 + lv * 0.55, z, 0.04, 0.31, 0.03, col.setHSL(r(), 0.4 + r() * 0.2, 0.42 + r() * 0.25).getStyle());
  }
  // hanging plants on chains, and the green pendant lamp over the crate table
  for (const [x, z, drop] of [[-2.0, -3.2, 3.6], [2.1, -3.6, 3.2], [-2.4, -7.6, 3.0], [2.3, -7.2, 3.4]]) {
    const topY = HALL.spring + Math.sqrt(Math.max(0, X * X - x * x)) - 0.1;
    const yb = topY - drop;
    parts.rod(I, [x, topY, z], [x, yb + 0.25, z], 0.008, '#c9a85a');
    parts.push('paint', new CylinderGeometry(0.2, 0.14, 0.24, 10), '#c4673d', trs(x, yb + 0.12, z));
    for (let i = 0; i < 30; i++) {
      const a = r() * 6.28, rr = 0.12 + r() * 0.16, fall = r() * r() * 1.1;
      parts.leaf(I, x + Math.cos(a) * rr, yb + 0.22 - fall, z + Math.sin(a) * rr, 0.07, col.setHSL(0.27 + r() * 0.06, 0.48, 0.3 + r() * 0.12).getStyle());
    }
  }
  const lampY = 5.0, lampZ = -4.6;
  parts.rod(I, [0, HALL.spring + X - 0.1, lampZ], [0, lampY + 0.2, lampZ], 0.01);
  parts.push('paint', new CylinderGeometry(0.12, 0.42, 0.34, 16, 1, true), '#3f6e6a', trs(0, lampY, lampZ));
  parts.glows.push({ p: new Vector3(0, lampY - 0.15, lampZ), order: 0, size: 1.6, steady: true, inside: true });
  // the crate table in the middle (the app's trough), its sleeves standing in a row
  const T = trs(0, 0, -5.6);
  parts.box('paint', T, 0, 0.755, 0, 2.4, 0.05, 0.62, '#a8743a');
  for (const x of [-1.1, 1.1]) for (const z of [-0.24, 0.24]) parts.box('paint', T, x, 0.365, z, 0.07, 0.73, 0.07, '#8a5a32');
  parts.box('paint', T, 0, 0.18, 0, 2.25, 0.03, 0.5, '#8a5a32');
  parts.box('paint', T, 0, 0.795, -0.02, 2.1, 0.03, 0.42, '#b98a52');
  parts.box('paint', T, 0, 0.83, 0.19, 2.1, 0.07, 0.02, '#b98a52');
  parts.box('paint', T, 0, 0.88, -0.23, 2.1, 0.17, 0.02, '#b98a52');
  extras.covers.push({ M: T, n: 18, y: 0.81 + 0.155, x0: -0.82, sp: 0.095, yaw: 1.25 });
  // the striped rug under it
  for (let i = 0; i < 7; i++) parts.box('paint', I, 0, 0.012, -4.0 - i * 0.48, 3.2, 0.012, 0.48, ['#c4673d', '#e9dcc2', '#d9a441', '#c4673d', '#5d7a52', '#e9dcc2', '#c4673d'][i]);
  // crate tables either side, full of records
  for (const [x, z, ry] of [[-3.0, -3.6, 0.15], [3.0, -3.8, -0.12], [-3.1, -7.4, -0.1], [3.1, -7.0, 0.1]]) {
    const Tb = trs(x, 0, z, 0, ry, 0);
    parts.box('paint', Tb, 0, 0.7, 0, 1.3, 0.05, 0.8, '#a8743a');
    for (const lx of [-0.58, 0.58]) for (const lz of [-0.34, 0.34]) parts.box('paint', Tb, lx, 0.34, lz, 0.06, 0.68, 0.06, '#8a5a32');
    crate(parts, mul(Tb, trs(-0.31, 0.72, 0, 0, Math.PI / 2, 0)), 0.38, 0.6, 0.28, Math.round(x * 13 + z), 'records');
    crate(parts, mul(Tb, trs(0.31, 0.72, 0, 0, Math.PI / 2, 0)), 0.38, 0.6, 0.28, Math.round(x * 17 - z), 'records');
  }
  // a fern and a bush by the walls
  pottedPlant(parts, I, -4.7, 0, -1.2, 1.2, 99, 'bush');
  pottedPlant(parts, I, 4.7, 0, -1.3, 1.1, 98, 'geranium');
}

export function buildAlley({ materials, toonMat, font }) {
  const parts = new Parts();
  const root = new Group();
  const extras = { covers: [], font };
  // paving: the alley, and the piazza in front of the shop
  parts.box('paving', new Matrix4(), 0, -0.05, (ALLEY.z0 + ALLEY.z1 + 2) / 2, STREET_HALF * 2, 0.1, ALLEY.z1 + 2 - ALLEY.z0, '#ffffff');
  parts.box('piazza', new Matrix4(), 0, -0.05, ALLEY.z0 / 2, PIAZZA_HALF * 2, 0.1, ALLEY.z0, '#ffffff');
  // houses down both sides of the alley
  for (const side of [-1, 1]) {
    const r = rng(side < 0 ? 3 : 4);
    let z = ALLEY.z0, i = 0;
    while (ALLEY.z1 - z > 0.1) {
      let w = 3.4 + r() * 2.6;
      if (ALLEY.z1 - z - w < 3.2) w = ALLEY.z1 - z;
      const set = (r() - 0.5) * 0.16;
      const M = side < 0 ? frame([-STREET_HALF + set, 0, z + w], [0, 0, -1], [1, 0, 0]) : frame([STREET_HALF - set, 0, z], [0, 0, 1], [-1, 0, 0]);
      house(parts, M, {
        w, seed: (side < 0 ? 3 : 4) * 100 + i * 17, h: 7.4 + r() * 3.2, brick: r() < 0.4, balcony: r() < 0.45,
        lantern: i % 2 === 0 ? (r() > 0.5 ? 'left' : 'right') : null, ground: ['shop', 'door', 'garage', 'door', 'shop'][Math.floor(r() * 5)],
      });
      z += w;
      i++;
    }
  }
  // the piazza: a house each side, and the ends of the alley rows facing it
  for (const s of [-1, 1]) {
    const M = s < 0 ? frame([-PIAZZA_HALF, 0, ALLEY.z0], [0, 0, -1], [1, 0, 0]) : frame([PIAZZA_HALF, 0, 0], [0, 0, 1], [-1, 0, 0]);
    house(parts, M, { w: ALLEY.z0, seed: 800 + s, h: 8.8, brick: s > 0, balcony: true, ground: s < 0 ? 'shop' : 'door', lantern: 'right', pipe: false });
    const E = s < 0 ? frame([-STREET_HALF, 0, ALLEY.z0], [-1, 0, 0], [0, 0, -1]) : frame([PIAZZA_HALF, 0, ALLEY.z0], [-1, 0, 0], [0, 0, -1]);
    const ew = PIAZZA_HALF - STREET_HALF;
    wall(parts, 'stone', mul(E, trs(0, 0, 0.3)), { w: ew, y1: 8.8, color: '#ffffff' });
    eaves(parts, E, ew, 8.8, 830 + s);
  }
  archBridge(parts);
  shopFront(parts, root, extras);
  streetLife(parts);
  stringLights(parts, [-PIAZZA_HALF + 0.1, 4.4, 4.2], [PIAZZA_HALF - 0.1, 4.6, 0.3], 16, 0.4);
  stringLights(parts, [-PIAZZA_HALF + 0.1, 4.5, 0.4], [PIAZZA_HALF - 0.1, 4.3, 4.3], 16, 0.5);
  hall(parts, root, extras);
  root.add(parts.build(materials));
  const doors = doorLeaves(root, toonMat);
  return { root, doors, glows: parts.glows, windows: parts.windows, covers: extras.covers };
}

export { mul };
