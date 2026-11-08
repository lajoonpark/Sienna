// The suitcase record player: a painted 3D tan-leather case with a record, tonearm, volume knob
// and four buttons on the deck. It IS the player: it shows the state music.js gives it (record
// spins with the cover on its label, the arm creeps in with progress, the knob shows the volume,
// like turns terracotta) and sends commands back (buttons, knob, dragging the record to seek).
//
//   const sc = createSuitcase({ music, lidStop, ground: 'shadow'|'paper', big })   // big: larger knob and buttons (tonearm.js controlLayout), for the small in-shop case
//   sc.root                       THREE.Group to place in a scene (lights are inside it)
//   sc.setState(s)                s = what music.onState gives (see electron/ytm-page.js state())
//   sc.update(dt)                 every frame
//   sc.open() / sc.close()        the lid is a physical hinge (lid.js): flick, swing, land with a bounce
//   sc.hover(ndc, camera)         -> { control, over }   hit-test + hover feedback (ndc = Vector2 or null)
//   sc.touches(ndc, camera)       -> bool   the pointer is on the case's actual shape (no feedback)
//   sc.pointerDown/Drag/Up        presses, knob drags, record scrubbing
//   sc.wheel(deltaY, deltaMode)   volume
//   sc.lean(nx, ny)               leans the case toward the cursor (-1..1 each)
//   sc.placeRecord/liftRecord     record handoff (see suitcase/flight.js)
//   sc.cue(start, loading)        start a picked song once its record has landed and the arm is down; sc.startNow() starts it at once
//
// Controls: previous, playPause, next, like (buttons), knob, record (drag to seek).
import * as THREE from 'three';
import { paintCover, coverSeed } from './coverpaint.js';
import { paintOffThread } from './coverworker.js';
import { settings } from './settings.js';
import { LAYOUT as L, COMMANDS, isButton, armAngleForProgress, parkedArmAngle } from './tonearm.js';
import { LidHinge, DEFAULT_STOP } from './lid.js';
import { VolumeKnob } from './knob.js';
import { RecordScrub, recordAngle } from './scrub.js';
import { buildSuitcase, createRecordKit, caseSpace, setLabelMap } from './suitcase/model.js';
import { COL } from './suitcase/paint.js';
import { createLabelPolicy } from './suitcase/label.js';

const now = () => performance.now() / 1000;
const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const SPIN = 3.49;          // 33 1/3 rpm in radians per second
const MAX_PITCH = 0.12, MAX_ROLL = 0.1;

// A picked song with a record on its way to the platter. Settings > Start of a song: "when the arm lands"
// (default) stops what plays now, loads the new song straight away, and starts it once the needle is down
// (sc.cue); "at once" plays now.
export function startSong(music, sc, item) {
  if (settings.get('playOnArm') === false) return music.play(item);
  music.command('pause');
  sc.cue(() => music.startPrepared(item), music.prepare(item));
}

// Square cover from a URL, centre-cropped onto a 512 px canvas; shows paper until it arrives.
const covers = new Map();
settings.on('covers', () => { for (const t of covers.values()) t.userData.repaint?.(); });
export function coverFromUrl(url) {
  if (!url) return null;
  let t = covers.get(url);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#d9cbb2';
  g.fillRect(0, 0, 512, 512);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  t.userData.loaded = new Promise((res) => {
    img.onload = async () => {
      // drawn again when Settings > Cover art changes
      t.userData.repaint = async () => {
        const done = await paintOffThread(url, 512); // tens of ms of painting, as a record takes off
        if (done) {
          g.drawImage(done.bitmap, 0, 0);
          done.bitmap.close();
        } else {
          const s = Math.min(img.width, img.height);
          g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 512, 512);
          paintCover(g, 512, coverSeed(url));
        }
        t.needsUpdate = true;
      };
      await t.userData.repaint();
      res(true);
    };
    img.onerror = () => res(false);
  });
  img.src = url;
  covers.set(url, t);
  if (covers.size > 16) { const [k, old] = covers.entries().next().value; covers.delete(k); old.dispose(); }
  return t;
}

// Do two cover textures show the same picture? (Compared as 8x8 thumbnails; anything unreadable counts as
// the same, so a picked cover is never swapped for no reason.)
export function sameCover(a, b) {
  try {
    const px = (tex) => {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const g = c.getContext('2d');
      g.drawImage(tex.image, 0, 0, 8, 8);
      return g.getImageData(0, 0, 8, 8).data;
    };
    const A = px(a), B = px(b);
    let d = 0;
    for (let i = 0; i < A.length; i += 4) d += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
    return d / (64 * 3) < 24;
  } catch { return true; }
}

export function createSuitcase({ music = null, lidStop = DEFAULT_STOP, ground = 'shadow', big = false } = {}) {
  const recordKit = createRecordKit();
  const parts = buildSuitcase({ recordKit, ground, big });
  const { root, tilt, caseRoot, lidPivot, seat, record, armPivot, armLift, knob: knobNode, buttons } = parts;

  const hinge = new LidHinge(lidStop);
  const knob = new VolumeKnob(0.7);

  // ---- what the player says ----
  let hasTrack = false, playing = false, liked = false, adPlaying = false;
  let position = 0, duration = 0, stamp = 0;
  let videoId = null, art = null;
  let playingHold = 0, likedHold = 0;         // after a press, show the new state until the player agrees
  let lastVolumeChange = -10, lastVolumeSent = 0;
  let enabled = true;

  // ---- record on the platter ----
  let seatHas = false, held = false, dropT = 1, dropH = 1.1;
  // A cued song (Settings > Start of a song, "when the arm lands"): it starts only once the record that
  // is on its way has landed, the arm has swung onto the lead-in groove and dropped onto the vinyl. If the
  // song is still loading then, the arm hovers over the groove and drops when it is ready (or at HOVER_LIMIT).
  // cue = { start: fn, at: s, ready, landed, hoverFrom } until then; afterwards startHold keeps the arm at the lead-in until the new
  // track reports in (its state still says the old one for a moment).
  let cue = null, startHold = 0, startFrom = null;
  const HOVER_LIMIT = 8;                      // s: the most the arm waits for a slow song before dropping anyway
  const CUE_GIVE_UP = 7;                      // s: start anyway if the arm never gets there (hidden window, ...)   // dropH: how high a placed or swapped record starts above the platter
  let songProgress = 0;                       // progress of the song itself: an ad must not move the tonearm
  let labelTex = null;
  const labels = createLabelPolicy();         // which cover the label shows (suitcase/label.js)

  // ---- animation ----
  let spinAngle = 0, spinSpeed = 0;
  let armAngle = parkedArmAngle(), armLiftAmt = 1;
  let thump = 0;
  let tiltT = { pitch: 0, roll: 0 }, tiltNow = { pitch: 0, roll: 0 };
  const hov = { previous: 0, playPause: 0, next: 0, like: 0, knob: 0, record: 0 };
  let hovered = null, forced = null, pressed = null;
  let drag = null;                            // { kind: 'knob' | 'scrub' | 'button', ... }
  let scrub = null, scrubStep = 0;

  seat.visible = false;
  record.group.visible = true;

  const ink = new THREE.Color(COL.ink), hot = new THREE.Color(COL.hot);
  const brass = new THREE.Color(COL.brass), brassLight = new THREE.Color(COL.brassLight);
  const knobTop = new THREE.Color('#4c5282');

  // ---- helpers ----
  const progressNow = () => {
    if (scrub) return scrub.progress;
    if (adPlaying) return songProgress;       // an ad has its own clock: the arm stays where the song was
    if (!(duration > 0)) return 0;
    return (songProgress = Math.min(1, positionNow() / duration));
  };
  const positionNow = () => Math.min(duration, position + (playing ? now() - stamp : 0));
  const interactive = () => enabled && hinge.openness > 0.55 && hinge.mode !== 'closing';
  const scrubEnabled = () => hasTrack && duration > 0 && seatHas;

  function setGlyph(name, key) {
    const m = buttons[name].glyphMat;
    if (m.map !== parts.glyphs[key]) { m.map = parts.glyphs[key]; m.emissiveMap = m.map; }
  }

  function showLabel(tex) {
    labelTex = tex;
    setLabelMap(record.labelMat, tex ?? recordKit.fallback);
  }

  // ---- state ----
  // What the label shows: see suitcase/label.js. A swap is a quick lift and drop of the seated record.
  function syncLabel() {
    if (held) return;                          // a record is in flight; it brings its own cover
    const r = labels.sync(videoId, coverFromUrl(art));
    if (r.keep) return;
    if (r.compare) {
      const { vid, picked, own } = r.compare;
      // the track's own art is a different picture than the cover the record was picked with: use it once it has loaded
      own.userData.loaded.then((ok) => { if (ok && videoId === vid && labels.claimedFor(vid) === picked && !sameCover(picked, own)) { labels.prefer(vid, own); syncLabel(); } });
    }
    const want = r.want;
    if (!seatHas) { if (hasTrack) placeRecord(want, { animate: true }); }
    else if (want !== labelTex && (want || !labelTex)) swapLabel(want);
  }

  // A new label on the seated record: it lifts a little and drops back.
  function swapLabel(tex) {
    showLabel(tex);
    dropT = 0;
    dropH = 0.4;
  }

  function setState(s) {
    const t = now();
    const isPlaying = s.playerState === 1 || s.playerState === 3;
    if (t >= playingHold || isPlaying === playing) { playing = isPlaying; playingHold = 0; }
    const isLiked = s.like === 'LIKE';
    if (t >= likedHold || isLiked === liked) { liked = isLiked; likedHold = 0; }
    adPlaying = !!s.adPlaying;
    hasTrack = !!(s.videoId || s.title) || (hasTrack && adPlaying);
    position = s.position || 0;
    duration = s.duration || 0;
    stamp = t;
    if (s.videoId !== undefined && !adPlaying) { videoId = s.videoId; art = s.art ?? null; }
    if (drag?.kind !== 'knob' && t - lastVolumeChange > 1.5 && typeof s.volume === 'number') knob.set(s.volume / 100);
    setGlyph('playPause', playing ? 'pause' : 'play');
    setGlyph('like', liked ? 'heartFill' : 'heart');
    syncLabel();
  }

  // ---- the record on the platter ----
  function placeRecord(cover, { animate = false, claimFor = null } = {}) {
    seatHas = true;
    seat.visible = true;
    showLabel(cover ?? null);
    dropT = animate ? 0 : 1;
    dropH = 1.1;
    if (claimFor && cue) cue.landed = true;  // the cued song's record (not the one already on the platter)
    if (claimFor) {
      labels.land(cover, claimFor.baseVideoId);
      syncLabel();                             // the new track may already be playing: then this cover belongs to it
    }
  }

  // Takes the record off the platter and says where it was, so it can fly away.
  function liftRecord() {
    if (!seatHas) return null;
    root.updateWorldMatrix(true, true);
    const out = { matrixWorld: seat.matrixWorld.clone(), cover: labelTex, spin: spinAngle };
    seatHas = false;
    seat.visible = false;
    return out;
  }

  // ---- lid ----
  function open({ instant = false } = {}) {
    if (instant) { hinge.snapOpen(); applyLid(); }
    else hinge.release();
  }
  function close({ instant = false } = {}) {
    cancelDrag();
    setHover(null);
    if (instant) { hinge.snapShut(); applyLid(); }
    else hinge.shut();
  }
  function applyLid() { lidPivot.rotation.x = -hinge.angle; }

  // ---- per frame ----
  function update(dt) {
    // A slow frame (software rendering, a hidden window) must not stretch the animations out: they are
    // analytic or smoothed, so a long step is safe. The hinge integrates in steps of its own.
    dt = Math.min(Math.max(dt, 0), 1);
    let impact = 0;
    for (let rest = dt; rest > 1e-6; rest -= 0.25) impact = Math.max(impact, hinge.step(Math.min(rest, 0.25)));
    applyLid();
    if (impact > 0) thump = Math.max(thump, Math.min(impact, 8) * 0.012);
    thump *= Math.exp(-dt * 16);

    // lean toward the cursor, and lift by exactly the amount the low edge would sink
    const f = smooth(9, dt);
    tiltNow.pitch += (tiltT.pitch - tiltNow.pitch) * f;
    tiltNow.roll += (tiltT.roll - tiltNow.roll) * f;
    tilt.rotation.set(tiltNow.pitch, 0, -tiltNow.roll);
    tilt.position.y = 0.6 + (L.caseDepth / 2) * Math.abs(Math.sin(tiltNow.pitch)) + (L.caseWidth / 2) * Math.abs(Math.sin(tiltNow.roll));
    caseRoot.position.y = -0.6 - thump;

    // record: spins up and winds down; follows the pointer while scrubbed
    const target = playing && !adPlaying && seatHas ? SPIN : 0;   // it turns only while a song plays, not during an ad
    spinSpeed += (target - spinSpeed) * smooth(playing ? 5 : 3.5, dt);
    if (!scrub) spinAngle += spinSpeed * dt;
    record.group.rotation.y = -spinAngle;
    if (dropT < 1) {
      dropT = Math.min(1, dropT + dt / 0.38);
      const e = easeOut(dropT);
      seat.position.y = L.deckHeight + 0.06 + (1 - e) * (1 - e) * dropH;
      record.group.scale.setScalar(0.9 + 0.1 * e);
    } else if (seat.position.y !== L.deckHeight + 0.06) {
      seat.position.y = L.deckHeight + 0.06;
      record.group.scale.setScalar(1);
    }

    // tonearm: creeps inward through the song, parks clear of the record when idle, lifts while it travels
    const cueing = !!cue?.landed && seatHas && !held && dropT >= 1;
    if (cueing) {
      cue.hoverFrom ??= now();
      if (now() - cue.hoverFrom > HOVER_LIMIT) cue.ready = true;
    }
    const hovering = cueing && !cue.ready;
    const leadIn = cueing || (startHold > now() && videoId === startFrom);
    const onRecord = (hasTrack || leadIn) && seatHas && !held;
    const armTarget = onRecord ? armAngleForProgress(leadIn ? 0 : progressNow()) : parkedArmAngle();
    armAngle += (armTarget - armAngle) * smooth(6, dt);
    armPivot.rotation.y = armAngle;
    const travelling = Math.abs(armTarget - armAngle) > 0.04;
    armLiftAmt += ((!onRecord || travelling || hovering ? 1 : 0) - armLiftAmt) * smooth(8, dt);
    armLift.rotation.z = -0.1 * armLiftAmt;
    // the needle is down on the lead-in: the record spins up and the song starts
    if (cue && (cueing ? cue.ready && !travelling && armLiftAmt < 0.12 : now() - cue.at > CUE_GIVE_UP)) {
      const start = cue.start;
      cue = null;
      startHold = now() + 4; startFrom = videoId;
      playing = true; playingHold = now() + 4;  // spins from now, before the player says so
      start();
    }

    // knob and hover feedback
    knobNode.rotation.y = -knob.angle;
    const focus = forced ?? hovered;
    const on = interactive();
    for (const name of Object.keys(hov)) {
      const want = on && focus === name ? 1 : 0;
      hov[name] += (want - hov[name]) * smooth(16, dt);
      if (Math.abs(want - hov[name]) < 0.002) hov[name] = want;
    }
    for (const [name, b] of Object.entries(buttons)) {
      const h = hov[name], p = pressed === name ? 1 : 0;
      b.capMat.color.lerpColors(ink, hot, h);
      b.ringMat.color.lerpColors(brass, brassLight, h);
      b.cap.position.y = 0.03 * h - 0.032 * p;
      b.glyph.scale.setScalar(1 + 0.12 * h);
    }
    parts.knobMat.color.lerpColors(ink, hot, hov.knob);
    parts.knobTopMat.color.lerpColors(knobTop, hot, hov.knob);
    knobNode.scale.setScalar(1 + 0.05 * hov.knob + (drag?.kind === 'knob' ? 0.03 : 0));
    parts.rimMat.opacity = (scrubEnabled() ? 0.6 : 0.25) * hov.record;

    // keep the pigment noise fixed to the case
    root.updateWorldMatrix(true, true);
    caseSpace.value.copy(caseRoot.matrixWorld).invert();
  }

  // ---- picking ----
  const ray = new THREE.Raycaster();
  const hitMeshes = parts.hits.map((h) => h.mesh);
  const controlOf = new Map(parts.hits.map((h) => [h.mesh, h.control]));
  const local = new THREE.Ray();
  const inv = new THREE.Matrix4();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const p3 = new THREE.Vector3();

  function pick(ndc, camera) {
    root.updateWorldMatrix(true, true);
    ray.setFromCamera(ndc, camera);
    const c = ray.intersectObjects(hitMeshes, false)[0];
    if (c) return { control: controlOf.get(c.object), over: true };
    return { control: null, over: ray.intersectObjects(parts.solids, false).length > 0 };
  }

  // Where the pointer's ray meets a horizontal plane `height` above the floor, in deck coordinates.
  function deckPoint(ndc, camera, height) {
    root.updateWorldMatrix(true, true);
    ray.setFromCamera(ndc, camera);
    inv.copy(caseRoot.matrixWorld).invert();
    local.copy(ray.ray).applyMatrix4(inv);
    plane.constant = -height;
    return local.intersectPlane(plane, p3) ? p3 : null;
  }

  function setHover(control) { hovered = control; }

  function hover(ndc, camera) {
    if (!ndc) { setHover(null); return { control: null, over: false }; }
    if (drag) return { control: drag.control, over: true };
    const r = pick(ndc, camera);
    setHover(interactive() ? r.control : null);
    return r;
  }

  // The cursor that goes with what is under the pointer.
  function cursor() {
    if (drag?.kind === 'knob' || drag?.kind === 'scrub') return 'grabbing';
    if (!interactive() || !hovered) return '';
    if (isButton(hovered)) return 'pointer';
    if (hovered === 'knob') return 'grab';
    return scrubEnabled() ? 'grab' : '';
  }

  function sendVolume(force = false) {
    const t = now();
    if (!force && t - lastVolumeSent < 0.06) return;
    lastVolumeSent = t;
    music?.command('volume', Math.round(knob.volume * 100));
  }

  function press(name) {
    // Show the effect at once; the next poll of the player confirms it.
    if (name === 'playPause') { playing = !playing; playingHold = now() + 1.5; setGlyph('playPause', playing ? 'pause' : 'play'); }
    else if (name === 'like') { liked = !liked; likedHold = now() + 1.5; setGlyph('like', liked ? 'heartFill' : 'heart'); }
    music?.command(COMMANDS[name]);
  }

  function turnKnob(ndc, camera) {
    const p = deckPoint(ndc, camera, L.deckHeight + 0.12);
    if (!p) return;
    knob.drag(recordAngle(p.x - parts.ctl.knob.x, p.z - parts.ctl.knob.z));
    lastVolumeChange = now();
    sendVolume();
  }

  function scrubAngle(ndc, camera) {
    const p = deckPoint(ndc, camera, L.recordTop);
    return p ? recordAngle(p.x - L.record.x, p.z - L.record.z) : null;
  }

  // Returns true when the press landed on the case (a control or the leather), so it is not passed
  // on to whatever is behind it.
  function pointerDown(ndc, camera) {
    const r = pick(ndc, camera);
    if (!r.over) return false;
    if (!interactive() || !r.control) return true;
    const c = r.control;
    if (isButton(c)) {
      drag = { kind: 'button', control: c };
      pressed = c;
      press(c);
    } else if (c === 'knob') {
      drag = { kind: 'knob', control: c };
      turnKnob(ndc, camera);
    } else if (c === 'record' && scrubEnabled()) {
      const a = scrubAngle(ndc, camera);
      if (a != null) {
        scrub = new RecordScrub(a, positionNow(), duration);
        scrubStep = 0;
        drag = { kind: 'scrub', control: c };
      }
    }
    return true;
  }

  function pointerDrag(ndc, camera) {
    if (!drag) return;
    if (drag.kind === 'knob') turnKnob(ndc, camera);
    else if (drag.kind === 'scrub' && scrub) {
      const a = scrubAngle(ndc, camera);
      if (a == null) return;
      scrub.update(a);
      spinAngle += scrub.turned - scrubStep;     // the record turns with the pointer
      scrubStep = scrub.turned;
    }
  }

  function cancelDrag() { drag = null; pressed = null; scrub = null; }

  function pointerUp() {
    if (drag?.kind === 'knob') sendVolume(true);
    if (drag?.kind === 'scrub' && scrub) {
      // the song jumps once, on release: a seek is slow, so it is not sent while dragging
      music?.command('seek', scrub.position);
      position = scrub.position;
      stamp = now();
    }
    cancelDrag();
  }

  // Scroll over the case = volume. deltaMode as in WheelEvent: 0 pixels, 1 lines.
  function wheel(deltaY, deltaMode = 0) {
    // fingers moving down (deltaY < 0 with macOS natural scrolling) = quieter, as in the shop; a notch is 100 px
    const notches = deltaMode === 1 ? deltaY : deltaY / 100;
    knob.adjust(VolumeKnob.volumeChange(notches, { precise: false }));
    lastVolumeChange = now();
    sendVolume();
  }

  // Arrow keys: a fixed step of the knob (0..1).
  function nudgeVolume(delta) {
    knob.adjust(delta);
    lastVolumeChange = now();
    sendVolume(true);
  }

  function lean(nx, ny) {
    tiltT = { pitch: Math.max(-1, Math.min(1, ny)) * MAX_PITCH, roll: Math.max(-1, Math.min(1, nx)) * MAX_ROLL };
  }

  // Key points of the case (lid open at its stop) in the root's space, for fitting it on screen.
  function fitPoints() {
    const pts = [];
    const w = L.caseWidth / 2, d = L.caseDepth / 2;
    for (const x of [-w, w]) for (const y of [0, L.baseHeight]) for (const z of [-d, d]) pts.push(new THREE.Vector3(x, y, z));
    const a = hinge.stop, s = Math.sin(a), c = Math.cos(a);
    for (const x of [-w, w]) for (const ly of [0, L.lidHeight]) for (const lz of [0, L.caseDepth]) {
      // the lid turns about x by -angle around the hinge at the back top edge
      pts.push(new THREE.Vector3(x, L.baseHeight + ly * c + lz * s, -d + -ly * s + lz * c));
    }
    return pts;
  }

  return {
    root, parts, recordKit, hinge,
    setState, update, open, close, hover, pointerDown, pointerDrag, pointerUp, wheel, nudgeVolume, lean, cursor,
    placeRecord, liftRecord, fitPoints,
    // start(): begin the song once the next record has landed and the arm is down on it (see cue above).
    // loading: promise that settles when the song is ready to start, however that turned out.
    cue(start, loading) {
      const c = cue = { start, at: now(), ready: false, loading };
      const settled = () => { c.ready = true; };
      loading.then(settled, settled);
      playing = false; playingHold = now() + 1.5;
    },
    // start a cued song as soon as it has loaded, without waiting for the arm (the mini window closed before it got there:
    // nothing is drawn while it is hidden, so the arm would never land)
    startNow() {
      if (!cue) return false;
      const c = cue;
      cue = null;
      startHold = now() + 4; startFrom = videoId;
      playing = true; playingHold = now() + 4;
      if (c.ready) c.start();
      else c.loading.then(c.start, c.start);   // still loading: as soon as it is ready (the load never hangs)
      return true;
    },
    // is the pointer on the case itself, where it is right now (no hover feedback)
    touches(ndc, camera) { return !!ndc && pick(ndc, camera).over; },
    set enabled(v) { enabled = v; if (!v) { cancelDrag(); setHover(null); } },
    set forceHover(name) { forced = name; },      // screenshots
    get dragging() { return !!drag; },
    get hovered() { return hovered; },
    get volume() { return knob.volume; },
    get videoId() { return videoId; },
    get progress() { return progressNow(); },
    get scrubbing() { return !!scrub; },
    get lidClosed() { return hinge.mode === 'resting' && hinge.angle === 0; },
    get lidMoving() { return hinge.isMoving; },
    get seatHas() { return seatHas; },
    set held(v) { held = v; },                    // a record is in flight: leave the platter alone
    get held() { return held; },
    get playing() { return playing; },
    get hasTrack() { return hasTrack; },
    get currentCover() { return labelTex; },
    thump(amount) { thump = Math.max(thump, amount); },
    // for tests and the lab: what the platter is doing
    get debug() { return { seatHas, held, dropT, seatY: seat.position.y, hasTrack, playing, adPlaying, claim: labels.pending, spin: spinSpeed, labelSet: !!labelTex, videoId, cue: cue && { landed: !!cue.landed, ready: cue.ready }, armLift: armLiftAmt }; },
    // the seat's world pose, for the flying record to land on
    seatMatrix() { root.updateWorldMatrix(true, true); return seat.matrixWorld; },
    ready: () => Promise.all([...covers.values()].map((t) => t.userData.loaded)),
  };
}
