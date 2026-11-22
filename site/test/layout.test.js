import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, modeBlend, armAngle, needleRadius, ARM, rand, timeLabel } from '../src/layout.js';

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

test('the needle lands at the radius asked for', () => {
  for (const r of [ARM.rest, ARM.outer, 0.7, ARM.inner]) {
    const a = armAngle(r);
    const x = ARM.pivot[0] + Math.cos(a) * ARM.length;
    const y = ARM.pivot[1] + Math.sin(a) * ARM.length;
    assert.ok(Math.abs(Math.hypot(x, y) - r) < 1e-9, `radius ${r}`);
  }
});

test('the needle moves inward as the song plays and parks off the record', () => {
  assert.equal(needleRadius(null), ARM.rest);
  assert.ok(ARM.rest > 1);
  assert.equal(needleRadius(0), ARM.outer);
  assert.equal(needleRadius(1), ARM.inner);
  assert.ok(needleRadius(0.5) < needleRadius(0.2));
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
