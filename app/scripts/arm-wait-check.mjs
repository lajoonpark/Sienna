// Does the arm wait for the song? A record lands while a stub song takes N ms to load: prints when the record
// landed, the arm's lift while it waits, and when the song was told to start.
//   node scripts/arm-wait-check.mjs [load ms ...]   (default 0 3000 30000; 30000 shows the hover limit; SIENNA_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const loads = process.argv.slice(2).map(Number);
const port = Number(process.env.SIENNA_PORT) || 5247;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const ms of loads.length ? loads : [0, 3000, 30000]) {
  const page = await b.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/player-lab.html?wc=0`);
  await page.waitForFunction(() => window.__player?.suitcase, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async (ms) => {
    const { startSong } = await import('/src/suitcase.js');
    const sc = window.__player.suitcase, t0 = performance.now(), secs = () => +((performance.now() - t0) / 1000).toFixed(1);
    const out = { loaded: null, landed: null, started: null, liftWhenLoaded: null, liftAtStart: null, maxLiftWaiting: 0 };
    const music = {
      command() {},
      prepare: () => new Promise((res) => setTimeout(() => { out.loaded = secs(); out.liftWhenLoaded = +sc.debug.armLift.toFixed(2); res(true); }, ms)),
      startPrepared: () => { out.started = secs(); out.liftAtStart = +sc.debug.armLift.toFixed(2); },
    };
    startSong(music, sc, {});
    sc.placeRecord(null, { claimFor: { baseVideoId: null } });   // the flight's last step; flights crawl under SwiftShader
    while (out.started === null && secs() < 60) {
      await new Promise((res) => setTimeout(res, 50));
      const c = sc.debug.cue;
      if (c?.landed && out.landed === null) out.landed = secs();
      if (c?.landed && !c.ready) out.maxLiftWaiting = Math.max(out.maxLiftWaiting, +sc.debug.armLift.toFixed(2));
    }
    return out;
  }, ms);
  console.log(`load ${ms} ms`, JSON.stringify(r));
  await page.close();
}
await b.close(); await server.close();
