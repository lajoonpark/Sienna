// Masonry: walls of real 3D stone bricks laid course by course around openings, arches with
// voussoirs, plaster walls with patches of exposed brick, and flagstone paving.
//
// Walls are built in a local frame: x runs along the wall from 0 to w, y is up from the ground,
// and +z points out of the face (front of the bricks sits at z = 0). M places that frame in the world.
import * as THREE from 'three';
import { BRICK, trs, mul } from './kit.js';
import { toon } from './materials.js';
import { rng } from './rand.js';

export const PALETTES = {
  honey: { h: [30, 42], s: [38, 58], l: [56, 72], mortar: '#e3cfa6' },
  rose: { h: [14, 30], s: [34, 52], l: [56, 70], mortar: '#e6cdb0' },
  grey: { h: [28, 48], s: [10, 22], l: [58, 72], mortar: '#ddd2bf' },
  brick: { h: [8, 20], s: [44, 60], l: [46, 60], mortar: '#e2cfb4' },
};

function pick(r, [a, b]) { return a + r() * (b - a); }

export function stoneColor(r, pal) {
  return new THREE.Color().setHSL(pick(r, pal.h) / 360, pick(r, pal.s) / 100, pick(r, pal.l) / 100);
}

// ---- openings ------------------------------------------------------------
// rect: { type: 'rect', x (centre), y (bottom), w, h, lintel?: true }
// arch: { type: 'arch', x (centre), y (bottom), w, h (to crown), ring?: 0.26 }
function archDims(o) {
  const r = o.w / 2;
  return { r, spring: o.y + o.h - r, ring: o.ring ?? 0.26 };
}

// x-ranges blocked by openings for a course spanning [y0, y1]
function blocked(openings, y0, y1) {
  const out = [];
  for (const o of openings) {
    if (o.type === 'rect') {
      const top = o.y + o.h + (o.lintel ? BRICK.row : 0);
      if (y1 > o.y && y0 < o.y + o.h) out.push([o.x - o.w / 2, o.x + o.w / 2]);
      else if (o.lintel && y1 > o.y + o.h && y0 < top) out.push([o.x - o.w / 2 - 0.16, o.x + o.w / 2 + 0.16]);
    } else {
      const { r, spring, ring } = archDims(o);
      const R = r + ring;
      if (y1 <= o.y || y0 >= spring + R) continue;
      let hw;
      if (y1 <= spring) hw = r;
      else if (y0 <= spring) hw = R;
      else hw = Math.sqrt(Math.max(0, R * R - (y0 - spring) ** 2));
      if (hw > 0.02) out.push([o.x - hw, o.x + hw]);
    }
  }
  return out;
}

function freeIntervals(w, ranges) {
  ranges.sort((a, b) => a[0] - b[0]);
  const free = [];
  let x = 0;
  for (const [a, b] of ranges) {
    if (a > x) free.push([x, Math.min(a, w)]);
    x = Math.max(x, b);
    if (x >= w) break;
  }
  if (x < w) free.push([x, w]);
  return free.filter(([a, b]) => b - a > 0.06);
}

// Place one brick (local frame) spanning x0..x1 in course at height y.
function brick(kit, M, r, pal, x0, x1, y, { proud = 0 } = {}) {
  const L = x1 - x0 - BRICK.gap;
  if (L < 0.05) return;
  const jz = (r() - 0.5) * 0.03 + proud;
  const m = trs(
    (x0 + x1) / 2, y + BRICK.row / 2, -BRICK.depth / 2 + jz,
    (r() - 0.5) * 0.03, (r() - 0.5) * 0.04, (r() - 0.5) * 0.025,
    L / BRICK.len, 0.94 + r() * 0.1, 1,
  );
  kit.brick.add(mul(M, m), stoneColor(r, pal));
}

// Fill a free interval with bricks of random length; the last one is trimmed to fit exactly.
function course(kit, M, r, pal, a, b, y, first, opts) {
  let x = a;
  let L = first ? 0.15 + r() * 0.45 : 0.34 + r() * 0.38;
  while (x < b - 0.001) {
    if (b - x - L < 0.2) L = b - x <= 0.85 ? b - x : (b - x) / 2;
    brick(kit, M, r, pal, x, x + L, y, opts);
    x += L;
    L = 0.34 + r() * 0.38;
  }
}

export function voussoirs(kit, M, r, pal, o) {
  const { r: rad, spring, ring } = archDims(o);
  const mid = rad + ring / 2;
  const n = Math.max(7, Math.round((Math.PI * mid) / 0.24) | 1);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * (i + 0.5)) / n;
    const key = i === (n - 1) / 2;
    const tang = (Math.PI * mid) / n - BRICK.gap;
    const m = trs(
      o.x + Math.cos(a) * mid, spring + Math.sin(a) * mid, -BRICK.depth / 2 + (key ? 0.04 : 0.015),
      0, 0, a,
      (ring - BRICK.gap + (key ? 0.08 : 0)) / BRICK.len, (tang * (key ? 1.25 : 1)) / (BRICK.row - BRICK.gap), 1.05,
    );
    const c = stoneColor(r, pal);
    kit.brick.add(mul(M, m), key ? c.offsetHSL(0, 0, 0.06) : c);
  }
}

// Shape of the wall face with the openings cut out (used for the mortar backing and plaster).
function faceShape(w, y0, y1, openings) {
  const s = new THREE.Shape();
  s.moveTo(0, y0); s.lineTo(w, y0); s.lineTo(w, y1); s.lineTo(0, y1); s.closePath();
  for (const o of openings) {
    if (o.y + 0.001 < y0 || o.y >= y1) continue;
    const p = new THREE.Path();
    if (o.type === 'rect') {
      p.moveTo(o.x - o.w / 2, o.y); p.lineTo(o.x + o.w / 2, o.y);
      p.lineTo(o.x + o.w / 2, o.y + o.h); p.lineTo(o.x - o.w / 2, o.y + o.h); p.closePath();
    } else {
      const { r, spring } = archDims(o);
      p.moveTo(o.x - r, o.y); p.lineTo(o.x + r, o.y); p.lineTo(o.x + r, spring);
      p.absarc(o.x, spring, r, 0, Math.PI, false);
      p.closePath();
    }
    s.holes.push(p);
  }
  return s;
}

function slab(shape, depth, material, M, z) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 });
  geo.translate(0, 0, z);
  const mesh = new THREE.Mesh(geo, material);
  mesh.applyMatrix4(M);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A wall of stone bricks from y0 to y1 with openings. Returns meshes to add (the mortar backing).
export function brickWall(kit, M, { w, y0 = 0, y1, openings = [], seed = 1, pal = PALETTES.honey }) {
  const r = rng(seed);
  const rows = Math.round((y1 - y0) / BRICK.row);
  for (let i = 0; i < rows; i++) {
    const y = y0 + i * BRICK.row;
    const free = freeIntervals(w, blocked(openings, y, y + BRICK.row));
    free.forEach(([a, b], k) => course(kit, M, r, pal, a, b, y, k === 0 && a < 0.01 || (i % 2 === 0), {}));
  }
  for (const o of openings) {
    if (o.type === 'arch' && o.ring !== 0) voussoirs(kit, M, r, pal, o);
    if (o.type === 'rect' && o.lintel) {
      const m = trs(o.x, o.y + o.h + BRICK.row / 2, -BRICK.depth / 2 + 0.02, 0, 0, 0, 1, 1, 1);
      m.multiply(trs(0, 0, 0, 0, 0, 0, o.w + 0.3, BRICK.row - BRICK.gap, BRICK.depth + 0.02));
      kit.block.add(mul(M, m), stoneColor(r, pal).offsetHSL(0, -0.05, 0.05));
    }
  }
  // mortar backing, slightly recessed so the joints read as shadowed grooves
  const mortar = toon(pal.mortar);
  return [slab(faceShape(w, y0 - (y0 <= 0 ? 0.3 : 0), y1, openings), 0.12, mortar, M, -BRICK.depth - 0.02)];
}

// A plaster wall (rendered stucco) with openings, plus a few patches where it has fallen off
// and the brick shows through.
export function plasterWall(kit, M, { w, y0, y1, openings = [], color, seed = 1, pal = PALETTES.honey, patches = 2 }) {
  const r = rng(seed + 900);
  const meshes = [slab(faceShape(w, y0, y1, openings), 0.2, toon(color), M, -BRICK.depth + 0.02)];
  for (let p = 0; p < patches; p++) {
    const cx = 0.6 + r() * (w - 1.2), cy = y0 + 0.5 + r() * (y1 - y0 - 1);
    const rx = 0.35 + r() * 0.5, ry = 0.25 + r() * 0.35;
    const rows = Math.ceil((ry * 2) / BRICK.row);
    for (let i = 0; i < rows; i++) {
      const y = cy - ry + i * BRICK.row;
      const t = (y + BRICK.row / 2 - cy) / ry;
      const hw = rx * Math.sqrt(Math.max(0, 1 - t * t)) * (0.75 + r() * 0.4);
      if (hw < 0.12) continue;
      const ranges = blocked(openings, y, y + BRICK.row);
      const free = freeIntervals(w, ranges.concat([[0, cx - hw], [cx + hw, w]]));
      free.forEach(([a, b]) => course(kit, M, r, pal, a, b, y, i % 2 === 0, { proud: 0.035 }));
    }
  }
  return meshes;
}

// A free-standing arch spanning the street: two brick faces, voussoirs both sides, a brick soffit.
// Local frame: x across the street (0..w), depth d along -z from the front face.
export function archBridge(kit, M, { w, h, d, archW, archH, seed = 3, pal = PALETTES.honey, plaster }) {
  const r = rng(seed);
  const o = { type: 'arch', x: w / 2, y: 0, w: archW, h: archH };
  const meshes = [];
  const front = M;
  const back = mul(M, trs(w, 0, -d, 0, Math.PI, 0)); // back face looks the other way
  const brickTop = archH + 1.1;
  meshes.push(...brickWall(kit, front, { w, y1: brickTop, openings: [o], seed, pal }));
  meshes.push(...brickWall(kit, back, { w, y1: brickTop, openings: [o], seed: seed + 1, pal }));
  if (plaster) {
    meshes.push(...plasterWall(kit, front, { w, y0: brickTop, y1: h, color: plaster, seed: seed + 2, pal, patches: 1 }));
    meshes.push(...plasterWall(kit, back, { w, y0: brickTop, y1: h, color: plaster, seed: seed + 3, pal, patches: 1 }));
  }
  // body in between (hidden mostly; gives the soffit something to sit on)
  const body = new THREE.Shape();
  const { r: rad, spring } = archDims(o);
  body.moveTo(0, -0.3); body.lineTo(o.x - rad, -0.3); body.lineTo(o.x - rad, spring);
  body.absarc(o.x, spring, rad, Math.PI, 0, true);
  body.lineTo(o.x + rad, -0.3); body.lineTo(w, -0.3); body.lineTo(w, h); body.lineTo(0, h); body.closePath();
  meshes.push(slab(body, d - 0.4, toon(pal.mortar), M, -d + 0.2));
  // soffit bricks: courses following the curve, staggered along the depth
  const n = Math.round((Math.PI * rad) / 0.24);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * (i + 0.5)) / n;
    const cx = o.x + Math.cos(a) * (rad + 0.07), cy = spring + Math.sin(a) * (rad + 0.07);
    let z = -0.2 - (i % 2 ? 0.25 : 0);
    while (z > -d + 0.2) {
      const L = Math.min(0.5, z + d - 0.2);
      const m = trs(cx, cy, z - L / 2, 0, 0, a, 0.7, ((Math.PI * rad) / n - BRICK.gap) / (BRICK.row - BRICK.gap), (L - BRICK.gap) / BRICK.len);
      // brick part is along x by default; rotate so its long side runs along the depth and its face (+z, the
      // side a card wall keeps) looks into the opening
      kit.brick.add(mul(M, m.multiply(trs(0, 0, 0, 0, -Math.PI / 2, 0))), stoneColor(r, pal));
      z -= L;
    }
    // straight jambs below the spring
    if (i === 0 || i === n - 1) {
      const side = i === 0 ? 1 : -1;
      for (let y = 0; y < spring; y += BRICK.row) {
        let z2 = -0.2 - ((y / BRICK.row) % 2 ? 0.25 : 0);
        while (z2 > -d + 0.2) {
          const L = Math.min(0.5, z2 + d - 0.2);
          const m = trs(o.x + side * (rad + 0.07), y + BRICK.row / 2, z2 - L / 2, 0, -side * Math.PI / 2, 0, (L - BRICK.gap) / BRICK.len, 1, 0.7); // face into the opening
          kit.brick.add(mul(M, m), stoneColor(r, pal));
          z2 -= L;
        }
      }
    }
  }
  return meshes;
}

// Big irregular flagstones laid in courses across a rectangle (world x0..x1, z0..z1) at y = 0.
export function flagstones(kit, { x0, x1, z0, z1, seed = 11, pal = PALETTES.grey, gutter = true }) {
  const r = rng(seed);
  let z = z0;
  while (z < z1) {
    const depth = 0.42 + r() * 0.3;
    let x = x0 - r() * 0.5;
    while (x < x1) {
      const w = 0.6 + r() * 0.7;
      const a0 = Math.max(x, x0), b0 = Math.min(x + w, x1);
      // trim stones at the gutter instead of dropping them
      const pieces = gutter && a0 < 0.22 && b0 > -0.22 ? [[a0, -0.22], [0.22, b0]] : [[a0, b0]];
      for (const [a, b] of pieces) {
        if (b - a < 0.1) continue;
        const m = trs((a + b) / 2, 0.03 + (r() - 0.5) * 0.025, z + depth / 2,
          (r() - 0.5) * 0.03, (r() - 0.5) * 0.06, (r() - 0.5) * 0.03, b - a - 0.05, 1, depth - 0.05);
        kit.flag.add(m, stoneColor(r, pal));
      }
      x += w;
    }
    z += depth;
  }
  if (gutter) {
    // a shallow channel of small setts down the middle
    for (let zz = z0; zz < z1; zz += 0.2) {
      for (const xx of [-0.1, 0.1]) {
        const m = trs(xx + (r() - 0.5) * 0.02, 0.0, zz + 0.1, 0, (r() - 0.5) * 0.2, 0, 0.17, 0.8, 0.17);
        kit.flag.add(m, stoneColor(r, pal).offsetHSL(0, 0, -0.08));
      }
    }
  }
  // dark ground underneath so the joints read as gaps
  const under = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), toon(pal.joint ?? '#8a7f78'));
  under.rotation.x = -Math.PI / 2;
  under.position.set((x0 + x1) / 2, -0.01, (z0 + z1) / 2);
  under.receiveShadow = true;
  return under;
}

// Plaster panel from any outline (local frame), with optional holes; front face at z = 0.
export function plasterPanel(shape, M, color, depth = 0.2) {
  return slab(shape, depth, toon(color), M, -depth);
}

// Outline of a wall that ends in a semicircular top (the end wall of a barrel vault), x 0..w.
// It reaches VAULT_RIM past the vault's inner radius (w / 2), out to the vault's mortar shell, so it closes
// the whole brick ring where the vault meets it. Cut at the inner radius, the gaps between the brick ends
// and the wall showed the sky behind as thin blue arches along the ceiling.
export const VAULT_RIM = BRICK.depth + 0.01;
export function lunetteShape(w, spring, rim = VAULT_RIM) {
  const s = new THREE.Shape();
  s.moveTo(-rim, -0.3); s.lineTo(w + rim, -0.3); s.lineTo(w + rim, spring);
  s.absarc(w / 2, spring, w / 2 + rim, 0, Math.PI, false);
  s.closePath();
  return s;
}

// Hole path for an arch opening (local frame).
export function archHole(o) {
  const r = o.w / 2, spring = o.y + o.h - r;
  const p = new THREE.Path();
  p.moveTo(o.x - r, o.y); p.lineTo(o.x + r, o.y); p.lineTo(o.x + r, spring);
  p.absarc(o.x, spring, r, 0, Math.PI, false); p.closePath();
  return p;
}

// Brick barrel vault seen from below. World axis: runs along z from z0 to z1 (z0 > z1),
// centred on x = cx, springing at height spring with radius r. Includes a mortar shell behind
// the bricks so joints read as mortar and no light leaks through.
export function barrelVault(kit, { cx = 0, spring, r, z0, z1, seed = 1, pal = PALETTES.honey, skylight = null }) {
  const rr = rng(seed);
  const n = Math.round((Math.PI * r) / BRICK.row);
  const tang = (Math.PI * r) / n;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * (i + 0.5)) / n;
    const x = cx + Math.cos(a) * (r + BRICK.depth / 2), y = spring + Math.sin(a) * (r + BRICK.depth / 2);
    let z = z0 - (i % 2 ? BRICK.len / 2 : 0);
    let first = true;
    while (z > z1 + 0.02) {
      const L = Math.min(first && i % 2 ? BRICK.len / 2 : 0.34 + rr() * 0.36, z - z1);
      first = false;
      const zc = z - L / 2;
      if (skylight && Math.hypot(x - skylight.x, zc - skylight.z) < skylight.r && y > spring + r * 0.8) { z -= L; continue; }
      const m = trs(x, y, zc, 0, 0, a, 1, 1, 1)
        .multiply(trs(0, 0, 0, 0, -Math.PI / 2, 0, (L - BRICK.gap) / BRICK.len, (tang - BRICK.gap) / (BRICK.row - BRICK.gap), 1)); // face (+z) looks down into the vault
      kit.brick.add(m, stoneColor(rr, pal));
      z -= L;
    }
  }
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(r + VAULT_RIM, r + VAULT_RIM, z0 - z1, 40, 1, true, -Math.PI / 2, Math.PI),
    toon(pal.mortar, { side: THREE.BackSide }),
  );
  shell.rotation.x = -Math.PI / 2;
  shell.position.set(cx, spring, (z0 + z1) / 2);
  shell.castShadow = true;
  shell.receiveShadow = true;
  return shell;
}
