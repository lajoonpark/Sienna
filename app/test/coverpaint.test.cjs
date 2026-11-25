const test = require('node:test');
const assert = require('node:assert/strict');

test('brush ridges lift dark paint as well as scaling it, so dark covers still read as painted', async () => {
  const { darkLift } = await import('../src/coverpaint.js');
  const lit = (v, shade) => v * shade + (shade - 1) * darkLift(v, v, v);
  const ridge = (v) => lit(v, 1.3) - lit(v, 0.7);
  assert.ok(ridge(4) > 30, `near-black ridge contrast ${ridge(4).toFixed(1)}`);
  assert.ok(ridge(30) > 0.4 * ridge(200), 'a dark cover gets a good share of a light cover\'s relief');
  assert.ok(darkLift(250, 250, 250) < 0.1, 'light paint is lit as before');
});
