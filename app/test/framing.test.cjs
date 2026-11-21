const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../src/framing.js');
const view = { l: 10, t: 10, r: 990, b: 700 };
// the cursor at (cx, cy) must stay inside the record box, shrunk by `inset` px
const keepFor = (box, cx, cy, inset = 0) => [[
  [cx - (box.l + inset), cy - (box.t + inset)], [cx - (box.r - inset), cy - (box.t + inset)],
  [cx - (box.r - inset), cy - (box.b - inset)], [cx - (box.l + inset), cy - (box.b - inset)],
]];

test('framing: a box already clear does not move', async () => {
  const { frameShift } = await load();
  const box = { l: 400, t: 200, r: 600, b: 400 };
  assert.deepStrictEqual(frameShift({ box, view, obstacles: [], keep: keepFor(box, 500, 300, 30) }), [0, 0]);
});

test('framing: cut off by the right edge slides left just enough', async () => {
  const { frameShift } = await load();
  const box = { l: 900, t: 200, r: 1100, b: 400 };
  const [dx, dy] = frameShift({ box, view, obstacles: [], keep: keepFor(box, 960, 300, 30) });
  assert.ok(Math.abs(dx + 110) < 1e-6 && Math.abs(dy) < 1e-6, `${dx},${dy}`);
});

test('framing: never slides the cursor off the record (stops at the inset)', async () => {
  const { frameShift } = await load();
  const box = { l: 900, t: 200, r: 1100, b: 400 };
  // cursor near the record's right edge: it can only slide 40 px left before the cursor is 30 px from that edge
  const [dx] = frameShift({ box, view, obstacles: [], keep: keepFor(box, 1030, 300, 30) });
  assert.ok(Math.abs(dx + 40) < 1e-6, String(dx));
});

test('framing: clears a menu word by the cheaper way out', async () => {
  const { frameShift } = await load();
  const box = { l: 700, t: 300, r: 900, b: 500 };
  const word = { l: 850, t: 450, r: 990, b: 520 }; // overlaps the bottom-right corner
  const [dx, dy] = frameShift({ box, view, obstacles: [word], keep: keepFor(box, 800, 400, 30) });
  // up or left by 50 px, nothing is covered afterwards
  const { coveredArea } = await load();
  assert.strictEqual(coveredArea({ l: box.l + dx, t: box.t + dy, r: box.r + dx, b: box.b + dy }, view, [word]), 0);
  assert.ok(Math.hypot(dx, dy) <= 50 + 1e-6, `${dx},${dy}`);
});

test('framing: with no clear spot, leaves the least covered', async () => {
  const { frameShift, coveredArea } = await load();
  const box = { l: 800, t: 200, r: 1100, b: 400 }; // 110 px past the edge, cursor pins it to 60 px
  const keep = keepFor(box, 1040, 300, 0);
  const [dx] = frameShift({ box, view, obstacles: [], keep });
  assert.ok(Math.abs(dx + 60) < 1e-6, String(dx));
  assert.ok(coveredArea({ l: box.l + dx, t: box.t, r: box.r + dx, b: box.b }, view, []) > 0);
});

test('framing: cursors too far apart for one slide -> stays put', async () => {
  const { frameShift } = await load();
  const box = { l: 900, t: 200, r: 1100, b: 400 };
  // hover began near the left edge, the cursor is now near the right: no slide keeps both 60 px inside
  const keep = [...keepFor(box, 920, 300, 60), ...keepFor(box, 1080, 300, 60)];
  assert.deepStrictEqual(frameShift({ box, view, obstacles: [], keep }), [0, 0]);
});
