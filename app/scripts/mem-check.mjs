// Memory and CPU of every Sienna process, with the shop open and then after its window is closed (the app
// stays in the menu bar with the hidden player and the mini window). Uses Electron's own app.getAppMetrics,
// so the numbers are per process like Activity Monitor's, though Linux under xvfb renders on the CPU (its GPU
// process is not a Mac's): compare before/after on the same machine, not with a Mac.
//   npm run build && xvfb-run -a node scripts/mem-check.mjs [out_dir]
//   (SIENNA_DPR=2 pretends a Retina screen; SIENNA_SETTLE_S=40, SIENNA_CLOSED_S=60; SIENNA_MINI_RELEASE_S=20 lets the closed sample show the mini window let go of)
import { _electron as electron } from 'playwright';
import { outDir, sandboxArgs } from './safe.mjs';
const S = outDir(process.argv[2], 'sienna-mem-check');
const SETTLE_S = Number(process.env.SIENNA_SETTLE_S || 40), CLOSED_S = Number(process.env.SIENNA_CLOSED_S || 60);
const app = await electron.launch({
  cwd: new URL('..', import.meta.url).pathname,
  args: [...sandboxArgs(), '--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist', `--user-data-dir=${S}/ud`, ...(process.env.SIENNA_DPR ? [`--force-device-scale-factor=${process.env.SIENNA_DPR}`] : []), '.'],
  env: { ...process.env, SIENNA_TEST: '1' },
  timeout: 60000,
});
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

// One row per process: what it is (shop, mini, player...), resident MB, and CPU % over the last interval.
async function sample(label) {
  await app.evaluate(({ app }) => app.getAppMetrics());   // CPU % is measured since the previous call
  await wait(5);
  const rows = await app.evaluate(({ app, webContents }) => {
    const who = new Map(webContents.getAllWebContents().map((w) => [w.getOSProcessId(), w.getURL().includes('mini.html') ? 'mini' : w.getURL().startsWith('file:') ? 'shop' : /youtube|google/.test(w.getURL()) ? 'player' : w.getURL()]));
    return app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, what: who.get(m.pid) ?? m.serviceName ?? m.name ?? '', mb: Math.round(m.memory.workingSetSize / 1024), cpu: +m.cpu.percentCPUUsage.toFixed(1) }));
  });
  rows.sort((a, b) => b.mb - a.mb);
  console.log(`\n== ${label}: ${rows.reduce((t, r) => t + r.mb, 0)} MB, ${rows.reduce((t, r) => t + r.cpu, 0).toFixed(1)} % CPU`);
  for (const r of rows) console.log(`  ${String(r.mb).padStart(5)} MB ${String(r.cpu).padStart(6)} %  ${r.type.padEnd(8)} ${r.what}`);
}

let page;
for (let i = 0; i < 40 && !page; i++) {
  page = app.windows().find((w) => w.url().startsWith('file:') && !w.url().includes('mini.html'));
  if (!page) await wait(0.5);
}
await page.waitForFunction(() => window.__siennaDebug?.state.introDone && window.__siennaDebug.state.settled, null, { timeout: 240000 }).catch(() => console.log('(the intro had not settled)'));
await wait(SETTLE_S);
await sample('shop open, at rest');
// Off macOS closing the window quits the app; keep it running the way it does on a Mac.
await app.evaluate(({ app }) => app.on('before-quit', (e) => e.preventDefault()));
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:') && !w.webContents.getURL().includes('mini.html'))?.close());
await wait(CLOSED_S);
await sample(`shop closed for ${CLOSED_S} s`);
// The mini window is let go of after a while hidden (electron/mini.cjs): summon it again and check it opens.
await app.evaluate(() => global.__siennaMini.open());
let phase = null;
for (let i = 0; i < 60 && phase !== 'open'; i++) {
  await wait(0.5);
  phase = await app.evaluate(() => global.__siennaMini.window?.webContents.executeJavaScript('window.__mini?.phase ?? null')).catch(() => null);
}
console.log('\nmini summoned again:', phase === 'open' ? 'open' : `not open (${phase})`);
await sample('mini player open');
await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
process.exit(0);
