// Covers that have left the racks are let go of, and nothing that is still shown ever is.
// The shop used to keep every resting (256 px) cover for as long as its window was open, so each restock,
// search and queue left its pictures on the GPU. This drives racks/common.js trimCovers in the real shop
// (fake store, every station filled, the crate table in view) and checks that:
//   - covers nothing shows go, and their textures leave the GPU; covers on the racks stay;
//   - one asked for a moment ago stays (a record in flight holds its cover for seconds);
//   - one a material in the scene shows stays, without being told about it;
//   - a cover let go of by mistake while a sleeve still shows it comes back by itself, painted as before.
// Usage: node scripts/covers-check.mjs [out_dir]      (SIENNA_PORT=5255, SIENNA_ANGLE)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { outDir, glArgs } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-covers');
const port = Number(process.env.SIENNA_PORT) || 5255;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: glArgs() });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pass = (text) => console.log(`PASS ${text}`);
try {
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=0&wc=0&hour=12&tour=0`, { timeout: 180000 });
  await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 240000 });
  await page.waitForFunction(() => {
    const d = window.__siennaDebug;
    return d.racks.filter(Boolean).length >= 8 && d.racks.every((r) => !r || (r.root.visible && r.core.sleeves.every((s) => s.hidden || s.drop < 0.01)));
  }, null, { timeout: 240000, polling: 500 });
  await page.evaluate(() => Promise.all(window.__siennaDebug.racks.map((r) => r?.ready())));
  await page.mouse.move(640, 300);
  await page.waitForTimeout(2500);

  // helpers in the page: the same module instance the shop uses
  await page.evaluate(async () => {
    const common = await import('/src/racks/common.js');
    const d = window.__siennaDebug;
    const paint = (i) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = `hsl(${(i * 47) % 360} 60% 50%)`;
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#fff';
      g.fillText(String(i), 8, 30);
      return c.toDataURL('image/png');
    };
    let made = 0;
    window.__covers = {
      common,
      // n covers nothing shows, painted; onGpu() once the shop has uploaded them ahead of time
      async make(n) {
        const list = this.last = Array.from({ length: n }, () => common.getCover(paint(++made), 256));
        await Promise.all(list.map((e) => e.loaded));
        return list;
      },
      onGpu: () => window.__covers.last.every((e) => !!d.renderer.properties.get(e.tex).__webglTexture),
      // let go of what can go, and say how many textures that took off the GPU (the shop makes others of
      // its own meanwhile, so the count is taken right round the call)
      trim(opts) {
        const before = d.renderer.info.memory.textures;
        const gone = d.covers.trim(opts);
        return { gone, freed: before - d.renderer.info.memory.textures };
      },
      sleeves: () => d.racks.flatMap((r) => r?.core.sleeves ?? []),
      // the picture as it is on screen, small
      snap() {
        const c = document.createElement('canvas');
        c.width = 320; c.height = 190;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(d.renderer.domElement, 0, 0, 320, 190);
        return g.getImageData(0, 0, 320, 190).data;
      },
      // mean difference (0..255) between two snaps over the records on the table: blank paper sleeves there
      // are tens apart from painted ones, the camera coming to rest a hair off is a few
      diff(a, b, [x0, y0, x1, y1] = [40, 80, 262, 136]) {
        let sum = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * 320 + x) * 4;
          sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        }
        return sum / ((x1 - x0) * (y1 - y0) * 3);
      },
      // the same records as blank paper sleeves, for comparison: what "they did not come back" looks like
      blank(a) {
        const out = new Uint8ClampedArray(a);
        for (let y = 80; y < 136; y++) for (let x = 40; x < 262; x++) out.set([217, 203, 178], (y * 320 + x) * 4);
        return out;
      },
    };
  });
  const stats = () => page.evaluate(() => window.__siennaDebug.covers.stats());
  const frames = (n = 12) => page.evaluate((n) => new Promise((res) => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : res()); step(); }), n);

  // ---- the racks' own covers are never let go of ----
  const start = await stats();
  const shown = await page.evaluate(() => new Set(window.__covers.sleeves().map((s) => s.small)).size);
  assert.ok(start.small >= shown && shown > 40, `the racks show ${shown} covers, ${start.small} are kept`);
  assert.equal(await page.evaluate(() => window.__siennaDebug.covers.trim({ idleMs: 0 })), start.small - shown, 'only covers no sleeve shows go');
  const base = await stats();
  assert.equal(base.small, shown);
  pass(`racks: ${shown} covers on show, none of them let go of`);

  // ---- covers nothing shows go, and leave the GPU ----
  await page.evaluate(() => window.__covers.make(30));
  await page.waitForFunction(() => window.__covers.onGpu(), null, { timeout: 20000 });
  assert.equal((await stats()).small, shown + 30);
  assert.deepEqual(await page.evaluate(() => window.__covers.trim()), { gone: 0, freed: 0 }, 'asked for a moment ago: kept');
  assert.equal((await stats()).small, shown + 30);
  assert.deepEqual(await page.evaluate(() => window.__covers.trim({ idleMs: 0 })), { gone: 30, freed: 30 }, 'gone, and their textures off the GPU');
  assert.equal((await stats()).small, shown);
  pass('30 covers nothing shows: kept while fresh, then let go of, textures freed');

  // ---- a cover some material in the scene shows stays, unasked ----
  await page.evaluate(async () => {
    const d = window.__siennaDebug, T = d.THREE;
    const [e] = await window.__covers.make(1);
    const mesh = new T.Mesh(new T.PlaneGeometry(0.01, 0.01), new T.MeshBasicMaterial({ map: e.tex }));
    mesh.position.set(0, -50, 0);
    d.scene.add(mesh);
    window.__covers.loose = mesh;
  });
  assert.equal(await page.evaluate(() => window.__siennaDebug.covers.trim({ idleMs: 0 })), 0, 'shown by a mesh in the scene: kept');
  await page.evaluate(() => { const m = window.__covers.loose; m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); });
  assert.equal(await page.evaluate(() => window.__siennaDebug.covers.trim({ idleMs: 0 })), 1);
  pass('a cover on a mesh in the scene is found and kept; gone once the mesh is');

  // ---- let go of by mistake while still shown: it comes back by itself ----
  // (the cursor rests above the records: with none held up the camera comes back to exactly the same view)
  await page.mouse.move(640, 80);
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__covers.before = window.__covers.snap(); });
  await page.screenshot({ path: `${out}/1-before.png` });
  // no roots, no keep: all of them (counted in the same task: the next frame drawn already wakes some)
  const dropped = await page.evaluate(() => ({ gone: window.__covers.common.trimCovers({ idleMs: 0 }), left: window.__siennaDebug.covers.stats().small }));
  assert.ok(dropped.gone >= shown, `all ${shown} on the racks were let go of (${dropped.gone})`);
  assert.equal(dropped.left, 0);
  await page.mouse.move(700, 110, { steps: 4 });   // the camera leans: the shop is drawn again
  await page.waitForFunction((n) => window.__siennaDebug.covers.stats().small >= n, shown - 0, { timeout: 30000 }).catch(() => {});
  // racks out of view are not drawn, so theirs wake when they are next seen: the one in view must be back
  const inView = await page.evaluate(() => {
    const d = window.__siennaDebug;
    return d.rack.core.sleeves.filter((s) => s.mesh.visible).map((s) => ({ asleep: s.small.asleep, kept: d.covers.stats().small > 0 }));
  });
  assert.ok(inView.length > 5 && inView.every((s) => !s.asleep), `the rack in view has its ${inView.length} covers back`);
  await page.evaluate(() => Promise.all(window.__siennaDebug.rack.core.sleeves.map((s) => s.small.loaded)));
  await page.mouse.move(640, 80, { steps: 4 });
  await page.waitForTimeout(3000);
  await frames();
  await page.screenshot({ path: `${out}/2-woken.png` });
  const { off, blank } = await page.evaluate(() => {
    const c = window.__covers, now = c.snap();
    return { off: c.diff(c.before, now), blank: c.diff(c.before, c.blank(c.before)) };
  });
  assert.ok(blank > 40, `the check can tell blank sleeves from painted ones (${blank.toFixed(1)} apart)`);
  assert.ok(off < blank / 4, `the records are painted as they were (${off.toFixed(1)} of 255 apart; blank sleeves would be ${blank.toFixed(1)})`);
  pass(`covers let go of while still on the rack came back by themselves, painted as before (${off.toFixed(1)} / 255 apart, blank sleeves ${blank.toFixed(1)})`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('all cover checks passed');
} finally {
  await browser.close();
  await server.close();
}
