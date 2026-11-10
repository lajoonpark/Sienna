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
// Covers hide in many places: thumbnailRenderer, thumbnail, musicThumbnailRenderer,
// croppedSquareThumbnailRenderer, animated/backup renderers, collage renderers, newer "sources"
// image models. So instead of following one path, collect EVERY list of images inside a renderer
// (skipping menus, endpoints and badges) and pick the best one.

const ART_SKIP = new Set(['menu', 'navigationEndpoint', 'watchEndpoint', 'watchPlaylistEndpoint', 'overlay', 'thumbnailOverlay', 'buttons', 'badges', 'subtitleBadges', 'secondTitle', 'accessibility', 'trackingParams', 'loggingDirectives']);
const COVER_SIZE = 544;

// Real image urls come from google image hosts; protocol-relative and http urls are upgraded.
// The host is checked on the parsed url (not the text), so "https://x.invalid?.ytimg.com/" or
// "https://ytimg.com.x.invalid/" do not pass; nor do user info or a port.
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

// One candidate: { url, w, h }; sizes come from the entry, or from the url, or are unknown (0).
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

// Groups of candidates: each array of {url, width, height} is one image in several sizes.
function imageGroups(node, out = [], path = '') {
  if (Array.isArray(node)) {
    const cs = node.map(candidate).filter(Boolean);
    if (cs.length && cs.length === node.length) out.push({ path, cs });
    else node.forEach((v) => imageGroups(v, out, path));
  } else if (node && typeof node === 'object') {
    // a lone { url, width, height } (e.g. an image model with a single source) counts as a group of one
    const single = typeof node.url === 'string' && !Array.isArray(node) ? candidate(node) : null;
    if (single) { out.push({ path, cs: [single] }); return out; }
    for (const [k, v] of Object.entries(node)) if (!ART_SKIP.has(k)) imageGroups(v, out, path + '.' + k);
  }
  return out;
}

// Bigger and closer to square is better; unknown size ranks last-listed first (lists ascend).
function score(c) {
  const sq = c.w && c.h ? Math.min(c.w, c.h) / Math.max(c.w, c.h) : 0.9;
  return Math.min(c.w, c.h || c.w) * sq ** 4 + (sq >= 0.95 ? 1 : 0);
}
function bestOf(cs) {
  let best = cs[0];
  for (const c of cs) if (score(c) >= score(best)) best = c;
  return best;
}

// Resize / reformat one url for showing up close. Returns { url, alt[] }.
function bigUrl(c) {
  const u = c.url;
  // lh3 / yt3 / ggpht: any "=..." sizing suffix (=w226-h226-l90-rj, =s176-c-k-c0x00ffffff-no-rj, =s300), or none
  if (/\.(googleusercontent|ggpht)\.com\//.test(u) && !u.includes('?')) {
    const base = u.replace(/=[^/=]*$/, '');
    return { url: `${base}=w${COVER_SIZE}-h${COVER_SIZE}-l90-rj`, alt: [] };
  }
  // i.ytimg.com video frames: hqdefault / sddefault have black bars top and bottom (4:3 frame with the
  // 16:9 picture inside), so ask for hq720 (true 16:9, no bars; a middle square crop is clean) and keep
  // mqdefault (always exists, also no bars) as the fallback. Urls with a signature (sqp=, rs=) are
  // YouTube's own crops: leave those alone.
  const v = /^(https:\/\/i\d*\.ytimg\.com)\/(vi|vi_webp)\/([\w-]{6,})\/(\w+)\.(jpg|webp)(\?.*)?$/.exec(u);
  if (v) {
    if (v[6] && /[?&]sqp=/.test(v[6])) return { url: u, alt: [`${v[1]}/vi/${v[3]}/mqdefault.jpg`] };
    const [, host, , id, name] = v;
    const barred = /^(default|hqdefault|sddefault|[0-3]|hq[1-3]|sd[1-3])$/.test(name);
    return { url: barred ? `${host}/vi/${id}/hq720.jpg` : u, alt: [`${host}/vi/${id}/mqdefault.jpg`] };
  }
  return { url: u, alt: [] };
}

// { art, artAlt?, arts? } for a renderer: the best image, fallbacks for it, and (collages with
// several different images) up to four more covers to build a collage from.
function artOf(r) {
  const groups = imageGroups(r).filter((g) => g.cs.length);
  if (!groups.length) return {};
  const bests = groups.map((g) => ({ g, c: bestOf(g.cs) }));
  const main = bests.reduce((a, b) => (score(b.c) > score(a.c) ? b : a));
  const { url, alt } = bigUrl(main.c);
  const out = { art: url };
  if (alt.length) out.artAlt = alt;
  // different base images (not just sizes of the same one) mean a collage renderer
  const bases = new Map();
  for (const b of bests) bases.set(b.c.url.replace(/=[^/=]*$/, '').replace(/\?.*$/, ''), b.c);
  if (bases.size > 1) out.arts = [...bases.values()].slice(0, 4).map((c) => bigUrl(c).url);
  return out;
}

// Where the thumbnail-ish things are in a renderer, for the log line when art is missing.
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
  return null;
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
const isPlays = (t) => /\b(plays|views|listeners|subscribers)$/.test(t);
const isDuration = (t) => seconds(t) !== undefined;
const runType = (run) => run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;

// Square tile with title and subtitle (albums, playlists, mixes, some songs).
function twoRow(r) {
  const play = playEndpoint(r);
  const kind = pageType(r);
  return {
    kind: kind === 'other' && play?.videoId ? 'song' : kind,
    title: text(r.title),
    subtitle: text(r.subtitle),
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
  const subtitle = segs.filter((x) => !x.album && !isPlays(x.text) && !isDuration(x.text) && !/^(Song|Video)$/.test(x.text)).map((x) => x.text);
  const duration = seconds(segs.find((x) => isDuration(x.text))?.text)
    ?? seconds(text(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text));
  const play = playEndpoint(r) ?? (r.playlistItemData?.videoId ? { videoId: r.playlistItemData.videoId } : null);
  return {
    kind: play?.videoId ? 'song' : pageType(r),
    title: text(cols[0]),
    subtitle: subtitle.join(' • '),
    album,
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

// Parse `entries` (shelf contents) into playable items. `onNoArt(item, renderer)` is told about
// items that still have no cover, so the cause can be logged.
function items(entries, onNoArt) {
  const out = [];
  for (const e of entries ?? []) {
    const parsed = item(e);
    if (!parsed) continue;
    const [it, renderer] = parsed;
    if (!it.play || !it.title) continue;
    if (!it.art) onNoArt?.(it, renderer);
    out.push(it);
  }
  return out;
}

// Shelves from a browse response (first page or a continuation).
// Only things that can be played land on a shelf; artists and empty shelves are dropped.
function parseShelves(response, { onNoArt } = {}) {
  const shelves = [];
  for (const key of SHELF_KEYS) {
    for (const s of findAll(response, key)) {
      const header = s.header?.musicCarouselShelfBasicHeaderRenderer ?? s.header?.musicImmersiveCarouselShelfBasicHeaderRenderer ?? s.header;
      const title = text(header?.title);
      const list = items(s.contents, onNoArt);
      if (title && list.length) shelves.push({ title, strapline: text(header?.strapline) || undefined, items: list });
    }
  }
  return shelves;
}

// Songs from a search made with the songs filter (a flat list of song rows).
function parseSearch(response, { onNoArt } = {}) {
  const rows = findAll(response, 'musicShelfRenderer').flatMap((s) => s.contents ?? []);
  return items(rows, onNoArt).filter((i) => i.kind === 'song' && i.play.videoId);
}

// The songs of a playlist or album (browse VL<id>: rows) or of a mix / radio / album queue (the `next`
// endpoint: queue panel), in order: [{ videoId, title, subtitle (artist), duration (s)?, art }].
// The playlist cover collage uses only videoId and art; the album spread (src/spread.js) all of it.
const NO_COUNTERPARTS = new Set(['counterpart']);
function parsePlaylistSongs(response) {
  const out = [];
  for (const row of findAll(response, 'musicResponsiveListItemRenderer')) {
    const it = listRow(row);
    if (it.play?.videoId) out.push({ videoId: it.play.videoId, title: it.title, subtitle: it.subtitle, ...(it.duration ? { duration: it.duration } : {}), art: it.art });
  }
  // Signed in, a queue entry with both an audio and a music-video version is a
  // playlistPanelVideoWrapperRenderer: the primaryRenderer is the track, the `counterpart` is the same
  // song as a video under another videoId. Reading both put every such song in the album twice.
  for (const row of findAll(response, 'playlistPanelVideoRenderer', [], NO_COUNTERPARTS)) {
    if (!row.videoId) continue;
    const duration = seconds(text(row.lengthText));
    out.push({ videoId: row.videoId, title: text(row.title), subtitle: text(row.shortBylineText), ...(duration ? { duration } : {}), art: artOf(row.thumbnail).art });
  }
  return out;
}

// Token for the next page of shelves, if any.
function continuation(response) {
  const list = first(response, 'sectionListRenderer') ?? first(response, 'sectionListContinuation');
  const c = list?.continuations?.[0]?.nextContinuationData?.continuation ?? first(response, 'continuationCommand')?.token;
  return c ?? null;
}

module.exports = { parseShelves, parseSearch, parsePlaylistSongs, continuation, artOf, artDebug, text, findAll, cleanUrl };
