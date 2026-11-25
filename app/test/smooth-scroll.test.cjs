const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/ui/smooth-scroll.js');

test('scroll damping approaches the target gradually and is independent of frame rate', async () => {
  const { scrollStep } = await load();
  const advance = count => {
    let position = 0;
    for (let i = 0; i < count; i++) position = scrollStep(position, 6, 100 / count, 0.005);
    return position;
  };
  const slow = advance(3), fast = advance(12);
  assert.ok(slow > 0 && slow < 6);
  assert.ok(Math.abs(slow - fast) < 1e-10);
  assert.equal(scrollStep(slow, 6, 600, 0.005), 6);
  assert.ok(scrollStep(slow, 0, 100, 0.005) < slow);
});

test('wheel input normalizes pixel, line and page units', async () => {
  const { wheelPixels } = await load();
  assert.equal(wheelPixels(-56, 0, 200), -56);
  assert.equal(wheelPixels(2, 1, 200), 80);
  assert.equal(wheelPixels(1, 2, 200), 200);
});
