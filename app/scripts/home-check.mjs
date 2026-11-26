// Home/player chrome checks: card captions, state, paint-free ticks, overlays/Sign in,
// shelf fitting/lettering/keys, fixed FPS card and zero kit callbacks while idle.
// Usage: node scripts/home-check.mjs <out_dir> (SIENNA_PORT, SIENNA_ANGLE)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-home');
const port = Number(process.env.SIENNA_PORT) || 5257;
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const angle = process.env.SIENNA_ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
await context.addInitScript(() => {
  window.__homePaints = { lines: 0 };
  const toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    if ((new Error().stack || '').includes('/src/controls.js')) window.__homePaints.lines++;
    return toDataURL.apply(this, args);
  };
  window.__kitCallbacks = { raf: 0, timeout: 0, interval: 0 };
  for (const [name, kind] of [['requestAnimationFrame', 'raf'], ['setTimeout', 'timeout'], ['setInterval', 'interval']]) {
    const original = window[name].bind(window);
    window[name] = (callback, ...args) => {
      const kit = /\/src\/ui\/(paper|brush|inputs|sheet|list|banner)\.js|\/src\/controls\.js/.test(new Error().stack || '');
      return original(kit && typeof callback === 'function' ? (...values) => {
        window.__kitCallbacks[kind]++;
        return callback(...values);
      } : callback, ...args);
    };
  }
});
const page = await context.newPage();
const checkOverlay = async (open, label) => {
  const state = await page.evaluate(async () => {
    const { overlayOpen } = await import('/src/ui/sheet.js');
    return { open: overlayOpen(), tucked: document.querySelector('.cad-tag').classList.contains('tucked') };
  });
  assert.deepEqual(state, { open, tucked: open }, label);
};
try {
  await page.goto(`http://127.0.0.1:${port}/ui-lab.html`);
  await page.waitForFunction(() => window.__uiLab?.ready);
  await page.evaluate(async () => {
    const { brushButton } = await import('/src/ui/brush.js');
    const { createMenu } = await import('/src/menu.js');
    const { createSettingsPanel } = await import('/src/settings-panel.js');
    const check = (on, message) => { if (!on) throw Error(message); };
    const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const b = brushButton('Start');
    document.body.append(b);
    for (const lines of [['Two', 'lines'], ['Three', 'painted', 'lines']]) {
      b.setLabel(lines, { fontPx: 32 });
      await tick();
      check(b.querySelectorAll('.ui-brush-line').length === lines.length, 'multi-line label count');
      const box = b.getBoundingClientRect();
      check([...b.querySelectorAll('.ui-brush-line')].every(line => {
        const r = line.getBoundingClientRect();
        return r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
      }), 'multi-line text left plate');
    }
    b.setCurrent(true);
    check(b.getAttribute('aria-current') === 'true' && !b.hasAttribute('aria-pressed') && b.classList.contains('is-on'), 'navigation semantics');
    b.setCurrent(false);
    b.setPressed(true);
    b.setCurrent(true);
    b.setCurrent(false);
    check(b.getAttribute('aria-pressed') === 'true' && b.classList.contains('is-on'), 'pressed API changed');
    b.setLabel([]);
    check(b.textContent === '' && b.getAttribute('aria-label') === '', 'empty array label');
    b.setLabel('Back', { fontPx: null });
    check(b.textContent === 'Back' && !b.style.fontSize, 'string label or font reset');
    b.destroy();
    b.remove();

    const picked = [];
    const menu = createMenu({ onGo: index => picked.push(index), onHome: () => picked.push('home') });
    await menu.ready();
    menu.setSections(Array.from({ length: 12 }, (_, index) => ({ index, title: index ? `A shelf with a long painted title ${index}` : '' })));
    menu.setCurrent(2);
    menu.show(true, true);
    const buttons = [...document.querySelectorAll('.mn.l button, .mn.r button')];
    check(buttons.length === 10 && document.querySelectorAll('.mn.l button').length === 5, 'PER_SIDE changed');
    check(buttons[0].getAttribute('aria-label') === 'Untitled', 'empty shelf fallback');
    check(buttons[2].getAttribute('aria-current') === 'true' && buttons.every(b => !b.hasAttribute('aria-pressed') && b.tabIndex === 0), 'shelf state/focus');
    buttons[2].click();
    const home = document.querySelector('.mn.h button');
    check(home.getAttribute('aria-label') === 'Back to the entrance', 'Home accessible name');
    home.click();
    check(picked.join() === '2,home', 'menu navigation callbacks');
    menu.setSections([]);
    check(!document.querySelectorAll('.mn.l button, .mn.r button').length, 'empty menu');

    let calls = 0, resolveRestock;
    const panel = createSettingsPanel({ onRestock: () => { calls++; return new Promise(resolve => { resolveRestock = resolve; }); } });
    panel.show(true);
    const restock = document.querySelector('.st-btn .ui-brush');
    check(restock.getAttribute('aria-description') && !restock.hasAttribute('title'), 'Restock description');
    const pending = panel.restock();
    check(restock.disabled && restock.classList.contains('ui-brush--spin'), 'Restock busy state');
    await panel.restock();
    check(calls === 1, 'duplicate Restock request');
    resolveRestock({ ok: true });
    await pending;
    check(!restock.disabled && !restock.classList.contains('ui-brush--spin') && restock.textContent === 'Done!', 'Restock success');
    await new Promise(resolve => setTimeout(resolve, 1900));
    check(restock.textContent === 'Restock', 'Done reset');
    const failed = panel.restock();
    resolveRestock({ ok: false });
    await failed;
    check(restock.textContent === 'Restock' && !restock.disabled && !restock.classList.contains('is-on'), 'Restock failure');
    const throwing = createSettingsPanel({ onRestock: () => { throw Error('offline'); } });
    await throwing.restock();
    const last = [...document.querySelectorAll('.st-btn .ui-brush')].at(-2);
    check(last.textContent === 'Restock' && !last.disabled && !last.classList.contains('ui-brush--spin'), 'Restock rejection');
  });
  console.log('PASS brush/menu: two/three lines, string/empty labels, current/pressed API, 5-per-side, empty shelves, Home callbacks');
  console.log('PASS utilities: painted icon signs, accessible description, busy spinner/guard, Done reset, failure and rejection');

  await page.goto(`http://127.0.0.1:${port}/?shot=1&wc=0&at=home`);
  await page.waitForFunction(() => !!window.__seek);
  await page.evaluate(() => window.__seek(30));
  await page.waitForTimeout(500);
  const repaint = await page.evaluate(async () => {
    const { brushStats } = await import('/src/ui/brush.js');
    const { settings } = await import('/src/settings.js');
    const visible = [...document.querySelectorAll('.ui-brush')].filter(b => b.offsetWidth && b.offsetHeight).length;
    const before = brushStats().repaints;
    settings.set('font', 'kaushan');
    await document.fonts.load('64px "Kaushan Script"');
    await new Promise(resolve => setTimeout(resolve, 300));
    return { visible, delta: brushStats().repaints - before };
  });
  assert.equal(repaint.delta, repaint.visible, 'lettering must repaint each visible plate exactly once');
  console.log(`PASS lettering: ${repaint.delta}/${repaint.visible} plates repainted exactly once`);
  await page.locator('.mn.l button').first().click();
  await page.evaluate(() => {
    const music = window.__siennaDebug.music, command = music.command.bind(music);
    window.__chromeCommands = [];
    music.command = (name, arg) => { window.__chromeCommands.push(name); return command(name, arg); };
  });
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => window.__chromeCommands), ['toggle']);
  assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BUTTON');
  const shelfAt = await page.evaluate(() => window.__siennaDebug.state.at);
  await page.keyboard.press('Tab');
  assert.notEqual(await page.evaluate(() => window.__siennaDebug.state.at), shelfAt);
  console.log('PASS shelf keyboard: pointer click releases focus, Space toggles once, Tab steps sections');


await page.goto(`http://127.0.0.1:${port}/?shot=8&wc=0&guest`);
await page.waitForFunction(() => !!window.__siennaDebug, null, { timeout: 120000 });
await page.evaluate(() => {
  const d = window.__siennaDebug;
  d.nav.skipIntro(100);
  d.music.play(d.shelves[0].items[0]);
});
await page.waitForTimeout(6000);
await page.evaluate(() => window.__seek(30));
await page.waitForTimeout(300);
const check = await page.evaluate(async () => {
  const { createCaption } = await import('/src/controls.js');
  const { paperStats } = await import('/src/ui/paper.js');
  const { brushStats } = await import('/src/ui/brush.js');
  const { inputsStats } = await import('/src/ui/inputs.js');
  const { setOverlayOpen, overlayOpen } = await import('/src/ui/sheet.js');
  const commands = [];
  const c = createCaption({ onCommand: (cmd) => commands.push(cmd), onQueue() {}, onLyrics() {} });
  c.dock({ left: 800, bottom: 20, maxWidth: 440 });
  c.show(true);
  const state = { title: 'A record', artist: 'An artist', album: 'An album', duration: 200, position: 65, ready: true, signedIn: false };
  c.setState(state, { real: true });
  await c.ready();
  await new Promise(r => setTimeout(r, 200));
  const stats = () => JSON.stringify([paperStats(), brushStats(), inputsStats()]);
  const before = stats();
  if (window.__homePaints.lines) throw Error('the progress line is plain CSS: the tag paints no canvas');
  const box = JSON.stringify(c.el.getBoundingClientRect().toJSON());
  for (let i = 0; i < 200; i++) c.setState({ ...state, position: 65 + i / 100 }, { real: true });
  if (window.__homePaints.lines || before !== stats() || box !== JSON.stringify(c.el.getBoundingClientRect().toJSON())) throw Error('tick paints or moves caption');
  const stamps = c.el.querySelectorAll('.ui-stamp');
  stamps[0].click();
  c.setState(state, { real: true });
  if (commands.join() !== 'mute' || stamps[0].getAttribute('aria-pressed') !== 'false') throw Error('rejected command not reset');
  c.setState({ ...state, muted: true, shuffle: true, repeat: 'ONE' });
  if (stamps[0].getAttribute('aria-label') !== 'Mute (M): on' || stamps[1].getAttribute('aria-pressed') !== 'true' || stamps[2].getAttribute('aria-label') !== 'Repeat: one') throw Error('stamp state mismatch');
  if ([...stamps].some(s => s.hasAttribute('title'))) throw Error('native title');
  c.tuck(false);
  setOverlayOpen(c, true);
  if (!overlayOpen() || !c.el.classList.contains('tucked')) throw Error('overlay not tucked');
  c.tuck(true);
  setOverlayOpen(c, false);
  if (!c.el.classList.contains('tucked')) throw Error('suitcase tuck lost');
  c.tuck(false);
  if (c.el.classList.contains('tucked')) throw Error('caption did not return');
  c.setState({});
  if (!c.el.querySelector('.cap').classList.contains('empty')) throw Error('empty state');
  c.setState({ adPlaying: true });
  if (c.el.querySelector('.t').textContent !== 'A short ad…') throw Error('ad state');
  c.el.remove();
  return 'PASS caption: 200 paint-free stable ticks, stamp state/rejected commands, empty/ad states, overlay OR suitcase tuck';
});
console.log(check);
await page.locator('.cad-tag .ui-stamp').first().click();
const muted = await page.evaluate(() => window.__siennaDebug.player.muted);
await page.evaluate(() => {
  const music = window.__siennaDebug.music;
  const command = music.command.bind(music);
  window.__captionCommands = [];
  music.command = (name, arg) => { window.__captionCommands.push(name); return command(name, arg); };
});
await page.keyboard.press('Space');
const keys = await page.evaluate(() => ({ commands: window.__captionCommands, muted: window.__siennaDebug.player.muted, active: document.activeElement.tagName }));
if (keys.commands.join() !== 'toggle' || keys.muted !== muted || keys.active === 'BUTTON') throw Error(`keyboard ownership: ${JSON.stringify(keys)}`);
const at = await page.evaluate(() => window.__siennaDebug.state.at);
await page.keyboard.press('Tab');
if (await page.evaluate(() => window.__siennaDebug.state.at) === at) throw Error('Tab did not step sections');
console.log('PASS keyboard: pointer stamp click releases focus; Space toggles once without muting; Tab steps sections');
await page.evaluate(() => { window.__siennaDebug.nav.go(-1); });
await page.evaluate(() => window.__seek(40));
await page.evaluate(() => window.__siennaDebug.search.open());
await checkOverlay(true, 'search open');
if (!await page.locator('.cad-tag').evaluate(el => el.classList.contains('tucked'))) throw Error('search did not tuck');
await page.evaluate(() => window.__siennaDebug.search.close());
await checkOverlay(false, 'search close');
await page.keyboard.press('ControlOrMeta+Comma');
await checkOverlay(true, 'Settings open');
if (!await page.locator('.cad-tag').evaluate(el => el.classList.contains('tucked'))) throw Error('Settings did not tuck');
await page.keyboard.press('Escape');
await checkOverlay(false, 'Settings close');
await page.locator('.cad-tag .ui-stamp').nth(3).click();
await checkOverlay(true, 'Queue open');
if (!await page.locator('.cad-tag').evaluate(el => el.classList.contains('tucked'))) throw Error('Queue did not tuck');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.cad-tag').classList.contains('tucked'), null, { timeout: 3000 });
await checkOverlay(false, 'Queue close');
await page.locator('.cad-tag .ui-stamp').nth(4).click();
if (!await page.locator('.cad-tag').evaluate(el => el.classList.contains('tucked'))) throw Error('Lyrics did not tuck');
await page.keyboard.press('Escape');
await page.evaluate(async () => {
  const { createCollectionList } = await import('/src/collection-list.js');
  const list = createCollectionList();
  await list.open({ title: 'Empty collection' }, []);
  if (!document.querySelector('.cad-tag').classList.contains('tucked')) throw Error('collection did not tuck');
  list.close();
});
await page.evaluate(() => window.__siennaDebug.tour.restart());
if (!await page.locator('.cad-tag').evaluate(el => el.classList.contains('tucked') && getComputedStyle(el).visibility === 'hidden')) throw Error('tour welcome did not hide tag');
await page.keyboard.press('Escape');
if (await page.locator('.cad-tag').evaluate(el => el.classList.contains('tucked'))) throw Error('tag did not return after overlays');
console.log('PASS live overlays: Search, Settings, Queue, Lyrics, collection and tour tuck and restore caption');


  assert.equal(await page.locator('.cad-tag.shop .cap').evaluate(el => el.classList.contains('ui-paper')), true);
  await page.evaluate(() => window.__siennaDebug.music.command('mute'));
  await page.waitForFunction(() => document.querySelector('.cad-tag .ui-stamp').getAttribute('aria-pressed') === 'false');
  await page.evaluate(() => window.__siennaDebug.music.command('shuffle'));
  await page.waitForFunction(() => document.querySelectorAll('.cad-tag .ui-stamp')[1].getAttribute('aria-pressed') === 'true');
  await page.evaluate(() => window.__siennaDebug.music.command('repeat'));
  await page.waitForFunction(() => document.querySelectorAll('.cad-tag .ui-stamp')[2].getAttribute('aria-label') === 'Repeat: all');
  await page.evaluate(() => window.__siennaDebug.music.command('repeat'));
  await page.waitForFunction(() => document.querySelectorAll('.cad-tag .ui-stamp')[2].getAttribute('aria-label') === 'Repeat: one');
  const stampState = await page.locator('.cad-tag .ui-stamp').evaluateAll(buttons => buttons.map(button => ({
    label: button.getAttribute('aria-label'), tip: button.querySelector('[role="tooltip"]').textContent,
    native: button.hasAttribute('title'),
  })));
  assert.ok(stampState.every(button => !button.native && button.label === button.tip));
  console.log('PASS fake-store stamps: mute/shuffle/repeat state, pressed labels and painted tooltips; no native titles');

  await page.evaluate(async () => {
    const { createCaption } = await import('/src/controls.js');
    const c = createCaption();
    c.show(true, true);
    c.setState({ ready: true, signedIn: false }, { real: true });
    window.__signInFixture = c;
  });
  assert.equal(await page.locator('.cad-tag .ui-brush:visible').count(), 1);
  await page.evaluate(() => window.__siennaDebug.tour.restart());
  assert.equal(await page.locator('.cad-tag .ui-brush:visible').count(), 0);
  assert.equal(await page.locator('.tr-stage:not(.tr-ghost) button').filter({ hasText: /^Sign in$/ }).count(), 1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__signInFixture.el.remove(); delete window.__signInFixture; });
  console.log('PASS Sign in: guest tag visible before welcome, hidden during welcome; exactly one tour Sign in');
  await page.screenshot({ path: out + '/shop-tag.png' });

  const mini = await context.newPage();
  await mini.setViewportSize({ width: 420, height: 600 });
  await mini.goto('http://127.0.0.1:' + port + '/mini.html?shot=1&wc=0');
  await mini.waitForFunction(() => !!window.__mini, null, { timeout: 120000 });
  await mini.evaluate(async () => {
    const d = window.__mini;
    const { shelves } = await d.music.shelves();
    await d.music.play(shelves[0].items[0]);
  });
  await mini.waitForFunction(() => !!document.querySelector('.cad-tag.mini .t').textContent);
  await mini.evaluate(() => window.__seek(30));
  assert.equal(await mini.locator('.cad-tag.mini .cap').evaluate(el => el.classList.contains('ui-paper')), true);
  await mini.locator('.cad-tag .ui-stamp').first().click({ force: true });
  await mini.keyboard.press('Space');
  assert.notEqual(await mini.evaluate(() => document.activeElement.tagName), 'BUTTON');
  await mini.screenshot({ path: out + '/mini-tag.png' });
  await mini.close();
  console.log('PASS mini: card caption and pointer keyboard release');

  await page.goto('http://127.0.0.1:' + port + '/?at=home&wc=0&tour=0');
  await page.waitForFunction(() => window.__siennaDebug?.pacer && window.__siennaDebug.state.introDone, null, { timeout: 180000 });
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1000);
  const fpsStart = await page.evaluate(async () => {
    const { settings } = await import('/src/settings.js');
    const { paperStats } = await import('/src/ui/paper.js');
    const ticket = document.querySelector('.fps-ticket');
    const paints = paperStats().paints;
    settings.set('fps', true);
    await new Promise((resolve, reject) => {
      const start = performance.now();
      const painted = () => {
        if (ticket.querySelector('.ui-paper-bg').style.backgroundImage) resolve();
        else if (performance.now() - start > 120000) reject(Error(`FPS paper never painted: ${JSON.stringify({ paints: paperStats().paints - paints, display: ticket.style.display, box: ticket.getBoundingClientRect().toJSON() })}`));
        else requestAnimationFrame(painted);
      };
      painted();
    });
    const text = ticket.querySelector('span');
    const original = text.textContent;
    text.textContent = '120 fps · worst 99.9 ms';
    const padding = parseFloat(getComputedStyle(ticket).paddingLeft) + parseFloat(getComputedStyle(ticket).paddingRight);
    const fits = text.getBoundingClientRect().width + padding <= ticket.clientWidth;
    text.textContent = original;
    window.__fpsProbe = { text: 0, paper: 0 };
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (ticket.querySelector('.ui-paper-bg').contains(record.target)) window.__fpsProbe.paper++;
        else if (!ticket.querySelector('.ui-paper-layer').contains(record.target)) window.__fpsProbe.text++;
      }
    });
    observer.observe(ticket, { subtree: true, attributes: true, childList: true, characterData: true });
    window.__fpsObserver = observer;
    return { paints: paperStats().paints - paints, fits, box: ticket.getBoundingClientRect().toJSON(), bg: getComputedStyle(ticket.querySelector('.ui-paper-bg')).backgroundImage };
  });
  assert.ok(fpsStart.paints <= 1, 'every card shares one grain, painted once');
  assert.ok(fpsStart.fits, 'FPS longest realistic text does not fit');
  assert.ok(fpsStart.box.width <= 180, 'FPS ticket is too wide');
  assert.match(fpsStart.bg, /^url/);
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => window.__fpsProbe.text >= 3, null, { timeout: 30000 });
  const fpsEnd = await page.evaluate(() => {
    window.__fpsObserver.disconnect();
    return { ...window.__fpsProbe, box: document.querySelector('.fps-ticket').getBoundingClientRect().toJSON() };
  });
  assert.ok(fpsEnd.text >= 2, 'FPS text did not update for two seconds: ' + JSON.stringify(fpsEnd));
  assert.equal(fpsEnd.paper, 0);
  assert.deepEqual(fpsEnd.box, fpsStart.box);
  console.log('PASS FPS: card shares the one grain; at least three text updates over 2+ s without changing its box or card');
  await page.screenshot({ path: out + '/fps-ticket.png' });

  await page.waitForTimeout(1000);
  const idleBefore = await page.evaluate(() => ({ ...window.__kitCallbacks }));
  assert.ok(idleBefore.raf > 0, 'callback probe did not observe kit initialization');
  await page.waitForTimeout(2100);
  const idleAfter = await page.evaluate(() => ({ ...window.__kitCallbacks }));
  assert.deepEqual(idleAfter, idleBefore, 'kit rAF/timer callbacks ran while pointer was still');
  console.log('PASS idle: zero kit rAF/timeout/interval callbacks for 2 s (registered before app load; shop pacer excluded)');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:' + port + '/ui-lab.html');
  await page.waitForFunction(() => window.__uiLab?.ready);
  await page.locator('#lab-tag').screenshot({ path: out + '/lab-real-captions.png' });
  assert.equal(await page.locator('#lab-tag .cad-tag.shop .ui-paper').count(), 1);
  assert.equal(await page.locator('#lab-tag .cad-tag.mini .ui-paper').count(), 1);
  const labInFlow = await page.locator('#lab-tag .cad-tag').evaluateAll(tags => tags.every(tag => {
    const r = tag.getBoundingClientRect(), parent = tag.parentElement.getBoundingClientRect();
    return r.left >= parent.left - 1 && r.right <= parent.right + 1;
  }));
  assert.ok(labInFlow, 'lab captions retained shop/mini screen offsets');
  await page.goto('http://127.0.0.1:' + port + '/ui-lab.html?compare');
  await page.waitForFunction(() => window.__uiLab?.ready);
  assert.equal(await page.locator('.lab-compare-col .cad-tag .ui-paper').count(), 4);
  await page.screenshot({ path: out + '/lab-real-compare.png', fullPage: true });
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 720 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'real caption overflowed compare columns');
  }

  for (const [width, height] of [[1280, 720], [1024, 640]]) {
    await page.setViewportSize({ width, height });
    for (const font of ['amatic', 'kaushan', 'sriracha', 'caveat']) {
      await page.goto(`http://127.0.0.1:${port}/?shot=1&wc=0&at=home&font=${font}&fps=1`);
      await page.waitForFunction(() => !!window.__seek);
      await page.mouse.move(width / 2, height / 2);
      await page.evaluate(() => window.__seek(30));
      await page.waitForTimeout(300);
      const bounds = await page.locator('.st-btn .ui-brush-label').evaluateAll(labels => labels.map(label => {
        const range = document.createRange();
        range.selectNodeContents(label);
        const r = range.getBoundingClientRect();
        return { text: label.textContent, left: r.left, top: r.top, right: r.right, bottom: r.bottom, safe: r.left >= 64 && r.top >= 48 && r.right <= innerWidth - 80 && r.bottom <= innerHeight - 48 };
      }));
      assert.ok(bounds.every(b => b.safe), 'utilities crossed painted frame: ' + JSON.stringify({ width, height, font, bounds }));
      const overlap = await page.locator('.fps-ticket').evaluate(ticket => {
        const r = ticket.getBoundingClientRect();
        return [...document.querySelectorAll('.mn button')].filter(button => button.offsetWidth && getComputedStyle(button).visibility !== 'hidden').some(button => {
          const b = button.getBoundingClientRect();
          return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
        });
      });
      assert.equal(overlap, false, 'FPS overlaps Home/shelves');
      await page.screenshot({ path: `${out}/home-${font}-${width}x${height}.png` });
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`http://127.0.0.1:${port}/?shot=1&wc=0&at=0&font=amatic`);
  await page.waitForFunction(() => !!window.__seek);
  await page.mouse.move(640, 300);
  await page.evaluate(async () => { await window.__seek(30); await window.__seek(32); });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.mn.l').evaluate(el => el.classList.contains('faded')), true);
  assert.equal(await page.locator('.mn button[aria-current="true"]').count(), 1);
  await page.screenshot({ path: `${out}/station-amatic-1280x720.png` });
  assert.deepEqual(errors, []);
  console.log(`PASS screenshots: eight home font/size combinations and receded active station -> ${out}`);
} finally {
  await browser.close();
  await server.close();
}
