// The paint wipe on a long trip (nav.js JUMP): flies home -> a far station on a virtual clock (every frame
// drawn, however slow the GPU), saves every few frames and logs the wipe and the camera's jumps. Fails if the
// camera moves more than CUT metres in one frame while the paint does not fully cover the picture (wipe != 1).
//   node scripts/wipe-check.mjs out_dir [to=7] [from=home]     (SIENNA_PORT, FPS=20, EVERY=2)
//   INTERRUPT=frame,station: pick another section at that frame (the wipe must run on, or back off, without a jump)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { outDir as safeOutDir } from './safe.mjs';
const outDir = safeOutDir(process.argv[2], 'sienna-wipe');
const to = Number(process.argv[3] ?? 7), from = process.argv[4] ?? 'home';
const port = Number(process.env.SIENNA_PORT) || 5253, FPS = Number(process.env.FPS ?? 20), EVERY = Number(process.env.EVERY ?? 2), CUT = 0.8;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${from}&guest&tour=0`, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction(() => window.__siennaDebug?.state.settled && window.__siennaDebug.pacer, null, { timeout: 240000 });
await page.waitForTimeout(3000);
// virtual clock from here on: each animation frame is 1/FPS s of app time
await page.evaluate((FPS) => {
  const realRaf = window.requestAnimationFrame.bind(window);
  let vt = performance.now();
  const realNow = performance.now.bind(performance);
  const off = realNow() - vt;
  performance.now = () => vt;
  window.__step = () => new Promise((res) => { vt += 1000 / FPS; realRaf(() => realRaf(res)); });
  void off;
}, FPS);
await page.evaluate((to) => window.__siennaDebug.nav.go(to), to);
let bad = 0, last = null, lastWipe = 0;
const [intF, intTo] = (process.env.INTERRUPT ?? '').split(',').map(Number);
for (let f = 0; f < FPS * 6; f++) {
  if (f === intF) await page.evaluate((i) => window.__siennaDebug.nav.go(i), intTo);
  await page.evaluate(() => window.__step());
  const s = await page.evaluate(() => { const d = window.__siennaDebug; return { wipe: d.nav.wipe, pos: d.nav.pose.pos.toArray(), flying: d.state.flying }; });
  const prevWipe = last ? lastWipe : 0;
  lastWipe = s.wipe;
  // a wipe never jumps (on or off) by more than a frame's worth of its quickest step
  if (Math.abs(s.wipe - prevWipe) > 0.45 && !(prevWipe > 1.5 && s.wipe === 0) && !(prevWipe === 0 && s.wipe < 0.45)) { bad++; console.log('   WIPE JUMP', prevWipe.toFixed(2), '->', s.wipe.toFixed(2)); }
  const moved = last ? Math.hypot(s.pos[0] - last[0], s.pos[1] - last[1], s.pos[2] - last[2]) : 0;
  const cut = moved > CUT;
  if (cut && Math.abs(s.wipe - 1) > 1e-3) bad++;
  console.log(`f${f} t=${(f / FPS).toFixed(2)} wipe=${s.wipe.toFixed(2)} moved=${moved.toFixed(2)}${cut ? ' CUT' : ''}${cut && Math.abs(s.wipe - 1) > 1e-3 ? ' UNCOVERED' : ''}`);
  if (f % EVERY === 0 || cut) await page.screenshot({ path: `${outDir}/f${String(f).padStart(3, '0')}.png` });
  last = s.pos;
  if (!s.flying && f > 5) break;
}
console.log(bad ? `${bad} problem(s): cuts not covered or wipe jumps` : 'every cut is covered by the paint, the wipe never jumps');
await b.close(); await server.close();
process.exit(bad ? 1 : 0);
