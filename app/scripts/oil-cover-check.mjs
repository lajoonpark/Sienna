// How much of the shop the oil dabs cover (Oil paint). For each view: the share of the
// paintable picture (not sky, not crisp covers and labels, not the suitcase) that no dab reaches, and a map of
// it: the shop where dabs cover it, magenta where it shows bare (records, which move, are not counted). Variants change the dabs' uniforms to see
// what leaves the gaps.
//   node scripts/oil-cover-check.mjs out [at=home,0,3] [dpr=2] [query]
//   VARIANTS='[{},{"keep":[1,1,1]}]'  SIENNA_VIEWPORT=1440x900  SIENNA_PORT
// A variant sets uniforms on every layer's material ({"name": value}, or [coat, medium, fine] for one each);
// "layers": [1, 1, 0] picks the layers drawn.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { outDir as safeOutDir } from './safe.mjs';
const outDir = safeOutDir(process.argv[2], 'sienna-oil-cover');
const ats = (process.argv[3] ?? 'home,0,3').split(','), dpr = Number(process.argv[4] ?? 2), q = process.argv[5] ?? '';
const port = Number(process.env.SIENNA_PORT) || 5251;
const [vw, vh] = (process.env.SIENNA_VIEWPORT || '1440x900').split('x').map(Number);
const variants = JSON.parse(process.env.VARIANTS || '[{}]');
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
for (const at of ats) {
  const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&guest&tour=0&${q}`, { waitUntil: 'commit', timeout: 0 });
  await page.waitForFunction(() => window.__siennaDebug?.state?.settled && window.__siennaDebug.pacer && window.__siennaDebug.painter?.oil, null, { timeout: 240000 });
  await page.waitForTimeout(6000); // racks and covers in
  for (const [vi, v] of variants.entries()) {
    const r = await page.evaluate((v) => {
      const d = window.__siennaDebug, R = d.renderer, THREE = d.THREE, oil = d.painter.oil;
      d.pacer.stop();
      const undo = [];
      for (const [k, val] of Object.entries(v)) {
        oil.materials.forEach((m, i) => {
          const u = m.uniforms[k];
          if (!u) return;
          const was = u.value?.clone ? u.value.clone() : u.value;
          const x = Array.isArray(val) && val.length === 3 && (Array.isArray(val[0]) || typeof u.value === 'number') ? val[i] : val;
          if (u.value?.set && Array.isArray(x)) u.value.set(...x); else u.value = x;
          undo.push(() => { if (u.value?.copy) u.value.copy(was); else u.value = was; });
        });
      }
      // "count": how many dab fragments each pixel works out (additive), reported as overdraw
      if (v.count) oil.materials.forEach((m) => {
        const was = [m.defines, m.blending, m.depthTest, m.depthWrite];
        m.defines = { ...m.defines, COUNT: '' }; m.blending = THREE.AdditiveBlending; m.needsUpdate = true;
        undo.push(() => { [m.defines, m.blending, m.depthTest, m.depthWrite] = was; m.needsUpdate = true; });
      });
      if (v.layers) oil.scene.children.forEach((m, i) => { const was = m.visible; m.visible = !!v.layers[i]; undo.push(() => { m.visible = was; }); });
      // what a whole frame costs this way, GPU included (as scripts/frame-bench.mjs)
      const gl = R.getContext(), one = new Uint8Array(4);
      const frame = () => { d.painter.invalidate(); d.painter.render(d.scene, d.camera, d.lastFrame.t, null); };
      const sync = () => { R.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one); };
      for (let i = 0; i < 3; i++) frame();
      sync();
      let t0 = performance.now();
      for (let i = 0; i < 12; i++) frame();
      sync();
      const frameMs = +((performance.now() - t0) / 12).toFixed(1);
      frame();
      const st = oil.sceneTarget, W = oil.target.width, H = oil.target.height;
      const out = new THREE.WebGLRenderTarget(W, H);
      const m = new THREE.ShaderMaterial({
        uniforms: { tPaint: { value: oil.target.texture }, tScene: { value: st.texture }, tDepth: { value: st.depthTexture } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `uniform sampler2D tPaint; uniform sampler2D tScene; uniform sampler2D tDepth; varying vec2 vUv;
          void main() {
            vec4 p = texture2D(tPaint, vUv), s = texture2D(tScene, vUv);
            float sky = step(0.99999, texture2D(tDepth, vUv).x), crisp = step(s.a, 0.995);   // (and things that move: materials.js unpinned)
            if (COUNT > 0) { gl_FragColor = vec4(p.r / 64.0, 0.0, 0.0, (1.0 - sky) * (1.0 - crisp)); return; }
            vec3 c = sqrt(clamp(p.rgb + s.rgb * (1.0 - p.a), 0.0, 1.0));
            float bare = (1.0 - sky) * (1.0 - crisp) * step(p.a, 0.5);
            gl_FragColor = vec4(bare > 0.5 ? vec3(1.0, 0.0, 1.0) : (sky + crisp > 0.5 ? c * 0.5 : c), bare > 0.5 ? 0.0 : (sky + crisp > 0.5 ? 0.5 : 1.0));
          }`,
        defines: { COUNT: v.count ? 1 : 0 },
        depthTest: false, depthWrite: false,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
      quad.frustumCulled = false;
      const sc = new THREE.Scene(); sc.add(quad);
      R.setRenderTarget(out);
      R.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
      const px = new Uint8Array(W * H * 4);
      R.readRenderTargetPixels(out, 0, 0, W, H, px);
      R.setRenderTarget(null);
      out.dispose(); m.dispose();
      if (v.count) {
        let sum = 0, n = 0;
        for (let i = 0; i < W * H; i++) if (px[i * 4 + 3] > 128) { sum += px[i * 4] * 64 / 255; n++; }
        undo.forEach((f) => f());
        d.pacer.start();
        return { overdraw: +(sum / Math.max(1, n)).toFixed(2) };
      }
      let bare = 0, paintable = 0;
      for (let i = 0; i < W * H; i++) { const a = px[i * 4 + 3]; if (a < 64) { bare++; paintable++; } else if (a > 192) paintable++; }
      // the map, upright, as a PNG
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d'), img = cx.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = ((H - 1 - y) * W + x) * 4, t = (y * W + x) * 4;
        img.data[t] = px[s]; img.data[t + 1] = px[s + 1]; img.data[t + 2] = px[s + 2]; img.data[t + 3] = 255;
      }
      cx.putImageData(img, 0, 0);
      undo.forEach((f) => f());
      d.pacer.start();
      return { frameMs, counts: oil.strokes.counts, caps: oil.strokes.caps, size: `${W}x${H}`, barePct: +(100 * bare / Math.max(1, paintable)).toFixed(2), png: cv.toDataURL('image/png') };
    }, v);
    if (r.overdraw !== undefined) { console.log(`at=${at} ${JSON.stringify(v)} overdraw ${r.overdraw} dab fragments per paintable pixel`); continue; }
    const file = `${outDir}/${at}-v${vi}.png`;
    writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
    if (!vi) console.log(`at=${at} strokes ${r.counts.join('/')} of ${r.caps.join('/')}`);
    console.log(`at=${at} ${JSON.stringify(v)} ${r.size} bare ${r.barePct}% of the paintable picture, ${r.frameMs} ms a frame (no suitcase) -> ${file}`);
  }
  // and the picture itself, as the app shows it
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${at}-shot.png` });
  await page.close();
}
await b.close(); await server.close();
