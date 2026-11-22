// The shop section: a live, painted rebuild of the app's street (build.js), walked through with the
// app's own intro camera move (app/src/nav.js: a low crane up under the arch, across the piazza to a beat
// under the sign while the doors swing open, through them into the hall), driven by the page's scroll.
// The light follows the visitor's clock as in the app (app/src/timeofday.js): sun, sky, fog, the lamps
// coming on one by one at dusk (waking as you walk up to them), windows lighting up in the evening.
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, PointLight, Fog, Color, Vector3,
  Mesh, SphereGeometry, ShaderMaterial, BackSide, PCFShadowMap, CanvasTexture, SRGBColorSpace,
  RepeatWrapping, Sprite, SpriteMaterial, AdditiveBlending, MeshBasicMaterial, BoxGeometry, PlaneGeometry, CircleGeometry,
  MeshLambertMaterial, BufferAttribute, MathUtils,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildAlley, mul, trs } from './build.js';
import { toon } from '../materials.js';
import { paintTexture } from '../paint/worker.js';
import { PAINTERS } from '../paint/painters.js';
import { clamp, smoothstep, lerp } from '../layout.js';
import { cameraAt, DOOR_OPEN } from './path.js';
import { moodAt, sunAt } from './sun.js';

const ca = new Color();

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uCloud; uniform float uClouds; uniform float uStars; uniform sampler2D uTex; uniform float uHasTex;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 d = normalize(vDir);
  vec3 c = mix(uHorizon, uTop, smoothstep(-0.02, 0.6, d.y));
  vec2 q = d.xz / (d.y + 0.18);
  float cl = n2(q * 1.3) * 0.6 + n2(q * 2.9 + 7.0) * 0.3 + n2(q * 6.1 + 3.0) * 0.1;
  c = mix(c, uCloud, smoothstep(0.52, 0.8, cl) * uClouds * smoothstep(0.02, 0.25, d.y) * 0.8);
  vec2 sg = floor(vec2(atan(d.z, d.x) * 120.0, d.y * 160.0));
  float st = step(0.996, h21(sg)) * smoothstep(0.08, 0.4, d.y);
  c += vec3(1.0, 0.96, 0.88) * st * uStars;
  vec2 tuv = vec2(atan(d.z, d.x) * 2.2, d.y * 3.5);
  c *= mix(1.0, 0.86 + 0.18 * texture2D(uTex, tuv).r, uHasTex);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

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
  glowTex = new CanvasTexture(c);
  return glowTex;
}
const flicker = (t, o) => { const f = Math.sin(t * 37 + o * 50) * Math.sin(t * 13 + o * 9); return 0.55 + 0.45 * (f > -0.2 ? 1 : 0.15); };

export function createAlley(canvas, { reduced = false, covers = null } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new Scene();
  scene.background = new Color('#f4c98a');
  scene.fog = new Fog('#f1cf9b', 18, 52);
  const camera = new PerspectiveCamera(38, 1, 0.1, 140);

  const hemi = new HemisphereLight('#d6dcf2', '#b08a70', 1.55);
  const sun = new DirectionalLight('#ffc27a', 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.target.position.set(0, 0, 8);
  scene.add(hemi, sun, sun.target);
  // the hall's lamps: the pendant over the crate table and the lounge beyond the arch
  const lamp1 = new PointLight('#ffc47a', 18, 0, 2);
  lamp1.position.set(0, 4.6, -4.6);
  const lamp2 = new PointLight('#ffb866', 10, 0, 2);
  lamp2.position.set(0, 2.6, -11.6);
  scene.add(lamp1, lamp2);

  // ---- materials: painted world-space textures under vertex colours ----
  const TEX = { stone: 'stone', brick: 'brick', plaster: 'strokes', paint: 'strokes', paving: 'paving', piazza: 'piazza', floor: 'floor' };
  const BEFORE = { stone: '#d2b48a', brick: '#b5644a', paving: '#b9ab9d', piazza: '#cdb5a2', floor: '#b56842' };
  const materials = {};
  for (const [key, tex] of Object.entries(TEX)) {
    materials[key] = toon(BEFORE[key] ?? '#ffffff', { vertexColors: true, side: key === 'brick' ? 2 : 0, blotch: 0.8 });
    materials[key].userData.tex = tex;
  }
  materials.leaf = toon('#ffffff', { blotch: 0.5 });
  materials.iron = toon('#ffffff', { blotch: 0 });
  const toonMat = (c) => toon(c, { blotch: 0.6 });
  const textures = {};
  for (const name of new Set(Object.values(TEX))) {
    paintTexture(name).then((c) => {
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.setScalar(1 / (PAINTERS[name].tile ?? 1));
      textures[name] = t;
      for (const m of Object.values(materials)) if (m.userData.tex === name) { m.map = t; m.color.set('#ffffff'); m.needsUpdate = true; }
      dirty = 3;
    });
  }

  const font = getComputedStyle(document.documentElement).getPropertyValue('--hand') || '"Amatic SC", cursive';
  const built = buildAlley({ materials, toonMat, font });
  scene.add(built.root);

  // ---- windows: dark by day, lit through the evening; the shop's own are clear glass ----
  const glassGeos = [], clearGeos = [], gardenGeos = [];
  const winRanges = [];
  for (const w of built.windows) {
    const { o } = w;
    const z = o.glassZ ?? -0.17;
    const parts = [];
    if (o.type === 'fan') parts.push([new CircleGeometry(o.w / 2, 18, 0, Math.PI), trs(o.x, o.y, z)]);
    else {
      const fh = o.type === 'arch' ? o.h - o.w / 2 : o.h;
      parts.push([new PlaneGeometry(o.w, fh), trs(o.x, o.y + fh / 2, z)]);
      if (o.type === 'arch') parts.push([new CircleGeometry(o.w / 2, 18, 0, Math.PI), trs(o.x, o.y + fh, z)]);
    }
    for (const [g, m] of parts) {
      const geo = g.toNonIndexed();
      geo.deleteAttribute('uv');
      geo.applyMatrix4(mul(w.M, m));
      if (w.shop) clearGeos.push(geo);
      else if (w.garden) gardenGeos.push(geo);
      else {
        winRanges.push({ start: glassGeos.reduce((n, x) => n + x.getAttribute('position').count, 0), count: geo.getAttribute('position').count, order: w.order });
        glassGeos.push(geo);
      }
    }
  }
  const glass = new Mesh(mergeGeometries(glassGeos, false), new MeshBasicMaterial({ vertexColors: true }));
  const winColors = new Float32Array(glass.geometry.getAttribute('position').count * 3);
  glass.geometry.setAttribute('color', new BufferAttribute(winColors, 3));
  const clear = new Mesh(mergeGeometries(clearGeos, false), new MeshBasicMaterial({ color: '#cfe0e6', transparent: true, opacity: 0.16, depthWrite: false }));
  const gardenMat = new MeshBasicMaterial({ color: '#f6d29a' });
  const garden = new Mesh(mergeGeometries(gardenGeos, false), gardenMat);
  scene.add(glass, clear, garden);

  // ---- lamps: lantern panes and halos, string-light bulbs, the hall's pendant ----
  const LAMP_OFF = new Color('#5a4c40'), LAMP_ON = new Color('#ffd58a');
  const lamps = built.glows.map((g) => {
    const halo = new Sprite(new SpriteMaterial({ map: glowTexture(), color: '#ffb54a', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, fog: false }));
    halo.position.copy(g.p);
    halo.scale.setScalar(g.size);
    scene.add(halo);
    let pane = null;
    if (g.pane || g.bulb) {
      pane = new Mesh(g.bulb ? new SphereGeometry(0.045, 8, 6) : new BoxGeometry(0.15, 0.32, 0.15), new MeshBasicMaterial({ color: LAMP_OFF }));
      if (g.M) pane.applyMatrix4(g.M); else pane.position.copy(g.p);
      scene.add(pane);
    }
    return { ...g, halo, pane, level: 0 };
  });

  // ---- the sleeves standing in the hall's crate table: the page's own painted covers ----
  const coverTex = [];
  if (covers) for (const c of covers.canvases) { const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; coverTex.push(t); }
  covers?.done.then(() => { for (const t of coverTex) t.needsUpdate = true; dirty = 3; });
  const sleeveGeo = new BoxGeometry(0.31, 0.31, 0.014);
  for (const row of built.covers) {
    for (let i = 0; i < row.n; i++) {
      const tex = coverTex[i % Math.max(1, coverTex.length)];
      const spine = toonMat(`hsl(${(i * 47) % 360}, 35%, 48%)`);
      const face = tex ? new MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.3 }) : spine;
      const m = new Mesh(sleeveGeo, [spine, spine, spine, spine, face, face]);
      m.applyMatrix4(mul(row.M, trs(row.x0 + i * row.sp, row.y, 0, -0.04 * Math.sin(i * 2.1), row.yaw + 0.06 * Math.sin(i * 3.7), 0.03 * Math.sin(i * 5.3))));
      m.castShadow = true;
      scene.add(m);
    }
  }

  // ---- the sky dome ----
  const skyU = { uTop: { value: new Color() }, uHorizon: { value: new Color() }, uCloud: { value: new Color() }, uClouds: { value: 0 }, uStars: { value: 0 }, uTex: { value: null }, uHasTex: { value: 0 } };
  const sky = new Mesh(new SphereGeometry(110, 32, 16), new ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10;
  scene.add(sky);
  paintTexture('sky').then((c) => { const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; skyU.uTex.value = t; skyU.uHasTex.value = 1; dirty = 3; });

  // ---- time of day ----
  let lampsOn = 0;
  const dir = new Vector3();
  const DAY = new Color('#6e7a86'), LIT = new Color('#ffcf84'), wc = new Color();
  function setHour(hour) {
    const { e, s } = sunAt(hour);
    const m = moodAt(e);
    skyU.uTop.value.set(m.top); skyU.uHorizon.value.set(m.horizon); skyU.uCloud.value.set(m.cloud);
    skyU.uClouds.value = m.clouds; skyU.uStars.value = m.stars;
    scene.fog.color.set(m.fog);
    scene.background.set(m.horizon);
    hemi.color.set(m.hemiSky); hemi.groundColor.set(m.hemiGround); hemi.intensity = m.hemiI;
    sun.color.set(m.sun); sun.intensity = m.sunI;
    sun.castShadow = e > -2;
    const el = MathUtils.degToRad(e > 2 ? Math.max(e, 9) : 50);
    const az = e > 2 ? (s - 0.5) * Math.PI * 0.9 : 0.4;
    dir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * 0.9 + 0.35).normalize();
    sun.position.copy(sun.target.position).addScaledVector(dir, 50);
    lampsOn = clamp((4 - e) / 9, 0, 1);
    const night = clamp((4 - e) / 14, 0, 1);
    lamp1.intensity = lerp(14, 34, night);
    lamp2.intensity = lerp(8, 20, night);
    const lit = clamp((7 - e) / 16, 0, 1);
    let late = 0;
    if (hour >= 23) late = (hour - 23) / 3; else if (hour < 5) late = Math.min(1, (hour + 1) / 3); else if (hour < 6.5) late = 1 - (hour - 5) / 1.5;
    for (const r of winRanges) {
      const on = r.order < lit && r.order > clamp(late, 0, 1) * 0.7;
      wc.copy(DAY).lerp(LIT, on ? 1 : 0);
      for (let i = r.start; i < r.start + r.count; i++) { winColors[i * 3] = wc.r; winColors[i * 3 + 1] = wc.g; winColors[i * 3 + 2] = wc.b; }
    }
    glass.geometry.getAttribute('color').needsUpdate = true;
    gardenMat.color.set(m.horizon).lerp(ca.set('#22284a'), night * 0.6);
    renderer.shadowMap.needsUpdate = true;
    dirty = 3;
  }

  function updateLamps(t, camZ) {
    let busy = false;
    for (const l of lamps) {
      let k;
      if (l.inside) k = lerp(0.55, 1, lampsOn);
      else {
        const local = clamp((lampsOn - l.order * 0.8) / 0.12, 0, 1);
        k = local > 0 && local < 1 ? local * flicker(t, l.order) : local;
        if (local > 0 && local < 1) busy = true;
        // lamps wake as you walk up to them, as in the app's intro
        const wake = clamp((9 - (camZ - l.p.z)) / 1.8, 0, 1);
        if (k > 0 && wake < 1) { k *= wake * flicker(t, l.order); busy = busy || wake > 0; }
      }
      l.level = k;
      l.halo.visible = k > 0.01;
      l.halo.material.opacity = (l.bulb ? 0.6 : 0.7) * k;
      if (l.pane) l.pane.material.color.copy(LAMP_OFF).lerp(LAMP_ON, k);
    }
    return busy;
  }

  // ---- the walk ----
  let target = 0, shown = -1, active = false, dirty = 3, raf = 0, time = 0, last = performance.now();
  const look = { x: 0, y: 0 }, lookT = { x: 0, y: 0 };
  const pos = new Vector3(), aim = new Vector3();
  let doorWas = -1;

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = 3;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!active) return;
    time += dt;
    const before = shown;
    shown = shown < 0 || reduced ? target : shown + (target - shown) * (1 - Math.exp(-dt * 5));
    if (Math.abs(shown - target) < 1e-4) shown = target;
    look.x += (lookT.x - look.x) * (1 - Math.exp(-dt * 4));
    look.y += (lookT.y - look.y) * (1 - Math.exp(-dt * 4));
    const pose = cameraAt(shown, time);
    pos.copy(pose.pos);
    aim.copy(pose.target);
    // the view leans a little toward the cursor
    const side = new Vector3().subVectors(aim, pos).cross(camera.up).normalize();
    aim.addScaledVector(side, look.x * 0.35).addScaledVector(camera.up, look.y * 0.22);
    camera.position.copy(pos);
    camera.lookAt(aim);
    // a tall narrow window gets a wider lens so the alley still fits across
    const hfov = 2 * Math.atan(Math.tan(MathUtils.degToRad(pose.fov) / 2) * 1.6);
    const fov = camera.aspect < 1.6 ? Math.min(88, MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect))) : pose.fov;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position);
    // the doors swing in as the camera reaches them
    const open = DOOR_OPEN(shown);
    if (open !== doorWas) {
      doorWas = open;
      const a = smoothstep(0, 1, open) * 1.95;
      for (const d of built.doors) d.pivot.rotation.y = d.side < 0 ? a : -a;
      renderer.shadowMap.needsUpdate = true;
    }
    const busy = updateLamps(time, camera.position.z);
    const moving = before !== shown || Math.abs(lookT.x - look.x) > 1e-4 || Math.abs(lookT.y - look.y) > 1e-4;
    if (!moving && !busy && dirty <= 0) return;
    dirty--;
    renderer.render(scene, camera);
  }

  resize();
  addEventListener('resize', resize);
  setHour(12);
  raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) last = performance.now(); });

  return {
    setHour,
    setProgress(p, instant = false) { target = clamp(p, 0, 1); if (instant) shown = target; },
    setActive(on) { if (on && !active) { last = performance.now(); dirty = 3; } active = on; },
    setPointer(nx, ny) { lookT.x = clamp(nx, -1, 1); lookT.y = clamp(ny, -1, 1); },
    get camera() { return camera; },
  };
}
