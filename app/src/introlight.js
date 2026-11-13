// Lighting that only plays during the intro (nav.js SHOT), on top of the real time of day:
//   - warm light pouring out of the shop door onto the flagstones as the leaves swing open,
//     plus a glow filling the doorway
//   - soft sun beams slanting into the piazza beyond the arch (only while the sun is up)
//   - a colour grade: cool and a touch darker on the street, warm stepping inside, neutral at HOME
//   - a vignette that fades with the cinema bars
// Everything is additive glow (no real lights: a new light recompiles every material, and lights
// cost per pixel everywhere), so the cost is a few transparent quads.
//
// const il = createIntroLight(streetRoot); each frame: il.update({ cine, door, camZ, sunE })
//   cine 0..1 how much of the intro look is on (the bars' value), door 0..1 open, camZ camera z,
//   sunE sun elevation in degrees. Returns { grade: [r, g, b], vignette } for the painter.
import * as THREE from 'three';
import { GLOW_BLENDING } from './materials.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// a soft trapezoid of light: narrow at the door (top of the canvas), spreading out and fading
function spillTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    const v = y / (c.height - 1);              // 0 at the door, 1 far out
    const half = 0.28 + 0.2 * v;              // half width, as a share of the canvas
    const along = (1 - v) ** 1.6 * smooth(0, 0.06, v);
    for (let x = 0; x < c.width; x++) {
      const u = Math.abs(x / (c.width - 1) - 0.5);
      const a = along * (1 - smooth(half - 0.12, half, u));
      const i = (y * c.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// a beam: even along its length, soft at both ends and sides
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    const v = y / (c.height - 1);
    const along = smooth(0, 0.25, v) * (1 - smooth(0.6, 1, v)); // even along its length, soft at both ends
    for (let x = 0; x < c.width; x++) {
      const u = Math.abs(x / (c.width - 1) - 0.5) * 2;
      const a = along * (1 - smooth(0.35, 1, u));
      const i = (y * c.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// 0 at the sheet (or nearer than NEAR_FADE[0] m), 1 from NEAR_FADE[1] m away, eased between
const NEAR_FADE = [0.4, 3.0];
const near = (d) => smooth(NEAR_FADE[0], NEAR_FADE[1], d);

const glow = (map, color) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, ...GLOW_BLENDING, fog: false, side: THREE.DoubleSide });

// the grade at the two ends of the intro (multiplied into the painted picture)
const COOL = [0.86, 0.9, 1.0];
const WARM = [1.07, 1.0, 0.88];

export function createIntroLight(root) {
  // the spill on the flagstones in front of the door (door leaves at z -0.3, step to z 0.5)
  const spillMat = glow(spillTexture(), '#ffb45a');
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spillMat);
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.02, 2.2);
  spill.scale.set(3.6, 4.8, 1);     // texture top (the door) at z -0.2, far end z 4.6
  spill.renderOrder = 2;
  // the doorway itself glowing, just inside the leaves
  const doorMat = glow(glowTexOnce(), '#ffc070');
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), doorMat);
  doorway.position.set(0, 1.5, -0.55);
  doorway.scale.set(2.6, 3.6, 1);
  doorway.renderOrder = 2;
  // sun beams falling into the piazza from over the left-hand roofs, seen through the arch
  const beamMat = glow(beamTexture(), '#ffe2a8');
  const beams = [[-2.4, 7.4, 1.4, 1], [-1.2, 6.2, 0.8, 0.7], [0.6, 8.6, 1.6, 0.85]].map(([x, z, w, a]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), beamMat.clone());
    m.position.set(x, 3.4, z);
    m.scale.set(w, 7.5, 1);
    m.rotation.z = -0.42;           // leaning: the light comes from the upper left
    m.userData.a = a;
    m.renderOrder = 2;
    return m;
  });
  root.add(spill, doorway, ...beams);
  const parts = [spill, doorway, ...beams];
  parts.forEach((p) => { p.visible = false; });

  const grade = [1, 1, 1];
  return {
    update({ cine, door, camZ, sunE }) {
      // the door light: strongest at night, still there by day (the shop is lit inside)
      const night = 1 - smooth(-4, 12, sunE);
      const sp = door * (0.35 + 0.65 * night) * cine;
      spillMat.opacity = 1.0 * sp;
      spill.scale.x = 3.6 * (0.35 + 0.65 * door);
      // The doorway glow and the beams are sheets the camera walks through: close up one filled the whole
      // picture (a flat orange wash the oil dabs, lit on their own, stood out of as grey) and the frame after
      // passing it, it was gone (Lajoon, 2026-11-13). Each one dims away as the camera comes within NEAR_FADE
      // metres of its sheet, so the light tones down instead of vanishing.
      doorMat.opacity = 0.35 * sp * near(camZ - doorway.position.z);
      // beams only with the sun up, and only while the intro is on
      const sun = smooth(3, 14, sunE) * cine;
      for (const b of beams) b.material.opacity = 0.42 * b.userData.a * sun * near(Math.abs(camZ - b.position.z));
      spill.visible = sp > 0.003;
      doorway.visible = doorMat.opacity > 0.003;
      beams.forEach((b) => { b.visible = b.material.opacity > 0.003; });
      // grade: cool out on the street, warm once through the door (z ~ 0), back to neutral by HOME
      const inside = smooth(1.5, -0.6, camZ);
      const settle = smooth(-0.6, -2.2, camZ);
      for (let c = 0; c < 3; c++) {
        const tone = COOL[c] + (WARM[c] - COOL[c]) * inside;
        grade[c] = 1 + (tone - 1) * cine * (1 - settle * 0.6);
      }
      return { grade, vignette: 0.55 * cine };
    },
  };
}

let doorGlowTex = null;
function glowTexOnce() {
  if (doorGlowTex) return doorGlowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 70, 0, 64, 70, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  doorGlowTex = new THREE.CanvasTexture(c);
  return doorGlowTex;
}
