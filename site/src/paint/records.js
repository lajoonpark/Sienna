// The demo records on the page: made-up songs, albums and playlists in the app's own words (its fake
// record store, app/src/music.js), so nothing here is somebody else's cover. Pure data.

export const RECORDS = [
  { title: 'Liked music', artist: 'Your likes', kind: 'liked', count: 48 },
  { title: 'Olive Tapes', artist: 'The Arches', kind: 'song' },
  { title: 'Fig Echoes', artist: 'Sienna Lane', kind: 'song' },
  { title: 'Lemon Hours', artist: 'Mira Sol', kind: 'song' },
  { title: 'Terracotta Waltz', artist: 'Casa Verde', kind: 'album', count: 11 },
  { title: 'Sunday Slow Down', artist: 'Sienna', kind: 'playlist', count: 24 },
  { title: 'Piazza Static', artist: 'Lio & Bea', kind: 'song' },
  { title: 'Velvet Letters', artist: 'Ottavia', kind: 'album', count: 9 },
  { title: 'Harbour Rooms', artist: 'Northbound', kind: 'song' },
  { title: 'Night Garden', artist: 'Sienna', kind: 'playlist', count: 10 },
  { title: 'Moon Balcony', artist: 'Juno Hale', kind: 'song' },
  { title: 'Copper Weather', artist: 'Old Lanterns', kind: 'album', count: 12 },
  { title: 'Linen Bloom', artist: 'Paper Kites Club', kind: 'song' },
  { title: 'Swallow Tide', artist: 'Mira Sol', kind: 'song' },
  { title: 'Marble Songs', artist: 'The Arches', kind: 'album', count: 8 },
  { title: 'Ember Lights', artist: 'Casa Verde', kind: 'song' },
  { title: 'Terracotta Mix', artist: 'Sienna', kind: 'playlist', count: 30 },
  { title: 'Quiet Hours', artist: 'Juno Hale', kind: 'song' },
  { title: 'Blue Waltz', artist: 'Lio & Bea', kind: 'song' },
  { title: 'Garden Gold', artist: 'Ottavia', kind: 'album', count: 15 },
  { title: 'Slow Echoes', artist: 'Northbound', kind: 'song' },
  { title: 'Paper Tide', artist: 'Old Lanterns', kind: 'song' },
  { title: 'Lemon Hours Radio', artist: 'Sienna', kind: 'playlist', count: 42 },
  { title: 'Sunday Static', artist: 'Sienna Lane', kind: 'song' },
].map((r, i) => ({ ...r, index: i, seed: i * 101 + 7, duration: 150 + ((i * 53) % 120) }));

// The line under the title on a record's paper tag, as the app writes it.
export function subtitleOf(r) {
  if (r.kind === 'album') return `Album • ${r.artist}`;
  if (r.kind === 'playlist') return `Playlist • ${r.count} songs`;
  if (r.kind === 'liked') return `${r.count} liked songs`;
  return r.artist;
}
