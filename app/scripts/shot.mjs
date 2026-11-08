// Render the scene at given times with headless Chromium. Usage: node scripts/shot.mjs out_dir t1 t2 ...
// The page must set window.__ready and window.__seek(t) in ?shot mode.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const [outDir = '/tmp/sienna-shots', ...times] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
// SIENNA_PORT lets several screenshot runs work at once
const port = Number(process.env.SIENNA_PORT) || 5199;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
// SIENNA_VIEWPORT=1024x640 shoots at another window size (default 1280x720)
const [vw, vh] = (process.env.SIENNA_VIEWPORT || '1280x720').split('x').map(Number);
// SIENNA_DPR=2 shoots like a Retina screen
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: Number(process.env.SIENNA_DPR) || 1 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const query = process.env.SIENNA_QUERY ? `&${process.env.SIENNA_QUERY}` : '';
// SIENNA_PAGE=lab.html (or mini.html...) shoots another page of the app instead of the shop
const pageName = process.env.SIENNA_PAGE || '';
// brush mode places its strokes during load, which takes a moment
await page.goto(`http://127.0.0.1:${port}/${pageName}?shot${query}`, { timeout: 180000 });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
for (const t of (times.length ? times : ['0', '3', '5', '8'])) {
  await page.evaluate((s) => window.__seek(s), Number(t));
  const file = `${outDir}/t${t}.png`;
  await page.screenshot({ path: file, timeout: 180000 });
  console.log('wrote', file);
}
await browser.close();
await server.close();
