// End-to-end check of the real app against YouTube Music (no account needed; guests get ads).
// Waits for shelves, flies to the crate table, sweeps the cursor over the rack, clicks a record, checks it plays,
// then pauses and skips with the keys (the suitcase's own controls are 3D, so the keyboard is the stable way).
// Usage (Linux server): npm run build && xvfb-run -a node scripts/e2e-electron.mjs out_dir
import { _electron as electron } from 'playwright';
const S = process.argv[2];
const app = await electron.launch({
  cwd: new URL('..', import.meta.url).pathname,   // app/, wherever the repo is checked out
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist', `--user-data-dir=${S}/ud`, '.'],
  timeout: 60000,
});
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let page;
for (let i = 0; i < 40 && !page; i++) {
  page = app.windows().find((w) => w.url().startsWith('file:'));
  if (!page) await new Promise((r) => setTimeout(r, 500));
}
page.on('console', (m) => log('[page]', m.text()));
page.on('pageerror', (e) => log('[pageerror]', e.message));
log('main window', page.url());
await page.waitForFunction(() => window.__siennaDebug?.shelves.length > 0, null, { timeout: 180000 });
log('shelves', await page.evaluate(() => window.__siennaDebug.shelves.map((s) => `${s.title}(${s.items.length})`).join(', ')));
// the intro ends at HOME; then fly to station 0 (the crate table) and wait until we are settled there
// (generous timeouts, so a slow machine still passes)
await page.waitForFunction(() => window.__siennaDebug.state.introDone, null, { timeout: 60000 });
await page.waitForFunction(() => window.__siennaDebug.state.settled, null, { timeout: 60000 }); // go() is ignored until the intro has handed over
await page.evaluate(() => window.__siennaDebug.go(0));
await page.waitForFunction(() => window.__siennaDebug.state.settled && window.__siennaDebug.state.at === 0, null, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 2500)); // the records drop in
const vp = await page.evaluate(() => [innerWidth, innerHeight]);
log('viewport', vp);
// sweep across the rack
for (let x = 0.3; x <= 0.7; x += 0.1) {
  await page.mouse.move(vp[0] * x, vp[1] * 0.5);
  await new Promise((r) => setTimeout(r, 600));
  log('x', x.toFixed(1), 'hovered', await page.evaluate(() => window.__siennaDebug.rack.hovered));
}
await page.mouse.move(vp[0] * 0.5, vp[1] * 0.5);
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${S}/e2e-hover.png` });
const idx = await page.evaluate(() => window.__siennaDebug.rack.hovered);
const item = await page.evaluate((i) => { const t = window.__siennaDebug.stations[0].shelf; const shelf = window.__siennaDebug.shelves.find((s) => s.title === t) ?? window.__siennaDebug.shelves[0]; return shelf.items[i]; }, idx);
log('clicking', idx, item?.title, JSON.stringify(item?.play));
await page.mouse.click(vp[0] * 0.5, vp[1] * 0.5);
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const p = await page.evaluate(() => window.__siennaDebug.player);
  log('state', p.videoId, p.playerState, p.adPlaying ? 'AD' : '', p.title, '-', p.artist, Math.round(p.position) + '/' + Math.round(p.duration));
  if (p.playerState === 1 && !p.adPlaying && p.videoId === item.play.videoId) break;
}
await page.screenshot({ path: `${S}/e2e-playing.png` });
// buttons
await page.keyboard.press('Space');
await new Promise((r) => setTimeout(r, 1200));
log('after Space', await page.evaluate(() => window.__siennaDebug.player.playerState));
await page.keyboard.press('Space');
await new Promise((r) => setTimeout(r, 1200));
log('after second Space', await page.evaluate(() => window.__siennaDebug.player.playerState));
await page.keyboard.press('ArrowRight'); // skip
await new Promise((r) => setTimeout(r, 4000));
const p2 = await page.evaluate(() => window.__siennaDebug.player);
log('after SKIP', p2.videoId, p2.title, p2.adPlaying ? 'AD' : '');
await page.screenshot({ path: `${S}/e2e-skip.png` });
await app.close();
