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
    const { settings } = await import('/src/settings.js');
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
    f.caption = createCaption({ variant: 'shop', onSeek: () => {}, onCommand: () => {}, onQueue: (...args) => f.liner.openQueue(...args) });
    f.caption.setState(f.state); f.caption.show(true);
    f.settings = settings;
    f.drawerOpens = [];
    f.liner = createLiner({ music, getDrawerPos: () => ({ x: 160, y: 650 }),
      onQueueOpen: ({ showStack }) => {
        f.drawerOpens.push(showStack);
        return new Promise(resolve => { f.drawerReady = resolve; });
      },
      onPickQueue: (item, i, from) => {
        f.queuePickOrigin = from;
        music.command('queueIndex', item.index ?? i);
      },
    });
    f.search = createSearch({ music, onPlay: item => f.played.push(item), onOpenCollection: item => f.collections.push(item) });
    f.collection = createCollectionList({ music, onPlay: item => f.played.push(item), onShuffle: (item, col, pool) => f.shuffled.push({ item, col, pool }) });
    f.stats = () => ({ list: listStats(), paper: paperStats() });
    window.addEventListener('keydown', e => f.leaks.push(e.key));
    await Promise.all([f.search.ready(), f.collection.ready(), f.caption.ready(), document.fonts.ready]);
  });
  const wheelPick = await page.evaluate(async () => {
    const { createCoverCarousel } = await import('/src/ui/cover-carousel.js');
    let picked;
    const covers = createCoverCarousel({ orientation: 'horizontal', onPick: index => {
      picked = { index, selected: Number(covers.listboxEl.querySelector('[aria-selected="true"]')?.dataset.index) };
    } });
    document.body.append(covers.el);
    covers.el.hidden = false;
    covers.setItems([{ title: 'First' }, { title: 'Second' }], 'Enter during wheel motion');
    covers.listboxEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    const before = covers.getActive();
    covers.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    covers.stop();
    covers.el.remove();
    return { before, picked };
  });
  assert.deepEqual(wheelPick, { before: 0, picked: { index: 1, selected: 1 } });
  pass('carousel Enter during wheel motion selects the destination before playing it');
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
  assert.equal(await page.locator('.cs .cs-list').evaluate(el => el.style.getPropertyValue('--ui-slip-0')), '');
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
  await page.waitForFunction(() => document.querySelector('.cs .ui-list-kind')?.dataset.kind === 'artist');
  await page.keyboard.press('Enter'); await page.waitForSelector('.cs-head button', { state: 'visible' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => fixture.collections.length === 1);
  await page.evaluate(() => fixture.search.open());
  await page.getByRole('tab', { name: 'Songs', exact: true }).click();
  await page.getByRole('tab', { name: 'Artists', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cs .ui-list-kind')?.dataset.kind === 'artist');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cs-head button', { state: 'visible' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('.cs .ui-list-kind')?.dataset.kind === 'artist');
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

  const queueWheel = page.getByRole('listbox', { name: 'Up next' });
  const centered = queueWheel.locator('[aria-selected="true"]');
  const current = queueWheel.locator('[aria-current="true"]');
  const queueCover = i => queueWheel.getByRole('option', { name: `Song 00${i} · Artist ${i}` });
  const expectCentered = i => page.waitForFunction(index =>
    document.querySelector('.ln-qveil .la-cover[aria-selected="true"]')?.dataset.index === String(index), i);
  const queueButton = page.getByRole('button', { name: 'Up next', exact: true });
  await page.evaluate(() => {
    const queue = fixture.music.queue;
    fixture.music.queue = () => new Promise(resolve => {
      fixture.releaseQueue = () => { fixture.music.queue = queue; resolve(queue()); };
    });
    const sheet = document.querySelector('.ln-qbox');
    const paper = sheet.querySelector('.ui-paper-bg');
    const sizes = new Set();
    const observer = new MutationObserver(() => {
      if (sheet.querySelector('.la-full:not([hidden])')) sizes.add(paper.style.backgroundSize);
    });
    observer.observe(paper, { attributes: true, attributeFilter: ['style'] });
    fixture.queuePaperSizes = () => { observer.disconnect(); return [...sizes]; };
  });
  await queueButton.focus();
  await queueButton.click();
  await page.evaluate(() => fixture.releaseQueue());
  await queueWheel.waitFor();
  await expectCentered(1);
  assert.equal(await queueWheel.getAttribute('aria-orientation'), 'horizontal');
  const queueSheet = page.locator('.ln-qbox');
  await page.waitForFunction(() => document.querySelector('.ln-qbox').getBoundingClientRect().height > innerHeight * 0.9);
  assert.ok((await queueSheet.boundingBox()).width > page.viewportSize().width * 0.9);
  assert.ok((await centered.boundingBox()).width > page.viewportSize().width * 0.38);
  assert.equal(await queueWheel.evaluate(el => getComputedStyle(el).getPropertyValue('--cover-size').trim()), 'min(50cqw, 98cqh)');
  const queueCoverBounds = await centered.boundingBox();
  const queueCaptionBounds = await queueSheet.locator('.la-details').boundingBox();
  assert.ok(queueCaptionBounds.y >= queueCoverBounds.y + queueCoverBounds.height, 'the queue caption sits below the centered cover');
  assert.equal(await queueSheet.locator('.ui-paper-layer').evaluate(el => getComputedStyle(el).clipPath), 'none');
  assert.equal(await queueSheet.locator('.ui-paper-bg').evaluate(el => getComputedStyle(el, '::after').content), 'none');
  assert.equal(await queueWheel.locator('.la-stage').evaluate(el => parseFloat(getComputedStyle(el).perspective) > 0), true);
  assert.match(await queueCover(2).evaluate(el => el.style.transform), /translateZ.*rotateY/);
  assert.equal(await centered.locator('.la-sleeve-face').count(), 2);
  assert.equal(await centered.locator('.la-disc-face').count(), 3);
  assert.equal(await queueWheel.evaluate(el => el === document.activeElement), true, 'the queue wheel is focused on open');
  assert.equal(await queueWheel.getAttribute('aria-activedescendant'), await centered.getAttribute('id'));
  assert.equal(await current.getAttribute('data-index'), '1');
  assert.equal(await page.locator('.ln-qveil .la-title').innerText(), 'Song 001');
  assert.equal(await page.locator('.ln-qveil .la-artist').innerText(), 'Artist 1');
  assert.equal(await queueWheel.locator('.la-title, .la-artist').count(), 0);
  assert.equal(await page.evaluate(() => fixture.drawerOpens.at(-1)), false);
  await wait(600);
  assert.equal((await page.evaluate(() => fixture.queuePaperSizes())).length, 1, 'the unrolling queue uses one full-size paper texture');
  await page.evaluate(() => fixture.drawerReady());
  assert.equal(await page.locator('.la-vinyl-flight').count(), 0);
  const neutralTransform = await queueSheet.evaluate(el => getComputedStyle(el).transform);
  await page.evaluate(() => fixture.liner.tilt(0.8, -0.6));
  assert.notEqual(await queueSheet.evaluate(el => getComputedStyle(el).transform), neutralTransform);
  await page.evaluate(() => fixture.liner.tilt(0, 0));
  await page.keyboard.press('ArrowRight');
  await expectCentered(2);
  await page.keyboard.press('ArrowLeft');
  await expectCentered(1);
  await page.evaluate(async () => {
    const { shortcuts } = await import('/src/shortcuts.js');
    await shortcuts.set('search', 'Control+Alt+Right');
  });
  await queueWheel.focus();
  await page.keyboard.press('Control+Alt+ArrowRight');
  assert.equal(await page.evaluate(() => fixture.search.isOpen()), true, 'the focused queue wheel lets the modified Search shortcut through');
  await expectCentered(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowRight');
  await expectCentered(2);
  await page.keyboard.press('ArrowLeft');
  await expectCentered(1);
  await page.evaluate(async () => {
    const { shortcuts } = await import('/src/shortcuts.js');
    await shortcuts.reset();
  });
  await queueWheel.focus();
  await queueCover(0).click();
  await expectCentered(0);
  assert.equal(await page.evaluate(() => fixture.commands.length), 0);
  await page.keyboard.press('ArrowRight');
  await expectCentered(1);
  await queueWheel.hover();
  await page.mouse.wheel(100, 0);
  await expectCentered(2);
  const initialCover = await queueWheel.evaluate(wheel => {
    for (let i = 0; i < 2; i++) wheel.dispatchEvent(new WheelEvent('wheel', { deltaY: -50, bubbles: true, cancelable: true }));
    return wheel.querySelector('[aria-selected="true"]').dataset.index;
  });
  assert.equal(initialCover, '2', 'wheel bursts do not move the carousel synchronously');
  await expectCentered(1);
  await page.mouse.wheel(100, 0);
  await expectCentered(2);
  await page.mouse.wheel(0, -100);
  await expectCentered(1);
  const queueBounds = await queueWheel.boundingBox();
  const dragX = queueBounds.x + queueBounds.width / 2;
  const dragY = queueBounds.y + queueBounds.height / 2;
  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX - 135, dragY, { steps: 5 });
  await page.mouse.up();
  await expectCentered(2);
  assert.equal(await page.evaluate(() => fixture.commands.length), 0, 'horizontal drag does not play a cover');
  await page.keyboard.press('ArrowLeft');
  await expectCentered(1);
  await page.evaluate(() => { fixture.queue.forEach(it => { it.selected = it.videoId === 's2'; }); fixture.emit({ videoId: 's2', queueSig: 2 }); });
  await page.waitForFunction(() => document.querySelector('.ln-qveil .la-cover[aria-current="true"]')?.dataset.index === '2');
  await expectCentered(1);
  const nowPlaying = page.getByRole('button', { name: 'Now playing', exact: true });
  await page.keyboard.press('Tab');
  assert.equal(await nowPlaying.evaluate(el => el === document.activeElement), true);
  const closeQueue = page.locator('.ln-qclose').getByRole('button', { name: 'Close (Esc)', exact: true });
  await page.keyboard.press('Tab');
  assert.equal(await closeQueue.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await queueWheel.evaluate(el => el === document.activeElement), true, 'Tab after Close wraps to the queue wheel');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await closeQueue.evaluate(el => el === document.activeElement), true, 'Shift+Tab from the wheel wraps to Close');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await nowPlaying.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('ArrowLeft');
  await expectCentered(1);
  await page.keyboard.press('Space');
  await expectCentered(2);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.ln-qveil.picking .is-picked');
  assert.equal(await queueCover(1).count(), 0, 'other records leave the accessibility tree during the pick');
  assert.equal(await queueSheet.locator('.ui-paper-layer').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  await page.waitForFunction(() => fixture.queuePickOrigin?.rect.width > 0);
  assert.deepEqual(await page.evaluate(() => fixture.commands.at(-1)), ['queueIndex', 2]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => fixture.liner.openQueue());
  await expectCentered(2);
  await page.keyboard.press('ArrowLeft');
  await expectCentered(1);
  assert.equal(await queueCover(2).evaluate(el => el.style.transform.includes('rotateY')), false);
  assert.equal(await queueSheet.locator('.ui-paper-layer').evaluate(el => getComputedStyle(el).clipPath), 'none');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => fixture.commands.at(-1)), ['queueIndex', 1]);
  assert.deepEqual(await page.evaluate(() => fixture.queuePickOrigin), { instant: true });
  await page.evaluate(() => fixture.liner.openQueue());
  await expectCentered(2);
  assert.equal(await page.evaluate(() => fixture.drawerOpens.length), 1, 'reduced motion leaves the queue drawer closed');
  assert.equal(await page.locator('.la-vinyl-flight').count(), 0);
  await page.evaluate(() => fixture.settings.set('coverCarousel', false));
  await page.waitForSelector('.ln-qveil .is-pinned', { state: 'visible' });
  assert.ok((await queueSheet.boundingBox()).width < page.viewportSize().width * 0.8);
  assert.equal(await page.locator('.ln-qveil .la-wheel').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Now playing', exact: true }).isVisible(), false);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => {
    fixture.settings.set('coverCarousel', true);
    await fixture.liner.openQueue();
  });
  await expectCentered(2);
  const interruptedPick = await queueWheel.evaluate(el => {
    const before = fixture.commands.length;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.liner.close();
    return [fixture.commands.length - before, fixture.commands.at(-1), fixture.queuePickOrigin];
  });
  assert.deepEqual(interruptedPick, [1, ['queueIndex', 2], { instant: true }], 'closing mid-extraction still plays the pick');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => fixture.settings.set('coverCarousel', false));
  await page.evaluate(async () => {
    const { createSettingsPanel } = await import('/src/settings-panel.js');
    fixture.panel = createSettingsPanel({ onClose: fixture.liner.restoreQueueFocusAfterSettings });
    await fixture.liner.openQueue();
  });
  await page.locator('.ln-qveil').getByRole('listbox', { name: 'Up next' }).focus();
  await page.keyboard.press('Home');
  await page.evaluate(() => fixture.panel.open('look'));
  const settingsDialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settingsDialog.getByRole('radio', { name: 'Carousel', exact: true }).click();
  assert.equal(await settingsDialog.evaluate(el => el.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  assert.equal(await queueWheel.evaluate(el => el === document.activeElement), true, 'closing Settings focuses the new queue wheel');
  await expectCentered(2);
  await page.keyboard.press('ArrowLeft');
  await expectCentered(1);
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => fixture.commands.at(-1)), ['queueIndex', 1]);
  const commandsBeforeClose = await page.evaluate(() => fixture.commands.length);
  await page.evaluate(() => { fixture.settings.set('coverCarousel', false); return fixture.liner.openQueue(); });
  await closeQueue.focus();
  await page.evaluate(() => fixture.panel.open('look'));
  await settingsDialog.getByRole('radio', { name: 'Carousel', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await closeQueue.evaluate(el => el === document.activeElement), true, 'Settings preserves a usable queue opener');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => fixture.liner.isOpen()), false);
  assert.equal(await page.evaluate(() => fixture.commands.length), commandsBeforeClose, 'Enter on Close does not play a track');
  await page.evaluate(() => fixture.settings.set('coverCarousel', false));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    fixture.queue.forEach(it => { it.selected = it.videoId === 's1'; });
    fixture.emit({ videoId: 's1', queueSig: 1 });
  });
  pass('queue carousel: horizontal, one caption, independent now-playing marker and jump, drawer landing, keyboard, wheel, drag, reduced motion, queueIndex and live paper fallback');

  await page.evaluate(() => {
    fixture.shortQueue = fixture.queue;
    fixture.queue = fixture.songs.slice(0, 80).map((item, index) => ({ ...item, index, selected: index === 1 }));
  });
  await page.evaluate(() => fixture.liner.openQueue());
  await page.waitForSelector('.ln-qveil .is-pinned', { state: 'visible' });
  assert.equal(await page.evaluate(() => fixture.drawerOpens.at(-1)), true);
  await wait(1000);
  const pinnedScroll = page.locator('.ln-qbox .ui-list-scroll');
  const initialScroll = await pinnedScroll.evaluate(scroll => {
    const from = scroll.scrollTop;
    const handled = !scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    return { from, top: scroll.scrollTop, handled };
  });
  assert.deepEqual(initialScroll, { from: initialScroll.from, top: initialScroll.from, handled: true },
    'wheel motion is handled without jumping the pinned list');
  await page.waitForFunction(from => {
    const scroll = document.querySelector('.ln-qbox .ui-list-scroll');
    return scroll.scrollTop > from && getComputedStyle(scroll).scrollSnapType === 'y mandatory';
  }, initialScroll.from);
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

  await page.reload();
  await page.evaluate(async () => {
    const { createSearch } = await import('/src/search.js');
    const { settings } = await import('/src/settings.js');
    const items = Array.from({ length: 8 }, (_, i) => ({ title: `Record ${i}`, subtitle: `Artist ${i}`, kind: 'song' }));
    settings.set('coverCarousel', true);
    const played = [], pickModes = [], origins = [];
    const search = createSearch({
      music: { search: async q => Array.from({ length: 7 }, (_, i) => ({ title: `${q} result ${i + 1}`, subtitle: 'Search artist', kind: 'song', art: window.fixture.artFor?.(q, i) })) },
      suggest: () => ({ title: 'Listen again', items }),
      coverSuggestions: true, onPlay: (item, { fromCoverPicker, from }) => {
        played.push(item.title);
        pickModes.push(fromCoverPicker);
        origins.push(from);
      },
    });
    window.fixture = { search, played, pickModes, origins, settings };
    search.open();
  });
  const carousel = page.locator('.la-wheel[aria-orientation="vertical"]');
  const suggestionCaption = page.locator('.cs > .la-carousel:not(.cs-result-strip) .la-details');
  const activeCover = carousel.locator('[aria-selected="true"]');
  const input = page.locator('.cs-input');
  const coverName = n => `Record ${n} · Artist ${n}`;
  async function expectCover(n) {
    await page.waitForFunction(name => document.querySelector('.la-wheel[aria-orientation="vertical"] [aria-selected="true"]')?.getAttribute('aria-label') === name, coverName(n));
    assert.equal(await input.getAttribute('aria-activedescendant'), await activeCover.getAttribute('id'));
    assert.equal(await suggestionCaption.locator('.la-title').innerText(), `Record ${n}`);
    assert.equal(await suggestionCaption.locator('.la-artist').innerText(), `Artist ${n}`);
  }
  await carousel.waitFor();
  await expectCover(0);
  assert.equal(await carousel.getByRole('option').count(), 8, 'off-screen carousel options remain accessible');
  assert.equal(await carousel.locator('[data-index="7"] .la-sleeve-front').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  assert.equal(await input.getAttribute('aria-controls'), await carousel.getAttribute('id'));
  await wait(550);
  const searchSheet = page.locator('.cs');
  assert.ok((await searchSheet.boundingBox()).height > page.viewportSize().height * 0.9);
  assert.ok((await activeCover.boundingBox()).height > page.viewportSize().height * 0.35);
  assert.equal(await searchSheet.locator('.ui-paper-layer').evaluate(el => getComputedStyle(el).clipPath), 'none');
  assert.equal(await carousel.evaluate(el => getComputedStyle(el).getPropertyValue('--cover-size').trim()), 'min(96cqw, 92cqh)');
  assert.match(await carousel.locator('[data-index="1"]').evaluate(el => el.style.transform), /translateZ.*rotateX/);
  const neutral = await searchSheet.evaluate(el => getComputedStyle(el).transform);
  await page.evaluate(() => fixture.search.tilt(0.8, -0.6));
  assert.notEqual(await searchSheet.evaluate(el => getComputedStyle(el).transform), neutral);
  await page.evaluate(() => fixture.search.tilt(0, 0));
  const desktopSize = page.viewportSize();
  await page.setViewportSize({ width: 540, height: 620 });
  const miniCoverBounds = await activeCover.boundingBox();
  const miniCaptionBounds = await suggestionCaption.boundingBox();
  const miniHintBounds = await page.locator('.cs > .la-full > .ui-list-foot').boundingBox();
  assert.ok(miniCoverBounds.width > 540 * 0.65, 'the vertical cover fills most of the mini player width');
  assert.ok(miniCaptionBounds.y >= miniCoverBounds.y + miniCoverBounds.height, 'the Listen again caption sits below the centered cover');
  assert.ok(miniHintBounds.y >= miniCaptionBounds.y + miniCaptionBounds.height && miniHintBounds.y + miniHintBounds.height <= 620,
    'the Listen again hint fits below the caption within the mini player');
  await page.setViewportSize(desktopSize);
  assert.equal(await page.locator('.la-vinyl-flight').count(), 0);
  const closingCover = await activeCover.evaluate(card => {
    fixture.search.close();
    const { x, y, width, height } = card.getBoundingClientRect();
    const hit = document.elementFromPoint(x + width / 2, y + height / 2);
    if (hit?.closest('.la-cover') !== card) return null;
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    return card.classList.contains('is-picked');
  });
  assert.notEqual(closingCover, null, 'the centered sleeve can still be hit during the close transition');
  await wait(300);
  await page.keyboard.press('Control+Alt+J');
  assert.equal(await page.evaluate(() => fixture.search.isOpen()), true, 'the Search shortcut works after clicking during close');
  assert.equal(closingCover, false, 'a click during close does not extract the record');
  assert.deepEqual(await page.evaluate(() => fixture.played), []);
  await expectCover(0);
  await wait(550);
  pass('Listen again ignores clicks during close and Search can reopen from the keyboard');
  await page.keyboard.press('ArrowDown');
  await expectCover(1);
  const wheelBounds = await carousel.boundingBox();
  const nextCoverPoint = { x: wheelBounds.x + wheelBounds.width / 2, y: wheelBounds.y + wheelBounds.height - 4 };
  await page.waitForFunction(({ x, y, name }) => document.elementFromPoint(x, y)?.closest('.la-cover')?.getAttribute('aria-label') === name,
    { ...nextCoverPoint, name: coverName(2) });
  await page.mouse.click(nextCoverPoint.x, nextCoverPoint.y);
  await expectCover(2);
  assert.deepEqual(await page.evaluate(() => fixture.played), []);
  await carousel.hover();
  await page.mouse.wheel(0, 100);
  await expectCover(3);
  const rect = await carousel.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.2, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => Number(document.querySelector('.la-wheel[aria-orientation="vertical"] [aria-selected="true"]')?.dataset.index) >= 4);
  assert.deepEqual(await page.evaluate(() => fixture.played), [], 'drag release does not play a cover');
  await page.keyboard.press('Home');
  await expectCover(0);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cs.cover-picking .is-picked');
  assert.equal(await searchSheet.locator('.ui-paper-layer').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  await page.waitForFunction(() => fixture.origins[0]?.rect.width > 0);
  assert.deepEqual(await page.evaluate(() => fixture.played), ['Record 0']);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => fixture.search.open());
  await carousel.waitFor();
  await page.keyboard.press('Home');
  await expectCover(0);
  assert.equal(await carousel.getByRole('option', { name: coverName(1) }).evaluate(el => el.style.transform.includes('rotateX')), false);
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => fixture.played), ['Record 0', 'Record 0']);
  assert.deepEqual(await page.evaluate(() => fixture.origins.at(-1)), { instant: true });
  await page.evaluate(() => fixture.search.open());
  await carousel.waitFor();
  await activeCover.click();
  assert.deepEqual(await page.evaluate(() => fixture.played), ['Record 0', 'Record 0', 'Record 0']);
  await page.mouse.move(0, 0);
  await page.evaluate(() => { fixture.search.open(); fixture.settings.set('coverCarousel', false); });
  await page.locator('.cs .ui-list-row').first().waitFor();
  assert.equal(await carousel.isVisible(), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sienna.settings')).coverCarousel), false);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => fixture.played), ['Record 0', 'Record 0', 'Record 0', 'Record 0']);
  assert.deepEqual(await page.evaluate(() => fixture.pickModes), [true, true, true, false]);
  await page.evaluate(() => { fixture.search.open(); fixture.settings.set('coverCarousel', true); });
  await carousel.waitFor();
  await input.fill('Match');
  await page.waitForFunction(() => document.querySelector('.cs .ui-list-title')?.textContent === 'Match result 1');
  assert.equal(await carousel.isVisible(), false, 'typed search does not show the Listen again wheel');
  const strip = page.getByRole('listbox', { name: 'Top search results' });
  const results = page.getByRole('listbox', { name: 'Search results', exact: true });
  assert.equal(await strip.getAttribute('aria-orientation'), 'horizontal');
  assert.ok((await searchSheet.boundingBox()).width < page.viewportSize().width * 0.8);
  assert.equal(await searchSheet.locator('.ui-paper-layer').evaluate(el => getComputedStyle(el).clipPath), 'none');
  assert.deepEqual(await strip.getByRole('option').evaluateAll(els => els.map(el => el.getAttribute('aria-label'))),
    [1, 2, 3, 4, 5].map(i => `Match result ${i} · Search artist`));
  assert.equal(await results.getByRole('option').count(), 7);
  assert.ok((await strip.boundingBox()).y < (await results.boundingBox()).y);
  assert.equal(await page.locator('.cs-result-strip .la-title').innerText(), 'Match result 1');
  assert.equal(await page.locator('.cs-result-strip .la-artist').innerText(), 'Search artist');
  assert.equal(await strip.locator('.la-title, .la-artist').count(), 0);
  await page.keyboard.press('ArrowDown');
  assert.equal(await results.getByRole('option', { selected: true }).locator('.ui-list-title').innerText(), 'Match result 1');
  await page.evaluate(async () => {
    const { shortcuts } = await import('/src/shortcuts.js');
    await shortcuts.set('search', 'Alt+Up');
  });
  assert.equal(await input.getAttribute('aria-keyshortcuts'), 'Shift+ArrowUp');
  assert.match(await page.locator('.cs-result-strip .ui-list-foot').innerText(), /^Shift\+↑/);
  await page.keyboard.press('Shift+ArrowUp');
  assert.equal(await input.getAttribute('aria-controls'), await strip.getAttribute('id'));
  await page.keyboard.press('Alt+ArrowUp');
  assert.equal(await page.evaluate(() => fixture.search.isOpen()), false, 'the configured Search toggle still closes Search');
  await page.keyboard.press('Alt+ArrowUp');
  await strip.waitFor();
  for (const name of ['app', 'mini']) {
    await page.evaluate(async name => {
      const { shortcuts } = await import('/src/shortcuts.js');
      await shortcuts.reset();
      await shortcuts.set(name, 'Alt+Up');
    }, name);
    assert.equal(await input.getAttribute('aria-keyshortcuts'), 'Shift+ArrowUp', `Alt+Up reserved by ${name}`);
  }
  await page.evaluate(async () => {
    const { shortcuts } = await import('/src/shortcuts.js');
    await shortcuts.set('app', 'Shift+Up');
  });
  assert.equal(await input.getAttribute('aria-keyshortcuts'), 'Alt+Shift+ArrowUp');
  await page.evaluate(async () => {
    const { shortcuts } = await import('/src/shortcuts.js');
    await shortcuts.set('search', 'Alt+Shift+Up');
  });
  assert.equal(await input.getAttribute('aria-keyshortcuts'), 'Control+Shift+ArrowUp');
  await page.keyboard.press('Control+Shift+ArrowUp');
  assert.equal(await input.getAttribute('aria-controls'), await strip.getAttribute('id'));
  await page.evaluate(async () => {
    const { shortcuts } = await import('/src/shortcuts.js');
    await shortcuts.reset();
  });
  await page.keyboard.press('Alt+ArrowUp');
  assert.equal(await input.getAttribute('aria-controls'), await strip.getAttribute('id'));
  const stripTitle = page.locator('.cs-result-strip .la-title');
  const selection = () => input.evaluate(el => [el.selectionStart, el.selectionEnd]);
  await input.evaluate(el => el.setSelectionRange(2, 2));
  await page.keyboard.press('Shift+ArrowRight');
  assert.deepEqual(await selection(), [2, 3]);
  assert.equal(await stripTitle.innerText(), 'Match result 1');
  await input.evaluate(el => el.setSelectionRange(2, 2));
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual(await selection(), [1, 1], 'at the first cover, Left moves the input caret');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selection(), [2, 2], 'at the last cover, Right moves the input caret');
  assert.equal(await stripTitle.innerText(), 'Match result 5');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.cs-result-strip .la-title').innerText(), 'Match result 2');
  assert.equal(await input.getAttribute('aria-activedescendant'), await strip.getByRole('option', { selected: true }).getAttribute('id'));
  assert.equal(await strip.getByRole('option').first().evaluate(el => el.style.transform.includes('rotateY')), false);
  await page.keyboard.press('ArrowDown');
  assert.equal(await input.getAttribute('aria-controls'), await results.getAttribute('id'));
  assert.equal(await results.getByRole('option', { selected: true }).locator('.ui-list-title').innerText(), 'Match result 2');
  await page.keyboard.press('Alt+ArrowUp');
  await input.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  await page.keyboard.type('a');
  assert.equal(await input.inputValue(), 'Matcha');
  await page.waitForFunction(() => document.querySelector('.cs-result-strip .la-title')?.textContent === 'Matcha result 1');
  await page.evaluate(() => fixture.settings.set('coverCarousel', false));
  assert.equal(await strip.isVisible(), false);
  assert.equal(await results.getByRole('option').count(), 7);
  await page.evaluate(() => fixture.settings.set('coverCarousel', true));
  await strip.waitFor();
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => fixture.played.at(-1)), 'Matcha result 2');
  assert.equal(await page.evaluate(() => fixture.pickModes.at(-1)), false, 'Enter on a search cover uses search playback');
  await page.evaluate(() => fixture.search.open());
  await strip.waitFor();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await strip.dispatchEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });
  assert.equal(await input.getAttribute('aria-controls'), await results.getAttribute('id'));
  assert.equal(await stripTitle.innerText(), 'Matcha result 1');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => fixture.played.at(-1)), 'Matcha result 2', 'scrolling past the first cover does not redirect playback');
  await page.evaluate(() => fixture.search.open());
  await strip.waitFor();
  await strip.hover();
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => document.querySelector('.cs-result-strip .la-title')?.textContent === 'Matcha result 2');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => fixture.played.at(-1)), 'Matcha result 2', 'Enter plays the cover reached by scrolling');
  await page.evaluate(() => fixture.search.open());
  await strip.waitFor();
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('ArrowRight');
  const hoveredResult = results.getByRole('option', { name: /Matcha result 3/ });
  await hoveredResult.hover();
  assert.equal(await hoveredResult.getAttribute('aria-selected'), 'true');
  assert.equal(await input.getAttribute('aria-controls'), await results.getAttribute('id'));
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => fixture.played.at(-1)), 'Matcha result 3', 'Enter follows the row highlighted by hovering');
  await page.evaluate(() => fixture.search.open());
  await strip.waitFor();
  await strip.getByRole('option', { selected: true }).click();
  assert.equal(await page.evaluate(() => fixture.played.at(-1)), 'Matcha result 1');
  assert.deepEqual(await page.evaluate(() => fixture.pickModes.slice(-2)), [false, false], 'search strip uses search playback');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const artColours = await page.evaluate(() => Object.fromEntries(['Slow', 'Fast'].flatMap((q, j) => Array.from({ length: 7 }, (_, i) => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = `hsl(${j * 180 + i * 24} 70% 50%)`; g.fillRect(0, 0, 32, 32);
    return [`${q}-${i}`, c.toDataURL('image/png').split(',')[1]];
  }))));
  const artHits = [];
  await page.route('https://i.ytimg.com/vi/**', async route => {
    const id = new URL(route.request().url()).pathname.split('/')[2];
    artHits.push(id);
    if (id.startsWith('Slow')) await new Promise(resolve => setTimeout(resolve, 900));
    await route.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from(artColours[id], 'base64') });
  });
  await page.evaluate(() => { fixture.artFor = (q, i) => (/^(Slow|Fast)$/.test(q) ? `https://i.ytimg.com/vi/${q}-${i}/hq.jpg` : undefined); });
  const stripArt = () => page.evaluate(async () => {
    const { paintedCoverURL } = await import('/src/coverpaint.js');
    return Promise.all([...document.querySelectorAll('.cs-result-strip .la-cover')].map(async card => {
      const srcs = [...card.querySelectorAll('img')].map(img => img.src);
      const art = `https://i.ytimg.com/vi/${card.getAttribute('aria-label').split(' result ')[0]}-${card.dataset.index}/hq.jpg`;
      return { srcs, ok: srcs.length === 0 || (srcs.length === 1 && srcs[0] === await paintedCoverURL(art, 160)) };
    }));
  });
  const artShown = n => page.waitForFunction(n => [...document.querySelectorAll('.cs-result-strip .la-cover')].slice(0, n)
    .every(card => card.querySelector('img')), n);
  await page.evaluate(() => fixture.search.open());
  await input.fill('Slow');
  await page.waitForFunction(() => document.querySelector('.cs-result-strip .la-title')?.textContent === 'Slow result 1');
  await input.fill('Fast');
  await page.waitForFunction(() => document.querySelector('.cs-result-strip .la-title')?.textContent === 'Fast result 1');
  await artShown(3);
  await wait(1200);
  assert.ok(artHits.includes('Slow-0'), 'the first query\'s covers were still loading when the query changed');
  let art = await stripArt();
  assert.ok(art.every(card => card.ok), 'each cover shows its own result\'s artwork after the query changes');
  assert.ok(art.slice(0, 3).every(card => card.srcs.length === 1));
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('End');
  await artShown(5);
  await input.fill('Slow');
  await page.waitForFunction(() => document.querySelector('.cs-result-strip .la-title')?.textContent === 'Slow result 1');
  await artShown(3);
  art = await stripArt();
  assert.ok(art.every(card => card.ok), 'cached results show their own artwork again');
  assert.equal(new Set(art.flatMap(card => card.srcs)).size, 3);

  assert.equal(await strip.evaluate(el => el.closest('.cs-result-strip').scrollHeight - el.closest('.cs-result-strip').clientHeight), 0,
    'a full list leaves the cover strip unclipped at rest');
  const rollOverflow = () => page.evaluate(() => new Promise(resolve => {
    const sheet = document.querySelector('.cs'), coverStrip = document.querySelector('.cs-result-strip');
    let worst = -Infinity, smallest = Infinity;
    const start = performance.now();
    (function frame() {
      const edge = sheet.getBoundingClientRect().bottom - parseFloat(getComputedStyle(sheet).paddingBottom);
      const rect = coverStrip.getBoundingClientRect();
      worst = Math.max(worst, rect.bottom - edge); smallest = Math.min(smallest, rect.height);
      if (performance.now() - start < 700) requestAnimationFrame(frame); else resolve({ worst, smallest });
    })();
  }));
  const closing = rollOverflow();
  await page.evaluate(() => fixture.search.close());
  const closed = await closing;
  assert.ok(closed.worst < 0.5, `covers stay inside the paper while it rolls up (${closed.worst}px out)`);
  assert.ok(closed.smallest < 1, 'the paper rolls all the way up to the cover strip\'s top edge');
  const opening = rollOverflow();
  await page.evaluate(() => fixture.search.open());
  const opened = await opening;
  assert.ok(opened.worst < 0.5, `covers stay inside the paper while it unrolls (${opened.worst}px out)`);
  await page.evaluate(() => { fixture.artFor = null; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => fixture.search.open());
  await input.fill('');
  await carousel.waitFor();
  assert.equal(await strip.isVisible(), false);
  pass('Listen again: drawer discs land in covers, keyboard/Enter, side and centre clicks, wheel, drag, reduced motion and paper fallback');
  pass('typed search: five covers above the full ruled list, independent keyboard navigation, native typing, centered click/Enter, reduced motion and live setting');
  pass('typed search covers: each result\'s own artwork across query changes, covers clipped by the paper while it rolls up and unrolls');
  assert.deepEqual(errors, []);
  console.log(`all lists checks passed -> ${out}`);
} finally { await browser.close(); await server.close(); }
