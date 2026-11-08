// Real app (as guest, against YouTube Music): the album spread's song lists. Lists the album items on
// the home shelves and fetches the songs of each (window.sienna.albumSongs), plus a known album.
//   xvfb-run -a node scripts/album-live-check.mjs [out_dir]      (SIENNA_PORT=5234)
import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
const S = process.argv[2] || '/tmp/sienna-album-live';
mkdirSync(S, { recursive: true });
const port = Number(process.env.SIENNA_PORT) || 5234;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const app = await electron.launch({
  cwd: new URL('..', import.meta.url).pathname,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist', `--user-data-dir=${S}/ud`, '.'],
  env: { ...process.env, SIENNA_DEV_URL: `http://127.0.0.1:${port}/search-lab.html` },
  timeout: 60000,
});
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
app.process().stderr.on('data', (d) => { const t = String(d); if (/\[sienna\]/.test(t)) log('[main]', t.trim().slice(0, 300)); });
let page;
for (let i = 0; i < 60 && !page; i++) { page = app.windows().find((w) => w.url().startsWith('http://127.0.0.1')); if (!page) await new Promise((r) => setTimeout(r, 500)); }
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
const albums = await page.evaluate(async () => (await window.sienna.home()).shelves.flatMap((s) => s.items.filter((i) => i.kind === 'album').map((i) => ({ shelf: s.title, title: i.title, play: i.play }))));
log('album items on the first home page:', albums.length);
const targets = [...albums.slice(0, 3), { shelf: '(fixed)', title: 'known album', play: { playlistId: 'OLAK5uy_lESzkkwhLTfS4mkkHolpltJnwKT5THEdc' } }];
let bad = 0;
for (const a of targets) {
  const t0 = Date.now();
  const songs = await page.evaluate((p) => window.sienna.albumSongs(p), a.play);
  log(`${a.shelf} / ${a.title} ${JSON.stringify(a.play)} -> ${songs.length} songs in ${Date.now() - t0} ms`);
  for (const s of songs.slice(0, 4)) log('   ', s.videoId, '|', s.title, '|', s.subtitle, '|', s.duration, '|', !!s.art);
  if (!songs.length) bad++;
  const again = Date.now();
  await page.evaluate((p) => window.sienna.albumSongs(p), a.play);
  log('    cached call', Date.now() - again, 'ms');
}
log(bad ? `FAIL: ${bad} album(s) without songs` : 'ok');
await app.close();
await server.close();
process.exit(bad ? 1 : 0);
