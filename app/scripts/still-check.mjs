// Does the paint sit still when nothing moves? Renders one view at two different times and counts the
// pixels that changed, overall and inside the ragged border (which boils on purpose). Usage: node scripts/still-check.mjs out_dir "query" [t1] [t2]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { outDir as safeOutDir } from './safe.mjs';

const [outArg, query = 'hour=12&shelves=8&at=home', a = '20', b = '20.7'] = process.argv.slice(2);
const outDir = safeOutDir(outArg, 'sienna-still');
const port = Number(process.env.SIENNA_PORT) || 5197;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/?shot&${query}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
const shots = [];
for (const t of [a, b]) {
  await page.evaluate((s) => window.__seek(s), Number(t));
  const file = `${outDir}/t${t}.png`;
  await page.screenshot({ path: file, timeout: 240000 });
  shots.push(`data:image/png;base64,${readFileSync(file).toString('base64')}`);
}
const result = await page.evaluate(async ([u, v]) => {
  const pixels = async (src) => {
    const i = new Image(); i.src = src; await i.decode();
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
    const g = c.getContext('2d'); g.drawImage(i, 0, 0);
    return g.getImageData(0, 0, i.width, i.height).data;
  };
  const [p, q] = await Promise.all([pixels(u), pixels(v)]);
  let changed = 0, big = 0, worst = 0, inside = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const BORDER = 56; // px at 720 tall: the border's deepest reach (0.045 fade + 0.025 rag of the height) and a little
  const W = 1280, H = p.length / 4 / W;
  for (let k = 0; k < p.length; k += 4) {
    const d = Math.max(Math.abs(p[k] - q[k]), Math.abs(p[k + 1] - q[k + 1]), Math.abs(p[k + 2] - q[k + 2]));
    const x = (k / 4) % W, y = Math.floor(k / 4 / W);
    if (d > 2) changed++;
    if (d > 2 && x >= BORDER && x < W - BORDER && y >= BORDER && y < H - BORDER) inside++;
    if (d > 16) { big++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (d > worst) worst = d;
  }
  const n = p.length / 4;
  return { changedPct: +(100 * changed / n).toFixed(3), insidePct: +(100 * inside / n).toFixed(3), bigPct: +(100 * big / n).toFixed(3), worst, bigBox: [x0, y0, x1, y1] };
}, shots);
console.log(JSON.stringify(result));
await browser.close();
await server.close();
