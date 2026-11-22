import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraAt, DOOR_OPEN, clockAt, T, HOME } from '../src/alley/path.js';
import { sunAt } from '../src/alley/sun.js';

test('the walk starts in the alley behind the stall and ends inside the shop', () => {
  const a = cameraAt(0).pos;
  assert.ok(a.z > 20 && a.y < 1, `starts low in the alley (${a.z.toFixed(1)}, ${a.y.toFixed(2)})`);
  const b = cameraAt(0.9).pos;
  assert.ok(Math.abs(b.z - HOME.pos[2]) < 0.05 && Math.abs(b.x) < 0.05, 'reaches the spot just inside the door');
  assert.ok(cameraAt(1).pos.z < -0.55, 'and stays inside the hall');
});

test('scrolling only ever walks forward, and never through the walls of the alley', () => {
  let lastZ = Infinity;
  for (let p = 0; p <= 1.0001; p += 0.005) {
    const { pos } = cameraAt(p);
    assert.ok(pos.z <= lastZ + 1e-6, `goes back at ${p.toFixed(3)}`);
    lastZ = pos.z;
    const half = pos.z > 4.6 ? 3.4 : 5.4;
    assert.ok(Math.abs(pos.x) < half - 0.3 && pos.y > 0.3 && pos.y < 4.0, `out of bounds at ${p.toFixed(3)}`);
    // through the doorway only between the jambs, and only once the doors are open
    if (pos.z < 0.2 && pos.z > -0.6) assert.ok(Math.abs(pos.x) < 0.8 && DOOR_OPEN(p) > 0.6, `walks into the door at ${p.toFixed(3)}`);
  }
});

test('the doors open on the app\'s beat, before the camera gets there', () => {
  assert.equal(DOOR_OPEN(0), 0);
  assert.equal(DOOR_OPEN(1), 1);
  assert.ok(Math.abs(clockAt(0.9) - T.enter) < 1e-9);
  let opened = false;
  for (let p = 0; p <= 1; p += 0.01) if (DOOR_OPEN(p) > 0.99) { opened = true; assert.ok(cameraAt(p).pos.z > -0.3); break; }
  assert.ok(opened);
});

test('the sun is up at noon and down at midnight, all year round', () => {
  for (const month of [0, 3, 6, 9]) {
    const d = new Date(2026, month, 15);
    assert.ok(sunAt(13, d).e > 15, `noon in month ${month}`);
    assert.ok(sunAt(0.5, d).e < -10, `midnight in month ${month}`);
  }
});
