// Settings > Shortcuts in the real app: defaults registered, recording a new one through the settings card
// (the global ones are let go while recording), clashes refused, the change saved to shortcuts.json and
// reaching the mini window, the search bar following its new shortcut, and Reset.
// Usage (Linux server): npm run build && xvfb-run -a node scripts/shortcuts-check.mjs out_dir
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
const S = process.argv[2];
if (!S) { console.log('usage: node scripts/shortcuts-check.mjs out_dir'); process.exit(2); }
fs.rmSync(`${S}/ud`, { recursive: true, force: true });
const app = await electron.launch({
  cwd: new URL('..', import.meta.url).pathname,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist', `--user-data-dir=${S}/ud`, '.'],
  env: { ...process.env, SIENNA_TEST: '1' },
  timeout: 60000,
});
let failed = 0;
const ok = (cond, what) => { console.log(cond ? 'ok  ' : 'FAIL', what); if (!cond) failed++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const registered = () => app.evaluate(({ globalShortcut }) => ['Control+Alt+K', 'Control+Alt+L', 'Control+Alt+M', 'Control+Shift+L'].filter((a) => globalShortcut.isRegistered(a)));
let page;
for (let i = 0; i < 40 && !page; i++) {
  page = app.windows().find((w) => w.url().startsWith('file:') && w.url().endsWith('index.html'));
  if (!page) await wait(500);
}
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.waitForFunction(() => !!document.querySelector('.st-keys'), null, { timeout: 60000 });

let st = await page.evaluate(() => window.sienna.keys.get());
ok(st.search === 'Control+Alt+J' && st.app === 'Control+Alt+L' && st.mini === 'Control+Alt+K', `defaults ${st.search} / ${st.app} / ${st.mini}`);
ok(JSON.stringify(await registered()) === JSON.stringify(['Control+Alt+K', 'Control+Alt+L']), `global registered: ${await registered()}`);

// open the card and read the row
await page.keyboard.press('Control+Comma');
await wait(600);
const words = () => page.evaluate(() => [...document.querySelectorAll('.st-keys .st-w span')].map((e) => e.textContent));
console.log('     row:', (await words()).join(' | '));
ok((await words())[0] === 'Ctrl + Alt + J', 'search shown as Ctrl + Alt + J');
await page.screenshot({ path: `${S}/settings-shortcuts.png` });

// record the mini player shortcut: click it, globals let go, press Ctrl+Alt+M
await page.locator('.st-keys .st-w').nth(2).click();
await wait(200);
ok((await words())[2] === 'Press keys…', 'recording shows "Press keys…"');
ok((await registered()).length === 0, 'globals let go while recording');
await page.screenshot({ path: `${S}/settings-recording.png` });
await page.keyboard.press('Control+Alt+KeyM');
await wait(400);
st = await page.evaluate(() => window.sienna.keys.get());
ok(st.mini === 'Control+Alt+M', `mini now ${st.mini}`);
ok(JSON.stringify(await registered()) === JSON.stringify(['Control+Alt+L', 'Control+Alt+M']), `registered after change: ${await registered()}`);
const saved = JSON.parse(fs.readFileSync(`${S}/ud/shortcuts.json`, 'utf8'));
ok(saved.mini === 'Control+Alt+M', 'saved to shortcuts.json');

// a clash is refused with a message
await page.locator('.st-keys .st-w').nth(1).click();
await page.keyboard.press('Control+Alt+KeyM');
await wait(400);
st = await page.evaluate(() => window.sienna.keys.get());
const msg = await page.evaluate(() => document.querySelector('.st-keys .st-msg').textContent);
ok(st.app === 'Control+Alt+L' && /Mini player/.test(msg), `clash refused: "${msg}"`);
ok(JSON.stringify(await registered()) === JSON.stringify(['Control+Alt+L', 'Control+Alt+M']), 'globals back after the refused one');

// Esc cancels a recording without closing the card
await page.locator('.st-keys .st-w').nth(1).click();
await page.keyboard.press('Escape');
await wait(200);
ok((await words())[1] === 'Ctrl + Alt + L' && await page.evaluate(() => document.querySelector('.st-veil').classList.contains('show')), 'Esc cancels recording, card stays');

// search: record Ctrl+Shift+F, then it opens the bar (and the old Ctrl+Alt+J does not)
await page.locator('.st-keys .st-w').nth(0).click();
await page.keyboard.press('Control+Shift+KeyF');
await wait(300);
await page.keyboard.press('Escape');   // close the card
await wait(500);
await page.keyboard.press('Control+Alt+KeyJ');
await wait(500);
const oldOpens = await page.evaluate(() => document.activeElement?.tagName === 'INPUT');
await page.keyboard.press('Control+Shift+KeyF');
await wait(800);
const newOpens = await page.evaluate(() => document.activeElement?.tagName === 'INPUT');
ok(!oldOpens && newOpens, `search follows its new shortcut (old opens: ${oldOpens}, new opens: ${newOpens})`);
await page.screenshot({ path: `${S}/search-new-key.png` });
await page.keyboard.press('Escape');

// the mini window got the change too
const mini = await app.evaluate(() => { global.__siennaMini.prewarm(); return true; });
let miniPage;
for (let i = 0; i < 40 && !miniPage; i++) { miniPage = app.windows().find((w) => w.url().endsWith('mini.html')); if (!miniPage) await wait(250); }
await miniPage.waitForLoadState();
await wait(500);
const miniSearch = await miniPage.evaluate(() => window.sienna.keys.get().then((k) => k.search));
ok(mini && miniSearch === 'Control+Shift+F', `mini window sees search = ${miniSearch}`);

// Reset (the global keys themselves cannot be pressed under xvfb: Electron's X11 grab is checked with isRegistered)
await page.evaluate(() => window.sienna.keys.reset());
await wait(300);
st = await page.evaluate(() => window.sienna.keys.get());
ok(st.search === 'Control+Alt+J' && st.mini === 'Control+Alt+K' && st.app === 'Control+Alt+L', 'Reset puts the defaults back');
ok(JSON.stringify(await registered()) === JSON.stringify(['Control+Alt+K', 'Control+Alt+L']), 'defaults registered after reset');

await app.close();
console.log(failed ? `${failed} FAILED` : 'all shortcut checks passed');
process.exit(failed ? 1 : 0);
