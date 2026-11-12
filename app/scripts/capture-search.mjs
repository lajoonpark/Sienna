// Capture real YouTube Music responses (as guest) for fixtures and live checks. Needs a build:
//   npm run build && xvfb-run -a node scripts/capture-search.mjs out_dir [query]
// Writes search.json (songs search) and a few probe files next to it.
import { _electron as electron } from 'playwright';
import { writeFileSync } from 'node:fs';
import { outDir, sandboxArgs } from './safe.mjs';
const S = outDir(process.argv[2], 'sienna-capture');
const query = process.argv[3] || 'lemon';
const app = await electron.launch({
  cwd: new URL('..', import.meta.url).pathname,
  args: [...sandboxArgs(), '--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist', `--user-data-dir=${S}/ud`, '.'],
  timeout: 60000,
});
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let ytm;
for (let i = 0; i < 120 && !ytm; i++) {
  for (const w of app.windows()) {
    if (w.url().startsWith('https://music.youtube.com') && await w.evaluate('!!(window.__sienna && window.ytcfg && document.querySelector("ytmusic-app"))').catch(() => false)) ytm = w;
  }
  if (!ytm) await new Promise((r) => setTimeout(r, 500));
}
if (!ytm) throw new Error('no YouTube Music page');
log('ytm page', ytm.url());
const SONGS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF';
const call = (endpoint, body) => ytm.evaluate(([e, b]) => window.__sienna.api(e, b), [endpoint, body]);
const save = (name, data) => { writeFileSync(`${S}/${name}.json`, JSON.stringify(data)); log('saved', name, JSON.stringify(data).length, 'bytes'); };
save('search', await call('search', { query, params: SONGS }));
save('search-nofilter', await call('search', { query }));
save('home', await call('browse', { browseId: 'FEmusic_home' }));
// Playlist / mix songs, for the cover fallback fixtures
const home = JSON.parse(JSON.stringify(await call('browse', { browseId: 'FEmusic_home' })));
const ids = JSON.stringify(home).match(/"playlistId":"(RDCLAK[^"]+|PL[^"]+|OLAK[^"]+)"/g) ?? [];
const pl = ids[0]?.match(/:"(.+)"/)[1];
log('playlist', pl);
if (pl) save('playlist-browse', await call('browse', { browseId: 'VL' + pl }));
save('mix-next', await call('next', { playlistId: 'RDAMVM3NNhrqHZqlI', videoId: '3NNhrqHZqlI', isAudioOnly: true }));
const a = await call('search', { query: 'lemon', params: 'EgWKAQIYAWoMEA4QChADEAQQCRAF' }); // albums filter
save('search-albums', a);
await app.close();
