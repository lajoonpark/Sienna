// Does a held-up record near the window's edge or the buttons get clear of them, with the cursor still on it?
// Hovers the records nearest the edges of each rack with a real mouse (the cursor stays still once on the
// record), lets the camera settle and prints, per record: how far the record + tag is past the window (px),
// how much of it side words / home / top-right words still cover (px²), whether the cursor is on the cover and
// whether the hover held.
//   node scripts/edge-check.mjs [out_dir] [stations=0,1,2,3,4,5,6,7] [records per rack=6]   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'edge-out';
const stations = (process.argv[3] ?? '0,1,2,3,4,5,6,7').split(',').map(Number), n = Number(process.argv[4] ?? 6);
mkdirSync(out, { recursive: true });
const port = Number(process.env.SIENNA_PORT) || 5249;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
// SIENNA_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's own
const angle = process.platform === 'darwin' ? 'metal' : 'vulkan';
const b = await chromium.launch({ channel: process.env.SIENNA_CHANNEL, args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist'] });
const [W, H] = (process.env.SIENNA_SIZE ?? '940x590').split('x').map(Number);
let bad = 0, total = 0;
for (const at of stations) {
  const page = await b.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=0`, { timeout: 180000 });
  await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 240000 });
  await page.waitForFunction(() => { const r = window.__siennaDebug.rack; return r?.root.visible && r.core.sleeves.length && r.core.sleeves.every((s) => s.hidden || (s.mesh.visible && s.drop < 0.01)); }, null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(3000);
  // rest spots on screen, the ones nearest an edge first
  const spots = await page.evaluate((n) => {
    const d = window.__siennaDebug, cam = d.camera, ss = d.rack.core.sleeves;
    cam.updateMatrixWorld();
    return ss.map((s, i) => {
      const v = s.mesh.getWorldPosition(cam.position.clone()).project(cam);
      return { k: i, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    }).filter((e) => !ss[e.k].hidden && ss[e.k].mesh.visible && e.x > 8 && e.x < innerWidth - 8 && e.y > 8 && e.y < innerHeight - 8)
      .map((e) => ({ ...e, edge: Math.min(e.x, innerWidth - e.x, e.y * 1.5) }))
      .sort((a, c) => a.edge - c.edge).slice(0, n);
  }, n);
  for (const s of spots) {
    await page.mouse.move(W / 2, H / 2);
    await page.waitForTimeout(1200);
    await page.mouse.move(s.x + 3, s.y + 3);
    await page.mouse.move(s.x, s.y, { steps: 3 });
    await page.waitForTimeout(500);
    const k0 = await page.evaluate(() => window.__siennaDebug.rack.hovered);
    const hov = [];
    for (let i = 0; i < 12; i++) { hov.push(await page.evaluate(() => window.__siennaDebug.rack.hovered)); await page.waitForTimeout(200); }
    const r = await page.evaluate(([cx, cy]) => {
      const d = window.__siennaDebug, box = d.rack.screenBox(d.camera);
      if (!box) return null;
      const px = (a) => [(a[0] + 1) / 2 * innerWidth, (a[1] + 1) / 2 * innerWidth, (1 - a[3]) / 2 * innerHeight, (1 - a[2]) / 2 * innerHeight]; // l r t b
      const [l, rr, t, bb] = px(box.all), [cl, cr, ct, cb] = px(box.rec);
      const past = Math.max(0, -l, rr - innerWidth, -t, bb - innerHeight);
      const els = [...document.querySelectorAll('.mn button, .st-btn-stack button')].filter((e) => getComputedStyle(e).opacity > 0.2 && e.closest('.mn.show, .st-btn.show'));
      let cover = 0;
      for (const e of els) { const q = e.getBoundingClientRect(); cover += Math.max(0, Math.min(rr, q.right) - Math.max(l, q.left)) * Math.max(0, Math.min(bb, q.bottom) - Math.max(t, q.top)); }
      const on = cx > Math.min(cl, l) && cx < Math.max(cr, rr) && cy > Math.min(ct, t) && cy < Math.max(cb, bb); // on the cover or its tag
      return { past: Math.round(past), cover: Math.round(cover), on, cut: +d.focus.cut.toFixed(2), pan: d.focus.pan ? [d.focus.pan.x.toFixed(2), d.focus.pan.y.toFixed(2)] : null };
    }, [s.x, s.y]);
    const held = hov.every((h) => h === k0) && k0 >= 0;
    const ok = r && r.on && held && r.past <= 2 && r.cover < 50;
    total++; if (!ok) bad++;
    console.log(`at ${at} rec ${s.k} @${Math.round(s.x)},${Math.round(s.y)} hovered=${k0} held=${held} ${JSON.stringify(r)}${ok ? '' : '  <-- BAD'}`);
    await page.screenshot({ path: `${out}/at${at}-r${s.k}.png` });
  }
  await page.close();
}
console.log(`${total - bad}/${total} clear`);
await b.close(); await server.close();
