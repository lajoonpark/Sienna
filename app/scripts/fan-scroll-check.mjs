// Hall trough: sweep the cursor straight left across the raised fan, then hold still. The hovered record
// should only ever step left, always be the middle of the fan, and not change once the cursor stops.
//   node scripts/fan-scroll-check.mjs out_dir [y px]   (SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out = process.argv[2], Y = Number(process.argv[3] ?? 330), port = Number(process.env.SIENNA_PORT) || 5242;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=0&wc=0`);
await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 120000 });
await page.waitForTimeout(8000);
const read = () => page.evaluate(() => {
  const r = window.__siennaDebug.rack, s = r.core.sleeves;
  return { hov: r.hovered, n: s.length, up: s.flatMap((x, i) => (x.fanA > 0.5 ? [i] : [])), slots: s.flatMap((x, i) => (x.fanA > 0.5 ? [`${i}:${x.slot.toFixed(2)}`] : [])) };
});
await page.mouse.move(1000, Y);
await page.waitForTimeout(3000);
const seq = [];
for (let x = 1000; x >= 200; x -= 30) {
  await page.mouse.move(x, Y);
  await page.waitForTimeout(250);
  const st = await read();
  seq.push(st.hov);
  if (x % 150 === 100) await page.screenshot({ path: `${out}/x${x}.jpg`, type: 'jpeg', quality: 70, timeout: 240000 });
}
console.log('sweep hovered:', seq.join(' '));
const steps = seq.filter((h) => h >= 0);
console.log('backward steps:', steps.filter((h, i) => i && h > steps[i - 1]).length, 'distinct:', new Set(steps).size);
// hold still in the middle of the row
await page.mouse.move(640, Y);
await page.waitForTimeout(3000);
const held = [];
for (let i = 0; i < 16; i++) { held.push((await read()).hov); await page.waitForTimeout(250); }
const st = await read();
console.log('still cursor:', held.join(' '), 'changes:', held.filter((h, i) => i && h !== held[i - 1]).length);
console.log('settled fan:', st.slots.join(' '), 'hovered', st.hov, 'of', st.n);
await page.screenshot({ path: `${out}/still.jpg`, type: 'jpeg', quality: 80, timeout: 240000 });
await b.close(); await server.close();
