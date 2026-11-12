// Still cursor over a few spots at a rack: does the hover hold and the camera settle, or do they chase?
// Each sample is hovered:yaw:pivot px (the record the camera swings round should stay put on screen).
//   node scripts/focus-check.mjs out_dir [rack]   (SPOTS="x,y x,y", SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out = process.argv[2], at = Number(process.argv[3] ?? 0), port = Number(process.env.SIENNA_PORT) || 5241;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=0`);
await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 120000 });
await page.waitForTimeout(8000);
const spots = (process.env.SPOTS || '420,560 640,450 300,640 860,500').split(' ').map((p) => p.split(',').map(Number));
for (const [x, y] of spots) {
  await page.mouse.move(x - 30, y - 10); await page.mouse.move(x, y, { steps: 5 });
  const seq = [];
  for (let i = 0; i < 40; i++) {
    seq.push(await page.evaluate(() => { const d = window.__siennaDebug, f = d.focus; const o = d.orbit; return `${d.rack.hovered}:${f.yaw.toFixed(2)}:${o.aimed >= 0 ? o.pivotPx.map(Math.round).join(',') : '-'}`; }));
    await page.waitForTimeout(150);
  }
  const hs = seq.map((s) => s.split(':')[0]);
  const changes = hs.filter((h, i) => i && h !== hs[i - 1]).length;
  console.log(`spot ${x},${y} hover changes=${changes} final=${seq.at(-1)}\n  ${seq.join(' ')}`);
  await page.screenshot({ path: `${out}/at${at}-${x}-${y}.png`, timeout: 240000 });
}
await b.close(); await server.close();
