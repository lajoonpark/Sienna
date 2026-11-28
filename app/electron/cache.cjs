// Remembers the answers to slow questions asked of YouTube Music (a playlist's songs, its covers, a
// song's lyrics) by key, so asking again is free. Used by ytm.cjs; no Electron in here, so it is unit tested.
//
//   const songs = createPromiseCache({ ttlMs: 10 * 60 * 1000, max: 60, keep: (list) => list.length > 0 });
//   songs.get(id, () => fetchSongs(id))   -> the promise in flight or kept for `id`, else load()'s
//   songs.delete(id) / songs.clear()      -> forget one / all (another account signed in)
//
// An answer is kept for `ttlMs` (then asked for afresh: playlists and Liked music change), and only the
// newest `max` keys are kept. A load that fails, or whose answer `keep` turns down (an empty list from a
// request that went wrong), is forgotten at once, so the next ask tries again instead of repeating it.
function createPromiseCache({ ttlMs = Infinity, max = 200, keep = () => true, now = Date.now } = {}) {
  const entries = new Map();   // key -> { promise, at }, oldest first

  return {
    get(key, load) {
      const hit = entries.get(key);
      if (hit && now() - hit.at < ttlMs) {
        entries.delete(key);
        entries.set(key, hit);   // asked for again: now the newest
        return hit.promise;
      }
      const entry = { at: now(), promise: null };
      entry.promise = Promise.resolve().then(load);
      entries.delete(key);
      entries.set(key, entry);
      const drop = () => { if (entries.get(key) === entry) entries.delete(key); };
      entry.promise.then((value) => { if (!keep(value)) drop(); }, drop);
      while (entries.size > max) entries.delete(entries.keys().next().value);
      return entry.promise;
    },
    delete(key) { return entries.delete(key); },
    clear() { entries.clear(); },
    get size() { return entries.size; },
  };
}

module.exports = { createPromiseCache };
