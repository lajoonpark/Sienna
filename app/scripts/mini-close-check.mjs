// A search pick in the mini window still plays when the window is shut before the record is down.
// Loads mini.html (plain browser: fake record store, opens at once), picks a song the way search does
// (startSong + the drawer), shuts the window at several moments of the animation (drawer sliding out,
// record lifting, record flying) and checks the new song starts, the record is on the platter and the
// drawer is home. Also checks a pick left alone still plays when the arm lands.
// Usage: node scripts/mini-close-check.mjs      (SIENNA_PORT=5242)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert';

const port = Number(process.env.SIENNA_PORT) || 5242;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
let failed = false;

async function attempt(closeAt) {
  const page = await browser.newPage({ viewport: { width: 540, height: 620 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/mini.html?loadms=300`);
  await page.waitForFunction('!!window.__mini && window.__mini.phase === "open"');
  await page.waitForTimeout(1500);                 // the lid is open
  const r = await page.evaluate(async (closeAt) => {
    const { startSong } = await import('/src/suitcase.js');
    const { getCover } = await import('/src/racks/common.js');
    const m = window.__mini;
    const items = (await m.music.shelves()).shelves[0].items;
    let title = null;
    m.music.onState((s) => { title = s.title; });
    await new Promise((r) => setTimeout(r, 300));
    const before = title;
    const item = items.find((x) => x.title !== before);
    startSong(m.music, m.suitcase, item);
    m.tray.run(getCover(item.art, 512).tex);
    if (closeAt != null) {
      await new Promise((r) => setTimeout(r, closeAt * 1000));
      m.dismiss();
    }
    for (let i = 0; i < 100 && title !== item.title; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 400));
    return { want: item.title, got: title, phase: m.phase, tray: m.tray.active, flying: m.flights.active, seat: m.suitcase.seatHas, cue: m.suitcase.debug.cue };
  }, closeAt);
  await page.close();
  const label = closeAt == null ? 'left open' : `shut at ${closeAt}s`;
  try {
    assert.strictEqual(r.got, r.want, 'the picked song plays');
    assert.ok(!r.tray && !r.flying && r.seat && !r.cue, 'drawer home, record on the platter, nothing cued');
    if (closeAt != null) assert.strictEqual(r.phase, 'hidden');
    console.log('ok  ', label, JSON.stringify(r));
  } catch (e) {
    failed = true;
    console.log('FAIL', label, e.message, JSON.stringify(r));
  }
}

for (const at of [0.1, 0.6, 1.0, 1.6, null]) await attempt(at);
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
