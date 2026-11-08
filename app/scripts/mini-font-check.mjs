// Settings > Lettering reaches the mini window in the real app. Launches the built Electron app, changes
// the font from the shop window (as the Settings card does: localStorage), and checks the mini window
// repaints in it, both while hidden and while open (and stays open).
// Usage (Linux server): npm run build && xvfb-run -a node scripts/mini-font-check.mjs out_dir
import { _electron as electron } from 'playwright';
import assert from 'node:assert';
const S = process.argv[2] || '/tmp/sienna-font-check';
const app = await electron.launch({
  cwd: new URL('..', import.meta.url).pathname,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist', `--user-data-dir=${S}/ud`, '.'],
  env: { ...process.env, SIENNA_TEST: '1' },
  timeout: 60000,
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const find = async (re) => { for (let i = 0; i < 60; i++) { const w = app.windows().find((w) => re.test(w.url())); if (w) return w; await wait(500); } throw new Error(`no window ${re}`); };
const shop = await find(/index\.html/);
const setFont = (f) => shop.evaluate((f) => { const s = JSON.parse(localStorage.getItem('sienna.settings') || '{}'); s.font = f; localStorage.setItem('sienna.settings', JSON.stringify(s)); }, f);
const miniFont = async () => {
  const m = await find(/mini\.html/);
  await m.waitForFunction('!!window.__mini', null, { timeout: 60000 });
  return m.evaluate(() => ({ font: getComputedStyle(document.querySelector('.cad-tag')).fontFamily, phase: window.__mini.phase }));
};
try {
  assert.match((await miniFont()).font, /Amatic/);
  await setFont('kaushan');
  await wait(4000);
  assert.match((await miniFont()).font, /Kaushan/, 'hidden mini repaints');
  console.log('ok   hidden mini window takes the new font');
  await app.evaluate(() => global.__siennaMini.open());
  await wait(2000);
  await setFont('sriracha');
  await wait(4000);
  const r = await miniFont();
  assert.match(r.font, /Sriracha/, 'open mini repaints');
  assert.strictEqual(r.phase, 'open', 'and is open again');
  console.log('ok   open mini window takes the new font and stays open');
} finally {
  await app.close();
}
