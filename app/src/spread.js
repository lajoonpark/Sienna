// The album spread. Press an album's record on any rack and its songs come out of the sleeve as bare
// vinyls, one per song, and fan into an arc in front of you, plus one red vinyl first that plays the
// whole album in order. Each song record has the album cover on its label and its track number on a
// paper sticker; point at one and it grows toward you, spins up and shows a name tag (title, track,
// length). Press it and it flies to the suitcase: that song plays, then the album carries on from there
// (it plays inside the album's playlist). Lajoon's choices (msg 622-628): arc, cover labels + number,
// red play-all record, play on from the picked song, albums only, 15 songs a page and a sideways
// scroll (or the paper arrows) for more, Esc / clicking empty space / leaving the rack puts them back.
//
//   createSpread({ camera, music, onPlay }) -> spread
//     spread.open(album, sleeveMesh)  fetch the songs (music.albumSongs) and fan them out of that sleeve;
//                                     no songs -> onPlay(album, null) (plays the album, as before)
//     spread.prefetch(album)          fetch ahead (on hover), so a press opens at once
//     spread.update(dt, pointer)      every frame; pointer = NDC or null (over the suitcase, off-window)
//     spread.click() -> bool          a record (onPlay(item, { matrixWorld, cover })) or an arrow; false = empty space
//     spread.wheel(dx) -> bool        sideways scroll turns the page
//     spread.close()                  records fly back into the sleeve
//     spread.isOpen, spread.busy (something still moving), spread.hovered, spread.page, spread.pages
//     spread.forceHover = k           hold record k up (screenshots: ?open=N&spreadhover=k)
// The records hang in the camera's frame (a group parented to the camera), so they stay put on screen;
// the cursor tilt in main.js keeps panning the shop behind them while the spread is open.
import * as THREE from 'three';
import { vinylParts, vinylMaterial, getCover, createTag, canvas, fontReady, springTo, clamp01 } from './racks/common.js';
import { crisp } from './materials.js';
import { FONT } from './style.js';
import { rng } from './rand.js';

const PAGE = 15;                    // songs per page; the play-all record comes first on every page
const ROW_MAX = 8;                  // one row up to this many records, else two
const R = 0.145;                    // vinyl radius (m) at full size
const LABEL_R = 0.068;              // label radius: bigger than a rack disc's, so the cover reads
const CELL_W = 2 * R + 0.045, CELL_H = 2 * R + 0.1; // a record and its number sticker
const DIST = 1.1;                   // m in front of the camera
const FIT_W = 0.6, FIT_H = 0.6;     // the spread fills at most this much of the view (the side menus stay clear)
const SHIFT_X = 0.02, SHIFT_Y = 0.07; // its centre, as a share of the view, right and up (clear of the suitcase)
const ARC = 0.22;                   // the row bows: ends drop by this share of a cell
const FAN_YAW = 0.22, FAN_ROLL = 0.14; // and the end records turn in and tip along the arc
const GROW = 0.32, FORWARD = 0.16;  // the hovered one: bigger, and nearer along its own sightline (stays under the cursor)
const OUT_RATE = 1 / 0.62, IN_RATE = 1 / 0.42, STAGGER = 0.035; // flight out / back in (1/s); delay per record (s)
const SPIN = 0.5, HOT_SPIN = 3.49;  // rad/s: drifting, and 33 1/3 rpm when pointed at
const WHEEL_PAGE = 90;              // px of sideways scroll that turn a page
const PLAY_ALL = '#b5332b';         // red vinyl

const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _up = new THREE.Vector3();

// small torn-paper sticker with the track number (or an arrow)
function sticker(text, seed, { w = 96, h = 64 } = {}) {
  const [c, g] = canvas(w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    const r = rng(seed);
    g.clearRect(0, 0, w, h);
    g.beginPath();
    const pad = 4;
    g.moveTo(pad, pad + r() * 4);
    for (let x = pad; x <= w - pad; x += 10) g.lineTo(x, pad + r() * 4);
    for (let y = pad; y <= h - pad; y += 10) g.lineTo(w - pad - r() * 4, y);
    for (let x = w - pad; x >= pad; x -= 10) g.lineTo(x, h - pad - r() * 4);
    for (let y = h - pad; y >= pad; y -= 10) g.lineTo(pad + r() * 4, y);
    g.closePath();
    g.fillStyle = '#f7efdd';
    g.fill();
    g.strokeStyle = 'rgba(120,90,60,.35)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#2b2436';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(h * 0.62)}px ${FONT}`;
    g.fillText(text, w / 2, h * 0.52, w - 14);
    tex.needsUpdate = true;
  };
  draw();
  fontReady.then(draw);
  return tex;
}

// the play-all record's label: cream paper, "Play all" in ink
let playAllLabel = null;
function playAllTexture() {
  if (playAllLabel) return playAllLabel;
  const S = 256;
  const [c, g] = canvas(S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    g.fillStyle = '#f3e6c8';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(150,40,35,.55)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.44, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2b2436';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(S * 0.27)}px ${FONT}`;
    g.fillText('Play', S / 2, S * 0.36);
    g.fillText('all', S / 2, S * 0.62);
    g.fillStyle = '#2b2436';
    g.beginPath(); g.arc(S / 2, S * 0.84, S * 0.025, 0, Math.PI * 2); g.fill(); // spindle hole
    tex.needsUpdate = true;
  };
  draw();
  fontReady.then(draw);
  return (playAllLabel = tex);
}

let labelGeo = null, stickerGeo = null, arrowGeo = null;
function geos() {
  if (!labelGeo) {
    labelGeo = new THREE.CylinderGeometry(LABEL_R, LABEL_R, 0.0052, 32);
    labelGeo.rotateX(Math.PI / 2);
    stickerGeo = new THREE.PlaneGeometry(0.075, 0.05);
    arrowGeo = new THREE.PlaneGeometry(0.1, 0.0667);
  }
  return { labelGeo, stickerGeo, arrowGeo };
}

export function createSpread({ camera, music, onPlay }) {
  const root = new THREE.Group();
  root.name = 'album-spread';
  camera.add(root);
  const tag = createTag({ w: 0.46, h: 0.13 });
  const cache = new Map();  // playlistId -> Promise<songs>
  const stickers = new Map(); // track number -> texture (shared by every album)
  let st = null;            // the album out now: { album, songs, recs, page, sleeve, from, closing }
  const leaving = [];       // spreads still flying back into their sleeves
  let hovered = -1, forced = null, wheelAcc = 0, wheelAt = 0, seq = 0;
  const arrows = ['‹', '›'].map((t, i) => {
    const m = new THREE.Mesh(geos().arrowGeo, crisp({ map: sticker(t, 77 + i, { w: 96, h: 64 }), alphaTest: 0.4 }));
    m.visible = false;
    m.userData.show = 0;
    root.add(m);
    return m;
  });

  const keyOf = (album) => album?.play?.playlistId ?? null;
  function fetchSongs(album) {
    const k = keyOf(album);
    if (!k || !music.albumSongs) return Promise.resolve([]);
    if (!cache.has(k)) {
      const p = music.albumSongs(album).catch(() => []);
      cache.set(k, p);
      p.then((s) => { if (!s.length) cache.delete(k); }); // try again next time
    }
    return cache.get(k);
  }

  // one record: a group (posed every frame) holding the spinning vinyl + label and the sticker
  function makeRecord(item, i, cover, all) {
    const v = vinylParts();
    const g = new THREE.Group();
    const spin = new THREE.Group();
    const vinylMesh = new THREE.Mesh(v.geo, all ? vinylMaterial(PLAY_ALL) : v.mat);
    const label = new THREE.Mesh(geos().labelGeo, all ? crisp({ map: playAllTexture() }) : cover.mat);
    spin.add(vinylMesh, label);
    spin.rotation.z = rng(i * 13 + 5)() * Math.PI * 2;
    g.add(spin);
    let stick = null;
    if (!all) {
      const n = item.track ?? i;
      if (!stickers.has(n)) stickers.set(n, sticker(String(n), n * 7 + 1));
      stick = new THREE.Mesh(geos().stickerGeo, crisp({ map: stickers.get(n), alphaTest: 0.4 }));
      stick.position.set(0, -R - 0.022, 0.004);
      stick.rotation.z = (rng(n * 3 + 2)() - 0.5) * 0.16;
      g.add(stick);
    }
    g.visible = false;
    root.add(g);
    return { item, all, g, spin, stick, t: 0, delay: 0, out: false, lift: 0, liftV: 0, slot: null, spinV: SPIN, gone: false };
  }

  function disposeSpread(sp) {
    for (const r of sp.recs) {
      r.g.removeFromParent();
      if (r.stick) r.stick.material.dispose();
      if (r.all) r.spin.children[1].material.dispose();
    }
    sp.cover.mat.dispose();
  }

  function pageCount(sp) { return Math.max(1, Math.ceil(sp.songs.length / PAGE)); }

  // which records are out on this page, and their slots in the camera's frame
  function layoutPage(sp) {
    const first = sp.page * PAGE;
    const on = [sp.recs[0], ...sp.recs.slice(1 + first, 1 + first + PAGE)];
    const n = on.length, rows = n <= ROW_MAX ? 1 : 2, cols = Math.ceil(n / rows);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect;
    const fs = Math.min(1, (FIT_W * 2 * tanH * DIST) / (cols * CELL_W), (FIT_H * 2 * tanV * DIST) / (rows * CELL_H + 0.12));
    const cx = SHIFT_X * 2 * tanH * DIST, cy = SHIFT_Y * 2 * tanV * DIST;
    sp.fs = fs;
    sp.width = cols * CELL_W * fs;
    sp.cx = cx; sp.cy = cy;
    let k = 0;
    sp.recs.forEach((r) => { r.wasOut = r.out; r.out = false; });
    on.forEach((r, j) => {
      const row = Math.floor(j / cols), inRow = row < rows - 1 ? cols : n - row * cols, col = j - row * cols;
      const off = col - (inRow - 1) / 2, u = cols > 1 ? off / ((cols - 1) / 2) : 0;
      const x = cx + off * CELL_W * fs;
      const y = cy + ((rows - 1) / 2 - row) * CELL_H * fs + 0.03 * fs - ARC * CELL_H * fs * u * u;
      r.slot = { x, y, z: -DIST, yaw: -FAN_YAW * u, roll: -FAN_ROLL * u, idx: j };
      r.out = true;
      if (!r.wasOut) { r.delay = (k++) * STAGGER; }
    });
    // arrows either side of the rows
    const pages = pageCount(sp);
    arrows[0].userData.on = sp.page > 0;
    arrows[1].userData.on = sp.page < pages - 1;
    arrows.forEach((a, i) => {
      a.position.set(cx + (i ? 1 : -1) * (sp.width / 2 + 0.06 * fs), cy, -DIST);
      a.scale.setScalar(Math.max(0.6, fs * 1.4));
    });
  }

  // the sleeve's pose in the camera's frame (live while it is still on the rack)
  function sleevePose(sp) {
    const m = sp.sleeve?.parent ? (sp.sleeve.updateWorldMatrix(true, false), sp.from.copy(sp.sleeve.matrixWorld)) : sp.from;
    camera.updateWorldMatrix(true, false);
    _m.copy(camera.matrixWorld).invert().multiply(m).decompose(_a, _q, _s);
    return { pos: _a, quat: _q, scale: _s.x };
  }

  function open(album, sleeve) {
    if (st && keyOf(st.album) === keyOf(album) && !st.closing) return;
    close();
    const my = ++seq;
    const from = new THREE.Matrix4();
    if (sleeve) { sleeve.updateWorldMatrix(true, false); from.copy(sleeve.matrixWorld); }
    const pending = { album, loading: true, sleeve, from };
    st = pending;
    fetchSongs(album).then((songs) => {
      if (my !== seq || st !== pending) return;
      if (!songs.length) { st = null; onPlay?.(album, null); return; } // no songs: play the album as before
      const cover = getCover(album.art, 256);
      const coverMat = crisp({ map: cover.tex });
      const sp = { album, songs, sleeve, from, page: 0, cover: { mat: coverMat }, recs: [], closing: false, t: 0 };
      sp.recs.push(makeRecord({ ...album }, 0, sp.cover, true));
      songs.forEach((s, i) => sp.recs.push(makeRecord(s, i + 1, sp.cover, false)));
      layoutPage(sp);
      st = sp;
    });
  }

  function close() {
    if (!st) return;
    seq++;
    if (st.recs) {
      st.closing = true;
      st.recs.forEach((r) => { r.out = false; });
      leaving.push(st);
    }
    st = null;
    hovered = -1;
    tag.hide();
    arrows.forEach((a) => { a.userData.on = false; });
  }

  function turnPage(d) {
    if (!st?.recs) return false;
    const p = Math.max(0, Math.min(pageCount(st) - 1, st.page + d));
    if (p === st.page) return false;
    st.page = p;
    hovered = -1;
    tag.hide();
    layoutPage(st);
    // the records leaving this page go back first, quickly, before the next ones come out
    st.recs.forEach((r) => { if (r.out && !r.wasOut) r.delay += 0.12; });
    return true;
  }

  // hit test against each record's REST slot (no lift), so nothing moves under the cursor
  function pick(pointer) {
    if (!pointer || !st?.recs) return -1;
    const p = camera.projectionMatrix.elements, asp = camera.aspect;
    let best = -1, bestD = Infinity;
    st.recs.forEach((r, i) => {
      if (!r.out || r.t < 0.9 || r.gone) return;
      const s = r.slot, w = -s.z;
      const dx = ((p[0] * s.x) / w - pointer.x) * asp, dy = (p[5] * s.y) / w - pointer.y;
      const rad = (p[5] * R * st.fs) / w;
      const d = Math.hypot(dx, dy);
      if (d < rad * 1.04 && d < bestD) { bestD = d; best = i; }
    });
    return best;
  }
  function pickArrow(pointer) {
    if (!pointer || !st?.recs) return -1;
    const p = camera.projectionMatrix.elements, asp = camera.aspect;
    for (let i = 0; i < 2; i++) {
      const a = arrows[i];
      if (!a.userData.on || a.userData.show < 0.8) continue;
      const w = -a.position.z, sc = a.scale.x;
      const dx = Math.abs((p[0] * a.position.x) / w - pointer.x) * asp, dy = Math.abs((p[5] * a.position.y) / w - pointer.y);
      if (dx < (p[5] * 0.06 * sc) / w && dy < (p[5] * 0.045 * sc) / w) return i;
    }
    return -1;
  }

  // pose one record: along its way out of the sleeve (t 0..1) toward its slot, then lifted if hovered
  function pose(sp, r, dt, from) {
    const s = r.slot;
    if (!s) return;
    const e = ss(r.t);
    // out of the top of the sleeve first, then across to the slot
    _up.set(0, 1, 0).applyQuaternion(from.quat);
    const lift = ss(r.lift);
    _c.set(s.x, s.y, s.z).multiplyScalar(1 - (FORWARD * lift) / DIST); // nearer along its sightline
    // control point: up out of the sleeve and a third of the way to its slot, so the records burst
    // out along a fan of paths instead of one line
    _b.copy(from.pos).lerp(_c, 0.35).addScaledVector(_up, 0.3 * from.scale);
    const u = 1 - e;
    r.g.position.set(0, 0, 0)
      .addScaledVector(from.pos, u * u)
      .addScaledVector(_b, 2 * u * e)
      .addScaledVector(_c, e * e);
    _q.setFromEuler(_e.set(0.02 * Math.sin(s.idx * 2.3), s.yaw * (1 - lift), s.roll * (1 - lift)));
    r.g.quaternion.copy(from.quat).slerp(_q, ss((r.t - 0.15) / 0.7));
    const scale = from.scale + (sp.fs * (1 + GROW * lift) - from.scale) * e;
    r.g.scale.setScalar(scale);
    r.g.visible = r.t > 0.02;
    r.spinV += ((r.lift > 0.5 ? HOT_SPIN : SPIN) - r.spinV) * (1 - Math.exp(-dt * 3));
    r.spin.rotation.z -= r.spinV * dt;
    if (r.stick) r.stick.visible = lift < 0.5;
  }

  function stepSpread(sp, dt, active) {
    const from = sleevePose(sp);
    const fromCopy = { pos: from.pos.clone(), quat: from.quat.clone(), scale: from.scale };
    let moving = false;
    sp.recs.forEach((r, i) => {
      if (r.gone) return;
      if (r.out) {
        if (r.delay > 0) r.delay -= dt;
        else r.t = Math.min(1, r.t + dt * OUT_RATE);
      } else {
        r.delay = 0;
        r.t = Math.max(0, r.t - dt * IN_RATE);
      }
      springTo(r, 'lift', active && i === hovered ? 1 : 0, dt, 17, 1, 0);
      if ((r.t > 0 && r.t < 1) || Math.abs(r.liftV) > 1e-3) moving = true;
      if (r.t <= 0) { r.g.visible = false; r.lift = r.liftV = 0; return; }
      pose(sp, r, dt, fromCopy);
    });
    return moving;
  }

  let busy = false;
  function update(dt, pointer) {
    busy = false;
    if (st?.recs) {
      const fh = forced !== null && st.recs[forced]?.out && st.recs[forced].t >= 0.9 ? forced : null;
      const h = fh ?? pick(pointer);
      if (h !== hovered) {
        hovered = h;
        const r = st.recs[h];
        if (r) {
          const it = r.all
            ? { title: 'Play all', subtitle: `${st.album.title} · ${st.songs.length} songs` }
            : { title: r.item.title, subtitle: [`Track ${r.item.track}`, r.item.duration ? `${Math.floor(r.item.duration / 60)}:${String(r.item.duration % 60).padStart(2, '0')}` : null].filter(Boolean).join(' · ') };
          tag.show(it, h + 11);
          r.g.add(tag.mesh);
          tag.mesh.position.set(0, -R - 0.05, 0.012);
        } else tag.hide();
      }
      st.arrowHover = pickArrow(pointer);
      if (stepSpread(st, dt, true)) busy = true;
      if (tag.mesh.parent) tag.mesh.scale.setScalar(clamp01(0.6 + 0.4 * (st.recs[hovered]?.lift ?? 0)));
    }
    for (let i = leaving.length - 1; i >= 0; i--) {
      const sp = leaving[i];
      if (stepSpread(sp, dt, false)) busy = true;
      if (sp.recs.every((r) => r.t <= 0 || r.gone)) { disposeSpread(sp); leaving.splice(i, 1); }
      else busy = true;
    }
    arrows.forEach((a, i) => {
      const on = !!a.userData.on;
      a.userData.show += ((on ? 1 : 0) - a.userData.show) * (1 - Math.exp(-dt * 8));
      a.visible = a.userData.show > 0.02;
      const hot = st?.arrowHover === i ? 1.18 : 1;
      a.material.opacity = 1;
      a.scale.setScalar(Math.max(0.6, (st?.fs ?? 1) * 1.4) * a.userData.show * hot);
      if (Math.abs(a.userData.show - (on ? 1 : 0)) > 0.01) busy = true;
    });
    if (st?.loading) busy = true;
  }

  function click() {
    if (!st?.recs) return !!st; // still fetching: swallow the click
    if (st.arrowHover >= 0) { turnPage(st.arrowHover ? 1 : -1); return true; }
    const r = st.recs[hovered];
    if (!r) { close(); return false; }
    // that record flies to the suitcase; the rest go back into the sleeve
    r.g.updateWorldMatrix(true, true);
    const disc = { matrixWorld: r.spin.matrixWorld.clone(), cover: getCover(st.album.art, 512).tex }; // the platter shows the album cover (play-all too)
    r.gone = true;
    r.g.visible = false;
    const item = r.all ? st.album : r.item;
    close();
    onPlay?.(item, disc);
    return true;
  }

  function wheel(dx) {
    if (!st?.recs) return !!st;
    const t = performance.now();
    if (t - wheelAt > 400) wheelAcc = 0;
    wheelAt = t;
    wheelAcc += dx;
    if (Math.abs(wheelAcc) >= WHEEL_PAGE) {
      turnPage(Math.sign(wheelAcc));
      wheelAcc = 0;
      wheelAt = t + 300; // one page per swipe
    }
    return true;
  }

  return {
    root,
    open,
    close,
    prefetch: (album) => { fetchSongs(album); },
    update,
    click,
    wheel,
    get isOpen() { return !!st; },
    get busy() { return busy; },
    get hovered() { return hovered; },
    get page() { return st?.page ?? 0; },
    get pages() { return st?.recs ? pageCount(st) : 0; },
    get loaded() { return !!st?.recs; },
    set forceHover(k) { forced = Number.isFinite(k) ? k : null; },
    turnPage,
    get state() { return st; }, // debug / checks
  };
}
