// Ports of the Swift tests in Tests/SiennaCoreTests/SuitcaseTests.swift and RecordLayoutTests.swift
// for the pure parts of the suitcase: lid hinge, volume knob, record scrub and tonearm layout.
// The sources are ES modules, so they are loaded with import() from these CommonJS test files.
const test = require('node:test');
const assert = require('node:assert');

const load = (name) => import(`../src/${name}.js`);
const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} !~ ${b}`);

// ---- VolumeKnob ----
test('knob: the angle sweeps 270 degrees around the top', async () => {
  const { VolumeKnob } = await load('knob');
  near(VolumeKnob.angle(0), -0.75 * Math.PI);
  near(VolumeKnob.angle(0.5), 0);
  near(VolumeKnob.angle(1), 0.75 * Math.PI);
});

test('knob: scrolling up is louder whichever way the scroll setting points', async () => {
  const { VolumeKnob } = await load('knob');
  assert.ok(VolumeKnob.volumeChange(3, { precise: false, invertedFromDevice: false }) > 0);
  assert.ok(VolumeKnob.volumeChange(-3, { precise: true, invertedFromDevice: true }) > 0);
  assert.ok(VolumeKnob.volumeChange(3, { precise: true, invertedFromDevice: true }) < 0);
});

test('knob: scroll sizes', async () => {
  const { VolumeKnob } = await load('knob');
  near(VolumeKnob.volumeChange(1, { precise: false }), 0.05);
  near(VolumeKnob.volumeChange(30, { precise: true }), 0.1);
});

test('knob: adjust clamps', async () => {
  const { VolumeKnob } = await load('knob');
  const k = new VolumeKnob(0.95);
  k.adjust(0.5);
  assert.strictEqual(k.volume, 1);
  k.adjust(-5);
  assert.strictEqual(k.volume, 0);
  assert.strictEqual(new VolumeKnob(9).volume, 1);
});

test('knob: dragging follows the pointer', async () => {
  const { VolumeKnob } = await load('knob');
  const k = new VolumeKnob(0);
  k.drag(0);
  near(k.volume, 0.5);
  k.drag(0.75 * Math.PI);
  near(k.volume, 1);
  k.drag(-0.75 * Math.PI);
  near(k.volume, 0);
  k.drag(0.25 * Math.PI);
  near(k.volume, (0.25 * Math.PI + 0.75 * Math.PI) / (1.5 * Math.PI));
});

test('knob: dragging across the gap does not flip', async () => {
  const { VolumeKnob } = await load('knob');
  let k = new VolumeKnob(0.9);
  k.drag(Math.PI); // straight down, in the gap
  assert.strictEqual(k.volume, 1);
  k = new VolumeKnob(0.1);
  k.drag(Math.PI);
  assert.strictEqual(k.volume, 0);
});

test('knob: drag normalises angles', async () => {
  const { VolumeKnob } = await load('knob');
  const k = new VolumeKnob();
  k.drag(2 * Math.PI); // a full turn is still 12 o'clock
  near(k.volume, 0.5);
  k.drag(-2 * Math.PI + 0.25 * Math.PI);
  near(k.volume, 0.5 + (0.25 * Math.PI) / (1.5 * Math.PI));
});

// ---- RecordScrub ----
test('scrub: clockwise goes forward, anticlockwise back', async () => {
  const { RecordScrub, SECONDS_PER_TURN } = await load('scrub');
  const s = new RecordScrub(0, 60, 200);
  s.update(Math.PI / 2);
  near(s.position, 60 + SECONDS_PER_TURN / 4);
  s.update(-Math.PI / 2);
  near(s.position, 60 - SECONDS_PER_TURN / 4);
});

test('scrub: crossing 12 o\'clock takes the short way', async () => {
  const { RecordScrub } = await load('scrub');
  const s = new RecordScrub(2 * Math.PI - 0.1, 10, 100);
  s.update(0.1); // 359 -> ~6 degrees: a small forward turn
  near(s.turned, 0.2);
});

test('scrub: multiple turns accumulate', async () => {
  const { RecordScrub, SECONDS_PER_TURN } = await load('scrub');
  const s = new RecordScrub(0, 0, 1000);
  let angle = 0;
  for (let i = 0; i < 40; i++) { angle += Math.PI / 10; s.update(angle % (2 * Math.PI)); }
  near(s.position, 2 * SECONDS_PER_TURN, 1e-6);
});

test('scrub: clamped to the song', async () => {
  const { RecordScrub } = await load('scrub');
  const s = new RecordScrub(0, 5, 30);
  s.update(-Math.PI + 0.01);
  s.update(-2 * Math.PI + 0.02);
  assert.strictEqual(s.position, 0);
  assert.strictEqual(s.progress, 0);
  const f = new RecordScrub(0, 25, 30);
  let a = 0;
  for (let i = 0; i < 20; i++) { a += Math.PI / 2; f.update(a % (2 * Math.PI)); }
  assert.strictEqual(f.position, 30);
  assert.strictEqual(f.progress, 1);
});

test('scrub: an unknown duration is safe', async () => {
  const { RecordScrub } = await load('scrub');
  const s = new RecordScrub(0, 0, 0);
  s.update(1);
  assert.strictEqual(s.position, 0);
  assert.strictEqual(s.progress, 0);
});

test('record angle is clockwise from twelve', async () => {
  const { recordAngle } = await load('scrub');
  near(recordAngle(0, -1), 0);
  near(recordAngle(1, 0), Math.PI / 2);
  near(recordAngle(0, 1), Math.PI);
  near(recordAngle(-1, 0), (3 * Math.PI) / 2);
});

// ---- LidHinge ----
const run = (hinge, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) hinge.step(1 / 60); };

test('lid: release from shut ends open and at rest', async () => {
  const { LidHinge } = await load('lid');
  const h = new LidHinge();
  h.release();
  run(h, 4);
  assert.strictEqual(h.mode, 'resting');
  near(h.angle, h.stop);
  near(h.openness, 1);
});

test('lid: the opening never stalls half way or leaves its travel', async () => {
  const { LidHinge } = await load('lid');
  const h = new LidHinge();
  h.release();
  let t = 0;
  while (h.isMoving && t < 5) {
    h.step(1 / 60);
    t += 1 / 60;
    assert.ok(h.angle >= 0 && h.angle <= h.stop);
  }
  assert.ok(t < 3, 'the lid should land well inside three seconds');
});

test('lid: release works at any frame rate', async () => {
  const { LidHinge } = await load('lid');
  for (const fps of [30, 60, 120]) {
    const h = new LidHinge();
    h.release();
    for (let t = 0; h.isMoving && t < 5; t += 1 / fps) h.step(1 / fps);
    near(h.angle, h.stop, 1e-9, `fps ${fps}`);
  }
});

test('lid: shutting from open lands shut and clacks', async () => {
  const { LidHinge } = await load('lid');
  const h = new LidHinge();
  h.release();
  run(h, 4);
  h.shut();
  let hardest = 0;
  for (let t = 0; h.isMoving && t < 4; t += 1 / 60) hardest = Math.max(hardest, h.step(1 / 60));
  assert.strictEqual(h.mode, 'resting');
  near(h.angle, 0);
  assert.ok(hardest > 0, 'the lid should land on the case with an impact');
});

test('lid: reopening a partly closed lid ends open', async () => {
  const { LidHinge } = await load('lid');
  for (let stopAfter = 0.05; stopAfter <= 0.4001; stopAfter += 0.05) {
    const h = new LidHinge();
    h.release();
    run(h, 4);
    h.shut();
    run(h, stopAfter);
    h.release();
    run(h, 4);
    near(h.angle, h.stop, 1e-9, `reopened after ${stopAfter}s`);
  }
});

test('lid: a stalled frame cannot tunnel through the stop', async () => {
  const { LidHinge } = await load('lid');
  const h = new LidHinge();
  h.release();
  h.step(0.2);
  h.step(10);
  assert.ok(h.angle <= h.stop && h.angle >= 0);
});

test('lid: the swing slows near the top (it is a hinge, not a tween)', async () => {
  const { LidHinge } = await load('lid');
  const h = new LidHinge();
  h.release();
  // gravity pulls the lid shut until it passes vertical, so the lid is slowest near 90 degrees
  let vMid = Infinity, vEarly = 0;
  for (let t = 0; h.isMoving && t < 3; t += 1 / 240) {
    h.step(1 / 240);
    if (h.angle > 0.3 && h.angle < 0.6) vEarly = Math.max(vEarly, h.velocity);
    if (h.angle > 1.3 && h.angle < 1.7) vMid = Math.min(vMid, h.velocity);
  }
  assert.ok(vMid < vEarly, `slower over the top (${vMid.toFixed(2)}) than leaving the latch (${vEarly.toFixed(2)})`);
});

// ---- layout and tonearm ----
test('tonearm: the stylus lands on the grooves it is asked for', async () => {
  const { stylusAt, TONEARM, LAYOUT, distance } = await load('tonearm');
  for (const r of [TONEARM.outerRadius, 0.8, TONEARM.innerRadius]) {
    const s = stylusAt(r);
    assert.ok(s);
    near(distance(s, LAYOUT.record), r);
    near(distance(s, TONEARM.pivot), TONEARM.length);
  }
});

test('tonearm: the arm moves inward as the song plays', async () => {
  const { armAngleForProgress } = await load('tonearm');
  let last = armAngleForProgress(0);
  for (let p = 0.1; p <= 1.0001; p += 0.1) {
    const a = armAngleForProgress(p);
    assert.notStrictEqual(a, last);
    last = a;
  }
  assert.strictEqual(armAngleForProgress(-3), armAngleForProgress(0));
  assert.strictEqual(armAngleForProgress(9), armAngleForProgress(1));
});

test('tonearm: the stylus stays on the record, behind the buttons, outside the label', async () => {
  const { stylusAt, TONEARM, LAYOUT } = await load('tonearm');
  for (let p = 0; p <= 1.0001; p += 0.25) {
    const r = TONEARM.outerRadius + (TONEARM.innerRadius - TONEARM.outerRadius) * p;
    const s = stylusAt(r);
    assert.ok(s.z < LAYOUT.record.z + 0.01, 'stylus should be on the back half');
    assert.ok(r > LAYOUT.labelRadius, 'stylus must stay outside the artwork');
    assert.ok(r < LAYOUT.recordRadius);
  }
});

test('tonearm: the arm angle matches the stylus direction', async () => {
  const { stylusAt, armAngleAtRadius, TONEARM } = await load('tonearm');
  const s = stylusAt(0.8);
  const theta = armAngleAtRadius(0.8);
  // local -x rotated about y by theta: (-cos, sin) in (x, z)
  near(-Math.cos(theta) * TONEARM.length, s.x - TONEARM.pivot.x);
  near(Math.sin(theta) * TONEARM.length, s.z - TONEARM.pivot.z);
});

test('tonearm: parked, the stylus is clear of the record and still on the deck', async () => {
  const { parkedArmAngle, TONEARM, LAYOUT, distance } = await load('tonearm');
  const th = parkedArmAngle();
  const tip = { x: TONEARM.pivot.x - Math.cos(th) * TONEARM.length, z: TONEARM.pivot.z + Math.sin(th) * TONEARM.length };
  assert.ok(distance(tip, LAYOUT.record) > LAYOUT.recordRadius, 'parked stylus is off the record');
  assert.ok(Math.abs(tip.x) < LAYOUT.deckHalfWidth && Math.abs(tip.z) < LAYOUT.deckHalfDepth, 'and on the deck');
});

test('layout: nothing on the deck overlaps or falls off it', async () => {
  const { LAYOUT, BUTTONS, TONEARM, distance } = await load('tonearm');
  const circles = [
    ['record', LAYOUT.record, LAYOUT.platterRadius],
    ['knob', LAYOUT.knob, LAYOUT.knobRadius + 0.14], // with its tick marks
    ['pivot', TONEARM.pivot, 0.18],
    ...Object.entries(BUTTONS).map(([n, b]) => [n, b, b.radius]),
  ];
  for (const [name, p, r] of circles) {
    assert.ok(Math.abs(p.x) + r <= LAYOUT.deckHalfWidth, `${name} off the deck`);
    assert.ok(Math.abs(p.z) + r <= LAYOUT.deckHalfDepth, `${name} off the deck`);
  }
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const gap = distance(circles[i][1], circles[j][1]) - circles[i][2] - circles[j][2];
      assert.ok(gap > 0.02, `${circles[i][0]} overlaps ${circles[j][0]}`);
    }
  }
});

test('layout: the record is big enough for its label and fits its platter', async () => {
  const { LAYOUT } = await load('tonearm');
  assert.ok(LAYOUT.labelRadius < LAYOUT.recordRadius);
  assert.ok(LAYOUT.recordRadius < LAYOUT.platterRadius);
});

test('controls: buttons map to player commands', async () => {
  const { COMMANDS, isButton } = await load('tonearm');
  assert.strictEqual(COMMANDS.playPause, 'toggle');
  assert.strictEqual(COMMANDS.like, 'like');
  assert.strictEqual(COMMANDS.knob, undefined);
  assert.ok(isButton('next'));
  assert.ok(!isButton('record'));
});

// ---- fitting the case on screen (three is plain maths, it runs in node) ----
test('fit: the case lands in its corner of the screen, bottom-left aligned, and the camera frames it', async () => {
  const THREE = await import('three');
  const { fitObject, fitCamera, ndcBounds } = await load('suitcase/fit');
  const { LAYOUT: L } = await load('tonearm');
  const pts = [];
  const w = L.caseWidth / 2, d = L.caseDepth / 2;
  for (const x of [-w, w]) for (const y of [0, 3.9]) for (const z of [-d, d]) pts.push(new THREE.Vector3(x, y, z));
  const cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 120);
  const obj = new THREE.Group();
  obj.rotation.set(0.7, 0.36, 0, 'XYZ');
  const rect = { x0: -0.95, x1: -0.42, y0: -0.9, y1: -0.38 };
  fitObject({ object: obj, points: pts, camera: cam, rect });
  const b = ndcBounds(pts, obj, cam);
  near(b.x0, rect.x0, 1e-3);
  near(b.y0, rect.y0, 1e-3);
  assert.ok(b.x1 <= rect.x1 + 1e-3 && b.y1 <= rect.y1 + 1e-3, 'inside the box');
  assert.ok((b.x1 - b.x0 >= (rect.x1 - rect.x0) - 1e-3) || (b.y1 - b.y0 >= (rect.y1 - rect.y0) - 1e-3), 'fills the box on its limiting side');
  assert.ok(obj.position.z < 0, 'in front of the camera');

  const cam2 = new THREE.PerspectiveCamera(30, 540 / 620, 1, 120);
  const dir = new THREE.Vector3(-0.3, 0.6, 0.75).normalize();
  const still = new THREE.Group();
  fitCamera({ camera: cam2, object: still, points: pts, dir, target: new THREE.Vector3(0, 1.6, 0), rect: { x0: -0.8, x1: 0.8, y0: -0.5, y1: 0.8 } });
  const c = ndcBounds(pts, still, cam2);
  assert.ok(c.x0 >= -0.8 - 1e-3 && c.x1 <= 0.8 + 1e-3 && c.y0 >= -0.5 - 1e-3 && c.y1 <= 0.8 + 1e-3, 'framed inside the card');
});

test('layout: the big controls (in-shop overlay) fit the deck, do not overlap and stay clear of the arm pivot', async () => {
  const { LAYOUT, TONEARM, controlLayout, distance } = await load('tonearm');
  const c = controlLayout(true);
  const circles = [
    ['record', LAYOUT.record, LAYOUT.platterRadius],
    ['knob', c.knob, c.knobRadius + 0.14],
    ['pivot', TONEARM.pivot, 0.18],
    ...Object.entries(c.buttons).map(([n, b]) => [n, b, b.radius + c.ring]),
  ];
  for (const [name, p, r] of circles) {
    assert.ok(Math.abs(p.x) + r <= LAYOUT.deckHalfWidth + 1e-9, `${name} off the deck (x)`);
    assert.ok(Math.abs(p.z) + r <= LAYOUT.deckHalfDepth + 1e-9, `${name} off the deck (z)`);
  }
  for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
    const gap = distance(circles[i][1], circles[j][1]) - circles[i][2] - circles[j][2];
    assert.ok(gap > 0.02, `${circles[i][0]} overlaps ${circles[j][0]} (gap ${gap.toFixed(3)})`);
  }
  // bigger than the original controls
  const small = controlLayout(false);
  assert.ok(c.knobRadius > small.knobRadius * 1.2);
  for (const n of Object.keys(c.buttons)) assert.ok(c.buttons[n].radius > small.buttons[n].radius * 1.3, n);
});

// ---- the record's label: which cover it shows through a pick, ads and track changes ----
test('label: a playlist pick keeps its cover through the wait and an ad, then follows the real tracks', async () => {
  const { createLabelPolicy } = await load('suitcase/label');
  const l = createLabelPolicy();
  l.land('PLAYLIST', null);                         // picked a playlist: no videoId to compare with
  assert.deepStrictEqual(l.sync(null, null), { keep: true });          // 25 s of nothing playing
  assert.deepStrictEqual(l.sync(null, null), { keep: true });          // the ad: ytm-page leaves videoId out while adPlaying
  assert.ok(l.pending);
  const first = l.sync('T1', 'ART1');                                  // the first real song
  assert.strictEqual(first.want, 'PLAYLIST');                          // still the picked cover until its art is known to differ
  assert.deepStrictEqual(first.compare, { vid: 'T1', picked: 'PLAYLIST', own: 'ART1' });
  assert.ok(!l.pending);
  l.prefer('T1', 'ART1');                                              // the caller found the art is a different picture
  assert.strictEqual(l.sync('T1', 'ART1').want, 'ART1');
  assert.strictEqual(l.sync('T2', 'ART2').want, 'ART2');               // skip: the next track's own art
  assert.strictEqual(l.sync('T1', 'ART1').want, 'ART1');               // and back
});

test('label: a song pick keeps its cover when the playing track has the same picture', async () => {
  const { createLabelPolicy } = await load('suitcase/label');
  const l = createLabelPolicy();
  l.land('SONGCOVER', 'OLD');
  assert.deepStrictEqual(l.sync('OLD', 'OLDART'), { keep: true });     // the old song is still reported for a moment
  const r = l.sync('NEW', 'NEWART');
  assert.strictEqual(r.want, 'SONGCOVER');
  assert.ok(r.compare);                                                // caller compares; the same picture means no prefer()
  assert.strictEqual(l.sync('NEW', 'NEWART').want, 'SONGCOVER');       // and it stays
  assert.strictEqual(l.sync('NEXT', 'NEXTART').want, 'NEXTART');
});

test('label: the new track may already be playing when the record lands', async () => {
  const { createLabelPolicy } = await load('suitcase/label');
  const l = createLabelPolicy();
  l.land('COVER', 'OLD');
  assert.strictEqual(l.sync('NEW', null).want, 'COVER');               // no art known: the picked cover stays
  assert.ok(!l.pending);
});

test('label: with no pick, tracks show their own art, and a track without art keeps the plain label', async () => {
  const { createLabelPolicy } = await load('suitcase/label');
  const l = createLabelPolicy();
  assert.strictEqual(l.sync('A', 'ARTA').want, 'ARTA');
  assert.strictEqual(l.sync('B', null).want, null);
});

test('label: picking the song that is already playing keeps waiting, so the cover is not lost', async () => {
  const { createLabelPolicy } = await load('suitcase/label');
  const l = createLabelPolicy();
  l.land('COVER', 'SAME');
  assert.deepStrictEqual(l.sync('SAME', 'ART'), { keep: true });
  assert.ok(l.pending);
});
