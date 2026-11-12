// The hidden YouTube Music player's own cost: memory and CPU of its process while a song plays (as a guest,
// so possibly an ad), and how much it fetched. Compare SIENNA_PLAYER_DIET=0 (no diet) with the default.
//   npm run build && xvfb-run -a node scripts/player-check.mjs [out_dir]     (SIENNA_PLAY_S=40)
import { _electron as electron } from 'playwright';
import { outDir, sandboxArgs } from './safe.mjs';
const S = outDir(process.argv[2], 'sienna-player-check');
const PLAY_S = Number(process.env.SIENNA_PLAY_S || 40);
const app = await electron.launch({
  cwd: new URL('..', import.meta.url).pathname,
  args: [...sandboxArgs(), '--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist', `--user-data-dir=${S}/ud`, '.'],
  env: { ...process.env, SIENNA_TEST: '1' },
  timeout: 60000,
});
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
let page;
for (let i = 0; i < 40 && !page; i++) { page = app.windows().find((w) => w.url().startsWith('file:') && !w.url().includes('mini.html')); if (!page) await wait(0.5); }
await page.waitForFunction(() => window.__siennaDebug?.shelves.length > 0, null, { timeout: 180000 });
// count what the player page fetches, by kind
await app.evaluate(({ webContents }) => {
  const w = webContents.getAllWebContents().find((x) => /music\.youtube\.com/.test(x.getURL()));
  global.__fetched = {};
  w.session.webRequest.onCompleted({ urls: ['*://*/*'] }, (d) => { if (d.webContentsId !== w.id) return; const k = d.resourceType; global.__fetched[k] = (global.__fetched[k] ?? 0) + 1; });
});
await page.evaluate(() => { const d = window.__siennaDebug; d.music.play(d.shelves[0].items[0]); });
await wait(PLAY_S);
const p = await page.evaluate(() => window.__siennaDebug.player);
await app.evaluate(({ app }) => app.getAppMetrics());
await wait(5);
const row = await app.evaluate(({ app, webContents }) => {
  const w = webContents.getAllWebContents().find((x) => /music\.youtube\.com/.test(x.getURL()));
  const m = app.getAppMetrics().find((x) => x.pid === w.getOSProcessId());
  return { mb: Math.round(m.memory.workingSetSize / 1024), cpu: +m.cpu.percentCPUUsage.toFixed(1), fetched: global.__fetched };
});
console.log(`diet ${process.env.SIENNA_PLAYER_DIET === '0' ? 'off' : 'on'}: player ${row.mb} MB, ${row.cpu} % CPU; state ${p.playerState}${p.adPlaying ? ' (ad)' : ''} ${p.title ?? ''}; fetched ${JSON.stringify(row.fetched)}`);
await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
process.exit(0);
