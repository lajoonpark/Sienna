// The suitcase's pure parts, as tested in the app (app/test/suitcase.test.cjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, CONTROLS, TONEARM, stylusAt, armAngleAtRadius, armAngleForProgress, parkedArmAngle } from '../src/suitcase/tonearm.js';
import { LidHinge } from '../src/suitcase/lid.js';
import { VolumeKnob, RecordScrub, SECONDS_PER_TURN, recordAngle } from '../src/suitcase/controls.js';

const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} !~ ${b}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const run = (hinge, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) hinge.step(1 / 60); };

test('knob: dragging follows the pointer and never flips across the gap', () => {
  const k = new VolumeKnob(0);
  k.drag(0);
  near(k.volume, 0.5);
  k.drag(0.75 * Math.PI);
  near(k.volume, 1);
  k.drag(-0.75 * Math.PI);
  near(k.volume, 0);
  const hi = new VolumeKnob(0.9);
  hi.drag(Math.PI);
  assert.equal(hi.volume, 1);
  const lo = new VolumeKnob(0.1);
  lo.drag(Math.PI);
  assert.equal(lo.volume, 0);
});

test('scrub: clockwise goes forward, anticlockwise back, clamped to the song', () => {
  const s = new RecordScrub(0, 60, 200);
  s.update(Math.PI / 2);
  near(s.position, 60 + SECONDS_PER_TURN / 4);
  s.update(-Math.PI / 2);
  near(s.position, 60 - SECONDS_PER_TURN / 4);
  const f = new RecordScrub(0, 25, 30);
  let a = 0;
  for (let i = 0; i < 20; i++) { a += Math.PI / 2; f.update(a % (2 * Math.PI)); }
  assert.equal(f.position, 30);
  near(recordAngle(1, 0), Math.PI / 2);
});

test('lid: released from shut it ends open and at rest, at any frame rate', () => {
  for (const fps of [30, 60, 120]) {
    const h = new LidHinge();
    h.release();
    for (let t = 0; h.mode !== 'resting' && t < 5; t += 1 / fps) {
      h.step(1 / fps);
      assert.ok(h.angle >= 0 && h.angle <= h.stop);
    }
    near(h.angle, h.stop, 1e-9, `fps ${fps}`);
  }
});

test('lid: shutting lands shut with a clack, and a reopened lid ends open', () => {
  const h = new LidHinge();
  h.release();
  run(h, 4);
  h.shut();
  let hardest = 0;
  for (let t = 0; h.mode !== 'resting' && t < 4; t += 1 / 60) hardest = Math.max(hardest, h.step(1 / 60));
  near(h.angle, 0);
  assert.ok(hardest > 0);
  h.release();
  run(h, 0.2);
  h.shut();
  run(h, 0.1);
  h.release();
  run(h, 4);
  near(h.angle, h.stop);
});

test('tonearm: the stylus lands on the grooves asked for and moves inward as the song plays', () => {
  for (const r of [TONEARM.outerRadius, 0.8, TONEARM.innerRadius]) {
    const s = stylusAt(r);
    near(distance(s, LAYOUT.record), r);
    near(distance(s, TONEARM.pivot), TONEARM.length);
    assert.ok(s.z < LAYOUT.record.z + 0.01 && r > LAYOUT.labelRadius && r < LAYOUT.recordRadius);
  }
  const th = armAngleAtRadius(0.8), s = stylusAt(0.8);
  near(-Math.cos(th) * TONEARM.length, s.x - TONEARM.pivot.x);
  near(Math.sin(th) * TONEARM.length, s.z - TONEARM.pivot.z);
  assert.notEqual(armAngleForProgress(0), armAngleForProgress(0.5));
  assert.equal(armAngleForProgress(-3), armAngleForProgress(0));
});

test('tonearm: parked, the stylus is clear of the record and still on the deck', () => {
  const th = parkedArmAngle();
  const tip = { x: TONEARM.pivot.x - Math.cos(th) * TONEARM.length, z: TONEARM.pivot.z + Math.sin(th) * TONEARM.length };
  assert.ok(distance(tip, LAYOUT.record) > LAYOUT.recordRadius);
  assert.ok(Math.abs(tip.x) < LAYOUT.deckHalfWidth && Math.abs(tip.z) < LAYOUT.deckHalfDepth);
});

test('layout: the controls fit the deck, overlap nothing and stay clear of the arm pivot', () => {
  const circles = [
    ['record', LAYOUT.record, LAYOUT.platterRadius],
    ['knob', CONTROLS.knob, CONTROLS.knobRadius + 0.14],
    ['pivot', TONEARM.pivot, 0.18],
    ...Object.entries(CONTROLS.buttons).map(([n, b]) => [n, b, b.radius + CONTROLS.ring]),
  ];
  for (const [name, p, r] of circles) {
    assert.ok(Math.abs(p.x) + r <= LAYOUT.deckHalfWidth && Math.abs(p.z) + r <= LAYOUT.deckHalfDepth, `${name} off the deck`);
  }
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      assert.ok(distance(circles[i][1], circles[j][1]) - circles[i][2] - circles[j][2] > 0.02, `${circles[i][0]} overlaps ${circles[j][0]}`);
    }
  }
});
