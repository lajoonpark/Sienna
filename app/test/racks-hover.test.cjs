const test = require('node:test');
const assert = require('node:assert/strict');

test('a lost pointer drops the hover lock without a hit test', async () => {
  const { focusHover } = await import('../src/racks/hover.js');
  const px = { x: 120, y: 200 };
  const focus = { freeze: { key: 0, ...px } };
  assert.equal(focusHover(focus, null, px, 4, () => assert.fail('no live pointer')), -1);
  assert.equal(focus.freeze, null);
});

test('a fast move uses the current hit, but a small twitch keeps the locked record', async () => {
  const { focusHover } = await import('../src/racks/hover.js');
  const focus = { freeze: { key: 0, x: 120, y: 200 } };
  const pointer = { x: 0, y: 0 };
  assert.equal(focusHover(focus, pointer, { x: 123, y: 200 }, 4, () => assert.fail('still locked')), 0);
  assert.equal(focusHover(focus, pointer, { x: 210, y: 280 }, 4, () => -1), -1);
  assert.equal(focus.freeze, null);
  assert.equal(focusHover(focus, pointer, { x: 215, y: 280 }, 4, () => 2), 2);
});

test('a record under the cursor on the previous frame is not a current hit', async () => {
  const { focusHover } = await import('../src/racks/hover.js');
  const focus = { key: 0, freeze: null };
  assert.equal(focusHover(focus, { x: 0, y: 0 }, { x: 210, y: 280 }, 4, () => -1), -1);
  assert.equal(focus.freeze, null);
});
