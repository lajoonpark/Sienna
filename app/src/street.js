// The outdoor scene: a narrow Tuscan alley of individual brick and stucco houses, an arch over the
// street, opening into a little piazza in front of the Sienna record shop. Everything is real
// geometry (bricks, tiles, shutter slats) through the instanced kit; no flat brick textures.
import * as THREE from 'three';
import { createKit, trs, mul, BRICK } from './kit.js';
import { brickWall, plasterWall, archBridge, flagstones, PALETTES } from './masonry.js';
import { windowUnit, doorUnit, balcony, wallLantern, eaves, drainpipe, pottedPlant, blk, rod } from './details.js';
import { registerLamp, glowMesh } from './env.js';
import { scooter, bicycle, cafeSet, crate, stall, chalkboard, bench, lampPost, stringLights, washingLine, bunting } from './props.js';
import { stickerTexture } from './textures.js';
import { FONT, onLettering } from './style.js';
import { toon, keepSharp } from './materials.js';
import { rng } from './rand.js';

export const STREET_HALF = 3.4;
const ALLEY = { z0: 4.6, z1: 28 };
const PIAZZA_HALF = 5.4;
const SHOP_W = PIAZZA_HALF * 2;
const DOOR = { w: 2.0, h: 3.0 }; // the door leaves; an arched fanlight sits above

const PLASTERS = ['#e9b98a', '#efd2a2', '#e3a07a', '#f0dcc0', '#d9a07a', '#ecc690', '#e8c8b0'];
const CURTAINS = ['#f4efe4', '#f2d9c4', '#e8e2d4', null, null];

const rows = (h) => Math.round(h / BRICK.row) * BRICK.row;
const GF = rows(3.1); // top of the brick ground floor on stucco houses

// Frame for a wall: origin at world point o, local x along `along`, +z along `normal`.
function frame(o, along, normal) {
  const x = new THREE.Vector3(...along), z = new THREE.Vector3(...normal);
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...o);
}

// One house front. Returns meshes that are not instanced (backing slabs, glass, lamps).
function house(kit, M, spec) {
  const { w, seed } = spec;
  const r = rng(seed);
  const out = [];
  const allBrick = spec.brick;
  const h = rows(spec.h);
  const pal = spec.pal ?? PALETTES.honey;
  const color = spec.color ?? PLASTERS[Math.floor(r() * PLASTERS.length)];
  const nf = h > 9.4 ? 3 : 2;

  // ---- ground floor ----
  const ground = [];
  const kind = spec.ground ?? ['shop', 'door', 'garage'][Math.floor(r() * 3)];
  let shopO = null, doorO = null, sideWin = null;
  if (kind === 'shop') {
    shopO = { type: 'arch', x: w / 2, y: 0, w: Math.min(2.5, w - 1.6), h: 2.9 };
    ground.push(shopO);
  } else if (kind === 'garage') {
    doorO = { type: 'arch', x: w / 2, y: 0, w: Math.min(2.4, w - 1.6), h: 2.85 };
    ground.push(doorO);
  } else {
    doorO = { type: 'rect', x: w * 0.32, y: 0, w: 1.1, h: 2.3, lintel: true };
    sideWin = { type: 'rect', x: w * 0.74, y: 1.0, w: 0.8, h: 1.1, lintel: true };
    ground.push(doorO, sideWin);
  }

  // ---- upper floors ----
  const upper = [];
  const nwin = Math.max(1, Math.floor((w - 0.5) / 1.85));
  const balconyFloor = spec.balcony ? 1 : 0;
  const balconyIdx = Math.floor(nwin / 2);
  const winFloors = [];
  for (let f = 1; f <= nf; f++) {
    const fy = GF + 0.12 + (f - 1) * 2.55;
    for (let i = 0; i < nwin; i++) {
      const x = ((i + 0.5) * w) / nwin;
      const isBalc = f === balconyFloor && i === balconyIdx;
      const arch = allBrick && f === 1 && !isBalc && r() < 0.5;
      const o = isBalc
        ? { type: 'rect', x, y: fy + 0.05, w: 0.95, h: 2.1, lintel: allBrick }
        : arch
          ? { type: 'arch', x, y: fy + 0.5, w: 0.85, h: 1.6, ring: 0.2 }
          : { type: 'rect', x, y: fy + 0.5, w: 0.82, h: f === nf ? 1.25 : 1.45, lintel: allBrick };
      upper.push(o);
      winFloors.push({ o, f, isBalc, fy });
    }
  }

  // ---- walls ----
  if (allBrick) {
    out.push(...brickWall(kit, M, { w, y1: h, openings: [...ground, ...upper], seed, pal }));
  } else {
    out.push(...brickWall(kit, M, { w, y1: GF, openings: ground, seed, pal }));
    // a stone string course between the brick base and the stucco
    blk(kit, M, w / 2, GF + 0.04, 0.05, w, 0.1, 0.12, '#e6d7bb');
    out.push(...plasterWall(kit, M, { w, y0: GF, y1: h, openings: upper, color, seed, pal, patches: 1 + Math.floor(r() * 3) }));
  }

  // ---- fill the openings ----
  if (shopO) {
    // a little lit bottega behind the arch: back wall, shelves of jars, a counter
    const R = mul(M, trs(shopO.x, 0, -1.0));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(shopO.w + 0.6, 3.2), toon('#f0c890'));
    back.applyMatrix4(mul(R, trs(0, 1.6, -0.6)));
    out.push(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.2), toon('#e0b07a'));
      side.applyMatrix4(mul(R, trs(s * (shopO.w / 2 + 0.05), 1.6, 0.1, 0, -s * Math.PI / 2, 0)));
      out.push(side);
    }
    for (let k = 0; k < 3; k++) {
      blk(kit, R, 0, 1.0 + k * 0.5, -0.45, shopO.w, 0.04, 0.3, '#8a5a32');
      for (let j = 0; j < 8; j++) {
        const c = new THREE.Color().setHSL(r(), 0.4, 0.5 + r() * 0.2);
        kit.pot.add(mul(R, trs(-shopO.w / 2 + 0.2 + j * ((shopO.w - 0.4) / 7), 1.12 + k * 0.5, -0.45, Math.PI, 0, 0, 0.12, 0.2, 0.12)), c);
      }
    }
    blk(kit, R, 0, 0.45, 0.3, shopO.w - 0.4, 0.9, 0.5, '#9a6a3c');
    // canvas awning over the arch
    const stripe = ['#c4673d', '#3f6e6a', '#6a86a0', '#8a9a5b'][Math.floor(r() * 4)];
    const aw = shopO.w + 0.6;
    for (let i = 0; i < 9; i++) blk(kit, M, shopO.x - aw / 2 + (i + 0.5) * (aw / 9), 3.35, 0.55, aw / 9, 0.03, 1.15, i % 2 ? stripe : '#f2e8d4', 0.42);
    for (let i = 0; i < 18; i++) kit.disc.add(mul(M, trs(shopO.x - aw / 2 + (i + 0.5) * (aw / 18), 3.07, 1.08, Math.PI / 2, 0, 0, 0.13, 0.02, 0.13)), Math.floor(i / 2) % 2 ? stripe : '#f2e8d4');
    rod(kit, M, [shopO.x - aw / 2, 3.6, 0.02], [shopO.x - aw / 2, 3.1, 1.1], 0.015, '#2b2a2e');
    rod(kit, M, [shopO.x + aw / 2, 3.6, 0.02], [shopO.x + aw / 2, 3.1, 1.1], 0.015, '#2b2a2e');
    // goods spilling out front
    crate(kit, mul(M, trs(shopO.x - 0.7, 0, 0.45, 0, 0.1, 0)), 0.6, 0.45, 0.32, seed + 5, r() > 0.5 ? 'fruit' : 'lemons');
    crate(kit, mul(M, trs(shopO.x + 0.75, 0, 0.4, 0, -0.08, 0)), 0.6, 0.45, 0.32, seed + 6, 'fruit');
  }
  if (doorO) {
    out.push(...doorUnit(kit, M, doorO, { color: ['#5a3d24', '#3f5e4a', '#6a4a3a', '#2f4e5a'][Math.floor(r() * 4)], seed }));
    if (doorO.type === 'rect') {
      pottedPlant(kit, M, doorO.x - 0.85, 0, 0.35, 0.9, seed + 3);
      if (r() > 0.4) pottedPlant(kit, M, doorO.x + 0.85, 0, 0.35, 0.7, seed + 4, 'geranium');
    }
  }
  if (sideWin) {
    out.push(...windowUnit(kit, M, sideWin, { seed: seed + 8, sill: true, curtain: '#f4efe4' }));
    for (let k = 0; k < 6; k++) rod(kit, M, [sideWin.x - 0.32 + k * 0.128, sideWin.y, 0.06], [sideWin.x - 0.32 + k * 0.128, sideWin.y + sideWin.h, 0.06], 0.012, '#2b2a2e');
  }
  for (const { o, f, isBalc } of winFloors) {
    const state = ['open', 'open', 'half', 'closed'][Math.floor(r() * 4)];
    out.push(...windowUnit(kit, M, o, {
      seed: seed * 13 + o.x * 7 + f,
      shutters: isBalc ? 'open' : state,
      color: spec.shutter,
      curtain: CURTAINS[Math.floor(r() * CURTAINS.length)],
      frame: allBrick ? null : '#f2e6d0',
      sill: !isBalc,
      box: !isBalc && f === 1 && r() > 0.35 ? (r() > 0.3 ? '#d63a2f' : '#e86a8a') : null,
    }));
    if (isBalc) balcony(kit, M, o.x, o.y - 0.02, 1.7, { seed });
  }

  // ---- roof, pipes, lamps ----
  eaves(kit, M, w, h, seed);
  if (spec.pipe !== false) drainpipe(kit, M, w - 0.12, h);
  if (spec.lantern) out.push(...wallLantern(kit, M, spec.lantern === 'left' ? 0.5 : w - 0.55, 3.45, { order: r() }));
  // mass behind the facade so roofs and steps read against the sky
  const mass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), toon(allBrick ? pal.mortar : color));
  mass.applyMatrix4(mul(M, trs(w / 2, h / 2, -3.25)));
  mass.receiveShadow = true;
  out.push(mass);
  return { meshes: out, h };
}

// A row of houses along one side of the alley, from z0 to z1. side: -1 left (x<0), +1 right.
function row(kit, root, side, z0, z1, seed) {
  const r = rng(seed);
  let z = z0;
  let i = 0;
  const widths = [];
  while (z1 - z > 0.1) {
    let w = 3.4 + r() * 2.6;
    if (z1 - z - w < 3.2) w = z1 - z;
    widths.push([z, w]);
    z += w;
  }
  const houses = [];
  for (const [zs, w] of widths) {
    const set = (r() - 0.5) * 0.16;
    const M = side < 0
      ? frame([-STREET_HALF + set, 0, zs + w], [0, 0, -1], [1, 0, 0])
      : frame([STREET_HALF - set, 0, zs], [0, 0, 1], [-1, 0, 0]);
    const s = seed * 100 + i * 17;
    const spec = {
      w, seed: s,
      h: 7.4 + r() * 3.2,
      brick: r() < 0.4,
      balcony: r() < 0.45,
      lantern: i % 2 === 0 ? (r() > 0.5 ? 'left' : 'right') : null,
      ground: ['shop', 'door', 'garage', 'door', 'shop'][Math.floor(r() * 5)],
    };
    const { meshes, h } = house(kit, M, spec);
    meshes.forEach((m) => root.add(m));
    houses.push({ zs, w, h, side });
    i++;
  }
  return houses;
}

// The Sienna shop: brick ground floor with two arched display windows and an arched door,
// stucco above with a balcony. Faces +z at z = 0.
function shopFront(kit, root) {
  const M = frame([-PIAZZA_HALF, 0, 0], [1, 0, 0], [0, 0, 1]);
  const w = SHOP_W, cx = w / 2, h = rows(9.4);
  const top = rows(4.9);
  const pal = PALETTES.honey;
  const door = { type: 'arch', x: cx, y: 0, w: DOOR.w, h: DOOR.h + DOOR.w / 2, ring: 0.3 };
  const wins = [-3.0, 3.0].map((dx) => ({ type: 'arch', x: cx + dx, y: 0.55, w: 2.3, h: 3.4, ring: 0.3 }));
  const meshes = [];
  meshes.push(...brickWall(kit, M, { w, y1: top, openings: [door, ...wins], seed: 501, pal }));
  blk(kit, M, cx, top + 0.05, 0.06, w, 0.12, 0.14, '#e6d7bb');
  const upper = [-3.2, 0, 3.2].map((dx) => ({ type: 'rect', x: cx + dx, y: dx === 0 ? top + 0.15 : top + 0.6, w: dx === 0 ? 1.1 : 0.9, h: dx === 0 ? 2.15 : 1.5 }));
  const upper2 = [-3.2, 0, 3.2].map((dx) => ({ type: 'rect', x: cx + dx, y: top + 2.9, w: 0.8, h: 1.1 }));
  meshes.push(...plasterWall(kit, M, { w, y0: top, y1: h, openings: [...upper, ...upper2], color: '#e3a07a', seed: 502, pal, patches: 2 }));
  upper.forEach((o, i) => meshes.push(...windowUnit(kit, M, o, { seed: 520 + i, shutters: 'open', color: '#3f6e6a', frame: '#f2e6d0', sill: i !== 1, curtain: '#f4efe4', box: i !== 1 ? '#d63a2f' : null })));
  upper2.forEach((o, i) => meshes.push(...windowUnit(kit, M, o, { seed: 530 + i, shutters: i === 1 ? 'closed' : 'half', color: '#3f6e6a', frame: '#f2e6d0' })));
  balcony(kit, M, cx, top + 0.13, 2.6, { seed: 540 });
  eaves(kit, M, w, h, 503);
  drainpipe(kit, M, 0.15, h);
  drainpipe(kit, M, w - 0.15, h);

  // the wall is deep: line the openings so you never see into the gap. The lining stands REVEAL_IN inside the
  // opening: flush with it, its face lay exactly on the mortar backing's cut and the bricks' ends, and the two
  // fought over every pixel there (the arches and jambs flickered whenever the camera moved).
  const reveal = toon('#e0c9a0');
  const REVEAL_IN = 0.012;
  for (const o of [door, ...wins]) {
    const r0 = o.w / 2, spring = o.y + o.h - r0, ri = r0 - REVEAL_IN;
    const outer = new THREE.Shape();
    outer.moveTo(o.x - r0 - 0.08, o.y - 0.05); outer.lineTo(o.x + r0 + 0.08, o.y - 0.05); outer.lineTo(o.x + r0 + 0.08, spring);
    outer.absarc(o.x, spring, r0 + 0.08, 0, Math.PI, false); outer.closePath();
    const hole = new THREE.Path();
    hole.moveTo(o.x - ri, o.y); hole.lineTo(o.x + ri, o.y); hole.lineTo(o.x + ri, spring);
    hole.absarc(o.x, spring, ri, 0, Math.PI, false); hole.closePath();
    outer.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(outer, { depth: 0.5, bevelEnabled: false, curveSegments: 20 });
    g.translate(0, 0, -0.55);
    const m = new THREE.Mesh(g, reveal);
    m.applyMatrix4(M);
    meshes.push(m);
  }

  // display windows: glass, a ledge of records facing the street, a little hanging plant
  for (const o of wins) {
    const spring = o.y + o.h - o.w / 2;
    const glassMat = new THREE.MeshBasicMaterial({ color: '#cfe0e6', transparent: true, opacity: 0.18, depthWrite: false });
    const g1 = new THREE.Mesh(new THREE.PlaneGeometry(o.w, spring - o.y), glassMat);
    g1.applyMatrix4(mul(M, trs(o.x, (o.y + spring) / 2, -0.25)));
    const g2 = new THREE.Mesh(new THREE.CircleGeometry(o.w / 2, 20, 0, Math.PI), glassMat);
    g2.applyMatrix4(mul(M, trs(o.x, spring, -0.25)));
    meshes.push(g1, g2);
    const wood = '#3f6e6a';
    blk(kit, M, o.x, o.y + 0.04, -0.24, o.w, 0.08, 0.08, wood);
    blk(kit, M, o.x, spring, -0.24, o.w, 0.06, 0.06, wood);
    blk(kit, M, o.x, (o.y + spring) / 2, -0.24, 0.06, spring - o.y, 0.06, wood);
    blk(kit, M, o.x, o.y + 0.02, 0.06, o.w + 0.3, 0.1, 0.32, '#e9dcc2');
    blk(kit, M, o.x, o.y + 0.08, -0.4, o.w - 0.1, 0.06, 0.28, '#8a5a32');
    const r = rng(o.x * 10);
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Color().setHSL(r(), 0.45, 0.5);
      blk(kit, M, o.x - 0.65 + k * 0.65, o.y + 0.42, -0.42, 0.55, 0.55, 0.02, c, -0.15, (k - 1) * 0.2, 0);
      kit.disc.add(mul(M, trs(o.x - 0.65 + k * 0.65 + 0.12, o.y + 0.5, -0.45, Math.PI / 2 - 0.15, 0, 0, 0.5, 0.01, 0.5)), '#1d1b1d');
    }
  }

  // sign board above the door, sticker lettering in the app's cursive
  blk(kit, M, cx, top - 0.42, 0.04, 3.6, 0.62, 0.08, '#3f6e6a');
  const signTex = stickerTexture('Sienna', { w: 1024, h: 256, size: 200, font: () => FONT });
  onLettering(signTex, signTex.redraw);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.82), keepSharp(new THREE.MeshBasicMaterial({ map: signTex, alphaTest: 0.5 })) /* cut out, so it can flag itself sharp */);
  sign.applyMatrix4(mul(M, trs(cx, top - 0.4, 0.1, 0, 0, -0.03)));
  meshes.push(sign);
  // hanging blade sign: a big vinyl record on an iron bracket
  rod(kit, M, [cx + 4.95, 3.9, 0.02], [cx + 4.95, 3.9, 1.1], 0.025, '#24211f');
  rod(kit, M, [cx + 4.95, 3.5, 0.02], [cx + 4.95, 3.9, 0.7], 0.015, '#24211f');
  kit.disc.add(mul(M, trs(cx + 4.95, 3.35, 0.7, 0, 0, Math.PI / 2, 0.95, 0.05, 0.95)), '#1d1b1d');
  kit.disc.add(mul(M, trs(cx + 4.95, 3.35, 0.7, 0, 0, Math.PI / 2, 0.36, 0.06, 0.36)), '#e86a3a');
  for (const s of [-1, 1]) {
    meshes.push(...wallLantern(kit, M, cx + s * 1.55, 3.0, { order: 0.05 + (s > 0 ? 0.02 : 0) }));
    pottedPlant(kit, M, cx + s * 1.55, 0, 0.5, 1.4, 560 + s, 'lemon');
  }
  // crates of records under the windows, chalkboard, bench, bicycle
  for (const o of wins) {
    const T = mul(M, trs(o.x, 0, 0.75));
    for (const [x, z] of [[-0.75, -0.25], [0.75, -0.25], [-0.75, 0.25], [0.75, 0.25]]) rod(kit, T, [x, 0, z], [x, 0.62, z], 0.025, '#5a3d24');
    blk(kit, T, 0, 0.64, 0, 1.75, 0.05, 0.7, '#8a5a32');
    crate(kit, mul(T, trs(-0.43, 0.66, 0, 0, 0.04, 0)), 0.8, 0.62, 0.32, Math.round(o.x * 3), 'records');
    crate(kit, mul(T, trs(0.43, 0.66, 0, 0, -0.05, 0)), 0.8, 0.62, 0.32, Math.round(o.x * 3) + 1, 'records');
  }
  chalkboard(kit, mul(M, trs(cx - 1.4, 0, 1.6, 0, 0.5, 0)));
  bicycle(kit, mul(M, trs(cx + 4.55, 0, 0.35, 0, Math.PI / 2 + 0.15, 0)));

  // door leaves, hinged at the jambs and opening inward (animated by the intro)
  const leaves = [];
  const leafW = DOOR.w / 2 - 0.02;
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * (DOOR.w / 2), DOOR.h / 2, -0.3);
    const L = new THREE.Group();
    L.scale.x = -s;
    const wood = toon('#3f6e6a');
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; L.add(m); };
    add(new THREE.BoxGeometry(0.1, DOOR.h, 0.1), wood, 0.05, 0, 0);
    add(new THREE.BoxGeometry(0.1, DOOR.h, 0.1), wood, leafW - 0.05, 0, 0);
    add(new THREE.BoxGeometry(leafW, 0.12, 0.1), wood, leafW / 2, DOOR.h / 2 - 0.06, 0);
    add(new THREE.BoxGeometry(leafW, 0.9, 0.08), wood, leafW / 2, -DOOR.h / 2 + 0.45, 0);
    add(new THREE.BoxGeometry(leafW, 0.08, 0.1), wood, leafW / 2, -0.55, 0);
    add(new THREE.BoxGeometry(leafW - 0.1, 2.0, 0.02), new THREE.MeshBasicMaterial({ color: '#f6dca8', transparent: true, opacity: 0.35 }), leafW / 2, 0.45, 0);
    add(new THREE.BoxGeometry(0.035, 2.0, 0.04), wood, leafW / 2, 0.45, 0);
    add(new THREE.BoxGeometry(0.05, 0.32, 0.06), toon('#d8b25c'), leafW - 0.14, -0.15, 0.08);
    pivot.add(L);
    root.add(pivot);
    leaves.push({ pivot, side: s });
  }
  // fanlight over the door
  const fan = new THREE.Mesh(new THREE.CircleGeometry(DOOR.w / 2, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#f6dca8', transparent: true, opacity: 0.4 }));
  fan.position.set(0, DOOR.h, -0.3);
  meshes.push(fan);
  for (let k = 1; k < 5; k++) {
    const a = (k / 5) * Math.PI;
    rod(kit, new THREE.Matrix4(), [0, DOOR.h, -0.28], [Math.cos(a) * 0.98, DOOR.h + Math.sin(a) * 0.98, -0.28], 0.018, '#3f6e6a');
  }
  blk(kit, new THREE.Matrix4(), 0, DOOR.h + 0.03, -0.28, DOOR.w, 0.07, 0.08, '#3f6e6a');
  blk(kit, new THREE.Matrix4(), 0, 0.06, 0.25, DOOR.w + 0.6, 0.12, 0.5, '#d8ccb6');

  meshes.forEach((m) => root.add(m));
  return leaves;
}

export function buildStreet() {
  const root = new THREE.Group();
  const kit = createKit();

  // paving: alley and piazza
  root.add(flagstones(kit, { x0: -STREET_HALF, x1: STREET_HALF, z0: ALLEY.z0 - 0.2, z1: ALLEY.z1 + 2, seed: 11 }));
  root.add(flagstones(kit, { x0: -PIAZZA_HALF, x1: PIAZZA_HALF, z0: -0.2, z1: ALLEY.z0, seed: 12, gutter: false, pal: PALETTES.rose }));

  // houses on both sides of the alley
  row(kit, root, -1, ALLEY.z0, ALLEY.z1, 3);
  row(kit, root, 1, ALLEY.z0, ALLEY.z1, 4);

  // piazza: side houses and the ends of the alley rows facing it
  for (const s of [-1, 1]) {
    const M = s < 0
      ? frame([-PIAZZA_HALF, 0, ALLEY.z0], [0, 0, -1], [1, 0, 0])
      : frame([PIAZZA_HALF, 0, 0], [0, 0, 1], [-1, 0, 0]);
    const { meshes } = house(kit, M, { w: ALLEY.z0, seed: 800 + s, h: 8.8, brick: s > 0, balcony: true, ground: s < 0 ? 'shop' : 'door', lantern: 'right', pipe: false });
    meshes.forEach((m) => root.add(m));
    const E = s < 0
      ? frame([-STREET_HALF, 0, ALLEY.z0], [-1, 0, 0], [0, 0, -1])
      : frame([PIAZZA_HALF, 0, ALLEY.z0], [-1, 0, 0], [0, 0, -1]);
    const ew = PIAZZA_HALF - STREET_HALF;
    root.add(...brickWall(kit, E, { w: ew, y1: rows(8.8), seed: 820 + s, pal: PALETTES.honey }));
    eaves(kit, E, ew, rows(8.8), 830 + s);
  }

  // the arch over the alley, with a lantern hanging in it
  const archM = frame([-STREET_HALF, 0, 13.4], [1, 0, 0], [0, 0, 1]);
  archBridge(kit, archM, { w: STREET_HALF * 2, h: 9.6, d: 2.4, archW: 5.4, archH: 5.0, seed: 41, plaster: '#efd2a2' }).forEach((m) => root.add(m));
  rod(kit, new THREE.Matrix4(), [0, 5.05, 12.2], [0, 4.4, 12.2], 0.012, '#24211f');
  {
    const hang = trs(0, 4.25, 12.2);
    kit.cone.add(mul(hang, trs(0, 0.2, 0, 0, Math.PI / 4, 0, 0.32, 0.16, 0.32)), '#24211f');
    const gm = new THREE.MeshBasicMaterial({ color: '#5a4c40' });
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.32, 0.17), gm);
    g.applyMatrix4(hang);
    root.add(g);
    const halo = glowMesh('sprite', 1.4, 0.7);
    halo.position.set(0, 4.25, 12.2);
    const pool = glowMesh('plane', 4.5, 0.28);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.1, 12.2);
    pool.scale.set(4.5, 4.5, 1);
    root.add(halo, pool);
    registerLamp({ glass: gm, glows: [halo, pool], order: 0.3 });
  }

  // street life
  scooter(kit, trs(2.5, 0, 15.6, 0, -0.25, 0), '#d1342c');
  scooter(kit, trs(2.55, 0, 8.2, 0, -0.3, 0), '#e8d6b0');
  scooter(kit, trs(2.45, 0, 22.5, 0, 2.9, 0), '#6a9ab0');
  stall(kit, trs(-2.3, 0, 16.2, 0, Math.PI / 2, 0), 61, '#3f6e6a');
  bench(kit, trs(2.75, 0, 18.2, 0, -Math.PI / 2, 0));
  pottedPlant(kit, new THREE.Matrix4(), 2.85, 0, 19.4, 1.2, 70, 'lemon');
  pottedPlant(kit, new THREE.Matrix4(), -2.95, 0, 9.4, 1.0, 71, 'bush');
  pottedPlant(kit, new THREE.Matrix4(), -2.95, 0, 14.2, 0.9, 72, 'geranium');
  cafeSet(kit, trs(-3.9, 0, 2.7, 0, 0.3, 0), 81, '#c4673d');
  cafeSet(kit, trs(-3.6, 0, 0.9 + 0.6, 0, -0.4, 0), 82, null);
  bench(kit, trs(4.6, 0, 3.0, 0, -Math.PI / 2, 0));
  root.add(...lampPost(kit, trs(-4.7, 0, 4.1), 0.1));
  root.add(...lampPost(kit, trs(4.7, 0, 4.1), 0.12));

  // things strung across the street
  root.add(stringLights(kit, [-STREET_HALF, 4.6, 3.2], [STREET_HALF + 1.8, 4.4, 0.05], { orderBase: 0.15 }));
  root.add(stringLights(kit, [-PIAZZA_HALF, 4.3, 1.0], [PIAZZA_HALF, 4.5, 3.6], { orderBase: 0.18, n: 18 }));
  washingLine(kit, [-STREET_HALF, 6.7, 8.0], [STREET_HALF, 6.9, 7.3], 5);
  washingLine(kit, [-STREET_HALF, 7.2, 17.2], [STREET_HALF, 7.0, 17.9], 6);
  bunting(kit, [-STREET_HALF, 5.6, 9.6], [STREET_HALF, 5.8, 9.9], 7);
  bunting(kit, [-STREET_HALF, 5.8, 15.5], [STREET_HALF, 5.6, 15.1], 8);

  const leaves = shopFront(kit, root);
  kit.flush(root);
  return { root, leaves };
}
