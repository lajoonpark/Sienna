// Do records pass through things? For each station, a few records are held up and let down again by
// stepping the rack by hand (rack.update at 1/60 s, no drawing, so every frame of the motion is seen),
// and every sleeve that has left its rest pose is checked as an oriented box against everything solid
// in the rack (src/racks/clear.js), minus what it already touched at rest:
//   travel = worst extra overlaps of any moving sleeve (who, at which step, up or down)
//   up     = overlaps of the vinyl sliding straight up out of the lifted sleeve (the old way), over the sweep
//   chosen = the way clear.js picks for it, and its overlaps
//   node scripts/pass-check.mjs [stations=0,...,7] [samples per rack=6]   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const stations = (process.argv[2] ?? '0,1,2,3,4,5,6,7').split(',').map(Number), n = Number(process.argv[3] ?? 6);
const port = Number(process.env.SIENNA_PORT) || 5244;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
let total = 0;
for (const at of stations) {
  const page = await b.newPage({ viewport: { width: 1170, height: 730 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=0`);
  await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 180000 });
  await page.waitForTimeout(4000);
  const out = await page.evaluate(async (n) => {
    const { solidsOf, discHits, chooseDiscDir, sleeveHits } = await import('/src/racks/clear.js');
    const d = window.__siennaDebug, rack = d.rack, core = rack.core, cam = d.camera;
    const step = (k) => { rack.forceHover = k; for (const s of core.sleeves) s.appear = 1; rack.update(1 / 60, cam, null, true); core.root.updateMatrixWorld(true); };
    for (let i = 0; i < 120; i++) step(null); // all down
    const vis = core.sleeves.map((s, i) => (s.mesh.visible ? i : -1)).filter((i) => i >= 0);
    const restM = core.sleeves.map((s) => s.mesh.matrixWorld.clone());
    const base = core.sleeves.map((s) => sleeveHits(s, solidsOf(core, s.mesh)));
    const moved = (s, i) => { const a = s.mesh.matrixWorld.elements, r = restM[i].elements; return a.some((v, j) => Math.abs(v - r[j]) > 1e-4); };
    const picks = [...new Set(Array.from({ length: n }, (_, j) => vis[Math.floor((j + 0.5) * vis.length / n)]))];
    const lines = [];
    let total = 0;
    for (const k of picks) {
      let worst = 0, who = -1, when = '';
      const watch = (phase, f) => core.sleeves.forEach((s, i) => {
        if (!s.mesh.visible || !moved(s, i)) return;
        const x = sleeveHits(s, solidsOf(core, s.mesh)) - base[i];
        if (x > worst) {
          worst = x; who = i; when = `${phase} f${f}`;
          const name = (o) => { const k = core.sleeves.findIndex((q) => q.mesh === o.src || q.disc === o.src?.parent); if (k >= 0) return `sleeve#${k}`; const b = o.src.geometry.boundingBox; return `${o.src.isInstancedMesh ? 'inst' : 'box'}[${['x', 'y', 'z'].map((a) => (b.max[a] - b.min[a]).toFixed(2)).join('x')}]`; };
          when += ' hits ' + sleeveHits(s, solidsOf(core, s.mesh), true).map(name).join(',');
        }
      });
      for (let f = 0; f < 60; f++) { step(k); watch('up', f); }
      const s = core.sleeves[k];
      const solids = solidsOf(core, s.mesh);
      const up = discHits(core, s, { x: 0, y: 1 }, solids);
      const dir = chooseDiscDir(core, s);
      const chosen = discHits(core, s, dir, solids);
      for (let f = 0; f < 60; f++) { step(null); watch('down', f); }
      total += worst + chosen;
      lines.push(`#${k} travel=${worst}${worst ? ` (#${who} ${when})` : ''} disc up=${up} chosen=(${dir.x},${dir.y}) ${chosen}`);
    }
    rack.forceHover = null;
    return { lines, total };
  }, n);
  total += out.total;
  console.log(`station ${at}\n  ${out.lines.join('\n  ')}`);
  await page.close();
}
console.log(`TOTAL ${total}`);
await b.close(); await server.close();
