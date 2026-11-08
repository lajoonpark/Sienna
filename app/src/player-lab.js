// Player lab: the shop seen from the home spot with the in-shop player (the suitcase overlay) on
// top, for working on it without the intro, the racks or YouTube Music. Same renderer, painter,
// sky, time of day and lights as main.js.
//   player-lab.html?hour=15&shot
//   &bare            no shop, a plain painted-paper backdrop (much faster to render)
//   &state=idle|playing|paused   &p=0.3 (how far through the song)   &liked   &track=N
//   &hover=playPause|knob|record|next|previous|like   hold a control's hover
//   &fly=0.4         freeze the record handoff at progress 0..1 (a fake record leaving the table rack)
//   &fly=seek        the same, with the progress taken from the shot time: shot.mjs out 0.2 0.5 0.8
//   &sim=ad|skip     replay what the real app did after a PLAYLIST pick, at a slow frame rate: the record lands, 25 s of
//                    nothing, an ad (ad: stop here), then a real track and a skip (skip: stop here)
//   &lean=x,y        lean the case as if the cursor were there (-1..1)
//   &menu            draw grey stand-ins for the section menu on the left edge (to check nothing is covered)
//   &cam=x,y,z,tx,ty,tz   pin another camera
import * as THREE from 'three';
import { buildStreet } from './street.js';
import { buildShop } from './shop.js';
import { WATERCOLOUR, FONT } from './style.js';
import { createWatercolour, renderOverlay } from './watercolour.js';
import { createSky } from './sky.js';
import { createTimeOfDay } from './timeofday.js';
import { createMusic } from './music.js';
import { createPlayer } from './suitcase/player.js';
import { coverFromUrl } from './suitcase.js';
import './fonts.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const bare = params.has('bare');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const painter = WATERCOLOUR ? createWatercolour(renderer) : null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(bare ? '#e9d9b8' : '#f4c98a');
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 120);
scene.add(camera);

let timeOfDay = null;
if (!bare) {
  scene.fog = new THREE.Fog('#f1cf9b', 18, 52);
  const hemi = new THREE.HemisphereLight('#d6dcf2', '#b08a70', 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffc27a', 2.3);
  sun.position.set(-20, 16, 30);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 110 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sky = createSky();
  scene.add(sky.dome);
  scene.add(buildStreet().root);
  scene.add(buildShop());
  timeOfDay = createTimeOfDay({ scene, sun, hemi, sky });
}

// ---- music: the fake store, with the position pinned so frames repeat ----
const real = createMusic();
const pin = (s) => (shot ? { ...s, position: (Number(params.get('p')) || 0.3) * (s.duration || 200), playerState: params.get('state') === 'paused' ? 2 : s.playerState, like: params.has('liked') ? 'LIKE' : s.like } : s);
const music = { ...real, onState: (cb) => real.onState((s) => { if (!params.has('sim')) cb(pin(s)); }) };   // ?sim feeds its own states
const player = createPlayer({ renderer, painter, music, camera });
const idle = params.get('state') === 'idle' || params.has('sim');
let items = [];
real.shelves().then(({ shelves }) => {
  items = shelves[0].items;
  if (!idle && (shot || params.has('play'))) real.play(items[Number(params.get('track')) || 2]);
});
if (params.has('hover')) player.suitcase.forceHover = params.get('hover');
if (params.has('lean')) { const [x, y] = params.get('lean').split(',').map(Number); player.suitcase.lean(x, y); }
window.__player = player;
window.__fakeDisc = () => fakeDisc();
window.__items = () => items;

if (params.has('menu')) {
  // stand-ins for the section buttons agent A adds: four stacked words, vertically centred on the left edge
  const box = document.createElement('div');
  box.id = 'menu-standin';
  box.style.cssText = 'position:fixed;left:2vw;display:flex;flex-direction:column;gap:6px;pointer-events:none';
  for (const w of ['Quick picks', 'Listen again', 'Mixed for you', 'Playlists']) {
    const d = document.createElement('div');
    d.textContent = w;
    d.style.cssText = `font:40px ${FONT};color:#fbf5e8;background:#2d3158;opacity:.55;padding:4px 36px 2px 24px;width:max-content`;
    box.appendChild(d);
  }
  document.body.appendChild(box);
}

// the menu stand-in sits just above the room the player asks for (player.avoidRect())
function placeMenu() {
  const m = document.getElementById('menu-standin');
  if (m) m.style.bottom = `${innerHeight - player.avoidRect().top + 10}px`;
}

// ---- the camera at the home spot ----
const HOME = { pos: new THREE.Vector3(0, 1.75, -2.2), target: new THREE.Vector3(0, 1.6, -12) };
const pinned = params.get('cam')?.split(',').map(Number);
const lookM = new THREE.Matrix4();
function placeCamera() {
  const pos = pinned ? new THREE.Vector3(...pinned.slice(0, 3)) : HOME.pos;
  const target = pinned ? new THREE.Vector3(...pinned.slice(3, 6)) : HOME.target;
  camera.position.copy(pos);
  camera.quaternion.setFromRotationMatrix(lookM.lookAt(pos, target, new THREE.Vector3(0, 1, 0)));
  camera.updateMatrixWorld();
}
placeCamera();

// a fake record leaving the sleeve of the table rack: standing, facing the viewer, tipped back a little
function fakeDisc() {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(0.05, 1.18, -5.45), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.26, 0.05, 0.1)), new THREE.Vector3(1, 1, 1));
  return { matrixWorld: m, cover: coverFromUrl(items[5]?.art ?? items[0]?.art) };
}

let lastT = 0;
function frame(t, dt) {
  timeOfDay?.update(t);
  placeCamera();
  player.update(dt, t);
  placeMenu();
  if (painter) painter.render(scene, camera, t, player.overlay);
  else { renderer.render(scene, camera); renderOverlay(renderer, player.overlay); }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  painter?.setSize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

if (shot) {
  window.__seek = async (t) => {
    await Promise.all([player.ready(), real.shelves()]);
    while (!idle && !player.suitcase.hasTrack) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    await player.ready();
    player.show(true, true);
    if (params.has('sim') && !window.__simmed) {
      window.__simmed = true;
      const sc = player.suitcase;
      const st = { signedIn: false, ready: true, videoId: null, title: null, artist: null, album: null, art: null, playerState: -1, position: 0, duration: 0, volume: 70, muted: false, like: null, adPlaying: false };
      let T = 0;
      const run = (secs, state, dt = 0.25) => { for (let i = 0; i < secs / dt; i++) { T += dt; if (state) sc.setState(state); player.update(dt, T); } };
      player.receive(fakeDisc());
      run(2);                                                       // a slow frame rate: 0.25 s per frame
      run(25, { ...st, playerState: 5 });                           // nothing playing for a while
      const ad = { ...st, videoId: 'adAAA', adPlaying: true, playerState: 1 };
      run(20, ad);                                                  // an ad
      if (params.get('sim') === 'skip') {
        const t1 = { ...st, videoId: 'kd9TlGDZGkI', title: 'Walk Of Life', artist: 'Dire Straits', art: items[0].art, playerState: 1, duration: 250, position: 3 };
        run(2, t1); await new Promise((r) => setTimeout(r, 400)); run(2, t1);
        const t2 = { ...t1, videoId: 'next222', title: 'Another Track', art: items[1].art, position: 1 };
        run(2, t2); await new Promise((r) => setTimeout(r, 400)); run(2, t2);
      }
    }
    if (params.has('fly') && !window.__flown) { window.__flown = true; player.receive(fakeDisc()); }
    for (let i = 0; i < 2; i++) {
      frame(t, params.has('fly') ? 0.0001 : 10);
      await new Promise((r) => setTimeout(r, 100));
    }
    if (params.has('fly')) { player.freezeFlight(params.get('fly') === 'seek' ? t : Number(params.get('fly'))); frame(t, 0.0001); }
    return true;
  };
  window.__ready = true;
} else {
  const start = performance.now();
  player.show(true);
  renderer.setAnimationLoop(() => {
    const t = (performance.now() - start) / 1000;
    frame(t, Math.min(0.1, t - lastT));
    lastT = t;
  });
}
