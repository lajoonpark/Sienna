// Lists shader programs that get compiled after the intro starts (each one is a stall mid-animation).
//   node scripts/compile-check.mjs [query]
import { chromium } from 'playwright';
import { createServer } from 'vite';
const q = process.argv[2] ?? '';
const port = Number(process.env.SIENNA_PORT) || 5245;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&${q}`, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction(() => window.__siennaDebug?.state, null, { timeout: 600000, polling: 200 });
// the clock starts once warm-up is done: take the programs at the first drawn frame
await page.waitForFunction(() => window.__siennaDebug.renderer.info.render.frame > 0, null, { timeout: 600000, polling: 50 });
const keys = () => window.__siennaDebug.renderer.info.programs.map((p) => p.cacheKey);
const first = await page.evaluate(keys);
await page.waitForFunction(() => window.__siennaDebug.state.introDone && window.__siennaDebug.state.settled, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(4000);
const after = await page.evaluate(keys);
const had = new Set(first);
console.log('programs at start', first.length, 'after intro', after.length);
for (const k of after) if (!had.has(k)) console.log('LATE', k.slice(0, 400));
await b.close(); await server.close();
