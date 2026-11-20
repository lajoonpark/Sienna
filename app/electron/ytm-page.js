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

  // ---- live Redux/Polymer queue store discovery ----
  let shuffledActive = false;
  let queueRev = 0;
  let pendingShuffle = null;
  let pendingShuffleTimer = null;

  function findReduxStore() {
    const hosts = [
      document.querySelector('ytmusic-player-queue'),
      document.querySelector('ytmusic-player-page'),
      document.querySelector('ytmusic-app'),
      bar(),
      document.querySelector('ytmusic-player'),
    ].filter(Boolean);

    const isQueueStore = (s) => {
      if (!s || typeof s !== 'object' || typeof s.getState !== 'function') return false;
      try {
        const st = s.getState();
        return !!(st && (st.queue || Array.isArray(st.items)));
      } catch { return false; }
    };

    for (const h of hosts) {
      for (const cand of [h.store, h.store_, h.queue?.store, h.queue_?.store, h.networkManager?.store]) {
        if (isQueueStore(cand)) return cand;
      }
    }
    for (const h of hosts) {
      let keys;
      try { keys = Object.keys(h); } catch { continue; }
      for (const k of keys) {
        if (k === 'parentElement' || k === 'parentNode' || k === 'children' || k === 'shadowRoot') continue;
        let v;
        try { v = h[k]; } catch { continue; }
        if (!v || typeof v !== 'object' || v.nodeType || Array.isArray(v)) continue;
        if (isQueueStore(v)) return v;
        if (isQueueStore(v.store)) return v.store;
      }
    }
    return null;
  }

  function findQueueCandidates() {
    const hosts = [
      document.querySelector('ytmusic-player-queue'),
      document.querySelector('ytmusic-player-page'),
      document.querySelector('ytmusic-app'),
      bar(),
      document.querySelector('ytmusic-player'),
    ].filter(Boolean);

    const out = [];
    const seen = new Set();
    const pushState = (obj) => {
      if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
      seen.add(obj);
      out.push(obj);
    };
    const inspectStore = (s) => {
      if (!s || typeof s !== 'object' || typeof s.getState !== 'function') return;
      try {
        const st = s.getState();
        if (st?.queue) pushState(st.queue);
        else if (st && (Array.isArray(st.items) || Array.isArray(st.contents))) pushState(st);
      } catch { /* ignore */ }
    };

    const store = findReduxStore();
    if (store) inspectStore(store);

    for (const h of hosts) {
      inspectStore(h);
      inspectStore(h.store);
      inspectStore(h.store_);
      inspectStore(h.queue?.store);
      inspectStore(h.queue_?.store);
      inspectStore(h.networkManager?.store);
      if (typeof h.queue?.getState === 'function') inspectStore(h.queue);
      if (typeof h.queue_?.getState === 'function') inspectStore(h.queue_);
      pushState(h.queue);
      pushState(h.queue_);
      pushState(h.__data?.queue);
      pushState(h.data);
      pushState(h.__data?.data);
    }

    for (const h of hosts) {
      let keys;
      try { keys = Object.keys(h); } catch { continue; }
      for (const k of keys) {
        if (k === 'parentElement' || k === 'parentNode' || k === 'children' || k === 'shadowRoot') continue;
        let v;
        try { v = h[k]; } catch { continue; }
        if (!v || typeof v !== 'object' || v.nodeType || Array.isArray(v)) continue;
        if (typeof v.getState === 'function') inspectStore(v);
        else if (v.store && typeof v.store.getState === 'function') inspectStore(v.store);
        else if (Array.isArray(v.items) && v.items.length && (v.items[0]?.playlistPanelVideoRenderer || v.items[0]?.playlistPanelVideoWrapperRenderer)) {
          pushState(v);
        }
      }
    }
    return out;
  }

  function clearPendingShuffle() {
    pendingShuffle = null;
    if (pendingShuffleTimer) { clearInterval(pendingShuffleTimer); pendingShuffleTimer = null; }
  }

  function triggerShuffle() {
    const clicked = click(['ytmusic-player-bar .shuffle', 'ytmusic-player-bar tp-yt-paper-icon-button.shuffle']);
    if (!clicked) {
      const st = findReduxStore();
      try { st?.dispatch?.({ type: 'SHUFFLE' }); } catch { /* ignore */ }
    }
    shuffledActive = true;
    queueRev++;
  }

  function checkPendingShuffle() {
    if (!pendingShuffle) { clearPendingShuffle(); return; }
    if (Date.now() > pendingShuffle.deadline) { clearPendingShuffle(); return; }
    const p = player();
    const curVid = p?.getVideoData?.()?.video_id || null;
    if (pendingShuffle.videoId && curVid !== pendingShuffle.videoId) return;
    const live = extractQueueFromStore(curVid, currentPlaylistId());
    const liveDom = live?.items?.length >= 2 ? live : extractQueueFromDom(curVid, currentPlaylistId());
    const hasQueue = (liveDom?.items?.length ?? 0) >= 2;
    const waitedLongEnough = Date.now() - pendingShuffle.startedAt > 1600;
    if (!hasQueue && !waitedLongEnough) return;
    // Wait a tiny beat after the target video & queue are mounted so YTM finishes wiring the queue
    clearPendingShuffle();
    triggerShuffle();
  }

  function schedulePendingShuffle(play) {
    clearPendingShuffle();
    pendingShuffle = {
      videoId: play.videoId || null,
      playlistId: play.playlistId || null,
      startedAt: Date.now(),
      deadline: Date.now() + 10000,
    };
    pendingShuffleTimer = setInterval(checkPendingShuffle, 150);
  }

  function selectInLiveQueue(play) {
    if (!play || (!play.fromLive && typeof play.queueIndex !== 'number')) return false;
    const targetVid = play.videoId || null;
    const root = document.querySelector('ytmusic-player-queue #contents');
    if (root) {
      const rows = [...root.querySelectorAll('ytmusic-player-queue-item')];
      let el = null;
      if (typeof play.queueIndex === 'number' && rows[play.queueIndex]) {
        const cand = rows[play.queueIndex];
        const d = cand.data || cand.__data?.data || cand.__dataHost?.data || null;
        const vid = d?.videoId || d?.navigationEndpoint?.watchEndpoint?.videoId || null;
        if (!targetVid || !vid || vid === targetVid) el = cand;
      }
      if (!el && targetVid) {
        el = rows.find((r) => {
          const d = r.data || r.__data?.data || r.__dataHost?.data || null;
          const vid = d?.videoId || d?.navigationEndpoint?.watchEndpoint?.videoId || null;
          return vid === targetVid && r.getAttribute?.('slot') !== 'counterpart';
        }) || null;
      }
      if (el) {
        const playBtn = el.querySelector('ytmusic-play-button-renderer, .play-button, .song-title');
        (playBtn || el).click();
        queueRev++;
        return true;
      }
    }
    if (typeof play.queueIndex === 'number') {
      const qEl = document.querySelector('ytmusic-player-queue');
      if (typeof qEl?.queue?.selectItem === 'function') {
        try { qEl.queue.selectItem(play.queueIndex); queueRev++; return true; } catch { /* fall through */ }
      }
      const p = player();
      if (typeof p?.playVideoAt === 'function') {
        const list = p.getPlaylist?.();
        if (Array.isArray(list) && (!targetVid || list[play.queueIndex] === targetVid)) {
          p.playVideoAt(play.queueIndex);
          queueRev++;
          return true;
        }
      }
    }
    return false;
  }

  // Start playing through YouTube Music's own router, so its queue, radio and history all work
  // exactly as if the user had clicked the item. Returns false if the app is not ready to route.
  function navigate(play) {
    if (selectInLiveQueue(play)) return true;
    const app = document.querySelector('ytmusic-app');
    if (!app) return false;
    if (play.shuffle) {
      shuffledActive = true;
      schedulePendingShuffle(play);
    } else {
      clearPendingShuffle();
      shuffledActive = false;
    }
    const endpoint = play.videoId
      ? { watchEndpoint: { videoId: play.videoId, ...(play.playlistId ? { playlistId: play.playlistId } : {}), ...(play.params ? { params: play.params } : {}) } }
      : { watchPlaylistEndpoint: { playlistId: play.playlistId, ...(play.params ? { params: play.params } : {}) } };
    app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }));
    queueRev++;
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

  function repeatMode() {
    const b = bar();
    const mode = b?.getAttribute('repeat-mode_') || b?.getAttribute('repeat-mode');
    if (mode === 'ALL' || mode === 'ONE' || mode === 'NONE') return mode === 'NONE' ? 'OFF' : mode;
    const btn = b?.querySelector('.repeat');
    const lbl = (btn?.getAttribute('aria-label') || btn?.getAttribute('title') || '').toLowerCase();
    if (/one|1/.test(lbl)) return 'ONE';
    if (/all|on/.test(lbl) && !/off/.test(lbl)) return 'ALL';
    return 'OFF';
  }

  function shuffleOn() {
    if (shuffledActive) return true;
    const st = findReduxStore()?.getState?.()?.queue;
    if (st?.isShuffled) return true;
    const btn = bar()?.querySelector('.shuffle');
    if (!btn) return false;
    const pressed = btn.getAttribute('aria-pressed');
    if (pressed === 'true') return true;
    return btn.classList.contains('active') || btn.hasAttribute('active');
  }

  const commands = {
    toggle() { const p = player(); if (!p) return; p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo(); },
    play() { player()?.playVideo(); },
    pause() { player()?.pauseVideo(); },
    next() { click(['ytmusic-player-bar .next-button', 'ytmusic-player-bar tp-yt-paper-icon-button.next-button']) || player()?.nextVideo(); },
    previous() { click(['ytmusic-player-bar .previous-button']) || player()?.previousVideo(); },
    seek(seconds) { player()?.seekTo(Math.max(0, seconds), true); },
    volume(v) { const p = player(); if (!p) return; if (!hold) p.unMute?.(); p.setVolume(Math.round(Math.min(100, Math.max(0, v)))); },
    mute() { const p = player(); if (!p) return; p.isMuted?.() ? p.unMute?.() : p.mute?.(); },
    shuffle() {
      if (hold) {
        schedulePendingShuffle({ videoId: player()?.getVideoData?.()?.video_id || null, playlistId: currentPlaylistId() });
        shuffledActive = true;
        return;
      }
      triggerShuffle();
    },
    repeat() { click(['ytmusic-player-bar .repeat', 'ytmusic-player-bar tp-yt-paper-icon-button.repeat']); },
    like() {
      const r = bar()?.querySelector('ytmusic-like-button-renderer');
      if (!r) return;
      const btn = r.querySelector('#button-shape-like button, #button-shape-like, .like');
      btn?.click();
    },
    queueIndex(i) {
      return selectInLiveQueue({ queueIndex: i, fromLive: true });
    },
  };

  const runsText = (t) => (t?.runs ?? []).map((r) => r.text).join('').trim()
    || (typeof t?.simpleText === 'string' ? t.simpleText.trim() : '');

  function currentPlaylistId() {
    try {
      for (const q of findQueueCandidates()) {
        if (typeof q?.playlistId === 'string' && q.playlistId.trim()) return q.playlistId.trim();
      }
      const p = player();
      const fromUrl = new URLSearchParams(location.search).get('list');
      const candidates = [
        p?.getPlaylistId?.(),
        p?.getVideoData?.()?.list,
        fromUrl,
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) return c.trim();
      }
    } catch { /* ignore */ }
    return null;
  }

  function extractQueueFromStore(currentVid, fallbackPid) {
    const sources = findQueueCandidates();
    for (const src of sources) {
      const primary = Array.isArray(src.items) ? src.items : Array.isArray(src.contents) ? src.contents : [];
      const automix = Array.isArray(src.automixItems) ? src.automixItems : [];
      const combined = [...primary, ...automix];
      if (!combined.length) continue;
      const pid = (typeof src.playlistId === 'string' && src.playlistId) ? src.playlistId : fallbackPid;
      const storeSelectedIdx = Number.isInteger(src.selectedItemIndex)
        ? src.selectedItemIndex
        : Number.isInteger(src.currentIndex) ? src.currentIndex : -1;
      const out = [];
      const seen = new Set();
      for (let idx = 0; idx < combined.length; idx++) {
        const entry = combined[idx];
        const wrapper = entry?.playlistPanelVideoWrapperRenderer;
        const pv = entry?.playlistPanelVideoRenderer
          || wrapper?.primaryRenderer?.playlistPanelVideoRenderer
          || wrapper?.primaryRenderer
          || (entry?.videoId ? entry : null);
        if (!pv) continue;
        const title = runsText(pv.title);
        if (!title) continue;
        const artist = runsText(pv.shortBylineText) || runsText(pv.longBylineText);
        const durationText = runsText(pv.lengthText);
        const we = pv.navigationEndpoint?.watchEndpoint;
        const videoId = pv.videoId || we?.videoId || null;
        const itemPid = we?.playlistId || pid || null;
        const itemParams = we?.params || undefined;
        const thumbs = pv.thumbnail?.thumbnails || pv.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const art = thumbs.length ? thumbs[thumbs.length - 1]?.url || null : null;
        const counterpartSelected = Array.isArray(wrapper?.counterpart)
          && wrapper.counterpart.some((c) => c?.counterpartRenderer?.playlistPanelVideoRenderer?.selected);
        const selected = (storeSelectedIdx >= 0 && idx === storeSelectedIdx) || !!pv.selected || counterpartSelected;
        const dedupeKey = videoId || `${title.toLowerCase()}|${artist.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push({
          index: idx,
          fromLive: true,
          videoId,
          ...(itemPid ? { playlistId: itemPid } : {}),
          ...(itemParams ? { params: itemParams } : {}),
          title,
          artist,
          durationText,
          art,
          selected,
        });
      }
      if (out.length) {
        if (currentVid && !out.some((it) => it.selected)) {
          const hit = out.find((it) => it.videoId === currentVid);
          if (hit) hit.selected = true;
        }
        return { playlistId: pid || null, items: out };
      }
    }
    return null;
  }

  // Read live queue entries from YouTube Music's queue DOM panel (if populated), without rejecting
  // rows merely because ytmusic-player-page is collapsed/hidden in the background player window.
  function extractQueueFromDom(currentVid, fallbackPid) {
    const root = document.querySelector('ytmusic-player-queue #contents');
    if (!root) return { playlistId: fallbackPid, items: [] };
    const out = [];
    const seen = new Set();
    const seenWrappers = new Set();
    const rows = [...root.querySelectorAll('ytmusic-player-queue-item')];
    const hiddenWithinRoot = (el) => {
      let cur = el;
      while (cur && cur !== root) {
        if (cur.hidden || cur.getAttribute?.('aria-hidden') === 'true'
          || cur.getAttribute?.('slot') === 'counterpart'
          || cur.style?.display === 'none') return true;
        cur = cur.parentElement;
      }
      return false;
    };
    for (let domIndex = 0; domIndex < rows.length; domIndex++) {
      const el = rows[domIndex];
      if (hiddenWithinRoot(el)) continue;
      // Inside a wrapper renderer (audio + video counterpart pair), only keep one entry per wrapper
      const wrapper = el.closest('ytmusic-playlist-panel-video-wrapper-renderer, ytmusic-player-queue-item-wrapper');
      if (wrapper && root.contains(wrapper)) {
        if (seenWrappers.has(wrapper)) continue;
        seenWrappers.add(wrapper);
      }
      const data = el.data || el.__data?.data || el.__dataHost?.data || null;
      const title = el.querySelector('.song-title')?.textContent?.trim()
        || runsText(data?.title) || '';
      if (!title) continue;
      const artist = el.querySelector('.byline')?.textContent?.trim()
        || runsText(data?.shortBylineText) || runsText(data?.longBylineText) || '';
      const durationText = el.querySelector('.duration')?.textContent?.trim()
        || runsText(data?.lengthText) || '';
      const we = data?.navigationEndpoint?.watchEndpoint;
      const videoId = data?.videoId || we?.videoId || null;
      const itemPid = we?.playlistId || fallbackPid || null;
      const itemParams = we?.params || undefined;
      const thumbs = data?.thumbnail?.thumbnails || data?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      const bestThumb = thumbs.length ? thumbs[thumbs.length - 1]?.url : null;
      const imgSrc = el.querySelector('img')?.src || '';
      const art = bestThumb || (/^https?:\/\//.test(imgSrc) ? imgSrc : null);
      const selected = el.hasAttribute('selected') || el.getAttribute('play-button-state') === 'playing'
        || el.getAttribute('play-button-state') === 'paused' || !!data?.selected;
      const dedupeKey = videoId || `${title.toLowerCase()}|${artist.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({
        index: domIndex,
        fromLive: true,
        videoId,
        ...(itemPid ? { playlistId: itemPid } : {}),
        ...(itemParams ? { params: itemParams } : {}),
        title,
        artist,
        durationText,
        art,
        selected,
      });
    }
    if (currentVid && out.length && !out.some((it) => it.selected)) {
      const hit = out.find((it) => it.videoId === currentVid);
      if (hit) hit.selected = true;
    }
    return { playlistId: fallbackPid, items: out };
  }

  function queueSignature(currentVid) {
    try {
      const st = findReduxStore()?.getState?.()?.queue;
      const items = Array.isArray(st?.items) ? st.items : null;
      if (items?.length) {
        const vidAt = (i) => {
          const e = items[i];
          return e?.playlistPanelVideoRenderer?.videoId
            || e?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer?.videoId
            || e?.videoId || '';
        };
        return `${queueRev}:${items.length}:${vidAt(0)}:${vidAt(1)}:${vidAt(2)}:${st.selectedItemIndex ?? ''}:${currentVid || ''}`;
      }
      const pList = player()?.getPlaylist?.();
      if (Array.isArray(pList) && pList.length) {
        return `${queueRev}:p${pList.length}:${pList[0] || ''}:${pList[1] || ''}:${pList[2] || ''}:${currentVid || ''}`;
      }
    } catch { /* ignore */ }
    return `${queueRev}:${currentVid || ''}`;
  }

  function queue() {
    const p = player();
    const currentVid = p?.getVideoData?.()?.video_id || null;
    const pid = currentPlaylistId();
    const rawOrder = p?.getPlaylist?.();
    const playerOrder = Array.isArray(rawOrder) && rawOrder.length ? rawOrder : null;
    const playerIndex = typeof p?.getPlaylistIndex === 'function' ? p.getPlaylistIndex() : -1;
    const fromStore = extractQueueFromStore(currentVid, pid);
    if (fromStore && fromStore.items.length >= 2) {
      return { ...fromStore, playerOrder, playerIndex };
    }
    const fromDom = extractQueueFromDom(currentVid, pid);
    if (fromDom.items.length > (fromStore?.items?.length || 0)) {
      return { ...fromDom, playerOrder, playerIndex };
    }
    const chosen = fromStore || fromDom;
    return { ...chosen, playerOrder, playerIndex };
  }

  // A song loading ahead of the tonearm: prepare() starts it through the router, silently, and as soon
  // as it really plays it is stopped at 0:00. release() then plays it.
  let hold = null;
  const HOLD_MAX_MS = 30000;
  const IGNORED_IN_HOLD = new Set(['toggle', 'play', 'next', 'previous', 'seek', 'like']);
  const MUTE_FLAG = 'siennaHoldMuted';
  const isAd = () => !!document.querySelector('#movie_player.ad-showing, .ytp-ad-player-overlay');

  function checkHold() {
    if (pendingShuffle) checkPendingShuffle();
    const p = player();
    if (!hold || !p) return;
    if (isAd()) {
      const v = p.querySelector('video');
      if (v && !v.paused) { p.pauseVideo?.(); if (!v.paused) v.pause(); }
      if (v && v.readyState >= 2 && !hold.ready) { hold.ready = true; hold.done(true); }
      return;
    }
    const id = p.getVideoData?.()?.video_id;
    if (!hold.ready && !(id && id !== hold.prev)) return;
    const st = p.getPlayerState?.();
    if (st === 1 || (!hold.ready && st === 2)) {
      p.seekTo?.(0, true);
      p.pauseVideo?.();
      if (!hold.ready) { hold.ready = true; hold.done(true); }
    }
  }
  for (const ev of ['playing', 'timeupdate', 'pause']) document.addEventListener(ev, checkHold, true);

  function endHold() {
    clearTimeout(hold.timer);
    clearInterval(hold.poll);
    hold.done(false);
    hold = null;
    try { localStorage.removeItem(MUTE_FLAG); } catch { /* storage blocked: harmless */ }
  }

  function prepare(play) {
    const p = player();
    const frozen = hold?.frozen ?? { ...state(), playerState: 2 };
    if (hold) endHold();
    const prev = p?.getVideoData?.()?.video_id ?? null;
    return new Promise((done) => {
      hold = { prev, frozen, ready: false, done };
      hold.timer = setTimeout(release, HOLD_MAX_MS);
      hold.poll = setInterval(checkHold, 200);
      try { localStorage.setItem(MUTE_FLAG, '1'); } catch { /* see endHold */ }
      p?.mute?.();
      if (play.videoId && play.videoId === prev && !isAd() && (!play.playlistId || play.playlistId === currentPlaylistId())) {
        p.seekTo?.(0, true);
        p.pauseVideo?.();
        if (play.shuffle) schedulePendingShuffle(play);
        hold.ready = true;
        done(true);
      } else if (!navigate(play)) {
        endHold();
        p?.unMute?.();
      }
    });
  }

  function release() {
    if (!hold) return false;
    endHold();
    const p = player();
    p?.unMute?.();
    p?.playVideo?.();
    const v = p?.querySelector('video');
    if (v?.paused && isAd()) v.play().catch(() => {});
    return true;
  }

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
      try { stuck = !!(localStorage.getItem(MUTE_FLAG) || localStorage.getItem('cadenceHoldMuted')); if (stuck) { localStorage.removeItem(MUTE_FLAG); localStorage.removeItem('cadenceHoldMuted'); } } catch { /* see endHold */ }
      if (stuck) p.unMute?.();
    }
    if (hold) return { ...hold.frozen, volume: p?.getVolume?.() ?? hold.frozen.volume };
    const ad = isAd();
    const song = ad ? null : meta;
    const art = song?.artwork?.length ? song.artwork[song.artwork.length - 1].src : null;
    return {
      signedIn: !!cfg('LOGGED_IN'),
      who: cfg('LOGGED_IN') ? `${cfg('DATASYNC_ID') ?? ''}|${cfg('SESSION_INDEX') ?? ''}` : null,
      ready: !!p,
      videoId: data.video_id || null,
      playlistId: currentPlaylistId(),
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
      repeat: repeatMode(),
      shuffle: shuffleOn(),
      queueSig: queueSignature(data.video_id || null),
      adPlaying: ad,
    };
  }

  window.__sienna = {
    api, navigate, state, prepare, release, queue,
    command: (name, arg) => { if (!(hold && IGNORED_IN_HOLD.has(name))) return commands[name]?.(arg); },
  };
})();
