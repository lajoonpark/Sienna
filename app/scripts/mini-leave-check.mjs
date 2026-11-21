// The mini window shuts when the cursor leaves it (Settings > Playback > Mini player, on by default),
// but only once the cursor has been over it since it opened. Loads mini.html (plain browser: fake record
// store, opens at once) and checks: a cursor that starts outside and stays outside leaves it open; coming
// in and going out shuts it; a drag on the knob carried outside shuts it on release, not before; with the
// setting off, leaving keeps it open.
// Usage: node scripts/mini-leave-check.mjs      (SIENNA_PORT=5243; SIENNA_ANGLE=swiftshader without a GPU)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert';

const port = Number(process.env.SIENNA_PORT) || 5243;
const angle = process.env.SIENNA_ANGLE || 'vulkan';
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
let failed = false;

async function open({ autoClose } = {}) {
  const page = await browser.newPage({ viewport: { width: 540, height: 620 } });
  page.setDefaultTimeout(120000);                  // SwiftShader is slow to load the lounge
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  if (autoClose != null) {
    await page.addInitScript((v) => localStorage.setItem('sienna.settings', JSON.stringify({ miniAutoClose: v })), autoClose);
  }
  await page.goto(`http://127.0.0.1:${port}/mini.html?loadms=300`);
  await page.waitForFunction('!!window.__mini && window.__mini.phase === "open"');
  await page.waitForTimeout(1500);                 // the lid is open
  return page;
}
const phase = (page) => page.evaluate(() => window.__mini.phase);
const settle = (page) => page.waitForTimeout(1500);

async function check(label, fn) {
  try {
    await fn();
    console.log('ok  ', label);
  } catch (e) {
    failed = true;
    console.log('FAIL', label, e.message);
  }
}

await check('starts outside, stays outside: open', async () => {
  const page = await open();
  await page.mouse.move(-30, 300);                 // headless Chromium puts the cursor at (0, 0): take it out,
  await page.evaluate(async () => {                // then shut and summon the card again with the cursor beside it
    window.__mini.dismiss();
    while (window.__mini.phase !== 'hidden') await new Promise((r) => setTimeout(r, 50));
    window.__mini.summon();
  });
  await page.waitForTimeout(1500);
  assert.ok(!(await page.evaluate(() => window.__mini.pointerIn)), 'cursor not counted as in');
  await page.mouse.move(-60, 320, { steps: 5 });
  await page.mouse.move(-30, 700, { steps: 5 });
  await settle(page);
  assert.strictEqual(await phase(page), 'open');
  await page.mouse.move(270, 310, { steps: 8 });   // comes in late: now leaving shuts it
  assert.ok(await page.evaluate(() => window.__mini.pointerIn), 'cursor counted as in');
  await page.mouse.move(-30, 310, { steps: 8 });
  await settle(page);
  assert.strictEqual(await phase(page), 'hidden');
  await page.close();
});

await check('in, then out: shuts', async () => {
  const page = await open();
  await page.mouse.move(270, 310);
  await page.mouse.move(400, 200, { steps: 5 });
  assert.strictEqual(await phase(page), 'open');
  await page.mouse.move(600, 200, { steps: 5 });
  await settle(page);
  assert.strictEqual(await phase(page), 'hidden');
  await page.close();
});

await check('drag carried outside: shuts on release', async () => {
  const page = await open();
  const k = await page.evaluate(() => window.__mini.screenOf('knob'));
  await page.mouse.move(k.x, k.y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(k.x, k.y - 20, { steps: 4 });
  assert.ok(await page.evaluate(() => window.__mini.suitcase.dragging), 'knob is being dragged');
  await page.mouse.move(k.x, -40, { steps: 8 });
  await page.waitForTimeout(400);
  assert.strictEqual(await phase(page), 'open', 'still open mid-drag');
  await page.mouse.up();
  await settle(page);
  assert.strictEqual(await phase(page), 'hidden');
  await page.close();
});

await check('setting off: leaving keeps it open', async () => {
  const page = await open({ autoClose: false });
  await page.mouse.move(270, 310);
  await page.mouse.move(-30, 310, { steps: 8 });
  await settle(page);
  assert.strictEqual(await phase(page), 'open');
  await page.close();
});

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
