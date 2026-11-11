// The mini window's Listen again slips are ready before search opens. Loads the real mini.html with a
// stubbed Electron bridge and a slow home feed, the window still "hidden", and checks: fetched without
// being asked, covers painted ahead, slips on the page in the same task as the hotkey, an old copy shown
// at once while a fresh one loads, a failed fetch tried again, a sign-in fetching again.
// Usage: node scripts/mini-suggest-check.mjs      (SIENNA_PORT=5241)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert';

const port = Number(process.env.SIENNA_PORT) || 5241;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('ok  ', name);

// A 1x1 cover: same origin, so the painter can read it back. `failFirst`: the first home call rejects.
async function load({ failFirst = false, held = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 540, height: 620 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.route('**/cover/*.png', (r) => r.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg==', 'base64') }));
  await page.addInitScript(({ failFirst, held }) => {
    const now = performance.now.bind(performance);
    window.__skew = 0;
    performance.now = () => now() + window.__skew;   // jump ahead past the 5 minutes
    window.__home = 0; window.__art = 0; window.__delay = 400;
    window.__gate = held ? new Promise((r) => { window.__release = r; }) : null;   // held: the fetch waits for the test
    const realImage = window.Image;
    window.Image = class extends realImage {
      set src(v) { if (String(v).includes('/cover/')) window.__art++; super.src = v; }
      get src() { return super.src; }
    };
    window.sienna = {
      home: async () => {
        const n = ++window.__home;
        await (window.__gate ?? new Promise((r) => setTimeout(r, window.__delay)));
        if (failFirst && n === 1) throw new Error('offline');
        const items = [1, 2, 3].map((i) => ({ kind: 'song', title: `Song ${n}.${i}`, subtitle: 'Artist', art: `/cover/${n}-${i}.png`, play: { videoId: `v${n}${i}` } }));
        return { shelves: [{ title: 'Quick picks', items: [] }, { title: 'Listen again', items }], next: null };
      },
      playlistArt: async () => [], search: async () => [], play: async () => {}, command: async () => {}, signIn: async () => {},
      onState: () => {},
      onAccount: (cb) => { window.__signedIn = cb; },
    };
    window.siennaMini = { onOpen: (cb) => { window.__open = cb; }, onClose: () => {}, closing: () => {}, closed: () => {} };
    // Press the hotkey and read the page in the same task plus microtasks: nothing has been painted yet.
    window.__pressSearch = async () => {
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', altKey: true, ctrlKey: true, bubbles: true }));
      for (let i = 0; i < 5; i++) await null;
      return { head: document.querySelector('.cs-head').textContent, slips: [...document.querySelectorAll('.cs-t')].map((e) => e.textContent) };
    };
  }, { failFirst, held });
  await page.goto(`http://127.0.0.1:${port}/mini.html`);
  await page.waitForFunction('!!window.__mini');
  return page;
}

// hidden window: fetched and painted with no summon and no search
let page = await load();
assert.strictEqual(await page.evaluate('window.__home'), 1, 'one fetch at load');
await page.waitForFunction('window.__art >= 3');
assert.strictEqual(await page.evaluate('window.__mini.phase'), 'hidden');
ok('fetched and covers painted while the window is hidden');

const first = await page.evaluate('window.__pressSearch()');
assert.deepStrictEqual(first, { head: 'Listen again', slips: ['Song 1.1', 'Song 1.2', 'Song 1.3'] });
assert.strictEqual(await page.evaluate('window.__home'), 1, 'search did not fetch again');
ok('slips are on the page in the same task as the hotkey');
await page.evaluate('window.__pressSearch()');   // the hotkey toggles it shut

// summon does not refetch a fresh copy; an old one refetches but never makes search wait
await page.evaluate('window.__open()');
assert.strictEqual(await page.evaluate('window.__home'), 1, 'a summon inside 5 min does not fetch');
await page.evaluate('window.__skew = 301000');
const old = await page.evaluate('window.__pressSearch()');
assert.deepStrictEqual(old.slips, ['Song 1.1', 'Song 1.2', 'Song 1.3'], 'the old copy shows at once');
assert.strictEqual(await page.evaluate('window.__home'), 2, 'and a fresh one is on its way');
await wait(600);
assert.deepStrictEqual(await page.evaluate(() => [...document.querySelectorAll('.cs-t')].map((e) => e.textContent)), ['Song 1.1', 'Song 1.2', 'Song 1.3'], 'open slips do not jump under the cursor');
await page.evaluate('window.__pressSearch()');
const fresh = await page.evaluate('window.__pressSearch()');
assert.deepStrictEqual(fresh.slips, ['Song 2.1', 'Song 2.2', 'Song 2.3'], 'next open has the fresh copy');
ok('an old copy shows at once, the fresh one comes next time');
await page.evaluate('window.__pressSearch()');

// sign-in replaces the guest shelf
await page.evaluate('window.__signedIn(true)');
await wait(600);
assert.strictEqual(await page.evaluate('window.__home'), 3);
assert.deepStrictEqual((await page.evaluate('window.__pressSearch()')).slips, ['Song 3.1', 'Song 3.2', 'Song 3.3']);
ok('a sign-in fetches again');
await page.close();

// search while the very first fetch is still out: fills in when it lands, no second fetch
page = await load({ held: true });
assert.deepStrictEqual((await page.evaluate('window.__pressSearch()')).slips, []);
await page.evaluate('window.__release()');
await page.waitForSelector('.cs-t', { state: 'attached', timeout: 15000 });
assert.deepStrictEqual(await page.evaluate(() => [...document.querySelectorAll('.cs-t')].map((e) => e.textContent)), ['Song 1.1', 'Song 1.2', 'Song 1.3']);
assert.strictEqual(await page.evaluate('window.__home'), 1);
ok('search during the first fetch fills in when it lands');
await page.close();

// the first fetch fails: the next summon tries again
page = await load({ failFirst: true });
await wait(600);
await page.evaluate('window.__open()');
assert.strictEqual(await page.evaluate('window.__home'), 2, 'retried at the summon');
await wait(600);
assert.deepStrictEqual((await page.evaluate('window.__pressSearch()')).slips, ['Song 2.1', 'Song 2.2', 'Song 2.3']);
ok('a failed fetch is tried again at the next summon');

await browser.close();
await server.close();
console.log('all good');
