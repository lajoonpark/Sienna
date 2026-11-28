// YouTube Music, played by a hidden music.youtube.com window. That page does the real work
// (audio, ads, queue, radio, history, likes); Sienna drives it through ytm-page.js and reads
// shelves from the same internal API the page uses.
const { BrowserWindow, app, dialog, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseShelves, parseLibraryShelf, parseSearch, parseArtistPage,
  parsePlaylistSongs, playlistContinuation, parseLyricsTab, parseLyrics,
  normalizeQueue, continuation, artDebug, cleanUrl, parseAccount, parseAccounts,
} = require('./ytm-parse.cjs');
const { createSystemVolume } = require('./sysvolume.cjs');
const { createPromiseCache } = require('./cache.cjs');
const { YTM_PARTITION, YTM_ORIGIN, devEnv, isGoogleUrl, isHttpsHostAllowed, lockNavigation } = require('./security.cjs');

const PARTITION = YTM_PARTITION; // cookies survive restarts, so you sign in once
const COMMANDS = new Set(['toggle', 'play', 'pause', 'next', 'previous', 'seek', 'volume', 'mute', 'like', 'shuffle', 'repeat', 'queueIndex']);
const NEEDS_NUMBER = new Set(['seek', 'volume', 'queueIndex']);   // commands that mean nothing without one
const HOME = 'https://music.youtube.com/';
// A player that stops again this soon after it was restarted is not restarted at once, but after a wait
// that grows (scheduleReload): at once, forever, would spin the machine.
const CRASH_LOOP_MS = 20000;
// How long a playlist's songs and covers are kept before YouTube Music is asked again (they change:
// Liked music, your own playlists).
const LIST_TTL_MS = 10 * 60 * 1000;

// YouTube Music search filter params (matching ytmusicapi).
const SEARCH_FILTERS = {
  songs: 'EgWKAQIIAWoMEA4QChADEAQQCRAF',
  albums: 'EgWKAQIYAWoMEA4QChADEAQQCRAF',
  playlists: 'EgeKAQQoAEABagwQDhAKEAMQBBAJEAU%3D',
  artists: 'EgWKAQIgAWoMEA4QChADEAQQCRAF',
  all: null,
};

const PAGE_JS = fs.readFileSync(path.join(__dirname, 'ytm-page.js'), 'utf8');

function chromeUserAgent() {
  return app.userAgentFallback.replace(/\s(Electron|sienna-app|Sienna)\/\S+/gi, '');
}

// Google blocks sign-in from embedded Chromium ("This browser or app may not be secure") but still
// accepts Firefox, so the sign-in window (only) presents itself as Firefox: Firefox user agent, no
// Client Hints headers, no navigator.userAgentData.
const FIREFOX_UA = {
  darwin: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0',
  win32: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
}[process.platform] ?? 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

// Validate/sanitize an endpoint object coming over IPC from the renderer.
function cleanEndpoint(ep) {
  if (!ep || typeof ep !== 'object') return null;
  const out = {};
  if (typeof ep.videoId === 'string' && /^[\w-]{4,64}$/.test(ep.videoId)) out.videoId = ep.videoId;
  if (typeof ep.playlistId === 'string' && /^[\w-]{2,128}$/.test(ep.playlistId)) out.playlistId = ep.playlistId;
  if (typeof ep.params === 'string' && ep.params.length <= 256) out.params = ep.params;
  if (ep.shuffle === true) out.shuffle = true;
  if (ep.fromLive === true) out.fromLive = true;
  if (Number.isInteger(ep.queueIndex) && ep.queueIndex >= 0 && ep.queueIndex <= 2000) out.queueIndex = ep.queueIndex;
  return (out.videoId || out.playlistId || typeof out.queueIndex === 'number') ? out : null;
}

function cleanId(id, max = 128) {
  return typeof id === 'string' && /^[\w-]{2,}$/.test(id) && id.length <= max ? id : null;
}

function originOfUrl(u) {
  try { return new URL(u).origin; } catch { return null; }
}

function hostOfUrl(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return null; }
}

// Identifiers that tie a response to you or your session, not needed to test parsing: dropped from dumps.
const REDACT_KEYS = new Set(['responseContext', 'trackingParams', 'clickTrackingParams', 'visitorData', 'serviceTrackingParams', 'loggingContext', 'adSignalsInfo', 'clientScreenNonce', 'loggingDirectives', 'mainAppWebResponseContext', 'webResponseContextExtensionData']);
function redact(v) {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!REDACT_KEYS.has(k)) out[k] = redact(x);
    return out;
  }
  return v;
}
const DUMP_KEEP = 40, DUMP_MAX_AGE_MS = 24 * 3600 * 1000;
function pruneDumps(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => { const p = path.join(dir, f); return { p, t: fs.statSync(p).mtimeMs }; })
    .sort((a, b) => b.t - a.t);
  const now = Date.now();
  files.forEach(({ p, t }, i) => { if (i >= DUMP_KEEP || now - t > DUMP_MAX_AGE_MS) fs.rmSync(p, { force: true }); });
}

function createYtm({ onState, onAccount, onStatus }) {
  const ua = chromeUserAgent();
  const ytmSession = session.fromPartition(PARTITION);
  let win = null;
  let quitting = false;
  let status = { ok: true, offline: false, error: null, crashed: false };
  let lastSnapshot = null;
  let activePlay = null;
  let retryTimer = null;
  let retryAttempt = 0;
  let lastCrashAt = -Infinity;

  function setStatus(next) {
    const merged = { ...status, ...next };
    if (merged.ok === status.ok && merged.offline === status.offline && merged.error === status.error && merged.crashed === status.crashed) return;
    status = merged;
    onStatus?.(status);
  }

  function scheduleReload(reason, offline = false, crashed = status.crashed) {
    if (quitting || retryTimer) return;
    setStatus({ ok: false, offline, crashed, error: reason });
    const delay = Math.min(30000, 3000 * Math.pow(1.6, retryAttempt++));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!quitting) reloadPlayer();
    }, delay);
  }

  // Send the player to a page. Its window may be gone (it crashed and is waiting to be restarted).
  function load(url) {
    if (!win || win.isDestroyed()) win = createPlayerWindow();
    return win.loadURL(url);
  }

  function bindPlayerWindow(w) {
    lockNavigation(w.webContents, isGoogleUrl);
    w.webContents.setUserAgent(ua);
    w.webContents.setAudioMuted(false);
    w.webContents.on('will-prevent-unload', (e) => e.preventDefault());
    // Only inject window.__sienna on music.youtube.com itself, never on accounts/consent hops.
    w.webContents.on('dom-ready', () => {
      if (originOfUrl(w.webContents.getURL()) === YTM_ORIGIN) {
        w.webContents.executeJavaScript(PAGE_JS).catch(() => {});
      }
    });
    // A cookie consent page (EU) needs the user once: show the window until it is accepted.
    w.webContents.on('did-navigate', (_e, url, httpCode) => {
      const host = hostOfUrl(url) || '';
      if (/^consent\.(youtube|google)\./.test(host)) w.show();
      else if (w.isVisible() && url.startsWith(HOME)) w.hide();
      // YouTube Music answered, but with an error page (too many requests, a fault on their side)
      if (url.startsWith(HOME) && httpCode >= 400) {
        scheduleReload(`YouTube Music is not answering (HTTP ${httpCode}).`);
        return;
      }
      // A page came up: YouTube Music, or one of Google's on the way to it (consent, sign-in). Only here is
      // the player said to be well again, not when a reload is merely started: while offline every retry
      // would otherwise report "fine" and then "offline" again, and the shop's notice would blink each time.
      if (Date.now() - lastCrashAt >= CRASH_LOOP_MS) retryAttempt = 0;   // (one that keeps crashing waits longer each time)
      clearTimeout(retryTimer); retryTimer = null;
      setStatus({ ok: true, offline: false, error: null, crashed: false });
    });
    w.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (!isMainFrame || code === -3) return; // -3 = ERR_ABORTED (normal redirect/reload)
      const offline = code === -106 || code === -105 || code === -109 || /INTERNET_DISCONNECTED|NAME_NOT_RESOLVED/i.test(desc || '');
      console.warn('[sienna] player failed to load:', code, desc);
      scheduleReload(offline ? 'You appear to be offline.' : `Could not load YouTube Music (${desc || code}).`, offline);
    });
    w.webContents.on('render-process-gone', (_e, details) => {
      if (quitting) return;
      console.warn('[sienna] player process crashed:', details?.reason);
      try { if (!w.isDestroyed()) w.destroy(); } catch { /* ignore */ }
      const again = Date.now() - lastCrashAt < CRASH_LOOP_MS;
      lastCrashAt = Date.now();
      if (again) {
        scheduleReload('The YouTube Music player keeps stopping. Trying again shortly…', false, true);
        return;
      }
      setStatus({ ok: false, offline: false, crashed: true, error: 'The YouTube Music player stopped unexpectedly. Restarting…' });
      load(HOME).catch((err) => scheduleReload(err?.message || 'Could not reload YouTube Music.'));
    });
    w.on('close', (e) => { if (!quitting) { e.preventDefault(); w.hide(); } });
  }

  function createPlayerWindow() {
    const w = new BrowserWindow({
      show: false,
      width: 1200,
      height: 800,
      title: 'YouTube Music (Sienna player)',
      webPreferences: {
        partition: PARTITION, backgroundThrottling: true, autoplayPolicy: 'no-user-gesture-required',
        sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false,
      },
    });
    bindPlayerWindow(w);
    return w;
  }

  win = createPlayerWindow();
  app.on('before-quit', () => { quitting = true; clearTimeout(retryTimer); });
  win.loadURL(HOME).catch((err) => {
    if (!quitting) scheduleReload(err?.message || 'Could not reach YouTube Music.', true);
  });

  // The status is left as it is: did-navigate says when the player is well again (see there).
  function reloadPlayer() {
    clearTimeout(retryTimer); retryTimer = null;
    return load(HOME).catch((err) => {
      scheduleReload(err?.message || 'Could not reach YouTube Music.', true);
      return false;
    });
  }

  const js = (code) => {
    if (!win || win.isDestroyed()) return Promise.reject(new Error('player unavailable'));
    return win.webContents.executeJavaScript(code, true);
  };

  // Resolves once the page can be driven. Asked before every call into it, so it is one question:
  // 0 = YouTube Music is not up yet, 1 = it is, without window.__sienna (put in now), 2 = all there.
  const READY_JS = `(window.ytcfg && document.querySelector('ytmusic-app')) ? (window.__sienna ? 2 : 1) : 0`;
  async function ready(timeoutMs = 30000) {
    const t0 = Date.now();
    for (;;) {
      const up = await js(READY_JS).catch(() => 0);
      if (up) {
        if (up === 1) await js(PAGE_JS);
        return;
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('YouTube Music did not load');
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // SIENNA_DUMP=1 (unpackaged runs only) saves raw responses to <userData>/dumps/<endpoint>-<time>-<n>.json
  let dumped = 0;
  const dumping = !!devEnv('SIENNA_DUMP');
  if (process.env.SIENNA_DUMP && app.isPackaged) console.warn('[sienna] SIENNA_DUMP is ignored in a packaged app');
  if (dumping) console.warn('[sienna] SIENNA_DUMP is on: responses from your account are saved under', path.join(app.getPath('userData'), 'dumps'));
  function dump(endpoint, body, res) {
    if (!dumping) return;
    try {
      const dir = path.join(app.getPath('userData'), 'dumps');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, `${endpoint.replace(/[^\w-]/g, '_')}-${new Date().toISOString().replace(/[:.]/g, '-')}-${dumped++}.json`);
      fs.writeFileSync(file, JSON.stringify({ request: redact(body), response: redact(res) }), { mode: 0o600, flag: 'wx' });
      console.warn('[sienna] dumped', file);
      pruneDumps(dir);
    } catch (e) { console.warn('[sienna] dump failed', e.message); }
  }

  const api = async (endpoint, body) => {
    await ready();
    const res = await js(`window.__sienna.api(${JSON.stringify(endpoint)}, ${JSON.stringify(body)})`);
    dump(endpoint, body, res);
    return res;
  };

  const onNoArt = (item, renderer) => console.warn(`[sienna] no art for ${item.kind} "${item.title}"; renderer keys: ${Object.keys(renderer).join(',')}; image-ish paths: ${artDebug(renderer).join(' ') || 'none'}`);

  async function home(next) {
    if (next !== undefined && next !== null && (typeof next !== 'string' || next.length > 4096)) {
      throw new Error('invalid continuation');
    }
    const res = await api('browse', next ? { continuation: next } : { browseId: 'FEmusic_home' });
    return { shelves: parseShelves(res, { onNoArt }), next: continuation(res) };
  }

  // User's YouTube Music Library: Your Playlists (with a single "Liked music" vinyl first) & Saved Albums
  // for the dedicated vaulted Library Room racks.
  async function library() {
    const [plRes, albRes] = await Promise.all([
      api('browse', { browseId: 'FEmusic_liked_playlists' }).catch((e) => { console.warn('[sienna] library playlists', e.message); return null; }),
      api('browse', { browseId: 'FEmusic_liked_albums' }).catch((e) => { console.warn('[sienna] library albums', e.message); return null; }),
    ]);
    const out = [];
    const plShelf = plRes ? parseLibraryShelf(plRes, 'Your playlists', { onNoArt }) : null;
    if (plShelf?.items?.length) {
      const isLiked = (it) => it.play?.playlistId === 'LM' || it.browseId === 'VLLM' || /^liked (music|songs)$/i.test(String(it.title ?? '').trim());
      const existingLiked = plShelf.items.find(isLiked);
      const others = plShelf.items.filter((it) => !isLiked(it));
      const likedVinyl = {
        ...(existingLiked ?? {}),
        kind: 'playlist',
        title: 'Liked music',
        subtitle: existingLiked?.subtitle || 'Your liked songs',
        browseId: 'VLLM',
        play: { ...(existingLiked?.play ?? {}), playlistId: 'LM' },
        isLikedMusic: true,
      };
      out.push({ title: 'Your playlists', librarySlot: 'playlists', items: [likedVinyl, ...others] });
    }
    const albShelf = albRes ? parseLibraryShelf(albRes, 'Saved albums', { onNoArt }) : null;
    if (albShelf?.items?.length) {
      out.push({ title: 'Saved albums', librarySlot: 'albums', items: albShelf.items });
    }
    return { shelves: out, next: null };
  }

  // Search songs, albums, playlists, artists, or all.
  async function search(query, filter = 'songs') {
    const q = String(query ?? '').trim().slice(0, 200);
    if (!q) return [];
    const kind = Object.hasOwn(SEARCH_FILTERS, filter) ? filter : 'songs';
    const params = SEARCH_FILTERS[kind];
    const body = params ? { query: q, params } : { query: q };
    return parseSearch(await api('search', body), { onNoArt, filter: kind });
  }

  async function artistSongs(browseId) {
    const id = cleanId(browseId, 128);
    if (!id) return { name: '', items: [] };
    return parseArtistPage(await api('browse', { browseId: id }), { onNoArt });
  }

  // What is kept of YouTube Music's answers (cache.cjs). Lists are kept for a while only, and an empty one
  // (a request that went wrong) not at all. They are one account's: 'LM' is whoever is signed in, so all
  // of it goes when the account changes (forgetAccount), or the next account would be shown the last one's
  // Liked music.
  const notEmpty = (list) => list.length > 0;
  const songArts = createPromiseCache({ ttlMs: LIST_TTL_MS, max: 300, keep: notEmpty });
  const albumCache = createPromiseCache({ ttlMs: LIST_TTL_MS, max: 60, keep: notEmpty });
  const lyricsCache = createPromiseCache({ max: 40 });
  let switchUrls = [];
  function forgetAccount() {
    songArts.clear();
    albumCache.clear();
    switchUrls = [];
  }

  // Cover urls (up to 4, 256 px) of the first songs of a playlist, album, mix or radio.
  async function playlistArt(play) {
    const ep = cleanEndpoint(play);
    const id = ep?.playlistId;
    if (!id) return [];
    return songArts.get(id, async () => {
      const viaNext = () => api('next', { playlistId: id, videoId: ep.videoId, params: ep.params, isAudioOnly: true });
      const viaBrowse = () => api('browse', { browseId: id.startsWith('VL') ? id : `VL${id}` });
      const mix = /^RD/.test(id) && !/^RDCLAK/.test(id);
      for (const get of mix ? [viaNext, viaBrowse] : [viaBrowse, viaNext]) {
        try {
          const arts = [...new Set(parsePlaylistSongs(await get()).map((x) => x.art).filter(Boolean))];
          if (arts.length) return arts.slice(0, 4).map((u) => u.replace('w544-h544', 'w256-h256'));
        } catch (e) { console.warn('[sienna] playlistArt', id, e.message); }
      }
      return [];
    });
  }

  // Songs of an album, playlist, Liked Music, or mix in order, for the 3D record spread or Collection List.
  // For playlists/albums/Liked Music, follows InnerTube browse continuations so large collections (~600+ songs) load in full.
  const MAX_PLAYLIST_PAGES = 15;
  async function browseAllSongs(browseId) {
    const seen = new Set();
    const out = [];
    let res = await api('browse', { browseId });
    for (let page = 0; page < MAX_PLAYLIST_PAGES && res; page++) {
      let added = 0;
      for (const s of parsePlaylistSongs(res)) {
        if (!seen.has(s.videoId)) { seen.add(s.videoId); out.push(s); added++; }
      }
      const nextTok = playlistContinuation(res);
      if (!nextTok || (page > 0 && added === 0)) break;
      res = await api('browse', { continuation: nextTok }).catch(() => null);
    }
    return out;
  }
  async function albumSongs(play) {
    const ep = cleanEndpoint(play);
    const browseId = cleanId(play?.browseId, 128);
    const id = ep?.playlistId ?? browseId;
    if (!id) return [];
    return albumCache.get(id, async () => {
      const ways = [];
      const isLiked = ep?.playlistId === 'LM' || browseId === 'VLLM';
      const mix = !!ep?.playlistId && /^RD/.test(ep.playlistId) && !/^RDCLAK/.test(ep.playlistId);
      const viaNext = async () => {
        const seen = new Set();
        return parsePlaylistSongs(await api('next', { playlistId: ep.playlistId, videoId: ep.videoId, params: ep.params, isAudioOnly: true }))
          .filter((x) => !seen.has(x.videoId) && seen.add(x.videoId));
      };
      if (isLiked) {
        ways.push(() => browseAllSongs('VLLM'), () => browseAllSongs('FEmusic_liked_videos'));
        if (ep?.playlistId) ways.push(viaNext);
      } else if (mix) {
        ways.push(viaNext);
        if (ep?.playlistId) ways.push(() => browseAllSongs(ep.playlistId.startsWith('VL') ? ep.playlistId : `VL${ep.playlistId}`));
      } else {
        if (browseId) ways.push(() => browseAllSongs(browseId));
        if (ep?.playlistId) {
          const vl = ep.playlistId.startsWith('VL') ? ep.playlistId : `VL${ep.playlistId}`;
          if (vl !== browseId) ways.push(() => browseAllSongs(vl));
          ways.push(viaNext);
        }
      }
      for (const get of ways) {
        try {
          const songs = await get();
          if (songs.length) return songs;
        } catch (e) { console.warn('[sienna] albumSongs', id, e.message); }
      }
      return [];
    });
  }

  // Lyrics for a track via `next` -> Lyrics tab browseId -> `browse`. null: the song has none (kept).
  // A request that fails is passed on and not kept, so the Lyrics card can say so and offer Retry
  // instead of "no lyrics" for a song that has them.
  async function lyrics(videoId) {
    const id = cleanId(videoId, 64);
    if (!id) return null;
    return lyricsCache.get(id, async () => {
      try {
        const tabId = parseLyricsTab(await api('next', { videoId: id, isAudioOnly: true }));
        if (!tabId) return null;
        return parseLyrics(await api('browse', { browseId: tabId }));
      } catch (e) {
        console.warn('[sienna] lyrics', id, e.message);
        throw new Error('could not load the lyrics');
      }
    });
  }

  // Up Next queue: reads YouTube Music's live Redux/Polymer store & DOM queue first, and whenever
  // that has <= 1 track (e.g. player page never opened in the hidden window), fetches the real queue
  // via InnerTube `next` WITH the active `playlistId` (or `RDAMVM<vid>` radio for standalone tracks),
  // falling back to `albumSongs` for playlists that `next` doesn't expand.
  async function queue() {
    await ready();
    const live = await js('window.__sienna?.queue?.()').catch(() => null);
    const liveItems = Array.isArray(live) ? live : (Array.isArray(live?.items) ? live.items : []);
    const livePid = typeof live?.playlistId === 'string' && live.playlistId ? live.playlistId : null;
    const playerOrder = Array.isArray(live?.playerOrder) && live.playerOrder.length >= 2 ? live.playerOrder : null;
    const vid = lastSnapshot?.videoId || activePlay?.videoId || null;
    const pid = livePid || lastSnapshot?.playlistId || activePlay?.playlistId || null;
    const params = pid && activePlay?.playlistId === pid ? activePlay?.params : undefined;

    if (liveItems.length >= 2) {
      return normalizeQueue(liveItems, { currentVideoId: vid, playlistId: pid });
    }

    let best = liveItems;
    const trySongs = (songs) => {
      if (Array.isArray(songs) && songs.length > best.length) best = songs;
    };

    if (pid) {
      try {
        const body = {
          playlistId: pid,
          ...(vid ? { videoId: vid } : {}),
          ...(params ? { params } : {}),
          enablePersistentPlaylistPanel: true,
          isAudioOnly: true,
        };
        trySongs(parsePlaylistSongs(await api('next', body)));
      } catch { /* try playlist browse below */ }
      if (best.length <= 1) {
        try {
          trySongs(await albumSongs({ playlistId: pid, ...(vid ? { videoId: vid } : {}) }));
        } catch { /* ignore */ }
      }
    } else if (vid) {
      try {
        trySongs(parsePlaylistSongs(await api('next', {
          videoId: vid,
          playlistId: `RDAMVM${vid}`,
          enablePersistentPlaylistPanel: true,
          isAudioOnly: true,
        })));
      } catch { /* try plain next below */ }
      if (best.length <= 1) {
        try {
          trySongs(parsePlaylistSongs(await api('next', {
            videoId: vid,
            enablePersistentPlaylistPanel: true,
            isAudioOnly: true,
          })));
        } catch { /* ignore */ }
      }
    }

    return normalizeQueue(best, { currentVideoId: vid, playlistId: pid, playerOrder });
  }

  async function play(rawEndpoint) {
    const endpoint = cleanEndpoint(rawEndpoint);
    if (!endpoint) return false;
    activePlay = endpoint;
    stir();
    await ready();
    const routed = await js(`window.__sienna.navigate(${JSON.stringify(endpoint)})`).catch(() => false);
    if (routed) return true;
    const q = new URLSearchParams();
    if (endpoint.videoId) q.set('v', endpoint.videoId);
    if (endpoint.playlistId) q.set('list', endpoint.playlistId);
    await load(`${HOME}watch?${q}`);
    return true;
  }

  async function prepare(rawEndpoint) {
    const endpoint = cleanEndpoint(rawEndpoint);
    if (!endpoint) return false;
    activePlay = endpoint;
    stir();
    await ready();
    return js(`window.__sienna.prepare(${JSON.stringify(endpoint)})`).catch(() => false);
  }
  async function startPrepared(rawEndpoint) {
    const endpoint = cleanEndpoint(rawEndpoint);
    if (!endpoint) return false;
    stir();
    await ready();
    const held = await js('window.__sienna.release()').catch(() => false);
    if (!held) await play(endpoint);
    return true;
  }

  // Volume mode on macOS: 'system' (Mac output volume) or 'app' (YouTube player volume).
  // Lighter polling: only polls osascript every 5s while Sienna is focused (never while unfocused).
  const sysVol = createSystemVolume();
  let volumeMode = sysVol ? 'system' : 'app';
  const useSysVol = () => !!sysVol && volumeMode === 'system';
  if (useSysVol()) sysVol.refresh();

  const VOLUME_MS = 5000;
  let focused = true, volumeReadAt = Date.now();
  function readVolume() { if (useSysVol()) { volumeReadAt = Date.now(); sysVol.refresh(); } }
  setInterval(() => {
    if (active && focused && useSysVol() && Date.now() - volumeReadAt >= VOLUME_MS - 50) readVolume();
  }, VOLUME_MS);
  function setFocused(on) {
    if (on === focused) return;
    focused = on;
    if (on && active) readVolume();
  }
  function setVolumeMode(mode) {
    if (!sysVol) return 'app';
    volumeMode = mode === 'app' ? 'app' : 'system';
    if (volumeMode === 'system') readVolume();
    stir();
    return volumeMode;
  }

  // The player's own volume (not the Mac's). Scrolling and the knob send many a second and each one is a
  // trip into the page, but only the newest matters: while one is on its way, the rest wait as one.
  let volumeWanted = null, volumeGoing = null;
  function sendVolume(v) {
    volumeWanted = v;
    volumeGoing ??= (async () => {
      try {
        while (volumeWanted !== null) {
          const next = volumeWanted;
          volumeWanted = null;
          await ready();
          await js(`window.__sienna.command("volume", ${JSON.stringify(next)})`);
        }
        return true;
      } finally { volumeGoing = null; volumeWanted = null; }
    })();
    return volumeGoing;
  }

  async function command(name, arg) {
    if (!COMMANDS.has(name)) return false;
    // a number that is one: NaN would silence the Mac (sysvolume.cjs reads it as 0) or seek to nowhere
    if (arg !== null && arg !== undefined && !Number.isFinite(arg)) return false;
    if (NEEDS_NUMBER.has(name) && !Number.isFinite(arg)) return false;
    if (name === 'volume' && useSysVol()) { sysVol.set(arg); return true; }
    if (name === 'mute' && useSysVol()) { sysVol.toggleMute(); stir(); return true; }
    if (name === 'queueIndex' && (!Number.isInteger(arg) || arg < 0 || arg > 200)) return false;
    stir();
    if (name === 'volume') return sendVolume(arg);
    await ready();
    return js(`window.__sienna.command(${JSON.stringify(name)}, ${JSON.stringify(arg ?? null)})`);
  }

  // Poll the page and pass state on.
  let active = true;
  let lastWho;
  let pollTimer = null;
  let lively = true;
  let stirredUntil = Date.now() + 15000;
  const POLL_MS = { active: 250, resting: 500, idle: 3000 };
  const STIR_MS = 6000;
  const pollGap = () => (!active ? POLL_MS.idle : lively || Date.now() < stirredUntil ? POLL_MS.active : POLL_MS.resting);
  const schedule = () => { clearTimeout(pollTimer); pollTimer = setTimeout(poll, pollGap()); };
  async function poll() {
    try { await pollOnce(); } finally { if (!quitting) schedule(); }
  }
  function stir() {
    const resting = pollGap() !== POLL_MS.active;
    stirredUntil = Math.max(stirredUntil, Date.now() + STIR_MS);
    if (resting && active) schedule();
  }
  function setActive(on) {
    if (on === active) return;
    active = on;
    if (on) { readVolume(); poll(); } else schedule();
  }
  schedule();
  async function pollOnce() {
    if (!win || win.isDestroyed()) return;
    const s = await js('window.__sienna?.state()').catch(() => null);
    lively = !s || s.playerState === 1 || s.playerState === 3;
    if (!s) return;
    s.art = cleanUrl(s.art);
    if (useSysVol()) {
      if (s.volume !== 100 && s.videoId) js('window.__sienna.command("volume", 100)').catch(() => {});
      if (sysVol.get() !== null) s.volume = sysVol.get();
      s.muted = sysVol.isMuted();
    }
    const who = s.who ?? null;
    delete s.who;
    lastSnapshot = s;
    onState(s);
    if (lastWho !== undefined && who !== lastWho && s.ready) {
      forgetAccount();   // before the shop is told, so what it asks for next is the new account's
      onAccount?.(!!s.signedIn);
    }
    if (s.ready) lastWho = who;
  }

  // Player diet: hidden page skips images and fonts (unless visible for consent or SIENNA_PLAYER_DIET=0 in dev).
  if (devEnv('SIENNA_PLAYER_DIET') !== '0') {
    ytmSession.webRequest.onBeforeRequest((d, cb) => {
      const hidden = !!win && !win.isDestroyed() && d.webContentsId === win.webContents.id && !win.isVisible();
      cb({ cancel: hidden && (d.resourceType === 'image' || d.resourceType === 'font') });
    });
  }

  // Google sign-in in a singleton visible window that shares the player's cookies.
  // Its requests go out without Client Hints headers (see FIREFOX_UA). The hook that takes them off sees
  // every request of the session, the player's included, so it is there only while a sign-in window is.
  const signInIds = new Set();
  let signInWin = null;
  function syncSignInHeaders() {
    ytmSession.webRequest.onBeforeSendHeaders(signInIds.size ? (d, cb) => {
      if (signInIds.has(d.webContentsId)) {
        for (const k of Object.keys(d.requestHeaders)) if (/^sec-ch-ua/i.test(k)) delete d.requestHeaders[k];
      }
      cb({ requestHeaders: d.requestHeaders });
    } : null);
  }

  function signIn(parent, start = `https://accounts.google.com/ServiceLogin?service=youtube&continue=${encodeURIComponent(HOME)}`) {
    stir();
    if (signInWin && !signInWin.isDestroyed()) {
      signInWin.show();
      signInWin.focus();
      return;
    }
    const allowedSsoHosts = new Set();
    let promptingHost = null;
    const w = new BrowserWindow({
      width: 480, height: 720, parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: false, title: 'Sign in to YouTube Music',
      webPreferences: {
        partition: PARTITION, preload: path.join(__dirname, 'signin-preload.cjs'),
        sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false,
      },
    });
    signInWin = w;
    // Allow Google hosts by default; if an institutional/work SSO redirects elsewhere, ask the user explicitly.
    lockNavigation(w.webContents, (u) => isHttpsHostAllowed(u, allowedSsoHosts), async (blockedUrl) => {
      const host = hostOfUrl(blockedUrl);
      if (!host || promptingHost === host || w.isDestroyed()) return;
      if (!String(blockedUrl).startsWith('https://')) return;
      promptingHost = host;
      try {
        const { response } = await dialog.showMessageBox(w, {
          type: 'question',
          buttons: ['Keep blocked', `Allow ${host} for sign-in`],
          defaultId: 0,
          cancelId: 0,
          title: 'External Sign-In Provider',
          message: `Google sign-in redirected to ${host}`,
          detail: 'Sienna normally restricts sign-in to Google domains. If your work or school account uses this Single Sign-On provider, you can allow it for this sign-in session only.',
        });
        if (response === 1 && !w.isDestroyed()) {
          allowedSsoHosts.add(host);
          w.loadURL(blockedUrl).catch(() => {});
        }
      } finally {
        promptingHost = null;
      }
    });
    const id = w.webContents.id;
    signInIds.add(id);
    syncSignInHeaders();
    w.on('closed', () => { signInIds.delete(id); syncSignInHeaders(); if (signInWin === w) signInWin = null; });
    w.webContents.setUserAgent(FIREFOX_UA);
    w.loadURL(start).catch(() => {});
    w.webContents.on('did-navigate', (_e, url) => {
      if (url.startsWith(HOME)) {
        w.close();
        stirredUntil = Date.now() + 30000;
        stir();
        load(HOME).catch(() => {});
      }
    });
  }

  // Settings > Account.
  async function account() {
    await ready();
    if (!(await js('!!window.ytcfg?.get?.("LOGGED_IN")'))) return null;
    return parseAccount(await api('account/account_menu', {}));
  }
  async function accounts() {
    await ready();
    if (!(await js('!!window.ytcfg?.get?.("LOGGED_IN")'))) { switchUrls = []; return []; }
    const list = parseAccounts(await api('account/accounts_list', {}));
    switchUrls = list.map((a) => a.signinUrl);
    return list.map(({ signinUrl, ...a }) => a);
  }
  async function switchAccount(i) {
    if (!Number.isInteger(i) || i < 0 || i >= switchUrls.length) return false;
    const raw = switchUrls[i];
    if (typeof raw !== 'string' || !raw) return false;
    let url;
    try { url = new URL(raw, HOME).href; } catch { return false; }
    if (!isGoogleUrl(url)) return false;
    stirredUntil = Date.now() + 30000;
    stir();
    forgetAccount();
    load(url).catch(() => {});
    return true;
  }
  function addAccount(parent) {
    return signIn(parent, `https://accounts.google.com/AddSession?service=youtube&continue=${encodeURIComponent(HOME)}`);
  }
  async function signOut() {
    stirredUntil = Date.now() + 30000;
    stir();
    forgetAccount();
    await ytmSession.clearStorageData();
    await ytmSession.clearCache();
    load(HOME).catch(() => {});
    return true;
  }

  function getDiagnostics() {
    return {
      status,
      ready: !!lastSnapshot?.ready,
      signedIn: !!lastSnapshot?.signedIn,
      adPlaying: !!lastSnapshot?.adPlaying,
      playerState: lastSnapshot?.playerState ?? -1,
      volumeMode,
      supportsSystemVolume: !!sysVol,
    };
  }

  const ipc = {
    library, search, artistSongs, playlistArt, albumSongs, lyrics, queue,
    prepare, startPrepared, account, accounts, switchAccount, signOut,
    retry: reloadPlayer,
    status: () => status,
    volumeMode: (mode) => (mode ? setVolumeMode(mode) : volumeMode),
  };
  return {
    home, library, play, command, signIn, addAccount, ipc,
    search, playlistArt, albumSongs, lyrics, queue,
    setActive, setFocused, setVolumeMode, reloadPlayer, getDiagnostics,
    get window() { return win; },
  };
}

module.exports = { createYtm, cleanEndpoint };
