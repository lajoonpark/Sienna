const test = require('node:test');
const assert = require('node:assert');
const { parseShelves, parseSearch, parsePlaylistSongs, continuation, artOf } = require('../electron/ytm-parse.cjs');
const home = require('./fixtures/home.json'); // guest FEmusic_home, trimmed
const search = require('./fixtures/search.json'); // guest search "lemon" with the songs filter, 8 rows
const playlistBrowse = require('./fixtures/playlist-browse.json'); // guest browse VL<RDCLAK...>, 6 rows
const mixNext = require('./fixtures/mix-next.json'); // guest `next` for a radio (RDAMVM...), 6 rows

test('home shelves come out with titles and playable items', () => {
  const shelves = parseShelves(home);
  assert.deepStrictEqual(shelves.map((s) => s.title), ['Quick picks', 'Springtime']);
  for (const s of shelves) {
    assert.ok(s.items.length > 0);
    for (const i of s.items) {
      assert.ok(i.title, 'title');
      assert.ok(i.art?.startsWith('https://'), 'art');
      assert.ok(i.play.videoId || i.play.playlistId, 'play endpoint');
    }
  }
});

test('quick picks rows are songs with artist and no play count', () => {
  const [song] = parseShelves(home)[0].items;
  assert.strictEqual(song.kind, 'song');
  assert.strictEqual(song.title, 'Thriller');
  assert.strictEqual(song.subtitle, 'Michael Jackson');
  assert.strictEqual(song.play.videoId, 'Z85lxckrtzg');
  assert.match(song.art, /=w544-h544/);
});

test('playlist tiles play the whole playlist', () => {
  const [pl] = parseShelves(home)[1].items;
  assert.strictEqual(pl.kind, 'playlist');
  assert.strictEqual(pl.title, 'Feel-Good Pop & Rock');
  assert.strictEqual(pl.play.playlistId, 'RDCLAK5uy_m0wlRoNn5iCTTgBedfoOQ19Jq9P3XTLIA');
  assert.strictEqual(pl.play.videoId, undefined);
});

test('continuation token comes from the section list', () => {
  assert.match(continuation(home), /^4qmF/);
  assert.strictEqual(continuation({}), null);
});

// ---- search ----------------------------------------------------------------

test('search: songs with artist, album, duration, art and a videoId', () => {
  const songs = parseSearch(search);
  assert.strictEqual(songs.length, 8);
  for (const s of songs) {
    assert.strictEqual(s.kind, 'song');
    assert.ok(s.title && s.subtitle, 'title and artist');
    assert.ok(s.play.videoId, 'videoId');
    assert.ok(s.duration > 30 && s.duration < 3600, 'duration ' + s.duration);
    assert.match(s.art, /^https:\/\/.*=w544-h544/);
  }
  const [lemon] = songs;
  assert.deepStrictEqual(
    { title: lemon.title, subtitle: lemon.subtitle, album: lemon.album, duration: lemon.duration, videoId: lemon.play.videoId },
    { title: 'Lemon', subtitle: 'Kenshi Yonezu', album: 'Lemon', duration: 257, videoId: '3NNhrqHZqlI' });
});

test('search: play counts and "Song" tags never end up in the artist', () => {
  for (const s of parseSearch(search)) assert.doesNotMatch(s.subtitle, /plays|views|Song|\d+:\d\d/);
});

test('search: empty or odd responses give an empty list', () => {
  assert.deepStrictEqual(parseSearch({}), []);
  assert.deepStrictEqual(parseSearch(null), []);
});

// ---- playlist songs (for the cover collage) --------------------------------

test('playlist browse rows and mix queue entries both give videoId + art', () => {
  for (const res of [playlistBrowse, mixNext]) {
    const songs = parsePlaylistSongs(res);
    assert.strictEqual(songs.length, 6);
    // the album spread shows artist and length too
    for (const s of songs) { assert.ok(s.videoId); assert.ok(s.title); assert.ok(s.subtitle, 'artist'); assert.ok(s.duration > 60, 'duration'); assert.match(s.art, /^https:\/\//); }
  }
});

test('album queue: a song with an audio + video version counts once (counterpart skipped)', () => {
  const pv = (videoId, title) => ({ videoId, title: { runs: [{ text: title }] }, shortBylineText: { runs: [{ text: 'Artist' }] }, lengthText: { runs: [{ text: '2:39' }] },
    thumbnail: { thumbnails: [{ url: 'https://lh3.googleusercontent.com/x=w544-h544', width: 544, height: 544 }] } });
  const res = { contents: { playlistPanelRenderer: { contents: [
    { playlistPanelVideoRenderer: pv('aaaaaaaaaaa', 'One') },
    { playlistPanelVideoWrapperRenderer: { primaryRenderer: { playlistPanelVideoRenderer: pv('bbbbbbbbbbb', 'Devilish') },
      counterpart: [{ counterpartRenderer: { playlistPanelVideoRenderer: pv('vvvvvvvvvvv', 'Devilish') } }] } },
    { playlistPanelVideoRenderer: pv('ccccccccccc', 'Three') },
  ] } } };
  assert.deepStrictEqual(parsePlaylistSongs(res).map((s) => s.videoId), ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
});

// ---- artwork extraction ----------------------------------------------------

const th = (...urls) => ({ thumbnails: urls.map(([url, width, height]) => ({ url, width, height })) });
const L = 'https://lh3.googleusercontent.com/AbCdEf123';
const art = (r) => artOf(r).art;

test('art: thumbnailRenderer > musicThumbnailRenderer (two-row tiles)', () => {
  assert.strictEqual(art({ thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: th([L + '=w60-h60-l90-rj', 60, 60], [L + '=w226-h226-l90-rj', 226, 226]) } } }), L + '=w544-h544-l90-rj');
});

test('art: croppedSquareThumbnailRenderer', () => {
  assert.strictEqual(art({ thumbnailRenderer: { croppedSquareThumbnailRenderer: { thumbnail: th([L + '=s176', 176, 176]) } } }), L + '=w544-h544-l90-rj');
});

test('art: plain thumbnail.thumbnails (list rows)', () => {
  assert.strictEqual(art({ thumbnail: th([L + '=w60-h60', 60, 60]) }), L + '=w544-h544-l90-rj');
});

test('art: animated renderer with a backup static thumbnail', () => {
  const r = { thumbnailRenderer: { musicAnimatedThumbnailRenderer: { animatedThumbnail: { thumbnails: [{ url: 'https://rr1---sn.googlevideo.com/x.webp' }] }, backupRenderer: { musicThumbnailRenderer: { thumbnail: th([L + '=w226-h226', 226, 226]) } } } } };
  assert.strictEqual(art(r), L + '=w544-h544-l90-rj');
});

test('art: image-model "sources" (newer view models) and a lone {url,width,height}', () => {
  assert.strictEqual(art({ contentImage: { thumbnailViewModel: { image: { sources: [{ url: L + '=w120-h120', width: 120, height: 120 }] } } } }), L + '=w544-h544-l90-rj');
  assert.strictEqual(art({ image: { url: L + '=s200', width: 200, height: 200 } }), L + '=w544-h544-l90-rj');
});

test('art: protocol-relative and http urls are upgraded to https', () => {
  assert.strictEqual(art({ thumbnail: th(['//lh3.googleusercontent.com/AbCdEf123=w60-h60', 60, 60]) }), L + '=w544-h544-l90-rj');
  assert.match(art({ thumbnail: th(['http://yt3.ggpht.com/xyz=s88-c-k-c0x00ffffff-no-rj', 88, 88]) }), /^https:\/\/yt3\.ggpht\.com\/xyz=w544/);
});

test('art: every lh3 / yt3 sizing suffix form is resized, and no suffix gets one', () => {
  for (const suf of ['=w60-h60-l90-rj', '=s176-c-k-c0x00ffffff-no-rj', '=s300', '=w226-h226-p-l90-rj-nd-v1', '=h120', '']) {
    assert.strictEqual(art({ thumbnail: th([L + suf, 120, 120]) }), L + '=w544-h544-l90-rj', 'suffix ' + suf);
  }
});

test('art: picks the largest square one, not the last or the widest', () => {
  const r = { thumbnail: th([L + '=w60-h60', 60, 60], ['https://lh3.googleusercontent.com/WIDE=w1000-h200', 1000, 200], ['https://lh3.googleusercontent.com/SQ=w400-h400', 400, 400], [L + '=w120-h120', 120, 120]) };
  assert.strictEqual(art(r), 'https://lh3.googleusercontent.com/SQ=w544-h544-l90-rj');
});

test('art: sizes missing from the entries are read from the url', () => {
  const r = { thumbnail: { thumbnails: [{ url: L + '=w60-h60' }, { url: 'https://lh3.googleusercontent.com/BIG=w500-h500' }] } };
  assert.strictEqual(art(r), 'https://lh3.googleusercontent.com/BIG=w544-h544-l90-rj');
});

test('art: images in menus, endpoints and overlays are not covers', () => {
  const r = { menu: { thumbnail: th([L + '=w60-h60', 60, 60]) }, navigationEndpoint: { thumbnail: th([L + '=w60-h60', 60, 60]) }, title: { runs: [{ text: 'x' }] } };
  assert.deepStrictEqual(artOf(r), {});
});

test('art: video frames. hqdefault/sddefault have black bars, so ask for hq720 and keep mqdefault as the fallback', () => {
  for (const name of ['hqdefault', 'sddefault', 'default']) {
    const r = artOf({ thumbnail: th([`https://i.ytimg.com/vi/ukCSiCABn0g/${name}.jpg`, 480, 360]) });
    assert.strictEqual(r.art, 'https://i.ytimg.com/vi/ukCSiCABn0g/hq720.jpg');
    assert.deepStrictEqual(r.artAlt, ['https://i.ytimg.com/vi/ukCSiCABn0g/mqdefault.jpg']);
  }
  assert.strictEqual(art({ thumbnail: th(['https://i.ytimg.com/vi/ukCSiCABn0g/maxresdefault.jpg', 1280, 720]) }), 'https://i.ytimg.com/vi/ukCSiCABn0g/maxresdefault.jpg');
});

test('art: signed video-frame crops (sqp=, rs=) are YouTube\'s own square crops and stay untouched', () => {
  const u = 'https://i.ytimg.com/vi/ukCSiCABn0g/hqdefault.jpg?sqp=-oaymwEWCJADEOEBIAQqCggAEOADGC0guwJIWg&rs=AMzJL3n8UjHZ';
  assert.strictEqual(art({ thumbnail: th([u, 336, 336]) }), u);
});

test('art: collage renderers give the best cover plus up to four distinct covers', () => {
  const tile = (id) => ({ musicThumbnailRenderer: { thumbnail: th([`https://lh3.googleusercontent.com/${id}=w60-h60`, 60, 60], [`https://lh3.googleusercontent.com/${id}=w226-h226`, 226, 226]) } });
  const r = artOf({ thumbnailRenderer: { musicMultiImageRenderer: { tiles: ['A', 'B', 'C', 'D', 'E'].map(tile) } } });
  assert.match(r.art, /\/A=w544/);
  assert.strictEqual(r.arts.length, 4);
  assert.deepStrictEqual(r.arts.map((u) => u.split('/').pop().split('=')[0]), ['A', 'B', 'C', 'D']);
  // one image in several sizes is not a collage
  assert.strictEqual(artOf({ thumbnail: th([L + '=w60-h60', 60, 60], [L + '=w226-h226', 226, 226]) }).arts, undefined);
});

test('art: a signed-in style playlist tile (video-frame cover, no lh3) comes out with art end to end', () => {
  const tile = { musicTwoRowItemRenderer: {
    thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: th(['https://i.ytimg.com/vi/ukCSiCABn0g/hqdefault.jpg', 480, 360]) } },
    title: { runs: [{ text: 'My Playlist', navigationEndpoint: { browseEndpoint: { browseId: 'VLPL123', browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_PLAYLIST' } } } } }] },
    subtitle: { runs: [{ text: 'Playlist' }] },
    thumbnailOverlay: { musicItemThumbnailOverlayRenderer: { content: { musicPlayButtonRenderer: { playNavigationEndpoint: { watchPlaylistEndpoint: { playlistId: 'PL123' } } } } } },
  } };
  const [shelf] = parseShelves({ musicCarouselShelfRenderer: { header: { musicCarouselShelfBasicHeaderRenderer: { title: { runs: [{ text: 'Your playlists' }] } } }, contents: [tile] } });
  const [pl] = shelf.items;
  assert.strictEqual(pl.kind, 'playlist');
  assert.strictEqual(pl.art, 'https://i.ytimg.com/vi/ukCSiCABn0g/hq720.jpg');
  assert.strictEqual(pl.play.playlistId, 'PL123');
});

test('art: an item with no usable image is reported through onNoArt, with its renderer', () => {
  const tile = { musicTwoRowItemRenderer: {
    thumbnailRenderer: { somethingNew: { picture: { frames: [] } } },
    title: { runs: [{ text: 'Mystery', navigationEndpoint: { watchPlaylistEndpoint: { playlistId: 'RDX' } } }] },
    thumbnailOverlay: { musicItemThumbnailOverlayRenderer: { content: { musicPlayButtonRenderer: { playNavigationEndpoint: { watchPlaylistEndpoint: { playlistId: 'RDX' } } } } } },
  } };
  const seen = [];
  const [shelf] = parseShelves({ musicCarouselShelfRenderer: { header: { musicCarouselShelfBasicHeaderRenderer: { title: { runs: [{ text: 'S' }] } } }, contents: [tile] } }, { onNoArt: (i, r) => seen.push([i.title, Object.keys(r)]) });
  assert.strictEqual(shelf.items[0].art, undefined);
  assert.deepStrictEqual(seen, [['Mystery', ['thumbnailRenderer', 'title', 'thumbnailOverlay']]]);
});
