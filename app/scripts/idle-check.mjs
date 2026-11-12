// Does the shop drop to its idle frame rate when nothing moves, then to deep idle (2 looks a second, the
// border's boil held, nothing drawn), and go back to full rate on input?
// Prints pacer samples (B busy, i idle, d deep idle) and how many frames were drawn whole / border-only / skipped.
//   node scripts/idle-check.mjs [rack]   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const at = process.argv[2] ?? 'home', port = Number(process.env.SIENNA_PORT) || 5243;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&tour=0&guest${at === 'home' ? '' : `&at=${at}`}`);
await page.waitForFunction(() => window.__siennaDebug?.state.settled && window.__siennaDebug.pacer, null, { timeout: 180000 });
const sample = async (label, n = 12) => {
  const s = [];
  const st0 = await page.evaluate(() => ({ ...window.__siennaDebug.painter.stats }));
  for (let i = 0; i < n; i++) { s.push(await page.evaluate(() => { const p = window.__siennaDebug.pacer; return p.deep ? 'd' : p.idle ? 'i' : 'B'; })); await page.waitForTimeout(500); }
  const st = await page.evaluate(() => ({ ...window.__siennaDebug.painter.stats }));
  const drawn = Object.fromEntries(Object.keys(st).map((k) => [k, st[k] - st0[k]]));
  console.log(label.padEnd(14), s.join(''), JSON.stringify(drawn));
};
await sample('settling', 30);
await page.mouse.move(400, 250, { steps: 4 });
await sample('after move', 20);
await b.close(); await server.close();
