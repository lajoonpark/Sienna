// Frame-by-frame trace of the intro push-in: frame time, shader programs compiled, textures,
// shadow-map redraws, main-thread long tasks. SwiftShader is slow, so look at spikes and events, not ms.
//   node scripts/intro-trace.mjs [width] [height] [query]
import { chromium } from 'playwright';
import { createServer } from 'vite';
const w = Number(process.argv[2] ?? 480), h = Number(process.argv[3] ?? 300), q = process.argv[4] ?? '';
const port = Number(process.env.SIENNA_PORT) || 5244;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: w, height: h } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.text().startsWith('[trace]')) console.log(m.text()); });
await page.addInitScript(() => {
  const log = (window.__trace = []);
  
  // virtual clock: every animation frame advances 1/FPS s, however long it really took, so the intro
  // plays every frame even under SwiftShader. Real cost per frame is measured with the saved clock.
  const realNow = performance.now.bind(performance), FPS = Number(new URLSearchParams(location.search).get('vfps')) || 15;
  let vnow = 0, frameReal = realNow();
  // inside a frame time runs at real speed (so per-frame budgets still work), between frames it jumps
  performance.now = () => vnow + Math.min(1000 / FPS - 1, realNow() - frameReal);
  // count real GL work: program links and texture uploads (three's own counters miss re-links)
  const gl = { link: 0, tex: 0, buf: 0 };
  window.__gl = gl;
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
    const P = C.prototype;
    const wrap = (name, key) => { const f = P[name]; P[name] = function (...a) { gl[key]++; return f.apply(this, a); }; };
    wrap('linkProgram', 'link'); wrap('texImage2D', 'tex'); wrap('texSubImage2D', 'tex'); wrap('texStorage2D', 'tex'); wrap('bufferData', 'buf');
  }
  const raf = window.requestAnimationFrame.bind(window);
  let last = 0;
  window.requestAnimationFrame = (cb) => raf(() => {
    vnow += 1000 / FPS; frameReal = realNow();
    const ts = vnow;
    const d = window.__siennaDebug;
    const t0 = realNow();
    const info = d?.renderer.info;
    const g0 = { ...gl };
    const before = info ? { p: info.programs.length, tx: info.memory.textures, g: info.memory.geometries, sh: d.renderer.shadowMap.needsUpdate } : null;
    cb(ts);
    if (d && before) {
      const st = d.state;
      log.push({ cb: cb.name, link: gl.link - g0.link, texUp: gl.tex - g0.tex, buf: gl.buf - g0.buf, at: Math.round(t0), gap: Math.round(t0 - last), v: +(vnow / 1000).toFixed(2), ms: Math.round(realNow() - t0), prog: info.programs.length - before.p, names: info.programs.slice(before.p).map((pr) => pr.name + ':' + pr.cacheKey.slice(0, 50)).join(' | ') || undefined, tex: info.memory.textures - before.tx, geo: info.memory.geometries - before.g, shadow: before.sh || undefined, phase: st.phase, p: +(st.progress ?? 0).toFixed?.(2) });
    }
    last = t0;
  });
});
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&${q}`, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction(() => window.__siennaDebug?.state.introDone && window.__siennaDebug.state.settled, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(3000);
const tr = await page.evaluate(() => window.__trace);
for (const e of tr) console.log(JSON.stringify(e));
await b.close(); await server.close();
