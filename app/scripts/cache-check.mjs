// Still frames (src/still.js, `Still frames` in src/watercolour.js): when nothing in the shop moves,
// the painter stops painting the world and repaints only the suitcase's corner and the boiling border.
// This checks both halves of that:
//   1. it happens: once the shop has settled, with a record turning on the suitcase, frames are no longer
//      painted whole (painter.stats), and say what kept changing if they are;
//   2. it shows nothing different: a frame put together that way is, pixel for pixel, the frame a whole
//      repaint gives at the same moment.
//   node scripts/cache-check.mjs [at=home] [query=shelves=8]   (SIENNA_PORT, SIENNA_VIEWPORT=480x300, SIENNA_DPR)
// Without a GPU use  node scripts/cache-check.mjs home "hour=14" : a frame takes seconds there, so pin the
// hour (the light is worked out again every 5 s) and leave the store at its few shelves (fewer covers to wait for).
import { chromium } from 'playwright';
import { createServer } from 'vite';
const at = process.argv[2] ?? 'home', q = process.argv[3] ?? 'shelves=8';
const port = Number(process.env.SIENNA_PORT) || 5246;
const [vw, vh] = (process.env.SIENNA_VIEWPORT || '480x300').split('x').map(Number);
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: Number(process.env.SIENNA_DPR) || 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// deep=0: no deep idle (pacer.js), which holds the border's boil still; scripts/idle-check.mjs covers that
await page.goto(`http://127.0.0.1:${port}/index.html?at=${at}&deep=0&${q}`, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction(() => window.__siennaDebug?.state.settled && window.__siennaDebug.pacer, null, { timeout: 400000 });
// a song on, so the record turns (the fake store plays at once)
await page.evaluate(async () => { const d = window.__siennaDebug; const { shelves } = await d.music.shelves(); d.music.play(shelves[0].items[1]); });
// settled = every rack is out with its records dropped in, and every cover is painted and on the GPU (a
// resting cover's canvas is shrunk once it is uploaded, see slim in src/racks/common.js). Each of those is
// a real change to the picture. Under software rendering they take minutes: in a plain browser the fake
// store's covers are painted on the main thread, one a frame, and a frame takes seconds.
const SETTLE = Number(process.env.SETTLE || 900000);
const late = () => console.log('  (racks or covers were still arriving when the wait ran out)');
const racksOut = (slim) => page.waitForFunction((slim) => {
  const d = window.__siennaDebug;
  return d.stations.every((st, i) => !st.shelf || (d.racks[i]?.root.visible && d.racks[i].core.sleeves.every((s) => s.appear >= 1 && (!slim || s.small.tex.image.width === 1))));
}, slim, { timeout: SETTLE, polling: 1000 }).catch(late);
await racksOut(false);   // racks are built one a frame: only then are all their covers known
await page.evaluate((ms) => Promise.race([Promise.all(window.__siennaDebug.racks.map((r) => r?.ready())), new Promise((res) => setTimeout(res, ms))]), SETTLE);
await racksOut(true);
await page.waitForTimeout(8000);

let bad = 0;
const stats = () => page.evaluate(() => ({ ...window.__siennaDebug.painter.stats }));
// the next dozen frames (however long they take: software rendering can be seconds a frame)
// (and what changed in the world in the frames that were painted whole)
const sample = (n = 12, ms = 120000) => page.evaluate(async ({ n, ms }) => {
  const p = window.__siennaDebug.painter, a = { ...p.stats }, t0 = performance.now(), why = {};
  let d, fulls = a.full;
  do {
    await new Promise((res) => requestAnimationFrame(res));
    if (p.stats.full !== fulls) {
      fulls = p.stats.full;
      const o = p.why, l = p.last;
      const k = o ? `${o.type}#${o.id} in ${o.parent?.type}#${o.parent?.id}` : l.shadows ? 'shadows' : l.rest ? 'painter settings' : !l.valid ? 'invalidated' : l.overlay ? 'overlay outside its saved box' : 'camera / fog';
      why[k] = (why[k] || 0) + 1;
    }
    d = Object.fromEntries(Object.keys(a).map((k) => [k, p.stats[k] - a[k]]));
  } while (d.full + d.overlay + d.border + d.skipped < n && performance.now() - t0 < ms);
  if (d.full) d.why = why;
  return d;
}, { n, ms });
const home = at === 'home'; // at a rack the case is tucked away with its lid shut: nothing in it moves
const d = await sample();
console.log('frames at rest, record turning:', JSON.stringify(d));
if (d.full > 3) { bad++; console.log('  FAIL: the world is still being painted while nothing moves'); }
if (d.overlay + d.border + d.skipped < 3) { bad++; console.log('  FAIL: no frames were painted in part'); }

// pixel for pixel: the frame on screen (painted in part) against a whole repaint of the same moment
const compare = (want, n) => page.evaluate(async ({ want, n }) => {
  const d = window.__siennaDebug, r = d.renderer, gl = r.getContext(), p = d.painter;
  const w = r.domElement.width, h = r.domElement.height;
  const grab = () => { const px = new Uint8Array(w * h * 4); r.setRenderTarget(null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const out = [];
  for (let k = 0; k < n; k++) {
    // wait for a frame that was painted in part
    let before = { ...p.stats }, kind = null;
    for (let i = 0; i < 600 && !kind; i++) {
      await new Promise((res) => requestAnimationFrame(res));
      if (p.stats.overlay !== before.overlay) kind = 'overlay'; else if (p.stats.border !== before.border) kind = 'border';
      if (p.stats.full !== before.full || (kind && kind !== want)) kind = null;
      before = { ...p.stats };
    }
    if (!kind) { out.push({ kind: 'none' }); continue; }
    const part = grab();
    // the same moment again, whole: nothing has stepped since (same scene, same time)
    p.invalidate();
    p.render(d.scene, d.camera, d.lastFrame.t, d.suitcase.overlay);
    const whole = grab();
    let diff = 0, worst = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < part.length; i += 4) {
      const e = Math.max(Math.abs(part[i] - whole[i]), Math.abs(part[i + 1] - whole[i + 1]), Math.abs(part[i + 2] - whole[i + 2]));
      if (e > 0) { diff++; worst = Math.max(worst, e); const x = (i / 4) % w, y = Math.floor(i / 4 / w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    out.push({ kind, diff, worst, box: diff ? [x0, y0, x1, y1] : null });
  }
  return out;
}, { want, n });
const report = (list) => {
  for (const c of list) {
    console.log(`  ${c.kind.padEnd(8)} differing pixels: ${c.diff ?? '-'}${c.diff ? ` (worst ${c.worst}/255, in ${c.box})` : ''}`);
    if (c.kind === 'none' || c.diff > 0) bad++;
  }
};
if (home) {
  console.log('the suitcase redrawn alone (record turning) against a whole repaint:');
  report(await compare('overlay', 4));
}
// paused: the record winds down and stops, and only the border still boils
await page.evaluate(() => window.__siennaDebug.music.command('pause'));
await page.waitForTimeout(Number(process.env.SETTLE2 || 20000));
console.log('the border boiling alone (paused) against a whole repaint:');
report(await compare('border', 4));
const d2 = await sample(8, 60000);
console.log('frames at rest, paused:', JSON.stringify(d2));
if (d2.full > 2 || d2.overlay > 2) { bad++; console.log('  FAIL: more than the border is being painted while nothing moves'); }
console.log(bad ? `FAILED (${bad})` : 'ok');
await b.close(); await server.close();
process.exit(bad ? 1 : 0);
