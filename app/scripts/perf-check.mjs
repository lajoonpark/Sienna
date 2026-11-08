// Rough frame cost at a station: average frame time over a few seconds plus draw calls / triangles.
// SwiftShader is CPU rendering, so absolute ms mean little; compare before/after on the same machine.
//   node scripts/perf-check.mjs [at] [dpr] [query]   e.g. node scripts/perf-check.mjs 0 2 "wc=3"
import { chromium } from 'playwright';
import { createServer } from 'vite';
const at = Number(process.argv[2] ?? 0), dpr = Number(process.argv[3] ?? 1), q = process.argv[4] ?? '';
const port = Number(process.env.SIENNA_PORT) || 5243;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: dpr });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&${q}`, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 240000 });
console.log('settled after', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.waitForTimeout(6000);
const r = await page.evaluate(() => {
  const d = window.__siennaDebug;
  return { noShadow: d.profile(), withShadow: d.profile({ shadows: true }), buffer: [d.renderer.domElement.width, d.renderer.domElement.height] };
});
console.log(JSON.stringify(r));
await b.close(); await server.close();
