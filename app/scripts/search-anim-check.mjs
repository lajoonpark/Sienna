// The search bar's paint-on / flick-off (src/searchpaint.js). Plays it in search-lab.html and checks that it
// really paints in stages, rests on the same picture every time, survives a change of mind halfway, and
// holds its frame rate on the GPU. Saves a film strip of each direction to out_dir.
// Usage: node scripts/search-anim-check.mjs out_dir      (SIENNA_PORT=5251)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-search-anim');
const port = Number(process.env.SIENNA_PORT) || 5251;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
// Film strips: the page's clock and its CSS animations run 12x slower, so every stage can be photographed.
const slowClock = () => {
  const now = performance.now.bind(performance), raf = requestAnimationFrame.bind(window);
  let base = 0, from = now(), rate = 1;
  const clock = () => base + (now() - from) * rate;
  window.__rate = (x) => { base = clock(); from = now(); rate = x; };
  performance.now = clock;
  window.requestAnimationFrame = (cb) => raf(() => cb(clock()));
};
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(slowClock);
await page.goto(`http://127.0.0.1:${port}/search-lab.html`);
await page.waitForFunction('window.__ready === true');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('ok  ', name);

const renderer = await page.evaluate(() => {
  const g = document.createElement('canvas').getContext('webgl2');
  return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
});
console.log('renderer:', renderer);
assert.ok(!/swiftshader|llvmpipe/i.test(renderer), 'running on the GPU');

// How much of the bar's canvas is painted, and how long frames take, while it plays.
await page.evaluate(() => {
  const fx = document.querySelector('.cs-fx');
  window.__watch = (ms) => new Promise((res) => {
    const g = fx.getContext('2d'), coverage = [], t0 = performance.now(), gaps = [];
    let prev = t0;
    const step = (now) => {
      gaps.push(now - prev); prev = now;
      const d = g.getImageData(0, 0, fx.width, fx.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 64) if (d[i] > 40) n++;
      coverage.push(n);
      if (now - t0 < ms) requestAnimationFrame(step); else res({ coverage, gaps });
    };
    requestAnimationFrame(step);
  });
});
const hotkey = () => page.keyboard.press('Control+Alt+KeyJ');
const classes = () => page.evaluate(() => document.querySelector('.cs').className);

async function film(p, name, act, ms, width = 900, clipH = 0.5) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / 12 });
  await p.evaluate(() => window.__rate(1 / 12));
  await act();
  const shots = [], t0 = Date.now();
  const size = p.viewportSize();
  while (Date.now() - t0 < ms * 12) {
    shots.push((await p.screenshot({ type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: size.width, height: size.height * clipH } })).toString('base64'));
    await wait(ms * 12 / 12);
  }
  await p.evaluate(() => window.__rate(1));
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
  const picks = Array.from({ length: 8 }, (_, i) => shots[Math.floor((i * (shots.length - 1)) / 7)]);
  const strip = await p.evaluate(async ([imgs, width]) => {
    const loaded = await Promise.all(imgs.map((b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/jpeg;base64,${b}`; })));
    const h = Math.round(loaded[0].height * width / loaded[0].width), c = document.createElement('canvas');
    c.width = width * 2; c.height = h * 4;
    const g = c.getContext('2d');
    loaded.forEach((im, i) => g.drawImage(im, (i % 2) * width, Math.floor(i / 2) * h, width, h));
    return c.toDataURL('image/jpeg', 0.82);
  }, [picks, width]);
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(strip.split(',')[1], 'base64'));
}

// Opening: paint grows from nothing, no frame badly late.
const opening = page.evaluate(() => window.__watch(760));
await hotkey();
const op = await opening;
const peak = Math.max(...op.coverage);
assert.ok(op.coverage[1] < peak * 0.35, `starts nearly bare (${op.coverage[1]} of ${peak})`);
const stages = new Set(op.coverage.slice(0, 30)).size;
assert.ok(stages > 8, `paint grows in stages, not at once (${stages})`);
const worst = (g) => Math.max(...g.slice(2));
const mean = (g) => g.slice(2).reduce((a, b) => a + b, 0) / (g.length - 2);
console.log(`opening: ${op.gaps.length} frames, mean ${mean(op.gaps).toFixed(1)} ms, worst ${worst(op.gaps).toFixed(1)} ms`);
assert.ok(mean(op.gaps) < 20, 'opening holds 60 fps');
ok('opening paints on in stages');
assert.match(await classes(), /show/);
assert.ok(await page.evaluate(() => document.activeElement === document.querySelector('.cs-input')), 'typing works from the first frame');

// At rest nothing is left animating on the bar.
await wait(400);   // the last droplets land
const open1 = await page.evaluate(() => document.querySelector('.cs-fx').toDataURL());
assert.strictEqual(await page.evaluate(() => document.querySelector('.cs-bar').style.transform), '');
ok('rests with its styles cleared');

// Results fill in, then lose their masks.
await page.keyboard.type('lemon');
await wait(1100);
assert.ok(await page.evaluate(() => { const s = [...document.querySelectorAll('.cs-slipwrap')]; return s.length > 1 && s.every((e) => e.classList.contains('set')); }), 'every slip finished arriving');
await page.screenshot({ path: `${out}/rest.png` });
ok('slips finish arriving and drop their masks');

// Closing: isOpen flips at once (keys go back to the shop straight away), the paint leaves after.
const closing = page.evaluate(() => window.__watch(620));
await hotkey();
assert.ok(!(await page.evaluate('window.__search.isOpen()')));
assert.match(await classes(), /closing/);
const cl = await closing;
console.log(`closing: ${cl.gaps.length} frames, mean ${mean(cl.gaps).toFixed(1)} ms, worst ${worst(cl.gaps).toFixed(1)} ms`);
assert.ok(mean(cl.gaps) < 20, 'closing holds 60 fps');
await page.waitForFunction(() => !document.querySelector('.cs').classList.contains('closing'), null, { timeout: 2000 });
assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.cs')).visibility), 'hidden');
ok('closing hands the keys back at once, then hides');

// A change of mind halfway, both ways, ends on the right state with the same picture.
await hotkey(); await wait(180);
await hotkey(); await wait(90);
await hotkey(); await wait(1200);
assert.match(await classes(), /show/);
assert.doesNotMatch(await classes(), /closing/);
assert.strictEqual(await page.evaluate(() => document.querySelector('.cs-fx').toDataURL()), open1, 'same paint at rest');
await hotkey(); await wait(120);
await hotkey(); await wait(40);
await hotkey();
await page.waitForFunction(() => !/show|closing/.test(document.querySelector('.cs').className), null, { timeout: 2000 });
ok('hotkey mashing lands in the right state');

// Film strips, for looking at: the shop-size lab, then the real mini window (fake store, no Electron).
await page.fill('.cs-input', '').catch(() => {});
await page.evaluate(() => { document.querySelector('.cs-input').value = ''; });
await film(page, 'open', hotkey, 620);
await page.keyboard.type('lemon');
await wait(1100);
await film(page, 'close', hotkey, 560);

const mini = await browser.newPage({ viewport: { width: 540, height: 620 } });
mini.on('pageerror', (e) => errors.push(e.message));
await mini.addInitScript(slowClock);
await mini.goto(`http://127.0.0.1:${port}/mini.html`);
await wait(2500);
const miniKey = () => mini.keyboard.press('Control+Alt+KeyJ');
await film(mini, 'mini-open', miniKey, 900, 540, 1);
assert.ok(await mini.evaluate(() => document.querySelector('.cs').classList.contains('show')));
await wait(600);
await film(mini, 'mini-close', miniKey, 560, 540, 1);
await mini.waitForFunction(() => !document.querySelector('.cs').classList.contains('closing'), null, { timeout: 3000 });
ok('the mini window opens and closes it too');
await miniKey();
await wait(40);
assert.ok(await mini.evaluate(() => Number(getComputedStyle(document.querySelector('.cs-head')).opacity) < 0.05), '"Listen again" waits for the bar to land');
ok('the heading waits for the bar');

assert.deepStrictEqual(errors, []);
await browser.close();
await server.close();
console.log('all search animation checks passed');
