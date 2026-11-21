// Real list components with an isolated, scriptable fake store; no account/network access.
// Usage: node scripts/lists-check.mjs <out_dir> (SIENNA_PORT, SIENNA_ANGLE)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-lists');
const port = Number(process.env.SIENNA_PORT) || 5261;
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const angle = process.env.SIENNA_ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const wait = ms => page.waitForTimeout(ms);
const pass = text => console.log(`PASS ${text}`);
try {
  await page.addInitScript(() => {
    window.__kitCallbacks = { raf: 0, timeout: 0, interval: 0 };
    for (const [name, kind] of [['requestAnimationFrame', 'raf'], ['setTimeout', 'timeout'], ['setInterval', 'interval']]) {
      const original = window[name].bind(window);
      window[name] = (callback, ...args) => {
        const kit = /\/src\/ui\/|\/src\/(list-bar|searchpaint)\.js/.test(new Error().stack || '');
        return original(kit && typeof callback === 'function' ? (...values) => {
          window.__kitCallbacks[kind]++; return callback(...values);
        } : callback, ...args);
      };
    }
  });
  await page.route('**/lists-fixture.html*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><script type="module" src="/src/fonts.js"></script></head><body></body></html>' }));
  await page.goto(`http://127.0.0.1:${port}/lists-fixture.html?font=amatic`);
  await page.evaluate(async () => {
    const { createSearch } = await import('/src/search.js');
    const { createCollectionList } = await import('/src/collection-list.js');
    const { createLiner } = await import('/src/liner.js');
    const { createCaption } = await import('/src/controls.js');
    const { listStats } = await import('/src/ui/list.js');
    const { paperStats } = await import('/src/ui/paper.js');
    const song = (i, prefix = 'Song') => ({ id: `s${i}`, videoId: `s${i}`, title: `${prefix} ${String(i).padStart(3, '0')}`, subtitle: `Artist ${i % 5}`, album: `Album ${i % 3}`, kind: 'song', duration: 180, track: i + 1 });
    const f = window.fixture = { played: [], shuffled: [], commands: [], collections: [], listeners: [], calls: [], leaks: [], artistFails: true,
      songs: Array.from({ length: 612 }, (_, i) => song(i)), queue: [0, 1, 2].map(i => ({ ...song(i), selected: i === 1, index: i })),
      state: { videoId: 's1', ready: true, signedIn: true, title: 'A quiet record', artist: 'Test artist', duration: 180, position: 30, playerState: 2, shuffle: false, queueSig: 1 },
    };
    const music = f.music = {
      state: f.state,
      onState: fn => { f.listeners.push(fn); fn(f.state); },
      queue: async () => f.queue.map(({ kind, ...item }) => item),
      command: (name, value) => f.commands.push([name, value]),
      search: async (q, filter) => {
        f.calls.push([q, filter]);
        if (q === 'pending') return new Promise(resolve => { f.release = () => resolve([song(0, 'Pending')]); });
        if (q === 'none') return [];
        if (q === 'fail' && !f.retried) { f.retried = true; throw Error('fake search failure'); }
        if (filter === 'artists') return [{ title: 'Artist One', kind: 'artist', browseId: 'artist-one' }];
        return Array.from({ length: 25 }, (_, i) => song(i, q));
      },
      artistSongs: async () => {
        if (f.artistFails) throw Error('fake artist failure');
        return { name: 'Artist One releases', items: [{ title: 'Release', kind: 'album', browseId: 'album-one' }] };
      },
    };
    f.emit = patch => { Object.assign(f.state, patch); for (const fn of f.listeners) fn(f.state); };
    f.caption = createCaption({ variant: 'shop', onSeek: () => {}, onCommand: () => {} });
    f.caption.setState(f.state); f.caption.show(true);
    f.liner = createLiner({ music, getDrawerPos: () => ({ x: 160, y: 650 }),
      onPickQueue: (item, i) => music.command('queueIndex', item.index ?? i),
    });
    f.search = createSearch({ music, onPlay: item => f.played.push(item), onOpenCollection: item => f.collections.push(item) });
    f.collection = createCollectionList({ music, onPlay: item => f.played.push(item), onShuffle: (item, col, pool) => f.shuffled.push({ item, col, pool }) });
    f.stats = () => ({ list: listStats(), paper: paperStats() });
    window.addEventListener('keydown', e => f.leaks.push(e.key));
    await Promise.all([f.search.ready(), f.collection.ready(), f.caption.ready(), document.fonts.ready]);
  });
  await page.evaluate(() => fixture.search.open());
  await wait(1100);
  await page.locator('.cs-input').fill('fixed');
  await page.waitForSelector('.cs .ui-list-row');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.cs [role="tab"][aria-selected="true"]').innerText(), 'Albums');
  await page.keyboard.press('Shift+Tab');
  await page.getByRole('tab', { name: 'Playlists', exact: true }).click();
  assert.equal(await page.locator('.cs-input').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.cs [role="tab"][aria-selected="true"]').innerText(), 'Playlists');
  await page.getByRole('tab', { name: 'Songs', exact: true }).click();
  assert.equal(await page.locator('.cs-input').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.cs.ui-paper--lift > .ui-paper-layer').count(), 1);
  assert.equal(await page.locator('.cs .ui-list-foot.ui-paper').count(), 0);
  assert.equal(await page.locator('.cs .ui-list--lines').count(), 1);
  assert.equal(await page.locator('.cs .ui-list-row').first().evaluate(el => el.style.backgroundImage), '');
  assert.equal(await page.locator('.cs .ui-list').evaluate(el => el.style.getPropertyValue('--ui-slip-0')), '');
  assert.equal(await page.locator('.cs .ui-list-row').first().evaluate(el => getComputedStyle(el).filter), 'none');
  pass('search tabs: aria-selected, Tab/Shift+Tab cycle, pointer chips retain input focus');
  await page.mouse.move(0, 0); await wait(700);
  const boxes = await page.locator('.cs .ui-list-row').evaluateAll(rows => rows.map(row => {
    const r = row.getBoundingClientRect(), css = getComputedStyle(row);
    return { left: r.left, top: r.top, bottom: r.bottom, width: r.width, marginLeft: css.marginLeft, marginRight: css.marginRight };
  }));
  assert.equal(boxes.length, 20);
  assert.equal(await page.locator('.cs .ui-list-kind').count(), 20);
  for (let i = 0; i < boxes.length; i++) {
    assert.equal(boxes[i].left, boxes[0].left); assert.equal(boxes[i].width, boxes[0].width);
    assert.equal(boxes[i].marginLeft, '0px'); assert.equal(boxes[i].marginRight, '0px');
    if (i) assert.ok(boxes[i].top >= boxes[i - 1].bottom, 'rows overlap');
  }
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await wait(200);
  assert.equal(await page.locator('.cs .ui-list-row[aria-selected="true"] .ui-list-title').innerText(), 'fixed 001');
  assert.equal(await page.locator('.cs-input').getAttribute('aria-activedescendant'), await page.locator('.cs .is-active').getAttribute('id'));
  assert.equal(await page.locator('.cs .is-active .ui-list-band--sel').evaluate(el => getComputedStyle(el).opacity), '1');
  await page.keyboard.press('Home'); assert.match(await page.locator('.cs .is-active').innerText(), /fixed 000/);
  await page.keyboard.press('End'); assert.match(await page.locator('.cs .is-active').innerText(), /fixed 019/);
  await page.keyboard.press('PageUp'); await page.keyboard.press('PageDown');
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => fixture.played.at(-1).title), 'fixed 001');
  pass('search rows: fixed aligned width, no offsets/overlap, 20 cap, kinds, cursor ARIA/band and full keyboard navigation/pick');
  await page.evaluate(() => fixture.search.open());
  await page.locator('.cs-input').fill('');
  await page.locator('.cs-input').fill('pending'); await page.keyboard.press('Enter');
  await page.waitForSelector('.cs .ui-list-note--loading');
  await page.evaluate(() => fixture.release());
  await page.waitForFunction(() => fixture.played.at(-1)?.title === 'Pending 000');
  assert.equal(await page.evaluate(() => fixture.search.isOpen()), false);
  pass('pending Enter: loading note, then top result plays as soon as the held answer arrives');
  await page.evaluate(() => fixture.search.open()); await page.locator('.cs-input').fill('none');
  await page.waitForSelector('.cs .ui-list-note--empty');
  assert.equal(await page.locator('.cs .ui-list-note.ui-paper').count(), 0);
  await page.locator('.cs-input').fill('fail'); await page.waitForSelector('.cs .ui-list-note--error');
  assert.equal(await page.locator('.cs .ui-list-note.ui-paper').count(), 0);
  await page.locator('.cs').getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForSelector('.cs .ui-list-row');
  await page.getByRole('tab', { name: 'Artists', exact: true }).click();
  await page.waitForSelector('.cs .ui-list-kind'); await page.keyboard.press('Enter');
  await page.waitForSelector('.cs .ui-list-note--error');
  await page.evaluate(() => { fixture.artistFails = false; });
  await page.locator('.cs').getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cs-head > span')?.textContent === 'Artist One releases');
  await page.locator('.cs-head').getByRole('button', { name: 'Back', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cs .ui-list-kind')?.textContent === 'artist');
  await page.keyboard.press('Enter'); await page.waitForSelector('.cs-head button', { state: 'visible' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => fixture.collections.length === 1);
  await page.evaluate(() => fixture.search.open());
  await page.getByRole('tab', { name: 'Songs', exact: true }).click();
  await page.getByRole('tab', { name: 'Artists', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cs .ui-list-kind')?.textContent === 'artist');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cs-head button', { state: 'visible' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('.cs .ui-list-kind')?.textContent === 'artist');
  assert.equal(await page.evaluate(() => fixture.search.isOpen()), true);
  assert.equal(await page.locator('.cad-tag').evaluate(el => el.classList.contains('tucked')), true);
  assert.equal(await page.locator('.list-veil.show').count(), 1);
  await page.keyboard.press('Escape'); await wait(600);
  assert.equal(await page.locator('.list-veil.show').count(), 0);
  assert.equal(await page.locator('.cad-tag').evaluate(el => el.classList.contains('tucked')), false);
  pass('search notes/retries: empty/error, artist error Retry, drill-in/back button/Esc; collection routing; veil and caption tuck/restore');

  const before = await page.evaluate(() => fixture.stats());
  await page.evaluate(() => fixture.collection.open({ title: '612 records' }, fixture.songs));
  assert.equal(await page.locator('.cl .ui-list-row').count(), 40);
  assert.equal(await page.locator('.cl-bcount').innerText(), '612 songs');
  assert.equal(await page.locator('.cl .is-now .ui-list-title').innerText(), 'Song 001');
  await page.evaluate(async () => {
    const scroll = document.querySelector('.cl .ui-list-scroll');
    for (let i = 0; i < 16; i++) {
      scroll.scrollTop = scroll.scrollHeight; scroll.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  });
  assert.equal(await page.locator('.cl .ui-list-row').count(), 612);
  await wait(500);
  const after = await page.evaluate(() => fixture.stats());
  assert.ok(after.list.paints - before.list.paints <= 6, JSON.stringify({ before, after }));
  assert.ok(after.paper.paints - before.paper.paints <= 8, JSON.stringify({ before, after }));
  const elapsed = await page.evaluate(() => {
    const input = document.querySelector('.cl-input'), start = performance.now();
    input.value = '120'; input.dispatchEvent(new Event('input')); return performance.now() - start;
  });
  assert.ok(elapsed < 100, `filter took ${elapsed}ms`);
  await page.locator('.cl').getByRole('tab', { name: 'Title', exact: true }).click();
  assert.equal(await page.locator('.cl-bcount').innerText(), '1 of 612');
  await page.locator('.cl-input').fill('no-such-song');
  await page.waitForSelector('.cl .ui-list-note--empty');
  assert.equal(await page.locator('.cl').getByRole('button', { name: 'Play', exact: true }).isDisabled(), true);
  await page.locator('.cl-input').fill('120');
  await page.locator('.cl').getByRole('button', { name: 'Play', exact: true }).click();
  assert.equal(await page.evaluate(() => fixture.played.at(-1).videoId), 's120');
  assert.equal(await page.evaluate(() => fixture.collection.isOpen()), false);
  await page.evaluate(() => fixture.collection.open({ title: '612 records' }, fixture.songs));
  await page.locator('.cl').getByRole('tab', { name: 'Artist', exact: true }).click(); await page.locator('.cl-input').fill('Artist 2');
  assert.equal(await page.locator('.cl-bcount').innerText(), '122 of 612');
  await page.locator('.cl').getByRole('button', { name: 'Shuffle', exact: true }).click();
  assert.equal(await page.evaluate(() => fixture.shuffled.at(-1).pool.length), 122);
  assert.equal(await page.evaluate(() => fixture.shuffled.at(-1).item.subtitle), 'Artist 2');
  await page.evaluate(() => fixture.collection.open({ title: 'Promise records' }, Promise.resolve(fixture.songs)));
  await page.locator('.cl').getByRole('button', { name: 'Close (Esc)', exact: true }).click();
  assert.equal(await page.evaluate(() => fixture.collection.isOpen()), false);
  pass('collection: 612 songs, first 40 then progressive batches, instant field filtering/count, first-filtered Play, Shuffle pool, Close and promise API');
  await page.evaluate(() => { fixture.collection.open({ title: 'Deferred records' }, () => new Promise((resolve, reject) => { fixture.resolveSongs = resolve; fixture.rejectSongs = reject; })); });
  await page.waitForSelector('.cl .ui-list-note--loading'); await page.evaluate(() => fixture.rejectSongs(Error('fake load failure')));
  await page.waitForSelector('.cl .ui-list-note--error');
  await page.locator('.cl').getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForSelector('.cl .ui-list-note--loading'); await page.evaluate(() => fixture.resolveSongs(fixture.songs));
  await page.waitForSelector('.cl .ui-list-row'); await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => fixture.collection.isOpen()), false);
  pass('collection loading/error notes: rejected songs promise, Retry re-fetches, Esc closes');

  await page.evaluate(() => {
    fixture.shortQueue = fixture.queue;
    fixture.queue = fixture.songs.slice(0, 80).map((item, index) => ({ ...item, index, selected: index === 1 }));
  });
  await page.evaluate(() => fixture.liner.openQueue());
  await page.waitForSelector('.ln-qveil .is-pinned', { state: 'visible' });
  await wait(1000);
  await page.evaluate(async () => {
    const scroll = document.querySelector('.ln-qbox .ui-list-scroll');
    for (let i = 0; i < 3; i++) {
      scroll.scrollTop = scroll.scrollHeight;
      scroll.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    scroll.scrollTop = 62 * 60 + 38;
  });
  await wait(300);
  const pinGeometry = await page.evaluate(() => {
    const scroll = document.querySelector('.ln-qbox .ui-list-scroll');
    const pin = scroll.querySelector('.is-pinned').getBoundingClientRect();
    const rows = [...scroll.querySelectorAll('.ui-list-row:not(.is-pinned)')].map(el => el.getBoundingClientRect());
    const next = rows.find(rect => rect.bottom > pin.bottom + 0.5);
    return { top: pin.top, scrollTop: scroll.getBoundingClientRect().top, height: pin.height,
      bottom: pin.bottom, nextTop: next.top, nextHeight: next.height, offset: scroll.scrollTop };
  });
  assert.ok(pinGeometry.offset > 62 * 50, 'queue must actually be scrolled');
  assert.ok(Math.abs(pinGeometry.top - pinGeometry.scrollTop) < 0.5, 'pin must be flush with scroll viewport');
  assert.equal(pinGeometry.height, 62);
  assert.equal(pinGeometry.nextHeight, pinGeometry.height);
  assert.ok(pinGeometry.nextTop >= pinGeometry.bottom - 0.5, 'no partial row may peek below the pin after scrolling');
  await page.screenshot({ path: `${out}/queue-pinned-fixed.png` });
  await page.evaluate(() => { fixture.liner.close(); fixture.queue = fixture.shortQueue; });
  await wait(500);
  pass('queue pin: 62px opaque slot flush with viewport, settled rows snap below it without exposed tails');

  await page.mouse.move(0, 0);
  await page.evaluate(() => fixture.liner.openQueue());
  await page.waitForSelector('.ln-qveil .ui-list-row', { state: 'visible' });
  await wait(800);
  assert.equal(await page.locator('.ln-qtitle > span').innerText(), 'Up next');
  assert.equal(await page.locator('.ln-qbox.ui-paper--lift > .ui-paper-layer').count(), 1);
  assert.equal(await page.locator('.ln-qclose').evaluate(el => el.closest('.ui-paper')?.classList.contains('ln-qbox')), true);
  assert.equal(await page.locator('.ln-qveil .is-pinned').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(248, 241, 226)');
  assert.equal(await page.locator('.ln-qveil .ui-list-kind').count(), 3, 'queue songs without kind metadata retain Search row anatomy');
  assert.match(await page.locator('.ln-qveil .ui-list-row').first().innerText(), /Song 001/);
  assert.equal(await page.locator('.ln-qveil .ui-list-row').first().evaluate(el => el.classList.contains('is-now') && el.classList.contains('is-pinned')), true);
  await page.evaluate(() => { fixture.nodes = [...document.querySelectorAll('.ln-qveil .ui-list-row')]; fixture.queue.forEach(it => { it.selected = it.videoId === 's2'; }); fixture.emit({ videoId: 's2', queueSig: 2 }); });
  await wait(400);
  assert.match(await page.locator('.ln-qveil .ui-list-row').first().innerText(), /Song 002/);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.ln-qveil .ui-list-row')].every(row => fixture.nodes.includes(row))), true);
  assert.equal(await page.locator('.ln-qveil .is-now .ui-list-title').evaluate(el => getComputedStyle(el).color), 'rgb(45, 49, 88)');
  await page.keyboard.press('Control+Alt+KeyJ');
  await page.locator('.cs').getByRole('tab', { name: 'Songs', exact: true }).click();
  await page.locator('.cs-input').fill('above');
  await page.waitForFunction(() => document.querySelector('.cs .ui-list-title')?.textContent === 'above 000');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.cs .is-active .ui-list-title').innerText(), 'above 000');
  assert.equal(await page.locator('.ln-qveil .is-active').count(), 0, 'queue must not capture search input keys');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => fixture.search.isOpen()), false);
  assert.equal(await page.evaluate(() => fixture.liner.isOpen()), true, 'Escape belongs to the top input, not the queue below');
  await page.evaluate(() => { fixture.leaks.length = 0; });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => fixture.commands.at(-1)), ['queueIndex', 2]);
  assert.deepEqual(await page.evaluate(() => fixture.leaks), []);
  await page.evaluate(() => { fixture.queue = [0, 1].map(index => ({ ...fixture.songs[2], index, selected: index === 1 })); return fixture.liner.openQueue(); });
  await page.waitForSelector('.ln-qveil .ui-list-row', { state: 'visible' });
  assert.equal(await page.locator('.ln-qveil .is-now').count(), 1, 'repeated videos have only one playing queue entry');
  assert.equal(await page.locator('.ln-qveil .ui-list-row').first().getAttribute('data-list-index'), '1');
  await page.evaluate(() => fixture.liner.close());
  await page.evaluate(() => { fixture.queue = []; return fixture.liner.openQueue(); });
  await page.waitForSelector('.ln-qveil .ui-list-note--empty', { state: 'visible' });
  assert.match(await page.locator('.ln-qveil .ui-list-note--empty').innerText(), /Nothing in the queue yet/);
  await page.evaluate(() => { fixture.leaks.length = 0; });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => fixture.leaks), [], 'empty queue still owns navigation keys');
  await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => fixture.liner.isOpen()), false);
  await page.evaluate(() => { fixture.music.queue = () => new Promise(resolve => { fixture.resolveQueue = resolve; }); fixture.liner.openQueue(); });
  await page.waitForSelector('.ln-qveil .ui-list-note--loading', { state: 'visible' });
  assert.equal(await page.locator('.ln-qveil .ui-list-note--loading .ui-list-note-msg > span').first().innerText(), 'Loading queue…');
  await page.evaluate(() => fixture.resolveQueue([]));
  await page.waitForSelector('.ln-qveil .ui-list-note--empty', { state: 'visible' });
  await page.keyboard.press('Escape');
  pass('queue: now row pinned first/indigo, track change preserves row nodes, visual-order keyboard pick sends original index, empty and Esc; no shop key leaks');
  pass(`painting: all 612 rows share <=6 new slip/band paints and <=8 paper paints (actual ${after.list.paints - before.list.paints}/${after.paper.paints - before.paper.paints})`);
  assert.equal(await page.locator('.cs [title], .cl [title], .ln-qveil [title]').count(), 0);
  await page.evaluate(() => fixture.collection.open({ title: 'Idle records' }, fixture.songs));
  await page.mouse.move(0, 0); await wait(1300);
  const idle = await page.evaluate(() => ({ ...window.__kitCallbacks }));
  await wait(2100);
  assert.deepEqual(await page.evaluate(() => ({ ...window.__kitCallbacks })), idle);
  await page.screenshot({ path: `${out}/collection-612.png` });
  pass('idle: zero kit/shared-bar rAF/timer callbacks for 2 seconds with an open list; no native control titles');
  assert.deepEqual(errors, []);
  console.log(`all lists checks passed -> ${out}`);
} finally { await browser.close(); await server.close(); }
