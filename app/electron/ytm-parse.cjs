// Turn YouTube Music's internal API ("InnerTube") browse responses into plain shelves of records.
// The response format changes often, so this walks the tree looking for the renderers it knows
// instead of following one fixed path.

const SHELF_KEYS = ['musicCarouselShelfRenderer', 'musicImmersiveCarouselShelfRenderer'];

const text = (t) => (t?.runs ?? []).map((r) => r.text).join('') || t?.simpleText || '';

// Every object under `node` that has `key`, depth first, not descending into matches.
// `skip`: keys whose subtrees are not searched.
function findAll(node, key, out = [], skip = null) {
  if (Array.isArray(node)) for (const v of node) findAll(v, key, out, skip);
  else if (node && typeof node === 'object') {
    if (key in node) out.push(node[key]);
    else for (const [k, v] of Object.entries(node)) if (!skip?.has(k)) findAll(v, key, out, skip);
  }
  return out;
}

const first = (node, key) => findAll(node, key)[0];

// ---- artwork ---------------------------------------------------------------
const ART_SKIP = new Set(['menu', 'navigationEndpoint', 'watchEndpoint', 'watchPlaylistEndpoint', 'overlay', 'thumbnailOverlay', 'buttons', 'badges', 'subtitleBadges', 'secondTitle', 'accessibility', 'trackingParams', 'loggingDirectives']);
const COVER_SIZE = 544;

// Real image urls come from google image hosts; protocol-relative and http urls are upgraded.
const ART_HOSTS = ['googleusercontent.com', 'ggpht.com', 'ytimg.com'];
function cleanUrl(u) {
  if (typeof u !== 'string') return null;
  u = u.trim();
  if (u.length > 4096) return null;
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);
  let url;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!ART_HOSTS.some((h) => host.endsWith(`.${h}`))) return null;
  return url.href;
}

// Pixel size written into a google image url (=w226-h226-..., =s176-c-..., =h120), if any.
function urlSize(u) {
  const suf = /=([^/=?#&]*)$/.exec(u)?.[1] ?? '';
  const w = /(?:^|-)w(\d+)/.exec(suf), h = /(?:^|-)h(\d+)/.exec(suf), sq = /(?:^|-)s(\d+)/.exec(suf);
  if (sq) return [Number(sq[1]), Number(sq[1])];
  if (w || h) return [w ? Number(w[1]) : null, h ? Number(h[1]) : null];
  return null;
}

function candidate(e) {
  const url = cleanUrl(e?.url);
  if (!url) return null;
  let w = Number(e.width) || 0, h = Number(e.height) || 0;
  if (!w && !h) {
    const sz = urlSize(url);
    if (sz) { w = sz[0] ?? sz[1] ?? 0; h = sz[1] ?? sz[0] ?? 0; }
  }
  return { url, w, h: h || w };
}

function imageGroups(node, out = [], path = '') {
  if (Array.isArray(node)) {
    const cs = node.map(candidate).filter(Boolean);
    if (cs.length && cs.length === node.length) out.push({ path, cs });
    else node.forEach((v) => imageGroups(v, out, path));
  } else if (node && typeof node === 'object') {
    const single = typeof node.url === 'string' && !Array.isArray(node) ? candidate(node) : null;
    if (single) { out.push({ path, cs: [single] }); return out; }
    for (const [k, v] of Object.entries(node)) if (!ART_SKIP.has(k)) imageGroups(v, out, path + '.' + k);
  }
  return out;
}

function score(c) {
  const sq = c.w && c.h ? Math.min(c.w, c.h) / Math.max(c.w, c.h) : 0.9;
  return Math.min(c.w, c.h || c.w) * sq ** 4 + (sq >= 0.95 ? 1 : 0);
}
function bestOf(cs) {
  let best = cs[0];
  for (const c of cs) if (score(c) >= score(best)) best = c;
  return best;
}

function bigUrl(c) {
  const u = c.url;
  if (/\.(googleusercontent|ggpht)\.com\//.test(u) && !u.includes('?')) {
    const base = u.replace(/=[^/=]*$/, '');
    return { url: `${base}=w${COVER_SIZE}-h${COVER_SIZE}-l90-rj`, alt: [] };
  }
  const v = /^(https:\/\/i\d*\.ytimg\.com)\/(vi|vi_webp)\/([\w-]{6,})\/(\w+)\.(jpg|webp)(\?.*)?$/.exec(u);
  if (v) {
    if (v[6] && /[?&]sqp=/.test(v[6])) return { url: u, alt: [`${v[1]}/vi/${v[3]}/mqdefault.jpg`] };
    const [, host, , id, name] = v;
    const barred = /^(default|hqdefault|sddefault|[0-3]|hq[1-3]|sd[1-3])$/.test(name);
    return { url: barred ? `${host}/vi/${id}/hq720.jpg` : u, alt: [`${host}/vi/${id}/mqdefault.jpg`] };
  }
  return { url: u, alt: [] };
}

function artOf(r) {
  const groups = imageGroups(r).filter((g) => g.cs.length);
  if (!groups.length) return {};
  const bests = groups.map((g) => ({ g, c: bestOf(g.cs) }));
  const main = bests.reduce((a, b) => (score(b.c) > score(a.c) ? b : a));
  const { url, alt } = bigUrl(main.c);
  const out = { art: url };
  if (alt.length) out.artAlt = alt;
  const bases = new Map();
  for (const b of bests) bases.set(b.c.url.replace(/=[^/=]*$/, '').replace(/\?.*$/, ''), b.c);
  if (bases.size > 1) out.arts = [...bases.values()].slice(0, 4).map((c) => bigUrl(c).url);
  return out;
}

function artDebug(r, depth = 0, path = '', out = []) {
  if (depth > 6 || !r || typeof r !== 'object') return out;
  for (const [k, v] of Object.entries(r)) {
    if (/thumb|image|cover|art/i.test(k)) out.push(path + k);
    else if (v && typeof v === 'object' && !ART_SKIP.has(k)) artDebug(Array.isArray(v) ? v[0] : v, depth + 1, path + k + '.', out);
  }
  return out;
}

// What pressing play on this item should do: a watch (single song, maybe with its radio queue)
// or a whole playlist / album.
function playEndpoint(r) {
  const overlay = first(r.overlay ?? r.thumbnailOverlay, 'playNavigationEndpoint');
  const ep = overlay ?? r.navigationEndpoint ?? first(r.flexColumns?.[0], 'navigationEndpoint');
  if (ep?.watchEndpoint) {
    const { videoId, playlistId, params } = ep.watchEndpoint;
    return { videoId, playlistId, params };
  }
  if (ep?.watchPlaylistEndpoint) {
    const { playlistId, params } = ep.watchPlaylistEndpoint;
    return { playlistId, params };
  }
  // Browse endpoints for playlists (VL...) can also be played as playlistId when no overlay play exists.
  const bId = ep?.browseEndpoint?.browseId;
  if (typeof bId === 'string' && bId.startsWith('VL') && bId.length > 2) {
    return { playlistId: bId.slice(2) };
  }
  return null;
}

function browseIdOf(r) {
  const ep = r.navigationEndpoint ?? first(r.title, 'navigationEndpoint') ?? first(r.flexColumns?.[0], 'navigationEndpoint');
  const id = ep?.browseEndpoint?.browseId;
  return typeof id === 'string' && id ? id : undefined;
}

function pageType(r) {
  const ep = r.navigationEndpoint ?? first(r.title, 'navigationEndpoint') ?? first(r.flexColumns?.[0], 'navigationEndpoint');
  const t = ep?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
  if (t === 'MUSIC_PAGE_TYPE_ALBUM') return 'album';
  if (t === 'MUSIC_PAGE_TYPE_PLAYLIST') return 'playlist';
  if (t === 'MUSIC_PAGE_TYPE_ARTIST' || t === 'MUSIC_PAGE_TYPE_USER_CHANNEL') return 'artist';
  if (ep?.watchEndpoint) return 'song';
  return 'other';
}

// "4:17" / "1:02:03" -> seconds
function seconds(t) {
  if (!/^\d+(:\d\d){1,2}$/.test(t ?? '')) return undefined;
  return t.split(':').reduce((a, n) => a * 60 + Number(n), 0);
}

// Split a run list at " • " separators: [[run, run], [run], ...]
function segments(runs = []) {
  const out = [[]];
  for (const r of runs) {
    if (r.text === ' • ') out.push([]);
    else out[out.length - 1].push(r);
  }
  return out.filter((s) => s.length);
}

// Locale-friendly play/view/listener count & item-type chip filters (EN + CJK + major EU languages).
const isPlays = (t) => /\b(plays|views|listeners|subscribers|vues|écoutes|abonnés|aufrufe|wiedergaben|reproducciones|vistas|oyentes|visualizações|ouvintes|ascolti|visualizzazioni|просмотр|прослуш)\b/i.test(t)
  || /^\d[\d.,\s]*[kmb만억천万億]?\s*(회|재생|조회|回|視聴|再生|次播放|次观看|名订阅자|명)/i.test(t)
  || /^[\d.,]+\s*[kmbKMB]\+?\s+\S+$/.test(t.trim());
const isDuration = (t) => seconds(t) !== undefined;
const isTypeChip = (t) => /^(Song|Video|Album|Single|EP|Playlist|Artist|Podcast|Episode|노래|동영상|앨범|싱글|재생목록|아티스트|曲|動画|アルバム|プレイリスト|アーティスト|Canción|Álbum|Artista|Titel|Chanson|Brano|Música)$/i.test(t.trim());
const runType = (run) => run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;

// Square tile with title and subtitle (albums, playlists, mixes, some songs).
function twoRow(r) {
  const play = playEndpoint(r);
  const kind = pageType(r);
  const browseId = browseIdOf(r);
  return {
    kind: kind === 'other' && play?.videoId ? 'song' : kind,
    title: text(r.title),
    subtitle: text(r.subtitle),
    ...(browseId ? { browseId } : {}),
    ...artOf(r.thumbnailRenderer ?? r.thumbnail ?? r),
    play,
  };
}

// List row: flex column 0 = title, 1 = "artist • plays" (home quick picks) or
// "artist • album • 4:17" (search), 2 = album (home) or plays (search).
function listRow(r) {
  const cols = (r.flexColumns ?? []).map((c) => c.musicResponsiveListItemFlexColumnRenderer?.text);
  const segs = segments(cols[1]?.runs).map((rs) => ({ text: rs.map((x) => x.text).join(''), album: rs.some((x) => runType(x) === 'MUSIC_PAGE_TYPE_ALBUM') }));
  const album = segs.find((x) => x.album)?.text ?? (text(cols[2]) && !isPlays(text(cols[2])) ? text(cols[2]) : undefined);
  const subtitle = segs.filter((x) => !x.album && !isPlays(x.text) && !isDuration(x.text) && !isTypeChip(x.text)).map((x) => x.text);
  const duration = seconds(segs.find((x) => isDuration(x.text))?.text)
    ?? seconds(text(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text));
  const play = playEndpoint(r) ?? (r.playlistItemData?.videoId ? { videoId: r.playlistItemData.videoId } : null);
  const browseId = browseIdOf(r);
  const pt = pageType(r);
  return {
    kind: pt !== 'other' ? pt : play?.videoId ? 'song' : 'other',
    title: text(cols[0]),
    subtitle: subtitle.join(' • '),
    album,
    ...(browseId ? { browseId } : {}),
    ...(duration ? { duration } : {}),
    ...artOf(r.thumbnail ?? r),
    play,
  };
}

function item(entry) {
  if (entry.musicTwoRowItemRenderer) return [twoRow(entry.musicTwoRowItemRenderer), entry.musicTwoRowItemRenderer];
  if (entry.musicResponsiveListItemRenderer) return [listRow(entry.musicResponsiveListItemRenderer), entry.musicResponsiveListItemRenderer];
  return null;
}

// Parse `entries` (shelf contents) into playable items (or artists when `allowBrowse` is true).
function items(entries, onNoArt, { allowBrowse = false } = {}) {
  const out = [];
  for (const e of entries ?? []) {
    const parsed = item(e);
    if (!parsed) continue;
    const [it, renderer] = parsed;
    if (!it.title) continue;
    if (!it.play && !(allowBrowse && it.browseId)) continue;
    if (!it.art) onNoArt?.(it, renderer);
    out.push(it);
  }
  return out;
}

// A shelf's name as YouTube Music shows it.
const JOINING_STRAPLINE = /\b(to|from|by|of|for|like|with|on|about|à|de|pour|par|von|für|mit|para|por|con|di|per)$/i;
function shelfTitle(title, strapline) {
  if (!strapline || !JOINING_STRAPLINE.test(strapline)) return title;
  const lead = strapline.toLowerCase();
  return `${lead[0].toUpperCase()}${lead.slice(1)} ${title}`;
}

// Shelves from a browse response (first page or a continuation).
function parseShelves(response, { onNoArt } = {}) {
  const shelves = [];
  for (const key of SHELF_KEYS) {
    for (const s of findAll(response, key)) {
      const header = s.header?.musicCarouselShelfBasicHeaderRenderer ?? s.header?.musicImmersiveCarouselShelfBasicHeaderRenderer ?? s.header;
      const name = text(header?.title).trim();
      const strapline = text(header?.strapline).trim() || undefined;
      const list = items(s.contents, onNoArt);
      if (name && list.length) shelves.push({ title: shelfTitle(name, strapline), strapline, items: list });
    }
  }
  return shelves;
}

// Library pages (Liked playlists, Liked songs, Saved albums): can be gridRenderer, musicShelfRenderer, or carousels.
function parseLibraryShelf(response, fallbackTitle, { onNoArt } = {}) {
  const grids = findAll(response, 'gridRenderer').flatMap((g) => g.items ?? []);
  const rows = findAll(response, 'musicShelfRenderer').flatMap((s) => s.contents ?? []);
  const playlistRows = findAll(response, 'musicPlaylistShelfRenderer').flatMap((s) => s.contents ?? []);
  const combined = [...grids, ...playlistRows, ...rows];
  const list = items(combined, onNoArt);
  if (list.length) return { title: fallbackTitle, items: list };
  const carousels = parseShelves(response, { onNoArt });
  if (carousels.length) return { title: fallbackTitle, items: carousels.flatMap((c) => c.items) };
  return null;
}

// Songs, albums, playlists, or artists from search. Default filter ('songs') keeps the original contract.
function parseSearch(response, { onNoArt, filter = 'songs' } = {}) {
  const rows = findAll(response, 'musicShelfRenderer').flatMap((s) => s.contents ?? []);
  const allowBrowse = filter === 'artists' || filter === 'albums' || filter === 'playlists' || filter === 'all';
  const parsed = items(rows, onNoArt, { allowBrowse });
  if (filter === 'songs') return parsed.filter((i) => i.kind === 'song' && i.play?.videoId);
  if (filter === 'albums') return parsed.filter((i) => i.kind === 'album' && (i.play?.playlistId || i.browseId));
  if (filter === 'playlists') return parsed.filter((i) => i.kind === 'playlist' && (i.play?.playlistId || i.browseId));
  if (filter === 'artists') return parsed.filter((i) => i.kind === 'artist' && i.browseId);
  return parsed;
}

// Artist browse page -> top songs + albums playable items.
function parseArtistPage(response, { onNoArt } = {}) {
  const header = first(response, 'musicImmersiveHeaderRenderer') ?? first(response, 'musicVisualHeaderRenderer');
  const name = text(header?.title).trim();
  const songs = items(findAll(response, 'musicShelfRenderer').flatMap((s) => s.contents ?? []), onNoArt);
  const albums = parseShelves(response, { onNoArt }).flatMap((s) => s.items);
  const seen = new Set();
  const combined = [];
  for (const it of [...songs, ...albums]) {
    const k = it.play?.videoId ?? it.play?.playlistId ?? it.browseId ?? it.title;
    if (!seen.has(k)) { seen.add(k); combined.push(it); }
  }
  return { name, items: combined.slice(0, 20) };
}

// The songs of a playlist or album (browse VL<id>: rows) or of a mix / radio / album queue (the `next`
// endpoint: queue panel), in order: [{ videoId, title, subtitle (artist), album?, duration (s)?, art }].
const NO_COUNTERPARTS = new Set(['counterpart']);
function parsePlaylistSongs(response) {
  const out = [];
  for (const row of findAll(response, 'musicResponsiveListItemRenderer')) {
    const it = listRow(row);
    if (it.play?.videoId) {
      out.push({
        videoId: it.play.videoId,
        ...(it.play.playlistId ? { playlistId: it.play.playlistId } : {}),
        ...(it.play.params ? { params: it.play.params } : {}),
        title: it.title,
        subtitle: it.subtitle,
        ...(it.album ? { album: it.album } : {}),
        ...(it.duration ? { duration: it.duration } : {}),
        art: it.art,
      });
    }
  }
  for (const row of findAll(response, 'playlistPanelVideoRenderer', [], NO_COUNTERPARTS)) {
    if (!row.videoId) continue;
    const duration = seconds(text(row.lengthText));
    const longSegs = segments(row.longBylineText?.runs).map((rs) => ({
      text: rs.map((x) => x.text).join(''),
      album: rs.some((x) => runType(x) === 'MUSIC_PAGE_TYPE_ALBUM'),
    }));
    const album = longSegs.find((x) => x.album)?.text;
    const we = row.navigationEndpoint?.watchEndpoint;
    out.push({
      videoId: row.videoId,
      ...(we?.playlistId ? { playlistId: we.playlistId } : {}),
      ...(we?.params ? { params: we.params } : {}),
      title: text(row.title),
      subtitle: text(row.shortBylineText),
      ...(album ? { album } : {}),
      ...(duration ? { duration } : {}),
      art: artOf(row.thumbnail).art,
      selected: !!row.selected,
    });
  }
  return out;
}

// Normalize, deduplicate, sanitize artwork URLs, attach playlistId, optionally reorder by a live
// `playerOrder` videoId list (e.g. movie_player.getPlaylist() when shuffled), and ensure accurate
// `selected` marker + windowing around the current track on Up Next queue items.
function normalizeQueue(rawItems, { currentVideoId = null, playlistId = null, playerOrder = null, max = 80 } = {}) {
  let ordered = Array.isArray(rawItems) ? rawItems : [];
  if (Array.isArray(playerOrder) && playerOrder.length >= 2 && ordered.length >= 2) {
    const byId = new Map();
    for (const raw of ordered) {
      if (raw?.videoId && !byId.has(raw.videoId)) byId.set(raw.videoId, raw);
    }
    const reordered = [];
    const used = new Set();
    for (const vid of playerOrder) {
      const hit = byId.get(vid);
      if (hit && !used.has(vid)) {
        used.add(vid);
        reordered.push(hit);
      }
    }
    if (reordered.length >= 2) {
      for (const raw of ordered) {
        if (!raw?.videoId || !used.has(raw.videoId)) reordered.push(raw);
      }
      ordered = reordered;
    }
  }

  const all = [];
  const seen = new Set();
  for (const raw of ordered) {
    if (!raw) continue;
    const title = String(raw.title || '').trim();
    if (!title) continue;
    const artist = String(raw.artist ?? raw.subtitle ?? '').trim();
    const videoId = typeof raw.videoId === 'string' && raw.videoId ? raw.videoId : null;
    const dedupeKey = videoId || `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const pid = (typeof raw.playlistId === 'string' && raw.playlistId) ? raw.playlistId : (playlistId || null);
    const entry = {
      index: Number.isInteger(raw.index) ? raw.index : all.length,
      displayIndex: all.length + 1,
      ...(raw.fromLive ? { fromLive: true } : {}),
      videoId,
      ...(pid ? { playlistId: pid } : {}),
      ...(typeof raw.params === 'string' && raw.params ? { params: raw.params } : {}),
      title,
      artist,
      ...(raw.duration ? { duration: raw.duration } : {}),
      ...(raw.durationText ? { durationText: raw.durationText } : {}),
      art: cleanUrl(raw.art),
      selected: !!raw.selected,
    };
    all.push(entry);
  }

  let selectedIdx = -1;
  if (currentVideoId && all.length) {
    selectedIdx = all.findIndex((it) => it.selected && it.videoId === currentVideoId);
    if (selectedIdx < 0) selectedIdx = all.findIndex((it) => it.videoId === currentVideoId);
    if (selectedIdx >= 0) {
      for (let i = 0; i < all.length; i++) all[i].selected = i === selectedIdx;
    }
  }
  if (selectedIdx < 0) selectedIdx = all.findIndex((it) => it.selected);

  if (all.length <= max) return all;
  const start = selectedIdx >= 0 ? Math.max(0, Math.min(all.length - max, selectedIdx - 15)) : 0;
  return all.slice(start, start + max);
}

// Next-page continuation token for a playlist / liked-songs browse response.
function playlistContinuation(response) {
  for (const key of ['musicPlaylistShelfRenderer', 'musicPlaylistShelfContinuation', 'musicShelfRenderer', 'musicShelfContinuation']) {
    const shelf = first(response, key);
    const tok = shelf?.continuations?.[0]?.nextContinuationData?.continuation;
    if (tok) return tok;
    const item = first(shelf, 'continuationItemRenderer');
    const cmdTok = item?.continuationEndpoint?.continuationCommand?.token;
    if (cmdTok) return cmdTok;
  }
  const item = first(response, 'continuationItemRenderer');
  const cmdTok = item?.continuationEndpoint?.continuationCommand?.token;
  if (cmdTok) return cmdTok;
  return continuation(response);
}

// Find the Lyrics tab browseId ("MPLYt...") inside a `next` response.
function parseLyricsTab(nextResponse) {
  for (const tab of findAll(nextResponse, 'tabRenderer')) {
    const id = tab?.endpoint?.browseEndpoint?.browseId;
    if (typeof id === 'string' && id.startsWith('MPLY')) return id;
  }
  return null;
}

// Extract lyrics text and source attribution from a `browse` response on a lyrics browseId.
function parseLyrics(browseResponse) {
  const shelf = first(browseResponse, 'musicDescriptionShelfRenderer');
  const lyrics = text(shelf?.description).trim();
  if (!lyrics) return null;
  const source = text(shelf?.footer).trim() || '';
  return { lyrics, source };
}

// Token for the next page of shelves, if any.
function continuation(response) {
  const list = first(response, 'sectionListRenderer') ?? first(response, 'sectionListContinuation');
  const c = list?.continuations?.[0]?.nextContinuationData?.continuation ?? first(response, 'continuationCommand')?.token;
  return c ?? null;
}

// ---- account (Settings > Account) -------------------------------------------
function photoOf(t) {
  const ts = (t?.thumbnails ?? []).filter((x) => cleanUrl(x?.url));
  if (!ts.length) return null;
  return cleanUrl(ts.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a)).url);
}
function parseAccount(res) {
  const h = first(res, 'activeAccountHeaderRenderer');
  if (!h) return null;
  const name = text(h.accountName);
  if (!name) return null;
  return { name, handle: text(h.channelHandle) || text(h.email) || '', photo: photoOf(h.accountPhoto) };
}
function parseAccounts(res) {
  return findAll(res, 'accountItem').map((a) => {
    const tokens = a?.serviceEndpoint?.selectActiveIdentityEndpoint?.supportedTokens ?? [];
    const signinUrl = tokens.map((t) => t?.accountSigninToken?.signinUrl).find((u) => typeof u === 'string') ?? null;
    return { name: text(a?.accountName), byline: text(a?.accountByline) || text(a?.channelHandle), photo: photoOf(a?.accountPhoto), selected: !!a?.isSelected, signinUrl };
  }).filter((a) => a.name && (a.selected || a.signinUrl));
}

module.exports = {
  parseAccount, parseAccounts, parseShelves, parseLibraryShelf, shelfTitle,
  parseSearch, parseArtistPage, parsePlaylistSongs, playlistContinuation, parseLyricsTab, parseLyrics,
  normalizeQueue, continuation, artOf, artDebug, text, findAll, cleanUrl,
};
