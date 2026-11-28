const test = require('node:test');
const assert = require('node:assert/strict');
const { createPromiseCache } = require('../electron/cache.cjs');

const tick = () => new Promise((r) => setImmediate(r));

test('cache: one load per key, shared while it is in flight and after', async () => {
  const cache = createPromiseCache();
  let loads = 0;
  const load = async () => { loads++; return ['a']; };
  const [a, b] = await Promise.all([cache.get('k', load), cache.get('k', load)]);
  assert.equal(loads, 1);
  assert.equal(a, b);
  assert.deepEqual(await cache.get('k', load), ['a']);
  assert.equal(loads, 1);
});

test('cache: an answer is asked for afresh once it is older than ttlMs', async () => {
  let t = 1000;
  const cache = createPromiseCache({ ttlMs: 500, now: () => t });
  let loads = 0;
  const load = async () => `v${++loads}`;
  assert.equal(await cache.get('k', load), 'v1');
  t += 499;
  assert.equal(await cache.get('k', load), 'v1');
  t += 2;
  assert.equal(await cache.get('k', load), 'v2');
  assert.equal(cache.size, 1);
});

test('cache: a failed load is forgotten, so the next ask tries again', async () => {
  const cache = createPromiseCache();
  let loads = 0;
  const load = async () => { if (++loads === 1) throw new Error('offline'); return 'lyrics'; };
  await assert.rejects(cache.get('k', load), /offline/);
  await tick();
  assert.equal(cache.size, 0);
  assert.equal(await cache.get('k', load), 'lyrics');
  assert.equal(loads, 2);
});

test('cache: a load that throws at once still comes back as a rejected promise', async () => {
  const cache = createPromiseCache();
  await assert.rejects(cache.get('k', () => { throw new Error('boom'); }), /boom/);
});

test('cache: an answer keep() turns down is not kept, a real "nothing" is', async () => {
  const lists = createPromiseCache({ keep: (list) => list.length > 0 });
  let loads = 0;
  assert.deepEqual(await lists.get('k', async () => { loads++; return []; }), []);
  await tick();
  assert.deepEqual(await lists.get('k', async () => { loads++; return ['song']; }), ['song']);
  assert.equal(loads, 2);

  const lyrics = createPromiseCache();   // null = this song has no lyrics: worth remembering
  let asked = 0;
  assert.equal(await lyrics.get('k', async () => { asked++; return null; }), null);
  assert.equal(await lyrics.get('k', async () => { asked++; return null; }), null);
  assert.equal(asked, 1);
});

test('cache: only the newest max keys are kept, and asking again makes a key the newest', async () => {
  const cache = createPromiseCache({ max: 2 });
  const loads = [];
  const load = (k) => async () => { loads.push(k); return k; };
  await cache.get('a', load('a'));
  await cache.get('b', load('b'));
  await cache.get('a', load('a'));   // a is now newer than b
  await cache.get('c', load('c'));   // b goes
  assert.equal(cache.size, 2);
  await cache.get('a', load('a'));
  await cache.get('b', load('b'));
  assert.deepEqual(loads, ['a', 'b', 'c', 'b']);
});

test('cache: delete and clear forget (another account signed in)', async () => {
  const cache = createPromiseCache();
  let loads = 0;
  const load = async () => ++loads;
  await cache.get('LM', load);
  await cache.get('PL1', load);
  assert.equal(cache.delete('LM'), true);
  assert.equal(await cache.get('LM', load), 3);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(await cache.get('PL1', load), 4);
});

test('cache: an old load that finishes late never evicts the answer that replaced it', async () => {
  let t = 0;
  const cache = createPromiseCache({ ttlMs: 10, now: () => t, keep: (v) => v !== 'empty' });
  let release;
  const slow = cache.get('k', () => new Promise((r) => { release = r; }));
  t = 20;   // expired while still loading
  assert.equal(await cache.get('k', async () => 'fresh'), 'fresh');
  release('empty');   // the old one answers now, with something keep() refuses
  await slow;
  await tick();
  assert.equal(cache.size, 1);
  assert.equal(await cache.get('k', async () => 'again'), 'fresh');
});
