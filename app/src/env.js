// Things that respond to the time of day: lamps (light up one by one at dusk, with a warm-up
// flicker) and windows (lit gradually in the evening, some go dark late at night).
import * as THREE from 'three';

export const lamps = [];

// Soft radial glow shared by every halo, wall wash and ground pool (no hard edge for the
// watercolour pass to outline).
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// A glow that fades in with its lamp. kind: 'sprite' (halo around the lamp) or 'plane' (a wash of
// light on a wall or the ground; orient it yourself).
export function glowMesh(kind, size, opacity, color = '#ffb54a') {
  const params = { map: glowTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
  const m = kind === 'sprite'
    ? new THREE.Sprite(new THREE.SpriteMaterial(params))
    : new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(params));
  m.scale.set(size, size, 1);
  m.userData.glowOpacity = opacity;
  m.renderOrder = 2;
  return m;
}
export const windows = [];

const LAMP_OFF = new THREE.Color('#5a4c40');
const LAMP_ON = new THREE.Color('#ffd58a');

// glass: MeshBasicMaterial(s) of the lamp panes; halo: optional additive sprite mesh; light: optional PointLight.
export function registerLamp({ glass, glows = [], light = null, order = Math.random() }) {
  const entry = { glass: [].concat(glass), glows, light, order, baseIntensity: light ? light.intensity : 0, level: 0 };
  lamps.push(entry);
  return entry;
}

// material: the window pane material. lit/dark colours are mixed by the window's own schedule.
export function registerWindow(material, { day = '#6e7a86', lit = '#ffcf84', order = Math.random() } = {}) {
  windows.push({ material, day: new THREE.Color(day), lit: new THREE.Color(lit), order });
}

// The intro wakes lamps as the camera comes near: a lamp whose time-of-day level says "on" stays
// dark until the camera is within WAKE_DIST metres (along z) of it, then warms up with a flicker
// over the next WAKE_RAMP metres.
// lampWake.camZ = camera z while the intro plays, null otherwise (every lamp awake).
export const lampWake = { camZ: null };
const WAKE_DIST = 9, WAKE_RAMP = 1.8; // metres: wake-up starts at WAKE_DIST, full on WAKE_RAMP closer
const _p = new THREE.Vector3();
function lampZ(l) {
  if (l.z === undefined) {
    const g = l.glows[0];
    l.z = g ? g.getWorldPosition(_p).z : null; // lamps with no glow (none today) are never held back
  }
  return l.z;
}
const flicker = (t, o) => { const f = Math.sin(t * 37 + o * 50) * Math.sin(t * 13 + o * 9); return 0.55 + 0.45 * (f > -0.2 ? 1 : 0.15); };

// Called every frame by the time-of-day system.
// lampsOn: 0..1 how far through the switch-on wave we are; t: seconds (for flicker).
export function updateLamps(lampsOn, t) {
  for (const l of lamps) {
    // each lamp has its own moment inside the wave, then warms up over ~0.08 of it with a flicker
    const local = THREE.MathUtils.clamp((lampsOn - l.order * 0.8) / 0.12, 0, 1);
    let k = local;
    if (local > 0 && local < 1) {
      k = local * flicker(t, l.order);
    }
    // intro wake-up (see lampWake)
    if (lampWake.camZ !== null && lampZ(l) !== null && k > 0) {
      // by distance, not by a clock, so a screenshot at any second shows the same thing
      const w = THREE.MathUtils.clamp((WAKE_DIST - (lampWake.camZ - l.z)) / WAKE_RAMP, 0, 1);
      k *= w < 1 ? w * flicker(t, l.order) : 1;
    }
    l.level = k;
    for (const g of l.glass) g.color.copy(LAMP_OFF).lerp(LAMP_ON, k);
    for (const g of l.glows) { g.visible = k > 0.01; g.material.opacity = g.userData.glowOpacity * k; }
    if (l.light) l.light.intensity = l.baseIntensity * k;
  }
}

// lit: 0..1 evening fill (how many windows are on), late: 0..1 how far into the night (turning off).
export function updateWindows(lit, late) {
  for (const w of windows) {
    const on = w.order < lit && w.order > late * 0.7;
    w.material.color.copy(w.day).lerp(w.lit, on ? 1 : 0);
  }
}
