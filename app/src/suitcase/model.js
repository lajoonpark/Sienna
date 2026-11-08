// The suitcase record player as painted 3D geometry (no behaviour here, see ../suitcase.js).
// Proportions come from the old SceneKit scene (Sources/Sienna/SuitcaseScene.swift) via
// tonearm.js: case 4.6 x 3.2, base 0.95 high, lid 0.55 thick. Units: x right, y up, z towards
// the viewer (the front of the case), the case centred over the origin.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toon, crisp } from '../materials.js';
import { LAYOUT as L, TONEARM, controlLayout } from '../tonearm.js';
import { MIN_ANGLE, SWEEP } from '../knob.js';
import {
  COL, leatherTexture, liningTexture, deckTexture, clothTexture, strokesTexture, vinylTexture, fallbackLabel, sheenTexture,
  shadowTexture, paperPatchTexture, glyphTexture, washBlend,
} from './paint.js';

// The shop's pigment noise is fixed to world space. The case leans, so its noise is fixed to the
// case instead (this is the inverse of the case's world matrix, kept up to date by the suitcase),
// otherwise the blotches would swim across the leather as the cursor moves.
export const caseSpace = { value: new THREE.Matrix4() };

export function painted(color, extra) {
  const m = toon(color, extra);
  const base = m.onBeforeCompile;
  if (base) {
    m.onBeforeCompile = (shader, renderer) => {
      base(shader, renderer);
      shader.uniforms.uCase = caseSpace;
      shader.vertexShader = shader.vertexShader
        .replace('varying vec3 vWPos;', 'varying vec3 vWPos;\nuniform mat4 uCase;')
        .replace('vWPos = (modelMatrix * wp).xyz;', 'vWPos = (uCase * modelMatrix * wp).xyz;');
    };
    m.customProgramCacheKey = () => 'wc-blotch-case';
  }
  return m;
}

// A part with brush strokes in its map. Its geometry gets brushUV when it is added to the case.
const brushed = (color, map) => {
  const m = painted(color, { map });
  m.userData.brushed = true;
  return m;
};

// Texture coordinates in the case's own units, each face projected flat, so that a stroke keeps its size
// and its direction on every part, long or short (the geometry's own stretch one image over each face).
function brushUV(geo) {
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    uv[i * 2] = ay >= ax && ay >= az ? p.getX(i) : ax >= az ? -p.getZ(i) * Math.sign(n.getX(i)) : p.getX(i) * Math.sign(n.getZ(i));
    uv[i * 2 + 1] = ay >= ax && ay >= az ? -p.getZ(i) : p.getY(i);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
const cyl = (r, h, n = 32) => new THREE.CylinderGeometry(r, r, h, n);

// Swap what a crisp label shows (crisp() lights the map through emissiveMap too).
export function setLabelMap(material, map) {
  material.map = map;
  material.emissiveMap = map;
}

// ---- the record: shared by the platter and by records in flight ----
export function createRecordKit() {
  const labelFraction = L.labelRadius / L.recordRadius;
  const vinylGeo = cyl(L.recordRadius, 0.02, 64);
  const labelGeo = new THREE.CircleGeometry(L.labelRadius, 48).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(L.labelRadius - 0.004, L.labelRadius + 0.03, 48).rotateX(-Math.PI / 2);
  const spindleGeo = cyl(0.03, 0.045, 12);
  const side = painted(COL.vinyl), bottom = painted(COL.vinyl);
  const top = painted('#ffffff', { map: vinylTexture(labelFraction) });
  const ringMat = painted(COL.ink), spindleMat = painted(COL.brassLight);
  const fallback = fallbackLabel();
  return {
    fallback,
    // A record at the origin, flat, label up. `cover` is any THREE.Texture.
    build(cover) {
      const group = new THREE.Group();
      const vinyl = new THREE.Mesh(vinylGeo, [side, top, bottom]);
      const label = new THREE.Mesh(labelGeo, crisp({ map: cover ?? fallback }));
      label.position.y = 0.0125;
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.0112;
      const spindle = new THREE.Mesh(spindleGeo, spindleMat);
      spindle.position.y = 0.025;
      group.add(vinyl, ring, label, spindle);
      return { group, labelMat: label.material, label };
    },
  };
}

// ---- the case ----
export function buildSuitcase({ recordKit, ground = 'shadow', big = false }) {
  const ctl = controlLayout(big);
  const w = L.caseWidth, d = L.caseDepth, bh = L.baseHeight, lh = L.lidHeight, deckTop = L.deckHeight;

  const root = new THREE.Group();       // placed by the caller
  const tilt = new THREE.Group();       // leans about the middle of the case
  const caseRoot = new THREE.Group();   // arrival offset, thump
  root.add(tilt);
  tilt.add(caseRoot);
  tilt.position.y = 0.6;
  caseRoot.position.y = -0.6;

  const strokes = strokesTexture();
  const mats = {
    leather: brushed('#ffffff', leatherTexture()),
    welt: brushed(COL.leatherDark, strokes),
    lining: brushed('#ffffff', liningTexture()),
    brass: brushed(COL.brass, strokes),
    deck: brushed('#ffffff', deckTexture()),
    platter: brushed(COL.platter, strokes),
    dark: brushed('#5d4f50', strokes),
    cloth: brushed('#ffffff', clothTexture()),
    steel: brushed('#9a8d78', strokes),
    cart: brushed(COL.hot, strokes),
    handle: brushed('#7e4c2c', strokes),
  };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    if ([mat].flat()[0].userData.brushed) brushUV(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  const solids = [];    // what counts as "over the case" for the pointer
  const hits = [];      // { mesh, control }: invisible, generous targets
  const hitMat = new THREE.MeshBasicMaterial();
  const addHit = (control, geo, x, y, z) => {
    const m = add(caseRoot, geo, hitMat, x, y, z);
    m.visible = false;
    hits.push({ mesh: m, control });
    return m;
  };

  // ---- base ----
  solids.push(add(caseRoot, rbox(w, bh, d, 0.07), mats.leather, 0, bh / 2, 0));
  add(caseRoot, rbox(w + 0.03, 0.07, d + 0.03, 0.03), mats.welt, 0, bh - 0.07, 0);   // welt under the seam
  add(caseRoot, rbox(w + 0.03, 0.07, d + 0.03, 0.03), mats.welt, 0, 0.09, 0);        // and above the foot
  add(caseRoot, new THREE.BoxGeometry(2 * L.deckHalfWidth, 0.02, 2 * L.deckHalfDepth), mats.deck, 0, bh, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(caseRoot, cyl(0.045, 0.014, 10), mats.brass, sx * (L.deckHalfWidth - 0.1), deckTop + 0.004, sz * (L.deckHalfDepth - 0.1));
    add(caseRoot, rbox(0.3, 0.3, 0.3, 0.05), mats.brass, sx * (w / 2 - 0.1), 0.15, sz * (d / 2 - 0.1));   // brass corners
  }

  // ---- lid, hinged along the back top edge ----
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, bh, -d / 2);
  caseRoot.add(lidPivot);
  // box faces: +x, -x, +y, -y, +z, -z; the bottom (-y) is the lining
  const shell = add(lidPivot, rbox(w, lh, d, 0.07), [mats.leather, mats.leather, mats.leather, mats.lining, mats.leather, mats.leather], 0, lh / 2, d / 2);
  solids.push(shell);
  // a leather lip round the lining, so the open lid reads as a tray and not a slab
  const lip = 0.06, band = 0.14;
  add(lidPivot, new THREE.BoxGeometry(w - 0.1, lip, band), mats.leather, 0, -lip / 2 + 0.01, d - band / 2 - 0.02);
  add(lidPivot, new THREE.BoxGeometry(w - 0.1, lip, band), mats.leather, 0, -lip / 2 + 0.01, band / 2 + 0.02);
  for (const sx of [-1, 1]) add(lidPivot, new THREE.BoxGeometry(band, lip, d - 0.3), mats.leather, sx * (w / 2 - band / 2 - 0.02), -lip / 2 + 0.01, d / 2);
  add(lidPivot, rbox(w + 0.03, 0.07, d + 0.03, 0.03), mats.welt, 0, 0.07, d / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [0, 1]) add(lidPivot, rbox(0.3, 0.3, 0.3, 0.05), mats.brass, sx * (w / 2 - 0.1), lh - 0.15, 0.1 + sz * (d - 0.2));
    add(lidPivot, rbox(0.34, 0.2, 0.06, 0.012), mats.brass, sx * 0.8, lh * 0.38, d + 0.025);
  }
  add(lidPivot, rbox(0.3, 0.2, 0.06, 0.012), mats.brass, 0, lh * 0.38, d + 0.025);
  add(lidPivot, rbox(0.7, 0.07, 0.1, 0.03), mats.welt, 0, lh - 0.02, 0.2);           // a strap loop on top

  // ---- the front: speaker cloth in brass frames, a leather handle, clasps ----
  const z = d / 2;
  for (const sx of [-1, 1]) {
    add(caseRoot, rbox(0.9, 0.62, 0.03, 0.01), mats.brass, sx * 1.5, bh * 0.5, z + 0.006);
    add(caseRoot, new THREE.PlaneGeometry(0.8, 0.52), mats.cloth, sx * 1.5, bh * 0.5, z + 0.03);
    add(caseRoot, rbox(0.34, 0.26, 0.06, 0.012), mats.brass, sx * 0.8, bh * 0.66, z + 0.03);       // clasp, base half
    add(caseRoot, rbox(0.2, 0.05, 0.07, 0.01), mats.dark, sx * 0.8, bh * 0.66, z + 0.045);
  }
  add(caseRoot, rbox(0.95, 0.2, 0.13, 0.05), mats.handle, 0, bh * 0.38, z + 0.065);                // handle
  for (const sx of [-1, 1]) add(caseRoot, cyl(0.04, 0.03, 10).rotateX(Math.PI / 2), mats.brass, sx * 0.38, bh * 0.38, z + 0.135);
  add(caseRoot, rbox(0.2, 0.22, 0.05, 0.01), mats.brass, 0, bh * 0.86, z + 0.03);                   // catch

  // ---- platter and the record seat ----
  add(caseRoot, cyl(L.platterRadius, 0.05, 64), mats.platter, L.record.x, deckTop + 0.025, L.record.z);
  add(caseRoot, cyl(0.03, 0.12, 12), mats.brass, L.record.x, deckTop + 0.07, L.record.z);   // the spindle stands even with no record on it
  const seat = new THREE.Group();                 // the record turns about its own centre
  seat.position.set(L.record.x, deckTop + 0.06, L.record.z);
  caseRoot.add(seat);
  const rec = recordKit.build(null);
  seat.add(rec.group);
  const recordHit = addHit('record', cyl(L.recordRadius, 0.06, 40), L.record.x, L.recordTop - 0.02, L.record.z);

  // a ring that lights up round the rim when the record can be grabbed
  const rimMat = washBlend(new THREE.MeshBasicMaterial({ color: COL.hot, opacity: 0 }));
  const rim = add(caseRoot, new THREE.RingGeometry(L.recordRadius - 0.06, L.recordRadius + 0.02, 64).rotateX(-Math.PI / 2), rimMat, L.record.x, L.recordTop + 0.012, L.record.z);
  rim.renderOrder = 2;

  // the sheen stays still while the record turns under it
  const sheenMat = washBlend(new THREE.MeshBasicMaterial({ map: sheenTexture(L.labelRadius / L.recordRadius) }));
  const sheen = add(caseRoot, new THREE.PlaneGeometry(2 * L.recordRadius, 2 * L.recordRadius).rotateX(-Math.PI / 2), sheenMat, L.record.x, L.recordTop + 0.018, L.record.z);
  sheen.renderOrder = 1;

  // ---- tonearm: the arm points along local -x; the pivot's turn aims it at the stylus ----
  const armPivot = new THREE.Group();
  const h = 0.2;
  armPivot.position.set(TONEARM.pivot.x, deckTop + h, TONEARM.pivot.z);
  caseRoot.add(armPivot);
  add(armPivot, cyl(0.17, h, 24), mats.platter, 0, -h / 2, 0);
  add(armPivot, cyl(0.1, 0.05, 20), mats.brass, 0, 0.02, 0);
  const armLift = new THREE.Group();              // raises the stylus off the groove
  armPivot.add(armLift);
  add(armLift, cyl(0.06, TONEARM.length, 12).rotateZ(Math.PI / 2), mats.steel, -TONEARM.length / 2, 0, 0);
  add(armLift, cyl(0.09, 0.24, 16).rotateZ(Math.PI / 2), mats.dark, 0.32, 0, 0);               // counterweight
  add(armLift, rbox(0.26, 0.045, 0.15, 0.012), mats.dark, -TONEARM.length - 0.05, -0.01, 0);   // headshell
  add(armLift, rbox(0.16, 0.1, 0.11, 0.015), mats.cart, -TONEARM.length - 0.05, -0.075, 0);   // cartridge

  // ---- volume knob: bezel and ticks stay put, the knob turns inside them ----
  const k = ctl.knob, kr = ctl.knobRadius;
  add(caseRoot, cyl(kr + 0.05, 0.03, 32), mats.brass, k.x, deckTop + 0.015, k.z);
  const tickGeo = new THREE.BoxGeometry(1, 0.008, 0.06);
  for (let i = 0; i < 11; i++) {
    const a = MIN_ANGLE + (i / 10) * SWEEP, r = kr + 0.13;
    const big = i === 0 || i === 10 || i === 5;
    const t = add(caseRoot, tickGeo, mats.dark, k.x + r * Math.sin(a), deckTop + 0.006, k.z - r * Math.cos(a));
    t.scale.x = big ? 0.034 : 0.02;
    t.rotation.y = -a;
  }
  const knob = new THREE.Group();
  knob.position.set(k.x, deckTop + 0.12, k.z);
  caseRoot.add(knob);
  const knobMat = brushed(COL.ink, strokes), knobTopMat = brushed('#4c5282', strokes), pointerMat = painted(COL.paper);
  add(knob, cyl(kr, 0.18, 32), knobMat);
  add(knob, cyl(kr - 0.06, 0.014, 32), knobTopMat, 0, 0.094, 0);
  add(knob, new THREE.BoxGeometry(0.06, 0.02, 0.2), pointerMat, 0, 0.105, -(kr - 0.14));
  addHit('knob', cyl(kr + 0.16, 0.3, 24), k.x, deckTop + 0.12, k.z);

  // ---- buttons: back, play/pause, skip, like ----
  const glyphs = { play: glyphTexture('play'), pause: glyphTexture('pause'), previous: glyphTexture('previous'), next: glyphTexture('next'), heart: glyphTexture('heart'), heartFill: glyphTexture('heartFill') };
  const initial = { previous: 'previous', playPause: 'play', next: 'next', like: 'heart' };
  const buttons = {};
  for (const [name, b] of Object.entries(ctl.buttons)) {
    const grp = new THREE.Group();
    grp.position.set(b.x, deckTop, b.z);
    caseRoot.add(grp);
    const ringMat = brushed(COL.brass, strokes);
    add(grp, cyl(b.radius + 0.04, 0.034, 24), ringMat, 0, 0.017, 0);
    const cap = new THREE.Group();
    grp.add(cap);
    const capMat = brushed(COL.ink, strokes);
    add(cap, cyl(b.radius, 0.08, 24), capMat, 0, 0.045, 0);
    const glyphMat = crisp({ map: glyphs[initial[name]], alphaTest: 0.5 });
    const glyph = add(cap, new THREE.PlaneGeometry(2 * b.radius * 1.15, 2 * b.radius * 1.15).rotateX(-Math.PI / 2), glyphMat, 0, 0.0865, 0);
    addHit(name, cyl(b.radius + 0.1, 0.2, 20), b.x, deckTop + 0.04, b.z);
    buttons[name] = { group: grp, cap, capMat, ringMat, glyphMat, glyph };
  }

  // ---- shadow: a loose painted wash on the ground, outside the lean so it stays flat ----
  // (ground 'paper': an unpainted patch of paper instead, for the busy shop view)
  const paper = ground === 'paper';
  const shadowMat = washBlend(new THREE.MeshBasicMaterial({ map: paper ? paperPatchTexture() : shadowTexture(), opacity: paper ? 1 : 0.9 }));
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w + (paper ? 1.7 : 2.6), d + (paper ? 1.3 : 2.2)).rotateX(-Math.PI / 2), shadowMat);
  shadow.position.set(paper ? 0.05 : 0.1, 0.004, paper ? 0.1 : 0.25);
  shadow.renderOrder = -1;
  root.add(shadow);

  // ---- light: warm, from the upper left front; part of the case so a lean does not relight it ----
  const hemi = new THREE.HemisphereLight('#fff1da', '#a98a6a', 1.55);
  const sun = new THREE.DirectionalLight('#ffd9a2', 2.2);
  sun.position.set(-4, 9, 6);
  root.add(hemi, sun, sun.target);

  return {
    ctl, root, tilt, caseRoot, lidPivot, seat, record: rec, recordHit, armPivot, armLift, knob,
    knobMat, knobTopMat, pointerMat, buttons, glyphs, rim, rimMat, shadow, solids, hits, mats,
  };
}
