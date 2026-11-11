// Walks the first-run tour (src/tour.js) like a new user, in the shop with the fake store, and checks
// each step ends the way it should: the choices change the settings, a new lettering reloads the shop
// and carries on at the same step, playing a record moves on, the search shortcut gets its tick, the
// end is remembered, and Settings > Tour starts it again. Screenshots of every step go to out_dir.
// Usage: node scripts/tour-check.mjs [out_dir]      (SIENNA_PORT=5241)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-tour');
const port = Number(process.env.SIENNA_PORT) || 5241;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('ok  ', name);
const step = () => page.evaluate(() => window.__siennaDebug.tour.step);
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('sienna.tour') || 'null'));
const setting = (k) => page.evaluate((key) => JSON.parse(localStorage.getItem('sienna.settings') || '{}')[key], k);
// the floating words bob for ever, so Playwright would wait for them to hold still: click where they are
const press = async (label) => { await page.locator('.tr-stage:not(.tr-ghost) .st-w', { hasText: label }).first().click({ force: true }); await wait(400); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
async function open(query) {
  await page.goto(`http://127.0.0.1:${port}/?${query}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__siennaDebug?.tour && window.__siennaDebug.state.introDone, null, { timeout: 120000 });
  await wait(800);
}

// a plain browser (fake store, automation) never gets it on its own
await open('at=home');
assert.strictEqual(await step(), null);
ok('no tour on its own under automation');

await open('at=home&tour=new');
assert.strictEqual(await step(), 'welcome');
const fine = await page.locator('.tr-fine').innerText();
for (const w of ['makes no money', 'keeps nothing', 'YouTube Music chooses and plays them', 'github.com/lajoonpark/Sienna']) assert.ok(fine.includes(w), `small print says "${w}"`);
await shot('1-welcome');
ok('welcome note with the small print');

// the shop's keys stay quiet behind a note: Tab does not walk off
await page.keyboard.press('Tab');
await wait(300);
assert.strictEqual(await page.evaluate(() => window.__siennaDebug.nav.at), -1);
ok('Tab does not move the camera behind the note');

await press("Let's go");   // the fake store counts as signed in
assert.strictEqual(await step(), 'paint');
await press('Heavy watercolour');
assert.strictEqual(await setting('paint'), 3);
await shot('2-paint');
await press('Brush strokes');
assert.strictEqual(await setting('paint'), 4);
ok('painting choices apply');
await press('Next');
assert.strictEqual(await step(), 'letters');
assert.deepStrictEqual(await saved(), { step: 2, done: false });

// a new lettering reloads the shop: the tour carries on at the same step, without the Settings card
await Promise.all([page.waitForNavigation({ timeout: 120000 }), press('Caveat')]);
await page.waitForFunction(() => window.__siennaDebug?.tour?.step === 'letters', null, { timeout: 120000 });
await wait(800);
assert.strictEqual(await setting('font'), 'caveat');
assert.ok(!(await page.evaluate(() => location.search)).includes('settings'), 'no settings card after the reload');
await shot('3-letters');
ok('lettering reloads and the tour carries on');
await Promise.all([page.waitForNavigation({ timeout: 120000 }), press('Amatic')]);
await page.waitForFunction(() => window.__siennaDebug?.tour?.step === 'letters', null, { timeout: 120000 });
await wait(800);
await press('Next');
assert.strictEqual(await step(), 'smooth');
await press('30 fps');
assert.strictEqual(await setting('maxFps'), 30);
await press('60 fps');
await press('Next');
assert.strictEqual(await step(), 'record');
await shot('4-record');

// the record step leaves the shop's keys alone, and moves on once a song plays
await page.keyboard.press('Tab');
await wait(500);
assert.notStrictEqual(await page.evaluate(() => window.__siennaDebug.nav.at), -1);
ok('Tab walks to a shelf during the record step');
await page.keyboard.press('Escape');
await page.evaluate(() => { const d = window.__siennaDebug; d.music.play(d.shelves[0].items[0]); });
await page.waitForFunction(() => window.__siennaDebug.tour.step === 'player', null, { timeout: 10000 });
await wait(600);
await shot('5-player');
ok('playing a record moves on to the player');

await press('Got it');
assert.strictEqual(await step(), 'keys');
await page.keyboard.press('Control+Alt+KeyJ');
await wait(600);
assert.ok(await page.evaluate(() => window.__siennaDebug.search.isOpen()), 'search opened');
await page.keyboard.press('Escape');
await wait(600);
assert.strictEqual(await page.locator('.tr-tick.on').count(), 1, 'search got its tick');
assert.strictEqual(await step(), 'keys', 'Esc in the search bar does not end the tour');
await shot('6-keys');
ok('the search shortcut is ticked off');

// changing a shortcut from the tour
await press('+ K');
await page.keyboard.press('Control+Alt+KeyM');
await wait(400);
assert.ok((await page.locator('.tr-stage:not(.tr-ghost) .st-w', { hasText: '+ M' }).count()) === 1, 'mini player shortcut changed');
await press('+ M');
await page.keyboard.press('Control+Alt+KeyK');
await wait(400);
ok('a shortcut can be changed from the tour');

await press('Next');
assert.strictEqual(await step(), 'bye');
await shot('7-bye');
await press('Enjoy');
assert.strictEqual(await step(), null);
assert.deepStrictEqual(await saved(), { step: 0, done: true });
ok('the end is remembered');

await open('at=home&tour=new');
assert.strictEqual(await step(), null);
ok('not again after it was finished');

// Settings > Tour > Show it again
await page.keyboard.press('Control+Comma');
await wait(500);
await page.locator('.st-veil .st-w', { hasText: 'Show it again' }).click();
await wait(500);
assert.strictEqual(await step(), 'welcome');
await page.keyboard.press('Escape');
await wait(300);
assert.strictEqual(await step(), null);
ok('Settings starts it again, Esc ends it');

assert.deepStrictEqual(errors, []);
await browser.close();
await server.close();
console.log('tour-check passed, shots in', out);
