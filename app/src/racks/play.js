// Which sleeves are empty: the one on the suitcase, plus the one just picked until the player
// confirms (the player's state lags a moment behind the click). When that song is paused on the
// suitcase, its sleeve stays empty (peeking) but can still be picked again to restart it.
export function createPlayTracker({ now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
  let playing = null, paused = false, pendingId = null, pendingUntil = 0;
  return {
    set(id, isPaused = false) {
      playing = id ?? null;
      paused = !!isPaused;
      if (id && id === pendingId && !paused) pendingId = null;
    },
    picked(item) { pendingId = item?.play?.videoId ?? null; pendingUntil = now() + 4000; },
    isEmpty(item) {
      const id = item?.play?.videoId;
      if (!id) return false;
      return id === playing || (id === pendingId && now() < pendingUntil);
    },
    canPick(item) {
      const id = item?.play?.videoId;
      if (!id) return true;
      if (id === pendingId && now() < pendingUntil) return false;
      return id !== playing || paused;
    },
  };
}
