// The Sienna record shop interior: an old Tuscan building of brick vaults that winds back from the street
// over four floor levels (Lajoon, 2026-11-13: not one straight line, more level changes):
//   1. the big hall (z -0.55 .. -10.5, floor 0): crate-digging tables, a U-shaped wooden gallery (+3 m) with a
//      spiral stair, a listening corner and the counter
//   2. the sunken lounge (z -11 .. -15, three steps down to -0.6): record wall, sofa under a big arched
//      window onto the garden; an arch on its right leads into
//   3. the stacks (x 3.8 .. 11.8, floor -0.6): a two-storey library vault running sideways, a walkway at the
//      far end; a flight of stairs in its back wall climbs to
//   4. the glasshouse (x 7 .. 12, z -15.2 .. -24, floor +1.2): a lean-to of iron and glass, plants everywhere;
//      its far door opens onto a terrace with steps down into
//   5. the garden courtyard (x -4.5 .. 12, z -15.6 .. -31, floor 0): open sky, lemon tree, fountain, string
//      lights. It wraps round behind the lounge, so you see it through the lounge window long before you get there.
// Six category zones: hall floor, gallery, lounge, stacks, glasshouse, courtyard.
import * as THREE from 'three';
import { createKit, trs, mul, BRICK } from './kit.js';
import { brickWall, plasterPanel, lunetteShape, archHole, barrelVault, voussoirs, flagstones, PALETTES } from './masonry.js';
import { blk, rod, pottedPlant, railPlanter, postIvy, bougainvillea } from './details.js';
import { recordShelf, binTable, crateOfRecords, turntable, speaker, armchair, sofa, rug, floorLamp, hangingPlant, trailingIvy, floorTree, spiralStair, pendant, ladder } from './interior.js';
import { cafeSet, stringLights } from './props.js';
import { toon } from './materials.js';
import { rng } from './rand.js';

const PLASTER = '#ead6b4';
const PAL = PALETTES.honey;
const HALL = { x: 5.4, z0: -0.55, z1: -10.5, spring: 3.6 };
const VX = 3.3, VSPRING = 3.0; // the lounge vault: half width, spring height (world)
// the sunken lounge: three steps down from the hall's back arch; the floor proper starts at z -11.6
export const LOUNGE = { y: -0.6, z0: -11, z1: -15, floorZ: -11.6, arch: { z: -13.2, w: 2.4, h: 3.0 } };
// the lounge's arched window onto the garden (world x, sill height, width, height); the garden's wall is 0.6 behind
const WINDOW = { x: 0, y: 0.3, w: 2.6, h: 3.0, deep: 0.6 };
// the stacks, built in their own frame (stacksFrame): along local -z from the lounge (world +x), half width hw,
// floor y (world), vault springing `spring` above its floor; local x +hw is the hall side (world z -11)
export const STACKS = { x0: 3.8, x1: 11.8, z: -13, hw: 2, y: -0.6, spring: 4.4 };
// the glasshouse: walls x0..x1 (inside xi0..xi1), z0 (the stacks' back wall) to z1, floor y; its stair (sx0..sx1)
// climbs from the stacks' floor to stairEnd; the lean-to glass roof runs from the eave (west) up to the ridge (east)
export const GH = { x0: 7.0, x1: 12.0, xi0: 7.2, xi1: 11.8, z0: -15.2, z1: -24, y: 1.2, sx0: 8.3, sx1: 10.7, stairEnd: -17.9, eave: 4.8, ridge: 6.4, door: { x: 9.5, w: 1.4, h: 2.5 } };
// the garden courtyard, and the terrace outside the glasshouse door with its steps (sx0..sx1) down to the garden
export const GARDEN = { x0: -4.5, x1: 12.0, z0: -15.6, z1: -31, wall: 6.6, north: 7.6 };
const TERRACE = { z0: -24, z1: -26, sx0: 8.6, sx1: 10.4, step: 0.32 };
const GALLERY = { y: 3.0, inner: 3.7, front: -2.6, back: -9.3 };

export const ZONES = [
  { id: 'hall', at: [0, 1.7, -6] },
  { id: 'gallery', at: [-4.5, 4.6, -6] },
  { id: 'lounge', at: [0, 1.1, -13] },
  { id: 'stacks', at: [7.8, 1.1, -13] },
  { id: 'plants', at: [9.5, 2.9, -20.5] },
  { id: 'courtyard', at: [2, 1.7, -24] },
];

// The stacks' frame: local -z runs from the lounge end (world x 3.8) to the far end (x 11.8), local +x is world
// +z (the hall side), floor at local y 0.
export function stacksFrame() {
  return new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(STACKS.x0, STACKS.y, STACKS.z);
}

// Furniture that a station's rack replaces lives in its own group: the shop keeps it when no shelf
// is assigned to the station, and main hides it (root.userData.stationFurniture[id].visible = false)
// when a rack stands there.
let STATION_FURNITURE = null;
function stationFurniture(id, build) {
  const kit = createKit();
  build(kit);
  const g = new THREE.Group();
  kit.flush(g);
  // it comes and goes: its brush strokes never stand in for the wall's, and go when it goes (brushstrokes.js,
  // oilpaint.js); numbered from 1 in the order the shop is built
  g.userData.ownStrokes = Object.keys(STATION_FURNITURE).length + 1;
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

// Terracotta floor tiles over a rectangle, floor at height y.
function cotto(kit, x0, x1, z0, z1, seed, y = 0) {
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

// An end wall of a vault in frame M (origin at its left foot, x along the wall, +z into the room): a plaster
// lunette springing at `spring` above M's origin, with a brick arch round opening o (or none).
function lunetteWall(kit, out, M, w, spring, o, seed) {
  const sh = lunetteShape(w, spring);
  if (o) sh.holes.push(archHole(o));
  out.push(plasterPanel(sh, M, PLASTER));
  if (o) voussoirs(kit, M, rng(seed), PAL, o);
}

// A transverse wall between two rooms: plaster lunettes on both faces, a brick arch, lined opening.
// Springs and the opening's y are world heights; y0F / y0B are the floor heights on the front / back side, so a
// face reaches down to its own room's floor. depth = the wall's thickness (the lining's).
function crossWall(kit, out, z, wF, springF, wB, springB, o, seed, { y0F = 0, y0B = 0, depth = 0.5 } = {}) {
  const F = frame([-wF / 2, y0F, z], [1, 0, 0], [0, 0, 1]);
  const oF = { ...o, x: wF / 2, y: o.y - y0F };
  lunetteWall(kit, out, F, wF, springF - y0F, oF, seed);
  out.push(reveal(F, oF, depth));
  if (wB) {
    const B = frame([wB / 2, y0B, z - depth], [-1, 0, 0], [0, 0, -1]);
    lunetteWall(kit, out, B, wB, springB - y0B, { ...o, x: wB / 2, y: o.y - y0B }, seed + 1);
  }
}

// Plaster side walls of a room from z0 to z1 at x = ±hw, from floor y0 up past the vault spring (world). holes:
// arch openings [{ side: -1 | 1, z (world centre), w, h }] from the floor; each gets a brick arch, and the
// lining through the wall if depth is given. The painted skirting stops at them.
function sideWalls(kit, out, hw, z0, z1, spring, { y0 = 0, holes = [] } = {}) {
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
    // painted skirting band, in pieces between the openings
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
  // planter boxes over the back rail, facing home; ivy up the posts that frame the view
  for (const x of [-2.5, 0, 2.5]) railPlanter(kit, frame([x, y + 0.95, back], [1, 0, 0], [0, 0, 1]), 0.95, 84 + x);
  for (const [x, z] of [[-inner, front], [inner, front], [-2.45, back], [2.45, back]]) postIvy(kit, I, x, z, y + 0.9, 0.07, 85 + x * 3 + z);
  pottedPlant(kit, I, 4.7, y + 0.03, -2.85, 1.0, 99, 'fern');
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

// An iron railing: wooden top rail, iron bottom rail and balusters, from a to b ([x, z]) on a floor at y.
function railing(kit, a, b, y, { top = '#6b4a2c', iron = '#2b2a2e' } = {}) {
  const I = new THREE.Matrix4();
  rod(kit, I, [a[0], y + 0.95, a[1]], [b[0], y + 0.95, b[1]], 0.03, top);
  rod(kit, I, [a[0], y + 0.1, a[1]], [b[0], y + 0.1, b[1]], 0.015, iron);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let t = 0; t <= len; t += 0.13) {
    const x = a[0] + ((b[0] - a[0]) * t) / len, z = a[1] + ((b[1] - a[1]) * t) / len;
    rod(kit, I, [x, y + 0.03, z], [x, y + 0.95, z], 0.008, iron);
  }
}

// A flight of stone steps (I frame) across x0..x1, starting at z0 and going toward -z, each `run` deep, from
// floor height `from` to `to` (up or down) in risers of about 0.2: solid blocks down to the lower floor.
function steps(kit, x0, x1, z0, run, from, to) {
  const I = new THREE.Matrix4();
  const n = Math.max(1, Math.round(Math.abs(to - from) / 0.2));
  const low = Math.min(from, to);
  // up: tread i is at from + (i + 1) * rise; down: the first tread is one riser below `from`, the last one
  // riser above `to` (the floor itself is the last step)
  const count = to > from ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const top = from + ((to - from) * (i + 1)) / n;
    const za = z0 - i * run;
    blk(kit, I, (x0 + x1) / 2, (top + low) / 2, za - run / 2, x1 - x0, top - low, run, i % 2 ? '#cdb08a' : '#d4b892');
    blk(kit, I, (x0 + x1) / 2, top - 0.02, za - 0.025, x1 - x0, 0.045, 0.05, '#a8845e'); // nosing
  }
}

// ---- the sunken lounge -----------------------------------------------------------------------------
function lounge(kit, out) {
  const L = LOUNGE, y = L.y, I = new THREE.Matrix4(), zc = -13;
  out.push(cotto(kit, -VX, VX, L.floorZ, L.z1, 2, y));
  steps(kit, -VX, VX, L.z0, (L.z0 - L.floorZ) / 2, 0, y);
  sideWalls(kit, out, VX, L.z0, L.z1, VSPRING, { y0: y, holes: [{ side: 1, z: L.arch.z, w: L.arch.w, h: L.arch.h, depth: STACKS.x0 - VX }] });
  out.push(barrelVault(kit, { spring: VSPRING, r: VX, z0: L.z0, z1: L.z1, seed: 40 }));
  // the back wall: the big arched window onto the garden, its lining reaching the garden's wall
  crossWall(kit, out, L.z1, VX * 2, VSPRING, 0, 0, { type: 'arch', y: WINDOW.y, w: WINDOW.w, h: WINDOW.h, ring: 0.24 }, 50, { y0F: y, depth: WINDOW.deep });
  {
    // white-painted glazing bars in the middle of the window's depth (no panes: under the paint the garden
    // reads better without them), on a stone sill
    const W = WINDOW, r0 = W.w / 2, spring = W.y + W.h - r0, z = L.z1 - W.deep / 2, bar = '#efe8da';
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
  // the record wall on the left (the wall rack replaces it): sleeves faced out in a grid
  stationFurniture('lounge', (k) => {
    const W = frame([-VX + 0.05, y, -11.85], [0, 0, -1], [1, 0, 0]);
    const r = rng(141);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
      const c = new THREE.Color().setHSL(r(), 0.35 + r() * 0.4, 0.35 + r() * 0.35);
      blk(k, W, 0.4 + col * 0.46, 0.75 + row * 0.5, 0.03, 0.34, 0.34, 0.02, c);
      if (r() < 0.5) k.disc.add(mul(W, trs(0.4 + col * 0.46, 0.75 + row * 0.5, 0.045, Math.PI / 2, 0, 0, 0.12, 0.004, 0.12)), new THREE.Color().setHSL(r(), 0.5, 0.6));
    }
  });
  speaker(kit, frame([-VX + 0.3, y, -11.95], [0, 0, -1], [1, 0, 0]));
  speaker(kit, frame([-VX + 0.3, y, L.z1 + 0.3], [0, 0, -1], [1, 0, 0]));
  // the sofa under the window, a low table with a turntable in front of it
  sofa(kit, frame([0, y, L.z1 + 0.55], [1, 0, 0], [0, 0, 1]), '#6a86a0', 2.4);
  rug(kit, trs(0, y, -13.4), 3.0, 2.2, 2);
  blk(kit, I, 0, y + 0.2, -13.6, 1.1, 0.4, 0.6, '#7a5634');
  turntable(kit, trs(0, y + 0.35, -13.6), { cabinet: false });
  out.push(floorLamp(kit, trs(2.75, y, L.z1 + 0.45)));
  pottedPlant(kit, I, 2.7, y, -11.95, 1.1, 148, 'monstera');
  const vy = (x) => VSPRING + Math.sqrt(VX ** 2 - x ** 2);
  hangingPlant(kit, trs(1.6, vy(1.6), zc - 0.8), 1.6, 145, 'pothos');
  hangingPlant(kit, trs(-1.8, vy(1.8), -12.0), 1.3, 146, 'pearls');
  hangingPlant(kit, trs(1.9, vy(1.9), -11.9), 1.0, 147, 'fern');
  out.push(...pendant(kit, trs(0, 0, zc), VSPRING + VX - 0.1, 2.3, { shade: '#c4673d' }));
}

// ---- the stacks ------------------------------------------------------------------------------------
// Built in stacksFrame(): the shell (floor, walls, vault) in a group turned to match, the furniture in world
// matrices through S.
function stacks(root, kit, out) {
  const S = stacksFrame(), { hw, spring } = STACKS, len = STACKS.x1 - STACKS.x0, E = -len;
  const sk = createKit(), so = [];
  so.push(cotto(sk, -hw, hw, 0, E, 3));
  // the stair up to the glasshouse opens in the back (garden-side) wall
  const upZ = STACKS.x0 - (GH.sx0 + GH.sx1) / 2;
  sideWalls(sk, so, hw, 0, E, spring, { holes: [{ side: -1, z: upZ, w: GH.sx1 - GH.sx0, h: 3.0, depth: STACKS.z - STACKS.hw - GH.z0 }] });
  so.push(barrelVault(sk, { spring, r: hw, z0: 0, z1: E, seed: 41 }));
  // the lounge end, with the arch in from the lounge; the far end, plain
  lunetteWall(sk, so, frame([hw, 0, 0], [-1, 0, 0], [0, 0, -1]), hw * 2, spring, { type: 'arch', x: hw - (LOUNGE.arch.z - STACKS.z), y: 0, w: LOUNGE.arch.w, h: LOUNGE.arch.h, ring: 0.26 }, 71);
  lunetteWall(sk, so, frame([-hw, 0, E], [1, 0, 0], [0, 0, 1]), hw * 2, spring, null, 72);
  const g = new THREE.Group();
  g.applyMatrix4(S);
  sk.flush(g);
  so.forEach((m) => g.add(m));
  root.add(g);

  const F = (o, along, normal) => mul(S, frame(o, along, normal));
  const wallIn = hw - 0.22, wood = '#8a5a32', plank = '#a8743a', iron = '#2b2a2e';
  // the hall-side wall: the tall rack's place (a tall shelf stands in), then a two-storey shelf and a rolling
  // ladder on a brass rail
  const rackZ = -2.3;
  stationFurniture('stacks', (k) => recordShelf(k, F([wallIn, 0, rackZ], [0, 0, 1], [-1, 0, 0]), { w: 3.7, h: 2.95, levels: 7, seed: 152 }));
  recordShelf(kit, F([wallIn, 0, -6.1], [0, 0, 1], [-1, 0, 0]), { w: 3.3, h: 4.1, levels: 9, seed: 153 });
  ladder(kit, F([hw - 0.5, 0, -5.1], [0, 0, 1], [-1, 0, 0]), 4.1);
  rod(kit, S, [hw - 0.42, 4.12, -4.3], [hw - 0.42, 4.12, E + 0.15], 0.015, '#c9a85a');
  pottedPlant(kit, S, -hw + 0.35, 0, -7.3, 0.9, 159, 'snake');
  // the garden-side wall: a two-storey shelf up to the stair's arch, plants trailing off its top
  recordShelf(kit, F([-wallIn, 0, -2.3], [0, 0, -1], [1, 0, 0]), { w: 3.9, h: 4.1, levels: 9, seed: 151 });
  for (const [z, kind] of [[-0.8, 'bush'], [-2.2, 'fern'], [-3.7, 'bush']]) pottedPlant(kit, S, -hw + 0.42, 4.1, z, 0.5, 155 - z, kind);
  trailingIvy(kit, F([-hw + 0.62, 4.1, -0.4], [0, 0, -1], [1, 0, 0]), 0.1, 1.2, 0, 157);
  trailingIvy(kit, F([-hw + 0.62, 4.1, -0.4], [0, 0, -1], [1, 0, 0]), 2.4, 3.7, 0, 158);
  // the far end: a walkway across it on iron brackets, shelves under and over it, a ladder up
  const deckY = 2.2, deck = 0.9;
  recordShelf(kit, F([0, 0, E + 0.22], [1, 0, 0], [0, 0, 1]), { w: 3.6, h: 2.05, levels: 5, seed: 154 });
  recordShelf(kit, F([0, deckY + 0.03, E + 0.22], [1, 0, 0], [0, 0, 1]), { w: 3.6, h: 1.9, levels: 4, seed: 156 });
  const r = rng(161);
  for (let x = -hw + 0.02; x < hw - 0.05; x += 0.2) blk(kit, S, x + 0.1, deckY, E + deck / 2, 0.19, 0.05, deck, new THREE.Color(plank).offsetHSL(0, 0, (r() - 0.5) * 0.06));
  blk(kit, S, 0, deckY - 0.1, E + deck, hw * 2, 0.18, 0.1, wood);
  for (const x of [-1.5, 0, 1.0]) rod(kit, S, [x, deckY - 0.55, E + 0.03], [x, deckY - 0.05, E + deck - 0.05], 0.02, iron);
  for (const [a, b] of [[-hw + 0.05, -1.8], [-1.2, hw - 0.05]]) {
    rod(kit, S, [a, deckY + 0.95, E + deck - 0.04], [b, deckY + 0.95, E + deck - 0.04], 0.025, '#6b4a2c');
    for (let x = a; x <= b; x += 0.13) rod(kit, S, [x, deckY + 0.03, E + deck - 0.04], [x, deckY + 0.95, E + deck - 0.04], 0.008, iron);
  }
  trailingIvy(kit, F([-hw + 0.05, deckY + 0.95, E + deck], [1, 0, 0], [0, 0, 1]), 0.1, 3.0, 0, 162);
  // the ladder on the garden side, the reading chair on the hall side (away from the stair's arch)
  ladder(kit, F([-1.5, 0, E + deck], [1, 0, 0], [0, 0, 1]), deckY + 0.05);
  armchair(kit, F([0.55, 0, E + 1.35], [1, 0, 0], [0, 0, 1]), '#3f6e6a');
  out.push(floorLamp(kit, mul(S, trs(1.65, 0, E + 1.15))));
  crateOfRecords(kit, mul(S, trs(1.6, 0, -4.55, 0, Math.PI / 2 + 0.1, 0)), 0.6, 0.5, 160);
  // light: two pendants down the vault (one of them lit), plants hanging between them
  out.push(...pendant(kit, mul(S, trs(0, 0, -2.0)), spring + hw - 0.1, 2.4, { shade: '#e8b23a' }));
  out.push(...pendant(kit, mul(S, trs(0, 0, -5.7)), spring + hw - 0.1, 2.4, { shade: '#e8b23a', light: false }));
  const vy = (x) => spring + Math.sqrt(hw ** 2 - x ** 2);
  [[-1.0, -1.0, 'fern'], [1.0, -3.9, 'pearls'], [-0.9, -6.9, 'pothos'], [1.05, -7.6, 'fern']].forEach(([x, z, kind], i) => {
    hangingPlant(kit, mul(S, trs(x, vy(Math.abs(x)), z)), vy(Math.abs(x)) - 4.6 - (i % 2) * 0.3, 167 + i, kind);
  });
}

// ---- the glasshouse --------------------------------------------------------------------------------
function glasshouse(kit, out) {
  const G = GH, I = new THREE.Matrix4(), y = G.y, ys = STACKS.y, honey = PALETTES.honey, rose = PALETTES.rose;
  const bar = '#efe8da';
  // the stair up from the stacks, between two raised beds
  steps(kit, G.sx0, G.sx1, G.z0, (G.z0 - G.stairEnd) / Math.round((y - ys) / 0.2), ys, y);
  for (const [x0, x1, s] of [[G.xi0, G.sx0, 1], [G.sx1, G.xi1, 2]]) {
    const zc = (G.z0 + G.stairEnd) / 2, d = G.z0 - G.stairEnd;
    blk(kit, I, (x0 + x1) / 2, (y + ys) / 2, zc, x1 - x0, y - ys, d, '#b8784e');
    blk(kit, I, (x0 + x1) / 2, y + 0.01, zc, x1 - x0 - 0.08, 0.04, d - 0.08, '#5a3d2a');
    const kinds = s === 1 ? ['geranium', 'fern', 'monstera'] : ['fern', 'geranium', 'bush'];
    kinds.forEach((kind, i) => pottedPlant(kit, I, (x0 + x1) / 2, y, G.z0 - 0.5 - i * 0.9, 0.75, 220 + s * 5 + i, kind));
    trailingIvy(kit, frame([s === 1 ? x1 : x0, y, G.z0 - 0.1], [0, 0, -1], [s === 1 ? 1 : -1, 0, 0]), 0, d - 0.2, 0, 230 + s);
  }
  out.push(cotto(kit, G.xi0, G.xi1, G.stairEnd, G.z1 + 0.2, 14, y));
  // walls: the stacks' gable (north), the house wall the lean-to leans on (east), a low wall under the glass
  // (west) and the end wall with the door out to the terrace (south)
  const top = G.ridge + 0.3;
  out.push(...brickWall(kit, frame([G.x1, ys, G.z0], [-1, 0, 0], [0, 0, -1]), { w: G.x1 - G.x0, y1: top - ys, seed: 81, pal: honey,
    openings: [{ type: 'arch', x: G.x1 - (G.sx0 + G.sx1) / 2, y: 0, w: G.sx1 - G.sx0, h: 3.0, ring: 0.26 }] }));
  out.push(...brickWall(kit, frame([G.xi1, ys, G.z1], [0, 0, 1], [-1, 0, 0]), { w: G.z0 - G.z1, y1: top - ys, seed: 82, pal: honey }));
  out.push(...brickWall(kit, frame([G.xi0, y, G.z0], [0, 0, -1], [1, 0, 0]), { w: G.z0 - G.z1, y1: 0.8, seed: 83, pal: honey }));
  out.push(...brickWall(kit, frame([G.x0, 0, G.z1], [0, 0, 1], [-1, 0, 0]), { w: GARDEN.z0 - G.z1, y1: y + 0.8, seed: 84, pal: rose }));
  const door = { type: 'arch', y: 0, w: G.door.w, h: G.door.h, ring: 0.2 };
  const Si = frame([G.xi0, y, G.z1 + 0.2], [1, 0, 0], [0, 0, 1]);
  const oi = { ...door, x: G.door.x - G.xi0 };
  out.push(...brickWall(kit, Si, { w: G.xi1 - G.xi0, y1: G.eave - y, seed: 85, pal: honey, openings: [oi] }));
  out.push(reveal(Si, oi, 0.2));
  out.push(...brickWall(kit, frame([G.x1, 0, G.z1], [-1, 0, 0], [0, 0, -1]), { w: G.x1 - G.x0, y1: G.eave, seed: 86, pal: rose,
    openings: [{ ...door, x: G.x1 - G.door.x, y }] }));
  // the glass: white-painted bars, faint panes. West side from the low wall up to the eave, the roof from the
  // eave up to the east wall, the gable over the door
  const roofY = (x) => G.eave + ((x - G.x0) * (G.ridge - G.eave)) / (G.x1 - G.x0);
  const gx = (G.x0 + G.xi0) / 2, sill = y + 0.8;
  const n = Math.round((G.z0 - G.z1) / 0.62);
  for (let i = 0; i <= n; i++) {
    const z = G.z0 - ((G.z0 - G.z1) * i) / n;
    rod(kit, I, [gx, sill, z], [gx, G.eave, z], 0.022, bar);
    rod(kit, I, [G.x0, G.eave, z], [G.x1 - 0.2, roofY(G.x1 - 0.2), z], 0.03, bar);
  }
  for (const yy of [sill, (sill + G.eave) / 2]) rod(kit, I, [gx, yy, G.z0], [gx, yy, G.z1], 0.022, bar);
  blk(kit, I, G.x0 + 0.05, G.eave, (G.z0 + G.z1) / 2, 0.16, 0.12, G.z0 - G.z1, bar); // eave beam and gutter
  for (const t of [0.35, 0.7]) {
    const x = G.x0 + (G.x1 - G.x0) * t;
    rod(kit, I, [x, roofY(x), G.z0], [x, roofY(x), G.z1], 0.022, bar);
  }
  for (let x = G.x0 + 0.8; x < G.x1 - 0.3; x += 0.8) rod(kit, I, [x, G.eave, G.z1 + 0.1], [x, roofY(x), G.z1 + 0.1], 0.02, bar);
  const pane = new THREE.MeshBasicMaterial({ color: '#e8f2f0', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  const wallPane = new THREE.Mesh(new THREE.PlaneGeometry(G.z0 - G.z1, G.eave - sill), pane);
  wallPane.rotation.y = Math.PI / 2;
  wallPane.position.set(gx, (sill + G.eave) / 2, (G.z0 + G.z1) / 2);
  const slope = Math.hypot(G.x1 - G.x0, G.ridge - G.eave);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(slope, G.z0 - G.z1).rotateX(-Math.PI / 2).rotateZ(Math.atan2(G.ridge - G.eave, G.x1 - G.x0)), pane);
  roof.position.set((G.x0 + G.x1) / 2, (G.eave + G.ridge) / 2 + 0.02, (G.z0 + G.z1) / 2);
  out.push(wallPane, roof);
  // the sun through the glass
  const light = new THREE.PointLight('#fff0d0', 6, 9, 1.3);
  light.position.set((G.xi0 + G.xi1) / 2, 4.2, -20.8);
  out.push(light);
  // plants: a tiered bench along the east wall, big pots along the west, trees in the corners, more hanging
  // from the roof bars
  const bench = '#7a5634';
  [[1.05, 11.55], [0.75, 11.25], [0.45, 10.95]].forEach(([h, x], tier) => {
    blk(kit, I, x, y + h, (-18.6 + G.z1 + 0.6) / 2, 0.3, 0.04, -18.6 - G.z1 - 0.6, bench);
    for (const z of [-18.6, G.z1 + 0.6]) blk(kit, I, x, y + h / 2, z, 0.05, h, 0.05, bench);
    for (let z = -18.9; z > G.z1 + 0.7; z -= 0.55) pottedPlant(kit, I, x, y + h + 0.02, z, 0.42 + ((z * 7) % 1 + 1) % 1 * 0.2, 240 + tier * 20 + Math.round(z * 3), ['fern', 'geranium', 'bush', 'snake', 'monstera'][(Math.round(-z * 2) + tier) % 5]);
  });
  pottedPlant(kit, I, 7.75, y, -18.9, 1.2, 250, 'monstera');
  pottedPlant(kit, I, 7.7, y, -20.3, 1.0, 251, 'fern');
  pottedPlant(kit, I, 7.75, y, -21.6, 1.3, 252, 'lemon');
  floorTree(kit, trs(8.0, y, -23.2), 2.3, 253);
  pottedPlant(kit, I, 8.9, y, -23.4, 0.9, 254, 'snake');
  [[8.2, -19.1, 'pearls'], [8.2, -20.7, 'fern'], [8.25, -22.3, 'pothos'], [9.5, -16.3, 'fern'], [11.2, -16.6, 'pearls'], [7.9, -16.6, 'pothos']].forEach(([x, z, kind], i) => {
    const t = roofY(x);
    hangingPlant(kit, trs(x, t - 0.05, z), Math.max(0.5, t - (i < 3 ? 4.15 : 4.5)), 260 + i, kind);
  });
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

// Climbing ivy: vines that wander up walls from the ground, denser low down, with side shoots. walls: [{ o, u
// (unit along the wall), len, skip: [[a, b]...] }], o just off the face.
function climbingIvy(kit, walls, h, seed, perWall = 7) {
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

// A raised brick bed (centre x, z, size w along x, d along z) planted thick with low shrubs and flowers.
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

// ---- the garden courtyard and the terrace ----------------------------------------------------------
function garden(root, kit, out) {
  const G = GARDEN, T = TERRACE, I = new THREE.Matrix4(), rose = PALETTES.rose, ty = GH.y;
  const ch = Math.round(G.wall / BRICK.row) * BRICK.row, nh = Math.round(G.north / BRICK.row) * BRICK.row;
  root.add(flagstones(kit, { x0: G.x0, x1: GH.x0, z0: G.z1, z1: G.z0, seed: 13, gutter: false, pal: rose }));
  root.add(flagstones(kit, { x0: GH.x0, x1: G.x1, z0: G.z1, z1: T.z1, seed: 16, gutter: false, pal: rose }));
  // walls: north (behind the lounge, taller, so the hall's vault never shows over it) with the window; west
  // with the fountain; south; east beside the terrace
  const N = frame([GH.x0, 0, G.z0], [-1, 0, 0], [0, 0, -1]);
  const win = { type: 'arch', x: GH.x0 - WINDOW.x, y: WINDOW.y, w: WINDOW.w, h: WINDOW.h, ring: 0.22 };
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

  // the terrace outside the glasshouse door: a brick-faced platform, tiled, railed, steps down to the garden
  blk(kit, I, (GH.x0 + GH.x1) / 2, ty / 2 - 0.02, (T.z0 + T.z1) / 2, GH.x1 - GH.x0 - 0.1, ty - 0.04, T.z0 - T.z1 - 0.1, '#c9a882');
  out.push(cotto(kit, GH.x0, GH.x1, T.z0, T.z1, 15, ty));
  out.push(...brickWall(kit, frame([GH.x1, 0, T.z1], [-1, 0, 0], [0, 0, -1]), { w: GH.x1 - GH.x0, y1: ty, seed: 67, pal: rose }));
  out.push(...brickWall(kit, frame([GH.x0, 0, T.z1], [0, 0, 1], [-1, 0, 0]), { w: T.z0 - T.z1, y1: ty, seed: 68, pal: rose }));
  steps(kit, T.sx0, T.sx1, T.z1, T.step, ty, 0);
  railing(kit, [GH.x0 + 0.06, T.z1 + 0.06], [T.sx0, T.z1 + 0.06], ty);
  railing(kit, [T.sx1, T.z1 + 0.06], [GH.x1 - 0.06, T.z1 + 0.06], ty);
  railing(kit, [GH.x0 + 0.06, T.z0 - 0.02], [GH.x0 + 0.06, T.z1 + 0.06], ty);
  railPlanter(kit, frame([T.sx0 - 0.1, ty + 0.95, T.z1 + 0.06], [-1, 0, 0], [0, 0, -1]), 1.2, 69);
  railPlanter(kit, frame([GH.x1 - 0.2, ty + 0.95, T.z1 + 0.06], [-1, 0, 0], [0, 0, -1]), 1.1, 70);
  for (const x of [8.35, 10.65]) pottedPlant(kit, I, x, ty, T.z0 - 0.45, 0.95, 271 + x, 'lemon');

  // planting: the lemon tree you see through the lounge window, olive-style trees in the far corners, pots
  // along the walls, a flower box under the window, bougainvillea round the window, the fountain and the door
  pottedPlant(kit, I, 0.8, 0, -20.6, 2.6, 201, 'lemon');
  floorTree(kit, trs(G.x0 + 0.7, 0, G.z1 + 0.75), 2.6, 281);
  floorTree(kit, trs(G.x1 - 0.7, 0, G.z1 + 0.75), 2.4, 282);
  [[-3.9, -17.2, 'geranium', 1.3], [-3.9, -19.6, 'fern', 1.2], [-3.95, -21.6, 'monstera', 1.5], [-3.9, -26.4, 'bush', 1.6],
    [-3.9, -28.6, 'snake', 1.1], [-1.4, -30.4, 'geranium', 1.3], [1.6, -30.4, 'fern', 1.2], [6.2, -30.4, 'monstera', 1.4],
    [6.5, -16.3, 'fern', 1.1], [3.6, -16.25, 'geranium', 1.2], [-2.6, -16.25, 'snake', 1.0]].forEach(([x, z, kind, size], i) => pottedPlant(kit, I, x, 0, z, size, 290 + i, kind));
  blk(kit, I, WINDOW.x, 0.22, G.z0 - 0.35, WINDOW.w + 0.3, 0.44, 0.5, '#c4673d');
  railPlanter(kit, frame([WINDOW.x + (WINDOW.w + 0.1) / 2, 0.5, G.z0 - 0.5], [-1, 0, 0], [0, 0, -1]), WINDOW.w + 0.1, 300);
  bougainvillea(kit, N, win, 211);
  bougainvillea(kit, W, { x: fu, y: 0.9, w: 1.6, h: 2.3 }, 212);
  bougainvillea(kit, frame([GH.x1, 0, GH.z1], [-1, 0, 0], [0, 0, -1]), { x: GH.x1 - GH.door.x, y: ty, w: GH.door.w, h: GH.door.h }, 213);
  raisedBed(kit, -1.6, -24.3, 2.6, 0.9, 301);
  raisedBed(kit, 4.7, -21.6, 0.9, 2.4, 302);
  floorTree(kit, trs(5.4, 0, -18.0), 2.8, 303);
  cafeSet(kit, trs(-2.4, 0, -27.6, 0, 0.4, 0), 202, null);
  cafeSet(kit, trs(-1.6, 0, -18.6, 0, -0.3, 0), 214, null);
  // the crate stack the market-crates rack replaces
  stationFurniture('courtyard', (k) => { for (let q = 0; q < 3; q++) crateOfRecords(k, trs(3.6, q * 0.3, -26.4, 0, 0.1 * q + 2.7, 0), 0.7, 0.55, 203 + q); });
  root.add(stringLights(kit, [G.x0, 4.4, -17.2], [GH.x0 - 0.2, 4.6, -29.6], { orderBase: 0.2, n: 18 }));
  root.add(stringLights(kit, [G.x0, 4.6, -29.6], [GH.x0 - 0.2, 4.4, -17.0], { orderBase: 0.22, n: 18 }));
}

export function buildShop() {
  const root = new THREE.Group();
  STATION_FURNITURE = {};
  root.userData.stationFurniture = STATION_FURNITURE;
  const kit = createKit();
  const out = [];
  const I = new THREE.Matrix4();
  // The hall is a group of its own (root.userData.hall): from the stacks and the glasshouse it cannot be seen,
  // though it lies in the view behind their walls, and main.js does not draw it there. Its lamps' lights stay
  // outside it: the number of lights drawn must never change (lightslots.js).
  const hk = createKit();
  const ho = [];
  const hall = new THREE.Group();
  hall.name = 'hall';
  root.userData.hall = hall;

  // ---- shell -------------------------------------------------------------
  ho.push(cotto(hk, -HALL.x, HALL.x, HALL.z0, HALL.z1, 1));
  ho.push(cotto(hk, -2.0, 2.0, -10.5, -11, 9)); // under the hall's back arch
  sideWalls(hk, ho, HALL.x, HALL.z0, HALL.z1, HALL.spring);
  ho.push(barrelVault(hk, { spring: HALL.spring, r: HALL.x, z0: HALL.z0, z1: HALL.z1, seed: 21 }));
  {
    const F = frame([HALL.x, 0, HALL.z0], [-1, 0, 0], [0, 0, -1]);
    const sh = lunetteShape(HALL.x * 2, HALL.spring);
    sh.holes.push(archHole({ x: HALL.x, y: 0, w: 2.0, h: 4.0 }));
    for (const dx of [-3, 3]) sh.holes.push(archHole({ x: HALL.x + dx, y: 0.55, w: 2.3, h: 3.4 }));
    ho.push(plasterPanel(sh, F, PLASTER, 0.05));
  }

  // ---- hall contents -----------------------------------------------------
  gallery(hk, ho);
  rug(hk, trs(0, 0, -5.8), 2.4, 6.0, 1);
  for (const z of [-4.4, -7.1]) for (const s of [-1, 1]) binTable(hk, trs(s * 2.05, 0, z, 0, Math.PI / 2, 0), Math.round(z * 10) + s);
  // under the gallery: shelves left, listening corner and shelves right, counter at the back
  recordShelf(hk, frame([-HALL.x + 0.25, 0, -6.3], [0, 0, -1], [1, 0, 0]), { w: 6.2, h: 2.65, levels: 6, seed: 101 });
  stationFurniture('cubby', (k) => recordShelf(k, frame([HALL.x - 0.25, 0, -6.9], [0, 0, 1], [-1, 0, 0]), { w: 4.2, h: 2.65, levels: 6, seed: 102 }));
  armchair(hk, frame([4.5, 0, -3.6], [0, 0, 1], [-1, 0, 0]), '#b84a3a');
  turntable(hk, frame([4.6, 0, -2.6], [0, 0, 1], [-1, 0, 0]));
  ho.push(floorLamp(hk, trs(5.0, 0, -4.4)));
  hk.ball.add(trs(4.55, 1.05, -2.45, 0, 0, 0, 0.18, 0.06, 0.18), '#2b2a2e'); // headphones on the cabinet
  {
    const C = frame([2.3, 0, -8.85], [1, 0, 0], [0, 0, 1]);
    blk(hk, C, 1.45, 0.5, 0, 2.9, 1.0, 0.7, '#7a5634');
    for (let i = 0; i < 9; i++) blk(hk, C, 0.15 + i * 0.33, 0.5, 0.36, 0.02, 0.9, 0.02, '#5a3d24');
    blk(hk, C, 1.45, 1.04, 0.02, 3.0, 0.08, 0.8, '#d8c8aa');
    // the middle of the counter (x 3.35..4.65) is the easel's: till at the left end, plant and
    // turntable at the right
    blk(hk, C, 0.4, 1.2, -0.05, 0.42, 0.26, 0.34, '#c4673d'); // till
    blk(hk, C, 0.4, 1.36, -0.11, 0.38, 0.1, 0.2, '#e9e1d0', 0.4);
    turntable(hk, mul(C, trs(2.55, 1.08, 0)), { cabinet: false });
    pottedPlant(hk, C, 0.95, 1.08, -0.1, 0.6, 111, 'bush');
    crateOfRecords(hk, mul(C, trs(1.6, 0, 0.75, 0, 0.1, 0)), 0.7, 0.55, 112);
  }
  floorTree(hk, trs(-4.6, 0, -9.7), 2.4, 121);
  pottedPlant(hk, I, 4.7, 0, -9.95, 1.4, 126, 'monstera'); // behind the counter
  pottedPlant(hk, I, 2.65, 0, -10.1, 1.0, 127, 'snake');
  pottedPlant(hk, I, 3.55, 0, -1.0, 1.0, 128, 'fern'); // by the door
  crateOfRecords(hk, trs(-3.9, 0, -9.0, 0, -0.3, 0), 0.7, 0.55, 122);
  crateOfRecords(hk, trs(-3.95, 0.3, -9.05, 0, -0.2, 0), 0.7, 0.55, 123);
  floorTree(hk, trs(-4.7, 0, -0.95), 1.9, 124);
  floorTree(hk, trs(4.75, 0, -1.0), 2.2, 125);
  // pendants down the middle, plants hanging from the vault
  for (const z of [-3.0, -6.0, -8.6]) ho.push(...pendant(hk, trs(0, 0, z), 8.9, 3.6, { shade: '#3f6e6a' }));
  const vaultY = (x) => HALL.spring + Math.sqrt(HALL.x ** 2 - x ** 2);
  // over the floor, in twos and threes at different heights
  [[-2.4, -3.6, 'pothos'], [2.4, -4.8, 'fern'], [-2.6, -7.8, 'pearls'], [2.6, -6.6, 'pothos'], [-1.3, -9.4, 'fern'], [1.5, -2.2, 'pearls'],
    [-3.0, -4.3, 'fern'], [3.0, -5.5, 'pearls'], [-3.2, -7.0, 'pothos']].forEach(([x, z, kind], i) => {
    const top = vaultY(x);
    hangingPlant(hk, trs(x, top, z), top - 5.4 + (i % 3) * 0.4, 130 + i, kind);
  });
  // over the gallery wings (above head height up there) and in front of the back arch
  [[-4.4, -3.2, 'pothos', 5.5], [4.4, -3.6, 'fern', 5.4], [-4.5, -8.6, 'pearls', 5.6], [4.3, -8.0, 'pothos', 5.4],
    [-1.0, -10.0, 'pearls', 5.2], [1.1, -9.9, 'fern', 5.0]].forEach(([x, z, kind, bottom], i) => {
    const top = vaultY(x);
    hangingPlant(hk, trs(x, top, z), top - bottom, 140 + i, kind);
  });

  // the back arch, down into the lounge (its far face reaches the lounge's lower floor); the lounge's side of it
  // belongs to the lounge, so it is built with the rooms beyond
  crossWall(kit, out, HALL.z1, HALL.x * 2, HALL.spring, VX * 2, VSPRING, { type: 'arch', y: 0, w: 4.0, h: 4.4, ring: 0.3 }, 31, { y0B: LOUNGE.y });

  lounge(kit, out);
  stacks(root, kit, out);
  glasshouse(kit, out);
  garden(root, kit, out);

  hk.flush(hall);
  ho.forEach((m) => (m.isLight ? root : hall).add(m));
  root.add(hall);
  kit.flush(root);
  out.forEach((m) => root.add(m));
  Object.values(STATION_FURNITURE).forEach((g) => root.add(g));
  return root;
}
