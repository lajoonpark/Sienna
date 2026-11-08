// Rack lab: the street and shop scene with ONE station's rack, for working on racks without the
// intro, the buttons or YouTube Music. Same renderer, painter, sky, time of day and lights as main.js.
//   lab.html?station=N      which station (default 0), placed at its pos / rotY, camera at its cam
//   &style=wall             build a different rack style at that station
//   &shelf=K &n=COUNT       which fake shelf, and how many records of it (1..24)
//   &hover=N                hold record N up          &playing=N   record N is "in the suitcase"
//   &ptr=x,y [&click]       put the cursor at NDC x,y (-1..1) and optionally click it (tests real picking)
//   &refresh=N              item N's art is swapped for item N+1's after the first frame (tests refreshArt)
//   &pick=N                 click record N (the vinyl slides out and is hidden)
//   &cam=x,y,z,tx,ty,tz     pin another camera       &shot (+ window.__ready / window.__seek)
// Without ?shot the cursor hovers and clicks the rack like in the shop (no cursor tilt).
import * as THREE from 'three';
import { buildStreet } from './street.js';
import { buildShop } from './shop.js';
import { WATERCOLOUR } from './style.js';
import { createWatercolour } from './watercolour.js';
import { createSky } from './sky.js';
import { createTimeOfDay } from './timeofday.js';
import { createRack } from './racks/index.js';
import { createMusic } from './music.js';
import { STATIONS } from './stations.js';
import './fonts.js';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const painter = WATERCOLOUR ? createWatercolour(renderer) : null;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4c98a');
scene.fog = new THREE.Fog('#f1cf9b', 18, 52);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 120);
scene.add(camera);

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
const shop = buildShop();
scene.add(shop);
const timeOfDay = createTimeOfDay({ scene, sun, hemi, sky });

// ---- the rack under test ----
const stationAt = Math.min(STATIONS.length - 1, Math.max(0, Number(params.get('station')) || 0));
const station = STATIONS[stationAt];
shop.userData.stationFurniture?.[station.id] && (shop.userData.stationFurniture[station.id].visible = false); // the rack replaces it
const picks = [];
const rack = createRack(params.get('style') || station.style, {
  onPick: (item, index, disc) => { picks.push({ index, title: item.title, disc }); console.log('picked', index, item.title, disc.matrixWorld.elements.slice(12, 15).map((v) => v.toFixed(2)).join(',')); },
});
rack.root.position.copy(station.pos);
rack.root.rotation.y = station.rotY;
scene.add(rack.root);

const music = createMusic();
const page = await music.shelves();
const shelf = page.shelves[Number(params.get('shelf') ?? stationAt) % page.shelves.length];
const count = Number(params.get('n')) || shelf.items.length;
const items = shelf.items.slice(0, count);
rack.setShelf({ ...shelf, items }, { index: 0, total: 1 });
if (params.has('hover')) rack.forceHover = Number(params.get('hover'));
if (params.has('playing')) rack.setPlaying(items[Number(params.get('playing'))]?.play.videoId);
window.__lab = { rack, items, picks, station };

// ---- camera: at the station's cam (cursor tilt is off in the lab) ----
const pinned = params.get('cam')?.split(',').map(Number);
const cam = pinned ? { pos: new THREE.Vector3(...pinned.slice(0, 3)), target: new THREE.Vector3(...pinned.slice(3, 6)) } : station.cam;
camera.position.copy(cam.pos);
camera.lookAt(cam.target);

let pointer = params.get('ptr') ? new THREE.Vector2(...params.get('ptr').split(',').map(Number)) : null;
addEventListener('pointermove', (e) => { pointer = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
renderer.domElement.addEventListener('click', () => rack.click());

let lastT = 0;
function frame(t, dtOverride) {
  const dt = dtOverride ?? Math.min(0.1, Math.max(0, t - lastT));
  lastT = t;
  timeOfDay.update(t);
  camera.updateMatrixWorld();
  rack.update(dt, camera, pointer, true);
  if (painter) painter.render(scene, camera, t);
  else renderer.render(scene, camera);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  painter?.setSize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

if (params.has('shot')) {
  // settle all animation (big dt), let covers (incl. the lifted 512 px one) and fonts arrive, settle again
  window.__seek = async (t) => {
    frame(t, 0.05);
    if (params.has('refresh')) { const k = Number(params.get('refresh')); items[k].art = items[k + 1].art; rack.refreshArt(items[k]); }
    await new Promise((r) => setTimeout(r, 300));
    await rack.ready();
    frame(t, 10);
    if (params.has('pick')) {
      rack.forceHover = Number(params.get('pick'));
      frame(t, 10);
      rack.click();
      frame(t, 1);
    }
    if (params.has('click')) { frame(t, 10); console.log('click on', rack.hovered, 'ctl', rack.click()); frame(t, 10); }
    await new Promise((r) => setTimeout(r, 150)); // tag and sign textures are drawn a tick later
    await rack.ready();
    frame(t, 10);
    console.log('hovered', rack.hovered);
    return true;
  };
  window.__ready = true;
} else {
  renderer.setAnimationLoop((ms) => frame(ms / 1000));
}
