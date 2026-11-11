// Checks the paper leans with the cursor (src/cursortilt.js): the tour's note and the Settings card turn
// one way with the cursor at the left, the other at the right, and keep turning while a record is up at a
// rack (the camera's own tilt holds still then). Screenshots of both leans go to out_dir.
// Usage: node scripts/tilt-check.mjs [out_dir]      (SIENNA_PORT=5242)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-tilt');
const port = Number(process.env.SIENNA_PORT) || 5242;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// rotateY of an element's inline transform, in degrees
const turn = (sel) => page.evaluate((s) => {
  const m = /rotateY\((-?[\d.]+)deg\)/.exec(document.querySelector(s)?.style.transform || '');
  return m ? Number(m[1]) : NaN;
}, sel);
async function leans(sel, name) {
  await page.mouse.move(60, 360, { steps: 8 });
  await wait(1200);
  const left = await turn(sel);
  await page.screenshot({ path: `${out}/${name}-left.png` });
  await page.mouse.move(1220, 360, { steps: 8 });
  await wait(1200);
  const right = await turn(sel);
  await page.screenshot({ path: `${out}/${name}-right.png` });
  console.log(`${name}: rotateY left ${left} right ${right}`);
  assert(left < -3 && right > 3, `${name} should lean with the cursor`);
  console.log('ok  ', name, 'leans with the cursor');
}

try {
  await page.goto(`http://127.0.0.1:${port}/?at=home&tour=paint`, { timeout: 180000 });
  await page.waitForFunction(() => window.__siennaDebug?.tour?.step && window.__siennaDebug.state.introDone, null, { timeout: 120000 });
  await wait(1000);
  console.log('renderer:', await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const d = gl?.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a';
  }));
  await leans('.tr-stage:not(.tr-ghost)', 'tour-note');
  await page.goto(`http://127.0.0.1:${port}/?at=home&tour=0&settings`, { timeout: 180000 });
  await page.waitForFunction(() => document.querySelector('.st-veil.show'), null, { timeout: 120000 });
  await wait(800);
  await leans('.st-lean', 'settings-card');
  assert.deepEqual(errors, []);
  console.log('all good');
} finally {
  await browser.close();
  await server.close();
}
