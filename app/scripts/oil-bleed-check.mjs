// Finds oil dabs that run over onto another surface (Settings > Painting > Oil paint): wall paint laid over
// the green sign board, a frame's colour over the wall next to it. A pixel counts as BLED when the painted
// colour there is far from what the scene draws there, but close to what the scene draws a few pixels away
// on the other side of a colour edge: its paint came from the neighbour. Ridges and the dabs' own small
// changes of tone do not count (they match neither side better).
// For each view prints the share of the paintable picture that bled (all paint; placed dabs only; under-coat
// only), the biggest patches (where, how big), and writes <view>-map.png (bled pixels magenta over the frame)
// and <view>-top.png (the worst patches, scene as drawn | painted, side by side).
//   node scripts/oil-bleed-check.mjs [out] [views] [dpr] [query]
//   views: t<seconds> = the intro in shot mode at that time (the street, the shop front), home or a station
//   number = settled there (?at=). Default t3,t5,t6.5,home,0,1,2,3,4,5,6,7
//   SIENNA_VIEWPORT=1440x900  SIENNA_PORT  T=0.16 (how far off its own colour paint must be)
//   CROP=x,y,w,h (CSS px): also <view>-crop.jpg, that part as drawn | painted, enlarged
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { outDir as safeOutDir } from './safe.mjs';
const outDir = safeOutDir(process.argv[2], 'sienna-oil-bleed');
const views = (process.argv[3] ?? 't3,t5,t6.5,home,0,1,2,3,4,5,6,7').split(',');
const dpr = Number(process.argv[4] ?? 2), q = process.argv[5] ?? '';
const port = Number(process.env.SIENNA_PORT) || 5253;
const [vw, vh] = (process.env.SIENNA_VIEWPORT || '1440x900').split('x').map(Number);
const T = Number(process.env.T) || 0.16;
const CROP = process.env.CROP ? process.env.CROP.split(',').map(Number) : null;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });

// in the page: draw the frame three ways (all paint, placed dabs only, under-coat only) and find what bled
async function measure(page, T) {
  return page.evaluate(({ T, CROP }) => {
    const d = window.__siennaDebug, R = d.renderer, THREE = d.THREE, oil = d.painter.oil;
    d.pacer?.stop();
    const st = oil.sceneTarget, W = st.width, H = st.height;
    const under = oil.underUniforms.under.value, underWas = under.y;
    const layersWas = oil.scene.children.map((m) => m.visible);
    const out = new THREE.WebGLRenderTarget(W, H);
    const m = new THREE.ShaderMaterial({
      uniforms: { tPaint: { value: oil.target.texture }, tScene: { value: st.texture }, tDepth: { value: st.depthTexture }, px: { value: new THREE.Vector2(1 / W, 1 / H) }, T: { value: T } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
uniform sampler2D tPaint; uniform sampler2D tScene; uniform sampler2D tDepth; uniform vec2 px; uniform float T;
varying vec2 vUv;
vec3 S(vec2 uv) { return sqrt(clamp(texture2D(tScene, uv).rgb, 0.0, 1.0)); }
void main() {
  vec4 s = texture2D(tScene, vUv), p = texture2D(tPaint, vUv);
  float sky = step(0.99999, texture2D(tDepth, vUv).x);
  // only what oil paints: not the sky, crisp things, glass, records, the decor spines (alpha flags < 0.995)
  if (sky > 0.5 || s.a < 0.995 || p.a < 0.02) { gl_FragColor = vec4(0.0); return; }
  vec3 s0 = sqrt(clamp(s.rgb, 0.0, 1.0)), c = sqrt(clamp(p.rgb + s.rgb * (1.0 - p.a), 0.0, 1.0));
  float e0 = length(c - s0);
  float best = 9.0;
  if (e0 > T) {
    for (int ri = 0; ri < 5; ri++) {
      float r = ri == 0 ? 3.0 : ri == 1 ? 6.0 : ri == 2 ? 10.0 : ri == 3 ? 16.0 : 24.0;
      for (int k = 0; k < 16; k++) {
        float a = float(k) * 0.3927;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * px;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
        if (texture2D(tDepth, uv).x >= 0.99999) continue;
        vec3 sq = S(uv);
        if (length(sq - s0) < T) continue;   // the same colour as here: not across an edge
        best = min(best, length(c - sq));
      }
    }
  }
  float bled = step(T, e0) * step(best, 0.55 * e0) * step(best, 0.12);
  gl_FragColor = vec4(bled, 1.0, 0.0, 1.0);
}`,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    quad.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(quad);
    const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const px = new Uint8Array(W * H * 4);
    const run = (placed, underOn) => {
      oil.scene.children.forEach((c, i) => { c.visible = placed && layersWas[i]; });
      under.y = underOn ? underWas : 0;
      d.painter.invalidate?.();
      d.painter.render(d.scene, d.camera, d.lastFrame?.t ?? 0, null);
      R.setRenderTarget(out);
      R.render(sc, flat);
      R.readRenderTargetPixels(out, 0, 0, W, H, px);
      R.setRenderTarget(null);
      let bled = 0, paintable = 0;
      const mask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) { if (px[i * 4 + 1] > 128) paintable++; if (px[i * 4] > 128) { bled++; mask[i] = 1; } }
      return { pct: +(100 * bled / Math.max(1, paintable)).toFixed(3), mask };
    };
    const placedOnly = run(true, false), underOnly = run(false, true), all = run(true, true);
    oil.scene.children.forEach((c, i) => { c.visible = layersWas[i]; });
    under.y = underWas;
    // the frame as shown (all paint), and the scene as drawn, from the painter's final pass
    d.painter.invalidate?.();
    d.painter.render(d.scene, d.camera, d.lastFrame?.t ?? 0, null);
    const canvas = R.domElement;
    const shot = document.createElement('canvas'); shot.width = canvas.width; shot.height = canvas.height;
    shot.getContext('2d').drawImage(canvas, 0, 0);
    // the scene as drawn (sRGB), for the side by side
    const sm = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: st.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tScene; varying vec2 vUv; void main() { vec3 c = clamp(texture2D(tScene, vUv).rgb, 0.0, 1.0); gl_FragColor = vec4(mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)), 1.0); }',
      depthTest: false, depthWrite: false,
    });
    quad.material = sm;
    R.setRenderTarget(out); R.render(sc, flat);
    const raw = new Uint8Array(W * H * 4);
    R.readRenderTargetPixels(out, 0, 0, W, H, raw);
    R.setRenderTarget(null);
    out.dispose(); m.dispose(); sm.dispose();
    d.pacer?.start();
    // patches: bled pixels in 8 x 8 blocks, joined into regions
    const B = 8, bw = Math.ceil(W / B), bh = Math.ceil(H / B), blk = new Uint16Array(bw * bh);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (all.mask[y * W + x]) blk[Math.floor(y / B) * bw + Math.floor(x / B)]++;
    const seen = new Uint8Array(bw * bh), patches = [];
    for (let i = 0; i < bw * bh; i++) {
      if (seen[i] || blk[i] < 6) continue;
      const stack = [i]; seen[i] = 1;
      let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      while (stack.length) {
        const j = stack.pop(), x = j % bw, y = Math.floor(j / bw);
        n += blk[j]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy, k = yy * bw + xx;
          if (xx < 0 || yy < 0 || xx >= bw || yy >= bh || seen[k] || blk[k] < 6) continue;
          seen[k] = 1; stack.push(k);
        }
      }
      // (picture rows run bottom up in the readback; report them top down, in CSS px)
      patches.push({ px: n, x: Math.round(x0 * B / devicePixelRatio), y: Math.round((H - (y1 + 1) * B) / devicePixelRatio), w: Math.round((x1 - x0 + 1) * B / devicePixelRatio), h: Math.round((y1 - y0 + 1) * B / devicePixelRatio), bx: [x0 * B, (x1 + 1) * B], by: [y0 * B, (y1 + 1) * B] });
    }
    patches.sort((a, b) => b.px - a.px);
    // the map: the frame, bled pixels magenta (the canvas may be another size than the scene target)
    const map = document.createElement('canvas'); map.width = W; map.height = H;
    const mc = map.getContext('2d'); mc.drawImage(shot, 0, 0, W, H);
    const img = mc.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (all.mask[(H - 1 - y) * W + x]) { const t = (y * W + x) * 4; img.data[t] = 255; img.data[t + 1] = 0; img.data[t + 2] = 255; }
    mc.putImageData(img, 0, 0);
    // the worst patches: scene as drawn | painted
    const sceneC = document.createElement('canvas'); sceneC.width = W; sceneC.height = H;
    const scx = sceneC.getContext('2d'), si = scx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = ((H - 1 - y) * W + x) * 4, t = (y * W + x) * 4; si.data[t] = raw[s]; si.data[t + 1] = raw[s + 1]; si.data[t + 2] = raw[s + 2]; si.data[t + 3] = 255; }
    scx.putImageData(si, 0, 0);
    const top = patches.slice(0, 6), CS = 260;
    const tc = document.createElement('canvas'); tc.width = CS * 2 + 10; tc.height = Math.max(1, top.length) * (CS + 10);
    const tx = tc.getContext('2d');
    top.forEach((p, i) => {
      const cxp = (p.bx[0] + p.bx[1]) / 2, cyp = H - (p.by[0] + p.by[1]) / 2, half = Math.max(60, Math.min(220, Math.max(p.bx[1] - p.bx[0], p.by[1] - p.by[0]) * 0.75));
      const sx = Math.max(0, cxp - half), sy = Math.max(0, cyp - half);
      tx.drawImage(sceneC, sx, sy, half * 2, half * 2, 0, i * (CS + 10), CS, CS);
      tx.drawImage(shot, sx * canvas.width / W, sy * canvas.height / H, half * 2 * canvas.width / W, half * 2 * canvas.height / H, CS + 10, i * (CS + 10), CS, CS);
    });
    // CROP (CSS px x,y,w,h): that part, scene as drawn | painted, bigger
    let crop = null;
    if (CROP) {
      const k = W / innerWidth, [x, y, w, h] = CROP.map((v) => v * k), z = Math.min(2, 900 / w);
      const cc = document.createElement('canvas'); cc.width = Math.round(w * z) * 2 + 10; cc.height = Math.round(h * z);
      const c2 = cc.getContext('2d');
      c2.drawImage(sceneC, x, y, w, h, 0, 0, w * z, h * z);
      c2.drawImage(shot, x * canvas.width / W, y * canvas.height / H, w * canvas.width / W, h * canvas.height / H, w * z + 10, 0, w * z, h * z);
      crop = cc.toDataURL('image/jpeg', 0.92);
    }
    return {
      crop,
      size: `${W}x${H}`, all: all.pct, placed: placedOnly.pct, under: underOnly.pct,
      patches: patches.slice(0, 8).map(({ px, x, y, w, h }) => ({ px, x, y, w, h })),
      map: map.toDataURL('image/jpeg', 0.85), top: tc.toDataURL('image/jpeg', 0.9),
    };
  }, { T, CROP });
}

const save = (file, url) => writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
const report = (view, r) => {
  console.log(`${view} ${r.size}: bled ${r.all}% of the paintable picture (placed dabs alone ${r.placed}%, under-coat alone ${r.under}%)`);
  for (const p of r.patches) console.log(`   ${p.px} px at x ${p.x} y ${p.y}, ${p.w} x ${p.h} (CSS px)`);
  save(`${outDir}/${view}-map.jpg`, r.map);
  save(`${outDir}/${view}-top.jpg`, r.top);
  if (r.crop) save(`${outDir}/${view}-crop.jpg`, r.crop);
};
const totals = [];
const times = views.filter((v) => v.startsWith('t')).map((v) => Number(v.slice(1)));
if (times.length) {
  const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shot&shelves=8&hour=12&${q}`, { timeout: 0 });
  await page.waitForFunction(() => window.__ready === true && window.__siennaDebug?.painter?.oil, null, { timeout: 600000 });
  for (const t of times) {
    await page.evaluate(async (t) => { const tl = window.__siennaDebug.tilt; if (tl) { tl.x = tl.tx = 0; tl.y = tl.ty = 0; } await window.__seek(t); await window.__seek(t); }, t);
    const r = await measure(page, T);
    report(`t${t}`, r); totals.push(r.all);
  }
  await page.close();
}
for (const at of views.filter((v) => !v.startsWith('t'))) {
  const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&guest&tour=0&${q}`, { waitUntil: 'commit', timeout: 0 });
  await page.waitForFunction(() => window.__siennaDebug?.state?.settled && window.__siennaDebug.pacer && window.__siennaDebug.painter?.oil, null, { timeout: 240000 });
  await page.waitForTimeout(6000); // racks and covers in
  const r = await measure(page, T);
  report(at, r); totals.push(r.all);
  await page.close();
}
console.log(`mean bled ${(totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length)).toFixed(3)}% over ${totals.length} views -> ${outDir}`);
await b.close(); await server.close();
