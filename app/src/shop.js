// The Sienna record shop interior: an old Tuscan building of brick barrel vaults going back.
//   1. the big hall (z -0.55 .. -10.5): crate-digging tables, a U-shaped wooden gallery with a
//      spiral stair, a listening corner and the counter
//   2. the listening lounge (z -11 .. -15): sofa, record wall, turntable and speakers
//   3. the stacks (z -15.5 .. -19.5): floor-to-vault shelves and a library ladder
//   4. the plant room (z -20 .. -24): skylight in the vault, plants everywhere
//   5. the courtyard (z -24.5 .. -30.5): open sky, lemon tree, string lights
// Six category zones: hall floor, gallery, lounge, stacks, plant room, courtyard.
import * as THREE from 'three';
import { createKit, trs, mul, BRICK } from './kit.js';
import { brickWall, plasterPanel, lunetteShape, archHole, barrelVault, voussoirs, flagstones, PALETTES } from './masonry.js';
import { blk, rod, pottedPlant } from './details.js';
import { recordShelf, binTable, crateOfRecords, turntable, speaker, armchair, sofa, rug, floorLamp, hangingPlant, trailingIvy, floorTree, spiralStair, pendant, ladder } from './interior.js';
import { cafeSet, stringLights } from './props.js';
import { toon } from './materials.js';
import { rng } from './rand.js';

const PLASTER = '#ead6b4';
const PAL = PALETTES.honey;
const HALL = { x: 5.4, z0: -0.55, z1: -10.5, spring: 3.6 };
const VAULTS = [
  { z0: -11, z1: -15, name: 'lounge' },
  { z0: -15.5, z1: -19.5, name: 'stacks' },
  { z0: -20, z1: -24, name: 'plants' },
];
const VX = 3.3, VSPRING = 3.0;
const COURT = { x: 4.5, z0: -24.5, z1: -30.5 };
const GALLERY = { y: 3.0, inner: 3.7, front: -2.6, back: -9.3 };

export const ZONES = [
  { id: 'hall', at: [0, 1.7, -6] },
  { id: 'gallery', at: [-4.5, 4.6, -6] },
  { id: 'lounge', at: [0, 1.7, -13] },
  { id: 'stacks', at: [0, 1.7, -17.5] },
  { id: 'plants', at: [0, 1.7, -22] },
  { id: 'courtyard', at: [0, 1.7, -27.5] },
];

// Furniture that a station's rack replaces lives in its own group: the shop keeps it when no shelf
// is assigned to the station, and main hides it (root.userData.stationFurniture[id].visible = false)
// when a rack stands there.
let STATION_FURNITURE = null;
function stationFurniture(id, build) {
  const kit = createKit();
  build(kit);
  const g = new THREE.Group();
  kit.flush(g);
  g.userData.ownStrokes = true; // it comes and goes: its brush strokes never stand in for the wall's (brushstrokes.js)
  STATION_FURNITURE[id] = g;
}

function frame(o, along, normal) {
  const x = new THREE.Vector3(...along), z = new THREE.Vector3(...normal);
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...o);
}

// Lining for an arch opening through a wall of given thickness (local frame, from z=0 back).
function reveal(M, o, depth, color = '#e0c9a0') {
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

// Terracotta floor tiles over a rectangle.
function cotto(kit, x0, x1, z0, z1, seed) {
  const r = rng(seed);
  const s = 0.4;
  for (let z = z0; z > z1 + 0.05; z -= s) {
    for (let x = x0; x < x1 - 0.05; x += s) {
      const w = Math.min(s, x1 - x), d = Math.min(s, z - z1);
      const c = new THREE.Color().setHSL((12 + r() * 12) / 360, 0.45 + r() * 0.15, 0.5 + r() * 0.12);
      kit.flag.add(trs(x + w / 2, 0.0, z - d / 2, 0, (r() - 0.5) * 0.03, 0, w - 0.025, 0.35, d - 0.025), c);
    }
  }
  const under = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z0 - z1), toon('#d8c3a5'));
  under.rotation.x = -Math.PI / 2;
  under.position.set((x0 + x1) / 2, -0.005, (z0 + z1) / 2);
  under.receiveShadow = true;
  return under;
}

// A transverse wall between two rooms: plaster lunettes on both faces, a brick arch, lined opening.
function crossWall(kit, out, z, wF, springF, wB, springB, o, seed) {
  const F = frame([-wF / 2, 0, z], [1, 0, 0], [0, 0, 1]);
  const oF = { ...o, x: wF / 2 };
  const sF = lunetteShape(wF, springF); sF.holes.push(archHole(oF));
  out.push(plasterPanel(sF, F, PLASTER));
  voussoirs(kit, F, rng(seed), PAL, oF);
  out.push(reveal(F, oF, 0.5));
  if (wB) {
    const B = frame([wB / 2, 0, z - 0.5], [-1, 0, 0], [0, 0, -1]);
    const oB = { ...o, x: wB / 2 };
    const sB = lunetteShape(wB, springB); sB.holes.push(archHole(oB));
    out.push(plasterPanel(sB, B, PLASTER));
    voussoirs(kit, B, rng(seed + 1), PAL, oB);
  }
}

// Plaster side walls of a room from z0 to z1 at x = ±hw, up to the vault spring.
function sideWalls(out, hw, z0, z1, spring) {
  for (const s of [-1, 1]) {
    const M = s < 0 ? frame([-hw, 0, z0], [0, 0, -1], [1, 0, 0]) : frame([hw, 0, z1], [0, 0, 1], [-1, 0, 0]);
    const sh = new THREE.Shape();
    const w = z0 - z1;
    sh.moveTo(0, -0.2); sh.lineTo(w, -0.2); sh.lineTo(w, spring + 0.3); sh.lineTo(0, spring + 0.3); sh.closePath();
    out.push(plasterPanel(sh, M, PLASTER));
    // painted skirting band
    const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.03), toon('#d9a07a'));
    band.applyMatrix4(mul(M, trs(w / 2, 0.25, 0.03)));
    out.push(band);
  }
}

function gallery(kit, out) {
  const { y, inner, front, back } = GALLERY;
  const X = HALL.x, Z1 = HALL.z1;
  const wood = '#8a5a32', plank = '#a8743a', iron = '#2b2a2e';
  const I = new THREE.Matrix4();
  // floors: left wing, right wing, back wing
  const r = rng(77);
  const deck = (x0, x1, z0, z1, alongZ) => {
    if (alongZ) for (let x = x0; x < x1 - 0.01; x += 0.2) blk(kit, I, x + 0.1, y, (z0 + z1) / 2, 0.19, 0.06, z0 - z1, new THREE.Color(plank).offsetHSL(0, 0, (r() - 0.5) * 0.06));
    else for (let z = z0; z > z1 + 0.01; z -= 0.2) blk(kit, I, (x0 + x1) / 2, y, z - 0.1, x1 - x0, 0.06, 0.19, new THREE.Color(plank).offsetHSL(0, 0, (r() - 0.5) * 0.06));
  };
  deck(-X, -inner, front, back, true);
  deck(inner, X, front, back, true);
  deck(-X, X, back, Z1, false);
  // joists underneath
  for (let z = front - 0.2; z > Z1; z -= 0.6) {
    blk(kit, I, -(X + inner) / 2, y - 0.12, z, X - inner, 0.18, 0.1, wood);
    blk(kit, I, (X + inner) / 2, y - 0.12, z, X - inner, 0.18, 0.1, wood);
  }
  for (let x = -X + 0.3; x < X; x += 0.6) blk(kit, I, x, y - 0.12, (back + Z1) / 2, 0.1, 0.18, back - Z1, wood);
  // edge beams
  blk(kit, I, -inner, y - 0.1, (front + back) / 2, 0.16, 0.26, front - back + 0.16, wood);
  blk(kit, I, inner, y - 0.1, (front + back) / 2, 0.16, 0.26, front - back + 0.16, wood);
  blk(kit, I, 0, y - 0.1, back, inner * 2 + 0.16, 0.26, 0.16, wood);
  blk(kit, I, (X + inner) / 2, y - 0.1, front, X - inner, 0.26, 0.16, wood);
  blk(kit, I, -(X + inner) / 2, y - 0.1, front, X - inner, 0.26, 0.16, wood);
  // posts with knee braces
  const posts = [[-inner, front], [-inner, -5.0], [-inner, -7.2], [-inner, back], [inner, front], [inner, -5.0], [inner, -7.2], [inner, back], [-2.45, back], [2.45, back]];
  for (const [x, z] of posts) {
    blk(kit, I, x, (y - 0.2) / 2, z, 0.14, y - 0.2, 0.14, wood);
    blk(kit, I, x, 0.05, z, 0.22, 0.1, 0.22, '#5a3d24');
  }
  // railings: wooden top rail, iron balusters
  const rail = (a, b) => {
    rod(kit, I, [a[0], y + 0.95, a[1]], [b[0], y + 0.95, b[1]], 0.035, '#6b4a2c');
    rod(kit, I, [a[0], y + 0.1, a[1]], [b[0], y + 0.1, b[1]], 0.015, iron);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= len; t += 0.13) {
      const x = a[0] + ((b[0] - a[0]) * t) / len, z = a[1] + ((b[1] - a[1]) * t) / len;
      rod(kit, I, [x, y + 0.03, z], [x, y + 0.95, z], 0.008, iron);
    }
  };
  rail([-inner, front], [-inner, back]);
  rail([inner, front], [inner, back]);
  rail([-inner, back], [inner, back]);
  rail([inner, front], [X - 0.05, front]);
  rail([-2.0, Z1 + 0.06], [2.0, Z1 + 0.06]); // across the arch behind the back wing
  // ivy trailing over the rails
  trailingIvy(kit, frame([-inner, y + 0.95, front], [0, 0, -1], [1, 0, 0]), 0.2, front - back - 0.2, 0, 81);
  trailingIvy(kit, frame([inner, y + 0.95, back], [0, 0, 1], [-1, 0, 0]), 0.2, front - back - 0.2, 0, 82);
  trailingIvy(kit, frame([-inner, y + 0.95, back], [1, 0, 0], [0, 0, 1]), 0.2, inner * 2 - 0.2, 0, 83);
  // shelves up on the gallery, low enough for the vault
  // the middle of the left wing (z -4.6..-7.4) is the floor-lean rack's; its stand-in shelf lives
  // in a station group, the dressing at both ends stays either way
  stationFurniture('gallery', (k) => recordShelf(k, frame([-X + 0.3, y + 0.03, -6.0], [0, 0, -1], [1, 0, 0]), { w: 2.8, h: 1.35, levels: 3, seed: 91 }));
  recordShelf(kit, frame([-X + 0.3, y + 0.03, -8.55], [0, 0, -1], [1, 0, 0]), { w: 1.4, h: 0.95, levels: 2, seed: 93 });
  crateOfRecords(kit, trs(-X + 0.5, y + 0.03, -3.95, 0, Math.PI / 2, 0), 0.7, 0.5, 94);
  crateOfRecords(kit, trs(-X + 0.5, y + 0.33, -3.95, 0, Math.PI / 2 + 0.08, 0), 0.7, 0.5, 96);
  pottedPlant(kit, I, -X + 0.35, y + 0.03, -3.3, 1.4, 97, 'geranium');
  pottedPlant(kit, I, -X + 0.35, y + 0.03, -9.45, 1.2, 98, 'bush');
  recordShelf(kit, frame([X - 0.3, y + 0.03, -6.3], [0, 0, 1], [-1, 0, 0]), { w: 6.2, h: 1.35, levels: 3, seed: 92 });
  armchair(kit, frame([-4.6, y + 0.03, -9.9], [1, 0, 0], [0, 0, 1]), '#3f6e6a');
  out.push(floorLamp(kit, frame([-3.9, y + 0.03, -10.1], [1, 0, 0], [0, 0, 1])));
  pottedPlant(kit, I, 4.6, y + 0.03, -9.9, 1.3, 95, 'bush');
  // spiral stair up to the left wing
  const steps = 15, turn = Math.PI * 1.5;
  const start = -Math.PI / 2 - (turn * (steps - 0.5)) / steps;
  spiralStair(kit, trs(-4.55, 0, -1.75), { radius: 0.8, rise: y, turn, start, steps });
}

export function buildShop() {
  const root = new THREE.Group();
  STATION_FURNITURE = {};
  root.userData.stationFurniture = STATION_FURNITURE;
  const kit = createKit();
  const out = [];
  const I = new THREE.Matrix4();

  // ---- shell -------------------------------------------------------------
  out.push(cotto(kit, -HALL.x, HALL.x, HALL.z0, HALL.z1, 1));
  VAULTS.forEach((v, i) => out.push(cotto(kit, -VX, VX, v.z0 + (i === 0 ? 0.5 : 0.5), v.z1, 2 + i)));
  out.push(cotto(kit, -2.0, 2.0, -10.5, -11, 9));
  out.push(cotto(kit, -1.8, 1.8, -15, -15.5, 10));
  out.push(cotto(kit, -1.8, 1.8, -19.5, -20, 11));
  out.push(cotto(kit, -1.6, 1.6, -24, -24.5, 12));
  root.add(flagstones(kit, { x0: -COURT.x, x1: COURT.x, z0: COURT.z1, z1: COURT.z0, seed: 13, gutter: false, pal: PALETTES.rose }));

  // hall
  sideWalls(out, HALL.x, HALL.z0, HALL.z1, HALL.spring);
  out.push(barrelVault(kit, { spring: HALL.spring, r: HALL.x, z0: HALL.z0, z1: HALL.z1, seed: 21 }));
  {
    const F = frame([HALL.x, 0, HALL.z0], [-1, 0, 0], [0, 0, -1]);
    const sh = lunetteShape(HALL.x * 2, HALL.spring);
    sh.holes.push(archHole({ x: HALL.x, y: 0, w: 2.0, h: 4.0 }));
    for (const dx of [-3, 3]) sh.holes.push(archHole({ x: HALL.x + dx, y: 0.55, w: 2.3, h: 3.4 }));
    out.push(plasterPanel(sh, F, PLASTER, 0.05));
  }
  const arch1 = { type: 'arch', y: 0, w: 4.0, h: 4.4, ring: 0.3 };
  crossWall(kit, out, HALL.z1, HALL.x * 2, HALL.spring, VX * 2, VSPRING, arch1, 31);

  // vaults
  const archN = { type: 'arch', y: 0, w: 3.6, h: 4.1, ring: 0.28 };
  VAULTS.forEach((v, i) => {
    sideWalls(out, VX, v.z0, v.z1, VSPRING);
    const sky = v.name === 'plants' ? { x: 0, z: (v.z0 + v.z1) / 2, r: 0.75 } : null;
    out.push(barrelVault(kit, { spring: VSPRING, r: VX, z0: v.z0, z1: v.z1, seed: 40 + i, skylight: sky }));
    const last = i === VAULTS.length - 1;
    crossWall(kit, out, v.z1, VX * 2, VSPRING, last ? 0 : VX * 2, VSPRING, last ? { type: 'arch', y: 0, w: 3.2, h: 3.9, ring: 0.28 } : archN, 50 + i);
  });

  // courtyard: brick walls open to the sky
  const ch = Math.round(6.6 / BRICK.row) * BRICK.row;
  {
    const back = frame([-COURT.x, 0, COURT.z1], [1, 0, 0], [0, 0, 1]);
    out.push(...brickWall(kit, back, { w: COURT.x * 2, y1: ch, seed: 61, pal: PALETTES.rose, openings: [{ type: 'arch', x: COURT.x, y: 0.9, w: 1.6, h: 2.3, ring: 0.22 }] }));
    // a wall fountain in the blind arch
    blk(kit, back, COURT.x, 0.45, 0.35, 1.9, 0.9, 0.7, '#e2d4ba');
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: '#9fc3cc', transparent: true, opacity: 0.8 }));
    water.applyMatrix4(mul(back, trs(COURT.x, 0.86, 0.38)));
    out.push(water);
    const niche = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), toon('#c9a07a'));
    niche.applyMatrix4(mul(back, trs(COURT.x, 2.0, -0.18)));
    out.push(niche);
    kit.ball.add(mul(back, trs(COURT.x, 2.1, -0.05, 0, 0, 0, 0.35, 0.4, 0.3)), '#d8ccb6');
    rod(kit, back, [COURT.x, 1.95, 0.08], [COURT.x, 1.9, 0.3], 0.025, '#9a8a6a');
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.0, 6), new THREE.MeshBasicMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.7 }));
    spout.applyMatrix4(mul(back, trs(COURT.x, 1.4, 0.32)));
    out.push(spout);
    for (const s of [-1, 1]) {
      const M = s < 0 ? frame([-COURT.x, 0, COURT.z0], [0, 0, -1], [1, 0, 0]) : frame([COURT.x, 0, COURT.z1], [0, 0, 1], [-1, 0, 0]);
      out.push(...brickWall(kit, M, { w: COURT.z0 - COURT.z1, y1: ch, seed: 62 + s, pal: PALETTES.rose }));
    }
    const front = frame([COURT.x, 0, COURT.z0], [-1, 0, 0], [0, 0, -1]);
    out.push(...brickWall(kit, front, { w: COURT.x * 2, y1: ch, seed: 64, pal: PALETTES.rose, openings: [{ type: 'arch', x: COURT.x, y: 0, w: 3.2, h: 3.9, ring: 0.28 }] }));
    // climbing ivy: vines that wander up from the ground, denser low down, with side shoots
    const r = rng(66);
    const walls = [
      { o: [-COURT.x + 0.1, 0, COURT.z0], u: [0, 0, -1], len: COURT.z0 - COURT.z1 },
      { o: [COURT.x - 0.1, 0, COURT.z1], u: [0, 0, 1], len: COURT.z0 - COURT.z1 },
      { o: [-COURT.x, 0, COURT.z1 + 0.1], u: [1, 0, 0], len: COURT.x * 2, skip: [COURT.x - 1.4, COURT.x + 1.4] },
    ];
    for (const w of walls) {
      for (let v = 0; v < 7; v++) {
        let a = 0.3 + r() * (w.len - 0.6);
        if (w.skip && a > w.skip[0] && a < w.skip[1]) continue;
        let y = 0;
        const top = ch * (0.45 + r() * 0.5);
        const shoots = [];
        while (y < top) {
          a += (r() - 0.5) * 0.25;
          y += 0.07 + r() * 0.05;
          if (r() < 0.06) shoots.push([a, y]);
          for (let k = 0; k < 3; k++) {
            const da = a + (r() - 0.5) * 0.35, dy = y + (r() - 0.5) * 0.1;
            const p = [w.o[0] + w.u[0] * da, dy, w.o[2] + w.u[2] * da];
            kit.leaf.add(trs(...p, r() * 3, r() * 6, r() * 3, 0.15, 0.06, 0.12), new THREE.Color().setHSL(0.27 + r() * 0.07, 0.45, 0.24 + r() * 0.16));
          }
        }
        for (const [sa, sy] of shoots) {
          let aa = sa, yy = sy;
          const dir = r() > 0.5 ? 1 : -1;
          for (let k = 0; k < 14; k++) {
            aa += dir * (0.06 + r() * 0.05); yy += (r() - 0.6) * 0.06;
            const p = [w.o[0] + w.u[0] * aa, yy, w.o[2] + w.u[2] * aa];
            kit.leaf.add(trs(...p, r() * 3, r() * 6, r() * 3, 0.13, 0.05, 0.1), new THREE.Color().setHSL(0.28 + r() * 0.06, 0.45, 0.28 + r() * 0.14));
          }
        }
      }
    }
  }

  // ---- hall contents -----------------------------------------------------
  gallery(kit, out);
  rug(kit, trs(0, 0, -5.8), 2.4, 6.0, 1);
  for (const z of [-4.4, -7.1]) for (const s of [-1, 1]) binTable(kit, trs(s * 2.05, 0, z, 0, Math.PI / 2, 0), Math.round(z * 10) + s);
  // under the gallery: shelves left, listening corner and shelves right, counter at the back
  recordShelf(kit, frame([-HALL.x + 0.25, 0, -6.3], [0, 0, -1], [1, 0, 0]), { w: 6.2, h: 2.65, levels: 6, seed: 101 });
  stationFurniture('cubby', (k) => recordShelf(k, frame([HALL.x - 0.25, 0, -6.9], [0, 0, 1], [-1, 0, 0]), { w: 4.2, h: 2.65, levels: 6, seed: 102 }));
  armchair(kit, frame([4.5, 0, -3.6], [0, 0, 1], [-1, 0, 0]), '#b84a3a');
  turntable(kit, frame([4.6, 0, -2.6], [0, 0, 1], [-1, 0, 0]));
  out.push(floorLamp(kit, trs(5.0, 0, -4.4)));
  kit.ball.add(trs(4.55, 1.05, -2.45, 0, 0, 0, 0.18, 0.06, 0.18), '#2b2a2e'); // headphones on the cabinet
  {
    const C = frame([2.3, 0, -8.85], [1, 0, 0], [0, 0, 1]);
    blk(kit, C, 1.45, 0.5, 0, 2.9, 1.0, 0.7, '#7a5634');
    for (let i = 0; i < 9; i++) blk(kit, C, 0.15 + i * 0.33, 0.5, 0.36, 0.02, 0.9, 0.02, '#5a3d24');
    blk(kit, C, 1.45, 1.04, 0.02, 3.0, 0.08, 0.8, '#d8c8aa');
    // the middle of the counter (x 3.35..4.65) is the easel's: till at the left end, plant and
    // turntable at the right
    blk(kit, C, 0.4, 1.2, -0.05, 0.42, 0.26, 0.34, '#c4673d'); // till
    blk(kit, C, 0.4, 1.36, -0.11, 0.38, 0.1, 0.2, '#e9e1d0', 0.4);
    turntable(kit, mul(C, trs(2.55, 1.08, 0)), { cabinet: false });
    pottedPlant(kit, C, 0.95, 1.08, -0.1, 0.6, 111, 'bush');
    crateOfRecords(kit, mul(C, trs(1.6, 0, 0.75, 0, 0.1, 0)), 0.7, 0.55, 112);
  }
  floorTree(kit, trs(-4.6, 0, -9.7), 2.4, 121);
  crateOfRecords(kit, trs(-3.9, 0, -9.0, 0, -0.3, 0), 0.7, 0.55, 122);
  crateOfRecords(kit, trs(-3.95, 0.3, -9.05, 0, -0.2, 0), 0.7, 0.55, 123);
  floorTree(kit, trs(-4.7, 0, -0.95), 1.9, 124);
  floorTree(kit, trs(4.75, 0, -1.0), 2.2, 125);
  // pendants down the middle, plants hanging from the vault
  for (const z of [-3.0, -6.0, -8.6]) out.push(...pendant(kit, trs(0, 0, z), 8.9, 3.6, { shade: '#3f6e6a' }));
  const vaultY = (x) => HALL.spring + Math.sqrt(HALL.x ** 2 - x ** 2);
  [[-2.4, -3.6], [2.4, -4.8], [-2.6, -7.8], [2.6, -6.6], [-1.3, -9.4], [1.5, -2.2]].forEach(([x, z], i) => {
    const top = vaultY(x);
    hangingPlant(kit, trs(x, top, z), top - 5.4 + (i % 3) * 0.4, 130 + i);
  });

  // ---- lounge ------------------------------------------------------------
  {
    const v = VAULTS[0];
    const zc = (v.z0 + v.z1) / 2;
    rug(kit, trs(-0.6, 0, zc, 0, Math.PI / 2, 0), 3.0, 2.4, 2);
    sofa(kit, frame([-2.6, 0, zc], [0, 0, -1], [1, 0, 0]), '#6a86a0', 2.2);
    blk(kit, I, -1.2, 0.2, zc, 0.6, 0.4, 1.0, '#7a5634');
    turntable(kit, trs(-1.2, 0.35, zc, 0, Math.PI / 2, 0), { cabinet: false });
    out.push(floorLamp(kit, trs(-2.8, 0, v.z0 - 0.5)));
    // record wall: sleeves faced out in a grid (the wall rack replaces it)
    stationFurniture('lounge', (k) => {
      const W = frame([VX - 0.05, 0, v.z1 + 0.4], [0, 0, 1], [-1, 0, 0]);
      const r = rng(141);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) {
        const c = new THREE.Color().setHSL(r(), 0.35 + r() * 0.4, 0.35 + r() * 0.35);
        blk(k, W, 0.4 + col * 0.46, 0.75 + row * 0.5, 0.03, 0.34, 0.34, 0.02, c);
        if (r() < 0.5) k.disc.add(mul(W, trs(0.4 + col * 0.46, 0.75 + row * 0.5, 0.045, Math.PI / 2, 0, 0, 0.12, 0.004, 0.12)), new THREE.Color().setHSL(r(), 0.5, 0.6));
      }
    });
    speaker(kit, frame([VX - 0.3, 0, v.z0 - 0.35], [0, 0, 1], [-1, 0, 0]));
    speaker(kit, frame([VX - 0.3, 0, v.z1 + 0.25], [0, 0, 1], [-1, 0, 0]));
    hangingPlant(kit, trs(1.6, VSPRING + Math.sqrt(VX ** 2 - 1.6 ** 2), zc - 0.8), 1.6, 145);
    out.push(...pendant(kit, trs(0, 0, zc), VSPRING + VX - 0.1, 2.0, { shade: '#c4673d' }));
  }

  // ---- stacks ------------------------------------------------------------
  {
    const v = VAULTS[1];
    const zc = (v.z0 + v.z1) / 2;
    recordShelf(kit, frame([-VX + 0.22, 0, zc], [0, 0, -1], [1, 0, 0]), { w: 3.8, h: 2.95, levels: 7, seed: 151 });
    // right-hand shelf, ladder, brass rail and the two crates in front: the tall rack replaces them
    stationFurniture('stacks', (k) => {
      recordShelf(k, frame([VX - 0.22, 0, zc], [0, 0, 1], [-1, 0, 0]), { w: 3.8, h: 2.95, levels: 7, seed: 152 });
      ladder(k, frame([VX - 0.5, 0, zc + 0.6], [0, 0, 1], [-1, 0, 0]), 3.0);
      rod(k, I, [VX - 0.42, 2.98, v.z0 - 0.1], [VX - 0.42, 2.98, v.z1 + 0.1], 0.015, '#c9a85a');
      crateOfRecords(k, trs(VX - 1.0, 0, v.z1 + 0.6, 0, 0.3, 0), 0.6, 0.5, 165);
      crateOfRecords(k, trs(VX - 1.0, 0.3, v.z1 + 0.62, 0, 0.2, 0), 0.6, 0.5, 166);
    });
    for (let k = 0; k < 4; k++) crateOfRecords(kit, trs(-VX + 0.75, 0, v.z0 - 0.5 - k * 0.9, 0, Math.PI / 2 + (k % 2) * 0.1, 0), 0.6, 0.5, 160 + k);
    out.push(...pendant(kit, trs(0, 0, zc), VSPRING + VX - 0.1, 2.3, { shade: '#e8b23a' }));
  }

  // ---- plant room --------------------------------------------------------
  {
    const v = VAULTS[2];
    const zc = (v.z0 + v.z1) / 2;
    const crown = VSPRING + VX + BRICK.depth;
    const sky = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: '#fff3d6' }));
    sky.rotation.x = Math.PI / 2;
    sky.position.set(0, crown - 0.02, zc);
    out.push(sky);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.3, crown, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff0c8', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    shaft.position.set(0, crown / 2, zc);
    out.push(shaft);
    const light = new THREE.PointLight('#fff0d0', 6, 8, 1.3);
    light.position.set(0, 4.5, zc);
    out.push(light);
    const r = rng(171);
    for (let k = 0; k < 12; k++) {
      const s = k % 2 ? 1 : -1;
      const z = v.z0 - 0.4 - Math.floor(k / 2) * 0.62;
      pottedPlant(kit, I, s * (VX - 0.5 - r() * 0.5), 0, z, 0.9 + r() * 0.8, 180 + k, ['bush', 'lemon', 'bush', 'geranium'][k % 4]);
    }
    floorTree(kit, trs(-VX + 0.6, 0, v.z1 + 0.6), 2.5, 191);
    floorTree(kit, trs(VX - 0.6, 0, v.z0 - 0.6), 2.2, 192);
    for (const [x, z] of [[-1.7, v.z0 - 0.7], [1.8, zc + 0.3], [-1.9, v.z1 + 1.0]]) hangingPlant(kit, trs(x, VSPRING + Math.sqrt(VX ** 2 - x ** 2), z), 1.3, 195 + x);
  }

  // ---- courtyard ---------------------------------------------------------
  {
    const zc = (COURT.z0 + COURT.z1) / 2;
    pottedPlant(kit, I, 0, 0, zc - 0.6, 2.6, 201, 'lemon');
    cafeSet(kit, trs(-2.8, 0, zc + 0.6, 0, 0.4, 0), 202, null);
    // the crate stack the market-crates rack replaces
    stationFurniture('courtyard', (k) => { for (let q = 0; q < 3; q++) crateOfRecords(k, trs(2.9, q * 0.3, zc + 1.0, 0, 0.1 * q - 0.1, 0), 0.7, 0.55, 203 + q); });
    pottedPlant(kit, I, 3.6, 0, COURT.z1 + 0.6, 1.4, 206, 'geranium');
    pottedPlant(kit, I, -3.7, 0, COURT.z1 + 0.6, 1.6, 207, 'bush');
    root.add(stringLights(kit, [-COURT.x, 4.4, COURT.z0 - 0.3], [COURT.x, 4.4, COURT.z1 + 0.5], { orderBase: 0.2, n: 16 }));
    root.add(stringLights(kit, [COURT.x, 4.6, COURT.z0 - 0.3], [-COURT.x, 4.4, COURT.z1 + 0.5], { orderBase: 0.22, n: 16 }));
  }

  kit.flush(root);
  out.forEach((m) => root.add(m));
  Object.values(STATION_FURNITURE).forEach((g) => root.add(g));
  return root;
}
