// The suitcase record player as painted 3D geometry, ported from the app (app/src/suitcase/model.js):
// a tan leather case with brass corners, a quilted lid on a hinge, speaker cloth and clasps on the front,
// a cream deck with the platter, the tonearm, the volume knob and four buttons. The record itself is
// one of the page's records (it flies in from its sleeve), so the case has none of its own.
// Case units (tonearm.js): x right, y up, z toward the front; the case centred over the origin.
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, PlaneGeometry, RingGeometry, BufferAttribute, MeshBasicMaterial,
  CanvasTexture, SRGBColorSpace, RepeatWrapping, Color, Matrix4,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toon, crisp } from '../materials.js';
import { LAYOUT as L, CONTROLS, TONEARM } from './tonearm.js';
import { MIN_ANGLE, SWEEP } from './controls.js';
import { COL, PAINTERS } from '../paint/painters.js';
import { makeCanvas } from '../paint/brushpaint.js';

const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
const cyl = (r, h, n = 32) => new CylinderGeometry(r, r, h, n);

// Texture coordinates in the case's own units, each face projected flat, so a stroke keeps its size
// and direction on every part, long or short.
function brushUV(geo) {
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    uv[i * 2] = ay >= ax && ay >= az ? p.getX(i) : ax >= az ? -p.getZ(i) * Math.sign(n.getX(i)) : p.getX(i) * Math.sign(n.getZ(i));
    uv[i * 2 + 1] = ay >= ax && ay >= az ? -p.getZ(i) : p.getY(i);
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
}

// ---- glyphs for the buttons: chunky shapes with rounded joins, cream (terracotta when liked) ----
const GLYPHS = {
  play: (g, S) => { g.beginPath(); g.moveTo(S * 0.36, S * 0.25); g.lineTo(S * 0.76, S * 0.5); g.lineTo(S * 0.36, S * 0.75); g.closePath(); },
  pause: (g, S) => { g.beginPath(); g.roundRect(S * 0.28, S * 0.25, S * 0.17, S * 0.5, S * 0.04); g.roundRect(S * 0.55, S * 0.25, S * 0.17, S * 0.5, S * 0.04); },
  previous: (g, S) => { g.beginPath(); g.roundRect(S * 0.22, S * 0.26, S * 0.1, S * 0.48, S * 0.03); g.moveTo(S * 0.78, S * 0.27); g.lineTo(S * 0.4, S * 0.5); g.lineTo(S * 0.78, S * 0.73); g.closePath(); },
  next: (g, S) => { g.beginPath(); g.roundRect(S * 0.68, S * 0.26, S * 0.1, S * 0.48, S * 0.03); g.moveTo(S * 0.22, S * 0.27); g.lineTo(S * 0.6, S * 0.5); g.lineTo(S * 0.22, S * 0.73); g.closePath(); },
  heart: (g, S) => {
    g.beginPath(); g.moveTo(S * 0.5, S * 0.78);
    g.bezierCurveTo(S * 0.14, S * 0.52, S * 0.2, S * 0.2, S * 0.38, S * 0.24);
    g.bezierCurveTo(S * 0.46, S * 0.26, S * 0.5, S * 0.32, S * 0.5, S * 0.36);
    g.bezierCurveTo(S * 0.5, S * 0.32, S * 0.54, S * 0.26, S * 0.62, S * 0.24);
    g.bezierCurveTo(S * 0.8, S * 0.2, S * 0.86, S * 0.52, S * 0.5, S * 0.78);
    g.closePath();
  },
};
function glyphTexture(kind) {
  const S = 128, [c, g] = makeCanvas(S, S);
  g.lineJoin = 'round'; g.lineCap = 'round';
  GLYPHS[kind === 'heartFill' ? 'heart' : kind](g, S);
  if (kind === 'heart') { g.strokeStyle = COL.paper; g.lineWidth = S * 0.07; g.stroke(); }
  else if (kind === 'heartFill') { g.fillStyle = COL.hot; g.fill(); g.strokeStyle = COL.paper; g.lineWidth = S * 0.06; g.stroke(); }
  else { g.fillStyle = COL.paper; g.fill(); g.strokeStyle = COL.paper; g.lineWidth = S * 0.05; g.stroke(); }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// Two soft bright wedges that stay put while the record turns under them (the shine of a lamp).
function sheenTexture(labelFraction) {
  const S = 512, [c, g] = makeCanvas(S, S), m = S / 2;
  g.save();
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.arc(m, m, m * labelFraction, 0, Math.PI * 2, true);
  g.clip('evenodd');
  for (let deg = 0; deg < 360; deg++) {
    const a = (deg * Math.PI) / 180, lobe = Math.abs(Math.cos(a - Math.PI * 0.28)) ** 20;
    if (lobe < 0.01) continue;
    g.fillStyle = `rgba(255,250,235,${0.34 * lobe})`;
    g.beginPath(); g.moveTo(m, m); g.lineTo(m + m * Math.cos(a), m + m * Math.sin(a));
    g.lineTo(m + m * Math.cos(a + Math.PI / 180), m + m * Math.sin(a + Math.PI / 180)); g.closePath(); g.fill();
  }
  g.restore();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function buildSuitcase() {
  const ctl = CONTROLS;
  const w = L.caseWidth, d = L.caseDepth, bh = L.baseHeight, lh = L.lidHeight, deckTop = L.deckHeight;

  const root = new Group();      // placed by the scene
  const caseRoot = new Group();  // the thump on landing
  root.add(caseRoot);
  const space = { value: new Matrix4() }; // world -> case, so the pigment blotches stay on the leather

  // [colour before its texture, colour once painted, texture name]
  const SPEC = {
    leather: [COL.leather, '#ffffff', 'leather'],
    welt: [COL.leatherDark, COL.leatherDark, 'strokes'],
    lining: [COL.lining, '#ffffff', 'lining'],
    brass: [COL.brass, COL.brass, 'strokes'],
    deck: [COL.deck, '#ffffff', 'deck'],
    platter: [COL.platter, COL.platter, 'strokes'],
    dark: ['#5d4f50', '#5d4f50', 'strokes'],
    cloth: [COL.cloth, '#ffffff', 'cloth'],
    steel: ['#9a8d78', '#9a8d78', 'strokes'],
    cart: [COL.hot, COL.hot, 'strokes'],
    handle: ['#7e4c2c', '#7e4c2c', 'strokes'],
  };
  const painted = [];
  const brushed = (key, color) => {
    const [before, after, tex] = SPEC[key];
    const m = toon(color ?? before, { space });
    m.userData = { brushed: true, after: color ? null : after, tex };
    painted.push(m);
    return m;
  };
  const mats = Object.fromEntries(Object.keys(SPEC).map((k) => [k, brushed(k)]));

  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    if ([mat].flat()[0].userData.brushed) brushUV(geo);
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const hits = [];
  const hitMat = new MeshBasicMaterial();
  const addHit = (control, geo, x, y, z) => {
    const m = new Mesh(geo, hitMat);
    m.position.set(x, y, z);
    m.visible = false;
    caseRoot.add(m);
    hits.push({ mesh: m, control });
    return m;
  };

  // ---- base: chassis under the deck and the full-width drawer below it (shut here) ----
  const drawerH = 0.44, upperH = bh - drawerH, wt = 0.16;
  const solids = [];
  solids.push(add(caseRoot, rbox(w, upperH, d, 0.05), mats.leather, 0, drawerH + upperH / 2, 0));
  add(caseRoot, rbox(w + 0.03, 0.07, d + 0.03, 0.03), mats.welt, 0, bh - 0.07, 0);
  add(caseRoot, rbox(w + 0.025, 0.035, d + 0.025, 0.015), mats.welt, 0, drawerH + 0.02, 0);
  add(caseRoot, new BoxGeometry(2 * L.deckHalfWidth, 0.02, 2 * L.deckHalfDepth), mats.deck, 0, bh, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(caseRoot, cyl(0.045, 0.014, 10), mats.brass, sx * (L.deckHalfWidth - 0.1), deckTop + 0.004, sz * (L.deckHalfDepth - 0.1));
  solids.push(add(caseRoot, rbox(w, drawerH, d, 0.05), mats.leather, 0, drawerH / 2, 0));
  add(caseRoot, rbox(w + 0.03, 0.065, d + 0.03, 0.03), mats.welt, 0, 0.085, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) add(caseRoot, rbox(0.3, 0.28, 0.3, 0.05), mats.brass, sx * (w / 2 - 0.1), 0.14, sz * (d / 2 - 0.1));
    add(caseRoot, rbox(0.035, 0.055, d - 0.55, 0.012), mats.brass, sx * (w / 2 + 0.005), drawerH - 0.06, -0.05);
  }

  // ---- lid, hinged along the back top edge ----
  const lidPivot = new Group();
  lidPivot.position.set(0, bh, -d / 2);
  caseRoot.add(lidPivot);
  solids.push(add(lidPivot, rbox(w, lh, d, 0.07), [mats.leather, mats.leather, mats.leather, mats.lining, mats.leather, mats.leather], 0, lh / 2, d / 2));
  const lip = 0.06, band = 0.14;
  add(lidPivot, new BoxGeometry(w - 0.1, lip, band), mats.leather, 0, -lip / 2 + 0.01, d - band / 2 - 0.02);
  add(lidPivot, new BoxGeometry(w - 0.1, lip, band), mats.leather, 0, -lip / 2 + 0.01, band / 2 + 0.02);
  for (const sx of [-1, 1]) add(lidPivot, new BoxGeometry(band, lip, d - 0.3), mats.leather, sx * (w / 2 - band / 2 - 0.02), -lip / 2 + 0.01, d / 2);
  add(lidPivot, rbox(w + 0.03, 0.07, d + 0.03, 0.03), mats.welt, 0, 0.07, d / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [0, 1]) add(lidPivot, rbox(0.3, 0.3, 0.3, 0.05), mats.brass, sx * (w / 2 - 0.1), lh - 0.15, 0.1 + sz * (d - 0.2));
    add(lidPivot, rbox(0.34, 0.2, 0.06, 0.012), mats.brass, sx * 0.8, lh * 0.38, d + 0.025);
  }
  add(lidPivot, rbox(0.3, 0.2, 0.06, 0.012), mats.brass, 0, lh * 0.38, d + 0.025);
  add(lidPivot, rbox(0.7, 0.07, 0.1, 0.03), mats.welt, 0, lh - 0.02, 0.2);

  // ---- the front: speakers and clasps, the handle on the drawer ----
  const z = d / 2, upperFrontY = drawerH + upperH * 0.5;
  for (const sx of [-1, 1]) {
    add(caseRoot, rbox(0.88, 0.36, 0.03, 0.01), mats.brass, sx * 1.5, upperFrontY, z + 0.006);
    add(caseRoot, new PlaneGeometry(0.78, 0.28), mats.cloth, sx * 1.5, upperFrontY, z + 0.03);
    add(caseRoot, rbox(0.34, 0.24, 0.06, 0.012), mats.brass, sx * 0.8, drawerH + upperH * 0.56, z + 0.03);
    add(caseRoot, rbox(0.2, 0.05, 0.07, 0.01), mats.dark, sx * 0.8, drawerH + upperH * 0.56, z + 0.045);
  }
  add(caseRoot, rbox(0.98, 0.19, 0.13, 0.05), mats.handle, 0, drawerH * 0.54, z + 0.065);
  for (const sx of [-1, 1]) add(caseRoot, cyl(0.04, 0.03, 10).rotateX(Math.PI / 2), mats.brass, sx * 0.39, drawerH * 0.54, z + 0.135);
  add(caseRoot, rbox(0.2, 0.2, 0.05, 0.01), mats.brass, 0, bh * 0.86, z + 0.03);

  // ---- platter and where the record sits ----
  add(caseRoot, cyl(L.platterRadius, 0.05, 64), mats.platter, L.record.x, deckTop + 0.025, L.record.z);
  add(caseRoot, cyl(0.03, 0.12, 12), mats.brass, L.record.x, deckTop + 0.07, L.record.z);
  const seat = new Group();
  seat.position.set(L.record.x, deckTop + 0.06, L.record.z);
  caseRoot.add(seat);
  addHit('record', cyl(L.recordRadius, 0.06, 40), L.record.x, L.recordTop - 0.02, L.record.z);
  const rimMat = new MeshBasicMaterial({ color: COL.hot, transparent: true, opacity: 0, depthWrite: false });
  const rim = add(caseRoot, new RingGeometry(L.recordRadius - 0.06, L.recordRadius + 0.02, 64).rotateX(-Math.PI / 2), rimMat, L.record.x, L.recordTop + 0.012, L.record.z);
  rim.renderOrder = 2;
  const sheenMat = new MeshBasicMaterial({ map: sheenTexture(L.labelRadius / L.recordRadius), transparent: true, depthWrite: false });
  const sheen = add(caseRoot, new PlaneGeometry(2 * L.recordRadius, 2 * L.recordRadius).rotateX(-Math.PI / 2), sheenMat, L.record.x, L.recordTop + 0.018, L.record.z);
  sheen.renderOrder = 1;
  sheen.visible = false;

  // ---- tonearm: along local -x; the pivot's turn aims it at the stylus ----
  const armPivot = new Group();
  const ah = 0.2;
  armPivot.position.set(TONEARM.pivot.x, deckTop + ah, TONEARM.pivot.z);
  caseRoot.add(armPivot);
  add(armPivot, cyl(0.17, ah, 24), mats.platter, 0, -ah / 2, 0);
  add(armPivot, cyl(0.1, 0.05, 20), mats.brass, 0, 0.02, 0);
  const armLift = new Group();
  armPivot.add(armLift);
  add(armLift, cyl(0.06, TONEARM.length, 12).rotateZ(Math.PI / 2), mats.steel, -TONEARM.length / 2, 0, 0);
  add(armLift, cyl(0.09, 0.24, 16).rotateZ(Math.PI / 2), mats.dark, 0.32, 0, 0);
  add(armLift, rbox(0.26, 0.045, 0.15, 0.012), mats.dark, -TONEARM.length - 0.05, -0.01, 0);
  add(armLift, rbox(0.16, 0.1, 0.11, 0.015), mats.cart, -TONEARM.length - 0.05, -0.075, 0);

  // ---- volume knob: bezel and ticks stay put, the knob turns inside them ----
  const k = ctl.knob, kr = ctl.knobRadius;
  add(caseRoot, cyl(kr + 0.05, 0.03, 32), mats.brass, k.x, deckTop + 0.015, k.z);
  for (let i = 0; i < 11; i++) {
    const a = MIN_ANGLE + (i / 10) * SWEEP, r = kr + 0.13;
    const t = add(caseRoot, new BoxGeometry(1, 0.008, 0.06), mats.dark, k.x + r * Math.sin(a), deckTop + 0.006, k.z - r * Math.cos(a));
    t.scale.x = i === 0 || i === 10 || i === 5 ? 0.034 : 0.02;
    t.rotation.y = -a;
  }
  const knob = new Group();
  knob.position.set(k.x, deckTop + 0.12, k.z);
  caseRoot.add(knob);
  const knobMat = brushed('brass', COL.ink), knobTopMat = brushed('brass', '#4c5282');
  add(knob, cyl(kr, 0.18, 32), knobMat);
  add(knob, cyl(kr - 0.06, 0.014, 32), knobTopMat, 0, 0.094, 0);
  add(knob, new BoxGeometry(0.06, 0.02, 0.2), toon(COL.paper, { space }), 0, 0.105, -(kr - 0.14));
  addHit('knob', cyl(kr + 0.16, 0.3, 24), k.x, deckTop + 0.12, k.z);

  // ---- buttons: back, play/pause, skip, like ----
  const glyphs = { play: glyphTexture('play'), pause: glyphTexture('pause'), previous: glyphTexture('previous'), next: glyphTexture('next'), heart: glyphTexture('heart'), heartFill: glyphTexture('heartFill') };
  const initial = { previous: 'previous', playPause: 'pause', next: 'next', like: 'heart' };
  const buttons = {};
  for (const [name, b] of Object.entries(ctl.buttons)) {
    const grp = new Group();
    grp.position.set(b.x, deckTop, b.z);
    caseRoot.add(grp);
    const ringMat = brushed('brass');
    add(grp, cyl(b.radius + 0.04, 0.034, 24), ringMat, 0, 0.017, 0);
    const cap = new Group();
    grp.add(cap);
    const capMat = brushed('brass', COL.ink);
    add(cap, cyl(b.radius, 0.08, 24), capMat, 0, 0.045, 0);
    const glyphMat = crisp({ map: glyphs[initial[name]], alphaTest: 0.5 });
    const glyph = add(cap, new PlaneGeometry(2 * b.radius * 1.15, 2 * b.radius * 1.15).rotateX(-Math.PI / 2), glyphMat, 0, 0.0865, 0);
    addHit(name, cyl(b.radius + 0.1, 0.2, 20), b.x, deckTop + 0.04, b.z);
    buttons[name] = { cap, capMat, ringMat, glyphMat, glyph };
  }

  // The painted textures arrive from the worker (name -> canvas): one texture per name, swapped in.
  const shared = {};
  function paint(textures) {
    for (const m of painted) {
      const name = m.userData.tex;
      if (!textures[name] || m.map) continue;
      shared[name] ??= (() => {
        const t = new CanvasTexture(textures[name]);
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 8;
        t.wrapS = t.wrapT = RepeatWrapping;
        t.repeat.setScalar(1 / (PAINTERS[name].tile ?? 1));
        return t;
      })();
      m.map = shared[name];
      if (m.userData.after) m.color.set(m.userData.after);
      m.needsUpdate = true;
    }
  }

  return {
    root, caseRoot, lidPivot, seat, armPivot, armLift, knob, knobMat, knobTopMat, buttons, glyphs, rim, rimMat, sheen,
    hits, solids, space, paint,
    colors: { ink: new Color(COL.ink), hot: new Color(COL.hot), brass: new Color(COL.brass), brassLight: new Color(COL.brassLight), knobTop: new Color('#4c5282') },
  };
}
