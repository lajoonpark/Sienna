// Settings > Account and the rail, in the shop with the fake store (two pretend accounts): who is signed
// in, switching, sign out (with its confirm), the guest page, Up/Down through the rail, a narrow window.
// Screenshots of each go to out_dir. Usage: node scripts/account-check.mjs out_dir   (SIENNA_PORT=5233)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-account-check');
if (!out) { console.log('usage: node scripts/account-check.mjs out_dir'); process.exit(2); }
const port = Number(process.env.SIENNA_PORT) || 5233;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => { console.log('[pageerror]', e.message); errors.push(e.message); });
const wait = (ms) => page.waitForTimeout(ms);
const name = () => page.locator('.st-page.on .st-name').first().textContent();
const at = () => page.evaluate(() => document.querySelector('.st-page.on')?.dataset.page);

await page.goto(`http://127.0.0.1:${port}/?at=home&tour=0&settings=account`, { timeout: 180000 });
await page.waitForSelector('.st-veil.show', { timeout: 120000 });
await wait(2500);
console.log('webgl:', await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const d = g?.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; }));
assert.strictEqual(await at(), 'account');
assert.strictEqual(await name(), 'Sienna Lane');
await page.screenshot({ path: `${out}/1-account.png` });
console.log('ok   signed in as the first account');

await page.locator('.st-page.on .st-alt .st-w', { hasText: 'Lemon Grove' }).click();
await wait(1200);
assert.strictEqual(await name(), 'Lemon Grove Records');
assert.ok(await page.locator('.st-page.on .st-alt .st-w', { hasText: 'Sienna Lane' }).isVisible(), 'the other account is offered back');
console.log('ok   switched');

await page.locator('.st-page.on .st-w', { hasText: /^Sign out$/ }).click();
await wait(600);
assert.ok(await page.locator('.st-confirm.on').isVisible(), 'asks first');
await page.screenshot({ path: `${out}/2-confirm.png` });
await page.locator('.st-w', { hasText: 'Keep me in' }).click();
await wait(300);
assert.ok(!(await page.locator('.st-confirm.on').count()), 'Keep me in backs out');
await page.locator('.st-page.on .st-w', { hasText: /^Sign out$/ }).click();
await page.locator('.st-w', { hasText: 'Yes, sign out' }).click();
await wait(1200);
assert.strictEqual(await name(), 'Not signed in');
assert.ok(await page.locator('.st-page.on .st-w', { hasText: /^Sign in$/ }).isVisible(), 'offers sign in');
await page.screenshot({ path: `${out}/3-guest.png` });
console.log('ok   signed out, guest page');

await page.locator('.st-page.on .st-w', { hasText: /^Sign in$/ }).click();
await wait(1200);
assert.strictEqual(await name(), 'Sienna Lane');
console.log('ok   signed back in');

await page.keyboard.press('ArrowDown');
await wait(800);
assert.strictEqual(await at(), 'look');
await page.screenshot({ path: `${out}/4-look.png` });
for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
await wait(800);
assert.strictEqual(await at(), 'shortcuts');
await page.screenshot({ path: `${out}/5-shortcuts.png` });
await page.keyboard.press('ArrowUp');
assert.strictEqual(await at(), 'performance');
console.log('ok   Up/Down move through the rail');

await page.keyboard.press('Escape');
await wait(400);
await page.keyboard.press('Control+Comma');
await wait(600);
assert.strictEqual(await at(), 'performance', 'opens where it was left');
console.log('ok   reopens on the same page');

await page.setViewportSize({ width: 700, height: 600 });
await wait(800);
const fits = await page.evaluate(() => { const c = document.querySelector('.st-card').getBoundingClientRect(); return c.right <= innerWidth + 1 && c.bottom <= innerHeight + 1; });
assert.ok(fits, 'card fits a small window');
await page.screenshot({ path: `${out}/6-narrow.png` });
console.log('ok   small window');

assert.deepStrictEqual(errors, []);
await browser.close();
await server.close();
console.log('all ok, shots in', out);
