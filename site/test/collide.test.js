import test from 'node:test';
import assert from 'node:assert/strict';
import { separation, resolve, overlaps } from '../src/collide.js';
import { rand } from '../src/layout.js';

const v = (x, y, z) => ({ x, y, z });
const norm = (a) => { const m = Math.hypot(a.x, a.y, a.z); return v(a.x / m, a.y / m, a.z / m); };
const disk = (p, n, r = 1, w = 1) => ({ kind: 'disk', p, n: norm(n), r, h: 0.0175 * r, w, v: v(0, 0, 0) });
const box = (p, s = 1, w = 1, yaw = 0) => ({
  kind: 'box', p, ax: v(Math.cos(yaw), 0, -Math.sin(yaw)), ay: v(0, 1, 0), az: v(Math.sin(yaw), 0, Math.cos(yaw)), e: [s, s, 0.03 * s], w,
});

// Brute force: does any point of disk A (sampled on both faces and the rim) sit inside disk B?
function touching(A, B) {
  const n = A.n;
  const t = Math.abs(n.x) < 0.9 ? v(1, 0, 0) : v(0, 1, 0);
  const a = norm(v(n.y * t.z - n.z * t.y, n.z * t.x - n.x * t.z, n.x * t.y - n.y * t.x));
  const b = v(n.y * a.z - n.z * a.y, n.z * a.x - n.x * a.z, n.x * a.y - n.y * a.x);
  for (let i = -24; i <= 24; i++) {
    for (let j = -24; j <= 24; j++) {
      const u = (i / 24) * A.r, w = (j / 24) * A.r;
      if (u * u + w * w > A.r * A.r) continue;
      for (const s of [-A.h, 0, A.h]) {
        const p = v(A.p.x + a.x * u + b.x * w + n.x * s, A.p.y + a.y * u + b.y * w + n.y * s, A.p.z + a.z * u + b.z * w + n.z * s);
        const d = v(p.x - B.p.x, p.y - B.p.y, p.z - B.p.z);
        const dn = d.x * B.n.x + d.y * B.n.y + d.z * B.n.z;
        const inPlane = Math.hypot(d.x - dn * B.n.x, d.y - dn * B.n.y, d.z - dn * B.n.z);
        if (Math.abs(dn) <= B.h && inPlane <= B.r) return true;
      }
    }
  }
  return false;
}

test('far apart or stacked face to face with a gap, records do not collide', () => {
  assert.equal(separation(disk(v(0, 0, 0), v(0, 0, 1)), disk(v(5, 0, 0), v(0, 0, 1))), null);
  assert.equal(separation(disk(v(0, 0, 0), v(0, 0, 1)), disk(v(0.3, 0, 0.2), v(0, 0, 1))), null);
});

test('crossing records are found and pushed apart until they no longer touch', () => {
  const pairs = [
    [disk(v(0, 0, 0), v(0, 0, 1)), disk(v(0.4, 0.1, 0), v(1, 0, 0))],
    [disk(v(0, 0, 0), v(0, 0, 1)), disk(v(0.2, 0.3, 0.1), v(0.3, 1, 0.4))],
    [disk(v(0, 0, 0), v(0, 0, 1)), disk(v(0.5, 0, 0.01), v(0, 0, 1))],
    [disk(v(0, 0, 0), v(0.2, 0.1, 1)), disk(v(0.9, -0.2, 0.05), v(-0.3, 0.2, 1), 0.7)],
  ];
  for (const [A, B] of pairs) {
    assert.ok(touching(A, B) || touching(B, A), 'the pair starts out touching');
    assert.ok(separation(A, B), 'and is detected');
    resolve([A, B], { margin: 0.02, iterations: 6 });
    assert.ok(!touching(A, B) && !touching(B, A), 'after the push they do not touch');
  }
});

test('the detector never misses a real overlap (random pairs)', () => {
  for (let k = 0; k < 300; k++) {
    const A = disk(v(0, 0, 0), v(rand(k, 1) - 0.5, rand(k, 2) - 0.5, rand(k, 3) - 0.5), 0.6 + rand(k, 4));
    const B = disk(v((rand(k, 5) - 0.5) * 3, (rand(k, 6) - 0.5) * 3, (rand(k, 7) - 0.5) * 1.5), v(rand(k, 8) - 0.5, rand(k, 9) - 0.5, rand(k, 10) - 0.5), 0.6 + rand(k, 11));
    if (touching(A, B) || touching(B, A)) assert.ok(separation(A, B, 0), `pair ${k} overlaps but was not caught`);
  }
});

test('a crowd of records settles with no two of them touching', () => {
  const bodies = [];
  for (let i = 0; i < 26; i++) {
    bodies.push(disk(v((rand(i, 1) - 0.5) * 6, (rand(i, 2) - 0.5) * 4, (rand(i, 3) - 0.5) * 2), v(rand(i, 4) - 0.5, rand(i, 5) - 0.5, 1), 0.5 + rand(i, 6) * 0.7));
  }
  for (let frame = 0; frame < 60; frame++) resolve(bodies, { margin: 0.02, iterations: 4 });
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      assert.ok(!touching(bodies[i], bodies[j]) && !touching(bodies[j], bodies[i]), `${i} and ${j} touch`);
    }
  }
});

test('a held record does not move; the other one makes room', () => {
  const A = disk(v(0, 0, 0), v(0, 0, 1), 1, 0);
  const B = disk(v(0.3, 0, 0), v(1, 0, 0), 1, 1);
  resolve([A, B], { iterations: 4 });
  assert.deepEqual(A.p, v(0, 0, 0));
  assert.ok(!overlaps(A, B));
});

test('two records that swap sides within one step went through: they are put back', () => {
  const memory = new Map();
  const A = disk(v(0, 0, 0), v(0, 0, 1));
  const B = disk(v(0.2, 0, 0.3), v(0, 0, 1));
  resolve([A, B], { memory });
  B.p.z = -0.3; // a fast step straight through A
  resolve([A, B], { memory, iterations: 4 });
  assert.ok(B.p.z - A.p.z > 0, 'B is back in front of A');
  assert.ok(!overlaps(A, B));
});

test('sleeves (boxes) collide with each other and with records', () => {
  const s1 = box(v(0, 0, 0), 1), s2 = box(v(0.5, 0, 0), 1, 1, 1.2);
  assert.ok(separation(s1, s2));
  resolve([s1, s2], { iterations: 6 });
  assert.ok(!overlaps(s1, s2));
  const s3 = box(v(0, 0, 0), 1), d = disk(v(0, 0.4, 0), v(1, 0, 0), 0.8);
  assert.ok(separation(s3, d));
  resolve([s3, d], { iterations: 6 });
  assert.ok(!overlaps(s3, d));
  assert.equal(separation(box(v(0, 0, 0)), box(v(0, 0, 0.5))), null, 'parallel sleeves a little apart are fine');
});
