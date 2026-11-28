// Runs the real intro in real time with Auto cool-down on (?cool=1), collects main-thread long tasks
// (PerformanceObserver longtask), and fails on any task over 150 ms after the intro's first frame.
//   node scripts/hitch-check.mjs [query] [dpr]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { glArgs } from './safe.mjs';

const q = process.argv[2] ?? '';
const dpr = Number(process.argv[3] ?? 2);
const limit = Number(process.env.HITCH_MS) || 150;
const port = Number(process.env.SIENNA_PORT) || 5246;
const [vw, vh] = (process.env.SIENNA_VIEWPORT || '1440x900').split('x').map(Number);

const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: glArgs() });
const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.addInitScript(() => {
  window.__lt = [];
  window.__firstFrameEnd = null;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__lt.push({ start: Math.round(e.startTime), ms: Math.round(e.duration) });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => {
    const before = window.__siennaDebug?.painter?.stats.full ?? 0;
    cb(ts);
    if (window.__firstFrameEnd === null && (window.__siennaDebug?.painter?.stats.full ?? 0) > before) {
      window.__firstFrameEnd = Math.round(performance.now());
    }
  });
});

const baseQ = `shelves=8&guest&tour=0&cool=1&${q.includes('hour=') ? '' : 'hour=14&'}${q}`;
await page.goto(`http://127.0.0.1:${port}/index.html?${baseQ}`, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction(() => window.__siennaDebug?.state.introDone && window.__siennaDebug.state.settled, null, { timeout: 240000, polling: 500 });
await page.waitForTimeout(3000);

const res = await page.evaluate(() => ({
  firstFrameEnd: window.__firstFrameEnd,
  lt: window.__lt,
  sharp: window.__siennaDebug?.quality?.level,
  strokes: window.__siennaDebug?.painter?.strokes?.counts,
}));

await b.close();
await server.close();

const after = res.lt.filter((t) => res.firstFrameEnd !== null && t.start >= res.firstFrameEnd);
const bad = after.filter((t) => t.ms > limit);
console.log(`firstFrameEnd=${res.firstFrameEnd} ms, sharpness=${res.sharp}, strokes=${JSON.stringify(res.strokes)}`);
console.log('long tasks before/at first frame:', JSON.stringify(res.lt.filter((t) => res.firstFrameEnd === null || t.start < res.firstFrameEnd)));
console.log('long tasks after first frame:', JSON.stringify(after));
if (bad.length) {
  console.error(`FAIL: ${bad.length} task(s) over ${limit} ms after first frame:`, JSON.stringify(bad));
  process.exit(1);
}
console.log(`PASS: no task over ${limit} ms after intro's first frame`);
