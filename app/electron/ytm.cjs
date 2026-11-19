// YouTube Music, played by a hidden music.youtube.com window. That page does the real work
// (audio, ads, queue, radio, history, likes); Sienna drives it through ytm-page.js and reads
// shelves from the same internal API the page uses.
const { BrowserWindow, app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseShelves, parseLibraryShelf, parseSearch, parseArtistPage,
  parsePlaylistSongs, playlistContinuation, parseLyricsTab, parseLyrics,
  continuation, artDebug, cleanUrl, parseAccount, parseAccounts,
} = require('./ytm-parse.cjs');
const { createSystemVolume } = require('./sysvolume.cjs');
const { YTM_PARTITION, YTM_ORIGIN, devEnv, isGoogleUrl, isHttpsHostAllowed, lockNavigation } = require('./security.cjs');

const PARTITION = YTM_PARTITION; // cookies survive restarts, so you sign in once
const COMMANDS = new Set(['toggle', 'play', 'pause', 'next', 'previous', 'seek', 'volume', 'mute', 'like', 'shuffle', 'repeat', 'queueIndex']);
const HOME = 'https://music.youtube.com/';

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
  return (out.videoId || out.playlistId) ? out : null;
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
  let win = null;
  let quitting = false;
  let status = { ok: true, offline: false, error: null, crashed: false };
  let lastSnapshot = null;
  let retryTimer = null;
  let retryAttempt = 0;

  function setStatus(next) {
    const merged = { ...status, ...next };
    if (merged.ok === status.ok && merged.offline === status.offline && merged.error === status.error && merged.crashed === status.crashed) return;
    status = merged;
    onStatus?.(status);
  }

  function scheduleReload(reason, offline = false) {
    if (quitting || retryTimer) return;
    setStatus({ ok: false, offline, error: reason });
    const delay = Math.min(30000, 3000 * Math.pow(1.6, retryAttempt++));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!quitting) reloadPlayer();
    }, delay);
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
    w.webContents.on('did-navigate', (_e, url) => {
      const host = hostOfUrl(url) || '';
      if (/^consent\.(youtube|google)\./.test(host)) w.show();
      else if (w.isVisible() && url.startsWith(HOME)) w.hide();
      if (url.startsWith(HOME)) {
        retryAttempt = 0;
        clearTimeout(retryTimer); retryTimer = null;
        setStatus({ ok: true, offline: false, error: null, crashed: false });
      }
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
      setStatus({ ok: false, offline: false, crashed: true, error: 'The YouTube Music player stopped unexpectedly. Restarting…' });
      try { if (!w.isDestroyed()) w.destroy(); } catch { /* ignore */ }
      win = createPlayerWindow();
      win.loadURL(HOME).catch((err) => scheduleReload(err?.message || 'Could not reload YouTube Music.'));
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

  function reloadPlayer() {
    clearTimeout(retryTimer); retryTimer = null;
    if (!win || win.isDestroyed()) win = createPlayerWindow();
    setStatus({ ok: true, offline: false, error: null, crashed: false });
    return win.loadURL(HOME).catch((err) => {
      scheduleReload(err?.message || 'Could not reach YouTube Music.', true);
      return false;
    });
  }

  const js = (code) => {
    if (!win || win.isDestroyed()) return Promise.reject(new Error('player unavailable'));
    return win.webContents.executeJavaScript(code, true);
  };

  async function ready(timeoutMs = 30000) {
    const t0 = Date.now();
    for (;;) {
      const ok = await js(`!!(window.ytcfg && document.querySelector('ytmusic-app'))`).catch(() => false);
      if (ok) {
        if (!(await js('!!window.__sienna').catch(() => false))) await js(PAGE_JS);
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

  // Cover urls (up to 4, 256 px) of the first songs of a playlist, album, mix or radio.
  const songArts = new Map();
  async function playlistArt(play) {
    const ep = cleanEndpoint(play);
    const id = ep?.playlistId;
    if (!id) return [];
    if (!songArts.has(id)) {
      const viaNext = () => api('next', { playlistId: id, videoId: ep.videoId, params: ep.params, isAudioOnly: true });
      const viaBrowse = () => api('browse', { browseId: id.startsWith('VL') ? id : `VL${id}` });
      const mix = /^RD/.test(id) && !/^RDCLAK/.test(id);
      const attempt = (async () => {
        for (const get of mix ? [viaNext, viaBrowse] : [viaBrowse, viaNext]) {
          try {
            const arts = [...new Set(parsePlaylistSongs(await get()).map((x) => x.art).filter(Boolean))];
            if (arts.length) return arts.slice(0, 4).map((u) => u.replace('w544-h544', 'w256-h256'));
          } catch (e) { console.warn('[sienna] playlistArt', id, e.message); }
        }
        return [];
      })();
      songArts.set(id, attempt);
      attempt.then((a) => { if (!a.length) songArts.delete(id); });
    }
    return songArts.get(id);
  }

  // Songs of an album, playlist, Liked Music, or mix in order, for the 3D record spread or Collection List.
  // For playlists/albums/Liked Music, follows InnerTube browse continuations so large collections (~600+ songs) load in full.
  const MAX_PLAYLIST_PAGES = 15;
  const albumCache = new Map();
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
    if (!albumCache.has(id)) {
      const attempt = (async () => {
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
      })();
      albumCache.set(id, attempt);
      attempt.then((a) => { if (!a.length) albumCache.delete(id); });
    }
    return albumCache.get(id);
  }

  // Lyrics for a track via `next` -> Lyrics tab browseId -> `browse`.
  const lyricsCache = new Map();
  async function lyrics(videoId) {
    const id = cleanId(videoId, 64);
    if (!id) return null;
    if (lyricsCache.has(id)) return lyricsCache.get(id);
    const attempt = (async () => {
      try {
        const nextRes = await api('next', { videoId: id, isAudioOnly: true });
        const tabId = parseLyricsTab(nextRes);
        if (!tabId) return null;
        return parseLyrics(await api('browse', { browseId: tabId }));
      } catch (e) {
        console.warn('[sienna] lyrics', id, e.message);
        return null;
      }
    })();
    lyricsCache.set(id, attempt);
    if (lyricsCache.size > 40) lyricsCache.delete(lyricsCache.keys().next().value);
    return attempt;
  }

  // Up Next queue from the player's live DOM queue, falling back to `next` API if DOM queue is empty.
  async function queue() {
    await ready();
    const domQueue = await js('window.__sienna?.queue?.()').catch(() => []);
    if (Array.isArray(domQueue) && domQueue.length) {
      return domQueue.map((item) => ({ ...item, art: cleanUrl(item.art) }));
    }
    const vid = lastSnapshot?.videoId;
    if (!vid) return [];
    try {
      const songs = parsePlaylistSongs(await api('next', { videoId: vid, isAudioOnly: true }));
      return songs.slice(0, 40).map((s, index) => ({
        index,
        videoId: s.videoId,
        title: s.title,
        artist: s.subtitle || '',
        duration: s.duration || 0,
        art: cleanUrl(s.art),
        selected: !!s.selected || s.videoId === vid,
      }));
    } catch { return []; }
  }

  async function play(rawEndpoint) {
    const endpoint = cleanEndpoint(rawEndpoint);
    if (!endpoint) return false;
    stir();
    await ready();
    const routed = await js(`window.__sienna.navigate(${JSON.stringify(endpoint)})`).catch(() => false);
    if (routed) return true;
    const q = new URLSearchParams();
    if (endpoint.videoId) q.set('v', endpoint.videoId);
    if (endpoint.playlistId) q.set('list', endpoint.playlistId);
    await win.loadURL(`${HOME}watch?${q}`);
    return true;
  }

  async function prepare(rawEndpoint) {
    const endpoint = cleanEndpoint(rawEndpoint);
    if (!endpoint) return false;
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

  async function command(name, arg) {
    if (!COMMANDS.has(name)) return false;
    if (arg !== null && arg !== undefined && typeof arg !== 'number') return false;
    if (name === 'volume' && useSysVol()) { sysVol.set(arg); return true; }
    if (name === 'mute' && useSysVol()) { sysVol.toggleMute(); stir(); return true; }
    if (name === 'queueIndex' && (!Number.isInteger(arg) || arg < 0 || arg > 200)) return false;
    stir();
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
    if (lastWho !== undefined && who !== lastWho && s.ready) onAccount?.(!!s.signedIn);
    if (s.ready) lastWho = who;
  }

  // Player diet: hidden page skips images and fonts (unless visible for consent or SIENNA_PLAYER_DIET=0 in dev).
  if (devEnv('SIENNA_PLAYER_DIET') !== '0') {
    win.webContents.session.webRequest.onBeforeRequest((d, cb) => {
      const playerId = win && !win.isDestroyed() ? win.webContents.id : -1;
      cb({ cancel: d.webContentsId === playerId && !win.isDestroyed() && !win.isVisible() && (d.resourceType === 'image' || d.resourceType === 'font') });
    });
  }

  // Google sign-in in a singleton visible window that shares the player's cookies.
  const signInIds = new Set();
  let signInWin = null;
  win.webContents.session.webRequest.onBeforeSendHeaders((d, cb) => {
    if (signInIds.has(d.webContentsId)) {
      for (const k of Object.keys(d.requestHeaders)) if (/^sec-ch-ua/i.test(k)) delete d.requestHeaders[k];
    }
    cb({ requestHeaders: d.requestHeaders });
  });

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
    w.on('closed', () => { signInIds.delete(id); if (signInWin === w) signInWin = null; });
    w.webContents.setUserAgent(FIREFOX_UA);
    w.loadURL(start).catch(() => {});
    w.webContents.on('did-navigate', (_e, url) => {
      if (url.startsWith(HOME)) {
        w.close();
        stirredUntil = Date.now() + 30000;
        stir();
        win.loadURL(HOME).catch(() => {});
      }
    });
  }

  // Settings > Account.
  async function account() {
    await ready();
    if (!(await js('!!window.ytcfg?.get?.("LOGGED_IN")'))) return null;
    return parseAccount(await api('account/account_menu', {}));
  }
  let switchUrls = [];
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
    win.loadURL(url).catch(() => {});
    return true;
  }
  function addAccount(parent) {
    return signIn(parent, `https://accounts.google.com/AddSession?service=youtube&continue=${encodeURIComponent(HOME)}`);
  }
  async function signOut() {
    stirredUntil = Date.now() + 30000;
    stir();
    switchUrls = [];
    await win.webContents.session.clearStorageData();
    await win.webContents.session.clearCache();
    win.loadURL(HOME).catch(() => {});
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
