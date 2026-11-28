const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/queue-pick.js');
const song = (n, extra = {}) => ({ videoId: `v${n}`, title: `Song ${n}`, art: `art${n}`, ...extra });

test('queue stack: the playing song is on top, then what follows, round to the start', async () => {
  const { queueStackArts } = await load();
  const items = [song(1), song(2), song(3, { selected: true }), song(4)];
  assert.deepEqual(queueStackArts(items), ['art3', 'art4', 'art1', 'art2']);
  assert.deepEqual(queueStackArts(items, 2), ['art3', 'art4']);
});

test('queue stack: with the first song playing, or none marked, the list keeps its order', async () => {
  const { queueStackArts } = await load();
  const items = [song(1, { selected: true }), song(2), song(3)];
  assert.deepEqual(queueStackArts(items), ['art1', 'art2', 'art3']);
  assert.deepEqual(queueStackArts([song(1), song(2)]), ['art1', 'art2']);
});

test('queue stack: no more than n, and nothing for an empty queue', async () => {
  const { queueStackArts } = await load();
  const items = Array.from({ length: 12 }, (_, i) => song(i + 1));
  assert.equal(queueStackArts(items).length, 5);
  assert.deepEqual(queueStackArts([]), []);
  assert.deepEqual(queueStackArts(null), []);
});

test('queue pick: a live entry plays in place, with its playlist and its spot in the queue', async () => {
  const { queuePick } = await load();
  const it = song(7, { playlistId: 'PL1', params: 'abc', fromLive: true, index: 9 });
  assert.deepEqual(queuePick(it, 2), { play: { videoId: 'v7', playlistId: 'PL1', params: 'abc', fromLive: true, queueIndex: 9 } });
});

test('queue pick: an entry that is not from the live queue is just its song', async () => {
  const { queuePick } = await load();
  assert.deepEqual(queuePick(song(7), 2), { play: { videoId: 'v7' } });
  assert.deepEqual(queuePick(song(7, { playlistId: 'PL1' }), 2), { play: { videoId: 'v7', playlistId: 'PL1' } });
});

test('queue pick: a live entry without an index of its own takes its place in the list shown', async () => {
  const { queuePick } = await load();
  assert.deepEqual(queuePick(song(7, { fromLive: true }), 4).play.queueIndex, 4);
  assert.deepEqual(queuePick(song(7, { fromLive: true, index: 0 }), 4).play.queueIndex, 0);
});

test('queue pick: an entry with no video id is picked by its place in the queue', async () => {
  const { queuePick } = await load();
  assert.deepEqual(queuePick({ title: 'Untitled', index: 3 }, 1), { queueIndex: 3 });
  assert.deepEqual(queuePick({ title: 'Untitled' }, 1), { queueIndex: 1 });
});
