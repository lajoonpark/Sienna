// Music backend for the shop. In the Electron app this is YouTube Music (window.sienna, from
// electron/preload.cjs). In a plain browser (`npm run web`, screenshots) it is a fake record
// store with painted covers, so the rack and buttons can be worked on without an account.
import { rng } from './rand.js';
import { repairArt } from './cover.js';

export function createMusic() {
  return window.sienna ? realMusic(window.sienna) : fakeMusic();
}

// onArt listeners: called with an item after its art was replaced in place.
const artListeners = [];
const artChanged = (item) => { for (const cb of artListeners) cb(item); };

function realMusic(c) {
  return {
    real: true,
    // -> { shelves, next }, returned at once. Covers that are missing or fail to load are repaired in the
    // background (src/cover.js); onArt(cb) tells you each item whose item.art was then replaced.
    shelves: async (next) => {
      const res = await c.home(next);
      repairArt(res.shelves.flatMap((s) => s.items), { getSongArts: (play) => c.playlistArt(play), onChange: artChanged });
      return res;
    },
    onArt: (cb) => artListeners.push(cb),
    // Songs matching a query -> [{ kind: 'song', title, subtitle (artist), album, duration (s), art, play }]
    search: (q) => c.search(q),
    // An album's songs in order -> [{ kind: 'song', title, subtitle, duration?, art, play: { videoId, playlistId } }]:
    // each plays from that song on through the rest of the album. [] if they could not be fetched.
    albumSongs: async (album) => albumSongItems(album, await c.albumSongs(album.play).catch(() => [])),
    play: (item) => c.play(item.play),
    // Load a song without hearing it (resolves when it is ready), then start it from 0:00.
    prepare: (item) => c.prepare(item.play),
    startPrepared: (item) => c.startPrepared(item.play),
    command: (name, arg) => c.command(name, arg),
    signIn: () => c.signIn(),
    // Settings > Account (electron/ytm.cjs)
    account: () => c.account(),
    accounts: () => c.accounts(),
    switchAccount: (i) => c.switchAccount(i),
    addAccount: () => c.addAccount(),
    signOut: () => c.signOut(),
    onState: (cb) => c.onState(cb),
    onAccount: (cb) => c.onAccount(cb),   // signed in, out or switched to another account
  };
}

// Raw album songs ({ videoId, title, subtitle, duration, art }) -> playable song items. Songs play inside
// the album's playlist, so the album carries on in order after the one you picked.
function albumSongItems(album, songs) {
  return (songs ?? []).map((x, i) => ({
    kind: 'song',
    title: x.title,
    subtitle: x.subtitle || album.subtitle || '',
    ...(x.duration ? { duration: x.duration } : {}),
    art: x.art || album.art,
    track: i + 1,
    play: { videoId: x.videoId, playlistId: album.play?.playlistId },
  }));
}

// ---- fake store ------------------------------------------------------------

const WORDS = ['Lemon', 'Terracotta', 'Slow', 'Piazza', 'Night', 'Garden', 'Velvet', 'Paper', 'Moon', 'Harbour', 'Sunday', 'Copper', 'Linen', 'Swallow', 'Olive', 'Blue', 'Marble', 'Ember', 'Quiet', 'Fig'];
const NOUNS = ['Hours', 'Waltz', 'Lights', 'Tapes', 'Rooms', 'Weather', 'Songs', 'Echoes', 'Letters', 'Balcony', 'Static', 'Gold', 'Bloom', 'Tide'];
const ARTISTS = ['Mira Sol', 'The Arches', 'Lio & Bea', 'Casa Verde', 'Northbound', 'Ottavia', 'Paper Kites Club', 'Juno Hale', 'Sienna Lane', 'Old Lanterns'];
const SHELVES = ['Listen again', 'Quick picks', 'Forgotten favourites', 'Mixed for you', 'Golden hour'];

// A painted-looking square cover: a wash background with a few bold shapes and a title.
function fakeCover(seed, title) {
  const r = rng(seed);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const hue = Math.floor(r() * 360);
  const grad = g.createLinearGradient(0, 0, S * r(), S);
  grad.addColorStop(0, `hsl(${hue} ${40 + r() * 40}% ${45 + r() * 30}%)`);
  grad.addColorStop(1, `hsl(${(hue + 40 + r() * 80) % 360} ${40 + r() * 40}% ${25 + r() * 35}%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 3 + r() * 4; i++) {
    g.fillStyle = `hsla(${(hue + 150 + r() * 120) % 360} ${50 + r() * 40}% ${50 + r() * 40}% / ${0.5 + r() * 0.5})`;
    g.beginPath();
    if (r() < 0.5) g.arc(r() * S, r() * S, 20 + r() * 70, 0, Math.PI * 2);
    else g.rect(r() * S, r() * S, 30 + r() * 120, 10 + r() * 60);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.font = '700 26px Georgia, serif';
  g.fillText(title.toUpperCase(), 16, S - 22, S - 32);
  return c.toDataURL('image/jpeg', 0.85);
}

function fakeShelves() {
  const r = rng(7);
  let n = 0;
  return SHELVES.map((title, s) => ({
    title,
    items: Array.from({ length: 14 + Math.floor(r() * 9) }, () => {
      const t = `${WORDS[Math.floor(r() * WORDS.length)]} ${NOUNS[Math.floor(r() * NOUNS.length)]}`;
      const id = `fake${s}_${n++}`;
      return {
        kind: 'song',
        title: t,
        subtitle: ARTISTS[Math.floor(r() * ARTISTS.length)],
        art: fakeCover(n * 13 + 1, t),
        play: { videoId: id },
        duration: 150 + Math.floor(r() * 120),
      };
    }),
  }));
}

// ?playlists=1 adds a shelf of playlists whose covers are missing or broken, to try the collage fallback.
function fakePlaylists(songs) {
  const names = ['Sunday Slow Down', 'Terracotta Mix', 'Night Garden', 'Lemon Hours Radio'];
  return {
    title: 'Playlists',
    items: names.map((title, i) => ({
      kind: 'playlist',
      title,
      subtitle: 'Playlist',
      art: i % 2 ? null : 'https://invalid.invalid/cover.jpg', // blank, then a cover that fails to load
      play: { playlistId: `fakepl${i}` },
    })),
  };
}

// ?albums=1 puts a shelf of albums first (3 to 30 songs each), to try the album spread (src/spread.js).
const ALBUM_SIZES = [9, 3, 22, 12, 6, 15, 30, 11];
function fakeAlbums() {
  const r = rng(91);
  return {
    title: 'Albums for you',
    items: ALBUM_SIZES.map((n, i) => {
      const title = `${WORDS[(i * 7 + 3) % WORDS.length]} ${NOUNS[(i * 5 + 1) % NOUNS.length]}`;
      const artist = ARTISTS[i % ARTISTS.length];
      const art = fakeCover(i * 101 + 7, title);
      const songs = Array.from({ length: n }, (_, k) => ({
        videoId: `fakealb${i}_${k}`,
        title: k === 4 ? `${WORDS[(k + i) % WORDS.length]} ${NOUNS[(k * 3 + i) % NOUNS.length]} (Live at the Harbour Room, Extended Version)` : `${WORDS[(k * 3 + i) % WORDS.length]} ${NOUNS[(k + i * 2) % NOUNS.length]}`,
        subtitle: artist,
        duration: 140 + Math.floor(r() * 160),
        art,
      }));
      return { kind: 'album', title, subtitle: `Album • ${artist}`, art, play: { playlistId: `fakealb${i}` }, songs };
    }),
  };
}

const FAKE_ACCOUNTS = [
  { name: 'Sienna Lane', byline: '@siennalane', handle: '@siennalane', photo: null },
  { name: 'Lemon Grove Records', byline: '@lemongrove', handle: '@lemongrove', photo: null },
];

function fakeMusic() {
  const shelves = fakeShelves();
  const qs = new URLSearchParams(location.search);
  if (qs.has('albums')) shelves.unshift(fakeAlbums());
  const all = shelves.flatMap((s) => s.items).filter((i) => i.kind === 'song');
  const albums = new Map(shelves.flatMap((s) => s.items).filter((i) => i.kind === 'album').map((a) => [a.play.playlistId, a]));
  const withPlaylists = qs.has('playlists');
  if (withPlaylists) shelves.push(fakePlaylists(all));
  const listeners = [];
  const accountCbs = [];
  let who = 0;
  const st = { signedIn: !qs.has('guest'), ready: true, videoId: null, title: null, artist: null, art: null, playerState: -1, position: 0, duration: 0, volume: 70, muted: false, like: 'INDIFFERENT', adPlaying: false };
  let queue = [];
  let at = 0;
  const load = (i) => {
    at = (i + queue.length) % queue.length;
    const it = queue[at];
    Object.assign(st, { videoId: it.play.videoId, title: it.title, artist: it.subtitle, art: it.art, duration: it.duration, position: 0, playerState: 1, like: 'INDIFFERENT' });
  };
  setInterval(() => {
    if (st.playerState === 1) {
      st.position += 0.25;
      if (st.position >= st.duration) load(at + 1);
    }
    for (const cb of listeners) cb({ ...st });
  }, 250);
  const commands = {
    toggle: () => { if (st.videoId) st.playerState = st.playerState === 1 ? 2 : 1; },
    pause: () => { if (st.videoId) st.playerState = 2; },
    next: () => queue.length && load(at + 1),
    previous: () => queue.length && (st.position > 3 ? (st.position = 0) : load(at - 1)),
    seek: (s) => { st.position = Math.max(0, Math.min(st.duration, s)); },
    volume: (v) => { st.volume = Math.max(0, Math.min(100, v)); },
    like: () => { st.like = st.like === 'LIKE' ? 'INDIFFERENT' : 'LIKE'; },
  };
  return {
    real: false,
    shelves: async () => {
      // like the real store: shelves now, repairs of the broken playlist covers a moment later
      if (withPlaylists) repairArt(shelves.flatMap((s) => s.items), { getSongArts: async (play) => { await new Promise((r) => setTimeout(r, 400)); return all.slice(0, 40).filter((_, i) => i % 9 === Number(play.playlistId.slice(-1))).slice(0, 4).map((i) => i.art); }, onChange: artChanged });
      return { shelves, next: null };
    },
    onArt: (cb) => artListeners.push(cb),
    search: async (q) => {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      await new Promise((r) => setTimeout(r, 180)); // a network-ish delay, so the loading state shows
      if (!words.length) return [];
      const seen = new Set();
      return all.filter((i) => {
        const hay = `${i.title} ${i.subtitle}`.toLowerCase();
        const key = hay;
        if (seen.has(key) || !words.every((w) => hay.includes(w))) return false;
        seen.add(key);
        return true;
      }).slice(0, 12);
    },
    // ?albumms=N: pretend fetching an album's songs takes that long
    albumSongs: async (album) => {
      await new Promise((r) => setTimeout(r, Number(qs.get('albumms')) || 120));
      return albumSongItems(album, albums.get(album.play?.playlistId)?.songs);
    },
    play: async (item) => {
      // an album (play all) or a song inside one: the album is the queue, from that song on
      const album = albums.get(item.play?.playlistId);
      if (album) {
        queue = albumSongItems(album, album.songs);
        load(Math.max(0, queue.findIndex((x) => x.play.videoId === item.play.videoId)));
        return;
      }
      const shelf = shelves.find((s) => s.items.includes(item));
      queue = shelf ? shelf.items : all;
      load(queue.indexOf(item));
    },
    // ?loadms=N: pretend a song takes that long to load
    prepare: () => new Promise((r) => setTimeout(r, Number(new URLSearchParams(location.search).get('loadms')) || 0)),
    startPrepared(item) { return this.play(item); },
    command: async (name, arg) => commands[name]?.(arg),
    // a pretend account, so Settings > Account can be worked on in a browser (?guest: signed out)
    signIn: async () => { st.signedIn = true; who = 0; accountCbs.forEach((cb) => cb(true)); },
    account: async () => (st.signedIn ? FAKE_ACCOUNTS[who] : null),
    accounts: async () => (st.signedIn ? FAKE_ACCOUNTS.map((a, i) => ({ ...a, selected: i === who })) : []),
    switchAccount: async (i) => { who = i; accountCbs.forEach((cb) => cb(true)); return true; },
    addAccount: async () => {},
    signOut: async () => { st.signedIn = false; accountCbs.forEach((cb) => cb(false)); return true; },
    onState: (cb) => listeners.push(cb),
    onAccount: (cb) => accountCbs.push(cb),
  };
}
