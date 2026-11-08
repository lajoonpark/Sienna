// Is a hovered record's name tag inside the frame, with the record still under the cursor? Hovers the lowest records of each rack with
// the mouse, waits for lift, zoom and rise to settle, prints where the tag's lowest corner lands.
//   node scripts/tag-frame-check.mjs [out_dir] [stations=0,1,2,3,4,5,6,7] [records per rack=3]   (SIENNA_PORT)
// pose-off-cursor = the rack's own hover pose leaves the cursor (not counted; the rise never should).
// Window is 730 px; tag top-bottom in px, line = the frame's safe line; rise = metres raised.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'tag-frame-out';
const stations = (process.argv[3] ?? '0,1,2,3,4,5,6,7').split(',').map(Number), n = Number(process.argv[4] ?? 3);
mkdirSync(out, { recursive: true });
const port = Number(process.env.SIENNA_PORT) || 5247;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
// SIENNA_GL=vulkan renders on the real GPU (much faster; adding --enable-features=Vulkan garbles screenshots); the default is software, for machines without one
const FAST = process.env.SIENNA_GL === 'vulkan';
const GL = FAST ? ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args: GL });
const W = 1170, H = 730, LIMIT = Math.round(((1 + 0.82) / 2) * H);
let cut = 0;
for (const at of stations) {
  const page = await b.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=${process.env.SIENNA_WC ?? 0}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 240000 });
  // the rack is built after the walk-in (and may be rebuilt once while loading); its records drop in one by one
  const dropped = () => page.waitForFunction(() => { const r = window.__siennaDebug.rack; return r?.root.visible && r.core.sleeves.length && r.core.sleeves.every((s) => s.hidden || (s.mesh.visible && s.drop < 0.01)); }, null, { timeout: 240000, polling: 500 });
  await dropped();
  await page.waitForTimeout(FAST ? 3000 : 10000);
  await dropped();
  // lowest records first, by where they stand on screen at rest; a real mouse hover, so the camera turns and zooms
  const spots = await page.evaluate((n) => {
    const d = window.__siennaDebug, cam = d.camera;
    cam.updateMatrixWorld();
    const ys = d.rack.core.sleeves.map((s, i) => {
      s.mesh.updateWorldMatrix(true, false);
      const v = s.mesh.getWorldPosition(cam.position.clone()).project(cam);
      return { k: i, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    }).filter((e, i) => !d.rack.core.sleeves[i].hidden && d.rack.core.sleeves[i].mesh.visible).filter((e) => e.x > 40 && e.x < innerWidth - 40 && e.y < innerHeight - 10);
    return ys.sort((a, c) => c.y - a.y).slice(0, n);
  }, n);
  for (const { x, y } of spots) {
    await page.mouse.move(600, 20);
    await page.waitForTimeout(FAST ? 1500 : 6000); // let the last record and the camera go home
    await page.mouse.move(x, y);
    await page.mouse.move(x + 1, y);
    // a cursor stopped dead while the camera is still heading home can stay frozen: nudge it until it catches
    let k = null, lastX = x;
    for (let t = 0; t < 12 && k === null; t++) {
      lastX = x + (t % 2 ? 6 : -6);
      await page.mouse.move(lastX, y);
      k = await page.waitForFunction(() => { const c = window.__siennaDebug.rack.core; return c.hovered >= 0 && c.sleeves[c.hovered].lift > 0.97 ? c.hovered : false; }, null, { timeout: 10000, polling: 200 }).then((h) => h.jsonValue()).catch(() => null);
    }
    if (k === null) { console.log(`st${at} at ${x | 0},${y | 0}: no hover`, await page.evaluate(() => { const c = window.__siennaDebug.rack.core; return { hovered: c.hovered, lift: c.sleeves[c.hovered]?.lift }; })); continue; }
    const measure = () => page.evaluate(({ k, mx, my }) => {
      const d = window.__siennaDebug, cam = d.camera, core = d.rack.core, t = core.tag, tag = t.mesh, s = core.sleeves[k];
      cam.updateMatrixWorld();
      tag.updateWorldMatrix(true, false);
      const px = (obj, x, y) => { const v = cam.position.clone().set(x, y, 0).applyMatrix4(obj.matrixWorld).project(cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
      const cardH = t.lines > 1 ? t.h2 : t.h;
      const corners = [-1, 1].flatMap((c) => [px(tag, c * t.w / 2, t.h / 2), px(tag, c * t.w / 2, t.h / 2 - cardH)]);
      const rec = [-1, 1].flatMap((c) => [-1, 1].map((e) => px(s.mesh, c * s.size / 2, e * s.size / 2)));
      const xs = rec.map((p) => p[0]), ys = rec.map((p) => p[1]);
      return { y: Math.round(Math.max(...corners.map((p) => p[1]))), top: Math.round(Math.min(...corners.map((p) => p[1]))), recBottom: Math.round(Math.max(...ys)),
        on: mx >= Math.min(...xs) && mx <= Math.max(...xs) && my >= Math.min(...ys) && my <= Math.max(...ys), rise: s.fit ?? 0, flip: !!core.tagFlip, hovered: core.hovered };
    }, { k, mx: lastX, my: y });
    // zoom and rise take many slow frames here: measure once the tag has stopped moving
    let r = await measure(), last;
    for (let t = 0; t < 15; t++) {
      await page.waitForTimeout(FAST ? 1500 : 6000);
      last = r; r = await measure();
      if (Math.abs(r.y - last.y) <= 1 && t >= 1) break;
    }
    const bad = r.y > LIMIT + 2 ? 'CUT' : r.top < 0 ? 'ABOVE' : !r.on && r.rise > 0.005 ? 'RISE-OFF-CURSOR' : r.recBottom > H ? 'RECORD-CUT' : 'ok';
    if (bad !== 'ok') cut++;
    console.log(`st${at} #${k}: tag ${r.top}-${r.y} (line ${LIMIT}) ${r.flip ? 'above' : 'below'} record bottom ${r.recBottom} cursor y ${y | 0} rise=${r.rise.toFixed(3)} ${r.on ? '' : 'pose-off-cursor '}${bad}`);
    if (bad !== 'ok' || r.flip) await page.screenshot({ path: `${out}/st${at}-${k}.jpg`, type: 'jpeg', quality: 80, timeout: 240000 }).catch(() => {});
  }
  await page.close();
}
console.log(`records with a problem: ${cut}`);
await b.close();
await server.close();
process.exit(0);
