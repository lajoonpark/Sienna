// Checks the camera's flights between stations (nav.js routes through the winding shop): every flight from
// home to each station, between neighbouring stations, and a few long ones. For each it walks the planned
// path in small steps and casts rays (the step itself, and a ring of short rays round the camera) against the
// shop's solid meshes: a hit on the step means the path goes through something, a ring ray shorter than CLEAR
// means it brushes past it. Optionally saves frames along each flight (nav.freeze) to look at.
//   node scripts/route-check.mjs [out_dir]        (frames only when out_dir is given)
//   SIENNA_PORT, CLEAR=0.25 (metres)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { outDir as safeOutDir } from './safe.mjs';

const outArg = process.argv[2];
const outDir = outArg ? safeOutDir(outArg, 'sienna-route') : null;
const port = Number(process.env.SIENNA_PORT) || 5251;
const CLEAR = Number(process.env.CLEAR ?? 0.25);
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=home&guest&tour=0`, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction(() => window.__siennaDebug?.state.settled && window.__siennaDebug.pacer, null, { timeout: 240000 });
await page.waitForTimeout(4000);

const pairs = await page.evaluate(() => {
  const n = window.__siennaDebug.stations.length, out = [];
  for (let i = 0; i < n; i++) out.push([-1, i]);
  for (let i = 0; i + 1 < n; i++) out.push([i, i + 1]);
  out.push([0, n - 1], [n - 1, 2], [4, 7], [7, 3]);
  return out;
});

let bad = 0;
for (const [a, z] of pairs) {
  const res = await page.evaluate(({ a, z, CLEAR }) => {
    const { nav, scene, THREE } = window.__siennaDebug;
    // the solid shop: opaque, visible meshes (no glows, glass, racks' records or the suitcase overlay)
    const solids = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let p = o; while (p) { if (!p.visible) return; p = p.parent; }
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent || m.opacity < 1) return;
      solids.push(o);
    });
    const plan = nav.plan(a, z);
    const ray = new THREE.Raycaster();
    const N = Math.max(40, Math.ceil(plan.curve.getLength() / 0.1));
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), d = new THREE.Vector3();
    const through = [], brush = [];
    const ring = [];
    for (let k = 0; k < 8; k++) ring.push(new THREE.Vector3(Math.cos((k / 8) * Math.PI * 2), 0, Math.sin((k / 8) * Math.PI * 2)));
    ring.push(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
    const name = (o) => { let p = o; while (p && !p.name) p = p.parent; return `${o.geometry?.type ?? '?'}${p?.name ? ' in ' + p.name : ''}`; };
    for (let i = 0; i < N; i++) {
      plan.curve.getPointAt(i / N, p0); plan.curve.getPointAt((i + 1) / N, p1);
      d.subVectors(p1, p0); const len = d.length(); d.normalize();
      ray.set(p0, d); ray.far = len; ray.near = 0;
      const h = ray.intersectObjects(solids, false)[0];
      if (h) through.push({ s: +(i / N).toFixed(3), at: h.point.toArray().map((v) => +v.toFixed(2)), what: name(h.object) });
      if (i % 3) continue;
      for (const r of ring) {
        ray.set(p0, r); ray.far = CLEAR;
        const g = ray.intersectObjects(solids, false)[0];
        if (g) { brush.push({ s: +(i / N).toFixed(3), dist: +g.distance.toFixed(2), at: g.point.toArray().map((v) => +v.toFixed(2)), what: name(g.object) }); break; }
      }
    }
    return { len: +plan.curve.getLength().toFixed(1), dur: +plan.dur.toFixed(2), wps: plan.wps.length, through, brush };
  }, { a, z, CLEAR });
  const tag = `${a < 0 ? 'home' : a} -> ${z}`;
  console.log(`${tag}: ${res.len} m, ${res.dur} s, ${res.wps} waypoints, through ${res.through.length}, brushes ${res.brush.length}`);
  for (const t of res.through.slice(0, 6)) console.log(`   THROUGH s=${t.s} at ${t.at} (${t.what})`);
  for (const t of res.brush.slice(0, 4)) console.log(`   brush s=${t.s} ${t.dist} m at ${t.at} (${t.what})`);
  bad += res.through.length;
  if (outDir) {
    for (const p of [0.25, 0.5, 0.75]) {
      await page.evaluate(({ a, z, p }) => window.__siennaDebug.nav.freeze(a, z, p), { a, z, p });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${outDir}/${a < 0 ? 'home' : a}-${z}-${Math.round(p * 100)}.png` });
    }
  }
}
console.log(bad ? `${bad} steps go through something` : 'no flight goes through anything');
if (outDir) console.log('frames in', outDir);
await b.close();
await server.close();
process.exit(bad ? 1 : 0);
