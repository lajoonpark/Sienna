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

test('releasing focus locks a miss only while the pointer is live', async () => {
  const { focusHover, lockHover } = await import('../src/racks/hover.js');
  const focus = { freeze: null };
  const pointer = { x: 0, y: 0 }, px = { x: 120, y: 200 };
  lockHover(focus, pointer, px, -1);
  assert.deepEqual(focus.freeze, { key: -1, ...px });
  assert.equal(focusHover(focus, pointer, px, 4, () => assert.fail('still locked on the miss')), -1);
  assert.equal(focusHover(focus, pointer, { x: 125, y: 200 }, 4, () => 2), 2);
  lockHover(focus, null, px, -1);
  assert.equal(focus.freeze, null);
});

test('framing offsets are bounded by the original hover anchor', async () => {
  const { hoverPanBounds } = await import('../src/racks/hover.js');
  const held = { rec: [-0.5, 0.5, -0.5, 0.5], anchor: { x: 0, y: -0.25 } };
  assert.deepEqual(hoverPanBounds(held, 0.125, 0.125), [[-0.375, 0.375], [-0.625, 0.125]]);
});

test('the camera counts as at rest on a record only once it is up and the slide, push-in and swing are done', async () => {
  const { framedAtRest } = await import('../src/racks/hover.js');
  const rest = { restPx: 1.5, restZoom: 0.004, restSwing: 0.002 };
  const done = { settled: true, panLeft: 0.5, zoomLeft: 0.001, swingLeft: 0.0005 };
  assert.equal(framedAtRest(done, rest), true);
  assert.equal(framedAtRest({ ...done, settled: false }, rest), false, 'record still rising');
  assert.equal(framedAtRest({ ...done, panLeft: 6 }, rest), false, 'still sliding clear of the buttons');
  assert.equal(framedAtRest({ ...done, panLeft: Infinity }, rest), false, 'not steered yet');
  assert.equal(framedAtRest({ ...done, zoomLeft: 0.05 }, rest), false, 'still pushing in (or giving the zoom up)');
  assert.equal(framedAtRest({ ...done, swingLeft: 0.02 }, rest), false, 'still swinging round');
});

test('zoom cut does not trigger when the cursor itself pins the cover past a safe margin', async () => {
  const { zoomCutNeeded } = await import('../src/racks/hover.js');
  const safe = [[-0.96, 0.96], [-0.82, 0.94]];
  const keep = [0.02, 0.03];
  // Bottom-row record hovered near its bottom edge with tag flipped above: recB === allB === -0.95 < -0.82,
  // pinned by anchor.y = -0.92 so zooming out cannot raise the cover above -0.95.
  const lowHeld = {
    rec: [-0.15, 0.15, -0.95, -0.55],
    all: [-0.20, 0.20, -0.95, -0.40],
    anchor: { x: 0, y: -0.92 },
  };
  assert.equal(zoomCutNeeded(lowHeld, [0, 0], safe, keep), false);

  // Same on the top edge when the tag is below and the cursor is near the top edge.
  const highHeld = {
    rec: [-0.15, 0.15, 0.60, 0.98],
    all: [-0.20, 0.20, 0.45, 0.98],
    anchor: { x: 0, y: 0.95 },
  };
  assert.equal(zoomCutNeeded(highHeld, [0, 0], safe, keep), false);

  // When the cursor is above the floor but a hanging tag below dips past it, zooming out CAN clear it.
  const hangingTag = {
    rec: [-0.15, 0.15, -0.78, -0.38],
    all: [-0.20, 0.20, -0.90, -0.38],
    anchor: { x: 0, y: -0.75 },
  };
  assert.equal(zoomCutNeeded(hangingTag, [0, 0], safe, keep), true);

  // When the cursor is below the floor AND a hanging tag below clips past the window edge (-1),
  // zooming out can still pull the tag back inside the window.
  const clippedTag = {
    rec: [-0.15, 0.15, -0.90, -0.50],
    all: [-0.20, 0.20, -1.04, -0.50],
    anchor: { x: 0, y: -0.87 },
  };
  assert.equal(zoomCutNeeded(clippedTag, [0, 0], safe, keep), true);
  assert.equal(zoomCutNeeded({ ...clippedTag, all: [-0.20, 0.20, -0.98, -0.50] }, [0, 0], safe, keep), false);

  // Button overlap triggers zoom cut only when the record overlaps more than the cursor's keep-box.
  const btn = [[-0.95, -0.60, -0.02, 0.02]];
  const nearBtn = {
    rec: [-0.70, -0.30, -0.20, 0.20],
    all: [-0.70, -0.30, -0.20, 0.20],
    anchor: { x: -0.55, y: 0 },
  };
  assert.equal(zoomCutNeeded(nearBtn, [0, 0], safe, keep, btn, 0.004), true);
  const onBtnMargin = {
    rec: [-0.62, -0.22, -0.20, 0.20],
    all: [-0.62, -0.22, -0.20, 0.20],
    anchor: { x: -0.60, y: 0 },
  };
  // Button y-span [-0.02, 0.02] lies inside keep-box y-span [-0.03, 0.03], and x-overlap [-0.62, -0.60]
  // matches keep-box [-0.62, -0.58], so zooming out cannot reduce the overlap at all.
  const exactOverlap = (0.02 - 1e-5) * (0.04 - 1e-5);
  assert.equal(zoomCutNeeded(onBtnMargin, [0, 0], safe, keep, btn, exactOverlap), false);
});
