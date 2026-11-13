// Measures flicker while the camera moves: plays the intro push-in on a virtual clock (every frame
// = 1/VFPS s, however slow), grabs every frame right after it is drawn and counts "flips": pixels that
// get brighter then darker again (or the reverse) by more than FLIP_T within three frames. A moving
// edge changes a pixel one way only, so flips are paint popping, shimmering or boiling, not motion.
// Writes a heat map (where it flickers) and a few frames to <out>.
//   node scripts/flicker-check.mjs [out] [query] [width] [height]
//   e.g. node scripts/flicker-check.mjs /tmp/fl "wc=0"   (compare against the unpainted render)
//   SHOTS=120,121 saves those frames; MARK=1 marks in magenta the pixels that flipped there
// Runs on the Radeon (GPU flags, see work rules).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] ?? 'flicker-out';
const q = process.argv[3] ?? '';
const w = Number(process.argv[4] ?? 960), h = Number(process.argv[5] ?? 600);
const VFPS = Number(process.env.VFPS) || 30;
fs.mkdirSync(out, { recursive: true });
const port = Number(process.env.SIENNA_PORT) || 5246;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Number(process.env.DPR) || 2 }); // 2 = the Mac's Retina path (MSAA, half-size wash)
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(({ FPS }) => {
  const realNow = performance.now.bind(performance);
  let vnow = 0, frameReal = realNow();
  performance.now = () => vnow + Math.min(1000 / FPS - 1, realNow() - frameReal);
  const T = 10; // flip threshold in 0..255 luma, after a 3x3 box average (so pixel-level noise from
  // shrinking the picture does not count; what a viewer sees flicker is bigger than a pixel)
  const grab = document.createElement('canvas');
  const g = grab.getContext('2d', { willReadFrequently: true });
  let W = 0, H = 0;
  const st = (window.__flick = { frames: 0, flips: [], heat: null, W: 0, H: 0, shots: {} });
  let prev2 = null, prev1 = null;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf(() => {
    vnow += 1000 / FPS; frameReal = realNow();
    cb(vnow);
    const d = window.__siennaDebug;
    if (!d || !d.state.phase || !window.__flickOn || (!window.__flickIdle && d.state.introDone) || st.frames >= (window.__flickIdle ?? 1e9)) return;
    const c = d.renderer.domElement;
    if (!W) { grab.width = c.width; grab.height = c.height; W = st.W = Math.floor(c.width / 3); H = st.H = Math.floor(c.height / 3); st.heat = new Float32Array(W * H); }
    g.drawImage(c, 0, 0);
    const px = g.getImageData(0, 0, grab.width, grab.height).data, CW = grab.width;
    const lum = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) { const i = ((y * 3 + j) * CW + x * 3 + k) * 4; s += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; }
      lum[y * W + x] = s / 9;
    }
    const shoot = (window.__flickShots ?? [30, 120, 210]).includes(st.frames + 1);
    const flipped = shoot && window.__flickMark ? [] : null;
    if (prev2) {
      let n = 0;
      for (let i = 0; i < W * H; i++) {
        const a = prev1[i] - prev2[i], bb = lum[i] - prev1[i];
        if (a * bb < 0 && Math.abs(a) > T && Math.abs(bb) > T) { n++; st.heat[i]++; flipped?.push(i); }
      }
      st.flips.push(n / (W * H));
    }
    prev2 = prev1; prev1 = lum;
    st.frames++;
    if (shoot) {
      // MARK=1: the shots show the pixels that flipped there (the frame before was the odd one out) in magenta
      if (flipped) {
        const im = g.getImageData(0, 0, grab.width, grab.height);
        for (const i of flipped) { const x = i % W, y = (i / W) | 0; for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) im.data.set([255, 0, 255], ((y * 3 + j) * CW + x * 3 + k) * 4); }
        g.putImageData(im, 0, 0);
        st.shots[st.frames] = grab.toDataURL('image/png');
      } else st.shots[st.frames] = c.toDataURL('image/png');
    }
  });
}, { FPS: VFPS });
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&hour=12&${q}`, { waitUntil: 'commit', timeout: 0 });
const IDLE = Number(process.env.IDLE) || 0; // IDLE=n: n frames with the camera still, after the intro
if (IDLE) {
  await page.waitForFunction(() => window.__siennaDebug?.state.introDone && window.__siennaDebug.state.settled, null, { timeout: 900000, polling: 1000 });
  await page.waitForTimeout(2000);
  await page.evaluate((n) => { window.__flickIdle = n; window.__flickOn = true; }, IDLE);
  await page.waitForFunction((n) => window.__flick.frames >= n, IDLE, { timeout: 900000, polling: 500 });
} else {
  await page.waitForFunction(() => window.__siennaDebug?.state.phase, null, { timeout: 600000, polling: 200 });
  await page.evaluate((s) => { window.__flickOn = true; window.__flickMark = !!Number(s.split('|')[1] ?? 0); s = s.split('|')[0]; if (s) window.__flickShots = s.split(',').map(Number); }, `${process.env.SHOTS ?? ''}|${process.env.MARK ?? 0}`);
  await page.waitForFunction(() => window.__siennaDebug.state.introDone, null, { timeout: 900000, polling: 1000 });
}
const r = await page.evaluate(() => {
  const s = window.__flick;
  const c = document.createElement('canvas'); c.width = s.W; c.height = s.H;
  const x = c.getContext('2d'); const im = x.createImageData(s.W, s.H);
  // (full orange = hot: flipped in a tenth of the frames)
  for (let i = 0; i < s.heat.length; i++) { const v = Math.min(255, (s.heat[i] / Math.max(1, s.frames * 0.1)) * 255); im.data.set([v, v * 0.4, 0, 255], i * 4); }
  x.putImageData(im, 0, 0);
  const sorted = [...s.flips].sort((a, b) => a - b);
  // hot: share of pixels that flipped in more than a tenth of the frames (flicker that keeps on, not one pop)
  const hot = s.heat.reduce((a, v) => a + (v > s.frames * 0.1 ? 1 : 0), 0) / s.heat.length;
  return { hot, frames: s.frames, mean: s.flips.reduce((a, b) => a + b, 0) / Math.max(1, s.flips.length), p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, heat: c.toDataURL('image/png'), shots: s.shots };
});
const save = (name, url) => fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
save('heat.png', r.heat);
for (const [k, v] of Object.entries(r.shots)) save(`frame-${k}.png`, v);
const renderer = await page.evaluate(() => { const gl = window.__siennaDebug.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
console.log(JSON.stringify({ query: q, frames: r.frames, flipMeanPct: +(r.mean * 100).toFixed(3), flipP95Pct: +(r.p95 * 100).toFixed(3), hotPct: +(r.hot * 100).toFixed(3), renderer }));
await b.close(); await server.close();
