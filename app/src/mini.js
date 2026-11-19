// The small window (mini.html): the suitcase player resting on the shop's sunken-lounge listening table,
// looking across the room and out the arched window into the courtyard, summoned with Control+Option+K.
// In a plain browser it previews on a fake desktop with the fake record store; ?shot + window.__seek(t)
// make deterministic frames (t = seconds since the lid was released).
//   shot times: seconds since the lid was released; -1 = the lid still shut
//   ?p=0.3  how far through the song     ?hover=playPause|knob|record|next|previous|like
//   ?liked  show the song liked          ?paused  show it paused         ?idle  nothing playing
//   ?tray=0.5  a search pick, 0.5 s after it was pressed (drawer out, record lifting or flying)
//   ?hour=13|20.5  override time of day (timeofday.js)
import * as THREE from 'three';
import './fonts.js';
import { WATERCOLOUR } from './style.js';
import { createWatercolour } from './watercolour.js';
import { createMusic } from './music.js';
import { createSuitcase, startSong } from './suitcase.js';
import { createCaption } from './controls.js';
import { createFlights } from './suitcase/flight.js';
import { createRecordTray } from './suitcase/tray.js';
import { createSearch } from './search.js';
import { getCover } from './racks/common.js';
import { paintedCoverURL } from './coverpaint.js';
import { maxFps } from './pacer.js';
import { createKit, updateLod } from './kit.js';
import { GLOW_LAYER } from './materials.js';
import { createSky } from './sky.js';
import { createTimeOfDay } from './timeofday.js';
import { registerLamp, glowMesh } from './env.js';
import { LISTENING_TABLE, LOUNGE_LAMP, buildLoungeCore, buildCourtyardVista } from './loungecorner.js';
import { showWebGLError } from './liner.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const bridge = window.siennaMini;            // only inside Electron (electron/preload.cjs, started with --sienna-mini)
const W = 540, H = 620;
document.body.classList.toggle('preview', !bridge);
document.documentElement.style.setProperty('--w', `${W}px`);
document.documentElement.style.setProperty('--h', `${H}px`);
const stage = document.getElementById('stage');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: shot });
} catch (err) {
  showWebGLError(err);
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
const size = () => ({ w: stage.clientWidth || W, h: stage.clientHeight || H });
renderer.setSize(size().w, size().h);
stage.appendChild(renderer.domElement);
const painter = WATERCOLOUR ? createWatercolour(renderer, { card: true }) : null;

// ---- 3D lounge corner + courtyard scene shared with the main shop ----
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4c98a');
scene.fog = new THREE.Fog('#f1cf9b', 18, 52);

const hemi = new THREE.HemisphereLight('#d6dcf2', '#b08a70', 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffc27a', 2.3);
sun.target.position.set(1.0, 0.2, -16.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.025;
scene.add(sun, sun.target);

function leanShadowMap() {
  if (!sun.castShadow) return;
  if (sun.shadow.map?.texture.format === THREE.RedFormat) return;
  sun.shadow.map?.dispose();
  const { x, y } = sun.shadow.mapSize;
  const map = new THREE.WebGLRenderTarget(x, y, { format: THREE.RedFormat, generateMipmaps: false });
  map.texture.name = 'sun.shadowMapColour';
  map.depthBuffer = true;
  map.depthTexture = new THREE.DepthTexture(x, y, THREE.UnsignedIntType);
  map.depthTexture.name = 'sun.shadowMap';
  map.depthTexture.format = THREE.DepthFormat;
  map.depthTexture.compareFunction = THREE.LessEqualCompare;
  map.depthTexture.minFilter = map.depthTexture.magFilter = THREE.LinearFilter;
  sun.shadow.map = map;
  sun.shadow.camera.updateProjectionMatrix();
}

const sky = createSky();
scene.add(sky.dome);

const kit = createKit();
const extra = [];
const { lampBulb } = buildLoungeCore(kit, extra, { capOpenings: true });
buildCourtyardVista(scene, kit, extra);
kit.flush(scene);
extra.forEach((m) => scene.add(m));

// Warm lounge floor lamp light (ramps up naturally at dusk/night via timeofday.js + env.js)
const lampLight = new THREE.PointLight('#ffa84c', 2.2, 8, 2);
lampLight.position.set(LOUNGE_LAMP.x, LOUNGE_LAMP.y + 1.40, LOUNGE_LAMP.z);
const lampHalo = glowMesh('sprite', 1.5, 0.65);
lampHalo.position.set(LOUNGE_LAMP.x, LOUNGE_LAMP.y + 1.48, LOUNGE_LAMP.z);
scene.add(lampLight, lampHalo);
registerLamp({ glass: lampBulb.material, glows: [lampHalo], light: lampLight, order: 0.05 });

// Subtle daytime bounce inside the sheltered lounge (tapers down at night so lamp warmth dominates)
const roomFill = new THREE.PointLight('#fff0d8', 1.15, 7, 1.4);
roomFill.position.set(1.5, 1.25, -13.1);
scene.add(roomFill);

const timeOfDay = createTimeOfDay({ scene, sun, hemi, sky });

// ---- suitcase sitting flat on the walnut listening table ----
const music = createMusic();
const suitcase = createSuitcase({ music, ground: 'none', lights: false, sharp: true });
suitcase.root.position.set(1.90, LISTENING_TABLE.topY, -14.34);
suitcase.root.scale.setScalar(0.142);
suitcase.root.rotation.y = 0.26;
scene.add(suitcase.root);

// ---- camera framed across the table toward the arched window, plant, and courtyard ----
const BASE_FOV = 62;
const BASE_POS = new THREE.Vector3(2.84, 1.04, -13.02);
const BASE_TARGET = new THREE.Vector3(1.68, 0.28, -14.56);
const camera = new THREE.PerspectiveCamera(BASE_FOV, size().w / size().h, 0.2, 200);
camera.layers.enable(GLOW_LAYER);
const parallax = { tx: 0, ty: 0, x: 0, y: 0 };
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

function applyCamera(px = 0, py = 0) {
  camera.aspect = size().w / size().h;
  camera.updateProjectionMatrix();
  _fwd.subVectors(BASE_TARGET, BASE_POS).normalize();
  _right.crossVectors(_fwd, camera.up).normalize();
  _up.crossVectors(_right, _fwd).normalize();
  camera.position.copy(BASE_POS).addScaledVector(_right, px * 0.055).addScaledVector(_up, py * 0.04);
  camera.lookAt(BASE_TARGET.x - px * 0.02, BASE_TARGET.y - py * 0.015, BASE_TARGET.z);
  camera.updateMatrixWorld();
}
applyCamera(0, 0);

// Bake oil brushstrokes across the room and courtyard once (with margin for cursor parallax).
timeOfDay.update(0);
updateLod(camera);
painter?.bakeStrokes(scene, [{ pos: BASE_POS.clone(), target: BASE_TARGET.clone(), fov: Math.min(100, BASE_FOV * 1.2) }]);

const caption = createCaption({
  parent: stage,
  variant: 'mini',
  onSeek: (s) => music.command('seek', s),
  onCommand: (name, arg) => music.command(name, arg),
});

// ---- search (the search shortcut, as in the shop): a pick slides out of the drawer and flies onto the platter ----
scene.add(camera);
const hud = new THREE.Group();
camera.add(hud);
const flights = createFlights({ scene: hud, suitcase, camera, view: camera, worldCase: true });
const tray = createRecordTray({ suitcase, kit: suitcase.recordKit, onDisc: (d) => flights.receive(d) });

const LISTEN_AGAIN_MAX_AGE = 300000;
let listenAgain = null;
let listenAgainAt = -Infinity;
let listenAgainBusy = null;
async function paintAhead(items) {
  for (const item of items) if (item.art) await paintedCoverURL(item.art);
}
function refreshListenAgain() {
  if (listenAgainBusy || performance.now() - listenAgainAt < LISTEN_AGAIN_MAX_AGE) return listenAgainBusy;
  listenAgainBusy = music.shelves().then(({ shelves }) => {
    const sh = shelves.find((x) => /listen again|다시 듣기|もう一度聴く|volver a escuchar|réécouter|nochmal anhören|riascolta|ouvir de novo/i.test(x.title)) ?? shelves[0];
    if (!sh) return;
    listenAgainAt = performance.now();
    listenAgain = { title: sh.title, items: sh.items };
    paintAhead(sh.items);
  }).catch((e) => console.warn('[sienna] Listen again failed', e))
    .then(() => { listenAgainBusy = null; return listenAgain; });
  return listenAgainBusy;
}
refreshListenAgain();
music.onAccount?.(() => Promise.resolve(listenAgainBusy).then(() => { listenAgainAt = -Infinity; refreshListenAgain(); }));
const search = createSearch({
  music,
  onPlay: (item) => {
    startSong(music, suitcase, item);
    tray.run(getCover(item.art, 512).tex);
  },
  suggest: () => {
    const busy = refreshListenAgain();
    return listenAgain ?? busy;
  },
});
caption.show(true, true);

// ---- player state ----
let lastState = null;
music.onState((s) => {
  if (shot) {
    s = { ...s, position: (Number(params.get('p')) || 0.3) * (s.duration || 200) };
    if (params.has('paused')) s.playerState = 2;
    if (params.has('liked')) s.like = 'LIKE';
  }
  lastState = s;
  suitcase.setState(s);
  caption.setState(s, { real: music.real });
});
if (!music.real && !params.has('idle') && (shot || params.has('play'))) {
  music.shelves().then(({ shelves }) => music.play(shelves[0].items[Number(params.get('track')) || 2]));
}
if (params.has('hover')) suitcase.forceHover = params.get('hover');

// ---- lifecycle: hidden -> open -> closing -> hidden ----
let phase = 'hidden';
let appear = 0;
function applyAppear() {
  const e = 1 - Math.pow(1 - appear, 3);
  stage.style.opacity = String(Math.min(1, appear * 1.8));
  stage.style.transform = `translateY(${(1 - e) * 16}px) scale(${0.94 + 0.06 * e})`;
}
function summon() {
  if (phase === 'hidden') {
    suitcase.close({ instant: true });
    appear = 0;
    applyAppear();
    renderer.setAnimationLoop(loop);
    lastT = performance.now();
    refreshListenAgain();
  }
  phase = 'open';
  suitcase.open();
}
function finishPick() {
  const left = tray.finish();
  if (left) {
    suitcase.liftRecord();
    suitcase.placeRecord(left, { claimFor: { baseVideoId: suitcase.videoId } });
  }
  flights.finish();
  suitcase.startNow();
}
function dismiss() {
  if (phase !== 'open') return;
  finishPick();
  phase = 'closing';
  suitcase.close();
  bridge?.closing();
}

const shadowSun = new THREE.Vector3(Infinity, Infinity, Infinity);
let shadowSunOn = null, shadowLastAt = -10;
function updateShadows(t) {
  const sunMoved = sun.position.distanceToSquared(shadowSun) > 0.05 * 0.05 || sun.castShadow !== shadowSunOn;
  const moving = (suitcase.lidMoving || tray.active) && t - shadowLastAt >= 1 / 12;
  if (sunMoved || moving || shadowLastAt < 0) {
    leanShadowMap();
    renderer.shadowMap.needsUpdate = true;
    shadowLastAt = t;
    shadowSun.copy(sun.position);
    shadowSunOn = sun.castShadow;
  }
}

let simTime = 0;
function stepFrame(dt) {
  simTime += dt;
  const p = 1 - Math.exp(-9 * dt);
  parallax.x += (parallax.tx - parallax.x) * p;
  parallax.y += (parallax.ty - parallax.y) * p;
  applyCamera(parallax.x, parallax.y);
  suitcase.update(dt);
  tray.update(dt);
  flights.update(dt);
  if (phase === 'open') appear = Math.min(1, appear + dt / 0.22);
  else if (phase === 'closing' && !suitcase.lidMoving) appear = Math.max(0, appear - dt / 0.16);
  applyAppear();
  caption.setScrub(suitcase.scrubbing ? suitcase.progress : null);
  if (phase === 'closing' && appear <= 0 && !suitcase.lidMoving) {
    phase = 'hidden';
    renderer.setAnimationLoop(null);
    bridge?.closed();
  }
}
const draw = (t) => {
  timeOfDay.update(t);
  roomFill.intensity = sun.castShadow ? 1.15 : 0.18;
  updateLod(camera);
  updateShadows(t);
  return painter ? painter.render(scene, camera, t) : renderer.render(scene, camera);
};
let lastT = 0;
function loop(ms) {
  if (ms - lastT < 1000 / maxFps() - 2) return;
  const dt = Math.min(0.1, (ms - lastT) / 1000);
  lastT = ms;
  stepFrame(dt);
  draw(simTime);
}

bridge?.onOpen(summon);
bridge?.onClose(dismiss);

// ---- pointer ----
const ndc = new THREE.Vector2();
function toNdc(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  return ndc;
}
addEventListener('pointermove', (e) => {
  toNdc(e);
  parallax.tx = THREE.MathUtils.clamp(ndc.x, -1, 1);
  parallax.ty = THREE.MathUtils.clamp(ndc.y, -1, 1);
  if (suitcase.dragging) suitcase.pointerDrag(ndc, camera);
  else suitcase.hover(ndc, camera);
  renderer.domElement.style.cursor = suitcase.cursor();
});
document.addEventListener('pointerleave', () => { suitcase.hover(null); parallax.tx = 0; parallax.ty = 0; });
addEventListener('pointerdown', (e) => {
  if (e.target.closest?.('.cad-tag, .cs')) return;
  toNdc(e);
  if (!suitcase.pointerDown(ndc, camera) && (Math.abs(ndc.x) > 0.93 || Math.abs(ndc.y) > 0.93)) dismiss();
});
addEventListener('pointerup', () => { suitcase.pointerUp(); renderer.domElement.style.cursor = suitcase.cursor(); });
addEventListener('blur', () => suitcase.pointerUp());
addEventListener('wheel', (e) => {
  if (search.isOpen()) return;
  e.preventDefault(); suitcase.wheel(e.deltaY, e.deltaMode);
}, { passive: false });

// ---- keys: Esc shuts it; Space, arrows, L, M as in the shop ----
addEventListener('keydown', (e) => {
  if (search.isOpen()) return;
  const cmd = { ' ': 'toggle', ArrowRight: 'next', ArrowLeft: 'previous', l: 'like', L: 'like', m: 'mute', M: 'mute' }[e.key];
  if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
  else if (cmd) { e.preventDefault(); music.command(cmd); }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); suitcase.nudgeVolume(e.key === 'ArrowUp' ? 0.05 : -0.05); }
});
renderer.domElement.addEventListener('webglcontextrestored', () => { painter?.invalidate(); renderer.shadowMap.needsUpdate = true; });

// ---- screenshots and browser preview ----
if (shot) {
  window.__seek = async (t) => {
    await Promise.all([suitcase.ready(), caption.ready()]);
    while (!lastState?.title && !params.has('idle')) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    suitcase.close({ instant: true });
    phase = 'open';
    for (let i = 0; i < 90; i++) suitcase.update(1 / 30);
    appear = t < 0 ? 1 : 0;
    if (t >= 0) suitcase.open();
    for (let x = 0; x < t - 1e-9;) { const dt = Math.min(1 / 60, t - x); stepFrame(dt); x += dt; }
    if (params.has('tray')) {
      const at = Number(params.get('tray'));
      const item = (await music.shelves()).shelves[0].items[0];
      const cover = getCover(item.art, 512);
      await cover.loaded;
      tray.run(cover.tex);
      for (let x = 0; x < at - 1e-9;) { const dt = Math.min(1 / 60, at - x); stepFrame(dt); x += dt; }
    }
    applyAppear();
    draw(Math.max(0, t));
    await new Promise((r) => setTimeout(r, 100));
    draw(Math.max(0, t));
    return true;
  };
  window.__ready = true;
} else if (!bridge) {
  summon();
  addEventListener('keydown', (e) => { if (e.key === 'o') summon(); });
}
const screenOf = (name, dx = 0, dz = 0) => {
  const hit = suitcase.parts.hits.find((h) => h.control === name).mesh;
  suitcase.root.updateWorldMatrix(true, true);
  const v = new THREE.Vector3(dx, 0, dz).add(hit.position).applyMatrix4(hit.parent.matrixWorld).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
};
if (!window.sienna || window.sienna.isDev) {
  window.__mini = { suitcase, music, summon, dismiss, screenOf, step: stepFrame, tray, flights, get phase() { return phase; }, get appear() { return appear; } };
}
