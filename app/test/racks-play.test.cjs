const test = require('node:test');
const assert = require('node:assert');

const load = (name) => import(`../src/${name}.js`);

test('play tracker: playing sleeve is empty and blocked; pausing keeps it empty but pickable', async () => {
  const { createPlayTracker } = await load('racks/play');
  let clock = 1000;
  const tracker = createPlayTracker({ now: () => clock });
  const songA = { play: { videoId: 'A' } };
  const songB = { play: { videoId: 'B' } };

  assert.strictEqual(tracker.isEmpty(songA), false);
  assert.strictEqual(tracker.canPick(songA), true);

  tracker.picked(songA);
  assert.strictEqual(tracker.isEmpty(songA), true);
  assert.strictEqual(tracker.canPick(songA), false);
  assert.strictEqual(tracker.canPick(songB), true);

  tracker.set('A', false);
  assert.strictEqual(tracker.isEmpty(songA), true);
  assert.strictEqual(tracker.canPick(songA), false);

  tracker.set('A', true);
  assert.strictEqual(tracker.isEmpty(songA), true);
  assert.strictEqual(tracker.canPick(songA), true);

  // Re-picking while paused holds off duplicate clicks while flying/cueing, even as state stays paused.
  tracker.picked(songA);
  assert.strictEqual(tracker.isEmpty(songA), true);
  assert.strictEqual(tracker.canPick(songA), false);
  clock += 500;
  tracker.set('A', true);
  assert.strictEqual(tracker.canPick(songA), false);

  // Once the song resumes playing, pending clears and it stays unpickable while playing.
  tracker.set('A', false);
  assert.strictEqual(tracker.canPick(songA), false);

  // If paused again after playing, it becomes pickable again.
  tracker.set('A', true);
  assert.strictEqual(tracker.canPick(songA), true);

  // If it never resumed, the pending guard expires after 4 seconds.
  tracker.picked(songA);
  assert.strictEqual(tracker.canPick(songA), false);
  clock += 4000;
  assert.strictEqual(tracker.canPick(songA), true);
});

test('play tracker: items without a videoId are never empty and stay pickable', async () => {
  const { createPlayTracker } = await load('racks/play');
  const tracker = createPlayTracker();
  const album = { play: { playlistId: 'PL1' } };

  tracker.set('A', false);
  assert.strictEqual(tracker.isEmpty(album), false);
  assert.strictEqual(tracker.canPick(album), true);
  tracker.picked(album);
  assert.strictEqual(tracker.isEmpty(album), false);
  assert.strictEqual(tracker.canPick(album), true);
});
