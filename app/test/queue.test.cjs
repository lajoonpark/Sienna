const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parsePlaylistSongs, normalizeQueue } = require('../electron/ytm-parse.cjs');

test('parsePlaylistSongs preserves playlistId and params on playlist rows and queue panel entries', () => {
  const res = {
    contents: {
      playlistPanelRenderer: {
        contents: [
          {
            playlistPanelVideoRenderer: {
              videoId: 'vid_1',
              title: { runs: [{ text: 'First Song' }] },
              shortBylineText: { runs: [{ text: 'Artist A' }] },
              lengthText: { runs: [{ text: '3:12' }] },
              selected: true,
              navigationEndpoint: { watchEndpoint: { videoId: 'vid_1', playlistId: 'PL_TEST', params: 'wAEB' } },
              thumbnail: { thumbnails: [{ url: 'https://lh3.googleusercontent.com/a=w226-h226', width: 226, height: 226 }] },
            },
          },
          {
            playlistPanelVideoWrapperRenderer: {
              primaryRenderer: {
                playlistPanelVideoRenderer: {
                  videoId: 'vid_2',
                  title: { runs: [{ text: 'Second Song' }] },
                  shortBylineText: { runs: [{ text: 'Artist B' }] },
                  lengthText: { runs: [{ text: '4:05' }] },
                  navigationEndpoint: { watchEndpoint: { videoId: 'vid_2', playlistId: 'PL_TEST' } },
                  thumbnail: { thumbnails: [{ url: 'https://lh3.googleusercontent.com/b=w226-h226', width: 226, height: 226 }] },
                },
              },
              counterpart: [{
                counterpartRenderer: {
                  playlistPanelVideoRenderer: {
                    videoId: 'vid_2_video',
                    title: { runs: [{ text: 'Second Song (Video)' }] },
                    shortBylineText: { runs: [{ text: 'Artist B' }] },
                  },
                },
              }],
            },
          },
        ],
      },
    },
  };

  const songs = parsePlaylistSongs(res);
  assert.equal(songs.length, 2);
  assert.equal(songs[0].playlistId, 'PL_TEST');
  assert.equal(songs[0].params, 'wAEB');
  assert.equal(songs[0].selected, true);
  assert.equal(songs[1].videoId, 'vid_2');
  assert.equal(songs[1].playlistId, 'PL_TEST');
});

test('normalizeQueue keeps full playlist, deduplicates, attaches playlistId, and tracks selected song', () => {
  const raw = [
    { videoId: 'v1', title: 'Track 1', subtitle: 'Mira Sol', art: 'https://lh3.googleusercontent.com/1=w226-h226', selected: true },
    { videoId: 'v1', title: 'Track 1', subtitle: 'Mira Sol', art: 'https://lh3.googleusercontent.com/1=w226-h226', selected: false },
    { videoId: 'v2', title: 'Track 2', subtitle: 'The Arches', art: 'https://evil.example/bad.jpg', selected: false },
    { videoId: 'v3', title: 'Track 3', subtitle: 'Casa Verde', art: '//lh3.googleusercontent.com/3=w226-h226', selected: false },
  ];

  // After advancing to v2, normalizeQueue shifts selected to v2 and attaches PL_ABC to every item
  const q = normalizeQueue(raw, { currentVideoId: 'v2', playlistId: 'PL_ABC' });
  assert.equal(q.length, 3);
  assert.deepEqual(q.map((x) => x.videoId), ['v1', 'v2', 'v3']);
  assert.deepEqual(q.map((x) => x.playlistId), ['PL_ABC', 'PL_ABC', 'PL_ABC']);
  assert.deepEqual(q.map((x) => x.selected), [false, true, false]);
  assert.equal(q[1].art, null);
  assert.equal(q[2].art, 'https://lh3.googleusercontent.com/3=w226-h226');
});

test('ytm-page.js reads full playlist queue from YTM Redux store and exposes playlistId in state()', () => {
  const code = fs.readFileSync(path.join(__dirname, '../electron/ytm-page.js'), 'utf8');
  const queueStore = {
    playlistId: 'PL_LIVE_99',
    items: [
      {
        playlistPanelVideoRenderer: {
          videoId: 's1',
          title: { runs: [{ text: 'Song One' }] },
          shortBylineText: { runs: [{ text: 'Artist One' }] },
          lengthText: { runs: [{ text: '3:01' }] },
          selected: false,
          thumbnail: { thumbnails: [{ url: 'https://lh3.googleusercontent.com/s1=w226-h226' }] },
        },
      },
      {
        playlistPanelVideoWrapperRenderer: {
          primaryRenderer: {
            playlistPanelVideoRenderer: {
              videoId: 's2',
              title: { runs: [{ text: 'Song Two' }] },
              shortBylineText: { runs: [{ text: 'Artist Two' }] },
              lengthText: { runs: [{ text: '2:45' }] },
              selected: false,
              navigationEndpoint: { watchEndpoint: { videoId: 's2', playlistId: 'PL_LIVE_99' } },
              thumbnail: { thumbnails: [{ url: 'https://lh3.googleusercontent.com/s2=w226-h226' }] },
            },
          },
          counterpart: [{
            counterpartRenderer: {
              playlistPanelVideoRenderer: { videoId: 's2_mv', selected: true },
            },
          }],
        },
      },
      {
        playlistPanelVideoRenderer: {
          videoId: 's3',
          title: { runs: [{ text: 'Song Three' }] },
          shortBylineText: { runs: [{ text: 'Artist Three' }] },
          lengthText: { runs: [{ text: '4:10' }] },
          selected: false,
          thumbnail: { thumbnails: [{ url: 'https://lh3.googleusercontent.com/s3=w226-h226' }] },
        },
      },
    ],
  };

  const fakePlayer = {
    getVideoData: () => ({ video_id: 's2', title: 'Song Two', author: 'Artist Two' }),
    getPlaylistId: () => 'PL_LIVE_99',
    getPlayerState: () => 1,
    getCurrentTime: () => 12,
    getDuration: () => 165,
    getVolume: () => 80,
    isMuted: () => false,
  };
  const fakeApp = { store: { getState: () => ({ queue: queueStore }) }, dispatchEvent: () => {} };
  const sandbox = {
    window: {},
    location: { origin: 'https://music.youtube.com', search: '?v=s2&list=PL_LIVE_99' },
    navigator: {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: {
      cookie: '',
      getElementById: (id) => (id === 'movie_player' ? fakePlayer : null),
      querySelector: (sel) => (sel === 'ytmusic-app' ? fakeApp : null),
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    URLSearchParams,
    CustomEvent: class { constructor(t, d) { this.type = t; this.detail = d?.detail; } },
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);

  const q = JSON.parse(JSON.stringify(sandbox.window.__sienna.queue()));
  assert.equal(q.playlistId, 'PL_LIVE_99');
  assert.equal(q.items.length, 3);
  assert.deepEqual(q.items.map((x) => x.videoId), ['s1', 's2', 's3']);
  assert.deepEqual(q.items.map((x) => x.selected), [false, true, false]);
  assert.equal(q.items[0].playlistId, 'PL_LIVE_99');

  const st = JSON.parse(JSON.stringify(sandbox.window.__sienna.state()));
  assert.equal(st.videoId, 's2');
  assert.equal(st.playlistId, 'PL_LIVE_99');
});

test('ytm-page.js DOM fallback reads queue even when ytmusic-player-page ancestor is hidden', () => {
  const code = fs.readFileSync(path.join(__dirname, '../electron/ytm-page.js'), 'utf8');

  // Simulate collapsed ytmusic-player-page (hidden=true) containing ytmusic-player-queue #contents
  const hiddenPage = { hidden: true, parentElement: null };
  const contentsRoot = {
    hidden: false,
    parentElement: hiddenPage,
    contains: () => false,
    querySelectorAll: () => rows,
  };
  const makeRow = (videoId, title, artist, selected = false, slot = null) => ({
    hidden: false,
    style: {},
    parentElement: contentsRoot,
    data: {
      videoId,
      title: { runs: [{ text: title }] },
      shortBylineText: { runs: [{ text: artist }] },
      lengthText: { runs: [{ text: '3:30' }] },
      navigationEndpoint: { watchEndpoint: { videoId, playlistId: 'PL_DOM' } },
      thumbnail: { thumbnails: [{ url: `https://lh3.googleusercontent.com/${videoId}=w226-h226` }] },
    },
    getAttribute: (k) => (k === 'slot' ? slot : null),
    hasAttribute: (k) => k === 'selected' && selected,
    closest: () => null,
    querySelector: () => null,
  });
  const rows = [
    makeRow('d1', 'Dom One', 'Artist 1', true),
    makeRow('d2', 'Dom Two', 'Artist 2', false),
    makeRow('d2_cp', 'Dom Two Counterpart', 'Artist 2', false, 'counterpart'),
    makeRow('d3', 'Dom Three', 'Artist 3', false),
  ];

  const fakePlayer = {
    getVideoData: () => ({ video_id: 'd1' }),
    getPlaylistId: () => 'PL_DOM',
  };
  const sandbox = {
    window: {},
    location: { origin: 'https://music.youtube.com', search: '' },
    navigator: {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    // Even if getComputedStyle reports visibility: 'hidden' inherited from collapsed player page!
    getComputedStyle: () => ({ display: 'flex', visibility: 'hidden' }),
    document: {
      cookie: '',
      getElementById: (id) => (id === 'movie_player' ? fakePlayer : null),
      querySelector: (sel) => (sel === 'ytmusic-player-queue #contents' ? contentsRoot : null),
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);

  const q = JSON.parse(JSON.stringify(sandbox.window.__sienna.queue()));
  assert.equal(q.playlistId, 'PL_DOM');
  assert.equal(q.items.length, 3);
  assert.deepEqual(q.items.map((x) => x.videoId), ['d1', 'd2', 'd3']);
});

test('queueVinylPose: vinyls fly up out of drawer, sweep across screen at full size, and exit past right edge', async () => {
  const { queueVinylPose } = await import('../src/suitcase/tray.js');
  const s0 = { x: -0.68, y: -0.58, d: 6.0, ra: 0.14 };

  for (const lane of [0.65, -0.25, 0.20, -0.70, 0.90]) {
    const start = queueVinylPose(s0, 0, lane);
    const early = queueVinylPose(s0, 0.22, lane);
    const mid = queueVinylPose(s0, 0.5, lane);
    const end = queueVinylPose(s0, 1.0, lane);

    // Starts inside drawer on the bottom-left
    assert.ok(Math.abs(start.x - s0.x) < 1e-6);
    assert.ok(Math.abs(start.y - s0.y) < 1e-6);

    // Lifts up out of the drawer first
    assert.ok(early.y > start.y + 0.15, `expected early lift for lane ${lane}: ${early.y} vs ${start.y}`);

    // Travels smoothly across screen from left through center to right
    assert.ok(mid.x > start.x + 0.4 && mid.x < end.x, `expected mid-screen travel: ${mid.x}`);

    // Exits completely off the right side of the screen (NDC +1.0 + margin)
    assert.ok(end.x > 1.35, `expected exit past right edge (+1.0), got ${end.x}`);

    // Never shrinks or disappears mid-screen (keeps full size or larger all the way across)
    for (let k = 0; k <= 20; k++) {
      const p = queueVinylPose(s0, k / 20, lane);
      assert.ok(p.ra >= s0.ra * 0.99, `vinyl shrunk at u=${k / 20}: ${p.ra} < ${s0.ra}`);
      assert.ok(p.d > 0.3, `depth stayed in front of camera at u=${k / 20}`);
    }
  }
});

test('createRecordTray.openHold launches all 5 vinyls into overlayScene and cleans up after exiting right', async () => {
  const THREE = await import('three');
  const { createRecordTray } = await import('../src/suitcase/tray.js');

  const overlayScene = new THREE.Scene();
  const view = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
  const drawer = new THREE.Group();
  drawer.position.set(-1.8, -1.2, -5.5);
  overlayScene.add(drawer);

  let disposed = 0;
  const fallback = { id: 'fallback' };
  const kit = {
    fallback,
    build(tex) {
      const group = new THREE.Group();
      const labelMat = { map: tex ?? fallback, emissiveMap: tex ?? fallback, dispose() { disposed++; } };
      return { group, labelMat };
    },
  };
  const suitcase = { parts: { drawer }, thump() {} };
  const tray = createRecordTray({ suitcase, kit, overlayScene, view });

  const initialCover = { id: 'c0' };
  tray.openHold([initialCover]);

  // Step through drawer opening & vinyl launches
  let maxOverlayVinyls = 0;
  for (let i = 0; i < 40; i++) {
    tray.update(0.02);
    // Count flying vinyls added directly to overlayScene (excluding drawer)
    const flyingNow = overlayScene.children.length - 1;
    if (flyingNow > maxOverlayVinyls) maxOverlayVinyls = flyingNow;
    // Mid-way through opening, deliver real queue covers and verify live swap works
    if (i === 12) tray.setStackCovers([{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]);
  }
  assert.ok(maxOverlayVinyls >= 4, `expected vinyls flying across overlayScene, saw max ${maxOverlayVinyls}`);
  assert.equal(tray.moving, true, 'tray should remain moving while vinyls cross the screen');

  // Step until all vinyls finish exiting off the right edge of the screen
  for (let i = 0; i < 120; i++) tray.update(0.02);
  assert.equal(overlayScene.children.length, 1, 'all flying vinyls should exit and be removed from overlayScene');
  assert.equal(disposed, 5, 'all 5 vinyl label materials should be disposed cleanly');
  assert.equal(tray.moving, false, 'tray should settle once all vinyls have exited');
});

test('ytm-page.js discovers YTM queue.store controller, handles shuffle mode with current song at #1, and updates queueSig', async () => {
  const code = fs.readFileSync(path.join(__dirname, '../electron/ytm-page.js'), 'utf8');
  const mkItem = (videoId, title, selected = false) => ({
    playlistPanelVideoRenderer: {
      videoId,
      title: { runs: [{ text: title }] },
      shortBylineText: { runs: [{ text: 'Artist' }] },
      lengthText: { runs: [{ text: '3:00' }] },
      selected,
      navigationEndpoint: { watchEndpoint: { videoId, playlistId: 'PL_SHUF' } },
      thumbnail: { thumbnails: [{ url: `https://lh3.googleusercontent.com/${videoId}=w226-h226` }] },
    },
  });

  // Unshuffled initial playlist where 'love_to_lose' is in the middle (index 2)
  let queueState = {
    playlistId: 'PL_SHUF',
    selectedItemIndex: 2,
    items: [
      mkItem('a1', 'Stay With Me'),
      mkItem('a2', 'Riptide'),
      mkItem('love_to_lose', 'Love To Lose', true),
      mkItem('a4', 'Stargazing'),
      mkItem('a5', 'Numb'),
    ],
  };

  let shuffleClicks = 0;
  const doShuffle = () => {
    shuffleClicks++;
    // Real YTM shuffle: puts currently playing track at index 0 and shuffles the rest
    queueState = {
      playlistId: 'PL_SHUF',
      selectedItemIndex: 0,
      items: [
        mkItem('love_to_lose', 'Love To Lose', true),
        mkItem('a5', 'Numb'),
        mkItem('a2', 'Riptide'),
        mkItem('a4', 'Stargazing'),
        mkItem('a1', 'Stay With Me'),
      ],
    };
  };

  // Real YTM puts the Redux store on ytmusic-player-queue.queue.store (NOT app.store directly)
  const queueEl = {
    queue: {
      store: {
        getState: () => ({ queue: queueState }),
        dispatch: (act) => { if (act?.type === 'SHUFFLE') doShuffle(); },
      },
    },
  };
  const shuffleBtn = {
    click: () => doShuffle(),
    getAttribute: () => null,
    classList: { contains: () => false },
    hasAttribute: () => false,
  };
  const playerBar = {
    querySelector: (sel) => (sel.includes('.shuffle') ? shuffleBtn : null),
    getAttribute: () => null,
  };
  const fakePlayer = {
    getVideoData: () => ({ video_id: 'love_to_lose', title: 'Love To Lose', author: 'Sandro Cavazza' }),
    getPlaylistId: () => 'PL_SHUF',
    getPlaylist: () => queueState.items.map((x) => x.playlistPanelVideoRenderer.videoId),
    getPlaylistIndex: () => queueState.selectedItemIndex,
    getPlayerState: () => 1,
    getCurrentTime: () => 5,
    getDuration: () => 178,
    getVolume: () => 75,
    isMuted: () => false,
  };
  const fakeApp = { dispatchEvent: () => {} };

  const sandbox = {
    window: {},
    location: { origin: 'https://music.youtube.com', search: '' },
    navigator: {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: {
      cookie: '',
      getElementById: (id) => (id === 'movie_player' ? fakePlayer : null),
      querySelector: (sel) => {
        if (sel === 'ytmusic-player-queue') return queueEl;
        if (sel === 'ytmusic-app') return fakeApp;
        if (sel === 'ytmusic-player-bar') return playerBar;
        if (sel.includes('.shuffle')) return shuffleBtn;
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    URLSearchParams,
    CustomEvent: class { constructor(t, d) { this.type = t; this.detail = d?.detail; } },
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);

  const beforeState = JSON.parse(JSON.stringify(sandbox.window.__sienna.state()));
  assert.equal(beforeState.shuffle, false);

  // Navigate with shuffle: true (as collection-list Shuffle button does)
  sandbox.window.__sienna.navigate({ videoId: 'love_to_lose', playlistId: 'PL_SHUF', shuffle: true });
  await new Promise((r) => setTimeout(r, 220));

  assert.equal(shuffleClicks, 1, 'deferred shuffle should fire once playlist queue is ready');
  const afterState = JSON.parse(JSON.stringify(sandbox.window.__sienna.state()));
  assert.equal(afterState.shuffle, true);
  assert.notEqual(afterState.queueSig, beforeState.queueSig, 'queueSig should change so open Queue refreshes live');

  const q = JSON.parse(JSON.stringify(sandbox.window.__sienna.queue()));
  assert.equal(q.items.length, 5);
  assert.equal(q.items[0].videoId, 'love_to_lose', 'first song in shuffled queue must be at index 0 (#1)');
  assert.equal(q.items[0].selected, true);
  assert.equal(q.items[0].fromLive, true);
});

test('normalizeQueue reorders fallback unshuffled playlist using movie_player playerOrder when shuffled', () => {
  const unshuffled = Array.from({ length: 50 }, (_, i) => ({
    videoId: `vid_${i + 1}`,
    title: `Song ${i + 1}`,
    subtitle: 'Artist',
    art: `https://lh3.googleusercontent.com/s${i + 1}=w226-h226`,
    selected: i === 40, // vid_41 in the middle
  }));
  // Shuffled playerOrder puts vid_41 FIRST!
  const playerOrder = ['vid_41', 'vid_7', 'vid_19', 'vid_3', 'vid_50'];
  const q = normalizeQueue(unshuffled, { currentVideoId: 'vid_41', playlistId: 'PL_BIG', playerOrder });
  assert.equal(q[0].videoId, 'vid_41');
  assert.equal(q[0].displayIndex, 1);
  assert.equal(q[0].selected, true);
  assert.deepEqual(q.slice(0, 5).map((x) => x.videoId), playerOrder);
});

