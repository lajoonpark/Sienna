// What the shop and the mini window both do with the Up next queue (liner.js hands them its items):
// which covers go on the records stacked in the suitcase's drawer, and how a picked entry is played.
// No DOM and no three in here, so it is unit tested (test/queue-pick.test.cjs).

// The art of the first `n` records of the stack: the playing song on top, then what follows it (round
// to the start of the list once it runs out).
export function queueStackArts(items, n = 5) {
  if (!items?.length) return [];
  const sel = items.findIndex((it) => it.selected);
  const ordered = sel > 0 ? [...items.slice(sel), ...items.slice(0, sel)] : items;
  return ordered.slice(0, n).map((it) => it.art);
}

// How to play queue entry `it` (at `idx` in the list shown): { play } for music.play / startSong, with
// its place in the live queue when it came from there (so YouTube Music jumps to it and the queue goes on
// from there), or { queueIndex } for an entry with no video id of its own (music.command('queueIndex', n)).
export function queuePick(it, idx) {
  const queueIndex = it.index ?? idx;
  if (!it.videoId) return { queueIndex };
  return {
    play: {
      videoId: it.videoId,
      ...(it.playlistId ? { playlistId: it.playlistId } : {}),
      ...(it.params ? { params: it.params } : {}),
      ...(it.fromLive ? { fromLive: true, queueIndex } : {}),
    },
  };
}
