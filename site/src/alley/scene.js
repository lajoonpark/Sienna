// The app's actual street and shop, with the site's scroll, framing and clock.
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Fog, Color, Vector3,
  Mesh, SphereGeometry, ShaderMaterial, BackSide, PCFShadowMap, CanvasTexture, RepeatWrapping, MathUtils,
} from 'three';
import { buildStreet } from '../../../app/src/street.js';
import { buildShop } from '../../../app/src/shop.js';
import { lampWake, updateLamps, updateWindows } from '../../../app/src/env.js';
import { updateLod } from '../../../app/src/kit.js';
import { WATERCOLOUR } from '../../../app/src/look.js';
import { GLOW_LAYER } from '../../../app/src/materials.js';
import { DOOR_SWING } from '../../../app/src/nav.js';
import { createWatercolour } from '../../../app/src/watercolour.js';
import { paintTexture } from '../paint/worker.js';
import { clamp } from '../layout.js';
import { cameraAt, DOOR_OPEN } from './path.js';
import { moodAt, sunAt } from './sun.js';

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

const STROKE_VIEWS = [0, 0.15, 0.29, 0.43, 0.57, 0.7, 0.82, 0.9, 1];
const PAINT_PIXELS = 1_000_000;

export function createAlley(canvas, { reduced = false } = {}) {
  const renderPaint = WATERCOLOUR && new URLSearchParams(location.search).get('wc') !== '0';
  const renderer = new WebGLRenderer({ canvas, antialias: !renderPaint, powerPreference: 'high-performance' });
  const canPaint = renderPaint && renderer.extensions.has('EXT_color_buffer_float');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new Scene();
  scene.background = new Color('#f4c98a');
  scene.fog = new Fog('#f1cf9b', 18, 52);
  const camera = new PerspectiveCamera(38, 1, 0.1, 140);
  camera.layers.enable(GLOW_LAYER);

  const hemi = new HemisphereLight('#d6dcf2', '#b08a70', 1.55);
  const sun = new DirectionalLight('#ffc27a', 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.target.position.set(0, 0, 8);
  scene.add(hemi, sun, sun.target);

  const street = buildStreet({ preview: true });
  scene.add(street.root, buildShop({ preview: true }));
  // Moving doors get the live undercoat, not dabs pinned where the hinges were baked.
  for (const { pivot } of street.leaves) pivot.userData.noStrokes = true;
  scene.updateMatrixWorld();
  document.fonts?.load('700 200px "Amatic SC"').then(wake, () => {});

  const skyU = { uTop: { value: new Color() }, uHorizon: { value: new Color() }, uCloud: { value: new Color() }, uClouds: { value: 0 }, uStars: { value: 0 }, uTex: { value: null }, uHasTex: { value: 0 } };
  const sky = new Mesh(new SphereGeometry(110, 32, 16), new ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10;
  sky.userData.noStrokes = true;
  scene.add(sky);
  paintTexture('sky').then((c) => {
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    skyU.uTex.value = t;
    skyU.uHasTex.value = 1;
    wake();
  });

  let lampsOn = 0;
  const dir = new Vector3();
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
    const lit = clamp((7 - e) / 16, 0, 1);
    let late = 0;
    if (hour >= 23) late = (hour - 23) / 3; else if (hour < 5) late = Math.min(1, (hour + 1) / 3); else if (hour < 6.5) late = 1 - (hour - 5) / 1.5;
    updateWindows(lit, clamp(late, 0, 1));
    renderer.shadowMap.needsUpdate = true;
    wake();
  }

  let target = 0, shown = -1, active = false, raf = 0, time = 0, last = 0;
  const look = { x: 0, y: 0 }, lookT = { x: 0, y: 0 };
  const pose = { pos: new Vector3(), target: new Vector3(), fov: 38 };
  const side = new Vector3();
  let doorWas = -1, painter = null;

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(canPaint ? Math.min(dpr, 1, Math.sqrt(PAINT_PIXELS / (w * h))) : Math.min(dpr, 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    painter?.setSize();
    wake();
  }

  // Don't poll or draw when the walk is offscreen or the view is settled.
  function wake() {
    if (!active || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (!active) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    shown = shown < 0 || reduced ? target : shown + (target - shown) * (1 - Math.exp(-dt * 5));
    if (Math.abs(shown - target) < 1e-4) shown = target;
    look.x += (lookT.x - look.x) * (1 - Math.exp(-dt * 4));
    look.y += (lookT.y - look.y) * (1 - Math.exp(-dt * 4));
    cameraAt(shown, pose);
    // The view leans a little toward the cursor.
    side.subVectors(pose.target, pose.pos).cross(camera.up).normalize();
    pose.target.addScaledVector(side, look.x * 0.35).addScaledVector(camera.up, look.y * 0.22);
    camera.position.copy(pose.pos);
    camera.lookAt(pose.target);
    // A tall narrow window gets a wider lens so the alley still fits across.
    const hfov = 2 * Math.atan(Math.tan(MathUtils.degToRad(pose.fov) / 2) * 1.6);
    const fov = camera.aspect < 1.6 ? Math.min(88, MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect))) : pose.fov;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position);
    const open = DOOR_OPEN(shown);
    if (open !== doorWas) {
      doorWas = open;
      for (const { pivot, side: hinge } of street.leaves) pivot.rotation.y = -hinge * open * DOOR_SWING;
      renderer.shadowMap.needsUpdate = true;
    }
    lampWake.camZ = open < 1 ? camera.position.z : null;
    const flickering = updateLamps(lampsOn, time);
    updateLod(camera);
    if (painter) {
      // The stage schedules only changed frames; the canvas need not preserve the previous buffer.
      painter.invalidate();
      painter.render(scene, camera, time);
    } else renderer.render(scene, camera);
    if (shown !== target || Math.abs(lookT.x - look.x) > 1e-4 || Math.abs(lookT.y - look.y) > 1e-4 || (!reduced && flickering)) {
      raf = requestAnimationFrame(frame);
    }
  }

  resize();
  if (canPaint) {
    painter = createWatercolour(renderer, { isLight: () => true });
    const views = STROKE_VIEWS.map((p) => {
      const view = cameraAt(p);
      return { ...view, fov: view.fov + 14 };
    });
    // Use only the scroll path and its own cache; never load the full app's packaged bake.
    painter.bakeStrokesCached(scene, views, { cacheKey: 'site-alley', background: true }).then(wake);
  }
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  return {
    setHour,
    setProgress(p, instant = false) {
      p = clamp(p, 0, 1);
      if (p === target && !instant) return;
      target = p;
      if (instant) shown = target;
      wake();
    },
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) wake();
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    setPointer(nx, ny) {
      if (reduced) return;
      lookT.x = clamp(nx, -1, 1);
      lookT.y = clamp(ny, -1, 1);
      wake();
    },
  };
}
