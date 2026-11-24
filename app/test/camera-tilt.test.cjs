const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/camera-tilt.js');

test('camera tilt: the same cursor moves track at the same speed at 30 and 60 fps', async () => {
  const { createCameraTilt } = await load();
  const slow = createCameraTilt(), fast = createCameraTilt();
  for (const [x, y] of [[1, -1], [-1, 1], [0.25, 0.1]]) {
    slow.tx = fast.tx = x;
    slow.ty = fast.ty = y;
    for (let i = 0; i < 8; i++) {
      slow.step(1 / 30);
      fast.step(1 / 60);
      fast.step(1 / 60);
      assert.ok(Math.hypot(slow.x - fast.x, slow.y - fast.y) < 1e-4);
    }
  }
});

test('camera tilt: small moves respond promptly and a full sweep stays speed-limited', async () => {
  const { createCameraTilt } = await load();
  const tilt = createCameraTilt();
  tilt.tx = 0.2;
  tilt.step(1 / 60);
  assert.ok(tilt.x > 0.005, 'starts responding on the next frame');
  for (let i = 1; i < 12; i++) tilt.step(1 / 60);
  assert.ok(tilt.x >= 0.18, 'reaches 90% of a small move within 200 ms');

  tilt.x = tilt.tx = -1;
  tilt.step(1, true);
  tilt.tx = 1;
  tilt.step(1 / 30);
  assert.ok(tilt.x + 1 < 0.08, 'starts an edge-to-edge move gently');
  for (let i = 1; i < 15; i++) tilt.step(1 / 30);
  assert.ok(tilt.x >= 0.8, 'reaches 90% of a full sweep within 500 ms');

  const diagonal = createCameraTilt();
  diagonal.tx = diagonal.ty = 1;
  for (let i = 0; i < 30; i++) {
    const { x, y } = diagonal;
    diagonal.step(1 / 60);
    assert.ok(Math.hypot(diagonal.x - x, diagonal.y - y) * 60 <= 4.5, 'both axes share the speed limit');
  }
});

test('camera tilt: fast reversals bend the motion instead of yanking the view back and forth', async () => {
  const { createCameraTilt } = await load();
  const tilt = createCameraTilt();
  tilt.tx = 1;
  for (let i = 0; i < 6; i++) tilt.step(1 / 60);
  const before = tilt.x;
  tilt.tx = -1;
  tilt.step(1 / 60);
  assert.ok(tilt.x > before, 'slows existing motion before changing direction');
  for (let i = 0; i < 6; i++) tilt.step(1 / 60);
  assert.ok(tilt.x < before, 'turns toward the new target');

  for (const fps of [30, 60]) {
    const wiggle = createCameraTilt(), samples = [];
    for (let i = 0; i < fps; i++) {
      wiggle.tx = Math.floor(i / (fps / 15)) % 2 ? -1 : 1;
      wiggle.step(1 / fps);
      if (i >= fps / 2) samples.push(wiggle.x);
    }
    assert.ok(Math.max(...samples) - Math.min(...samples) < 0.18, 'filters rapid full-width cursor swings');
  }
});

test('camera tilt: a held record stops tilt and releasing it eases toward the latest cursor', async () => {
  const { createCameraTilt } = await load();
  const tilt = createCameraTilt();
  tilt.tx = tilt.ty = 1;
  tilt.step(0.1);
  const { x, y } = tilt;
  tilt.tx = -0.6;
  tilt.ty = 0.1;
  tilt.step(1 / 30, true);
  assert.deepEqual([tilt.x, tilt.y], [x, y]);
  tilt.step(1 / 60);
  assert.ok(tilt.x < x && tilt.y < y, 'releases without the pre-hold velocity');
  for (let i = 0; i < 60; i++) tilt.step(1 / 60);
  assert.deepEqual([tilt.x, tilt.y], [-0.6, 0.1], 'comes to an exact rest');
});
