// Does a hovered spinner record (station 6) ever sink into the tower? Turns the tower to a few angles,
// hovers every record turned your way with a real mouse (or holds it up, like ?hover=k, where the cursor can't reach it), and while it lifts and after it settles casts rays
// from the camera through a grid of points on the record's front face: a ray that meets the tower (not
// another record) before it reaches the face means the tower is drawn over the record there (once the
// record is nearly up: on its way out of the pocket the lip and the next tier may rightly cover it).
//   node scripts/spinner-clip-check.mjs [out_dir] [angles=0.4,0.9,-0.5,1.3]   (SIENNA_PORT, SIENNA_WC)
// CLIP = some sampled point hidden at some moment; screenshots of those go to out_dir (SHOTS=1: every
// settled hover too).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'spinner-clip-out';
const angles = (process.argv[3] ?? '0.4,0.9,-0.5,1.3').split(',').map(Number);
mkdirSync(out, { recursive: true });
const port = Number(process.env.SIENNA_PORT) || 5249;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const W = 1170, H = 730;
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=6&wc=${process.env.SIENNA_WC ?? 0}`, { timeout: 180000 });
await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 240000 });
await page.waitForFunction(() => { const r = window.__siennaDebug.rack; return r?.root.visible && r.core.sleeves.length && r.core.sleeves.every((s) => s.hidden || (s.mesh.visible && s.drop < 0.01)); }, null, { timeout: 240000, polling: 500 });
console.log('renderer:', await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }));
let clipped = 0, total = 0;
for (const ang of angles) {
  await page.mouse.move(W / 2, 8);
  await page.evaluate((a) => { window.__siennaDebug.rack.core.car.rotation.y = a; }, ang);
  await page.waitForTimeout(1500);
  await page.evaluate((a) => { window.__siennaDebug.rack.core.car.rotation.y = a; }, ang);
  await page.waitForTimeout(300);
  // for each record, a spot on screen where the rack's own picker says the cursor would hover it
  const spots = await page.evaluate(() => {
    const d = window.__siennaDebug, cam = d.camera, core = d.rack.core, car = core.car, T = cam.position.constructor;
    cam.updateMatrixWorld(); car.updateMatrixWorld(true);
    return core.sleeves.map((s, i) => {
      if (s.hidden || !s.mesh.visible) return null;
      for (const [a, c] of [[0, 0], [0, 0.3], [0, -0.2], [0.25, 0.2], [-0.25, 0.2], [0.3, -0.2], [-0.3, -0.2], [0, 0.42]]) {
        const v = new T(a * s.size, c * s.size, 0).applyMatrix4(s.mesh.matrixWorld).project(cam);
        if (Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.92) continue;
        if (core.picker.pick({ x: v.x, y: v.y }, cam, car) === i) return { k: i, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
      }
      // no spot (hidden, or off the frame): still try it, held up, if its face is turned toward you
      const c = s.mesh.getWorldPosition(new T()), nrm = new T(0, 0, 1).transformDirection(s.mesh.matrixWorld);
      const v = c.clone().project(cam);
      return nrm.dot(cam.position.clone().sub(c).normalize()) > 0.15 ? { k: i, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight } : null;
    }).filter(Boolean);
  });
  for (const { k, x, y } of spots) {
    await page.mouse.move(W / 2, 8);
    await page.waitForTimeout(1200);
    await page.evaluate((a) => { window.__siennaDebug.rack.core.car.rotation.y = a; }, ang);
    await page.mouse.move(x, y);
    await page.mouse.move(x + 1, y);
    let h = await page.waitForFunction(() => { const c = window.__siennaDebug.rack.core; return c.hovered >= 0 ? c.hovered : false; }, null, { timeout: 5000, polling: 50 }).then((r) => r.jsonValue()).catch(() => null);
    // the camera turns with the cursor, so a spot found at rest can miss: hold it up instead (like ?hover=k)
    const forced = h !== k;
    if (forced) {
      await page.mouse.move(W / 2, 8);
      await page.waitForTimeout(800);
      await page.evaluate((k) => window.__siennaDebug.setHover(k), k);
    }
    let worst = 0, worstLift = 0;
    for (let t = 0; t < 24; t++) {
      const r = await page.evaluate((k) => {
        const d = window.__siennaDebug, cam = d.camera, core = d.rack.core, car = core.car, s = core.sleeves[k], T = cam.position.constructor;
        cam.updateMatrixWorld(); car.updateMatrixWorld(true);
        const rc = new d.THREE.Raycaster(), isSleeve = (o) => { for (; o; o = o.parent) if (core.sleeves.some((q) => q.mesh === o)) return true; return false; };
        const tower = []; car.traverse((o) => { if (o.isMesh && !isSleeve(o)) tower.push(o); });
        let hidden = 0, n = 0;
        // the cover (to its edges) and, while it shows, the name tag under or over it
        const pts = [];
        for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) pts.push(new T(a * s.size * 0.163, c * s.size * 0.163, 0.008).applyMatrix4(s.mesh.matrixWorld));
        const tag = core.tag.mesh;
        if (tag.parent === s.mesh && tag.visible && tag.scale.x > 0.01) {
          tag.updateWorldMatrix(true, false);
          tag.geometry.computeBoundingBox();
          const bb = tag.geometry.boundingBox;
          for (let a = 0; a <= 4; a++) for (let c = 0; c <= 2; c++) pts.push(new T(bb.min.x + (bb.max.x - bb.min.x) * (0.03 + 0.94 * a / 4), bb.min.y + (bb.max.y - bb.min.y) * (0.1 + 0.8 * c / 2), bb.max.z + 0.002).applyMatrix4(tag.matrixWorld));
        }
        for (const p of pts) {
          const dir = p.clone().sub(cam.position), len = dir.length();
          rc.set(cam.position, dir.normalize()); rc.far = len - 0.002;
          n++;
          if (rc.intersectObjects(tower, false).length) hidden++;
        }
        return { share: hidden / n, lift: s.lift, hov: core.hovered };
      }, k);
      if (r.lift > 0.85 && r.share > worst) { worst = r.share; worstLift = r.lift; if (r.share > 0) await page.screenshot({ path: `${out}/a${ang}-${k}.jpg`, type: 'jpeg', quality: 80 }).catch(() => {}); }
      await page.waitForTimeout(70);
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${out}/settled-a${ang}-${k}.jpg`, type: 'jpeg', quality: 80 }).catch(() => {});
    if (forced) await page.evaluate(() => window.__siennaDebug.setHover(null));
    total++;
    if (worst > 0) clipped++;
    console.log(`a${ang} #${k}${forced ? ' (held)' : ''}: worst hidden ${(worst * 100) | 0}% at lift ${worstLift.toFixed(2)}${worst > 0 ? ' CLIP' : ''}`);
  }
}
console.log(`clipped: ${clipped} of ${total}`);
await b.close();
await server.close();
process.exit(0);
