// Injected into the hidden music.youtube.com page. Installs window.__sienna: a small, stable
// surface over YouTube Music's own player and internal API, so the Electron main process only
// ever calls these few functions (and only this file has to change when YouTube changes).
(() => {
  if (window.__sienna) return;

  const cfg = (k) => window.ytcfg?.get?.(k);
  const player = () => document.getElementById('movie_player');
  const bar = () => document.querySelector('ytmusic-player-bar');
  const cookie = (name) => document.cookie.split('; ').find((c) => c.startsWith(name + '='))?.slice(name.length + 1);

  // Signed-in requests carry SAPISIDHASH = "<ts>_<sha1(ts + ' ' + SAPISID + ' ' + origin)>",
  // the same header YouTube Music's own scripts send.
  async function authHeader() {
    const sapisid = cookie('SAPISID') ?? cookie('__Secure-3PAPISID');
    if (!sapisid) return null;
    const ts = Math.floor(Date.now() / 1000);
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sapisid} ${location.origin}`));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `SAPISIDHASH ${ts}_${hex}`;
  }

  async function api(endpoint, body = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-AuthUser': String(cfg('SESSION_INDEX') ?? 0),
      'X-Origin': location.origin,
    };
    const visitor = cfg('VISITOR_DATA');
    if (visitor) headers['X-Goog-Visitor-Id'] = visitor;
    const auth = await authHeader();
    if (auth) headers.Authorization = auth;
    const key = cfg('INNERTUBE_API_KEY');
    const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false${key ? `&key=${key}` : ''}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ context: cfg('INNERTUBE_CONTEXT'), ...body }),
    });
    if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
    return res.json();
  }

  // Start playing through YouTube Music's own router, so its queue, radio and history all work
  // exactly as if the user had clicked the item. Returns false if the app is not ready to route.
  function navigate(play) {
    const app = document.querySelector('ytmusic-app');
    if (!app) return false;
    const endpoint = play.videoId
      ? { watchEndpoint: { videoId: play.videoId, playlistId: play.playlistId, params: play.params } }
      : { watchPlaylistEndpoint: { playlistId: play.playlistId, params: play.params } };
    app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }));
    return true;
  }

  function click(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) { el.click(); return true; }
    }
    return false;
  }

  function likeStatus() {
    const el = bar()?.querySelector('ytmusic-like-button-renderer');
    return el?.getAttribute('like-status') ?? null; // LIKE | DISLIKE | INDIFFERENT
  }

  const commands = {
    toggle() { const p = player(); if (!p) return; p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo(); },
    play() { player()?.playVideo(); },
    pause() { player()?.pauseVideo(); },
    next() { click(['ytmusic-player-bar .next-button', 'ytmusic-player-bar tp-yt-paper-icon-button.next-button']) || player()?.nextVideo(); },
    previous() { click(['ytmusic-player-bar .previous-button']) || player()?.previousVideo(); },
    seek(seconds) { player()?.seekTo(Math.max(0, seconds), true); },
    volume(v) { const p = player(); if (!p) return; if (!hold) p.unMute?.(); p.setVolume(Math.round(Math.min(100, Math.max(0, v)))); },
    like() {
      const r = bar()?.querySelector('ytmusic-like-button-renderer');
      if (!r) return;
      const btn = r.querySelector('#button-shape-like button, #button-shape-like, .like');
      btn?.click();
    },
  };

  // A song loading ahead of the tonearm: prepare() starts it through the router, silently, and as soon
  // as it really plays it is stopped at 0:00. release() then plays it. YouTube Music has no "load but
  // do not play", hence the catch. Until release, state() goes on describing the old song, so the
  // suitcase sees no change before the new record has landed.
  // hold = { prev: id before the load, frozen: state to report, ready, done: resolves prepare(), timer }
  let hold = null;
  const HOLD_MAX_MS = 30000;                                  // nobody released it (window hidden, ...): play
  const IGNORED_IN_HOLD = new Set(['toggle', 'play', 'next', 'previous', 'seek', 'like']);   // they would act on a song the suitcase does not show yet
  const MUTE_FLAG = 'siennaHoldMuted';                       // survives a crash mid-hold; YouTube remembers mute
  const isAd = () => !!document.querySelector('#movie_player.ad-showing, .ytp-ad-player-overlay');

  function checkHold() {
    const p = player();
    if (!hold || !p) return;
    if (isAd()) {                                             // an ad cannot be rewound; it waits where it is
      const v = p.querySelector('video');                     // the player's own state says little during an ad
      if (v && !v.paused) { p.pauseVideo?.(); if (!v.paused) v.pause(); }
      if (v && v.readyState >= 2 && !hold.ready) { hold.ready = true; hold.done(true); }
      return;
    }
    const id = p.getVideoData?.()?.video_id;
    if (!hold.ready && !(id && id !== hold.prev)) return;     // still the old song
    const st = p.getPlayerState?.();
    if (st === 1 || (!hold.ready && st === 2)) {
      p.seekTo?.(0, true);
      p.pauseVideo?.();
      if (!hold.ready) { hold.ready = true; hold.done(true); }
    }
  }
  // Media events do not bubble but can be captured, and unlike timers they are not throttled in this hidden window.
  for (const ev of ['playing', 'timeupdate', 'pause']) document.addEventListener(ev, checkHold, true);

  function endHold() {
    clearTimeout(hold.timer);
    clearInterval(hold.poll);
    hold.done(false);                                         // no effect if it was already ready
    hold = null;
    try { localStorage.removeItem(MUTE_FLAG); } catch { /* storage blocked: harmless */ }
  }

  // -> true once the song is loaded and stopped at 0:00, false if that did not happen (nothing to release).
  function prepare(play) {
    const p = player();
    const frozen = hold?.frozen ?? { ...state(), playerState: 2 };   // a second pick while one loads keeps the first picture
    if (hold) endHold();
    const prev = p?.getVideoData?.()?.video_id ?? null;
    return new Promise((done) => {
      hold = { prev, frozen, ready: false, done };
      hold.timer = setTimeout(release, HOLD_MAX_MS);
      hold.poll = setInterval(checkHold, 200);                // backup for the events above
      try { localStorage.setItem(MUTE_FLAG, '1'); } catch { /* see endHold */ }
      p?.mute?.();
      if (play.videoId && play.videoId === prev && !isAd()) { // the same song again: it is already loaded
        p.seekTo?.(0, true);
        p.pauseVideo?.();
        hold.ready = true;
        done(true);
      } else if (!navigate(play)) {
        endHold();
        p?.unMute?.();
      }
    });
  }

  // Lets the held song play. -> false if nothing was held (the caller has to start the song itself).
  function release() {
    if (!hold) return false;
    endHold();
    const p = player();
    p?.unMute?.();
    p?.playVideo?.();
    const v = p?.querySelector('video');
    if (v?.paused && isAd()) v.play().catch(() => {});        // held by hand above
    return true;
  }

  // Nobody sees this page's video, so ask for the smallest stream once per song (less decoding;
  // the audio quality does not depend on it).
  let lowFor = null;
  function lowVideo(p, id) {
    if (!id || id === lowFor) return;
    lowFor = id;
    try { p.setPlaybackQualityRange?.('tiny', 'tiny'); p.setPlaybackQuality?.('tiny'); } catch { /* player API changed: harmless */ }
  }

  function state() {
    const p = player();
    const meta = navigator.mediaSession?.metadata;
    const data = p?.getVideoData?.() ?? {};
    if (p) lowVideo(p, data.video_id);
    if (p && !hold) {
      let stuck = false;
      try { stuck = !!(localStorage.getItem(MUTE_FLAG) || localStorage.getItem('cadenceHoldMuted')); if (stuck) { localStorage.removeItem(MUTE_FLAG); localStorage.removeItem('cadenceHoldMuted'); } } catch { /* see endHold */ }   // cadenceHoldMuted: the flag's name before the Sienna rename
      if (stuck) p.unMute?.();                                // the app died during a hold
    }
    if (hold) return { ...hold.frozen, volume: p?.getVolume?.() ?? hold.frozen.volume };
    // During an ad, media session metadata describes the ad, so leave the song fields empty.
    const ad = isAd();
    const song = ad ? null : meta;
    const art = song?.artwork?.length ? song.artwork[song.artwork.length - 1].src : null;
    return {
      signedIn: !!cfg('LOGGED_IN'),
      who: cfg('LOGGED_IN') ? `${cfg('DATASYNC_ID') ?? ''}|${cfg('SESSION_INDEX') ?? ''}` : null,   // which account: ytm.cjs notices a switch (never leaves main)
      ready: !!p,
      videoId: data.video_id || null,
      title: ad ? null : song?.title || data.title || null,
      artist: ad ? null : song?.artist || data.author || null,
      album: song?.album || null,
      art,
      // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
      playerState: p?.getPlayerState?.() ?? -1,
      position: p?.getCurrentTime?.() ?? 0,
      duration: p?.getDuration?.() ?? 0,
      volume: p?.getVolume?.() ?? 100,
      muted: p?.isMuted?.() ?? false,
      like: likeStatus(),
      adPlaying: ad,
    };
  }

  window.__sienna = {
    api, navigate, state, prepare, release,
    command: (name, arg) => { if (!(hold && IGNORED_IN_HOLD.has(name))) return commands[name]?.(arg); },
  };
})();
