// The plant-room spinner by hand, and hovered records not being carried by the cursor.
//   node scripts/spin-check.mjs [out_dir] [carry stations=6,1,4]   (GPU; CADENCE_PORT, CADENCE_WC)
// carry: hover a record, let it settle, slide the cursor around inside it; the record must not move on
// the world (moved = its centre's drift in mm; the camera tilts with the cursor, so not px). spinner: sideways scroll, a slow drag, a flick; prints the
// stand's turn, whether a record lifted during the drag and whether the drag picked a record.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'spin-out';
const carryAt = (process.argv[3] ?? '6,1,4').split(',').map(Number);
mkdirSync(out, { recursive: true });
const port = Number(process.env.CADENCE_PORT) || 5249;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const W = 1170, H = 730;
let problems = 0;
const open = async (at) => {
  const page = await b.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=${process.env.CADENCE_WC ?? 0}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__cadenceDebug?.state.settled, null, { timeout: 240000 });
  await page.waitForFunction(() => { const r = window.__cadenceDebug.rack; return r?.root.visible && r.core.sleeves.length && r.core.sleeves.every((s) => s.hidden || (s.mesh.visible && s.drop < 0.01)); }, null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(2500);
  return page;
};
// screen centre of sleeve k, and of every visible sleeve (for picking hover spots)
const centres = (page) => page.evaluate(() => {
  const d = window.__cadenceDebug, cam = d.camera;
  cam.updateMatrixWorld();
  return d.rack.core.sleeves.map((s, k) => {
    s.mesh.updateWorldMatrix(true, false);
    const v = s.mesh.getWorldPosition(cam.position.clone()).project(cam);
    return { k, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, z: v.z, ok: !s.hidden && s.mesh.visible };
  });
});

// ---- carry ----
for (const at of carryAt) {
  const page = await open(at);
  const spots = (await centres(page)).filter((c) => c.ok && c.x > 80 && c.x < W - 80 && c.y > 80 && c.y < H - 80 && c.z < 1);
  for (const sp of spots.slice(0, 3)) {
    await page.mouse.move(600, 10);
    await page.waitForTimeout(1500);
    await page.mouse.move(sp.x, sp.y, { steps: 3 });
    const k = await page.waitForFunction(() => { const c = window.__cadenceDebug.rack.core; return c.hovered >= 0 ? c.hovered : false; }, null, { timeout: 8000, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
    if (k === null) { console.log(`carry st${at} at ${sp.x | 0},${sp.y | 0}: no hover`); continue; }
    await page.waitForTimeout(1500);
    // in the world, in mm: the camera tilts a little with the cursor, so screen px would move anyway
    // (read in one go with the hover, and only while it is still fully up, so a record going home after
    // the cursor moved on to a neighbour doesn't count)
    const where = () => page.evaluate((k) => { const c = window.__cadenceDebug.rack.core, s = c.sleeves[k]; s.mesh.updateWorldMatrix(true, false); return { p: s.mesh.getWorldPosition(s.mesh.position.clone()).toArray(), on: c.hovered === k && s.lift > 0.97 }; }, k);
    let worst = 0, lost = false;
    // out toward each side in small steps, while it is still the hovered record; each side starts from a
    // fresh hover with the cursor dropped straight onto the middle (a hover that begins at an edge sits there)
    for (const [ux, uy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      await page.mouse.move(600, 10);
      await page.waitForTimeout(1200);
      await page.mouse.move(sp.x, sp.y);
      await page.waitForTimeout(1500);
      const a = (await where()).p;
      for (let r = 10; r <= 150; r += 10) {
        await page.mouse.move(sp.x + ux * r, sp.y + uy * r);
        await page.waitForTimeout(120);
        const { p: c, on } = await where();
        if (!on) { lost = true; break; }
        worst = Math.max(worst, 1000 * Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
      }
    }
    const bad = worst > 5;
    if (bad) problems++;
    console.log(`carry st${at} #${k}: moved ${worst.toFixed(1)} mm${bad ? ' CARRIED' : ''}`);
  }
  await page.close();
}

// ---- spinner ----
{
  const page = await open(6);
  const rot = () => page.evaluate(() => window.__cadenceDebug.rack.core.car.rotation.y);
  const vol = () => page.evaluate(() => window.__cadenceDebug.state.volume ?? null).catch(() => null);
  // the tower's middle on screen
  const mid = await page.evaluate(() => {
    const d = window.__cadenceDebug, cam = d.camera, car = d.rack.core.car;
    cam.updateMatrixWorld();
    const v = car.localToWorld(cam.position.clone().set(0, 1.05, 0)).project(cam);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  });
  await page.mouse.move(mid.x, mid.y);
  await page.waitForTimeout(800);
  let r0 = await rot();
  await page.mouse.wheel(240, 0);
  await page.waitForTimeout(1200);
  let r1 = await rot();
  const wheelTurn = r1 - r0;
  console.log(`wheel dx=240: turned ${wheelTurn.toFixed(3)} rad (want < 0)`);
  if (!(wheelTurn < -0.5)) problems++;
  await page.screenshot({ path: `${out}/after-wheel.jpg`, type: 'jpeg', quality: 80 });

  // slow drag right: front face follows the cursor; no lift, no pick
  await page.mouse.move(mid.x, mid.y + 40);
  await page.waitForTimeout(800);
  r0 = await rot();
  await page.mouse.down();
  let maxLift = 0;
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(mid.x + i * 8, mid.y + 40);
    await page.waitForTimeout(60);
    // after the first few moves (the record pressed on was already up and sinks back)
    if (i > 8) maxLift = Math.max(maxLift, await page.evaluate(() => Math.max(0, ...window.__cadenceDebug.rack.core.sleeves.map((s) => s.lift))));
  }
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(300);
  r1 = await rot();
  const picked = await page.evaluate(() => window.__cadenceDebug.rack.core.sleeves.some((s) => s.picking));
  console.log(`slow drag +160 px: turned ${(r1 - r0).toFixed(3)} rad (want > 0), highest lift late in the drag ${maxLift.toFixed(2)}, picked ${picked}`);
  if (!(r1 - r0 > 0.3) || picked || maxLift > 0.3) problems++;

  // flick: fast drag then let go; keeps turning after release
  await page.mouse.move(mid.x + 60, mid.y);
  await page.waitForTimeout(600);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(mid.x + 60 - i * 25, mid.y); await page.waitForTimeout(16); }
  await page.mouse.up();
  const a = await rot();
  await page.waitForTimeout(700);
  const bb = await rot();
  await page.waitForTimeout(3000);
  const c = await rot();
  await page.waitForTimeout(1000);
  const d = await rot();
  console.log(`flick left: after release ${(bb - a).toFixed(3)} rad in 0.7 s (want < 0), then ${(c - bb).toFixed(3)} in 3 s, then ${(d - c).toFixed(3)} in 1 s (want ~0)`);
  if (!(bb - a < -0.1) || Math.abs(d - c) > 0.05) problems++;
  await page.screenshot({ path: `${out}/after-flick.jpg`, type: 'jpeg', quality: 80 });
  const renderer = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
  console.log('renderer:', renderer);
  await page.close();
}
console.log(problems ? `${problems} problem(s)` : 'ok');
await b.close();
await server.close();
