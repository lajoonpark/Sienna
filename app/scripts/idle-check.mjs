// Does the shop drop to its idle frame rate when nothing moves, and go back to full rate on input?
// Prints pacer.idle samples at home and at a rack, before and after a mouse move.
//   node scripts/idle-check.mjs [rack]   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const at = process.argv[2] ?? 'home', port = Number(process.env.SIENNA_PORT) || 5243;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&wc=0${at === 'home' ? '' : `&at=${at}`}`);
await page.waitForFunction(() => window.__siennaDebug?.state.settled && window.__siennaDebug.pacer, null, { timeout: 180000 });
const sample = async (label, n = 12) => {
  const s = [];
  for (let i = 0; i < n; i++) { s.push(await page.evaluate(() => (window.__siennaDebug.pacer.idle ? 'i' : 'B'))); await page.waitForTimeout(500); }
  console.log(label.padEnd(14), s.join(''));
};
await sample('settling', 30);
await page.mouse.move(400, 250, { steps: 4 });
await sample('after move', 20);
await b.close(); await server.close();
