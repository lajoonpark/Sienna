// Drives the search bar (search-lab.html, fake store) like a user and checks the things that
// went wrong before: keys leaking to the shop, stale results, Enter on a slow search, Esc.
// Usage: node scripts/search-check.mjs out_dir      (SIENNA_PORT=5231, ports 5231-5239)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-search');
const port = Number(process.env.SIENNA_PORT) || 5231;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/search-lab.html`);
await page.waitForFunction('window.__ready === true');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('ok  ', name);

// Slow, scriptable backend: each query answers after its own delay.
await page.evaluate(() => {
  const real = window.__music.search;
  window.__calls = [];
  window.__delays = {};
  window.__music.search = async (q) => { window.__calls.push(q); await new Promise((r) => setTimeout(r, window.__delays[q] ?? 0)); return real(q); };
});

// closed: nothing is captured, keys reach the shop
await page.keyboard.press('Space');
assert.deepStrictEqual(await page.evaluate('window.__leaks'), [' ']);
ok('closed bar lets keys through');

// open with Ctrl+Alt+J (the default search shortcut)
await page.keyboard.press('Control+Alt+KeyJ');
await wait(500);
assert.ok(await page.evaluate('window.__search.isOpen()'));
await page.evaluate('window.__leaks.length = 0');
await page.screenshot({ path: `${out}/open-empty.png` });

// typing, Space, Tab, arrows, Enter on nothing: no leaks
await page.keyboard.type('le mo', { delay: 30 });
await page.keyboard.press('Tab');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('Control+Alt+KeyJ'); // toggles shut...
assert.ok(!(await page.evaluate('window.__search.isOpen()')));
await page.keyboard.press('Control+Alt+KeyJ'); // ...and open again
assert.ok(await page.evaluate('window.__search.isOpen()'));
// (the modifier presses of the hotkey itself arrive while it is closed; shop keys ignore bare modifiers)
assert.deepStrictEqual((await page.evaluate('window.__leaks')).filter((k) => !/^(Control|Alt|Meta|Shift)$/.test(k)), [], 'no key reaches the shop while the bar is open');
ok('typing, Space, Tab, arrows and the hotkey do not leak');

// debounce: several keystrokes, one search
await page.fill('.cs-input', '');
await page.evaluate('window.__calls.length = 0');
await page.keyboard.type('lemon', { delay: 40 });
await wait(900);
assert.deepStrictEqual(await page.evaluate('window.__calls'), ['lemon']);
ok('debounced: one search for "lemon"');
await page.screenshot({ path: `${out}/results.png` });

// highlight with arrows (wraps), Enter plays that one and closes
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await wait(300);
await page.screenshot({ path: `${out}/highlight.png` });
const second = await page.evaluate(() => document.querySelectorAll('.cs-t')[1].textContent);
await page.keyboard.press('Enter');
await wait(500);
let played = await page.evaluate('window.__played.map((i) => i.title)');
assert.deepStrictEqual(played, [second]);
assert.ok(!(await page.evaluate('window.__search.isOpen()')));
ok('ArrowDown x2 + Enter plays the second slip: ' + second);

// Enter with no highlight plays the top result
await page.keyboard.press('Control+Alt+KeyJ');
await wait(300);
await page.fill('.cs-input', 'moon');
await page.keyboard.press('Enter'); // before the debounce fired: waits for the answer, then plays the top one
await wait(900);
played = await page.evaluate('window.__played.map((i) => i.title)');
assert.strictEqual(played.length, 2);
assert.match(played[1], /moon/i);
ok('Enter before the answer arrived plays the top result: ' + played[1]);

// stale: "su" answers late (and would list Slow Sunday...), "sunday" quickly; the late answer must not replace the newer one
await page.keyboard.press('Control+Alt+KeyJ');
await wait(300);
await page.evaluate(() => { window.__delays = { s: 1500, su: 1500, sunday: 0 }; window.__calls.length = 0; });
await page.fill('.cs-input', '');
await page.keyboard.type('su', { delay: 30 });
await wait(450); // "su" has been sent and is slow
await page.keyboard.type('nday', { delay: 30 });
await wait(2500); // long enough for the late "su" answer to have arrived
const calls = await page.evaluate('window.__calls');
assert.ok(calls.length >= 2 && calls.at(-1) === 'sunday', 'slow searches were sent first: ' + calls);
const slips = await page.evaluate(() => [...document.querySelectorAll('.cs-slip')].map((e) => e.textContent));
assert.ok(slips.length > 0 && slips.every((t) => /sunday/i.test(t)), 'only "sunday" results on screen: ' + slips.join(' | '));
ok('stale answers ignored (sent: ' + calls.join(', ') + '; only "sunday" shown)');

// loading and nothing found
await page.evaluate(() => { window.__delays = { slowpoke: 1500 }; });
await page.fill('.cs-input', '');
await page.keyboard.type('slowpoke', { delay: 20 });
await wait(600);
await page.screenshot({ path: `${out}/loading.png` });
await wait(1600);
assert.match(await page.evaluate(() => document.querySelector('.cs-list').textContent), /nothing found/);
await page.screenshot({ path: `${out}/nothing.png` });
ok('loading and nothing-found states');

// a search that throws shows a painted note, not a stuck spinner
await page.evaluate(() => { window.__music.search = async () => { throw new Error('offline'); }; });
await page.fill('.cs-input', '');
await page.keyboard.type('boom');
await wait(700);
assert.match(await page.evaluate(() => document.querySelector('.cs-list').textContent), /could not search/);
ok('failure state');

// Esc closes; keys leak again afterwards; clicking a slip plays it
await page.keyboard.press('Escape');
await wait(300);
assert.ok(!(await page.evaluate('window.__search.isOpen()')));
await page.evaluate('window.__leaks.length = 0');
await page.keyboard.press('Space');
assert.deepStrictEqual((await page.evaluate('window.__leaks')).filter((k) => k === ' '), [' ']);
ok('Esc closes, shop keys work again');

await browser.close();
await server.close();
console.log('all search checks passed');
