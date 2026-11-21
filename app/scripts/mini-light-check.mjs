// Still mini wall glow at the reported morning warm-up time (Retina, painted render).
// Usage: node scripts/mini-light-check.mjs <out_dir> (SIENNA_PORT, SIENNA_ANGLE)
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-mini-light');
const port = Number(process.env.SIENNA_PORT) || 5284;
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const angle = process.env.SIENNA_ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 540, height: 620 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const NativeDate = Date;
  window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-22T12:00:00Z'])); }
    static now() { return new NativeDate('2026-11-22T12:00:00Z').getTime(); }
  };
});

try {
  await page.goto(`http://127.0.0.1:${port}/mini.html?shot&paused&hour=${8 + 53 / 60}`, { timeout: 600000 });
  await page.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const frames = 24;
  const region = { x: 830, y: 100, w: 160, h: 430 };
  await page.evaluate(({ region }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1240;
    window.__lightCheck = { region, canvas, context: canvas.getContext('2d', { willReadFrequently: true }), previous: null, deltas: [] };
  }, { region });
  for (let i = 0; i < frames; i++) {
    await page.evaluate(async i => {
      await window.__seek(4 + i / 30);
      const s = window.__lightCheck;
      const source = document.querySelector('#stage canvas');
      if (source.width !== 1080 || source.height !== 1240) throw Error('expected a 540x620 Retina mini canvas');
      s.context.drawImage(source, 0, 0);
      const { x, y, w, h } = s.region;
      const pixels = s.context.getImageData(x, y, w, h).data;
      if (s.previous) {
        let sum = 0, changed = 0;
        for (let j = 0; j < pixels.length; j += 4) {
          const delta = (Math.abs(pixels[j] - s.previous[j]) + Math.abs(pixels[j + 1] - s.previous[j + 1]) + Math.abs(pixels[j + 2] - s.previous[j + 2])) / 3;
          sum += delta;
          if (delta > 3) changed++;
        }
        s.deltas.push({ mean: sum / (w * h), changedPct: changed / (w * h) * 100 });
      }
      s.previous = pixels;
    }, i);
    if ([0, 1, frames - 1].includes(i)) await page.screenshot({ path: join(out, `frame-${String(i).padStart(2, '0')}.png`), timeout: 120000 });
  }
  const result = await page.evaluate(() => {
    const s = window.__lightCheck;
    const gl = document.querySelector('#stage canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      frames: s.deltas.length + 1, region: s.region,
      mean: s.deltas.reduce((sum, d) => sum + d.mean, 0) / s.deltas.length,
      maxMean: Math.max(...s.deltas.map(d => d.mean)),
      maxChangedPct: Math.max(...s.deltas.map(d => d.changedPct)),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  });
  writeFileSync(join(out, 'metrics.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  assert.deepEqual(errors, [], 'no mini page errors');
  assert.ok(result.maxMean <= 1, `wall glow changes by ${result.maxMean.toFixed(3)}/255 (limit 1)`);
  assert.ok(result.maxChangedPct <= 1, `wall glow changes in ${result.maxChangedPct.toFixed(3)}% of pixels (limit 1%)`);
  console.log(`PASS mini light: ${frames} still frames, maxMean=${result.maxMean.toFixed(3)}/255, maxChanged=${result.maxChangedPct.toFixed(3)}% -> ${out}`);

  await page.evaluate(async () => {
    const { lamps, registerLamp, updateLamps, lampWake, glowMesh } = await import('/src/env.js');
    const original = lamps.splice(0), wake = lampWake.camZ;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    try {
      lampWake.camZ = null;
      updateLamps(0.1, 4);
      const lounge = original.find(l => l.light);
      const make = options => {
        const light = lounge.light.clone();
        light.intensity = 2;
        return registerLamp({ glass: lounge.glass.map(g => g.clone()), glows: [glowMesh('sprite', 1, 0.5)], light, order: 0.05, ...options });
      };
      const steady = make({ steady: true }), normal = make({});
      const sample = level => Array.from({ length: 24 }, (_, i) => {
        updateLamps(level, 4 + i / 30);
        return [steady.light.intensity, normal.light.intensity];
      });
      const warm = sample(0.1);
      check(new Set(warm.map(v => v[0])).size === 1 && warm[0][0] > 0 && warm[0][0] < 2, 'steady lamp retains the partial time-of-day ramp');
      check(new Set(warm.map(v => v[1])).size === 2, 'default shop lamp retains its warm-up flicker');
      for (const [level, expected] of [[0, 0], [1, 2]]) {
        check(sample(level).every(v => v.every(x => x === expected)), 'day/night lamp levels');
        check([steady, normal].every(l => l.glows[0].visible === (level > 0) && l.glows[0].material.opacity === level * 0.5), 'day/night halo visibility and opacity');
      }
      lampWake.camZ = 8;
      const waking = sample(1);
      check(new Set(waking.map(v => v[0])).size === 1 && waking[0][0] > 0 && waking[0][0] < 2, 'steady lamp retains the distance wake ramp');
      check(new Set(waking.map(v => v[1])).size === 2, 'default shop intro retains its wake flicker');
    } finally {
      for (const l of lamps.splice(0)) {
        l.glass.forEach(g => g.dispose());
        l.glows.forEach(g => g.material.dispose());
      }
      lamps.push(...original);
      lampWake.camZ = wake;
    }
  });
  console.log('PASS lamp policy: steady mini ramps, unchanged shop flicker, day/night halos, distance wake and empty registry');
} finally {
  await browser.close();
  await server.close();
}
