// YouTube Music, played by a hidden music.youtube.com window. That page does the real work
// (audio, ads, queue, radio, history, likes); Sienna drives it through ytm-page.js and reads
// shelves from the same internal API the page uses.
const { BrowserWindow, app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { parseShelves, parseSearch, parsePlaylistSongs, continuation, artDebug } = require('./ytm-parse.cjs');
const { createSystemVolume } = require('./sysvolume.cjs');

const PARTITION = 'persist:ytm'; // cookies survive restarts, so you sign in once
const HOME = 'https://music.youtube.com/';
// The "songs" filter of YouTube Music search (the same params ytmusicapi uses; checked live).
const SONGS_FILTER = 'EgWKAQIIAWoMEA4QChADEAQQCRAF';
const PAGE_JS = fs.readFileSync(path.join(__dirname, 'ytm-page.js'), 'utf8');

// Google refuses to sign in "embedded browsers"; a plain Chrome user agent (Electron's minus the
// Electron and app tokens) avoids that and makes YouTube Music serve its normal desktop site.
function chromeUserAgent() {
  return app.userAgentFallback.replace(/\s(Electron|sienna-app|Sienna)\/\S+/gi, '');
}

// Google blocks sign-in from embedded Chromium ("This browser or app may not be secure") but still
// accepts Firefox, so the sign-in window (only) presents itself as Firefox: Firefox user agent, no
// Client Hints headers, no navigator.userAgentData. Lajoon chose this on 2026-11-02, knowing it
// works around Google's embedded-browser check; the official alternative is OAuth in the system
// browser, which cannot give the web player a signed-in session.
const FIREFOX_UA = {
  darwin: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0',
  win32: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
}[process.platform] ?? 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

function createYtm({ onState, onSignedIn }) {
  const ua = chromeUserAgent();
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    title: 'YouTube Music (Sienna player)',
    // Throttled like a background tab: audio plays on, but the hidden page stops painting and
    // Chromium drops the video track of what plays in it (no unseen video decoding, less heat).
    webPreferences: { partition: PARTITION, backgroundThrottling: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.webContents.setUserAgent(ua);
  win.webContents.setAudioMuted(false);
  // YouTube Music asks "leave site?" while playing; Sienna decides when to navigate.
  win.webContents.on('will-prevent-unload', (e) => e.preventDefault());
  win.webContents.on('dom-ready', () => { win.webContents.executeJavaScript(PAGE_JS).catch(() => {}); });
  // A cookie consent page (EU) needs the user once: show the window until it is accepted.
  win.webContents.on('did-navigate', (_e, url) => {
    if (/consent\.(youtube|google)\.com/.test(url)) win.show();
    else if (win.isVisible() && url.startsWith(HOME)) win.hide();
  });
  let quitting = false;
  app.on('before-quit', () => { quitting = true; });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.loadURL(HOME);

  const js = (code) => win.webContents.executeJavaScript(code, true);

  // Resolves once the page has YouTube Music's app and config, and our helpers are in.
  async function ready(timeoutMs = 30000) {
    const t0 = Date.now();
    for (;;) {
      const ok = await js(`!!(window.ytcfg && document.querySelector('ytmusic-app'))`).catch(() => false);
      if (ok) {
        if (!(await js('!!window.__sienna'))) await js(PAGE_JS);
        return;
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('YouTube Music did not load');
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // SIENNA_DUMP=1 saves every raw response to <userData>/dumps/<endpoint>-<time>-<n>.json, so a
  // signed-in response can be copied into test/fixtures when something parses wrong.
  let dumped = 0;
  function dump(endpoint, body, res) {
    if (!process.env.SIENNA_DUMP) return;
    try {
      const dir = path.join(app.getPath('userData'), 'dumps');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${endpoint}-${new Date().toISOString().replace(/[:.]/g, '-')}-${dumped++}.json`);
      fs.writeFileSync(file, JSON.stringify({ request: body, response: res }));
      console.warn('[sienna] dumped', file);
    } catch (e) { console.warn('[sienna] dump failed', e.message); }
  }

  const api = async (endpoint, body) => {
    await ready();
    const res = await js(`window.__sienna.api(${JSON.stringify(endpoint)}, ${JSON.stringify(body)})`);
    dump(endpoint, body, res);
    return res;
  };

  // An item with no cover is a bug somewhere in parsing: say which renderer it came from.
  const onNoArt = (item, renderer) => console.warn(`[sienna] no art for ${item.kind} "${item.title}"; renderer keys: ${Object.keys(renderer).join(',')}; image-ish paths: ${artDebug(renderer).join(' ') || 'none'}`);

  // Home shelves ("Listen again", "Quick picks", mixes...), one page at a time: call again with
  // `next` for more (later pages come from continuations).
  async function home(next) {
    const res = await api('browse', next ? { continuation: next } : { browseId: 'FEmusic_home' });
    return { shelves: parseShelves(res, { onNoArt }), next: continuation(res) };
  }

  // Songs only: [{ kind: 'song', title, subtitle (artist), album, duration (s), art, play: { videoId } }]
  async function search(query) {
    const q = String(query ?? '').trim();
    if (!q) return [];
    return parseSearch(await api('search', { query: q, params: SONGS_FILTER }), { onNoArt });
  }

  // Cover urls (up to 4, 256 px) of the first songs of a playlist, album, mix or radio: the renderer
  // paints a collage from them when the item has no cover of its own or its cover fails to load.
  // Playlists and albums come from browse VL<id>; mixes/radios (RD...) from the `next` queue.
  const songArts = new Map();
  async function playlistArt(play) {
    const id = play?.playlistId;
    if (!id) return [];
    if (!songArts.has(id)) {
      const viaNext = () => api('next', { playlistId: id, videoId: play.videoId, params: play.params, isAudioOnly: true });
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
      attempt.then((a) => { if (!a.length) songArts.delete(id); }); // do not cache failures
    }
    return songArts.get(id);
  }

  async function play(endpoint) {
    await ready();
    const routed = await js(`window.__sienna.navigate(${JSON.stringify(endpoint)})`).catch(() => false);
    if (routed) return;
    // Fallback: a full page load of the watch URL.
    const q = new URLSearchParams();
    if (endpoint.videoId) q.set('v', endpoint.videoId);
    if (endpoint.playlistId) q.set('list', endpoint.playlistId);
    await win.loadURL(`${HOME}watch?${q}`);
  }

  // Loads a song ahead of the tonearm, silent and stopped at 0:00 (see ytm-page.js). Resolves when it is
  // ready to start; false if it could not be held, which startPrepared copes with.
  async function prepare(endpoint) {
    await ready();
    return js(`window.__sienna.prepare(${JSON.stringify(endpoint)})`).catch(() => false);
  }
  async function startPrepared(endpoint) {
    await ready();
    const held = await js('window.__sienna.release()').catch(() => false);
    if (!held) await play(endpoint);
  }

  // On macOS the volume knob is the system volume; the player itself stays at full volume.
  // It is read (one osascript run) only while a Sienna window is on screen, to catch the volume keys.
  const sysVol = createSystemVolume();
  sysVol?.refresh();
  setInterval(() => { if (active) sysVol?.refresh(); }, 3000);

  async function command(name, arg) {
    if (name === 'volume' && sysVol) { sysVol.set(arg); return true; }
    await ready();
    return js(`window.__sienna.command(${JSON.stringify(name)}, ${JSON.stringify(arg ?? null)})`);
  }

  // Poll the page and pass state on: 4x a second while a Sienna window is on screen (smooth enough
  // for a tonearm), every 3 s while only the menu-bar icon is left (keeps sign-in and volume in step).
  let active = true;
  let lastSignedIn = null;
  let pollTimer = null;
  const POLL_MS = { active: 250, idle: 3000 };
  const schedule = () => { clearTimeout(pollTimer); pollTimer = setTimeout(poll, active ? POLL_MS.active : POLL_MS.idle); };
  async function poll() {
    try { await pollOnce(); } finally { if (!win.isDestroyed()) schedule(); }
  }
  function setActive(on) {
    if (on === active) return;
    active = on;
    if (on) { sysVol?.refresh(); poll(); } else schedule();
  }
  schedule();
  async function pollOnce() {
    if (win.isDestroyed()) return;
    const s = await js('window.__sienna?.state()').catch(() => null);
    if (!s) return;
    if (sysVol) {
      if (s.volume !== 100 && s.videoId) js('window.__sienna.command("volume", 100)').catch(() => {});
      if (sysVol.get() !== null) s.volume = sysVol.get();
    }
    onState(s);
    if (lastSignedIn === false && s.signedIn) onSignedIn?.();
    lastSignedIn = s.signedIn;
  }

  // Google sign-in in a visible window that shares the player's cookies.
  const signInIds = new Set();
  win.webContents.session.webRequest.onBeforeSendHeaders((d, cb) => {
    if (signInIds.has(d.webContentsId)) {
      for (const k of Object.keys(d.requestHeaders)) if (/^sec-ch-ua/i.test(k)) delete d.requestHeaders[k];
    }
    cb({ requestHeaders: d.requestHeaders });
  });
  function signIn(parent) {
    const w = new BrowserWindow({
      width: 480, height: 720, parent, modal: false, title: 'Sign in to YouTube Music',
      webPreferences: { partition: PARTITION, preload: path.join(__dirname, 'signin-preload.cjs') },
    });
    const id = w.webContents.id;
    signInIds.add(id);
    w.on('closed', () => signInIds.delete(id));
    w.webContents.setUserAgent(FIREFOX_UA);
    w.loadURL(`https://accounts.google.com/ServiceLogin?service=youtube&continue=${encodeURIComponent(HOME)}`);
    w.webContents.on('did-navigate', (_e, url) => {
      if (url.startsWith(HOME)) {
        w.close();
        win.loadURL(HOME); // reload the player as the signed-in user
      }
    });
  }

  // Request handlers main.cjs registers as ipc channels ytm:<name> (renderer: window.sienna.<name>).
  const ipc = { search, playlistArt, prepare, startPrepared };
  return { home, play, command, signIn, ipc, search, playlistArt, setActive, window: win };
}

module.exports = { createYtm };
