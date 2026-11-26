// The menus' motion. In search-lab.html: the search card flips up with typing live from the first frame,
// hands the keys back the moment it starts to leave, survives a change of mind halfway and holds its
// frame rate on the GPU. In the mini player: the Listen again and Up next sleeves come out of the
// suitcase's open drawer, the centred one lands last, any key skips the deal, and closing sends them
// back before the drawer shuts. Saves film strips to out_dir.
// Usage: node scripts/search-anim-check.mjs out_dir      (SIENNA_PORT=5251)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-search-anim');
const port = Number(process.env.SIENNA_PORT) || 5251;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${process.env.SIENNA_ANGLE || (process.platform === 'darwin' ? 'metal' : 'vulkan')}`, '--ignore-gpu-blocklist'] });
// Film strips: the page's clock, timers and CSS animations run slowed, so every stage can be photographed.
const slowClock = () => {
  const now = performance.now.bind(performance), raf = requestAnimationFrame.bind(window), later = setTimeout.bind(window);
  let base = 0, from = now(), rate = 1;
  const clock = () => base + (now() - from) * rate;
  window.__rate = (x) => { base = clock(); from = now(); rate = x; };
  performance.now = clock;
  window.requestAnimationFrame = (cb) => raf(() => cb(clock()));
  window.setTimeout = (fn, ms = 0, ...args) => later(fn, ms / rate, ...args);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('ok  ', name);
const errors = [];
async function open(path, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(slowClock);
  await page.goto(`http://127.0.0.1:${port}/${path}`);
  return page;
}

async function film(page, name, act, ms, width) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / 10 });
  await page.evaluate(() => window.__rate(1 / 10));
  await act();
  const shots = [], t0 = Date.now();
  while (Date.now() - t0 < ms * 10) {
    shots.push((await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64'));
    await wait(ms);
  }
  await page.evaluate(() => window.__rate(1));
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
  const picks = Array.from({ length: 8 }, (_, i) => shots[Math.floor((i * (shots.length - 1)) / 7)]);
  const strip = await page.evaluate(async ([imgs, width]) => {
    const loaded = await Promise.all(imgs.map((b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/jpeg;base64,${b}`; })));
    const h = Math.round(loaded[0].height * width / loaded[0].width), c = document.createElement('canvas');
    c.width = width * 4; c.height = h * 2;
    const g = c.getContext('2d');
    loaded.forEach((im, i) => g.drawImage(im, (i % 4) * width, Math.floor(i / 4) * h, width, h));
    return c.toDataURL('image/jpeg', 0.82);
  }, [picks, width]);
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(strip.split(',')[1], 'base64'));
}

try {
  // ---- the search card ----
  const page = await open('search-lab.html', { width: 1280, height: 720 });
  await page.waitForFunction('window.__ready === true');
  const renderer = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2');
    return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
  });
  console.log('renderer:', renderer);
  assert.ok(!/swiftshader|llvmpipe/i.test(renderer), 'running on the GPU');
  const hotkey = () => page.keyboard.press('Control+Alt+KeyJ');
  const card = () => page.evaluate(() => {
    const el = document.querySelector('.cs'), css = getComputedStyle(el);
    return { show: el.classList.contains('show'), closing: el.classList.contains('closing'), visibility: css.visibility,
      transform: css.transform, animations: el.getAnimations().length };
  });
  const frames = (ms) => page.evaluate((ms) => new Promise((done) => {
    const gaps = []; let last = performance.now(); const end = last + ms;
    (function frame() { const t = performance.now(); gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(frame); else done(gaps.slice(1)); })();
  }), ms);
  const mean = (gaps) => gaps.reduce((a, b) => a + b, 0) / gaps.length;

  const opening = frames(520);
  await hotkey();
  assert.ok(await page.evaluate(() => document.activeElement === document.querySelector('.cs-input')), 'typing works from the first frame');
  assert.ok((await card()).animations > 0, 'the card flips up');
  const open60 = await opening;
  console.log(`opening: ${open60.length} frames, mean ${mean(open60).toFixed(1)} ms, worst ${Math.max(...open60).toFixed(1)} ms`);
  assert.ok(mean(open60) < 22, 'opening holds 60 fps');
  await wait(300);
  assert.deepStrictEqual(await card(), { show: true, closing: false, visibility: 'visible', transform: 'none', animations: 0 });
  ok('the card flips up with the keyboard live, and comes to rest');

  await hotkey();
  assert.ok(!(await page.evaluate('window.__search.isOpen()')), 'keys go back to the shop at once');
  assert.ok((await card()).closing);
  await page.waitForFunction(() => !document.querySelector('.cs').classList.contains('closing'), null, { timeout: 2000 });
  assert.equal((await card()).visibility, 'hidden');
  ok('closing hands the keys back at once, then hides');

  for (const pauses of [[180, 90], [60, 40]]) {
    await hotkey(); await wait(pauses[0]); await hotkey(); await wait(pauses[1]); await hotkey(); await wait(900);
    assert.deepStrictEqual(await card(), { show: true, closing: false, visibility: 'visible', transform: 'none', animations: 0 });
    await hotkey(); await page.waitForFunction(() => getComputedStyle(document.querySelector('.cs')).visibility === 'hidden');
  }
  ok('changes of mind halfway land in the right state');
  await film(page, 'search-open', hotkey, 80, 480);
  await film(page, 'search-close', hotkey, 50, 480);

  // ---- the mini player: sleeves out of the drawer and back ----
  const mini = await open('mini.html?play', { width: 540, height: 620 });   // a record playing, so Up next has a queue
  await mini.waitForFunction('window.__mini', null, { timeout: 60000 });
  await wait(3000);
  // for each sleeve: where it was when it first showed (and where the drawer was), and when it landed
  const watchDeal = () => mini.evaluate(() => {
    window.__deal = new Map();
    const t0 = performance.now();
    (function frame() {
      for (const c of document.querySelectorAll('.la-full:not([hidden]) .la-cover.is-flying:not(.is-waiting)')) {
        if (Number(c.style.opacity || 1) <= 0.02 || window.__deal.has(c)) continue;
        const r = c.querySelector('.la-sleeve-front').getBoundingClientRect(), d = window.__mini.drawerScreenPos();
        window.__deal.set(c, { index: Number(c.dataset.index), width: r.width, off: Math.hypot(r.x + r.width / 2 - d.x, r.y + r.height / 2 - d.y), landed: null });
      }
      for (const [c, seen] of window.__deal) if (seen.landed == null && !c.classList.contains('is-flying')) seen.landed = performance.now() - t0;
      if (performance.now() - t0 < 2600) requestAnimationFrame(frame);
    })();
  });
  const deal = () => mini.evaluate(() => [...window.__deal.values()]);
  const settled = (scope = '.cs-stage') => mini.evaluate((scope) => ({
    moving: !!document.querySelector(`${scope} .la-full.is-moving`),
    selected: Number(document.querySelector(`${scope} .la-full .la-cover[aria-selected="true"]`)?.dataset.index),
    drawer: window.__mini.tray.isOpen,
  }), scope);
  for (const [name, openIt, closeIt, shown] of [
    ['Listen again', () => mini.keyboard.press('Control+Alt+KeyJ'), () => mini.keyboard.press('Escape'), '.cs-stage'],
    ['Up next', () => mini.evaluate(() => { window.__mini.liner.openQueue(); }), () => mini.keyboard.press('Escape'), '.ln-qveil'],
  ]) {
    await watchDeal();
    await openIt();
    await mini.waitForSelector(`${shown}.show .la-cover`);
    await wait(2000);
    const seen = await deal();
    const centre = (await settled(shown)).selected;
    assert.ok(seen.length >= 3, `${name}: ${seen.length} sleeves dealt`);
    for (const s of seen) {
      assert.ok(s.off < 130, `${name}: sleeve ${s.index} starts in the drawer (${s.off.toFixed(0)}px away)`);
      assert.ok(s.width < 220, `${name}: sleeve ${s.index} leaves the drawer record-sized (${s.width.toFixed(0)}px wide)`);
    }
    const lastDown = seen.reduce((a, b) => (b.landed > a.landed ? b : a));
    assert.equal(lastDown.index, centre, `${name}: the centred sleeve lands last`);
    assert.deepStrictEqual(await settled(shown), { moving: false, selected: centre, drawer: true });
    await closeIt();
    await wait(120);
    assert.ok((await settled(shown)).moving, `${name}: the sleeves fly home`);
    await mini.waitForFunction(() => !document.querySelector('.la-full:not([hidden]).is-moving') && !window.__mini.tray.isOpen, null, { timeout: 4000 });
    await wait(300);
    ok(`${name}: ${seen.length} sleeves out of the drawer, the centred one last, and back before it shuts`);
  }

  // any key skips the deal, and still moves the wheel
  await mini.keyboard.press('Control+Alt+KeyJ');
  await mini.waitForSelector('.cs-stage.show .la-cover.is-flying');
  await wait(250);
  await mini.keyboard.press('ArrowDown');
  assert.equal((await settled()).moving, false, 'a key lands every sleeve at once');
  await wait(600);
  assert.equal((await settled()).selected, 1);
  await mini.keyboard.press('Escape');
  await wait(1200);
  ok('a key skips the deal and moves the wheel');

  await film(mini, 'mini-listen-open', () => mini.keyboard.press('Control+Alt+KeyJ'), 160, 360);
  await film(mini, 'mini-listen-close', () => mini.keyboard.press('Escape'), 90, 360);
  assert.deepStrictEqual(errors, []);
  console.log(`all menu animation checks passed -> ${out}`);
} finally {
  await browser.close();
  await server.close();
}
