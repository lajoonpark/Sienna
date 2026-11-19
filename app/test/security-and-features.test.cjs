const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// Mock `electron` so main-process helpers can be unit-tested cleanly in plain Node.
const fakeApp = { isPackaged: false, getVersion: () => '0.1.0' };
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: fakeApp,
      session: { defaultSession: {}, fromPartition: () => ({}) },
      net: { fetch: async () => ({ status: 404 }) },
      shell: { openExternal: async () => {} },
    };
  }
  return origLoad.call(this, request, parent, isMain);
};

const security = require('../electron/security.cjs');
const { compareVersions, parseSemver } = require('../electron/updater.cjs');
const { encodeFrame } = require('../electron/discord.cjs');
const {
  parseSearch, parseLibraryShelf, parseLyricsTab, parseLyrics, parseArtistPage,
} = require('../electron/ytm-parse.cjs');

test('security: SIENNA_DEV_URL is ignored when packaged and restricted to loopback in dev', () => {
  const prev = process.env.SIENNA_DEV_URL;
  try {
    fakeApp.isPackaged = false;
    process.env.SIENNA_DEV_URL = 'https://evil.example/';
    assert.equal(security.devServerUrl(), null);
    assert.equal(security.isAppUrl('https://evil.example/index.html'), false);

    process.env.SIENNA_DEV_URL = 'http://127.0.0.1:5173/';
    assert.equal(security.devServerUrl()?.origin, 'http://127.0.0.1:5173');
    assert.equal(security.isAppUrl('http://127.0.0.1:5173/index.html'), true);
    assert.equal(security.isAppUrl('http://evil.example/index.html'), false);

    // Packaged builds ignore SIENNA_DEV_URL even for loopback
    fakeApp.isPackaged = true;
    assert.equal(security.devServerUrl(), null);
    assert.equal(security.devEnv('SIENNA_QUERY'), '');
    assert.equal(security.isAppUrl('http://127.0.0.1:5173/index.html'), false);
  } finally {
    fakeApp.isPackaged = false;
    if (prev === undefined) delete process.env.SIENNA_DEV_URL;
    else process.env.SIENNA_DEV_URL = prev;
  }
});

test('security: isHttpsHostAllowed enforces HTTPS and explicit extra SSO hosts only', () => {
  const extra = new Set(['sso.university.edu']);
  assert.equal(security.isHttpsHostAllowed('https://accounts.google.com/ServiceLogin', new Set()), true);
  assert.equal(security.isHttpsHostAllowed('https://sso.university.edu/login', new Set()), false);
  assert.equal(security.isHttpsHostAllowed('https://sso.university.edu/login', extra), true);
  assert.equal(security.isHttpsHostAllowed('https://idp.sso.university.edu/auth', extra), true);
  assert.equal(security.isHttpsHostAllowed('http://sso.university.edu/login', extra), false);
  assert.equal(security.isHttpsHostAllowed('https://evil.university.edu.attacker.com/', extra), false);
});

test('security: isSafeReleaseUrl only permits https://github.com/lajoonpark/Sienna*', () => {
  assert.equal(security.isSafeReleaseUrl('https://github.com/lajoonpark/Sienna/releases/tag/v0.2.0'), true);
  assert.equal(security.isSafeReleaseUrl('https://github.com/other/repo'), false);
  assert.equal(security.isSafeReleaseUrl('http://github.com/lajoonpark/Sienna/releases'), false);
  assert.equal(security.isSafeReleaseUrl('javascript:alert(1)'), false);
});

test('updater: semver parsing and comparison', () => {
  assert.deepEqual(parseSemver('v1.2.3-beta.1'), { major: 1, minor: 2, patch: 3, pre: 'beta.1' });
  assert.ok(compareVersions('0.2.0', '0.1.0') > 0);
  assert.ok(compareVersions('1.0.0', '1.0.0-beta.2') > 0);
  assert.equal(compareVersions('0.1.0', 'v0.1.0'), 0);
  assert.ok(compareVersions('0.1.0', '0.1.1') < 0);
});

test('discord: encodeFrame writes little-endian op + length + UTF-8 JSON', () => {
  const payload = { v: 1, client_id: '123' };
  const buf = encodeFrame(0, payload);
  assert.equal(buf.readInt32LE(0), 0);
  assert.equal(buf.readInt32LE(4), Buffer.byteLength(JSON.stringify(payload)));
  assert.deepEqual(JSON.parse(buf.subarray(8).toString('utf8')), payload);
});

test('ytm-parse: lyrics tab & lyrics extraction', () => {
  const next = {
    contents: {
      singleColumnMusicWatchNextResultsRenderer: {
        tabbedRenderer: {
          watchNextTabbedResultsRenderer: {
            tabs: [
              { tabRenderer: { title: 'Up next' } },
              { tabRenderer: { title: 'Lyrics', endpoint: { browseEndpoint: { browseId: 'MPLYt_abc123' } } } },
            ],
          },
        },
      },
    },
  };
  assert.equal(parseLyricsTab(next), 'MPLYt_abc123');
  const browse = {
    contents: {
      sectionListRenderer: {
        contents: [{
          musicDescriptionShelfRenderer: {
            description: { runs: [{ text: 'Line one\nLine two' }] },
            footer: { runs: [{ text: 'Source: LyricFind' }] },
          },
        }],
      },
    },
  };
  assert.deepEqual(parseLyrics(browse), { lyrics: 'Line one\nLine two', source: 'Source: LyricFind' });
});

test('ytm-parse: multi-filter search (albums, playlists, artists) & locale play counts', () => {
  const mkRow = (title, col1Runs, pageType, browseId, playlistId) => ({
    musicResponsiveListItemRenderer: {
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: col1Runs } } },
      ],
      navigationEndpoint: {
        browseEndpoint: {
          browseId,
          browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType } },
        },
      },
      ...(playlistId ? {
        overlay: { playNavigationEndpoint: { watchPlaylistEndpoint: { playlistId } } },
      } : {}),
      thumbnail: { thumbnails: [{ url: 'https://lh3.googleusercontent.com/abc=w120-h120', width: 120, height: 120 }] },
    },
  });

  const res = {
    contents: {
      musicShelfRenderer: {
        contents: [
          mkRow('Tuscan Sun', [{ text: 'Album' }, { text: ' • ' }, { text: 'Mira Sol' }, { text: ' • ' }, { text: '2025' }], 'MUSIC_PAGE_TYPE_ALBUM', 'MPREb_123', 'OLAK5uy_123'),
          mkRow('Night Mix', [{ text: 'Playlist' }, { text: ' • ' }, { text: 'Sienna' }], 'MUSIC_PAGE_TYPE_PLAYLIST', 'VLPL123', 'PL123'),
          mkRow('Mira Sol', [{ text: '아티스트' }, { text: ' • ' }, { text: '12만 명' }], 'MUSIC_PAGE_TYPE_ARTIST', 'UC_mira', null),
        ],
      },
    },
  };

  const albums = parseSearch(res, { filter: 'albums' });
  assert.equal(albums.length, 1);
  assert.equal(albums[0].title, 'Tuscan Sun');
  assert.equal(albums[0].subtitle, 'Mira Sol • 2025');

  const playlists = parseSearch(res, { filter: 'playlists' });
  assert.equal(playlists.length, 1);
  assert.equal(playlists[0].play.playlistId, 'PL123');

  const artists = parseSearch(res, { filter: 'artists' });
  assert.equal(artists.length, 1);
  assert.equal(artists[0].browseId, 'UC_mira');
  assert.equal(artists[0].subtitle, ''); // localized type chip & subscriber count stripped
});

test('ytm-parse: library shelf & artist page parsing', () => {
  const libRes = {
    gridRenderer: {
      items: [{
        musicTwoRowItemRenderer: {
          title: { runs: [{ text: 'My Favourites' }] },
          subtitle: { runs: [{ text: 'Playlist' }] },
          navigationEndpoint: {
            browseEndpoint: {
              browseId: 'VLPL_fav',
              browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_PLAYLIST' } },
            },
          },
        },
      }],
    },
  };
  const shelf = parseLibraryShelf(libRes, 'Your playlists');
  assert.equal(shelf.title, 'Your playlists');
  assert.equal(shelf.items.length, 1);
  assert.equal(shelf.items[0].play.playlistId, 'PL_fav');

  const artistRes = {
    header: { musicImmersiveHeaderRenderer: { title: { runs: [{ text: 'Mira Sol' }] } } },
    contents: {
      musicShelfRenderer: {
        contents: [{
          musicResponsiveListItemRenderer: {
            flexColumns: [
              { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Lemon Hours', navigationEndpoint: { watchEndpoint: { videoId: 'vid1234' } } }] } } },
              { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Mira Sol' }, { text: ' • ' }, { text: '3:42' }] } } },
            ],
          },
        }],
      },
    },
  };
  const artist = parseArtistPage(artistRes);
  assert.equal(artist.name, 'Mira Sol');
  assert.equal(artist.items.length, 1);
  assert.equal(artist.items[0].play.videoId, 'vid1234');
});
