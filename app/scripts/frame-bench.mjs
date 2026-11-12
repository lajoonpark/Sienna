// What a whole frame costs, on the GPU: N whole frames painted back to back (nothing skipped by the still-frame
// cache), one GPU sync at the end, ms per frame. Also the JS side alone: a frame in which nothing changed
// (the watchers' look at the scene, nothing drawn) and three's render call for the scene.
// Variants turn parts off to see what they cost: noOverlay (the suitcase), noPoint (every lamp light),
// noBricks (the big instanced parts). Compare before/after on the same machine.
//   node scripts/frame-bench.mjs [at=home,0] [dpr=2] [query]      e.g. node scripts/frame-bench.mjs home 2 "sharp=full"
//   VARIANTS='[{},{"noPoint":true}]'  SIENNA_VIEWPORT=1440x900  SIENNA_PORT
import { chromium } from 'playwright';
import { createServer } from 'vite';
const ats = (process.argv[2] ?? 'home,0').split(','), dpr = Number(process.argv[3] ?? 2), q = process.argv[4] ?? '';
const port = Number(process.env.SIENNA_PORT) || 5249;
const [vw, vh] = (process.env.SIENNA_VIEWPORT || '1440x900').split('x').map(Number);
const variants = JSON.parse(process.env.VARIANTS || '[{}]');
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
for (const at of ats) {
  const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&guest&tour=0&${q}`, { waitUntil: 'commit', timeout: 0 });
  await page.waitForFunction(() => window.__siennaDebug?.state.settled && window.__siennaDebug.pacer, null, { timeout: 240000 });
  await page.waitForTimeout(6000); // racks and covers in
  const gpu = await page.evaluate(() => { const gl = window.__siennaDebug.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
  const rows = [];
  for (const v of variants) {
    rows.push([JSON.stringify(v), await page.evaluate((v) => {
      const d = window.__siennaDebug, R = d.renderer, gl = R.getContext(), px = new Uint8Array(4);
      d.pacer.stop();
      const undo = [];
      d.scene.traverse((o) => {
        const off = (v.noPoint && o.isPointLight) || (v.noBricks && o.isInstancedMesh && o.count > 200);
        if (off && o.visible) { o.visible = false; undo.push(() => { o.visible = true; }); }
      });
      const overlay = v.noOverlay ? null : d.suitcase.overlay;
      const one = () => { d.painter.invalidate(); d.painter.render(d.scene, d.camera, d.lastFrame.t, overlay); };
      const sync = () => { R.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      for (let i = 0; i < 3; i++) one(); // (compiles, uploads)
      sync();
      const N = 20;
      let s = performance.now();
      for (let i = 0; i < N; i++) one();
      sync();
      const frame = (performance.now() - s) / N;
      s = performance.now();
      for (let i = 0; i < N; i++) d.painter.render(d.scene, d.camera, d.lastFrame.t, overlay);
      const still = (performance.now() - s) / N;
      s = performance.now();
      for (let i = 0; i < 5; i++) { R.setRenderTarget(d.painter.target); R.render(d.scene, d.camera); }
      const sceneJs = (performance.now() - s) / 5;
      const { calls, triangles } = R.info.render;
      sync();
      undo.forEach((f) => f());
      d.pacer.start();
      return { frameMs: +frame.toFixed(1), stillFrameJsMs: +still.toFixed(2), sceneCallJsMs: +sceneJs.toFixed(1), calls, triangles };
    }, v)]);
  }
  const buf = await page.evaluate(() => [window.__siennaDebug.renderer.domElement.width, window.__siennaDebug.renderer.domElement.height]);
  console.log(`at=${at} dpr=${dpr} ${q} buffer ${buf.join('x')} on ${gpu}`);
  for (const [k, r] of rows) console.log('  ', k.padEnd(20), JSON.stringify(r));
  await page.close();
}
await b.close(); await server.close();
