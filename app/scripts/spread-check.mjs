// The album spread with a real mouse (fake store, ?albums=1: the albums sit on the counter easel, station 3).
//   node scripts/spread-check.mjs [out_dir]      (GPU; SIENNA_PORT, SIENNA_WC)
// Hovers an album, presses it, checks the records fan out (play-all + one per song, 15 a page), that a
// record under the cursor lifts and stays under it, that a sideways scroll turns the page, that Esc and a
// click on empty space put them back, that a song plays from inside its album (the next song follows
// in album order), that the play-all record plays track 1 and that the camera keeps panning with the
// cursor while the spread is open. Saves a few screenshots.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'spread-out';
mkdirSync(out, { recursive: true });
const port = Number(process.env.SIENNA_PORT) || 5251;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const W = 1280, H = 760;
let problems = 0;
const fail = (msg) => { problems++; console.log('PROBLEM', msg); };
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => fail(`pageerror ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/index.html?albums=1&at=3&wc=${process.env.SIENNA_WC ?? 0}`, { timeout: 180000 });
await page.waitForFunction(() => window.__siennaDebug?.state.settled, null, { timeout: 240000 });
await page.waitForFunction(() => { const r = window.__siennaDebug.rack; return r?.root.visible && r.core.sleeves.length && r.core.sleeves.every((s) => s.hidden || (s.mesh.visible && s.drop < 0.01)); }, null, { timeout: 240000, polling: 500 });
await page.waitForTimeout(2000);
console.log('renderer:', await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }));

const sleeveAt = (k) => page.evaluate((k) => {
  const d = window.__siennaDebug, cam = d.camera, s = d.rack.core.sleeves[k];
  s.mesh.updateWorldMatrix(true, false);
  const v = s.mesh.getWorldPosition(cam.position.clone()).project(cam);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, kind: s.item.kind, title: s.item.title };
}, k);
// screen centre of spread record j (rest slot)
const recAt = (j) => page.evaluate((j) => {
  const d = window.__siennaDebug, cam = d.camera, r = d.spread.state.recs[j];
  cam.updateMatrixWorld();
  const v = cam.localToWorld(cam.position.clone().set(r.slot.x, r.slot.y, r.slot.z)).project(cam);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}, j);
const state = () => page.evaluate(() => {
  const sp = window.__siennaDebug.spread, st = sp.state;
  return { open: sp.isOpen, loaded: sp.loaded, page: sp.page, pages: sp.pages, hovered: sp.hovered, n: st?.recs?.length ?? 0, out: st?.recs?.filter((r) => r.out).length ?? 0, arrived: st?.recs?.filter((r) => r.out && r.t >= 1).length ?? 0, songs: st?.songs?.length ?? 0 };
});
const player = () => page.evaluate(() => { const p = window.__siennaDebug.player; return { videoId: p.videoId, title: p.title, state: p.playerState }; });

async function openAlbum(k) {
  const s = await sleeveAt(k);
  await page.mouse.move(s.x - 30, s.y - 30);
  await page.mouse.move(s.x, s.y, { steps: 6 });
  await page.waitForTimeout(700);
  const hov = await page.evaluate(() => window.__siennaDebug.rack.hovered);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(1600);
  const st = await state();
  console.log(`album ${k} "${s.title}" (${s.kind}) hovered=${hov} ->`, JSON.stringify(st));
  return st;
}

// 1. album with 22 songs (index 2): page 1 shows play-all + 15
let st = await openAlbum(2);
if (!st.open || !st.loaded) fail('spread did not open');
if (st.songs !== 22 || st.n !== 23) fail(`expected 22 songs + play-all, got ${st.songs} / ${st.n}`);
if (st.out !== 16 || st.arrived !== 16) fail(`page 1 should show 16 records, out ${st.out} arrived ${st.arrived}`);
if (st.pages !== 2) fail(`expected 2 pages, got ${st.pages}`);
await page.screenshot({ path: `${out}/1-open.png` });

// 2. hover record 5 (track 5): it lifts, and stays under the cursor
let p = await recAt(5);
await page.mouse.move(p.x, p.y, { steps: 5 });
await page.waitForTimeout(800);
st = await state();
const under = await page.evaluate(([x, y]) => {
  const d = window.__siennaDebug, cam = d.camera, r = d.spread.state.recs[5];
  r.spin.updateWorldMatrix(true, false);
  const c = r.spin.getWorldPosition(cam.position.clone());
  const v = c.clone().project(cam);
  return { lift: r.lift, dx: (v.x + 1) / 2 * innerWidth - x, dy: (1 - v.y) / 2 * innerHeight - y };
}, [p.x, p.y]);
console.log('hover track 5:', JSON.stringify(st), 'lift', under.lift.toFixed(2), 'centre off cursor px', under.dx.toFixed(1), under.dy.toFixed(1));
if (st.hovered !== 5) fail('record 5 not hovered');
if (Math.hypot(under.dx, under.dy) > 4) fail('hovered record left the cursor');
await page.screenshot({ path: `${out}/2-hover.png` });

// 3. sideways scroll: page 2 (play-all + 7)
await page.mouse.wheel(120, 0);
await page.waitForTimeout(1500);
st = await state();
console.log('after sideways scroll:', JSON.stringify(st));
if (st.page !== 1 || st.out !== 8) fail(`page 2 should show 8 records, page ${st.page} out ${st.out}`);
await page.screenshot({ path: `${out}/3-page2.png` });
await page.mouse.wheel(-120, 0);
await page.waitForTimeout(1300);
st = await state();
if (st.page !== 0) fail('scroll back did not return to page 1');

// 3b. the camera still pans with the cursor while the spread is out (it hangs in the camera's frame)
const look = () => page.evaluate(() => { const d = window.__siennaDebug.camera.getWorldDirection(window.__siennaDebug.camera.position.clone()); return { x: d.x, y: d.y, z: d.z }; });
await page.mouse.move(W * 0.04, H * 0.05, { steps: 8 });
await page.waitForTimeout(1500);
const lookL = await look();
await page.mouse.move(W * 0.96, H * 0.05, { steps: 8 });
await page.waitForTimeout(1500);
const lookR = await look();
const panDeg = Math.acos(Math.min(1, lookL.x * lookR.x + lookL.y * lookR.y + lookL.z * lookR.z)) * 180 / Math.PI;
st = await state();
console.log('pan across the top with the spread open:', panDeg.toFixed(2), 'deg, open', st.open);
if (!st.open) fail('moving the cursor closed the spread');
if (panDeg < 0.5) fail(`camera froze while the spread was open (turned ${panDeg.toFixed(2)} deg)`);

// 4. Esc puts them back
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
st = await state();
const atStill = await page.evaluate(() => window.__siennaDebug.state.at);
console.log('after Esc:', JSON.stringify(st), 'station', atStill);
if (st.open) fail('Esc did not close the spread');
if (atStill !== 3) fail('Esc with the spread open also left the rack');

// 5. open again, click empty space: closes, nothing plays
const before = await player();
await openAlbum(2);
await page.mouse.click(W * 0.5, H * 0.93);
await page.waitForTimeout(1200);
st = await state();
console.log('after click on empty space:', JSON.stringify(st));
if (st.open) fail('click on empty space did not close');
if ((await player()).videoId !== before.videoId) fail('click on empty space played something');

// 6. open, press track 3: it plays, the spread closes, the next song is track 4 of the same album
await openAlbum(2);
p = await recAt(3);
await page.mouse.move(p.x, p.y, { steps: 5 });
await page.waitForTimeout(700);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/4-flying.png` });
await page.waitForTimeout(6000);
let pl = await player();
st = await state();
console.log('after pressing track 3:', JSON.stringify(pl), 'spread open', st.open);
if (pl.videoId !== 'fakealb2_2') fail(`expected fakealb2_2 playing, got ${pl.videoId}`);
if (st.open) fail('spread still open after a pick');
await page.evaluate(() => window.__siennaDebug.music.command('next'));
await page.waitForTimeout(400);
pl = await player();
console.log('next ->', pl.videoId);
if (pl.videoId !== 'fakealb2_3') fail(`next should be track 4 (fakealb2_3), got ${pl.videoId}`);

// 7. a 3-song album (index 1), play-all record: plays track 1
await page.mouse.move(W * 0.5, H * 0.95);
await page.waitForTimeout(800);
st = await openAlbum(1);
if (st.n !== 4 || st.pages !== 1) fail(`3-song album: expected 4 records on 1 page, got ${st.n} / ${st.pages}`);
await page.screenshot({ path: `${out}/5-small.png` });
p = await recAt(0);
await page.mouse.move(p.x, p.y, { steps: 5 });
await page.waitForTimeout(700);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(6000);
pl = await player();
console.log('after play-all:', JSON.stringify(pl));
if (pl.videoId !== 'fakealb1_0') fail(`play-all should start track 1 (fakealb1_0), got ${pl.videoId}`);

// 8. a song (not an album) still plays straight away as before
await page.mouse.move(W * 0.5, H * 0.95);
await page.waitForTimeout(800);
const songIdx = await page.evaluate(() => window.__siennaDebug.rack.core.sleeves.findIndex((s) => s.item.kind !== 'album'));
console.log('non-album sleeve on this rack:', songIdx, '(the albums shelf has only albums: skipped)');

console.log(problems ? `${problems} problem(s)` : 'ok');
await b.close();
await server.close();
process.exit(problems ? 1 : 0);
