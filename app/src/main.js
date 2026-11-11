import * as THREE from 'three';
import { buildStreet } from './street.js';
import { createIntroLight } from './introlight.js';
import { lampWake } from './env.js';
import { buildShop } from './shop.js';
import { WATERCOLOUR } from './style.js';
import { createWatercolour, renderOverlay } from './watercolour.js';
import { createSky } from './sky.js';
import { createTimeOfDay } from './timeofday.js';
import { createRack } from './racks/index.js';
import { getCover, setCoverUploader, restoreCovers } from './racks/common.js';
import { warmUp } from './warmup.js';
import { STATIONS, HOME, assignShelves } from './stations.js';
import { createNav, AT_HOME, paintViews, introBars, BASE_FOV } from './nav.js';
import { createMenu } from './menu.js';
import { createSearch } from './search.js';
import { createSettingsPanel } from './settings-panel.js';
import { createTour } from './tour.js';
import { settings } from './settings.js';
import { createPacer } from './pacer.js';
import { createMusic } from './music.js';
import { createPlayer } from './suitcase/player.js';
import { startSong } from './suitcase.js';
import { createSpread } from './spread.js';
import './fonts.js';

const params = new URLSearchParams(location.search);
const shotMode = params.has('shot');

// painted: the scene is antialiased in its own target, the screen only gets a full-screen quad.
// The screen keeps its picture between frames (preserveDrawingBuffer), so the painter can repaint just the
// part of it that changed: the suitcase's corner, the boiling border (watercolour.js, `Still frames`).
const renderer = new THREE.WebGLRenderer({ antialias: !WATERCOLOUR, preserveDrawingBuffer: shotMode || WATERCOLOUR });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
// PCF, not PCFSoft: three r18x swaps PCFSoft for PCF at the first shadow render, which changed every
// shader's cache key then and made the whole scene compile twice (once more mid-intro)
renderer.shadowMap.type = THREE.PCFShadowMap;
// The sun's 4096 px shadow map is a second full render of the scene. It is redrawn only when
// something that casts it changes: the sun moves, the door opens, records lift at a rack (see updateShadows).
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
document.body.appendChild(renderer.domElement);
const painter = WATERCOLOUR ? createWatercolour(renderer) : null;
setCoverUploader(renderer); // painted covers go to the GPU in small slices, before a rack shows them

const scene = new THREE.Scene();
const skyColor = new THREE.Color('#f4c98a');
scene.background = skyColor;
scene.fog = new THREE.Fog('#f1cf9b', 18, 52);

const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 120);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

// Light: warm low sun for the street, soft sky fill. Interior lamps live in shop.js.
const hemi = new THREE.HemisphereLight('#d6dcf2', '#b08a70', 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffc27a', 2.3);
// shadows cover the whole street and the shop behind it, so the vaults keep the sun out
sun.position.set(-20, 16, 30);
sun.target.position.set(0, 0, -1);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 110 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
// The shadow map, made here rather than by three. PCF shadows sample only its depth layer, but three gives
// its target a full RGBA colour layer too (64 MB at 4096 px, written and never read). A framebuffer needs a
// colour layer the same size, so it is the smallest one, one byte a pixel: 16 MB. Otherwise as three makes
// it (WebGLShadowMap: PCF, no reversed depth); made again whenever timeofday.js has let go of it for the night.
// Made at the first shadow draw (updateShadows), not here: a new texture takes a Math.random uuid, and the
// street and shop below are built from Math.random, so making it now would build a different street.
function leanShadowMap() {
  if (!sun.castShadow) return;
  if (sun.shadow.map?.texture.format === THREE.RedFormat) return;
  sun.shadow.map?.dispose();   // one three made itself (a render got there first): swap it
  const { x, y } = sun.shadow.mapSize;
  const map = new THREE.WebGLRenderTarget(x, y, { format: THREE.RedFormat, generateMipmaps: false });
  map.texture.name = 'sun.shadowMapColour';
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

const street = buildStreet();
const introLight = createIntroLight(street.root); // intro-only door spill, sun beams, grade (introlight.js)
scene.add(street.root);
const shop = buildShop();
scene.add(shop);
// furniture that a station's rack replaces: shown until a rack stands there
const furniture = shop.userData.stationFurniture ?? {};
const timeOfDay = createTimeOfDay({ scene, sun, hemi, sky });
// The plant room's skylight beam is a see-through open cylinder (shop.js). From inside it washes the
// whole frame in pale planes (and veils the spinner), so it is gone whenever the camera is inside the plant
// room or within ~2.5 m of its axis, and fades back in as you leave.
let skylightBeam = null;
shop.traverse((o) => {
  if (!skylightBeam && o.isMesh && o.geometry?.type === 'CylinderGeometry' && o.material?.transparent
    && o.material.side === THREE.DoubleSide && Math.abs(o.material.opacity - 0.12) < 1e-3) skylightBeam = o;
});
const beamOpacity = skylightBeam?.material.opacity ?? 0;

// ---- where the camera is: intro -> home -> station (nav.js) ----
// ?at=home / ?at=N start settled there with no intro; ?fly=from,to,p freezes a flight at fraction p.
const stationArg = (s) => (s === 'home' ? AT_HOME : Number.isInteger(Number(s)) && Number(s) >= 0 && Number(s) < STATIONS.length ? Number(s) : null);
const flyArg = params.get('fly')?.split(',');
const flySpec = flyArg && flyArg.length === 3 && stationArg(flyArg[0]) !== null && stationArg(flyArg[1]) !== null
  ? { from: stationArg(flyArg[0]), to: stationArg(flyArg[1]), p: Number(flyArg[2]) } : null;
const startAt = flySpec ? flySpec.from : params.has('at') ? stationArg(params.get('at')) : null;
const nav = createNav({ home: HOME, stations: STATIONS, startAt });
if (flySpec) nav.freeze(flySpec.from, flySpec.to, flySpec.p);
const pinned = params.get('cam')?.split(',').map(Number); // ?cam=x,y,z,tx,ty,tz pins the camera
let curT = 0;

// ---- music: the racks, the section menus, the buttons and YouTube Music (or the fake store) ----
const music = createMusic();
let player = {};
let playingId = null;
const racks = STATIONS.map(() => null); // created when a station first gets a shelf
const placed = new Map();               // station index -> { key, title }: what each rack shows
let hoverArg = params.has('hover') ? Number(params.get('hover')) : null;

function pick(item, index, disc) {
  if (disc) startSong(music, suitcase.suitcase, item); else music.play(item);
  // the vinyl flies from the sleeve to the suitcase's platter: disc = { matrixWorld, cover }
  void index;
  if (disc) suitcase.receive(disc);
}

function ensureRack(i) {
  if (racks[i]) return racks[i];
  const st = STATIONS[i];
  const rack = createRack(st.style, { onPick: pick });
  rack.root.position.copy(st.pos);
  rack.root.rotation.y = st.rotY;
  rack.setPlaying(playingId);
  rack.root.visible = false; // shown by buildRack once its shaders are ready
  scene.add(rack.root);
  racks[i] = rack;
  return rack;
}

// the suitcase record player in the bottom-left corner (drawn in an overlay pass, subscribes to the player state itself)
const suitcase = createPlayer({ renderer, painter, music, camera });
// a hovered record never floats up underneath the suitcase or its caption
const menu = createMenu({
  onGo: (i) => nav.go(i),
  onHome: () => nav.go(AT_HOME),
  // the suitcase and its caption sit bottom-left; the left menu stays above them
  getAvoid: () => suitcase.avoidRect(),
});
// heading to a rack: make its hover covers while the camera flies (see prewarm in racks/common.js)
function warm() { if (nav.at !== AT_HOME) racks[nav.at]?.prewarm((tex) => renderer.initTexture(tex)); }
// pressing an album's record fans its songs out in front of you (src/spread.js); a song or the red
// play-all record flies from there to the suitcase like any picked record
const spread = createSpread({
  camera,
  music,
  onPlay: (item, disc) => { pick(item, -1, disc); if (disc) suitcase.wake(); },
});
nav.onChange(() => { menu.setCurrent(nav.at); warm(); spread.close(); });
menu.setCurrent(nav.at);
// the search bar (Control+Option+J by default, Settings > Shortcuts) must exist before the key handlers below are registered
// a search pick has no sleeve: the drawer in the suitcase slides out with the record in it
const search = createSearch({ music, onPlay: (item) => { startSong(music, suitcase.suitcase, item); suitcase.dispense(getCover(item.art, 512).tex); } });
// Settings (Cmd+, or the SETTINGS word): a rail of pages (Account, Look, ...); swallows keys itself while open; Settings > Tour starts the tour again
const settingsPanel = createSettingsPanel({ music, onTour: () => tour.restart() });
// the first-run tour (src/tour.js): paper notes in the shop once the intro reaches home on a new install
const tour = createTour({
  music,
  goHome: () => nav.go(AT_HOME),
  isSearchOpen: () => search.isOpen(),
  playerBox: () => suitcase.avoidRect(),
});
// covers that were repaired in the background: let the racks reload them
music.onArt?.((item) => racks.forEach((r) => r?.refreshArt?.(item)));
music.onState((s) => {
  player = s;
  tour.setState(s);
  playingId = s.adPlaying ? null : s.videoId;
  racks.forEach((r) => r?.setPlaying(playingId));
});

// Which shelf is on which rack. Shelves arrive in pages: later pages only fill racks that are still
// empty and never move a shelf that is already out, so nothing flickers or reshuffles. A rack is
// only repainted when its shelf really changed (same title and records = left alone).
const shelfKey = (sh) => `${sh.title}\n${sh.items.length}\n${sh.items.slice(0, 4).map((i) => i.play?.videoId ?? i.play?.playlistId ?? i.title).join(',')}`;
let shelves = [];
let shelvesLoaded = false;

// ---- shadow map refresh (renderer.shadowMap.autoUpdate is off) ----
// Every frame while the door swings or records move (hover lift, pick, a shelf dropping in), at
// SHADOW_HZ; otherwise only when the sun has moved a little (it creeps with the real clock).
const SHADOW_HZ = 20;
let shadowOwed = false, shadowBusyUntil = 0, shadowLastAt = -1, shadowDoor = -1, shadowHover = -2;
const shadowSun = new THREE.Vector3(), shadowSunOn = { v: null };
const shadowsBusy = (sec = 1.2) => { shadowBusyUntil = Math.max(shadowBusyUntil, curT + sec); };
function updateShadows(t) {
  const door = nav.doorOpen(t), hov = currentRack()?.hovered ?? -1;
  // the door swinging during the intro redraws shadows only once it has stopped (a 4096 map at 20 Hz
  // was a big share of the push-in's frame drops); a door moving later (a skip) still updates live
  // During the intro nothing else redraws it either: racks filling in (the shelves often arrive
  // mid push-in) are owed one redraw, done when the intro ends.
  let doorDone = false;
  if (door !== shadowDoor) { shadowDoor = door; if (!nav.intro) shadowsBusy(0.2); else doorDone = door >= 1; }
  if (hov !== shadowHover) { shadowHover = hov; shadowsBusy(); }
  const sunMoved = sun.position.distanceToSquared(shadowSun) > 0.05 * 0.05 || sun.castShadow !== shadowSunOn.v;
  let due = t < shadowBusyUntil && t - shadowLastAt >= 1 / SHADOW_HZ;
  if (nav.intro) { if (due) shadowOwed = true; due = doorDone; }
  else if (shadowOwed) { due = true; shadowOwed = false; }
  if (sunMoved || due || shadowLastAt < 0) {
    leanShadowMap();   // the first draw, or the sun is back after the night
    renderer.shadowMap.needsUpdate = true;
    shadowLastAt = t;
    shadowSun.copy(sun.position); shadowSunOn.v = sun.castShadow;
  }
}

// Building a rack (sleeves, tags, covers) and compiling its shaders is far too much for one frame,
// and the shelves usually come in while the intro pushes in, so each station is queued and built
// one per frame (runFillJob); a built rack stays hidden until its shaders have compiled in the
// background, so it never stalls a frame. Screenshots (?shot) build straight away.
const fillJobs = new Map(); // station index -> shelf waiting to be built
let fillGen = 0;            // bumps when a station is refilled or cleared, so a stale reveal is dropped
const fillGens = new Map();
function fill(i, shelf) {
  const key = shelfKey(shelf);
  if (placed.get(i)?.key === key) return;
  placed.set(i, { key, title: shelf.title });
  fillJobs.set(i, shelf);
  if (shotMode) runFillJob(Infinity);
}
function buildRack(i, shelf) {
  const rack = ensureRack(i);
  rack.setShelf(shelf);
  const gen = ++fillGen;
  fillGens.set(i, gen);
  const reveal = () => {
    if (fillGens.get(i) !== gen) return;
    rack.root.visible = true;
    shadowsBusy(2); // the records drop in
    if (i === nav.at) warm();
    if (furniture[STATIONS[i].id]) furniture[STATIONS[i].id].visible = false;
    // the new rack's frame gets its own strokes
    painter?.bakeStrokes(scene, [{ pos: STATIONS[i].cam.pos, target: STATIONS[i].cam.target }]);
  };
  if (shotMode || rack.root.visible) { reveal(); return; } // a refill of a rack on show swaps in place
  rack.root.visible = false;
  const ready = warmUp(renderer, rack.root, camera, scene, painter?.target ?? null);
  Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]).then(reveal, reveal);
}
function runFillJob(n = 1) {
  for (const [i, shelf] of fillJobs) {
    if (n-- <= 0) return;
    fillJobs.delete(i);
    buildRack(i, shelf);
  }
}
function clearStation(i) {
  fillJobs.delete(i);
  fillGens.delete(i);
  if (racks[i]) racks[i].root.visible = false;
  shadowsBusy(0.2);
  if (furniture[STATIONS[i].id]) furniture[STATIONS[i].id].visible = true;
  placed.delete(i);
}
function placeShelves(all, { first = false, prune = false } = {}) {
  const want = new Map(assignShelves(all).map((a) => [a.index, a.shelf]));
  if (first) {
    for (const [i, shelf] of want) fill(i, shelf);
  } else {
    const shown = new Set([...placed.values()].map((p) => p.key));
    const leftovers = [];
    for (const [i, shelf] of want) {
      if (shown.has(shelfKey(shelf))) continue;
      if (!placed.has(i)) fill(i, shelf); else leftovers.push(shelf);
    }
    for (const shelf of leftovers) {
      const free = STATIONS.findIndex((_, k) => !placed.has(k));
      if (free >= 0) fill(free, shelf);
    }
  }
  if (prune) {
    const keys = new Set(all.map(shelfKey));
    for (const [i, p] of [...placed]) if (!keys.has(p.key)) clearStation(i);
  }
  const sections = [...placed.keys()].sort((a, b) => a - b);
  nav.setSections(sections);
  menu.setSections(sections.map((i) => ({ index: i, title: placed.get(i).title })));
  menu.setCurrent(nav.at);
  // standing at a station whose shelf went away: back to the entrance
  if (prune && nav.at !== AT_HOME && !placed.has(nav.at) && !params.has('at') && !flySpec) nav.go(AT_HOME);
}

// ?shelves=8 (fake store only): pad the shelf list with copies under other titles, to try all 8 stations
const EXTRA_TITLES = ['Your library', 'Similar to Lemon Hours', 'Anything else'];
function padShelves(list) {
  const want = Number(params.get('shelves')) || 0;
  if (music.real || want <= list.length) return list;
  const out = list.slice();
  for (let k = 0; out.length < want && k < EXTRA_TITLES.length; k++) {
    const src = list[(k + 1) % list.length];
    out.push({ title: EXTRA_TITLES[k], items: src.items.slice().reverse().slice(0, 12 + k * 3) });
  }
  return out;
}

// Station preferences must win ("Quick picks" belongs on the crate table), so the shelves are placed
// ONCE, when every page is in, or when the camera first reaches home (the racks are not visible
// before that), or straight away when a ?at shot starts: whichever comes first. Anything that
// arrives after that only fills empty stations (no reshuffling).
const SHELF_PAGES = 3;
let everPlaced = false;       // the very first placement has happened
let placedThisLoad = false;   // this load has been placed (later pages then only fill free stations)
function placeFirst() {
  if (everPlaced || !shelves.length) return;
  placeShelves(padShelves(shelves), { first: true });
  everPlaced = placedThisLoad = true;
}
async function loadShelves() {
  placedThisLoad = false;
  try {
    let page = await music.shelves();
    shelves = page.shelves.slice();
    if (!everPlaced && startAt !== null) placeFirst(); // ?at shot: no intro to wait for
    for (let i = 1; i < SHELF_PAGES && page.next; i++) {
      page = await music.shelves(page.next);
      shelves.push(...page.shelves);
      if (placedThisLoad) placeShelves(padShelves(shelves));
    }
  } catch (e) {
    console.warn('could not load shelves', e);
  } finally {
    // everything is in (or the load failed part-way): place now unless the camera got home first
    if (shelves.length) {
      placeShelves(padShelves(shelves), { first: !placedThisLoad, prune: true });
      everPlaced = placedThisLoad = true;
    }
    shelvesLoaded = true;
  }
}
loadShelves();
music.onAccount(loadShelves);   // signed in, out or switched: that account's shelves

// for tests and the devtools console
window.__siennaDebug = {
  renderer,
  painter,
  get scene() { return scene; },
  get lastFrame() { return { t: curT }; }, // the moment last drawn (scripts/cache-check.mjs repaints it whole)
  get pacer() { return pacer; },
  camera,
  THREE, // checks (scripts/spinner-clip-check.mjs)
  // ms per render step, GPU work included (each step waits for the GPU); shadows: also redraw the shadow map
  profile({ shadows = false, runs = 3 } = {}) {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    const out = {};
    for (let r = 0; r < runs; r++) {
      let last = performance.now();
      const sync = (name) => {
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const now = performance.now();
        (out[name] ??= []).push(now - last);
        last = now;
      };
      if (shadows) renderer.shadowMap.needsUpdate = true;
      painter?.invalidate(); // time a whole frame, not what is left of one when nothing has changed
      sync('start');
      const t0 = last;
      if (painter) painter.render(scene, camera, curT, suitcase.overlay, sync);
      else renderer.render(scene, camera);
      sync('end');
      (out.total ??= []).push(performance.now() - t0);
    }
    delete out.start; delete out.end;
    const res = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    for (const [k, v] of Object.entries(out)) res[k] = +Math.min(...v).toFixed(1);
    return res;
  },
  get shelves() { return shelves; },
  get player() { return player; },
  get rack() { return racks[nav.at >= 0 ? nav.at : 0] ?? racks.find(Boolean); }, // the rack you are at
  racks,
  music,
  spread,
  nav,
  menu,
  search,
  suitcase,
  tour,
  get stations() { return STATIONS.map((s, i) => ({ index: i, id: s.id, style: s.style, shelf: placed.get(i)?.title ?? null })); },
  get state() { return { phase: nav.phase, at: nav.at, settled: nav.settled, flying: nav.flying, progress: nav.progress, introDone: nav.introDone, sections: nav.sections }; },
  get focus() { return { ...focus }; },
  get camOffset() { return focus.offP.toArray(); },
  get tucked() { return suitcase.tucked; },
  // the swing about the hovered record; pivotPx = where the pivot is on screen (it should not move)
  get orbit() {
    const v = rig.localToWorld(focus.pivot.clone()).project(camera);
    return { yaw: focus.yaw, pitch: focus.pitch, aimed: focus.aimed, pivotPx: [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight] };
  },
  // hold record k up on the rack you are at (null = back to the cursor), like ?hover=k
  setHover(k) { hoverArg = k ?? null; if (k == null) for (const r of racks) if (r) r.forceHover = null; },
  go: (i) => nav.go(i),
  home: () => nav.go(AT_HOME),
  jump: (i) => nav.jump(i),
};

// ---- cursor tilt ----
const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
let pointer = null; // normalised device coords, for picking records
let cursorX01 = null; // 0..1 across the window, for the side menus
addEventListener('pointermove', (e) => {
  pointerPx.x = e.clientX; pointerPx.y = e.clientY;
  cursorX01 = e.clientX / innerWidth;
  tilt.tx = (e.clientX / innerWidth) * 2 - 1;
  tilt.ty = (e.clientY / innerHeight) * 2 - 1;
  // words and buttons drawn over the picture do not pick records through them
  pointer = e.target === renderer.domElement ? new THREE.Vector2(tilt.tx, -tilt.ty) : null;
});
const pointerPx = { x: 0, y: 0 };

// ---- the camera swings round the record you are on ----
// At a rack, the moment a record lifts, the camera orbits about that record (turns and moves together,
// pivoting on it) about a third of the way toward facing it head-on. No waiting for the cursor to rest:
// the turn runs on a critically damped spring, so it starts gently, never overshoots, and a new record
// mid-turn just bends the motion instead of restarting it. Pivoting on the
// record keeps it on the same spot on screen, so it stays under the cursor; only the room around it
// swings. The camera never slides left / right / up / down on its own.
// Only the cursor changes what is hovered: whenever the camera starts a swing (toward a record, or back
// when you leave the records), the hover is frozen until the cursor actually moves. Otherwise the swing
// moves a neighbouring record under a still cursor, the camera swings to that one, and so on.
// The pivot is taken once per record (where it sits when the swing starts), not chased every frame.
// Zoom: the camera moves in toward the hovered record along the line to it (so the record stays under
// the cursor and just grows, its words readable), to about zoomTo metres from it, but never more than
// zoomMax of the way (far racks like the tall bookshelf get the most; the close trough barely moves).
// zoomRate: how quickly it gets there.
const FOCUS = { dwell: 0.03, share: 0.35, maxYaw: 0.14, maxPitch: 0.09, omega: 11, rate: 6, settle: 2, release: 0.35, unfreezePx: 4,
  zoomTo: 1.6, zoomMax: 0.5, zoomRate: 4 };
const focus = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, vyaw: 0, vpitch: 0, key: -1, aimed: -1, rack: -1, on: 0, off: 0, freeze: null,
  pivot: new THREE.Vector3(), // rig-local point the camera orbits about
  // the camera's pose in the rig without the cursor tilt; each frame's step of the swing is applied to it
  // as a rotation about the pivot, so the pivot stays put on screen even when it changes mid-swing
  offP: new THREE.Vector3(), offQ: new THREE.Quaternion() };
const _fp = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const orbitQ = (yaw, pitch, out) => out.setFromEuler(_e.set(pitch, yaw, 0));
// exact critically damped spring step toward target (stable at any frame time); returns [x, v]
function spring(x, v, target, w, dt) {
  const d = x - target, c = v + w * d, e = Math.exp(-w * dt);
  return [target + (d + c * dt) * e, (v - w * c * dt) * e];
}
function aimAt(yaw, pitch, key) {
  if (Math.abs(yaw - focus.tyaw) + Math.abs(pitch - focus.tpitch) < 0.01) return;
  focus.tyaw = yaw; focus.tpitch = pitch;
  focus.freeze = { key, x: pointerPx.x, y: pointerPx.y };
}
function updateFocus(dt) {
  const at = nav.settled && nav.at !== AT_HOME && !pinnedPose ? nav.at : -1;
  const rack = at >= 0 ? racks[at] : null;
  if (at !== focus.rack) {
    focus.rack = at; focus.key = focus.aimed = -1; focus.tyaw = focus.tpitch = 0; focus.vyaw = focus.vpitch = 0; focus.freeze = null;
  }
  // moving the cursor (a few px, not a twitch) lets the hover follow it again
  const fz = focus.freeze;
  if (fz && Math.hypot(pointerPx.x - fz.x, pointerPx.y - fz.y) > FOCUS.unfreezePx) focus.freeze = null;
  const hov = rack && hoverArg === null ? rack.hovered : -1;
  if (hov !== focus.key) { focus.key = hov; focus.on = 0; }
  // a couple of frames on a record is enough (brushing past one for a single frame does not count)
  if (hov >= 0) { focus.on += dt; focus.off = 0; } else focus.off += dt;
  if (hov >= 0 && hov !== focus.aimed && focus.on >= FOCUS.dwell && rack.focusPoint(_fp)) {
    // the record's direction from the rig (the camera before tilt and focus)
    rig.worldToLocal(_fp);
    const yaw = Math.atan2(-_fp.x, -_fp.z), pitch = Math.atan2(_fp.y, Math.hypot(_fp.x, _fp.z));
    focus.aimed = hov;
    // swing the sightline to the record back toward straight ahead (the rack faces the station view):
    // the camera turns away from the record while moving round in front of it
    const ty = THREE.MathUtils.clamp(-yaw * FOCUS.share, -FOCUS.maxYaw, FOCUS.maxYaw);
    const tp = THREE.MathUtils.clamp(-pitch * FOCUS.share, -FOCUS.maxPitch, FOCUS.maxPitch);
    focus.pivot.copy(_fp); // swings go step by step about the pivot, so a new pivot never jumps
    aimAt(ty, tp, hov);
  } else if (hov < 0 && focus.off > FOCUS.release && focus.aimed !== -1) {
    focus.aimed = -1;
    aimAt(0, 0, -1);
  }
  const k = 1 - Math.exp(-dt * FOCUS.rate);
  if (focus.aimed === -1) {
    // no record to keep under the cursor: ease straight home (undoes any drift between pivots)
    [focus.yaw, focus.vyaw] = spring(focus.yaw, focus.vyaw, 0, FOCUS.omega, dt);
    [focus.pitch, focus.vpitch] = spring(focus.pitch, focus.vpitch, 0, FOCUS.omega, dt);
    focus.offP.multiplyScalar(1 - k);
    focus.offQ.slerp(_qa.identity(), k);
    return finishFocus(rack);
  }
  // this frame's step of the swing, as a rotation about the pivot
  orbitQ(focus.yaw, focus.pitch, _qa).invert();
  [focus.yaw, focus.vyaw] = spring(focus.yaw, focus.vyaw, focus.tyaw, FOCUS.omega, dt);
  [focus.pitch, focus.vpitch] = spring(focus.pitch, focus.vpitch, focus.tpitch, FOCUS.omega, dt);
  orbitQ(focus.yaw, focus.pitch, _qb).multiply(_qa); // step = R(new) * R(old)^-1
  focus.offP.sub(focus.pivot).applyQuaternion(_qb).add(focus.pivot);
  focus.offQ.premultiply(_qb);
  // Steps about different pivots do not cancel out: going record to record, each pair left a little
  // shift, mostly along the sightline, so the camera crept further back the longer you hovered (1.8 m
  // after 30 records). The settled pose for this pivot and angle is p = pivot - R * pivot (same distance
  // to the record as the rig has). Keep the distance to the pivot exact (sliding along the line to the
  // pivot does not move it on screen) and ease the small sideways rest toward that pose.
  // Zoomed in, the settled pose is the same turn but nearer: p = pivot - R * pivot * near. The
  // distance to the pivot eases toward that (a new record mid-zoom bends it instead of jumping).
  const k2 = 1 - Math.exp(-dt * FOCUS.settle), kz = 1 - Math.exp(-dt * FOCUS.zoomRate);
  const near = THREE.MathUtils.clamp(FOCUS.zoomTo / focus.pivot.length(), 1 - FOCUS.zoomMax, 1);
  orbitQ(focus.yaw, focus.pitch, _qa);
  _fp.copy(focus.pivot).applyQuaternion(_qa).multiplyScalar(-near).add(focus.pivot);
  const dist = focus.offP.distanceTo(focus.pivot);
  focus.offP.lerp(_fp, k2);
  focus.offQ.slerp(_qa, k2);
  focus.offP.sub(focus.pivot).setLength(dist + (focus.pivot.length() * near - dist) * kz).add(focus.pivot);
  finishFocus(rack);
}
function finishFocus(rack) {
  if (hoverArg === null) for (const r of racks) if (r) r.forceHover = r === rack && focus.freeze ? focus.freeze.key : null;
}
document.addEventListener('pointerleave', () => { pointer = null; cursorX01 = null; });
const currentRack = () => (nav.settled && nav.at !== AT_HOME ? racks[nav.at] : null);
// any click during the intro skips to home
addEventListener('pointerdown', () => { if (nav.intro) nav.skipIntro(curT); });
// a pick wakes the tucked suitcase straight away, so it is up with the lid open before the record arrives
// (not when the press was a drag that turned the rack)
renderer.domElement.addEventListener('click', () => {
  if (grabbed) { grabbed = false; return; }
  if (nav.intro) return;
  shadowsBusy(1.5);
  // the album spread is out: a record or an arrow, else the click puts the records back
  if (spread.isOpen) { spread.click(); return; }
  const rack = currentRack();
  const s = rack && rack.core.control < 0 ? rack.core.sleeves[rack.hovered] : null;
  if (s?.item.kind === 'album' && !s.picking) { s.bump = 1; spread.open(s.item, s.mesh); return; }
  if (rack?.click()) suitcase.wake();
});
// grab and turn a rack by hand (the spinner): press on it and drag; past a few px it is a drag, not a click
const DRAG_PX = 4;
let grab = null, grabbed = false;
const ndcOf = (e) => new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
renderer.domElement.addEventListener('pointerdown', (e) => {
  grabbed = false;
  const rack = currentRack();
  if (nav.intro || e.button !== 0 || !rack?.grab(ndcOf(e), camera)) return;
  grab = { rack, x: e.clientX, y: e.clientY, moving: false, id: e.pointerId };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!grab) return;
  if (!grab.moving && Math.hypot(e.clientX - grab.x, e.clientY - grab.y) <= DRAG_PX) return;
  if (!grab.moving) { grab.moving = true; renderer.domElement.style.cursor = 'grabbing'; }
  grab.rack.dragTo(ndcOf(e), camera);
});
const letGo = () => {
  if (!grab) return;
  grab.rack.release();
  grabbed = grab.moving;
  renderer.domElement.style.cursor = '';
  grab = null;
};
renderer.domElement.addEventListener('pointerup', letGo);
renderer.domElement.addEventListener('pointercancel', letGo);

// ---- keys ----
// Space play/pause, arrows back/skip and volume, L like, Tab / Shift+Tab next / previous section,
// Esc home. Scroll = volume (a sideways scroll turns the spinner instead). Nothing fires while typing (the search bar).
const typing = (e) => {
  const t = e.target;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};
const searchOpen = () => search.isOpen();
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
addEventListener('keydown', (e) => {
  if (typing(e) || searchOpen()) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (nav.intro) {
    if (MODIFIER_KEYS.has(e.key)) return;
    nav.skipIntro(curT);
    if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); return; }
  }
  const cmd = { ' ': 'toggle', ArrowRight: 'next', ArrowLeft: 'previous', l: 'like', L: 'like' }[e.key];
  if (cmd) { e.preventDefault(); music.command(cmd); return; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    music.command('volume', (player.volume ?? 70) + (e.key === 'ArrowUp' ? 5 : -5));
  } else if (e.key === 'Tab') {
    e.preventDefault();
    nav.step(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Escape') {
    if (spread.isOpen) spread.close(); else nav.go(AT_HOME);
  }
});
// scroll keeps its own running volume (player state lags a few hundred ms behind).
// Scrolling down turns it down (Lajoon's ask; with macOS natural scrolling that is the finger moving down).
let wheelVol = null, wheelIdle = 0;
addEventListener('wheel', (e) => {
  if (settingsPanel.isOpen() || search.isOpen()) return; // the wheel scrolls the search slips then, never the volume
  // mostly sideways (trackpad swipe): a rack that turns by hand takes it, and the volume stays put
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { if (spread.isOpen) spread.wheel(e.deltaX); else currentRack()?.wheel(e.deltaX); return; }
  wheelVol = Math.min(100, Math.max(0, (wheelVol ?? player.volume ?? 70) + e.deltaY * 0.05));
  music.command('volume', wheelVol);
  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => { wheelVol = null; }, 600);
}, { passive: true });

const lookM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const pinnedPose = pinned ? { pos: new THREE.Vector3(...pinned.slice(0, 3)), target: new THREE.Vector3(...pinned.slice(3, 6)) } : null;
const DOOR_OPEN = THREE.MathUtils.degToRad(105);

let lastT = 0;
let hoverOn = -1;
let trayDone = false;
let pickDone = false;
// ---- frame-rate readout (Settings > Frame rate, or ?fps=1): average fps and the slowest frame ----
const fpsBox = document.createElement('div');
fpsBox.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;font:12px/1.3 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);padding:3px 6px;border-radius:4px;pointer-events:none;display:none';
document.body.appendChild(fpsBox);
const fpsOn = () => params.get('fps') === '1' || !!settings.get('fps');
fpsBox.style.display = fpsOn() ? 'block' : 'none';
settings.on('fps', () => { fpsBox.style.display = fpsOn() ? 'block' : 'none'; });
// Settings > Lettering changes live: everything with lettering repaints itself (style.js onLettering).
const fpsStat = { n: 0, since: performance.now(), last: performance.now(), worst: 0 };
function tickFps() {
  if (fpsBox.style.display === 'none') return;
  const now = performance.now();
  fpsStat.worst = Math.max(fpsStat.worst, now - fpsStat.last);
  fpsStat.last = now; fpsStat.n++;
  if (now - fpsStat.since < 500) return;
  fpsBox.textContent = `${Math.round(fpsStat.n * 1000 / (now - fpsStat.since))} fps · worst ${Math.round(fpsStat.worst)} ms`;
  fpsStat.n = 0; fpsStat.since = now; fpsStat.worst = 0;
}

let barsK = 1; // the bars' last value, so a skip mid-way never makes them jump back up
function frame(t, dtOverride, draw = true) {
  // wall-clock time: a slow frame rate must not stretch flights, so allow a long step (nav and racks cope)
  const dt = dtOverride ?? Math.min(0.25, Math.max(0, t - lastT));
  lastT = curT = t;
  // lamps wake one by one as the intro's camera nears them (env.js lampWake); last frame's camera z
  lampWake.camZ = nav.intro && !pinnedPose ? nav.pose.pos.z : null;
  const sunNow = timeOfDay.update(t);
  const pose = nav.update(t, dt);
  if (!everPlaced && nav.introDone) placeFirst(); // the camera reached home before the last page came in
  runFillJob();
  const c = pinnedPose ?? pose;
  rig.position.copy(c.pos);
  // the intro's lens (nav.js SHOT) widens to BASE_FOV; a pinned ?cam keeps the normal one
  const fov = pinnedPose ? BASE_FOV : pose.fov ?? BASE_FOV;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (skylightBeam) {
    const d = Math.hypot(c.pos.x - skylightBeam.position.x, c.pos.z - skylightBeam.position.z);
    // metres beyond the plant room's z range (0 inside it)
    const outside = c.pos.z > -20 ? c.pos.z + 20 : c.pos.z < -24.2 ? -24.2 - c.pos.z : 0;
    const f = THREE.MathUtils.smoothstep(d, 2.5, 3.5) * THREE.MathUtils.smoothstep(outside, 0, 1.2);
    skylightBeam.material.opacity = beamOpacity * f;
    skylightBeam.visible = f > 0.01;
  }
  // Matrix4.lookAt uses the camera convention (looks down -z); Object3D.lookAt on a group would face the other way.
  rig.quaternion.setFromRotationMatrix(lookM.lookAt(c.pos, c.target, UP));
  for (const { pivot, side } of street.leaves) pivot.rotation.y = side * -nav.doorOpen(t) * DOOR_OPEN;
  // the tilt holds while a rack record is up: turning the camera under it would slide the record across
  // the rack (keepUnderCursor keeps it on the spot where the hover began), as if the cursor were carrying
  // it. The album spread hangs in the camera's frame, so its records ride along and the tilt keeps going.
  if (spread.isOpen || !((currentRack()?.hovered ?? -1) >= 0)) {
    tilt.x += (tilt.tx - tilt.x) * 0.06;
    tilt.y += (tilt.ty - tilt.y) * 0.06;
    // the last hair's breadth (a 30th of a pixel) at once: the view comes to rest, and a resting view is not painted again
    if (Math.abs(tilt.tx - tilt.x) < 1e-4) tilt.x = tilt.tx;
    if (Math.abs(tilt.ty - tilt.y) < 1e-4) tilt.y = tilt.ty;
  }
  // gentle tilt at home, calmer at a rack so records stay put under the cursor
  const k = nav.tilt;
  updateFocus(dt);
  // the swing about the hovered record, then the cursor tilt on top
  camera.position.copy(focus.offP);
  camera.quaternion.copy(focus.offQ).multiply(_qa.setFromEuler(_e.set(-tilt.y * 0.09 * k, -tilt.x * 0.2 * k, 0)));
  rig.updateMatrixWorld();

  // ?hover=N holds record N up on the rack you are at (a pinned ?cam counts as the table)
  const hoverAt = pinnedPose && nav.at === AT_HOME ? 0 : nav.settled ? nav.at : -1;
  if (hoverArg !== null && hoverAt !== hoverOn) {
    if (racks[hoverOn]) racks[hoverOn].forceHover = null;
    hoverOn = hoverAt;
  }
  if (hoverArg !== null && racks[hoverOn] && hoverOn >= 0) racks[hoverOn].forceHover = hoverArg;
  // only the rack you are standing at reacts to the cursor, and only once the flight has settled
  racks.forEach((rack, i) => {
    if (!rack || !rack.root.visible) return;
    const active = (nav.settled && nav.at === i) || (!!pinnedPose && i === hoverAt);
    // the cursor over the suitcase does not pick records through it
    rack.update(dt, camera, active && !suitcase.over && !spread.isOpen ? pointer : null, active);
  });
  // an album under the cursor: fetch its songs now, so pressing it opens the spread at once
  const hovItem = currentRack()?.core.sleeves[currentRack().hovered]?.item;
  if (hovItem?.kind === 'album') spread.prefetch(hovItem);
  spread.update(dt, !suitcase.over ? pointer : null);

  const ui = nav.introDone || !!pinnedPose;
  suitcase.tuck(!!currentRack() && !pinnedPose); // at a rack the case tucks down out of the records' way
  if (tour.wantsPlayer) suitcase.wake(0.5); // ...but not while the tour's note is telling you about it
  suitcase.show(ui, shotMode); // the lid flicks open the first time, when the intro reaches home
  suitcase.update(dt, t);
  menu.show(ui, shotMode);
  settingsPanel.show(ui);
  tour.update(ui && !pinnedPose, tilt.x, tilt.y, nav.at === AT_HOME);
  menu.tilt(tilt.x, tilt.y);
  // at a station (or flying to one) the side words step back so the racks stay reachable
  menu.update(dt, cursorX01, !pinnedPose && nav.at !== AT_HOME);
  if (!draw) return;
  updateShadows(t);
  if (painter) {
    // cheaper paint while the camera travels (?motion=1 pins it on, to compare in screenshots)
    painter.setMotion?.(params.get('motion') === '1' || ((nav.intro || nav.phase === 'fly') && !pinnedPose));
    // painted cinema bars while the intro plays; a skip wipes them off with the flight home
    painter.setBars?.(pinnedPose ? 0 : nav.intro ? introBars(t) : nav.phase === 'fly' && !nav.introDone ? Math.min(barsK, Math.max(0, 1 - nav.progress / 0.6)) : 0);
    barsK = painter.bars ?? 0;
    const il = introLight.update({ cine: barsK, door: nav.doorOpen(t), camZ: c.pos.z, sunE: sunNow.e });
    painter.setGrade?.(il.grade, il.vignette);
    painter.render(scene, camera, t, suitcase.overlay);
  } else { renderer.render(scene, camera); renderOverlay(renderer, suitcase.overlay); }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  painter?.setSize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---- frame pacing (see pacer.js): full rate only while something moves ----
let pacer = null;
const camWas = new THREE.Matrix4();
function watchCamera() {
  // the camera still easing (cursor tilt, hover orbit, zoom) counts as movement
  const a = camera.matrixWorld.elements, b = camWas.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-5) { pacer?.kick(); break; }
  camWas.copy(camera.matrixWorld);
}
for (const ev of ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup']) addEventListener(ev, () => pacer?.kick(), { passive: true, capture: true });
document.addEventListener('pointerleave', () => pacer?.kick());
for (const k of ['paint', 'covers', 'fps', 'maxFps']) settings.on(k, () => pacer?.kick());
// back on screen, or the GPU context was lost and restored: paint the whole frame, whatever the painter remembers
document.addEventListener('visibilitychange', () => painter?.invalidate());
renderer.domElement.addEventListener('webglcontextrestored', () => { painter?.invalidate(); renderer.shadowMap.needsUpdate = true; restoreCovers(); });

// Deterministic time for screenshots: ?shot, then window.__seek(seconds).
// brush strokes get placed from every spot the camera visits (nothing in the old looks pays for this)
painter?.bakeStrokes(scene, paintViews(HOME, STATIONS));

if (shotMode) {
  // let shelves, covers and fonts arrive, then settle all animation (big dt) before the frame is captured
  const waitFor = async (cond, ms) => { const t0 = performance.now(); while (!cond() && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50)); };
  window.__seek = async (t) => {
    await waitFor(() => shelvesLoaded, 20000);
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all([suitcase.ready(), menu.ready(), ...racks.map((r) => r?.ready())]);
    menu.relayout();
    frame(t, 10);
    await new Promise((r) => setTimeout(r, 100)); // tag and sign textures are drawn a tick later
    await Promise.all(racks.map((r) => r?.ready()));
    frame(t, 10);
    // ?at=0&hover=4&pick=0.5: click the held-up record, then freeze the vinyl's flight into the suitcase at that fraction
    if (params.has('pick')) {
      if (!pickDone) {
        pickDone = true;
        racks[hoverOn]?.click();
        for (let k = 0; k < 600 && !suitcase.flying; k++) frame(t, 0.02, false); // let the slide-out play, no drawing
        await new Promise((r) => setTimeout(r, 100));
      }
      suitcase.freezeFlight(Number(params.get('pick')));
      frame(t, 0.0001);
    }
    // ?open=k: press album record k on the rack you are at (the album spread), then ?spreadpage=p turns
    // to page p and ?spreadhover=j holds record j up (0 = play all); ?spreadt=0.4 freezes the flight out
    if (params.has('open') && !spread.loaded) {
      const rack = racks[hoverOn >= 0 ? hoverOn : nav.at];
      const s = rack?.core.sleeves[Number(params.get('open'))];
      if (s) {
        spread.open(s.item, s.mesh);
        await waitFor(() => spread.loaded, 5000);
        if (params.has('spreadpage')) spread.turnPage(Number(params.get('spreadpage')));
        if (params.has('spreadhover')) spread.forceHover = Number(params.get('spreadhover'));
        const ft = params.has('spreadt') ? Number(params.get('spreadt')) : null;
        for (let k = 0; k < 400; k++) {
          frame(t, 0.02, false);
          if (ft !== null && spread.state.recs.every((r) => !r.out || r.t >= ft || r.delay > 0)) break;
        }
        if (ft !== null) for (const r of spread.state.recs) if (r.out) { r.t = ft; r.delay = 0; }
        frame(t, 0.0001);
        await new Promise((r) => setTimeout(r, 120));
        await Promise.all(racks.map((r) => r?.ready()));
        frame(t, 0.0001);
      }
    }
    // ?tray=0.6: a search pick, frozen 0.6 s into the drawer (after the hand-off, the record's flight too)
    if (params.has('tray') && !trayDone) {
      trayDone = true;
      const { shelves } = await music.shelves();
      const item = shelves[0].items[1];
      const cover = getCover(item.art, 512);
      await cover.loaded;
      suitcase.dispense(cover.tex);
      const at = Number(params.get('tray'));
      suitcase.tray.seek(at);
      if (at > suitcase.tray.handAt) suitcase.freezeFlight(Math.min(0.999, (at - suitcase.tray.handAt) / suitcase.flightDuration));
      for (let i = 0; i < 30; i++) frame(t, 0.05);   // the case rises to make room for the drawer (frozen meanwhile)
      frame(t, 0.0001);
    }
    return true;
  };
  window.__ready = true;
} else {
  // Compile the whole scene (hidden parts too) and the suitcase overlay in the background first, and
  // only then start the clock, so the intro never stops for a shader. Capped at 4 s just in case.
  const warmed = Promise.all([
    warmUp(renderer, scene, camera, scene, painter?.target ?? null),
    warmUp(renderer, suitcase.overlay.scene, suitcase.overlay.camera, suitcase.overlay.scene, painter?.target ?? null, { draw: true }),
  ]);
  Promise.race([warmed, new Promise((r) => setTimeout(r, 4000))]).catch(() => {}).then(() => {
    const start = performance.now() - (Number(params.get('t')) || 0) * 1000;
    pacer = createPacer({
      renderer,
      step: (now) => { tickFps(); frame((now - start) / 1000); watchCamera(); },
      busy: () => nav.intro || !nav.settled || spread.busy || suitcase.flying || suitcase.tray.active || suitcase.over || suitcase.suitcase.lidMoving,
      // a spinning record on screen wants a smooth turn; otherwise only lanterns and the boil move (Brush strokes: only the ragged border boils; the older looks: all of it)
      idleFps: () => (player?.playerState === 1 && suitcase.tucked < 0.5 ? 30 : 12),
    });
    pacer.start();
  });
}
