// Real sheets/notes with an isolated fake store; no WebGL or real account is required.
// Usage: node scripts/sheets-check.mjs <out_dir> (SIENNA_PORT, SIENNA_ANGLE)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-sheets');
const port = Number(process.env.SIENNA_PORT) || 5263;
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const angle = process.env.SIENNA_ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const wait = ms => page.waitForTimeout(ms);
const pass = text => console.log(`PASS ${text}`);
const shot = name => page.screenshot({ path: `${out}/${name}.png` });
const rail = id => page.locator(`.st-side .ui-ink[data-page="${id}"]`);
const active = () => page.locator('.st-page.on');
const tourAction = name => page.locator('.tr-stage:not(.tr-ghost)').getByRole('button', { name, exact: true });
const tuck = async expected => assert.equal(await page.locator('.cad-tag').evaluate(el => el.classList.contains('tucked')), expected);
try {
  await page.addInitScript(() => {
    localStorage.setItem('sienna.settings', JSON.stringify({ font: 'amatic' }));
    window.__clicks = [];
    document.addEventListener('click', e => window.__clicks.push({ target: e.target.className, text: e.target.textContent?.slice(0, 80) }), true);
    window.__kitCallbacks = { raf: 0, timeout: 0, interval: 0 };
    for (const [name, kind] of [['requestAnimationFrame', 'raf'], ['setTimeout', 'timeout'], ['setInterval', 'interval']]) {
      const original = window[name].bind(window);
      window[name] = (callback, ...args) => {
        const kit = /\/src\/ui\//.test(new Error().stack || '');
        return original(kit && typeof callback === 'function' ? (...values) => {
          window.__kitCallbacks[kind]++; return callback(...values);
        } : callback, ...args);
      };
    }
  });
  await page.route('**/sheets-fixture.html*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><script type="module" src="/src/fonts.js"></script></head><body></body></html>' }));
  await page.goto(`http://127.0.0.1:${port}/sheets-fixture.html?tour=0&shot`);
  await page.evaluate(async () => {
    const { createSettingsPanel } = await import('/src/settings-panel.js');
    const { createLiner, showWebGLError } = await import('/src/liner.js');
    const { createTour } = await import('/src/tour.js');
    const { createCaption } = await import('/src/controls.js');
    const { settings } = await import('/src/settings.js');
    const { brushButton, brushStats } = await import('/src/ui/brush.js');
    const { paperStats } = await import('/src/ui/paper.js');
    const f = window.fixture = { settings, showWebGLError, listeners: [], accounts: [], keys: [], signIns: 0, signOuts: 0, retries: 0,
      loginItem: false, loginMode: 'normal', loginCalls: [], loginRejections: 0,
      lyricsMode: 'full', calls: [], state: { ready: true, signedIn: true, videoId: 'first', title: 'A quiet record', artist: 'Test artist', duration: 180, position: 20, playerState: 2, queueSig: 1 },
    };
    f.music = {
      real: false, state: f.state,
      onState: fn => { f.listeners.push(fn); fn(f.state); },
      onAccount: fn => f.accounts.push(fn),
      account: async () => { if (f.accountFails) throw Error('fake account failure'); return f.state.signedIn ? { name: 'Test listener' } : null; },
      accounts: async () => [],
      signIn: () => { f.signIns++; }, addAccount: () => {},
      signOut: async () => { f.signOuts++; f.emit({ signedIn: false }); f.accounts.forEach(fn => fn(false)); },
      app: { info: async () => ({ version: '0.1.0', loginItem: f.loginItem }), loginItem: async value => {
        f.loginCalls.push(value);
        if (f.loginMode === 'error') { f.loginRejections++; throw Error('fake login-item failure'); }
        if (f.loginMode === 'pending') return new Promise(resolve => { f.releaseLogin = () => { f.loginItem = value; resolve(value); }; });
        f.loginItem = value; return value;
      },
        checkUpdates: async () => ({ ok: true, current: '0.1.0', hasUpdate: false }), diagnostics: async () => ({ version: '0.1.0' }),
      },
      queue: async () => [{ videoId: 'first', title: 'A quiet record', selected: true, index: 0 }],
      command: () => {},
      lyrics: async id => {
        f.calls.push(id);
        if (f.lyricsMode === 'pending') return new Promise(resolve => { f.releaseLyrics = resolve; });
        if (f.lyricsMode === 'error') throw Error('fake lyrics failure');
        if (f.lyricsMode === 'empty') return null;
        return { lyrics: Array.from({ length: 45 }, (_, i) => `${id} — A quiet line of lyrics ${i + 1}`).join('\n'), source: 'Fixture liner notes' };
      },
    };
    f.emit = patch => {
      Object.assign(f.state, patch);
      f.listeners.forEach(fn => fn(f.state));
      f.caption?.setState(f.state); f.tour?.setState(f.state);
    };
    f.caption = createCaption({ onSeek: () => {}, onCommand: () => {}, onSignIn: () => f.music.signIn(),
      onLyrics: () => f.liner.openLyrics(f.state), onQueue: () => f.liner.openQueue(),
    });
    f.caption.setState(f.state); f.caption.show(true);
    f.liner = createLiner({ music: f.music });
    f.panel = createSettingsPanel({ music: f.music, onTour: () => f.tour.restart() });
    f.panel.show(true);
    f.tour = createTour({ music: f.music, playerBox: () => ({ right: innerWidth - 40, bottom: innerHeight + 80 }) });
    f.tour.setState(f.state);
    f.witness = brushButton('Lettering witness', { seed: 913 });
    document.body.appendChild(f.witness);
    f.stats = () => ({ paper: paperStats(), brush: brushStats() });
    window.addEventListener('keydown', e => f.keys.push(e.key));
    await Promise.all([document.fonts.ready, f.caption.ready()]);
  });
  await wait(800);
  const opener = page.locator('.st-btn').getByRole('button', { name: 'Settings', exact: true });
  await opener.focus(); await page.keyboard.press('Enter'); await wait(750);
  const dialog = page.locator('.st-settings [role="dialog"]');
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  const labelledBy = await dialog.getAttribute('aria-labelledby');
  assert.equal(await page.locator(`#${labelledBy}`).textContent(), 'Settings');
  await tuck(true);
  await page.evaluate(() => { fixture.keys = []; });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(i % 2 ? 'Tab' : 'Shift+Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
  }
  await rail('account').focus();
  for (const key of ['Space', 'ArrowLeft', 'KeyM', 'ArrowRight']) await page.keyboard.press(key);
  assert.deepEqual(await page.evaluate(() => fixture.keys), []);
  await page.keyboard.press('Escape'); await wait(350);
  assert.equal(await page.evaluate(() => fixture.panel.isOpen()), false);
  assert.equal(await opener.evaluate(el => document.activeElement === el), true);
  await tuck(false);
  await opener.click(); await wait(650);
  await page.locator('.st-settings').click({ position: { x: 5, y: 5 } }); await wait(350);
  assert.equal(await page.evaluate(() => fixture.panel.isOpen()), false);
  assert.equal(await opener.evaluate(el => document.activeElement === el), true);
  await opener.click(); await wait(650);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await wait(350);
  assert.equal(await page.evaluate(() => fixture.panel.isOpen()), false);
  assert.equal(await opener.evaluate(el => document.activeElement === el), true);
  pass('Settings: labelled modal, Escape/veil/Close, opener focus return, trapped Tab and no shop keys');

  await page.evaluate(() => fixture.panel.open('look')); await wait(700);
  const lettering = active().getByRole('radiogroup', { name: 'Lettering', exact: true });
  assert.equal(await lettering.getByRole('radio', { checked: true }).innerText(), 'Amatic');
  const beforeFont = await page.evaluate(() => fixture.stats().brush.repaints);
  await lettering.getByRole('radio', { name: 'Caveat', exact: true }).click();
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--sienna-font').includes('Caveat'));
  await wait(750);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sienna.settings')).font), 'caveat');
  assert.equal((await page.evaluate(() => fixture.stats().brush.repaints)) - beforeFont, 1, 'visible lettering witness repaints exactly once');
  await lettering.getByRole('radio', { name: 'Amatic', exact: true }).click();
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--sienna-font').includes('Amatic'));
  await wait(500);
  await rail('performance').click();
  await active().getByRole('radiogroup', { name: 'Sharpness' }).getByRole('radio', { name: 'Light', exact: true }).click();
  assert.equal(await page.evaluate(() => fixture.settings.get('sharp')), 'light');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sienna.settings')).sharp), 'light');
  await page.keyboard.press('Escape'); await wait(350);
  await page.evaluate(() => fixture.panel.open('performance')); await wait(650);
  assert.equal(await active().getByRole('radiogroup', { name: 'Sharpness' }).getByRole('radio', { name: 'Light', exact: true }).getAttribute('aria-checked'), 'true');
  await rail('playback').click();
  const login = active().getByRole('radiogroup', { name: 'Start at login' });
  await login.getByRole('radio', { name: 'On', exact: true }).click();
  await page.waitForFunction(() => fixture.loginItem);
  assert.equal(await login.getByRole('radio', { name: 'On', exact: true }).getAttribute('aria-checked'), 'true');
  await page.evaluate(() => { fixture.loginMode = 'pending'; });
  await login.getByRole('radio', { name: 'Off', exact: true }).click();
  assert.equal(await login.getByRole('radio', { name: 'On', exact: true }).getAttribute('aria-checked'), 'true', 'login choice waits for backend acknowledgement');
  await page.evaluate(() => fixture.releaseLogin());
  await page.waitForFunction(() => document.querySelector('.st-page.on [role="radiogroup"][aria-label="Start at login"] [role="radio"].is-on')?.textContent === 'Off');
  await page.evaluate(() => { fixture.loginMode = 'error'; });
  await login.getByRole('radio', { name: 'On', exact: true }).click();
  await page.waitForFunction(() => fixture.loginRejections === 1);
  assert.equal(await login.getByRole('radio', { name: 'Off', exact: true }).getAttribute('aria-checked'), 'true', 'rejected login request retains the last confirmed value');
  assert.deepEqual(await page.evaluate(() => fixture.loginCalls), [true, false, true]);
  await rail('account').click(); await wait(200);
  await active().getByRole('button', { name: 'Sign out', exact: true }).click();
  assert.equal(await active().getByRole('button', { name: 'Yes, sign out', exact: true }).isVisible(), true);
  assert.equal(await active().getByRole('button', { name: 'Yes, sign out', exact: true }).evaluate(el => el.classList.contains('ui-ink--danger')), true);
  const cancel = active().getByRole('button', { name: 'Keep me in', exact: true });
  await cancel.scrollIntoViewIfNeeded();
  assert.equal(await cancel.evaluate(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el;
  }), true, 'scrolled confirmation remains pointer-hittable under the leaning sheet');
  await cancel.click();
  assert.equal(await page.locator('.st-confirm.on').count(), 0);
  assert.equal(await page.evaluate(() => fixture.signOuts), 0);
  await active().getByRole('button', { name: 'Sign out', exact: true }).click();
  await active().getByRole('button', { name: 'Yes, sign out', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.st-page.on .st-name')?.textContent === 'Not signed in');
  assert.equal(await page.evaluate(() => fixture.signOuts), 1);
  await page.evaluate(() => { fixture.accountFails = true; fixture.accounts.forEach(fn => fn()); });
  await active().getByRole('button', { name: 'Try again', exact: true }).waitFor();
  await page.evaluate(() => { fixture.accountFails = false; });
  await active().getByRole('button', { name: 'Try again', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.st-page.on .st-name')?.textContent === 'Not signed in');
  pass('Settings choices: radio persistence, lettering paints once, quality, danger confirmation/cancel/sign-out and account error recovery');

  const pages = ['account', 'look', 'playback', 'performance', 'shortcuts', 'tour', 'about'];
  for (const [width, height] of [[1280, 720], [1024, 640]]) {
    await page.setViewportSize({ width, height }); await wait(450);
    for (const id of pages) {
      await rail(id).click(); await wait(200);
      assert.equal(await rail(id).getAttribute('aria-current'), 'page');
      await page.waitForFunction(id => {
        const el = document.querySelector(`.st-side [data-page="${id}"]`);
        return el.classList.contains('is-on') && getComputedStyle(el).color === 'rgb(166, 68, 47)' && getComputedStyle(el.querySelector('.ui-ink-line')).opacity === '1';
      }, id);
      assert.ok((await active().locator('.st-page-title').innerText()).length);
      assert.ok((await active().locator('.st-page-desc').innerText()).length);
      assert.match(await active().locator('.st-page-desc').evaluate(el => getComputedStyle(el).fontFamily), /Alegreya/);
      const top = await page.evaluate(() => {
        const s = document.querySelector('.st-scroll'), cue = document.querySelector('.st-settings .ui-scroll-cue');
        const c = document.querySelector('.st-settings .ui-sheet-card').getBoundingClientRect();
        return { more: s.scrollHeight - s.clientHeight > 2, cue: cue.getAttribute('aria-hidden'), fade: s.classList.contains('ui-scroll-more'), box: c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight };
      });
      assert.equal(top.box, true, `${width} ${id}: sheet fits`);
      if (top.more) { assert.equal(top.cue, 'false'); assert.equal(top.fade, true); }
      await page.locator('.st-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; }); await wait(100);
      const bottom = await page.evaluate(() => {
        const s = document.querySelector('.st-scroll');
        const last = document.querySelector('.st-page.on').lastElementChild.getBoundingClientRect();
        return { last: last.bottom, edge: s.getBoundingClientRect().bottom, more: s.classList.contains('ui-scroll-more'), cue: document.querySelector('.st-settings .ui-scroll-cue').getAttribute('aria-hidden') };
      });
      assert.equal(bottom.more, false, `${width} ${id}: no bottom fade`);
      assert.equal(bottom.cue, 'true');
      assert.ok(bottom.last <= bottom.edge + 3, `${width} ${id}: last row reachable`);
      if (id === 'look' || id === 'performance') await shot(`settings-${id}${id === 'performance' ? '-bottom' : ''}-${width}x${height}`);
    }
  }
  pass('Settings rail/pages: selected ink/aria-current, titles/serif descriptions; all pages fit or cue/scroll to an unfaded last row at both sizes');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => fixture.panel.open('performance')); await wait(800);
  const beforePaper = await page.evaluate(() => fixture.stats().paper.paints);
  await page.keyboard.press('Escape'); await wait(350);
  await page.evaluate(() => fixture.panel.open('performance')); await wait(800);
  assert.equal(await page.evaluate(() => fixture.stats().paper.paints), beforePaper, 'reopening keeps cached paper');
  await page.mouse.move(0, 0); await wait(600);
  await page.evaluate(() => { window.__kitCallbacks = { raf: 0, timeout: 0, interval: 0 }; });
  await wait(2100);
  assert.deepEqual(await page.evaluate(() => window.__kitCallbacks), { raf: 0, timeout: 0, interval: 0 });
  await page.keyboard.press('Escape'); await wait(350); await tuck(false);
  pass('painting/idle: reopening does not repaint paper; open idle sheet has zero kit rAF/timeout/interval callbacks over 2 s');

  await page.evaluate(() => { fixture.lyricsMode = 'pending'; void fixture.liner.openLyrics(fixture.state); });
  await page.locator('.ln-sheet.show [role="dialog"]').waitFor(); await wait(650); await tuck(true);
  assert.match(await page.locator('.ln-sheet .ln-empty').innerText(), /Looking up/);
  await page.evaluate(() => { fixture.releaseLyrics({ lyrics: 'A first line\nA second line', source: 'Fake source' }); });
  await page.locator('.ln-lyrics').waitFor();
  const reading = await page.locator('.ln-lyrics').evaluate(el => { const c = getComputedStyle(el); return [c.fontFamily, c.fontSize, c.lineHeight, c.textTransform]; });
  assert.match(reading[0], /Alegreya/); assert.deepEqual(reading.slice(1), ['20px', '32px', 'none']);
  assert.equal(await page.locator('.ln-sheet .ui-sheet-title').innerText(), 'A quiet record · Test artist');
  await page.evaluate(() => { fixture.lyricsMode = 'full'; fixture.emit({ videoId: 'second', title: 'The second record' }); });
  await page.waitForFunction(() => document.querySelector('.ln-lyrics')?.textContent.startsWith('second'));
  assert.equal(await page.locator('.ln-sheet .ui-sheet-title').innerText(), 'The second record · Test artist');
  await shot('lyrics-1280x720');
  assert.equal(await page.locator('.ln-sheet .ui-scroll-cue').getAttribute('aria-hidden'), 'false');
  await page.locator('.ln-sheet .ui-sheet-body').evaluate(el => { el.scrollTop = el.scrollHeight; }); await wait(100);
  assert.equal(await page.locator('.ln-sheet .ui-scroll-cue').getAttribute('aria-hidden'), 'true');
  await page.evaluate(() => fixture.liner.openQueue()); await wait(800);
  assert.equal(await page.locator('.ln-sheet.show').count(), 0);
  assert.equal(await page.locator('.ln-qveil.show').count(), 1);
  await page.evaluate(() => { fixture.lyricsMode = 'empty'; void fixture.liner.openLyrics(fixture.state); }); await wait(650);
  assert.equal(await page.locator('.ln-qveil.show').count(), 0);
  assert.match(await page.locator('.ln-sheet .ln-empty').innerText(), /No lyrics/);
  await page.evaluate(() => { fixture.liner.close(); fixture.lyricsMode = 'error'; void fixture.liner.openLyrics(fixture.state); }); await wait(650);
  assert.match(await page.locator('.ln-sheet .ln-empty').innerText(), /Could not load/);
  await page.evaluate(() => { fixture.lyricsMode = 'full'; });
  await page.locator('.ln-sheet').getByRole('button', { name: 'Retry', exact: true }).click();
  await page.locator('.ln-lyrics').waitFor();
  await page.keyboard.press('Escape'); await wait(350);
  await page.evaluate(() => fixture.liner.openLyrics({})); await wait(650);
  assert.match(await page.locator('.ln-sheet .ln-empty').innerText(), /Play a record first/);
  await page.keyboard.press('Escape'); await wait(350);
  await page.evaluate(() => { fixture.lyricsMode = 'pending'; void fixture.liner.openLyrics(fixture.state); }); await wait(650);
  await page.evaluate(() => fixture.liner.openQueue()); await wait(800);
  await page.evaluate(() => { fixture.releaseLyrics({ lyrics: 'stale answer' }); }); await wait(100);
  assert.equal(await page.locator('.ln-sheet.show').count(), 0);
  assert.equal(await page.locator('.ln-qveil.show').count(), 1);
  await page.keyboard.press('Escape'); await wait(500); await tuck(false);
  pass('Lyrics: sheet/serif reading size, loading/full/empty/no-track/error/Retry, scroll cue, live track titles, Queue exclusion and stale-answer guard');

  for (const [width, height] of [[1280, 720], [1024, 640]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { fixture.emit({ signedIn: false, videoId: null }); fixture.tour.restart(); }); await wait(800);
    const checkNote = async step => {
      assert.equal(await page.evaluate(() => fixture.tour.step), step);
      const note = page.locator('.tr-stage:not(.tr-ghost) .tr-note');
      assert.equal(await note.evaluate(el => el.classList.contains('ui-paper')), true);
      assert.match(await note.locator('.tr-body').evaluate(el => getComputedStyle(el).fontFamily), /Alegreya/);
      const box = await note.boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `${step} fits ${width}x${height}: ${JSON.stringify(box)}`);
      const disc = await page.locator('.tr-stage:not(.tr-ghost) > .tr-disc').boundingBox();
      assert.ok(disc.x >= 0 && disc.y >= 0 && disc.x + disc.width <= width && disc.y + disc.height <= height, `${step} record badge fits ${width}x${height}: ${JSON.stringify(disc)}`);
      const progress = await page.locator('.tr-prog').boundingBox();
      assert.equal(box.x < progress.x + progress.width && box.x + box.width > progress.x && box.y < progress.y + progress.height && box.y + box.height > progress.y, false, `${step} keeps clear of the progress row`);
      assert.equal(await page.locator('.tr-stage:not(.tr-ghost) button:not(.ui-ink):not(.ui-brush)').count(), 0);
      await tuck(true);
      await shot(`tour-${step}-${width}x${height}`);
    };
    await checkNote('welcome');
    assert.equal(await tourAction('Sign in').evaluate(el => el.classList.contains('ui-brush')), true);
    const signIns = await page.getByRole('button', { name: 'Sign in', exact: true }).evaluateAll(buttons => buttons.filter(el => {
      if (!el.getClientRects().length) return false;
      for (let p = el; p; p = p.parentElement) if (+getComputedStyle(p).opacity === 0 || getComputedStyle(p).visibility === 'hidden') return false;
      const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    }).length);
    assert.equal(signIns, 1);
    await tourAction('Look around first').click(); await wait(150); await checkNote('letters');
    await tourAction('Next').click(); await wait(150); await checkNote('smooth');
    await tourAction('Back').click(); await wait(150); assert.equal(await page.evaluate(() => fixture.tour.step), 'letters');
    await tourAction('Next').click(); await wait(150);
    await tourAction('Next').click(); await wait(150); await checkNote('record');
    await page.evaluate(() => fixture.emit({ videoId: `playing-${innerWidth}`, playerState: 1 })); await wait(150); await checkNote('player');
    await tourAction('Got it').click(); await wait(150); await checkNote('keys');
    await tourAction('Next').click(); await wait(150); await checkNote('bye');
    await tourAction('Enjoy').click(); await wait(650); await tuck(false);
  }
  await page.evaluate(() => fixture.panel.open('tour')); await wait(650);
  await active().getByRole('button', { name: 'Show it again', exact: true }).click(); await wait(650);
  assert.equal(await page.evaluate(() => fixture.tour.step), 'welcome');
  assert.equal(await page.evaluate(() => fixture.panel.isOpen()), false);
  await page.locator('.tr-skip').getByRole('button', { name: 'Skip tour', exact: true }).click(); await wait(650); await tuck(false);
  pass('Tour: paper/tape, serif body and kit controls; every note clamped at both sizes, one welcome Sign in, Back, Skip and Settings restart');

  await page.setViewportSize({ width: 1280, height: 720 });
  for (const [kind, role] of [['offline', 'status'], ['error', 'alert'], ['restock', 'status']]) {
    await page.evaluate(kind => fixture.liner.setStatus(`Fixture ${kind} notice`, () => { fixture.retries++; }, kind), kind); await wait(450);
    const banner = page.locator('.ui-banner.show');
    assert.equal(await banner.getAttribute('role'), role);
    assert.equal(await banner.evaluate((el, kind) => el.classList.contains(`ui-banner--${kind}`) && el.classList.contains('ui-paper'), kind), true);
    await banner.getByRole('button', { name: 'Retry', exact: true }).click();
    await shot(`banner-${kind}-1280x720`);
  }
  assert.equal(await page.evaluate(() => fixture.retries), 3);
  await page.evaluate(() => fixture.liner.setStatus(null)); await wait(350);
  assert.equal(await page.locator('.ui-banner.show').count(), 0);
  await page.evaluate(() => fixture.showWebGLError(Error('Fixture WebGL failure'))); await wait(450);
  const fallback = page.locator('.ln-fatal-card');
  assert.equal(await fallback.evaluate(el => el.classList.contains('ui-paper')), true);
  assert.equal(await fallback.getAttribute('role'), 'alert');
  assert.equal(await fallback.locator('h1').evaluate(el => getComputedStyle(el).color), 'rgb(45, 49, 88)');
  assert.match(await fallback.locator('p').first().evaluate(el => getComputedStyle(el).fontFamily), /Alegreya/);
  assert.equal(await fallback.locator('.ui-paper-bg').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(248, 241, 226)');
  assert.match(await fallback.innerText(), /Fixture WebGL failure/);
  await shot('webgl-fallback-1280x720');
  assert.equal(await page.locator('button[title]').count(), 0);
  assert.equal(await page.evaluate(() => fixture.signIns), 0, 'no authentication invoked');
  assert.deepEqual(errors, []);
  pass('banners/fallback: correct status/alert kinds, Retry actions, hide, token paper/typography; no native titles or account authentication');
  console.log(`all sheets checks passed -> ${out}`);
} catch (error) {
  console.log('failure DOM', await page.evaluate(() => ({ clicks: window.__clicks?.slice(-8), active: document.activeElement?.textContent?.slice(0, 120), confirm: document.querySelector('.st-confirm')?.className, page: document.querySelector('.st-page.on')?.dataset.page })));
  await shot('failure');
  throw error;
} finally {
  await browser.close();
  await server.close();
}
