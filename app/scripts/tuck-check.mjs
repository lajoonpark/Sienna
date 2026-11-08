// Does the tucked suitcase wake only when the cursor is ON the strip (not just near it)?
// Parks the cursor at points above and on the strip, prints how tucked the case is after each.
//   node scripts/tuck-check.mjs out_dir [rack]   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out = process.argv[2], at = Number(process.argv[3] ?? 1), port = Number(process.env.SIENNA_PORT) || 5243;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=0`);
await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 120000 });
const tuck = () => page.evaluate(() => window.__siennaDebug.tucked.toFixed(2));
await page.mouse.move(700, 300, { steps: 3 });
await page.waitForTimeout(4000);
console.log('away', await tuck());
await page.screenshot({ path: `${out}/tucked-${at}.png`, timeout: 240000 });
for (const y of (process.env.YS || '600 660 700 730 760 785').split(' ').map(Number)) {
  await page.mouse.move(700, 300, { steps: 2 });
  await page.waitForTimeout(2500);
  await page.mouse.move(200, y, { steps: 4 });
  await page.waitForTimeout(1500);
  console.log(`cursor 200,${y}`, await tuck());
}
await b.close(); await server.close();
