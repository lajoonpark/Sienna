// Does the hovered record stay under the cursor the whole way up? Hovers records spread over each rack
// with a real mouse (camera turn and zoom included), samples the record's on-screen box while it lifts
// and after it settles, and prints how far inside it the cursor was at worst.
//   SIENNA_GL=vulkan node scripts/cursor-check.mjs [out_dir] [stations=0,1,2,3,4,5,6,7] [records per rack=6]   (SIENNA_PORT, SIENNA_WC)
// inside = the cursor's distance from the record's nearest edge, as a share of the record's size on
// screen (0.5 = dead centre, < 0 = off the record), px the same in pixels. OFF = more than 2 px off at some point.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'cursor-out';
const stations = (process.argv[3] ?? '0,1,2,3,4,5,6,7').split(',').map(Number), n = Number(process.argv[4] ?? 6);
mkdirSync(out, { recursive: true });
const port = Number(process.env.SIENNA_PORT) || 5248;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const FAST = process.env.SIENNA_GL !== 'swiftshader';
const GL = FAST ? ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args: GL });
const W = 1170, H = 730;
let off = 0, total = 0;
for (const at of stations) {
  const page = await b.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=${process.env.SIENNA_WC ?? 0}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 240000 });
  const dropped = () => page.waitForFunction(() => { const r = window.__siennaDebug.rack; return r?.root.visible && r.core.sleeves.length && r.core.sleeves.every((s) => s.hidden || (s.mesh.visible && s.drop < 0.01)); }, null, { timeout: 240000, polling: 500 });
  await dropped();
  await page.waitForTimeout(FAST ? 3000 : 10000);
  await dropped();
  // records spread over the rack, by their rest spot on screen
  const spots = await page.evaluate((n) => {
    const d = window.__siennaDebug, cam = d.camera, ss = d.rack.core.sleeves;
    cam.updateMatrixWorld();
    const all = ss.map((s, i) => {
      s.mesh.updateWorldMatrix(true, false);
      const v = s.mesh.getWorldPosition(cam.position.clone()).project(cam);
      return { k: i, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    }).filter((e) => !ss[e.k].hidden && ss[e.k].mesh.visible && e.x > 40 && e.x < innerWidth - 40 && e.y > 40 && e.y < innerHeight - 10);
    const step = Math.max(1, all.length / n);
    return Array.from({ length: Math.min(n, all.length) }, (_, j) => all[Math.floor(j * step)]);
  }, n);
  for (const { x, y } of spots) {
    await page.mouse.move(600, 10);
    await page.waitForTimeout(FAST ? 1500 : 6000);
    await page.mouse.move(x, y);
    await page.mouse.move(x + 1, y);
    const k = await page.waitForFunction(() => { const c = window.__siennaDebug.rack.core; return c.hovered >= 0 ? c.hovered : false; }, null, { timeout: 10000, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
    if (k === null) { console.log(`st${at} at ${x | 0},${y | 0}: no hover`); continue; }
    const measure = () => page.evaluate(({ k, mx, my }) => {
      const d = window.__siennaDebug, cam = d.camera, s = d.rack.core.sleeves[k];
      cam.updateMatrixWorld();
      s.mesh.updateWorldMatrix(true, false);
      const px = (x, y) => { const v = cam.position.clone().set(x, y, 0).applyMatrix4(s.mesh.matrixWorld).project(cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => px(a * s.size / 2, c * s.size / 2));
      // signed distance to the quad's edges (convex, either winding), over the quad's smaller side
      let dmin = Infinity, area = 0;
      for (let i = 0; i < 4; i++) { const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4]; area += ax * by - bx * ay; }
      const sgn = Math.sign(area) || 1;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4], ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey) || 1;
        dmin = Math.min(dmin, sgn * (ex * (my - ay) - ey * (mx - ax)) / len);
      }
      const side = Math.min(...q.map((p, i) => Math.hypot(p[0] - q[(i + 1) % 4][0], p[1] - q[(i + 1) % 4][1])));
      return { inside: dmin / side, px: dmin, lift: s.lift, hovered: d.rack.core.hovered };
    }, { k, mx: x + 1, my: y });
    let worst = Infinity, worstPx = Infinity, last = null, lostHover = false;
    for (let t = 0; t < (FAST ? 30 : 15); t++) {
      const r = await measure();
      if (r.hovered !== k) lostHover = true;
      worst = Math.min(worst, r.inside);
      worstPx = Math.min(worstPx, r.px);
      last = r;
      await page.waitForTimeout(FAST ? 80 : 400);
    }
    total++;
    const isOff = worstPx < -2; // more than 2 px off (an edge-on sliver can't hold the inset)
    const bad = isOff || lostHover;
    if (bad) off++;
    console.log(`st${at} #${k} at ${x | 0},${y | 0}: worst ${worst.toFixed(2)} (${worstPx | 0} px) settled ${last.inside.toFixed(2)} lift ${last.lift.toFixed(2)}${lostHover ? ' LOST-HOVER' : ''}${isOff ? ' OFF' : ''}`);
    if (bad) await page.screenshot({ path: `${out}/st${at}-${k}.jpg`, type: 'jpeg', quality: 80 }).catch(() => {});
  }
  await page.close();
}
console.log(`off the cursor: ${off} of ${total}`);
await b.close();
await server.close();
process.exit(0);
