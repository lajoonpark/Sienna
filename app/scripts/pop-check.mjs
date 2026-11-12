// Finds what pops: draws the same moment twice, the second a sliver of time later (DT, default 1/300 s,
// a tenth of a 30 fps frame), and counts the pixels that change by more than T (0..255 luma, after a 3x3 box).
// Smooth motion moves a picture by a tiny amount in that time, so nearly nothing should change; what does
// is something that jumps as the camera moves (a dab popping in or out, a colour picked from a different
// pixel, aliasing). Unlike flicker-check.mjs, a textured wall sliding past does not count.
// Writes, per time, pop-<t>.png (the frame with popping pixels in magenta) and prints the share that popped.
//   node scripts/pop-check.mjs [out] [query] [times]   e.g. node scripts/pop-check.mjs /tmp/pop "" 2,4,6,8
// DPR=2 default (Retina path). Runs on the Radeon (GPU flags, see work rules).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] ?? 'pop-out';
const q = process.argv[3] ?? '';
const times = (process.argv[4] ?? '1,2,3,4,5,6,7,8,9').split(',').map(Number);
const w = Number(process.env.W) || 960, h = Number(process.env.H) || 600;
const DT = Number(process.env.DT ?? 1 / 300), T = Number(process.env.T) || 12;
// NUDGE=0.002: the second frame also leans the camera that much more (cursor tilt units: 0.002 turns it
// about 0.02 degrees, a fifth of a pixel), for still views (DT=0); LEAN: the cursor's lean for both
const NUDGE = Number(process.env.NUDGE) || 0, LEAN = Number(process.env.LEAN) || 0;
const RAW = !!Number(process.env.RAW); // RAW=1 also saves both frames as drawn (raw-<t>-a.png, -b.png)
fs.mkdirSync(out, { recursive: true });
const port = Number(process.env.SIENNA_PORT) || 5247;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Number(process.env.DPR) || 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shot&shelves=8&hour=12&${q}`, { timeout: 0 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
const all = [];
for (const t of times) {
  const r = await page.evaluate(async ({ t, DT, T, LEAN, NUDGE, RAW }) => {
    const c = window.__siennaDebug.renderer.domElement;
    const tl = window.__siennaDebug.tilt;
    const grab = async (s, lean = 0) => {
      if (tl) { tl.x = tl.tx = LEAN + lean; tl.y = tl.ty = 0; } // the cursor's lean held still (else it eases between seeks)
      await window.__seek(s);
      const k = document.createElement('canvas'); k.width = c.width; k.height = c.height;
      const g = k.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0);
      return { k, g, d: g.getImageData(0, 0, k.width, k.height).data };
    };
    await grab(t); // (settles: the first seek at a time can still be bringing textures in)
    const A = await grab(t), B = await grab(t + DT, NUDGE);
    const W = Math.floor(c.width / 3), H = Math.floor(c.height / 3), CW = c.width;
    const lum = (d) => { const L = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) { const i = ((y * 3 + j) * CW + x * 3 + k) * 4; s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; } L[y * W + x] = s / 9; } return L; };
    const la = lum(A.d), lb = lum(B.d);
    let n = 0;
    const im = A.g.getImageData(0, 0, c.width, c.height);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (Math.abs(la[y * W + x] - lb[y * W + x]) <= T) continue;
      n++;
      for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) { const i = ((y * 3 + j) * CW + x * 3 + k) * 4; im.data[i] = 255; im.data[i + 1] = 0; im.data[i + 2] = 255; }
    }
    const raw = RAW ? [A.k.toDataURL('image/png'), B.k.toDataURL('image/png')] : null;
    A.g.putImageData(im, 0, 0);
    return { pct: (n / (W * H)) * 100, png: A.k.toDataURL('image/png'), raw };
  }, { t, DT, T, LEAN, NUDGE, RAW });
  fs.writeFileSync(path.join(out, `pop-${t}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
  r.raw?.forEach((u, i) => fs.writeFileSync(path.join(out, `raw-${t}-${'ab'[i]}.png`), Buffer.from(u.split(',')[1], 'base64')));
  all.push(r.pct);
  console.log(`t=${t} popped ${r.pct.toFixed(3)}%`);
}
console.log(JSON.stringify({ query: q, meanPct: +(all.reduce((a, b) => a + b, 0) / all.length).toFixed(3) }));
await b.close(); await server.close();
