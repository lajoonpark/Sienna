// Hold a record near the window's edge or the side words up with a still cursor: does the camera come to
// rest once and stay there (no second move after it has stopped), and can a press on the record ever land
// on a side word (a word over the record's box that still takes the pointer)?
// Prints per record: moves = camera motion spells after the first stop, lateMm = how far the camera went
// after it first stopped, liveWords = frames with a pointer-taking word over the record.
//   node scripts/reframe-check.mjs [stations=0,3] [records per rack=4]   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';

const stations = (process.argv[2] ?? '0,3').split(',').map(Number), n = Number(process.argv[3] ?? 4);
const port = Number(process.env.SIENNA_PORT) || 5252;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const angle = process.platform === 'darwin' ? 'metal' : 'vulkan';
const b = await chromium.launch({ channel: process.env.SIENNA_CHANNEL, args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist'] });
const [W, H] = (process.env.SIENNA_SIZE ?? '940x590').split('x').map(Number);
let bad = 0;
for (const at of stations) {
  const page = await b.newPage({ viewport: { width: W, height: H } });
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=0`, { timeout: 180000 });
  await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 240000 });
  await page.waitForFunction(() => { const r = window.__siennaDebug.rack; return r?.root.visible && r.core.sleeves.length && r.core.sleeves.every((s) => s.hidden || (s.mesh.visible && s.drop < 0.01)); }, null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(3000);
  const spots = await page.evaluate((n) => {
    const d = window.__siennaDebug, cam = d.camera, ss = d.rack.core.sleeves;
    cam.updateMatrixWorld();
    return ss.map((s, i) => {
      const v = s.mesh.getWorldPosition(cam.position.clone()).project(cam);
      return { k: i, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    }).filter((e) => !ss[e.k].hidden && ss[e.k].mesh.visible && e.x > 8 && e.x < innerWidth - 8 && e.y > 8 && e.y < innerHeight - 8)
      .sort((a, c) => a.x - c.x).slice(0, n); // the side words sit on the left
  }, n);
  for (const s of spots) {
    await page.mouse.move(W / 2, H / 2);
    await page.waitForTimeout(1500);
    await page.mouse.move(s.x - 12, s.y + 12, { steps: 3 });
    const samples = await page.evaluate(async () => {
      const d = window.__siennaDebug, out = [];
            for (let f = 0; f < 270; f++) { // 4.5 s at 60 fps, undrawn
        d.step(1, 1 / 60);
        const c = d.camera.getWorldPosition(d.camera.position.clone()), box = d.rack.screenBox(d.camera);
        let live = 0;
        if (box) {
          const l = (box.all[0] + 1) / 2 * innerWidth, r = (box.all[1] + 1) / 2 * innerWidth, t = (1 - box.all[3]) / 2 * innerHeight, bb = (1 - box.all[2]) / 2 * innerHeight;
          for (const e of document.querySelectorAll('.mn.show button')) {
            const q = e.getBoundingClientRect();
            if (q.left < r && q.right > l && q.top < bb && q.bottom > t && getComputedStyle(e).pointerEvents !== 'none' && !e.closest('.faded')) live++;
          }
        }
        out.push({ t: (f + 1) * 1000 / 60, x: c.x, y: c.y, z: c.z, h: d.rack.hovered, live });
      }
      return out;
    });
    // motion spells: frames moving faster than 2 mm/s; after the first rest (>= 0.3 s still), any more motion is a second move
    let firstRest = -1, still = 0, late = 0, spells = 0, moving = false;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], c = samples[i], dt = (c.t - a.t) / 1000, v = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z) / Math.max(dt, 1e-3);
      if (v < 0.002) { still += dt; moving = false; if (firstRest < 0 && still >= 0.3 && i > 10) firstRest = i; }
      else { still = 0; if (firstRest >= 0) { late += v * dt; if (!moving) spells++; moving = true; } }
    }
    const k0 = samples.at(-1).h, held = samples.slice(-60).every((q) => q.h === k0 && k0 >= 0);
    const liveWords = samples.filter((q) => q.live > 0).length;
    const ok = !spells && liveWords === 0;
    if (!ok && held) bad++;
    console.log(`at ${at} rec ${s.k} @${Math.round(s.x)},${Math.round(s.y)} held=${held} moves=${spells} lateMm=${(late * 1000).toFixed(1)} liveWords=${liveWords} frames=${samples.length}${ok ? '' : held ? '  BAD' : ''}`);
  }
  await page.close();
}
console.log(bad ? `${bad} record(s) moved again or left a word live over it` : 'ok');
await b.close();
await server.close();
