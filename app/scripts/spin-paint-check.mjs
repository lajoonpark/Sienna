// Do the oil dabs go round with the plant-room spinner (brushstrokes.js STROKE_FRAME)?
// 1. Turns the tower to a few angles and, for the tower's pixels only, reports how much shows bare (no dab) and
//    how far the dabs' colour is from the scene under them (sqrt rgb); writes the painted tower as a PNG each.
// 2. follow: the paint's own pattern (painted picture minus the scene: ridges, dab edges, tone of each load) at
//    each angle against the same spot of the tower before it turned. Dabs that go round with it keep it
//    (correlation near 1); dabs pinned to the world lose it at once (near 0).
//   node scripts/spin-paint-check.mjs [out_dir] [turns=0,0.35,0.8,1.6] [dpr=2]   (GPU; SIENNA_PORT, SIENNA_VIEWPORT, SIENNA_QUERY=extra query)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { outDir as safeOutDir } from './safe.mjs';
const outDir = safeOutDir(process.argv[2], 'sienna-spin-paint');
const turns = (process.argv[3] ?? '0,0.35,0.8,1.6').split(',').map(Number), dpr = Number(process.argv[4] ?? 2);
const port = Number(process.env.SIENNA_PORT) || 5252;
const [vw, vh] = (process.env.SIENNA_VIEWPORT || '1440x900').split('x').map(Number);
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=6&guest&tour=0&${process.env.SIENNA_QUERY ?? ""}`, { waitUntil: 'commit', timeout: 0 });
// the cursor in the middle, so the tower holds still (at an edge it turns), and is still at the angle its
// paint was placed at for the first look
await page.mouse.move(vw / 2, vh / 2);
await page.waitForFunction(() => window.__siennaDebug?.state?.settled && window.__siennaDebug.painter?.oil && window.__siennaDebug.rack?.core?.car, null, { timeout: 240000 });
await page.waitForTimeout(6000); // racks and covers in
console.log('renderer:', await page.evaluate(() => { const gl = window.__siennaDebug.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }));
let worst = 0;
for (const turn of turns) {
  const r = await page.evaluate((turn) => {
    const d = window.__siennaDebug, R = d.renderer, THREE = d.THREE, oil = d.painter.oil, car = d.rack.core.car;
    d.pacer.stop();
    d.__spinBase ??= car.rotation.y;
    car.rotation.y = d.__spinBase + turn;
    d.scene.updateMatrixWorld(true);
    const frame = () => { d.painter.invalidate(); d.painter.render(d.scene, d.camera, d.lastFrame.t, null); };
    for (let i = 0; i < 3; i++) frame();
    const st = oil.sceneTarget, W = oil.target.width, H = oil.target.height, box = car.userData.strokeTurn ?? { half: 0.47, y0: 0.139, y1: 2.33 };
    const out = new THREE.WebGLRenderTarget(W, H);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        tPaint: { value: oil.target.texture }, tScene: { value: st.texture }, tDepth: { value: st.depthTexture },
        projInv: { value: d.camera.projectionMatrixInverse.clone() }, viewInv: { value: d.camera.matrixWorld.clone() },
        toCar: { value: car.matrixWorld.clone().invert() }, box: { value: new THREE.Vector3(box.half, box.y0, box.y1) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tPaint, tScene, tDepth; uniform mat4 projInv, viewInv, toCar; uniform vec3 box; varying vec2 vUv;
        void main() {
          vec4 p = texture2D(tPaint, vUv), s = texture2D(tScene, vUv);
          float z = texture2D(tDepth, vUv).x;
          vec4 v = projInv * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
          vec3 L = (toCar * (viewInv * vec4(v.xyz / v.w, 1.0))).xyz;
          float tower = step(z, 0.99999) * step(0.995, s.a) * step(abs(L.x), box.x) * step(abs(L.z), box.x) * step(box.y, L.y) * step(L.y, box.z);
          vec3 c = sqrt(clamp(p.rgb + s.rgb * (1.0 - p.a), 0.0, 1.0));
          float bare = step(p.a, 0.5);
          float off = length(sqrt(clamp(p.rgb / max(p.a, 1e-3), 0.0, 1.0)) - sqrt(clamp(s.rgb, 0.0, 1.0))) * (1.0 - bare);
          // rgb: the painted picture, a: 0 not the tower, else 1 + 100 x bare + off packed below
          gl_FragColor = vec4(tower > 0.5 && bare > 0.5 ? vec3(1.0, 0.0, 1.0) : c * (tower > 0.5 ? 1.0 : 0.4), tower > 0.5 ? (bare > 0.5 ? 1.0 : 0.02 + 0.5 * min(off, 1.0)) : 0.0);
        }`,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
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
    let n = 0, bare = 0, off = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let i = 0; i < W * H; i++) {
      const a = px[i * 4 + 3];
      if (!a) continue;
      n++;
      if (a === 255) bare++; else off += Math.max(0, a / 255 - 0.02) * 2;
      const x = i % W, y = (i / W) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    // the tower's part of the picture, upright, as a PNG
    const pad = 20, cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad), cw = Math.min(W, x1 + pad) - cx0, ch = Math.min(H, y1 + pad) - cy0;
    const cv = document.createElement('canvas'); cv.width = Math.max(1, cw); cv.height = Math.max(1, ch);
    const g = cv.getContext('2d'), img = g.createImageData(cv.width, cv.height);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const s = ((cy0 + ch - 1 - y) * W + cx0 + x) * 4, t = (y * cw + x) * 4;
      img.data[t] = px[s]; img.data[t + 1] = px[s + 1]; img.data[t + 2] = px[s + 2]; img.data[t + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    d.pacer.start();
    return { n, barePct: +(100 * bare / Math.max(1, n)).toFixed(2), off: +(off / Math.max(1, n - bare)).toFixed(3), png: cv.toDataURL('image/png') };
  }, turn);
  const file = `${outDir}/turn-${turn}.png`;
  writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
  worst = Math.max(worst, r.barePct);
  console.log(`turn ${turn} rad: tower ${r.n} px, bare ${r.barePct}%, dab colour off by ${r.off} -> ${file}`);
}
console.log(`worst bare on the tower: ${worst}%`);

// ---- follow ----
const follow = await page.evaluate((turns) => {
  const d = window.__siennaDebug, R = d.renderer, THREE = d.THREE, oil = d.painter.oil, car = d.rack.core.car;
  d.pacer.stop();
  const st = oil.sceneTarget, W = oil.target.width, H = oil.target.height, box = car.userData.strokeTurn ?? { half: 0.47, y0: 0.139, y1: 2.33 };
  const frame = (turn) => {
    car.rotation.y = d.__spinBase + turn;
    d.scene.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) { d.painter.invalidate(); d.painter.render(d.scene, d.camera, d.lastFrame.t, null); }
  };
  // this frame's tower, as world position (xyz, w = 1 on the tower) and paint pattern (luma of picture - scene)
  const grab = () => {
    const pos = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
    const m = new THREE.ShaderMaterial({
      uniforms: {
        tPaint: { value: oil.target.texture }, tScene: { value: st.texture }, tDepth: { value: st.depthTexture },
        projInv: { value: d.camera.projectionMatrixInverse.clone() }, viewInv: { value: d.camera.matrixWorld.clone() },
        toCar: { value: car.matrixWorld.clone().invert() }, box: { value: new THREE.Vector3(box.half, box.y0, box.y1) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tPaint, tScene, tDepth; uniform mat4 projInv, viewInv, toCar; uniform vec3 box; varying vec2 vUv;
        void main() {
          vec4 p = texture2D(tPaint, vUv), s = texture2D(tScene, vUv);
          float z = texture2D(tDepth, vUv).x;
          vec4 v = projInv * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
          vec3 L = (toCar * (viewInv * vec4(v.xyz / v.w, 1.0))).xyz;
          float tower = step(z, 0.99999) * step(0.995, s.a) * step(abs(L.x), box.x - 0.03) * step(abs(L.z), box.x - 0.03) * step(box.y + 0.03, L.y) * step(L.y, box.z);
          vec3 c = p.rgb + s.rgb * (1.0 - p.a);
          float res = dot(sqrt(max(c, 0.0)) - sqrt(max(s.rgb, 0.0)), vec3(0.3, 0.5, 0.2));
          gl_FragColor = vec4(L, tower > 0.5 ? res : -9.0);
        }`,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(q);
    R.setRenderTarget(pos); R.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    const px = new Float32Array(W * H * 4); R.readRenderTargetPixels(pos, 0, 0, W, H, px); R.setRenderTarget(null);
    pos.dispose(); m.dispose();
    return px;
  };
  frame(0);
  const base = grab();
  // where each spot of the tower was before it turned: on the screen at turn 0, found by projecting it back
  const before = car.matrixWorld.clone();
  const results = [];
  for (const turn of turns.filter((t) => t > 0)) {
    frame(turn);
    const now = grab();
    const v = new THREE.Vector3();
    const a = [], bb = [];
    for (let i = 0; i < W * H; i += 3) {
      if (now[i * 4 + 3] < -5) continue;
      v.set(now[i * 4], now[i * 4 + 1], now[i * 4 + 2]).applyMatrix4(before).project(d.camera);
      const x = Math.floor((v.x * 0.5 + 0.5) * W), y = Math.floor((v.y * 0.5 + 0.5) * H);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = (y * W + x) * 4;
      if (base[j + 3] < -5) continue;
      // the same spot (not something in front of it then)
      if (Math.hypot(base[j] - now[i * 4], base[j + 1] - now[i * 4 + 1], base[j + 2] - now[i * 4 + 2]) > 0.01) continue;
      a.push(now[i * 4 + 3]); bb.push(base[j + 3]);
    }
    const mean = (x) => x.reduce((s, t) => s + t, 0) / x.length;
    const ma = mean(a), mb = mean(bb);
    let sab = 0, saa = 0, sbb = 0;
    for (let k = 0; k < a.length; k++) { const p = a[k] - ma, q = bb[k] - mb; sab += p * q; saa += p * p; sbb += q * q; }
    results.push({ turn, spots: a.length, corr: +(sab / Math.sqrt(saa * sbb)).toFixed(3) });
  }
  car.rotation.y = d.__spinBase;
  d.pacer.start();
  return results;
}, turns);
for (const f of follow) console.log(`follow: turned ${f.turn} rad, ${f.spots} spots seen both times, paint pattern correlation ${f.corr} (1 = goes round with the tower, 0 = pinned to the world)`);
await b.close(); await server.close();
