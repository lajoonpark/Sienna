// Hover record after record at a rack: does the camera keep its distance (no creeping back), and does
// the suitcase tuck down while you browse and come back when the cursor goes near it?
//   node scripts/drift-check.mjs out_dir [rack]   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out = process.argv[2], at = Number(process.argv[3] ?? 0), port = Number(process.env.SIENNA_PORT) || 5243;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=0`);
await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 120000 });
await page.waitForTimeout(6000);
const read = () => page.evaluate(() => { const d = window.__siennaDebug; const o = d.camOffset; return { h: d.rack.hovered, off: Math.hypot(...o).toFixed(3), z: o[2].toFixed(3), tuck: d.tucked.toFixed(2) }; });
const spots = (process.env.SPOTS || '500,330 760,330 560,450 820,470 640,560 900,380').split(' ').map((p) => p.split(',').map(Number));
for (let round = 0; round < 4; round++) {
  for (const [x, y] of spots) {
    await page.mouse.move(x, y, { steps: 4 });
    await page.waitForTimeout(1500);
  }
  console.log('round', round, JSON.stringify(await read()));
}
await page.screenshot({ path: `${out}/tucked-${at}.png`, timeout: 240000 });
await page.mouse.move(120, 760, { steps: 6 });
await page.waitForTimeout(2500);
console.log('near case', JSON.stringify(await read()));
await page.screenshot({ path: `${out}/woken-${at}.png`, timeout: 240000 });
await b.close(); await server.close();
