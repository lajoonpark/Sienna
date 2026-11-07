// Shared building blocks for the record racks (src/racks/*.js).
//
// ---------------------------------------------------------------------------------------------
// API (short version; every rack module is `create<Style>Rack({ onPick }) -> contract`, see SPEC)
//
//   getCover(url, size = 256) -> { tex, loaded: Promise, color }   URL-keyed cache. 256 px for
//        resting sleeves, 512 px for the hovered one (LRU of 32). Videos' 16:9 thumbs are cropped to
//        the middle square. `color` = average cover colour once loaded (null before).
//   new Sleeve(item, index, { size = 0.31, thick = 0.014 })       sleeve mesh + vinyl disc.
//        .mesh (add it to your root; origin = centre of the sleeve, cover faces +z, top edge +y),
//        .disc (child group, the vinyl, slides out of the top), .lift/.peek/.bump/.appear (0..1,
//        smoothed for you), .empty (vinyl is in the suitcase), .big (512 px cover texture).
//        Pose it yourself every frame: mesh.position / mesh.rotation. Use s.drop for the drop-in.
//   createRackCore({ onPick, sign, tag, maxItems }) -> core        does everything the contract
//        needs except the furniture and the layout: core.root, core.sleeves, core.sign, core.tag,
//        core.picker, core.hovered. Finish with core.contract({ setup?, items, layout, pick? }):
//          items(core, items)            sleeves exist (added to core.root, hidden until `appear`
//                                        passes 0); place the rest-pose and fill core.picker.
//          layout(core, dt, camera, hovered)   every frame: pose each sleeve from s.lift etc.
//          pick?(core, pointer, camera)  override the hit test (default: core.picker boxes).
//        Returns the full contract (setShelf, update, click, hovered, forceHover, setPlaying,
//        ready, root). The vinyl pick animation and "vinyl goes back" are handled here.
//   rack.refreshArt(item)  (in every contract) the item's art changed after setShelf (a repaired
//        playlist cover): sleeves showing it (same object or same play.playlistId / videoId) get the
//        new 256 px cover (and 512 px if lifted) and spine colour in place. No re-drop, no re-layout.
//   createPicker() -> { clear(), add(i, restMatrix, halfSize, pad), pick(pointer, camera, root) }
//        generic hit test on REST-pose boxes in the rack root's local space (no scale in matrix),
//        so a sleeve lifting out never changes what is under the cursor. Nearest box wins.
//   createSign({ w, h, color, res }) -> { mesh, setTitle(t), ready }   shelf title as paper letters in an
//        indigo brush stroke. `ready` resolves when the current title is painted.
//   createTag({ w, h }) -> { mesh, show(item), hide(), ready }   paper name tag (crisp).
//   addBox(parent, [w,h,d], mat, [x,y,z], [rx,ry,rz]) -> Mesh     painted block, casts/receives.
//   instancedBoxes([{p,s,r,c}]) -> InstancedMesh  many filler blocks in one draw call.
//   s.hidden = true hides a sleeve (paged racks). picker ids >= 1000 are rack controls: core.control
//        holds the hovered one and def.control(core, id) runs on click.
//   core.camLocal  the camera in the root's space (valid inside layout()).
//   WOOD  shared toon wood materials (dark, top, light, pale, paint colours via paint(hex)).
//   fontReady  Promise (brush font loaded).  smooth(rate, dt), easeOut(t), clamp01.
// ---------------------------------------------------------------------------------------------
import * as THREE from 'three';
import { paintCover, coverSeed } from '../coverpaint.js';
import { settings } from '../settings.js';
import { chooseDiscDir } from './clear.js';
import { uploadSoon } from '../warmup.js';
import { paintOffThread } from '../coverworker.js';
import { toon, crisp } from '../materials.js';
import { rng } from '../rand.js';
import { brushStroke, INK, PAPER } from '../controls.js';
import { FONT } from '../style.js';

export const MAX_ITEMS = 24;
export const SLEEVE = 0.31;
export const THICK = 0.014;
export const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
// A spring toward `target` on obj[key] (velocity kept in obj[key + 'V']): soft start, no first-frame
// jump. z < 1 overshoots a little (lively), z = 1 settles without overshoot. `floor` clamps the low end
// (a record must never sink into its slot). Sub-stepped so it stays stable at low frame rates.
export function springTo(obj, key, target, dt, w, z = 1, floor = -Infinity) {
  const vk = key + 'V';
  let x = obj[key] ?? 0, v = obj[vk] ?? 0;
  const h = Math.min(dt, 1 / 30), n = Math.max(1, Math.ceil(h * 120));
  for (let i = 0; i < n; i++) {
    const st = h / n;
    v += (w * w * (target - x) - 2 * z * w * v) * st;
    x += v * st;
  }
  if (dt > 1 / 30) x += (target - x) * (1 - Math.exp(-14 * (dt - 1 / 30))); // a big hitch: catch up
  if (x < floor) { x = floor; v = Math.max(0, v); }
  obj[key] = x; obj[vk] = v;
  return x;
}
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const fontReady = (typeof document !== 'undefined' && document.fonts?.load(`64px ${FONT}`).catch(() => {})) || Promise.resolve();

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// ---- covers -----------------------------------------------------------------------------------

const covers = new Map();   // `${size}|${url}` -> entry
const bigOrder = [];        // keys of 512 px entries, oldest first (LRU)
const BIG_KEEP = 32;
const [avgC, avgG] = typeof document !== 'undefined' ? canvas(8, 8) : [];

// Spine colour from the cover: the average, deepened a little so the row reads as a painted band.
function averageColor(img) {
  avgG.drawImage(img, 0, 0, 8, 8);
  const d = avgG.getImageData(0, 0, 8, 8).data;
  let R = 0, G = 0, B = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color(`rgb(${Math.round(R / n)},${Math.round(G / n)},${Math.round(B / n)})`).offsetHSL(0, 0.08, -0.04);
}

// ---- cover painting, a few per frame ----
const PAINT_BUDGET = 4; // ms per frame
const paintQueue = [];
let paintPumping = false;
function paintSoon(fn) {
  paintQueue.push(fn);
  if (!paintPumping) { paintPumping = true; requestAnimationFrame(paintPump); }
}
function paintPump() {
  const t0 = performance.now();
  while (paintQueue.length) {
    paintQueue.shift()();
    if (performance.now() - t0 > PAINT_BUDGET) break;
  }
  if (paintQueue.length) requestAnimationFrame(paintPump); else paintPumping = false;
}
// main.js hands over the renderer, so freshly painted covers are uploaded ahead of time (warmup.js)
let coverUploader = null;
export function setCoverUploader(renderer) { coverUploader = renderer; }

// Square cover texture from any thumbnail. Cached by URL and size; textures are shared by every
// sleeve that shows the same art, so never dispose them yourself.
export function getCover(url, size = 256) {
  const key = `${size}|${url || ''}`;
  let e = covers.get(key);
  if (e) {
    if (size > 256) { bigOrder.splice(bigOrder.indexOf(key), 1); bigOrder.push(key); }
    return e;
  }
  const [c, g] = canvas(size, size);
  g.fillStyle = '#d9cbb2';
  g.fillRect(0, 0, size, size);
  if (!url) { // no art: a blank paper sleeve with a pencilled circle
    g.strokeStyle = 'rgba(120,90,60,.35)';
    g.lineWidth = size / 40;
    g.beginPath(); g.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = size > 256 ? 8 : 4;
  e = { tex, color: null, loaded: Promise.resolve() };
  covers.set(key, e);
  if (size > 256) {
    bigOrder.push(key);
    while (bigOrder.length > BIG_KEEP) {
      const old = bigOrder.shift();
      covers.get(old)?.tex.dispose();
      covers.delete(old);
    }
  }
  if (url) {
    // (again when Settings > Cover art changes: every cover already made is repainted in place)
    e.repaint = () => (e.loaded = paintOffThread(url, size).then((done) => {
      if (!done) return paintHere(url, size, g, tex, e); // no worker, or it could not fetch the picture
      g.clearRect(0, 0, size, size);
      g.drawImage(done.bitmap, 0, 0);
      done.bitmap.close();
      tex.needsUpdate = true;
      if (coverUploader) uploadSoon(coverUploader, tex); // on the GPU before a rack first shows it
      if (done.color) e.color = new THREE.Color(`rgb(${done.color.join(',')})`).offsetHSL(0, 0.08, -0.04);
    }));
    e.repaint();
  }
  return e;
}
settings.on('covers', () => { for (const e of covers.values()) e.repaint?.(); });

// the old way: an <img>, painted on the main thread a few per frame
function paintHere(url, size, g, tex, e) {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try { await img.decode(); } catch { /* decoded on draw instead */ } // off the main thread
      // painting a cover is a few ms of canvas work, and a shelf's worth arrives at once (often
      // during the intro push-in), so they are painted in small slices, a few per frame
      paintSoon(() => {
        const s = Math.min(img.width, img.height);
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        paintCover(g, size, coverSeed(url));
        tex.needsUpdate = true;
        if (coverUploader) uploadSoon(coverUploader, tex); // on the GPU before a rack first shows it
        if (size <= 256) { try { e.color = averageColor(img); } catch { /* tainted canvas: keep the default spine */ } }
        res();
      });
    };
    img.onerror = res;
    img.src = url;
  });
}

// ---- big covers, ahead of time ----
// Hovering a sleeve swaps in its 512 px cover. Made on the spot, that is a download, a painted
// canvas and a texture upload in the very frame the record lifts and the camera starts to turn, so
// the racks you are heading to get theirs made in idle time, one per idle slot, and uploaded early.
const warmQueue = [];
let warmBusy = false;
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 30));
function pumpWarm() {
  if (warmBusy || !warmQueue.length) return;
  warmBusy = true;
  idle(() => {
    const { art, upload } = warmQueue.shift();
    const e = getCover(art, 512);
    e.loaded.then(() => { upload?.(e.tex); }).finally(() => { warmBusy = false; pumpWarm(); });
  });
}
export function prewarmCovers(arts, upload) {
  const fresh = arts.filter((a) => a && !covers.has(`512|${a}`) && !warmQueue.some((q) => q.art === a));
  warmQueue.push(...fresh.slice(0, BIG_KEEP).map((art) => ({ art, upload })));
  pumpWarm();
}

// ---- vinyl --------------------------------------------------------------------------------------

let vinyl = null;
function vinylParts() {
  if (vinyl) return vinyl;
  // faint grooves and one soft sheen, so the disc reads as vinyl and not a black coin
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#25212a';
  g.fillRect(0, 0, 256, 256);
  for (let r = 40; r < 126; r += 3.2) {
    g.strokeStyle = `rgba(255,240,220,${0.03 + ((r * 7) % 5) * 0.012})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke();
  }
  const sheen = g.createLinearGradient(40, 40, 216, 216);
  sheen.addColorStop(0.35, 'rgba(255,245,230,0)');
  sheen.addColorStop(0.5, 'rgba(255,245,230,.16)');
  sheen.addColorStop(0.65, 'rgba(255,245,230,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.CylinderGeometry(0.145, 0.145, 0.004, 40);
  geo.rotateX(Math.PI / 2);
  const labelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.005, 24);
  labelGeo.rotateX(Math.PI / 2);
  vinyl = { geo, labelGeo, mat: toon('#ffffff', { map: tex }) };
  return vinyl;
}

const geoCache = new Map();
const sleeveGeo = (size, thick) => {
  const k = `${size}|${thick}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(size, size, thick));
  return geoCache.get(k);
};

// How far the vinyl slides out (in a 0.31 m sleeve) to be picked: completely clear. It stays inside
// while hovered; it only shows when it is picked (out to the suitcase) or comes back.
const DISC_OUT = 0.31;
// lift spring: angular frequency (1/s) and damping. Critically damped both ways: any overshoot carries
// the record past its hover pose along the curve, into the spinner post (scripts/pass-check.mjs)
const LIFT_W = 19, LIFT_Z = 1, LIFT_W_DOWN = 21;

export class Sleeve {
  constructor(item, index, { size = SLEEVE, thick = THICK, seed = index } = {}) {
    this.item = item;
    this.index = index;
    this.size = size;
    this.thick = thick;
    this.seed = seed;
    this.fit = 0; this.fitTo = 0; this.pullX = 0; this.pullY = 0; this.lift = 0; this.liftV = 0; this.liftRate = 1; this.peek = 0; this.bump = 0; this.appear = 0; this.drop = 1;
    this.empty = false;      // the vinyl is away (playing / being picked)
    this.hot = false;
    this.art = item.art;
    const small = getCover(item.art, 256);
    this.small = small;
    this.big = null;
    this.spineMat = toon(small.color ?? new THREE.Color().setHSL(rng(seed * 7 + 3)(), 0.3, 0.5));
    if (!small.color) small.loaded.then(() => { if (small.color) this.spineMat.color.copy(small.color); });
    this.coverMat = crisp({ map: small.tex });
    // box faces: +x, -x, +y, -y (spine colour), +z (cover), -z (back: shows the art too, because
    // some racks are seen from behind)
    this.mesh = new THREE.Mesh(sleeveGeo(size, thick), [this.spineMat, this.spineMat, this.spineMat, this.spineMat, this.coverMat, this.coverMat]);
    this.mesh.castShadow = true;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.visible = false;
    const v = vinylParts();
    this.disc = new THREE.Group();
    this.disc.add(new THREE.Mesh(v.geo, v.mat), new THREE.Mesh(v.labelGeo, this.spineMat));
    this.disc.scale.setScalar(size / SLEEVE);
    this.disc.visible = false;
    this.mesh.add(this.disc);
    this.discY = 0;          // current slide, in sleeve units of 0.31
    // which way it slides, in the sleeve's x/y plane: up out of the top unless that would pass through
    // the rack or another record (clear.js; chosen by the core on the click)
    this.discDir = new THREE.Vector2(0, 1);
    this.discDirNow = new THREE.Vector2(0, 1);
    this.picking = false;
    this.onGone = null;
  }

  // The hovered sleeve shows the 512 px cover (swapped in as soon as it has loaded).
  setHot(on) {
    if (on === this.hot) return;
    this.hot = on;
    const use = (t) => { this.coverMat.map = t; this.coverMat.emissiveMap = t; };
    if (on) {
      this.big = getCover(this.art, 512);
      if (this.art) this.big.loaded.then(() => { if (this.hot) use(this.big.tex); });
      else use(this.big.tex);
    } else use(this.small.tex);
  }

  // 512 px cover for the record label of the flying disc.
  bigCover() { return (this.big ??= getCover(this.art, 512)).tex; }

  // The item's art changed after the sleeve was made (a repaired playlist cover): swap the cover
  // textures and the spine colour in place, nothing else moves.
  refreshArt(art) {
    if (art === this.art) return;
    this.art = art;
    this.small = getCover(art, 256);
    const upd = () => { if (this.small.color) this.spineMat.color.copy(this.small.color); };
    if (this.small.color) upd(); else this.small.loaded.then(upd);
    if (this.big) this.big = getCover(art, 512);
    // the 512 px one swaps in once loaded; the 256 px one is shown meanwhile
    this.coverMat.map = this.coverMat.emissiveMap = this.small.tex;
    if (this.hot && this.big) this.big.loaded.then(() => { if (this.hot && this.art === art) this.coverMat.map = this.coverMat.emissiveMap = this.big.tex; });
  }

  // The vinyl is gone (in the suitcase), instantly or sliding back in.
  setEmpty(on) {
    if (on === this.empty) return;
    this.empty = on;
    if (on) { this.discY = 0; this.disc.visible = false; }
    else { this.discY = DISC_OUT; this.disc.visible = true; this.picking = false; } // slides back in
  }

  // Click: the vinyl slides fully out, then is hidden and `done(discInfo)` is called.
  startPick(done) {
    if (this.picking || this.empty) return false;
    this.picking = true;
    this.onGone = done;
    this.disc.visible = true;
    return true;
  }

  step(dt, hovered) {
    this.appear = Math.min(1, this.appear + dt * 2.4);
    this.drop = 1 - easeOut(this.appear);
    // lift is a spring, not an exponential chase: it starts soft (no jump on the first frame), gets
    // there about as fast, and lands softly, with no overshoot. Down is a touch quicker
    // and clamped at 0 so a record never sinks into its slot.
    springTo(this, 'lift', hovered ? 1 : 0, dt, (hovered ? LIFT_W : LIFT_W_DOWN) * this.liftRate, hovered ? LIFT_Z : 1, 0);
    this.peek += ((this.empty ? 1 : 0) - this.peek) * smooth(10, dt);
    this.bump = Math.max(0, this.bump - dt * 3);
    if (!this.hot && hovered) this.setHot(true);
    else if (this.hot && !hovered && this.lift < 0.02) this.setHot(false);
    if (this.empty && !this.picking) return;
    const target = this.picking ? DISC_OUT : 0;
    this.discY += (target - this.discY) * smooth(this.picking ? 22 : 12, dt);
    this.discDirNow.lerp(this.discDir, smooth(this.picking ? 20 : 12, dt)).normalize();
    this.disc.position.set(this.discDirNow.x, this.discDirNow.y, 0).multiplyScalar(this.discY * (this.size / SLEEVE));
    this.disc.visible = this.discY > 0.004;
    if (this.picking && this.discY > DISC_OUT - 0.012) {
      // clear of the sleeve: report its world pose and hide it, the suitcase takes over
      this.picking = false;
      this.empty = true;
      this.discY = DISC_OUT;
      this.discDirNow.copy(this.discDir);
      this.disc.position.set(this.discDir.x, this.discDir.y, 0).multiplyScalar(DISC_OUT * (this.size / SLEEVE));
      this.disc.updateWorldMatrix(true, false);
      const info = { matrixWorld: this.disc.matrixWorld.clone(), cover: this.bigCover() };
      this.disc.visible = false;
      const cb = this.onGone;
      this.onGone = null;
      cb?.(info);
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.spineMat.dispose();
    this.coverMat.dispose();
  }
}

// ---- picking ----------------------------------------------------------------------------------

const _v = new THREE.Vector3(), _box = new THREE.Box3(), _ray = new THREE.Ray(), _inv = new THREE.Matrix4(), _hit = new THREE.Vector3();

export function createPicker() {
  const boxes = [];
  const local = new THREE.Ray();
  const caster = new THREE.Raycaster();
  return {
    clear() { boxes.length = 0; },
    // restMatrix: the box centre and orientation in the rack ROOT's space; halfSize: [x, y, z]
    add(i, restMatrix, halfSize, pad = 0) {
      const m = restMatrix.isObject3D ? (restMatrix.updateMatrix(), restMatrix.matrix) : restMatrix;
      boxes.push({ i, inv: new THREE.Matrix4().copy(m).invert(), half: new THREE.Vector3(...halfSize).addScalar(pad) });
    },
    pick(pointer, camera, root) {
      if (!pointer || !boxes.length) return -1;
      caster.setFromCamera(pointer, camera);
      root.updateWorldMatrix(true, false);
      _inv.copy(root.matrixWorld).invert();
      local.copy(caster.ray).applyMatrix4(_inv);
      let best = -1, bestD = Infinity;
      for (const b of boxes) {
        _ray.copy(local).applyMatrix4(b.inv);
        _box.min.copy(b.half).negate();
        _box.max.copy(b.half);
        if (!_ray.intersectBox(_box, _hit)) continue;
        const d = _v.copy(_hit).sub(_ray.origin).lengthSq();
        if (d < bestD) { bestD = d; best = b.i; }
      }
      return best;
    },
  };
}

// ---- painted wood -----------------------------------------------------------------------------

export const WOOD = {
  dark: toon('#8a5a32'),
  top: toon('#a8743a'),
  light: toon('#b98a52'),
  pale: toon('#d2a672'),
  deep: toon('#5a3d24'),
  iron: toon('#2b2a2e'),
};
const paints = new Map();
export function paint(hex) {
  if (!paints.has(hex)) paints.set(hex, toon(hex));
  return paints.get(hex);
}

// Many small painted blocks as ONE draw call (filler records, slats...). list: [{ p:[x,y,z],
// s:[w,h,d], r:[rx,ry,rz], c:'#hex' }]. Colour comes per instance; the material is shared.
let instMat = null;
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const _im = new THREE.Matrix4(), _iq = new THREE.Quaternion(), _ie = new THREE.Euler(), _ic = new THREE.Color();
export function instancedBoxes(list) {
  instMat ??= toon('#ffffff');
  const mesh = new THREE.InstancedMesh(unitBox, instMat, Math.max(1, list.length));
  list.forEach((b, i) => {
    _ie.set(...(b.r ?? [0, 0, 0]));
    _im.compose(new THREE.Vector3(...b.p), _iq.setFromEuler(_ie), new THREE.Vector3(...b.s));
    mesh.setMatrixAt(i, _im);
    mesh.setColorAt(i, _ic.set(b.c));
  });
  mesh.count = list.length;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

const boxGeos = new Map();
export function addBox(parent, [w, h, d], mat, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
  const k = `${w}|${h}|${d}`;
  if (!boxGeos.has(k)) boxGeos.set(k, new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(boxGeos.get(k), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---- sign and tag -----------------------------------------------------------------------------

// The shelf title, painted like the buttons: paper letters left in an indigo brush stroke.
export function createSign({ w = 1.2, h = 0.15, color = INK, res = 1024 } = {}) {
  const CW = res, CH = Math.round(res * h / w);
  const [c, g] = canvas(CW, CH);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), crisp({ map: tex, alphaTest: 0.4 }));
  const sign = { mesh, ready: Promise.resolve(), title: '' };
  let seq = 0;
  sign.setTitle = (title) => {
    sign.title = title;
    const my = ++seq;
    sign.ready = fontReady.then(() => new Promise((res) => {
      if (my !== seq) return res();
      const fs = CH * 0.62;
      g.font = `${fs}px ${FONT}`;
      const pw = Math.min(CW * 0.9, g.measureText(title).width + CH * 1.3);
      const plate = new Image();
      plate.onload = () => {
        if (my === seq) {
          g.clearRect(0, 0, CW, CH);
          g.drawImage(plate, CW / 2 - pw / 2, CH * 0.03, pw, CH * 0.94);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = PAPER;
          g.font = `${fs}px ${FONT}`;
          g.fillText(title, CW / 2, CH * 0.52, pw - CH * 1.1);
          tex.needsUpdate = true;
        }
        res();
      };
      plate.onerror = res;
      plate.src = brushStroke(Math.round(pw / 2), Math.round(CH * 0.47), color, 5 + title.length);
    }));
  };
  return sign;
}

// A torn-paper tag: cream card with a ragged edge, title in ink, artist in sepia. A title too long for
// one line at a readable size wraps onto a second line (the card grows, see createTag) instead of
// shrinking to a smudge; only past two lines does it shrink, then end in an ellipsis.
const TAG_W = 640, TAG_H1 = 190, TAG_H2 = 262; // canvas px: card with one / two title lines
function ellipsize(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}
// title lines and their font size: one line if it fits at >= 66 px, else two balanced lines
// (wrap off: one line, shrinking to 48 px, then an ellipsis)
function tagTitle(g, title, maxW, wrap) {
  const fit = (lines, s) => { g.font = `${s}px ${FONT}`; return lines.every((l) => g.measureText(l).width <= maxW); };
  for (let s = 80; s >= (wrap ? 66 : 48); s -= 2) if (fit([title], s)) return { lines: [title], size: s };
  if (!wrap) { g.font = `48px ${FONT}`; return { lines: [ellipsize(g, title, maxW)], size: 48 }; }
  const words = title.split(/\s+/);
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    g.font = `60px ${FONT}`;
    const w = Math.max(g.measureText(a).width, g.measureText(b).width);
    if (!best || w < best.w) best = { w, lines: [a, b] };
  }
  const lines = best ? best.lines : [title];
  for (let s = 66; s >= 48; s -= 2) if (fit(lines, s)) return { lines, size: s };
  g.font = `48px ${FONT}`;
  return { lines: lines.map((l) => ellipsize(g, l, maxW)), size: 48 };
}
function drawTag(g, item, seed, wrap) {
  const r = rng(seed), w = TAG_W;
  g.clearRect(0, 0, TAG_W, TAG_H2);
  g.textBaseline = 'middle';
  const { lines, size } = tagTitle(g, item.title || '', w - 68, wrap);
  const h = lines.length > 1 ? TAG_H2 : TAG_H1;
  g.beginPath();
  const pad = 10;
  g.moveTo(pad, pad + r() * 6);
  for (let x = pad; x <= w - pad; x += 14) g.lineTo(x, pad + r() * 6);
  for (let y = pad; y <= h - pad; y += 14) g.lineTo(w - pad - r() * 6, y);
  for (let x = w - pad; x >= pad; x -= 14) g.lineTo(x, h - pad - r() * 6);
  for (let y = h - pad; y >= pad; y -= 14) g.lineTo(pad + r() * 6, y);
  g.closePath();
  g.fillStyle = '#f7efdd';
  g.fill();
  g.strokeStyle = 'rgba(120,90,60,.35)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#2b2436';
  g.font = `${size}px ${FONT}`;
  const lh = size * 1.02, top = lines.length > 1 ? 30 + lh / 2 : h * 0.4;
  lines.forEach((l, i) => g.fillText(l, 34, top + i * lh));
  g.fillStyle = '#7a5a40';
  let s = 48;
  const sub = item.subtitle || '';
  do { g.font = `${s}px ${FONT}`; s -= 2; } while (g.measureText(sub).width > w - 72 && s > 36);
  g.fillText(ellipsize(g, sub, w - 72), 36, h * (lines.length > 1 ? 0.8 : 0.76));
  return lines.length;
}

// w, h: the size of a one-line card (m); a two-line card grows downward, away from the record above it.
// wrap: false keeps one line (crates: the tag sits above its record, close to the camera anyway).
export function createTag({ w = 0.34, h = 0.1, wrap = true } = {}) {
  const [c, g] = canvas(TAG_W, wrap ? TAG_H2 : TAG_H1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const h2 = wrap ? h * TAG_H2 / TAG_H1 : h;
  const geo = new THREE.PlaneGeometry(w, h2).translate(0, -(h2 - h) / 2, 0);
  const mesh = new THREE.Mesh(geo, crisp({ map: tex, alphaTest: 0.4 }));
  mesh.visible = false;
  let seq = 0;
  const tag = { mesh, ready: Promise.resolve(), w, h, h2, lines: 1 };
  tag.show = (item, seed = 3) => {
    const my = ++seq;
    mesh.visible = true;
    tag.ready = fontReady.then(() => { if (my === seq) { tag.lines = drawTag(g, item, seed, wrap); tex.needsUpdate = true; } });
  };
  tag.hide = () => { seq++; mesh.visible = false; mesh.removeFromParent(); };
  return tag;
}

// ---- playing state ----------------------------------------------------------------------------

// Which sleeves are empty: the playing one, plus the one just picked until the player confirms
// (the player's state lags a moment behind the click).
function createPlayTracker() {
  let playing = null, pendingId = null, pendingUntil = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    set(id) { playing = id; if (id && id === pendingId) pendingId = null; },
    picked(item) { pendingId = item.play?.videoId ?? null; pendingUntil = now() + 4000; },
    isEmpty(item) {
      const id = item.play?.videoId;
      if (!id) return false;
      return id === playing || (id === pendingId && now() < pendingUntil);
    },
  };
}

// ---- rack core ----------------------------------------------------------------------------------

const _hc = new THREE.Raycaster(), _hb = new THREE.Box3(), _wp = new THREE.Vector3();
// The hovered sleeve, if it is well lifted and the cursor is over it as it is now.
function heldUnder(core, pointer, camera) {
  if (core.hovered < 0) return -1;
  _hc.setFromCamera(pointer, camera);
  const s = core.sleeves[core.hovered];
  if (!s || !s.mesh.visible || (s.held ?? s.lift) < 0.5) return -1;
  s.mesh.updateWorldMatrix(true, true);
  _hb.setFromObject(s.mesh);
  return _hc.ray.intersectBox(_hb, _wp) ? core.hovered : -1;
}

// A hovered record's name tag must stay readable, and the record must stay under the cursor (you should
// be able to press it without moving). A tag that would hang past the bottom of the window (the zoom
// pushes it further) sits above the record instead; that is decided once per hover, as the record comes
// up. The record may also rise a little, to bring its tag (or, with the tag above, its own bottom edge)
// inside the frame, but never so far that it leaves the cursor. It runs after layout(), so every rack
// gets it. Hover is picked from rest spots and the camera's pivot is fixed per record, so rising moves
// neither of them.
const TAG_FLOOR = -0.82, RECORD_FLOOR = -0.9; // NDC y: painted edge + tucked suitcase; record's bottom
const FIT_FROM = 0.9, FIT_RATE = 9, DECIDE_AT = 0.6, HOVER_DIST = 1.35; // lift; ease; lift; metres from the camera once zoomed (about)
const _fUp = new THREE.Vector3(), _fA = new THREE.Vector3(), _fB = new THREE.Vector3(), _fV = new THREE.Vector3();
function keepTagInFrame(core, camera, dt, pointer) {
  camera.updateWorldMatrix(true, false);
  _fUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const k = 1 - Math.exp(-dt * FIT_RATE), hov = core.sleeves[core.hovered], t = core.tag, tag = t.mesh;
  for (const s of core.sleeves) {
    if (s !== hov) s.fitTo = 0;
    s.fit += (s.fitTo - s.fit) * k;
    // sinks with the record's own lift, so it goes home along its normal path
    const f = s.fit * Math.min(1, Math.max(0, s.lift) / FIT_FROM), parent = s.mesh.parent;
    if (f < 1e-4 || !parent) continue;
    s.mesh.getWorldPosition(_fA);
    _fB.copy(_fA).addScaledVector(_fUp, f);
    parent.worldToLocal(_fA);
    parent.worldToLocal(_fB);
    s.mesh.position.add(_fB.sub(_fA));
  }
  keepUnderCursor(core, camera, dt, pointer);
  if (!hov || tag.parent !== hov.mesh) return;
  const p5 = camera.projectionMatrix.elements[5];
  // a point on the record in view space -> _fV; returns its NDC y
  const ndcY = (obj, x, y) => {
    _fV.set(x, y, 0).applyMatrix4(obj.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    return (p5 * _fV.y) / -_fV.z;
  };
  const cardH = t.lines > 1 ? t.h2 : t.h;
  if (core.tagFlip === null) {
    if (hov.lift < DECIDE_AT) { tag.scale.setScalar(1e-3); return; } // not shown until its side is settled
    hov.mesh.updateWorldMatrix(true, false);
    core.tagBaseY = tag.position.y;
    const centre = ndcY(hov.mesh, 0, 0), low = core.tagBaseY + t.h / 2 - cardH;
    core.tagFlip = core.tagBaseY < 0 && centre + (low * p5) / Math.min(-_fV.z, HOVER_DIST) < TAG_FLOOR;
  }
  // mirrored about the record's middle, so it overlaps the top edge as much as it did the bottom one
  if (core.tagFlip) tag.position.y = -core.tagBaseY + cardH - t.h;
  if (hov.lift < FIT_FROM) return;
  tag.updateWorldMatrix(true, false);
  const pxToM = (ndc) => (ndc * -_fV.z) / p5;
  let need = 0;
  if (core.tagFlip) need = pxToM(RECORD_FLOOR - ndcY(hov.mesh, 0, -hov.size / 2));
  else {
    for (const x of [-t.w / 2, t.w / 2]) need = Math.max(need, pxToM(TAG_FLOOR - ndcY(tag, x, t.h / 2 - cardH)));
  }
  // as far as the cursor allows: the record's bottom edge stays below it (as far below as keepUnderCursor
  // wants it, so the two never push against each other)
  const bottom = ndcY(hov.mesh, 0, -hov.size / 2), recH = Math.abs(ndcY(hov.mesh, 0, hov.size / 2) - bottom);
  const room = pointer ? pxToM(pointer.y - CURSOR_INSET * recH - bottom) : 0;
  hov.fitTo = Math.max(0, Math.min(Math.max(hov.fitTo, hov.fit + need), hov.fit + room));
}

// Lajoon: a hovered record must never lift, swing or zoom out from under the cursor, in any rack, at
// any moment of its animation (otherwise the hover is lost or you have to chase it to press it). Each
// rack's layout() poses the record as it likes; this runs after it and slides the hovered record across
// the view (along the camera's right and up, at its own depth) just far enough that the cursor stays
// CURSOR_INSET of its size inside its edges. Worked out afresh from the rack's pose every frame, so it is
// exact mid-animation and lets go as soon as the pose itself comes back under the cursor; when the hover
// ends the slide eases back out (PULL_RATE) so the record goes home along its normal path.
const CURSOR_INSET = 0.15, PULL_RATE = 10, EDGE_ON = 0.25; // share of size; per second; area / longest side² below which the inset fades (edge-on)
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]], _quad = CORNERS.map(() => [0, 0]);
const _pR = new THREE.Vector3(), _pU = new THREE.Vector3(), _pA = new THREE.Vector3(), _pB = new THREE.Vector3(), _pV = new THREE.Vector3();
function keepUnderCursor(core, camera, dt, pointer) {
  camera.updateWorldMatrix(true, false);
  _pR.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  _pU.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const hov = core.sleeves[core.hovered], k = 1 - Math.exp(-dt * PULL_RATE);
  const p = camera.projectionMatrix.elements;
  for (const s of core.sleeves) {
    const parent = s.mesh.parent;
    if (!parent) continue;
    if (s === hov && pointer && s.lift > 0.01) {
      // the rack's own pose (fit included): its cover's corners in NDC, then shrunk about their middle
      // by the inset. A turned or tipped record is a slanted quad, so its box on screen would not do.
      s.mesh.updateWorldMatrix(true, false);
      let cx = 0, cy = 0, z = 0;
      CORNERS.forEach(([a, c], i) => {
        _pV.set((a * s.size) / 2, (c * s.size) / 2, 0).applyMatrix4(s.mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        const w = -_pV.z, q = _quad[i];
        q[0] = (p[0] * _pV.x) / w; q[1] = (p[5] * _pV.y) / w;
        cx += q[0] / 4; cy += q[1] / 4; z += w / 4;
      });
      // seen almost edge-on (trough records rising out of the row) the cover is a sliver: the inset fades
      // out, so the sliver itself is kept under the cursor (smoothly, as the record turns to face you)
      let area = 0, edge = 0;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = _quad[i], [bx, by] = _quad[(i + 1) % 4];
        area += (ax * by - bx * ay) / 2; edge = Math.max(edge, Math.hypot(bx - ax, by - ay));
      }
      const inset = CURSOR_INSET * Math.min(1, Math.abs(area) / (EDGE_ON * edge * edge || 1));
      for (const q of _quad) { q[0] = cx + (q[0] - cx) * (1 - 2 * inset); q[1] = cy + (q[1] - cy) * (1 - 2 * inset); }
      // inside (same side of every edge) -> no slide; outside -> slide by cursor minus the nearest point
      let pos = 0, neg = 0, best = Infinity, dx = 0, dy = 0;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = _quad[i], [bx, by] = _quad[(i + 1) % 4], ex = bx - ax, ey = by - ay;
        const cr = ex * (pointer.y - ay) - ey * (pointer.x - ax);
        if (cr > 0) pos++; else if (cr < 0) neg++;
        const t = Math.max(0, Math.min(1, ((pointer.x - ax) * ex + (pointer.y - ay) * ey) / (ex * ex + ey * ey || 1)));
        const nx = ax + ex * t, ny = ay + ey * t, d = Math.hypot(pointer.x - nx, pointer.y - ny);
        if (d < best) { best = d; dx = pointer.x - nx; dy = pointer.y - ny; }
      }
      if (!(pos && neg) && Math.abs(area) > 1e-9) dx = dy = 0; // inside (a flat sliver never is)
      s.pullX = (dx * z) / p[0];
      s.pullY = (dy * z) / p[5];
    } else {
      s.pullX -= s.pullX * k;
      s.pullY -= s.pullY * k;
    }
    if (Math.abs(s.pullX) + Math.abs(s.pullY) < 1e-5) continue;
    s.mesh.getWorldPosition(_pA);
    _pB.copy(_pA).addScaledVector(_pR, s.pullX).addScaledVector(_pU, s.pullY);
    parent.worldToLocal(_pA);
    parent.worldToLocal(_pB);
    s.mesh.position.add(_pB.sub(_pA));
  }
}

export function createRackCore({ onPick, sign = null, tag = {}, maxItems = MAX_ITEMS, sleeve = {}, tagOnSleeve = true } = {}) {
  const root = new THREE.Group();
  const core = {
    root,
    sleeves: [],
    picker: createPicker(),
    waitFor: [],                   // extra signs etc. (anything with a .ready promise) that ready() waits for
    sign: sign ? createSign(sign) : null,
    tag: createTag(tag),
    hovered: -1,
    tagFlip: null,                 // is the tag above the record? null: not decided yet this hover
    tagBaseY: 0,
    control: -1,
    shelf: null,
    camLocal: new THREE.Vector3(), // the camera in the root's space, refreshed before layout()
    play: createPlayTracker(),
  };
  if (core.sign) root.add(core.sign.mesh);

  let forced = null;

  // the tag goes back under the record (a new hover picks its side again)
  function tagHome() {
    if (core.tagFlip) core.tag.mesh.position.y = core.tagBaseY;
    core.tagFlip = null;
  }

  function clear() {
    tagHome();
    for (const s of core.sleeves) s.dispose();
    core.sleeves = [];
    core.picker.clear();
    core.tag.hide();
  }

  function setHovered(i) {
    if (i === core.hovered) return;
    tagHome();
    core.hovered = i;
    const s = core.sleeves[i];
    if (!s) { core.tag.hide(); return; }
    core.tag.show(s.item, i + 3);
    if (tagOnSleeve) s.mesh.add(core.tag.mesh);
  }

  core.contract = (def) => {
    def.setup?.(core);
    return {
      root,
      setShelf(shelf) {
        clear();
        core.shelf = shelf;
        core.hovered = -1;
        const items = shelf.items.slice(0, maxItems);
        const sz = typeof sleeve === 'function' ? sleeve(items.length) : sleeve;
        items.forEach((item, i) => {
          const s = new Sleeve(item, i, { ...sz, seed: items.length * 31 + i });
          s.appear = -i * 0.035; // staggered drop-in
          s.setEmpty(core.play.isEmpty(item));
          if (s.empty) s.peek = 1;
          core.sleeves.push(s);
          root.add(s.mesh);
        });
        core.sign?.setTitle(shelf.title);
        def.items(core, items);
      },
      update(dt, camera, pointer, active) {
        const n = core.sleeves.length;
        let want = -1;
        if (forced !== null) want = forced < n ? forced : -1;
        else if (active && pointer && n) {
          const base = () => (def.pick ? def.pick(core, pointer, camera) : core.picker.pick(pointer, camera, root));
          // every record keeps its own patch of screen (its rest spot), so a lifted record that has
          // grown over a neighbour never hides it. The lifted one only catches the cursor where no
          // other record is (the bit sticking out above the rack): you click the song, not the rack.
          want = base();
          if (want < 0) want = heldUnder(core, pointer, camera);
        }
        // picks >= 1000 are controls of the rack itself (page arrows...): def.control(core, id) on click
        core.control = want >= 1000 ? want - 1000 : -1;
        if (want >= 1000) want = -1;
        setHovered(want);
        core.sleeves.forEach((s, i) => {
          s.empty !== core.play.isEmpty(s.item) && !s.picking && s.setEmpty(!s.empty);
          s.step(dt, i === want);
        });
        root.updateWorldMatrix(true, false);
        camera.getWorldPosition(core.camLocal); // world: the camera may sit in a rig (main.js)
        root.worldToLocal(core.camLocal);
        def.layout(core, dt, camera, want);
        core.sleeves.forEach((s) => { s.mesh.visible = s.appear > 0 && !s.hidden; });
        if (core.tag.mesh.parent) core.tag.mesh.scale.setScalar(0.6 + 0.4 * (core.sleeves[want]?.lift ?? 0));
        keepTagInFrame(core, camera, dt, pointer);
      },
      // the item's art changed (repaired playlist cover): re-skin its sleeve(s) without re-laying out
      refreshArt(item) {
        const id = (it) => it.play?.playlistId ?? it.play?.videoId ?? null;
        for (const s of core.sleeves) {
          if (s.item === item || (id(item) && id(s.item) === id(item))) { s.item.art = item.art; s.refreshArt(item.art); }
        }
      },
      click() {
        if (core.control >= 0) { def.control?.(core, core.control); return true; }
        const s = core.sleeves[core.hovered];
        if (!s || s.empty || s.picking) return false;
        const i = core.hovered;
        s.bump = 1;
        // which way is clear, in the pose it is in now (only when not already sliding back in)
        if (s.discY < 0.005) { s.discDir.copy(chooseDiscDir(core, s)); s.discDirNow.copy(s.discDir); }
        core.play.picked(s.item);
        s.startPick((disc) => onPick?.(s.item, i, disc));
        return true;
      },
      get hovered() { return core.hovered; },
      // metres the view should make room by (records move right = camera moves left; up = camera down)
      // where the hovered record is now (world), for the camera to turn toward; false if none
      focusPoint(out) {
        const s = core.sleeves[core.hovered];
        if (!s) return false;
        s.mesh.getWorldPosition(out);
        return true;
      },
      set forceHover(i) { forced = Number.isFinite(i) ? i : null; },
      get core() { return core; }, // debug / checks (scripts/cover-check.mjs)
      // make this rack's hover covers now (in idle time); upload(tex) puts each on the GPU early
      prewarm(upload) { prewarmCovers(core.sleeves.map((s) => s.art), upload); },
      setPlaying(videoId) { core.play.set(videoId); },
      setShelfCount() {}, // old main.js hook (the sign no longer shows tab hints)
      ready: () => Promise.all([fontReady, core.sign?.ready, ...core.waitFor.map((x) => x.ready), core.tag.ready, ...core.sleeves.map((s) => s.small.loaded), ...core.sleeves.map((s) => s.hot && s.big?.loaded)]),
    };
  };
  return core;
}
