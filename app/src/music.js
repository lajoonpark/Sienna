// Music backend for the shop. In the Electron app this is YouTube Music (window.sienna, from
// electron/preload.cjs). In a plain browser (`npm run web`, screenshots) it is a fake record
// store with painted covers, so the rack and buttons can be worked on without an account.
import { rng } from './rand.js';
import { repairArt } from './cover.js';

export function createMusic() {
  return window.sienna ? realMusic(window.sienna) : fakeMusic();
}

const artListeners = [];
const artChanged = (item) => { for (const cb of artListeners) cb(item); };

function realMusic(c) {
  return {
    real: true,
    shelves: async (next) => {
      const res = await c.home(next);
      repairArt(res.shelves.flatMap((s) => s.items), { getSongArts: (play) => c.playlistArt(play), onChange: artChanged });
      return res;
    },
    library: async () => {
      const res = await c.library();
      for (const sh of res.shelves ?? []) {
        for (const it of sh.items ?? []) {
          if (it.isLikedMusic && !it.art) it.art = fakeLikedMusicCover();
        }
      }
      repairArt(res.shelves.flatMap((s) => s.items), { getSongArts: (play) => c.playlistArt(play), onChange: artChanged });
      return res;
    },
    onArt: (cb) => artListeners.push(cb),
    search: (q, filter = 'songs') => c.search(q, filter),
    artistSongs: (browseId) => c.artistSongs(browseId),
    albumSongs: async (item) => {
      const req = { ...(item.play ?? {}), ...(item.browseId ? { browseId: item.browseId } : {}) };
      return collectionSongItems(item, await c.albumSongs(req).catch(() => []));
    },
    lyrics: (videoId) => c.lyrics(videoId),
    queue: () => c.queue(),
    play: (item) => c.play(item.play ?? item),
    prepare: (item) => c.prepare(item.play ?? item),
    startPrepared: (item) => c.startPrepared(item.play ?? item),
    command: (name, arg) => c.command(name, arg),
    signIn: () => c.signIn(),
    retry: () => c.retry(),
    status: () => c.status(),
    onStatus: (cb) => c.onStatus?.(cb),
    volumeMode: (mode) => c.volumeMode?.(mode),
    account: () => c.account(),
    accounts: () => c.accounts(),
    switchAccount: (i) => c.switchAccount(i),
    addAccount: () => c.addAccount(),
    signOut: () => c.signOut(),
    onState: (cb) => c.onState(cb),
    onAccount: (cb) => c.onAccount(cb),
    app: c.app,
  };
}

// Raw album/playlist songs ({ videoId, title, subtitle, album, duration, art }) -> playable song items.
function collectionSongItems(collection, songs) {
  return (songs ?? []).map((x, i) => {
    const pid = collection.play?.playlistId || x.playlistId;
    return {
      kind: 'song',
      title: x.title,
      subtitle: x.subtitle || collection.subtitle || '',
      ...(x.album ? { album: x.album } : collection.kind === 'album' ? { album: collection.title } : {}),
      ...(x.duration ? { duration: x.duration } : {}),
      art: x.art || collection.art,
      track: i + 1,
      play: { videoId: x.videoId, ...(pid ? { playlistId: pid } : {}), ...(x.params ? { params: x.params } : {}) },
    };
  });
}

// ---- fake store ------------------------------------------------------------
const WORDS = ['Lemon', 'Terracotta', 'Slow', 'Piazza', 'Night', 'Garden', 'Velvet', 'Paper', 'Moon', 'Harbour', 'Sunday', 'Copper', 'Linen', 'Swallow', 'Olive', 'Blue', 'Marble', 'Ember', 'Quiet', 'Fig'];
const NOUNS = ['Hours', 'Waltz', 'Lights', 'Tapes', 'Rooms', 'Weather', 'Songs', 'Echoes', 'Letters', 'Balcony', 'Static', 'Gold', 'Bloom', 'Tide'];
const ARTISTS = ['Mira Sol', 'The Arches', 'Lio & Bea', 'Casa Verde', 'Northbound', 'Ottavia', 'Paper Kites Club', 'Juno Hale', 'Sienna Lane', 'Old Lanterns'];
const SHELVES = ['Listen again', 'Quick picks', 'Forgotten favourites', 'Mixed for you', 'Golden hour'];

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

function fakePlaylists(songs) {
  const names = ['Sunday Slow Down', 'Terracotta Mix', 'Night Garden', 'Lemon Hours Radio'];
  return {
    title: 'Playlists',
    items: names.map((title, i) => ({
      kind: 'playlist',
      title,
      subtitle: 'Playlist',
      art: i % 2 ? null : 'https://invalid.invalid/cover.jpg',
      play: { playlistId: `fakepl${i}` },
      songs: songs.slice(i * 6, i * 6 + 10).map((s) => ({
        videoId: s.play.videoId,
        title: s.title,
        subtitle: s.subtitle,
        duration: s.duration,
        art: s.art,
      })),
    })),
  };
}

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

function fakeLikedMusicCover() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, '#b4503a');
  grad.addColorStop(0.55, '#8c3734');
  grad.addColorStop(1, '#2d3158');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // cream heart emblem in the centre
  g.fillStyle = '#fbf5e8';
  g.beginPath();
  g.moveTo(S / 2, S * 0.68);
  g.bezierCurveTo(S * 0.22, S * 0.50, S * 0.20, S * 0.24, S * 0.37, S * 0.24);
  g.bezierCurveTo(S * 0.45, S * 0.24, S * 0.50, S * 0.31, S * 0.50, S * 0.35);
  g.bezierCurveTo(S * 0.50, S * 0.31, S * 0.55, S * 0.24, S * 0.63, S * 0.24);
  g.bezierCurveTo(S * 0.80, S * 0.24, S * 0.78, S * 0.50, S / 2, S * 0.68);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(251,245,232,.92)';
  g.font = '700 22px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('LIKED MUSIC', S / 2, S - 24);
  return c.toDataURL('image/jpeg', 0.88);
}

function fakeMusic() {
  const shelves = fakeShelves();
  const qs = new URLSearchParams(location.search);
  const albumsShelf = fakeAlbums();
  if (qs.has('albums')) shelves.unshift(albumsShelf);
  const all = shelves.flatMap((s) => s.items).filter((i) => i.kind === 'song');
  const playlistsShelf = fakePlaylists(all);
  const withPlaylists = qs.has('playlists');
  if (withPlaylists) shelves.push(playlistsShelf);

  const likedArt = fakeLikedMusicCover();
  const likedSongs = all.slice(0, 48).map((s, idx) => ({
    videoId: s.play.videoId,
    title: s.title,
    subtitle: s.subtitle,
    album: `${WORDS[(idx * 3) % WORDS.length]} ${NOUNS[(idx * 5) % NOUNS.length]}`,
    duration: s.duration,
    art: s.art,
  }));
  const likedMusicVinyl = {
    kind: 'playlist',
    title: 'Liked music',
    subtitle: `${likedSongs.length} liked songs`,
    art: likedArt,
    browseId: 'VLLM',
    play: { playlistId: 'LM' },
    isLikedMusic: true,
    songs: likedSongs,
  };
  const richPlaylists = playlistsShelf.items.map((p, i) => ({
    ...p,
    art: fakeCover(500 + i * 17, p.title),
    songs: all.slice(i * 5, i * 5 + (i === 0 ? 24 : 10)).map((s, k) => ({
      videoId: s.play.videoId,
      title: s.title,
      subtitle: s.subtitle,
      album: `${WORDS[(k + i * 4) % WORDS.length]} ${NOUNS[(k * 2 + i) % NOUNS.length]}`,
      duration: s.duration,
      art: s.art,
    })),
  }));

  const collections = new Map([
    [likedMusicVinyl.play.playlistId, likedMusicVinyl],
    ...albumsShelf.items.map((a) => [a.play.playlistId, a]),
    ...richPlaylists.map((p) => [p.play.playlistId, p]),
  ]);

  const listeners = [];
  const accountCbs = [];
  let who = 0;
  let fakeLoginItem = false;
  let fakeDiscordRpc = false;
  const st = {
    signedIn: !qs.has('guest'), ready: true, videoId: null, playlistId: null, title: null, artist: null, art: null,
    playerState: -1, position: 0, duration: 0, volume: 70, muted: false, like: 'INDIFFERENT',
    repeat: 'OFF', shuffle: false, queueSig: '', adPlaying: false,
  };
  let queue = [];
  let at = 0;
  let fakeQRev = 0;
  const updateSig = () => {
    st.queueSig = `${fakeQRev}:${queue.length}:${queue[0]?.play?.videoId || ''}:${queue[1]?.play?.videoId || ''}:${at}`;
  };
  const shuffleQueueInPlace = () => {
    if (queue.length < 2) return;
    const current = queue[at];
    const rest = queue.filter((_, i) => i !== at);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    queue = [current, ...rest];
    at = 0;
    st.shuffle = true;
    fakeQRev++;
    updateSig();
  };
  const load = (i) => {
    if (!queue.length) return;
    at = (i + queue.length) % queue.length;
    const it = queue[at];
    Object.assign(st, {
      videoId: it.play.videoId, playlistId: it.play.playlistId ?? st.playlistId ?? null,
      title: it.title, artist: it.subtitle, art: it.art,
      duration: it.duration || 180, position: 0, playerState: 1, like: 'INDIFFERENT',
    });
    updateSig();
  };
  setInterval(() => {
    if (st.playerState === 1) {
      st.position += 0.25;
      if (st.position >= st.duration) {
        if (st.repeat === 'ONE') st.position = 0;
        else load(at + 1);
      }
    }
    for (const cb of listeners) cb({ ...st });
  }, 250);
  const commands = {
    toggle: () => { if (st.videoId) st.playerState = st.playerState === 1 ? 2 : 1; },
    pause: () => { if (st.videoId) st.playerState = 2; },
    next: () => queue.length && load(at + 1),
    previous: () => queue.length && (st.position > 3 ? (st.position = 0) : load(at - 1)),
    seek: (s) => { st.position = Math.max(0, Math.min(st.duration, s)); },
    volume: (v) => { st.volume = Math.max(0, Math.min(100, v)); if (v > 0) st.muted = false; },
    mute: () => { st.muted = !st.muted; },
    shuffle: () => { shuffleQueueInPlace(); },
    repeat: () => { st.repeat = st.repeat === 'OFF' ? 'ALL' : st.repeat === 'ALL' ? 'ONE' : 'OFF'; },
    like: () => { st.like = st.like === 'LIKE' ? 'INDIFFERENT' : 'LIKE'; },
    queueIndex: (i) => { if (i >= 0 && i < queue.length) load(i); },
  };
  return {
    real: false,
    shelves: async () => {
      if (withPlaylists) repairArt(shelves.flatMap((s) => s.items), { getSongArts: async (play) => { await new Promise((r) => setTimeout(r, 400)); return all.slice(0, 40).filter((_, i) => i % 9 === Number(play.playlistId.slice(-1))).slice(0, 4).map((i) => i.art); }, onChange: artChanged });
      return { shelves, next: null };
    },
    library: async () => ({
      shelves: [
        { title: 'Your playlists', librarySlot: 'playlists', items: [likedMusicVinyl, ...richPlaylists] },
        { title: 'Saved albums', librarySlot: 'albums', items: albumsShelf.items },
      ],
      next: null,
    }),
    onArt: (cb) => artListeners.push(cb),
    search: async (q, filter = 'songs') => {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      await new Promise((r) => setTimeout(r, 140));
      if (!words.length) return [];
      let pool = all;
      if (filter === 'albums') pool = albumsShelf.items;
      else if (filter === 'playlists') pool = playlistsShelf.items.map((p, i) => ({ ...p, art: fakeCover(500 + i * 17, p.title) }));
      else if (filter === 'artists') {
        pool = ARTISTS.map((name, i) => ({ kind: 'artist', title: name, subtitle: 'Artist', browseId: `fakeart_${i}`, art: fakeCover(800 + i * 19, name) }));
      }
      const seen = new Set();
      return pool.filter((i) => {
        const hay = `${i.title} ${i.subtitle}`.toLowerCase();
        if (seen.has(hay) || !words.every((w) => hay.includes(w))) return false;
        seen.add(hay);
        return true;
      }).slice(0, 12);
    },
    artistSongs: async (browseId) => {
      const idx = Number(String(browseId).replace('fakeart_', '')) || 0;
      const name = ARTISTS[idx % ARTISTS.length];
      return { name, items: all.filter((i) => i.subtitle === name).slice(0, 10) };
    },
    albumSongs: async (col) => {
      await new Promise((r) => setTimeout(r, Number(qs.get('albumms')) || 120));
      return collectionSongItems(col, collections.get(col.play?.playlistId)?.songs);
    },
    lyrics: async (videoId) => videoId ? {
      lyrics: 'Warm terracotta on the window sill,\nThe afternoon turns slow and still.\nA needle drops into the groove,\nAnd every painted wall can move.',
      source: 'Sample liner notes (browser preview)',
    } : null,
    queue: async () => queue.map((it, index) => ({
      index, displayIndex: index + 1, fromLive: true, videoId: it.play?.videoId, ...(it.play?.playlistId ? { playlistId: it.play.playlistId } : {}),
      title: it.title, artist: it.subtitle, duration: it.duration, art: it.art, selected: index === at,
    })),
    play: async (item) => {
      const ep = item?.play ?? item ?? {};
      if (ep.fromLive && typeof ep.queueIndex === 'number' && ep.queueIndex >= 0 && ep.queueIndex < queue.length) {
        load(ep.queueIndex);
        return;
      }
      const col = ep.playlistId ? collections.get(ep.playlistId) : null;
      if (col) {
        queue = collectionSongItems(col, col.songs);
        st.playlistId = col.play?.playlistId ?? null;
        st.shuffle = false;
        load(Math.max(0, queue.findIndex((x) => x.play.videoId === ep.videoId)));
        if (ep.shuffle) shuffleQueueInPlace();
        return;
      }
      if (ep.videoId && queue.length) {
        const inQueue = queue.findIndex((x) => x.play?.videoId === ep.videoId);
        if (inQueue >= 0) { load(inQueue); return; }
      }
      const shelf = shelves.find((s) => s.items.includes(item) || (ep.videoId && s.items.some((x) => x.play?.videoId === ep.videoId)));
      queue = shelf ? shelf.items : all;
      st.playlistId = null;
      st.shuffle = false;
      const idx = queue.indexOf(item);
      const byId = idx >= 0 ? idx : (ep.videoId ? queue.findIndex((x) => x.play?.videoId === ep.videoId) : -1);
      load(byId >= 0 ? byId : 0);
      if (ep.shuffle) shuffleQueueInPlace();
    },
    prepare: () => new Promise((r) => setTimeout(r, Number(new URLSearchParams(location.search).get('loadms')) || 0)),
    startPrepared(item) { return this.play(item); },
    command: async (name, arg) => commands[name]?.(arg),
    retry: async () => true,
    status: async () => ({ ok: true, offline: false, error: null, crashed: false }),
    onStatus: () => {},
    volumeMode: async (m) => m || 'app',
    signIn: async () => { st.signedIn = true; who = 0; accountCbs.forEach((cb) => cb(true)); },
    account: async () => (st.signedIn ? FAKE_ACCOUNTS[who] : null),
    accounts: async () => (st.signedIn ? FAKE_ACCOUNTS.map((a, i) => ({ ...a, selected: i === who })) : []),
    switchAccount: async (i) => { who = i; accountCbs.forEach((cb) => cb(true)); return true; },
    addAccount: async () => {},
    signOut: async () => { st.signedIn = false; accountCbs.forEach((cb) => cb(false)); return true; },
    onState: (cb) => listeners.push(cb),
    onAccount: (cb) => accountCbs.push(cb),
    app: {
      info: async () => ({ version: '0.1.0', packaged: false, platform: navigator.platform, arch: 'preview', loginItem: fakeLoginItem, discordRpc: fakeDiscordRpc, supportsSystemVolume: /Mac/.test(navigator.platform) }),
      loginItem: async (on) => { if (typeof on === 'boolean') fakeLoginItem = on; return fakeLoginItem; },
      discordRpc: async (on) => { if (typeof on === 'boolean') fakeDiscordRpc = on; return fakeDiscordRpc; },
      checkUpdates: async () => ({ ok: true, current: '0.1.0', latest: '0.1.0', hasUpdate: false, url: 'https://github.com/lajoonpark/Sienna/releases' }),
      openRelease: async () => true,
      diagnostics: async () => ({ app: { version: '0.1.0', packaged: false }, runtime: { mode: 'browser-preview' }, player: { ready: true, signedIn: st.signedIn } }),
      onMenu: () => {},
    },
  };
}
