const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/racks/cover-cache.js');
const MIN = 60 * 1000;

test('covers: one no sleeve shows and nobody asked for in a while is let go of', async () => {
  const { staleCovers } = await load();
  const old = { size: 256, used: 0 };
  assert.deepEqual(staleCovers(new Map([['256|a', old]]), new Set(), 3 * MIN), ['256|a']);
});

test('covers: one a sleeve still shows stays, however long ago it was asked for', async () => {
  const { staleCovers } = await load();
  const shown = { size: 256, used: 0 }, gone = { size: 256, used: 0 };
  const cache = new Map([['256|shown', shown], ['256|gone', gone]]);
  assert.deepEqual(staleCovers(cache, new Set([shown]), 60 * MIN), ['256|gone']);
});

test('covers: one asked for a moment ago stays (a record in flight, the drawer, the album spread)', async () => {
  const { staleCovers, COVER_IDLE_MS } = await load();
  const fresh = { size: 256, used: 10 * MIN };
  const cache = new Map([['256|fresh', fresh]]);
  assert.deepEqual(staleCovers(cache, new Set(), 10 * MIN + COVER_IDLE_MS - 1), []);
  assert.deepEqual(staleCovers(cache, new Set(), 10 * MIN + COVER_IDLE_MS), ['256|fresh']);
});

test('covers: the big hover covers are not its business (they have their own short list)', async () => {
  const { staleCovers } = await load();
  const cache = new Map([['512|a', { size: 512, used: 0 }], ['256|a', { size: 256, used: 0 }]]);
  assert.deepEqual(staleCovers(cache, new Set(), 60 * MIN), ['256|a']);
});

test('covers: a restock that changes two shelves lets go of exactly what left the racks', async () => {
  const { staleCovers } = await load();
  const cache = new Map();
  const shelf = (name, n, at) => Array.from({ length: n }, (_, i) => {
    const e = { size: 256, used: at };
    cache.set(`256|${name}${i}`, e);
    return e;
  });
  const kept = shelf('kept', 24, 0), left = shelf('left', 24, 0), came = shelf('came', 24, 45 * MIN);
  const stale = staleCovers(cache, new Set([...kept, ...came]), 46 * MIN);
  assert.equal(stale.length, left.length);
  assert.ok(stale.every((key) => key.startsWith('256|left')));
});
