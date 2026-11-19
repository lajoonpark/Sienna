// Pure helpers for large collections (Liked music & playlists/albums with > 15 songs),
// kept free of DOM / CSS imports so Node unit tests can import them directly.

export const LARGE_COLLECTION_MIN = 16;

export const isLikedCollection = (it) => !!it && (it.isLikedMusic || it.play?.playlistId === 'LM' || it.browseId === 'VLLM');

export function shouldUseCollectionList(collection, songCount) {
  return isLikedCollection(collection) || songCount >= LARGE_COLLECTION_MIN;
}

export function filterCollectionSongs(songs, query, field = 'all') {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return songs;
  const words = q.split(/\s+/).filter(Boolean);
  return songs.filter((item) => {
    let hay;
    if (field === 'title') hay = item.title || '';
    else if (field === 'artist') hay = item.subtitle || '';
    else if (field === 'album') hay = item.album || '';
    else hay = `${item.title || ''} ${item.subtitle || ''} ${item.album || ''}`;
    const low = hay.toLowerCase();
    return words.every((w) => low.includes(w));
  });
}
