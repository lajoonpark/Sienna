// The small window (mini.html): the same suitcase on a torn-paper watercolour card, summoned with
// Ctrl+Alt+Space anywhere. The lid is flicked open by the physical hinge (lid.js). Esc, a click on
// the margin, clicking outside the window (main process sends close) or the shortcut again shuts
// the lid, then the window is hidden. In a plain browser it previews on a fake desktop with the
// fake record store; ?shot + window.__seek(t) make deterministic frames (t = seconds since the
// lid was released). Option+Cmd+S (Ctrl+Alt+S) searches; a pick slides out of the case's bottom drawer
// (suitcase/tray.js). Closing the window before the record is down starts the song at once.
//   shot times: seconds since the lid was released; -1 = the lid still shut
//   ?p=0.3  how far through the song     ?hover=playPause|knob|record|next|previous|like
//   ?liked  show the song liked          ?paused  show it paused         ?idle  nothing playing
//   ?tray=0.5  a search pick, 0.5 s after it was pressed (drawer out, record lifting or flying)
import * as THREE from 'three';
import './fonts.js';
import { WATERCOLOUR } from './style.js';
import { createWatercolour } from './watercolour.js';
import { createMusic } from './music.js';
import { createSuitcase, startSong } from './suitcase.js';
import { createCaption } from './controls.js';
import { fitCamera } from './suitcase/fit.js';
import { brushBackdrop } from './suitcase/paint.js';
import { createFlights } from './suitcase/flight.js';
import { createRecordTray } from './suitcase/tray.js';
import { createSearch } from './search.js';
import { getCover } from './racks/common.js';
import { paintedCoverURL } from './coverpaint.js';
import { maxFps } from './pacer.js';
import { settings } from './settings.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const bridge = window.siennaMini;            // only inside Electron (electron/mini-preload.cjs)
// Settings > Lettering changed (in the shop window): repaint everything in the new font
settings.on('font', () => (bridge?.reload ? bridge.reload() : location.reload()));   // Electron blocks the page's own reload
const W = 540, H = 620;
document.body.classList.toggle('preview', !bridge);
document.documentElement.style.setProperty('--w', `${W}px`);
document.documentElement.style.setProperty('--h', `${H}px`);
const stage = document.getElementById('stage');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
const size = () => ({ w: stage.clientWidth || W, h: stage.clientHeight || H });
renderer.setSize(size().w, size().h);
stage.appendChild(renderer.domElement);
const painter = WATERCOLOUR ? createWatercolour(renderer, { card: true }) : null;

const music = createMusic();
const suitcase = createSuitcase({ music });
const scene = new THREE.Scene();
scene.background = brushBackdrop(W, H);
scene.add(suitcase.root);

const camera = new THREE.PerspectiveCamera(30, size().w / size().h, 1, 120);
function frameCamera() {
  camera.aspect = size().w / size().h;
  camera.updateProjectionMatrix();
  const el = 0.7, yaw = -0.34;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
  fitCamera({ camera, object: suitcase.root, points: suitcase.fitPoints(), dir, target: new THREE.Vector3(0, 1.6, 0), rect: { x0: -0.8, x1: 0.8, y0: -0.5, y1: 0.8 } });
}
frameCamera();

const caption = createCaption({ parent: stage, variant: 'mini', onSeek: (s) => music.command('seek', s) });

// ---- search (Option+Cmd+S, as in the shop): a pick slides out of the drawer and flies onto the platter ----
// Flights live in camera space (a group riding on the camera); the drawer is part of the case.
scene.add(camera);
const hud = new THREE.Group();
camera.add(hud);
const flights = createFlights({ scene: hud, suitcase, camera, view: camera, worldCase: true });
const tray = createRecordTray({ suitcase, kit: suitcase.recordKit, onDisc: (d) => flights.receive(d) });
// The empty box shows the Listen again shelf (only here, not in the shop: Lajoon). It is fetched and its
// covers painted while the window is still hidden, so the slips are there the moment search opens. An old
// copy is never waited for: it shows at once while a fresh one comes in for next time (at most every 5 min).
const LISTEN_AGAIN_MAX_AGE = 300000;
let listenAgain = null;     // { title, items } of the last good answer
let listenAgainAt = -Infinity;
let listenAgainBusy = null; // the fetch under way; never rejects, resolves to listenAgain
async function paintAhead(items) {   // one at a time: a lid opening meanwhile keeps its frames
  for (const item of items) if (item.art) await paintedCoverURL(item.art);
}
function refreshListenAgain() {
  if (listenAgainBusy || performance.now() - listenAgainAt < LISTEN_AGAIN_MAX_AGE) return listenAgainBusy;
  listenAgainBusy = music.shelves().then(({ shelves }) => {
    const sh = shelves.find((x) => /listen again/i.test(x.title)) ?? shelves[0];
    if (!sh) return;
    listenAgainAt = performance.now();
    listenAgain = { title: sh.title, items: sh.items };
    paintAhead(sh.items);
  }).catch((e) => console.warn('[sienna] Listen again failed', e))   // tried again at the next summon or search
    .then(() => { listenAgainBusy = null; return listenAgain; });
  return listenAgainBusy;
}
refreshListenAgain();
// the guest shelf is no use after signing in
music.onSignedIn?.(() => Promise.resolve(listenAgainBusy).then(() => { listenAgainAt = -Infinity; refreshListenAgain(); }));
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
  if (shot) {                                  // frozen for screenshots
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
  suitcase.open();                              // from wherever it is: a summon while closing carries the lid back over the top
}
// Closed before a picked record is down: nothing is drawn while the window is hidden, so the drawer, the
// flight and the arm would stall and the song never start. Put the record straight on and start it now.
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
function stepFrame(dt) {
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
const draw = (t) => (painter ? painter.render(scene, camera, t) : renderer.render(scene, camera));
let lastT = 0;
function loop(ms) {
  if (ms - lastT < 1000 / maxFps() - 2) return;   // Settings > Smoothness, also on a 120 Hz screen
  const dt = Math.min(0.1, (ms - lastT) / 1000);
  lastT = ms;
  stepFrame(dt);
  draw(ms / 1000);
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
  suitcase.lean(ndc.x, -ndc.y);
  if (suitcase.dragging) suitcase.pointerDrag(ndc, camera);
  else suitcase.hover(ndc, camera);
  renderer.domElement.style.cursor = suitcase.cursor();
});
document.addEventListener('pointerleave', () => { suitcase.hover(null); suitcase.lean(0, 0); });
addEventListener('pointerdown', (e) => {
  if (e.target.closest?.('.cad-tag, .cs')) return;   // the caption and the search bar handle their own clicks
  toNdc(e);
  if (!suitcase.pointerDown(ndc, camera) && (Math.abs(ndc.x) > 0.93 || Math.abs(ndc.y) > 0.93)) dismiss();   // the margin round the card
});
addEventListener('pointerup', () => { suitcase.pointerUp(); renderer.domElement.style.cursor = suitcase.cursor(); });
addEventListener('blur', () => suitcase.pointerUp());
addEventListener('wheel', (e) => {
  if (search.isOpen()) return;   // the wheel scrolls the search slips, never the volume
  e.preventDefault(); suitcase.wheel(e.deltaY, e.deltaMode);
}, { passive: false });

// ---- keys: Esc shuts it; Space, arrows, L as in the shop ----
addEventListener('keydown', (e) => {
  if (search.isOpen()) return;   // keys belong to the search bar (it closes itself on Esc)
  const cmd = { ' ': 'toggle', ArrowRight: 'next', ArrowLeft: 'previous', l: 'like', L: 'like' }[e.key];
  if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
  else if (cmd) { e.preventDefault(); music.command(cmd); }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); suitcase.nudgeVolume(e.key === 'ArrowUp' ? 0.05 : -0.05); }
});

// ---- screenshots and browser preview ----
if (shot) {
  window.__seek = async (t) => {
    await Promise.all([suitcase.ready(), caption.ready()]);
    while (!lastState?.title && !params.has('idle')) await new Promise((r) => setTimeout(r, 100));   // the fake store starts
    await new Promise((r) => setTimeout(r, 300));
    suitcase.close({ instant: true });
    phase = 'open';
    for (let i = 0; i < 90; i++) suitcase.update(1 / 30);   // let the arm, spin and knob settle with the lid still shut
    appear = t < 0 ? 1 : 0;                                  // t < 0: the card with the lid still shut, just before the flick
    if (t >= 0) suitcase.open();
    for (let x = 0; x < t - 1e-9;) { const dt = Math.min(1 / 60, t - x); stepFrame(dt); x += dt; }
    // ?tray=0.5: a search pick 0.5 s after it was pressed (drawer, then the record's flight)
    if (params.has('tray')) {
      const at = Number(params.get('tray'));
      const item = (await music.shelves()).shelves[0].items[0];
      const cover = getCover(item.art, 512);
      await cover.loaded;
      tray.run(cover.tex);
      for (let x = 0; x < at - 1e-9;) { const dt = Math.min(1 / 60, at - x); stepFrame(dt); x += dt; }
    }
    applyAppear();
    draw(t);
    await new Promise((r) => setTimeout(r, 100));
    draw(t);
    return true;
  };
  window.__ready = true;
} else if (!bridge) {
  summon();                                      // plain browser: open straight away
  addEventListener('keydown', (e) => { if (e.key === 'o') summon(); });
}
// where a control is on the page (client coordinates), for tests that drive the pointer
const screenOf = (name, dx = 0, dz = 0) => {
  const hit = suitcase.parts.hits.find((h) => h.control === name).mesh;
  suitcase.root.updateWorldMatrix(true, true);
  const v = new THREE.Vector3(dx, 0, dz).add(hit.position).applyMatrix4(hit.parent.matrixWorld).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
};
window.__mini = { suitcase, music, summon, dismiss, screenOf, step: stepFrame, tray, flights, get phase() { return phase; }, get appear() { return appear; } };
