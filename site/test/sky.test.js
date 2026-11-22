import test from 'node:test';
import assert from 'node:assert/strict';
import { skyAt, contrast, lanternLevel, clockLabel } from '../src/sky.js';

test('sky text stays readable against both ends of the sky all day', () => {
  for (let h = 0; h < 24; h += 0.25) {
    const s = skyAt(h);
    const worst = Math.min(contrast(s.fg, s.top), contrast(s.fg, s.bottom));
    assert.ok(worst >= 3, `hour ${h}: contrast ${worst.toFixed(2)} (${s.fg} on ${s.top}/${s.bottom})`);
  }
});

test('sky wraps around midnight', () => {
  assert.deepEqual(skyAt(24), skyAt(0));
  assert.deepEqual(skyAt(-1), skyAt(23));
});

test('night is dark and noon is light', () => {
  assert.equal(skyAt(1).dark, true);
  assert.equal(skyAt(12).dark, false);
});

test('lanterns are off by day, on at night, and rise through dusk', () => {
  assert.equal(lanternLevel(12), 0);
  assert.equal(lanternLevel(23), 1);
  assert.equal(lanternLevel(2), 1);
  assert.ok(lanternLevel(18.5) > 0 && lanternLevel(18.5) < 1);
  assert.ok(lanternLevel(19) > lanternLevel(18));
});

test('clock label pads hours and minutes', () => {
  assert.equal(clockLabel(7.5), '07:30');
  assert.equal(clockLabel(24.25), '00:15');
});
