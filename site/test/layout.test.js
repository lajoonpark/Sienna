import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, MODE, modeBlend, scrollToMode, wave, scatter, rand, timeLabel } from '../src/layout.js';

test('modeBlend stays inside the list of modes', () => {
  assert.deepEqual(modeBlend(-3), { a: 0, b: 1, t: 0 });
  const end = modeBlend(99);
  assert.equal(end.b, MODES.length - 1);
  assert.equal(end.t, 1);
  const mid = modeBlend(1.5);
  assert.equal(mid.a, 1);
  assert.equal(mid.b, 2);
  assert.ok(Math.abs(mid.t - 0.5) < 1e-9);
});

test('a section holds its layout around its centre', () => {
  assert.equal(modeBlend(2.1).t, 0);
  assert.equal(modeBlend(1.9).t, 1);
});

test('every section of the page has a layout', () => {
  for (const m of ['float', 'alley', 'rack', 'player', 'edge', 'ring']) assert.ok(m in MODE, m);
});

test('scroll anchors: linear between, held past the ends, held across a pinned stretch', () => {
  const anchors = [{ y: 100, s: 0 }, { y: 300, s: 1 }, { y: 900, s: 1 }, { y: 1100, s: 2 }];
  assert.equal(scrollToMode(0, anchors), 0);
  assert.equal(scrollToMode(200, anchors), 0.5);
  assert.equal(scrollToMode(600, anchors), 1);
  assert.equal(scrollToMode(1000, anchors), 1.5);
  assert.equal(scrollToMode(5000, anchors), 2);
});

test('the wave gives every record its turn, in order, and finishes them all', () => {
  const n = 24;
  for (let i = 0; i < n; i++) {
    assert.equal(wave(0, i, n), 0);
    assert.equal(wave(1, i, n), 1);
  }
  assert.ok(wave(0.3, 0, n) > wave(0.3, 10, n));
  assert.ok(wave(0.3, 10, n) >= wave(0.3, 20, n));
});

test('scattered records leave room between them', () => {
  const box = { x0: -6, x1: 6, y0: -3.5, y1: 3.5, z0: -7, z1: 2 };
  const pts = scatter(24, box, (i) => 0.55 + rand(i, 4) * 0.8, { room: 0.4 });
  assert.equal(pts.length, 24);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z);
      assert.ok(d >= pts[i].r + pts[j].r, `${i} and ${j} are ${d.toFixed(2)} apart`);
    }
  }
  assert.deepEqual(scatter(24, box, () => 0.8), scatter(24, box, () => 0.8), 'and land the same way every time');
});

test('rand is deterministic and in range', () => {
  for (let i = 0; i < 50; i++) {
    const v = rand(i, 3);
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, rand(i, 3));
  }
});

test('timeLabel formats minutes and seconds', () => {
  assert.equal(timeLabel(0), '0:00');
  assert.equal(timeLabel(102.9), '1:42');
});
