// Real YouTube Music: does a song load silently, stop at 0:00 and start on release? Calls the bridge directly and
// watches the hidden player page (no 3D needed). Guests usually get an ad first, reported as ad:true.
//   xvfb-run -a node scripts/hold-check.mjs out_dir   (needs npm run build)
import { _electron as electron } from 'playwright';
import { outDir, sandboxArgs } from './safe.mjs';
const S = outDir(process.argv[2], 'sienna-hold-check');
const app = await electron.launch({
  cwd: new URL('..', import.meta.url).pathname,
  args: [...sandboxArgs(), '--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist', `--user-data-dir=${S}/ud`, '.'],
  timeout: 60000,
});
const find = async (test) => { for (;;) { const w = app.windows().find(test); if (w) return w; await new Promise((r) => setTimeout(r, 500)); } };
const shop = await find((w) => w.url().startsWith('file:'));
console.log('shop window', shop.url().slice(0, 60), 'windows', app.windows().map((w) => w.url().slice(0, 40)));
const ytm = await find((w) => w.url().includes('music.youtube.com'));
await shop.waitForFunction(() => window.__siennaDebug?.shelves.length > 0, null, { timeout: 180000 });
const songs = (await shop.evaluate(() => window.__siennaDebug.shelves.flatMap((s) => s.items).filter((i) => i.play?.videoId).map((i) => i.play))).slice(0, 6);
const look = () => ytm.evaluate(() => {
  const p = document.getElementById('movie_player'), s = window.__sienna.state(), v = p.querySelector('video');
  return { vPaused: v?.paused, vT: +(v?.currentTime ?? 0).toFixed(1), id: p.getVideoData().video_id, st: p.getPlayerState(), t: +p.getCurrentTime().toFixed(2), muted: p.isMuted(), ad: !!document.querySelector('#movie_player.ad-showing'), reported: `${s.videoId}/${s.playerState}` };
});
const log = (what, x) => console.log(what.padEnd(14), JSON.stringify(x));
for (const [n, play] of songs.slice(0, Number(process.env.ROUNDS) || 3).entries()) {
  console.log(`--- round ${n}: ${play.videoId}`);
  log('before', await look());
  const t0 = Date.now();
  let waiting = true;
  const res = await Promise.race([
    shop.evaluate((play) => window.sienna.prepare(play), play).finally(() => { waiting = false; }),
    (async () => { while (waiting) { await new Promise((r) => setTimeout(r, 2000)); if (waiting) log(`  loading ${((Date.now() - t0) / 1000).toFixed(0)}s`, await look()); } })(),
  ]);
  log(`prepare ${((Date.now() - t0) / 1000).toFixed(1)}s`, res);
  log('held', await look());
  await new Promise((r) => setTimeout(r, 3000));
  log('held +3 s', await look());
  await shop.evaluate((play) => window.sienna.startPrepared(play), play);
  await new Promise((r) => setTimeout(r, 1000));
  log('released +1 s', await look());
  await new Promise((r) => setTimeout(r, 2000));
  log('released +3 s', await look());
}
await app.close();
