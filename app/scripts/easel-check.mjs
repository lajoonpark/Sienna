// The counter rack's hover paths (src/racks/easel.js), on a full page (3 rows) and a 6-record page (2 rows).
// Each record is lifted by stepping the rack at 1/60 s, and for each one this reports:
//   hits    = extra overlaps of the moving sleeve with anything solid in the rack, over the whole lift
//   covered = how many of a 5x5 grid of points on its face something else hides, in the final pose
//   up      = how far it rose in total, and how far it had come forward at the top of that rise
// Film strips of one record per row go to out_dir.   node scripts/easel-check.mjs out_dir   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { outDir } from './safe.mjs';
const out = outDir(process.argv[2], 'easel-check');
const port = Number(process.env.SIENNA_PORT) || 5245;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1170, height: 730 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// ?shot: no render loop, a frame is drawn only by __seek
await page.goto(`http://127.0.0.1:${port}/index.html?shot&shelves=8&at=3&wc=0`);
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
await page.evaluate(() => window.__seek(6));
// the app's own loop must not move the rack while it is stepped by hand
await page.evaluate(() => {
  const r = window.__siennaDebug.rack, u = r.update.bind(r);
  window.__step = u;
  r.update = (dt, ...a) => u(0, ...a);
});
let bad = 0;
for (const count of [9, 6]) {
  const lines = await page.evaluate(async (count) => {
    const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => import('three'));
    const { solidsOf, sleeveHits } = await import('/src/racks/clear.js');
    const d = window.__siennaDebug, rack = d.rack, core = rack.core, cam = d.camera;
    if (count < core.sleeves.length) await rack.setShelf({ title: 'Easel check', items: core.sleeves.slice(0, count).map((s) => s.item) });
    const step = (k, n) => { for (let i = 0; i < n; i++) { rack.forceHover = k; for (const s of core.sleeves) s.appear = 1; window.__step(1 / 60, cam, null, true); } core.root.updateMatrixWorld(true); };
    step(null, 120);
    const base = core.sleeves.map((s) => sleeveHits(s, solidsOf(core, s.mesh)));
    const res = [];
    const caster = new THREE.Raycaster();
    for (const [k, s] of core.sleeves.entries()) {
      if (!s.mesh.visible) continue;
      const y0 = s.mesh.position.y, z0 = s.mesh.position.z;
      let hits = 0, top = y0, zAtTop = z0;
      for (let f = 0; f < 90; f++) {
        step(k, 1);
        hits = Math.max(hits, sleeveHits(s, solidsOf(core, s.mesh)) - base[k]);
        if (s.mesh.position.y > top) { top = s.mesh.position.y; zAtTop = s.mesh.position.z; }
      }
      const others = []; core.root.traverse((o) => { if (o.isMesh && o.visible && o !== core.tag?.mesh && !o.isInstancedMesh && o !== s.mesh && o.parent !== s.disc && o.parent !== s.mesh) others.push(o); });
      const camP = cam.getWorldPosition(new THREE.Vector3());
      let covered = 0;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const p = new THREE.Vector3(i * s.size * 0.24, j * s.size * 0.24, 0.008).applyMatrix4(s.mesh.matrixWorld);
        const dist = p.distanceTo(camP);
        caster.set(camP, p.clone().sub(camP).normalize());
        if (caster.intersectObjects(others, false).some((h) => h.distance < dist - 0.002)) covered++;
      }
      res.push({ k, tier: s.tier, hits, covered, up: top - y0, fwd: zAtTop - z0, end: s.mesh.position.z });
      step(null, 90);
    }
    return res;
  }, count);
  console.log(`${count} records:`);
  for (const l of lines) {
    bad += l.hits + l.covered;
    console.log(`  #${l.k} step ${l.tier}: hits=${l.hits} covered=${l.covered}/25 up=${l.up.toFixed(3)} forward at top=${l.fwd.toFixed(3)} end z=${l.end.toFixed(2)}`);
  }
  // film strips: the first record of each row
  for (const k of count === 9 ? [0, 3, 6] : [0, 3]) {
    for (let f = 0, shot = 0; f <= 28; f += 7, shot++) {
      await page.evaluate(async ([k, n]) => {
        const d = window.__siennaDebug;
        d.setHover(k); d.rack.forceHover = k;
        for (let i = 0; i < n; i++) window.__step(1 / 60, d.camera, null, true);
        await window.__seek(6);
      }, [k, f === 0 ? 0 : 7]);
      await page.screenshot({ path: `${out}/p${count}_r${k}_${shot}.png`, timeout: 180000 });
    }
    await page.evaluate(() => { const d = window.__siennaDebug, r = d.rack, cam = d.camera; d.setHover(null); r.forceHover = null; for (let i = 0; i < 120; i++) window.__step(1 / 60, cam, null, true); });
  }
}
console.log(`TOTAL ${bad}`);
await b.close(); await server.close();
