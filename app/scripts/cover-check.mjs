// Does a lifted record cover its neighbours, and how far does it wander from its rest spot on screen?
// For each station: rest rects of every sleeve, then each sampled record held up (debug setHover):
//   shift = px its centre moved, grow = area ratio, cover = worst share of a neighbour's rest rect hidden.
//   node scripts/cover-check.mjs [stations=0,1,2,3,4,5,6] [samples per rack=5]   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const stations = (process.argv[2] ?? '0,1,2,3,4,5,6').split(',').map(Number), n = Number(process.argv[3] ?? 5);
const port = Number(process.env.SIENNA_PORT) || 5243;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const W = 1170, H = 730;
for (const at of stations) {
  const page = await b.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=0`);
  await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 180000 });
  await page.waitForTimeout(6000);
  const rectsJS = () => {
    const d = window.__siennaDebug, core = d.rack.core, cam = d.camera, tag = core.tag.mesh;
    cam.updateMatrixWorld();
    return core.sleeves.map((s) => {
      if (!s.mesh.visible) return null;
      s.mesh.updateWorldMatrix(true, true);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const walk = (o) => {
        if (o === tag || !o.visible) return;
        if (o.isMesh && o.geometry) {
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox;
          for (let c = 0; c < 8; c++) {
            const v = s.mesh.position.clone().set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld).project(cam);
            const px = (v.x + 1) / 2 * innerWidth, py = (1 - v.y) / 2 * innerHeight;
            x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
          }
        }
        o.children.forEach(walk);
      };
      walk(s.mesh);
      return [x0, y0, x1, y1];
    });
  };
  const rest = await page.evaluate(rectsJS);
  const idx = rest.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
  const picks = [...new Set(Array.from({ length: n }, (_, j) => idx[Math.floor((j + 0.5) * idx.length / n)]))];
  const area = (r) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  const inter = (a, c) => area([Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.min(a[2], c[2]), Math.min(a[3], c[3])]);
  const lines = [];
  let worst = 0;
  for (const k of picks) {
    await page.evaluate((k) => window.__siennaDebug.setHover(k), k);
    // SwiftShader frames are slow: wait for the record to be fully up (and the last one back down)
    await page.waitForFunction((k) => { const ss = window.__siennaDebug.rack.core.sleeves; return ss[k].lift > 0.97 && ss.every((s, i) => i === k || s.lift < 0.03); }, k, { timeout: 60000, polling: 200 }).catch(() => console.log(`  #${k} never settled`));
    const now = await page.evaluate(rectsJS);
    const L = now[k], R = rest[k];
    if (!L) continue;
    const cx = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    const shift = Math.hypot(cx(L)[0] - cx(R)[0], cx(L)[1] - cx(R)[1]);
    // neighbours that moved (trough fan) are skipped: only resting ones count
    let cover = 0, covered = 0;
    rest.forEach((r, i) => {
      if (i === k || !r || !now[i] || Math.abs(now[i][0] - r[0]) > 3) return;
      const f = inter(L, r) / (area(r) || 1);
      cover = Math.max(cover, f);
      if (f > 0.3) covered++;
    });
    worst = Math.max(worst, cover);
    lines.push(`#${k} shift=${shift.toFixed(0)}px grow=${(area(L) / area(R)).toFixed(2)} cover=${(cover * 100).toFixed(0)}% hid>30%:${covered}`);
  }
  console.log(`station ${at} (${idx.length} records) worst cover ${(worst * 100).toFixed(0)}%\n  ${lines.join('\n  ')}`);
  await page.close();
}
await b.close(); await server.close();
