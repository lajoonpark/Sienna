const { test } = require('node:test');
const assert = require('node:assert/strict');

test('the wound sheet starts flush with the flat sheet and builds up in layers', async () => {
  const { rollProfile } = await import('../src/ui/paper-roll.js');
  const short = rollProfile(35);
  const long = rollProfile(480);
  assert.deepEqual(long.point(0), { y: 0, z: 0, feed: 0 });
  assert.ok(long.point(Math.PI).z > short.point(Math.PI).z);
  assert.ok(long.point(0.1).y > 0 && long.point(0.1).z > 0);
  assert.ok(long.end > 4 * Math.PI, 'a long sheet has multiple visible turns at the open end');
  assert.ok(Math.abs(long.point(long.end).feed - 480) < 1e-8);
  assert.ok(long.point(2 * Math.PI).z < long.point(4 * Math.PI).z, 'inner turns stack behind the outer rim');
});

test('the torn lip rotates through the curl and returns flat without stretching', async () => {
  const { rollProfile } = await import('../src/ui/paper-roll.js');
  for (const length of [0, 1, 15, 35, 60]) {
    const profile = rollProfile(length);
    const lip = profile.point(profile.end);
    assert.ok(Math.abs(lip.feed - length) < 1e-8);
  }
  const early = rollProfile(60), middle = rollProfile(35), late = rollProfile(1);
  assert.ok(early.point(early.end).y < 0);
  assert.ok(middle.point(middle.end).z > 18);
  assert.ok(late.point(late.end).z < 0.2);
});
