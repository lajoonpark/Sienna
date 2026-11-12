// Bakes the shop's brush strokes ahead of time (other-optimizations branch, C1) into app/strokes/shop.bin.gz,
// which the app reads on a first start instead of placing them itself (~2.8 s on the RX 550; see
// src/strokecache.js). The file says which shop it was baked from (a fingerprint of the scene, the views and
// the stroke settings): after a change to the street, the shop or brushstrokes.js the app bakes for itself
// again until this is run again. Runs the shop headless on the GPU.
//   node scripts/bake-strokes.mjs        (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { gzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
const port = Number(process.env.SIENNA_PORT) || 5250;
const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?at=home&guest&tour=0&strokecache=0&bakeexport`, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction(() => window.__siennaDebug?.painter?.strokeExport, null, { timeout: 300000 });
const b64 = await page.evaluate(() => {
  const u8 = window.__siennaDebug.painter.strokeExport;
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
});
const raw = Buffer.from(b64, 'base64');
const gz = gzipSync(raw, { level: 9 });
mkdirSync(new URL('../strokes/', import.meta.url), { recursive: true });
writeFileSync(new URL('../strokes/shop.bin.gz', import.meta.url), gz);
const head = JSON.parse(raw.subarray(4, 4 + raw.readUInt32LE(0)).toString());
console.log(`strokes/shop.bin.gz: ${(gz.length / 1e6).toFixed(1)} MB (${(raw.length / 1e6).toFixed(1)} MB raw), fingerprint ${head.fingerprint}, strokes ${head.layers.map((l) => l.count).join(' / ')}`);
await b.close(); await server.close();
