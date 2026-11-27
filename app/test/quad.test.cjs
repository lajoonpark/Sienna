const test = require('node:test');
const assert = require('node:assert');

// apply a CSS matrix3d (column-major) to a point of the box
function at(css, x, y) {
  const m = css.slice('matrix3d('.length, -1).split(',').map(Number);
  const w = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
}

test('quad: the box corners land on the four points, tilted and in perspective', async () => {
  const { quadTransform } = await import('../src/quad.js');
  const w = 200, h = 80;
  const q = [[100, 50], [305, 62], [290, 148], [108, 131]];
  const css = quadTransform(w, h, q);
  [[0, 0], [w, 0], [w, h], [0, h]].forEach(([x, y], i) => {
    const [px, py] = at(css, x, y);
    assert.ok(Math.abs(px - q[i][0]) < 0.01 && Math.abs(py - q[i][1]) < 0.01, `corner ${i}: ${px}, ${py}`);
  });
});

test('quad: a plain rectangle is a plain move and scale', async () => {
  const { quadTransform } = await import('../src/quad.js');
  const css = quadTransform(100, 50, [[10, 20], [210, 20], [210, 120], [10, 120]]);
  assert.deepStrictEqual(at(css, 50, 25), [110, 70]);
});

test('quad: points folded flat give nothing to draw', async () => {
  const { quadTransform } = await import('../src/quad.js');
  assert.strictEqual(quadTransform(100, 50, [[0, 0], [10, 0], [20, 0], [30, 0]]), null);
});
