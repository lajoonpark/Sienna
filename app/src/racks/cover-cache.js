// Which of the shop's resting (256 px) covers can be let go of. racks/common.js keeps one texture per
// picture, shared by every sleeve that shows it, and used to keep them all for as long as the window was
// open: every restock, search and queue left its pictures on the GPU (about a third of a megabyte each),
// so a shop left open for a day held hundreds of megabytes of covers nobody could see any more.
// A cover goes when no sleeve shows it and nobody has asked for it for a while (a record in flight, the
// drawer's stack and the album spread ask and then hold on to it for seconds, not minutes).
// Kept free of three and the DOM, so it is unit tested (test/racks-covers.test.cjs).
export const COVER_IDLE_MS = 2 * 60 * 1000;

//   entries: [key, { size, used }] pairs (the cache's own Map does)   size: px, used: when last asked for
//   inUse:   Set of the entries that sleeves show now
// -> the keys to let go of
export function staleCovers(entries, inUse, now, { idleMs = COVER_IDLE_MS, maxSize = 256 } = {}) {
  const out = [];
  for (const [key, e] of entries) {
    if (e.size > maxSize || inUse.has(e) || now - e.used < idleMs) continue;
    out.push(key);
  }
  return out;
}
