// Real app (as guest, against YouTube Music) through the vite dev server: search, playlist cover
// fallback for a playlist, a mix and an album, and SIENNA_DUMP. Saves the collages as PNGs.
//   xvfb-run -a node scripts/live-check.mjs out_dir      (SIENNA_PORT=5233)
import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
const S = process.argv[2] || '/tmp/sienna-live';
mkdirSync(S, { recursive: true });
const port = Number(process.env.SIENNA_PORT) || 5233;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const app = await electron.launch({
  cwd: new URL('..', import.meta.url).pathname,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${S}/ud`, '.'],
  env: { ...process.env, SIENNA_DEV_URL: `http://127.0.0.1:${port}/search-lab.html`, SIENNA_DUMP: '1' },
  timeout: 60000,
});
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
app.process().stderr.on('data', (d) => { const t = String(d); if (/\[sienna\]/.test(t)) log('[main]', t.trim().slice(0, 300)); });
let page;
for (let i = 0; i < 60 && !page; i++) { page = app.windows().find((w) => w.url().startsWith('http://127.0.0.1')); if (!page) await new Promise((r) => setTimeout(r, 500)); }
page.on('console', (m) => log('[page]', m.text().slice(0, 300)));
page.on('pageerror', (e) => log('[pageerror]', e.message));
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
log('has window.sienna.search / playlistArt:', await page.evaluate(() => [typeof window.sienna.search, typeof window.sienna.playlistArt]));

const songs = await page.evaluate(() => window.sienna.search('lemon'));
log('search "lemon" ->', songs.length, 'songs; first 3:', songs.slice(0, 3).map((s) => `${s.title} / ${s.subtitle} / ${s.duration}s`).join(' | '));
log('empty search ->', JSON.stringify(await page.evaluate(() => window.sienna.search('   '))));

// real shelves through music.shelves() (covers repaired), then every item's art kind
const shelves = await page.evaluate(async () => (await window.__music.shelves()).shelves.map((s) => ({ title: s.title, items: s.items.map((i) => ({ kind: i.kind, title: i.title, art: i.art?.slice(0, 40), data: i.art?.startsWith('data:'), play: i.play })) })));
for (const s of shelves) log('shelf', s.title, s.items.length, 'no art:', s.items.filter((i) => !i.art).length, 'collages:', s.items.filter((i) => i.data).length);

const pls = shelves.flatMap((s) => s.items).filter((i) => i.play.playlistId);
const playlist = pls.find((i) => /^RDCLAK|^PL/.test(i.play.playlistId));
const targets = [
  ['playlist', playlist?.play],
  ['mix', { playlistId: 'RDAMVM3NNhrqHZqlI', videoId: '3NNhrqHZqlI' }],
  ['album', { playlistId: 'OLAK5uy_lESzkkwhLTfS4mkkHolpltJnwKT5THEdc' }],
];
for (const [name, play] of targets) {
  if (!play) { log(name, 'no sample'); continue; }
  const urls = await page.evaluate((p) => window.sienna.playlistArt(p), play);
  log(name, play.playlistId, '->', urls.length, 'cover urls', urls.map((u) => u.slice(8, 60)).join(' , '));
  const data = await page.evaluate(async (u) => (await import('/src/cover.js')).paintCollage(u, 3), urls);
  if (data) { writeFileSync(`${S}/collage-${name}.jpg`, Buffer.from(data.split(',')[1], 'base64')); log(name, 'collage painted', data.length, 'bytes'); }
  else log(name, 'COLLAGE FAILED');
}

// full repair path on items that have no art / a broken url
const repaired = await page.evaluate(async (play) => {
  const { repairArt } = await import('/src/cover.js');
  const items = [
    { kind: 'playlist', title: 'no art', art: null, play },
    { kind: 'playlist', title: 'broken art', art: 'https://i.ytimg.com/vi/zzzzzzzzzzz/hqdefault.jpg', play },
    { kind: 'song', title: 'song no art', art: null, play: { videoId: 'Z85lxckrtzg' } },
  ];
  await repairArt(items, { getSongArts: (p) => window.sienna.playlistArt(p) });
  return items.map((i) => ({ title: i.title, art: i.art?.slice(0, 60) }));
}, targets[1][1]);
log('repairArt ->', JSON.stringify(repaired));

const dumps = readdirSync(`${S}/ud/dumps`);
log('SIENNA_DUMP files:', dumps.length, dumps.slice(0, 3).join(', '));
await app.close();
await server.close();
