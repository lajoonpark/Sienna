// Visual regression matrix: captures every 2D UI surface (and 3D tags/stickers) across all 4 letterings
// (amatic, kaushan, sriracha, caveat) and 2 window sizes (1280x720, 1024x640), then builds one labelled
// contact sheet PNG per lettering x size and an index.html linking them.
//
// Usage:
//   node scripts/ui-matrix.mjs <out_dir> [surface-filter]
//
// Optional env:
//   SIENNA_PORT=5261
//   SIENNA_FONTS=amatic,kaushan,sriracha,caveat
//   SIENNA_SIZES=1280x720,1024x640
//   SIENNA_WC=1   (set 0 to disable oil paint)
//   SIENNA_APP_ROOT=.../app   (capture a baseline worktree with the same harness)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { outDir as safeOutDir } from './safe.mjs';

const [outArg, filterArg] = process.argv.slice(2);
const out = safeOutDir(outArg, 'sienna-ui-matrix');
const port = Number(process.env.SIENNA_PORT) || 5261;

const FONT_META = {
  amatic: { label: 'Amatic', match: 'Amatic' },
  kaushan: { label: 'Kaushan', match: 'Kaushan' },
  sriracha: { label: 'Sriracha', match: 'Sriracha' },
  caveat: { label: 'Caveat', match: 'Caveat' },
};

const FONTS = (process.env.SIENNA_FONTS || 'amatic,kaushan,sriracha,caveat')
  .split(',').map((s) => s.trim()).filter((k) => FONT_META[k]);
const SIZES = (process.env.SIENNA_SIZES || '1280x720,1024x640')
  .split(',').map((s) => s.trim().split('x').map(Number));
const WC_Q = process.env.SIENNA_WC === '0' ? '&wc=0' : '';

const ALL_SURFACES = [
  // Shop home & chrome
  'home-playing',
  'home-signin',
  'home-restock',
  // Search
  'search-empty',
  'search-typing',
  'search-songs',
  'search-albums',
  'search-playlists',
  'search-artists',
  // Collection list
  'collection-large',
  'collection-liked-filtered',
  // Queue & Lyrics
  'queue',
  'lyrics',
  // Settings (every page + guest state)
  'settings-account',
  'settings-account-guest',
  'settings-look',
  'settings-playback',
  'settings-performance',
  'settings-shortcuts',
  'settings-tour',
  'settings-about',
  // Banners & WebGL fallback
  'banner-offline',
  'banner-error',
  'banner-restock',
  'webgl-fallback',
  // Tour (all 7 steps)
  'tour-welcome',
  'tour-letters',
  'tour-smooth',
  'tour-record',
  'tour-player',
  'tour-keys',
  'tour-bye',
  // 3D tags, rack sign & album spread stickers
  'shop-3d-tag',
  'shop-3d-spread',
  // Mini window
  'mini-tag',
  // UI kit lab (Phase 2)
  'lab-tokens',
  'lab-paper',
  'lab-brush',
  'lab-ink',
  'lab-segmented',
  'lab-stamps',
  'lab-icons',
  'lab-list',
  'lab-sheet',
  'lab-banners',
  'lab-tag',
  'lab-compare',
];

const LAB_SECTION_SURFACES = [
  'lab-tokens',
  'lab-paper',
  'lab-brush',
  'lab-ink',
  'lab-segmented',
  'lab-stamps',
  'lab-icons',
  'lab-list',
  'lab-banners',
  'lab-tag',
];
const LAB_SURFACES = [...LAB_SECTION_SURFACES, 'lab-sheet', 'lab-compare'];

function matchSurfaces(filter) {
  if (!filter) return ALL_SURFACES;
  const parts = filter.split(',').map((s) => s.trim()).filter(Boolean);
  return ALL_SURFACES.filter((name) => parts.some((p) => name === p || name.includes(p)));
}

const SURFACES = matchSurfaces(filterArg);
if (!SURFACES.length) {
  console.error(`No surfaces matched filter "${filterArg}". Available:\n  ${ALL_SURFACES.join(', ')}`);
  process.exit(2);
}
const want = new Set(SURFACES);
const wantAny = (list) => list.some((s) => want.has(s));

const HOME_SURFACES = ALL_SURFACES.filter(
  (s) => !['shop-3d-tag', 'shop-3d-spread', 'mini-tag', ...LAB_SURFACES].includes(s),
);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function raf(page, n = 2) {
  await page.evaluate((count) => new Promise((resolve) => {
    const step = (k) => (k <= 0 ? resolve() : requestAnimationFrame(() => step(k - 1)));
    step(count);
  }), n);
}

async function setFontLive(page, fontKey) {
  const expected = FONT_META[fontKey].match;
  await page.evaluate(async (key) => {
    const { settings } = await import('/src/settings.js');
    settings.set('font', key);
  }, fontKey);
  await page.waitForFunction(
    (sub) => getComputedStyle(document.documentElement).getPropertyValue('--sienna-font').includes(sub),
    expected,
    { timeout: 20000 },
  );
  await page.evaluate(() => document.fonts?.ready);
  await raf(page, 3);
  await wait(160);
}

async function waitForShopReady(page) {
  await page.waitForFunction(
    () => window.__ready && window.__siennaDebug?.state?.introDone && window.__siennaDebug?.shelves?.length > 0,
    null,
    { timeout: 120000 },
  );
  await page.evaluate(async () => {
    const d = window.__siennaDebug;
    await Promise.all([d.suitcase.ready(), d.menu.ready(), document.fonts?.ready]);
    d.menu.relayout();
  });
  await raf(page, 4);
  await wait(500);
}

async function pinPlayingTrack(page) {
  await page.evaluate(async () => {
    const d = window.__siennaDebug;
    const item = d.shelves[0]?.items?.[2] ?? d.shelves[0]?.items?.[0];
    if (item) {
      await d.music.play(item);
      await d.music.command('seek', 42);
      await d.music.command('pause');
    }
  });
  try {
    await page.waitForFunction(() => {
      const cap = document.querySelector('.cad-tag .cap');
      return cap && !cap.classList.contains('empty') && !!cap.querySelector('.t')?.textContent;
    }, null, { timeout: 120000, polling: 100 });
  } catch (error) {
    console.error('Playback fixture:', await page.evaluate(() => ({
      items: window.__siennaDebug.shelves[0]?.items?.length,
      captions: [...document.querySelectorAll('.cad-tag')].map(e => e.outerHTML),
    })));
    throw error;
  }
  await wait(350);
}

async function domClick(page, selector, text = null) {
  const clicked = await page.evaluate(({ sel, txt }) => {
    const els = [...document.querySelectorAll(sel)];
    const target = txt == null ? els[0] : els.find((e) =>
      `${e.textContent} ${e.getAttribute('aria-label') || ''}`.toLowerCase().includes(txt.toLowerCase()) ||
      (txt === 'Queue' && e.getAttribute('aria-label') === 'Up next'));
    if (!target) return false;
    target.click();
    return true;
  }, { sel: selector, txt: text });
  if (!clicked) throw new Error(`domClick: no match for ${selector} (${text})`);
}

async function captureHomeSurfaces(page, vw, vh, fontKey, shotDir) {
  const snap = async (name) => {
    const file = join(shotDir, `${name}.png`);
    await page.evaluate(async () => {
      await window.__seek(3);
      const fps = document.querySelector('[data-matrix-fps="1"]');
      if (fps) {
        fps.style.display = 'block';
        (fps.querySelector('span') || fps).textContent = '120 fps · worst 99.9 ms';
      }
    });
    await raf(page, 2);
    await page.screenshot({ path: file, timeout: 60000 });
    process.stdout.write(`  ${name}\n`);
    return file;
  };

  // Keep cursor neutral so tilts are reproducible
  await page.mouse.move(Math.round(vw / 2), Math.round(vh / 2));
  await pinPlayingTrack(page);

  // 1. home-playing (with deterministic fps box + now-playing tag + shelf words + Restock + Settings)
  if (want.has('home-playing')) {
    await page.evaluate(() => {
      const box = document.querySelector('.fps-ticket') || [...document.querySelectorAll('body > div')].find(
        (d) => d.style.pointerEvents === 'none' && d.style.position === 'fixed' && d.style.left === '8px',
      );
      if (box) {
        box.dataset.matrixFps = '1';
        box.style.display = 'block';
        (box.querySelector('span') || box).textContent = '120 fps · worst 99.9 ms';
      }
    });
    await wait(120);
    await snap('home-playing');
    await page.evaluate(() => {
      const box = document.querySelector('[data-matrix-fps="1"]');
      if (box) { box.style.display = 'none'; delete box.dataset.matrixFps; }
    });
  }

  // 2. home-signin (guest mode with real=true so the SIGN IN brush plate shows)
  if (want.has('home-signin')) {
    await page.evaluate(async () => {
      const d = window.__siennaDebug;
      d.music.real = true;
      await d.music.signOut();
    });
    await page.waitForFunction(() => {
      const btn = document.querySelector('.cad-tag > .turn > button');
      const plate = btn?.querySelector('.plate, .ui-brush-plate');
      return btn && btn.style.display !== 'none' && plate && plate.style.backgroundImage;
    }, null, { timeout: 10000 });
    await wait(250);
    await snap('home-signin');
    await page.evaluate(async () => {
      const d = window.__siennaDebug;
      await d.music.signIn();
      d.music.real = false;
    });
    await wait(350);
    await pinPlayingTrack(page);
  }

  // 3. home-restock (Restocking… active hot state on top-right button)
  if (want.has('home-restock')) {
    await page.evaluate(() => {
      const d = window.__siennaDebug;
      window.__origShelves = d.music.shelves;
      d.music.shelves = () => new Promise((res) => { window.__resolveRestock = res; });
    });
    await domClick(page, '.st-btn button', 'Restock');
    await page.waitForFunction(
      () => document.querySelector('.st-btn button:disabled, .st-btn .st-w.on')?.textContent?.includes('Restocking'),
      null,
      { timeout: 5000 },
    );
    await wait(200);
    await snap('home-restock');
    await page.evaluate(async () => {
      const d = window.__siennaDebug;
      d.music.shelves = window.__origShelves;
      const res = await d.music.shelves();
      window.__resolveRestock?.(res);
    });
    await wait(500);
  }

  // 4-9. Search surfaces
  const searchSurfaces = ['search-empty', 'search-typing', 'search-songs', 'search-albums', 'search-playlists', 'search-artists'];
  if (wantAny(searchSurfaces)) {
    await page.evaluate(() => window.__siennaDebug.search.open());
    await wait(700);

    if (want.has('search-empty')) {
      await page.fill('.cs-input', '');
      await wait(200);
      await snap('search-empty');
    }

    if (want.has('search-typing')) {
      await page.evaluate(() => {
        const d = window.__siennaDebug;
        window.__origSearch = d.music.search;
        d.music.search = () => new Promise((res) => { window.__resolveSearch = res; });
      });
      await page.fill('.cs-input', '');
      await page.type('.cs-input', 'slowpoke', { delay: 10 });
      await page.waitForFunction(() => document.querySelector('.cs .ui-list-note')?.textContent?.includes('looking'), null, { timeout: 5000 });
      await wait(250);
      await snap('search-typing');
      await page.evaluate(() => {
        const d = window.__siennaDebug;
        d.music.search = window.__origSearch;
      });
      await page.fill('.cs-input', '');
      await page.evaluate(() => { window.__resolveSearch?.([]); });
      await wait(150);
    }

    if (want.has('search-songs')) {
      await page.locator('.cs [role="tab"]', { hasText: 'Songs' }).click();
      await page.fill('.cs-input', '');
      await page.fill('.cs-input', 'lemon');
      try {
        await page.waitForFunction(() => document.querySelectorAll('.cs .ui-list-row').length > 0, null, { timeout: 5000 });
      } catch (error) {
        console.error('Search fixture:', await page.evaluate(async () => ({
          input: document.querySelector('.cs-input')?.value,
          note: document.querySelector('.cs .ui-list-note')?.textContent,
          rows: document.querySelectorAll('.cs .ui-list-row').length,
          filter: document.querySelector('.cs [role="tab"][aria-selected="true"]')?.textContent,
          originalRestored: window.__siennaDebug.music.search === window.__origSearch,
          matches: (await window.__siennaDebug.music.search('lemon', 'songs')).length,
        })));
        throw error;
      }
      await wait(650);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await wait(200);
      await snap('search-songs');
    }

    if (want.has('search-albums')) {
      await page.locator('.cs [role="tab"]', { hasText: 'Albums' }).click();
      await page.fill('.cs-input', 'e');
      await page.waitForFunction(() => document.querySelectorAll('.cs .ui-list-row').length > 0, null, { timeout: 5000 });
      await wait(650);
      await snap('search-albums');
    }

    if (want.has('search-playlists')) {
      await page.locator('.cs [role="tab"]', { hasText: 'Playlists' }).click();
      await page.fill('.cs-input', 'a');
      await page.waitForFunction(() => document.querySelectorAll('.cs .ui-list-row').length > 0, null, { timeout: 5000 });
      await wait(650);
      await snap('search-playlists');
    }

    if (want.has('search-artists')) {
      await page.locator('.cs [role="tab"]', { hasText: 'Artists' }).click();
      await page.fill('.cs-input', 'a');
      await page.waitForFunction(() => document.querySelectorAll('.cs .ui-list-row').length > 0, null, { timeout: 5000 });
      await wait(650);
      await snap('search-artists');
    }

    await page.locator('.cs [role="tab"]', { hasText: 'Songs' }).click();
    await page.fill('.cs-input', '');
    await page.evaluate(() => window.__siennaDebug.search.close());
    await wait(550);
  }

  // 10-11. Collection list (large album > 15 songs, and Liked music with filter)
  if (want.has('collection-large')) {
    await page.evaluate(() => window.__siennaDebug.search.open());
    await wait(550);
    await page.locator('.cs [role="tab"]', { hasText: 'Albums' }).click();
    await page.fill('.cs-input', 'Ember Gold');
    await page.waitForFunction(() => document.querySelectorAll('.cs .ui-list-row').length > 0, null, { timeout: 5000 });
    await wait(450);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('.cl.show') && document.querySelectorAll('.cl .ui-list-row').length > 5,
      null,
      { timeout: 10000 },
    );
    await wait(750);
    await snap('collection-large');
    await page.keyboard.press('Escape');
    await wait(550);
  }

  if (want.has('collection-liked-filtered')) {
    await page.evaluate(async () => {
      const d = window.__siennaDebug;
      const lib = await d.music.library();
      const liked = lib.shelves[0].items[0];
      window.__origSearchForLiked = d.music.search;
      d.music.search = async (q, filter) => (q === '__liked__' ? [liked] : window.__origSearchForLiked(q, filter));
    });
    await page.evaluate(() => window.__siennaDebug.search.open());
    await wait(550);
    await page.locator('.cs [role="tab"]', { hasText: 'Songs' }).click();
    await page.fill('.cs-input', '__liked__');
    await page.waitForFunction(() => document.querySelectorAll('.cs .ui-list-row').length > 0, null, { timeout: 5000 });
    await wait(400);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('.cl.show') && document.querySelectorAll('.cl .ui-list-row').length > 5,
      null,
      { timeout: 10000 },
    );
    await wait(700);
    await page.locator('.cl [role="tab"]', { hasText: 'Title' }).click();
    await page.fill('.cl-input', 'l');
    await wait(300);
    await page.keyboard.press('ArrowDown');
    await wait(200);
    await snap('collection-liked-filtered');
    await page.keyboard.press('Escape');
    await wait(120);
    await page.keyboard.press('Escape');
    await wait(550);
    await page.evaluate(() => {
      const d = window.__siennaDebug;
      if (window.__origSearchForLiked) {
        d.music.search = window.__origSearchForLiked;
        delete window.__origSearchForLiked;
      }
    });
  }

  // 12. Queue drawer
  if (want.has('queue')) {
    await pinPlayingTrack(page);
    await domClick(page, '.cad-tag .tool, .cad-tag .ui-stamp', 'Queue');
    await page.waitForFunction(
      () => document.querySelector('.ln-qveil.show') && document.querySelectorAll('.ln-qveil .ui-list-row').length > 0,
      null,
      { timeout: 10000 },
    );
    await wait(800);
    await snap('queue');
    await page.keyboard.press('Escape');
    await wait(400);
  }

  // 13. Lyrics sheet
  if (want.has('lyrics')) {
    await pinPlayingTrack(page);
    await domClick(page, '.cad-tag .tool, .cad-tag .ui-stamp', 'Lyrics');
    await page.waitForFunction(
      () => document.querySelector('.ln-sheet.show, .ln-veil.show') && document.querySelector('.ln-lyrics'),
      null,
      { timeout: 10000 },
    );
    await wait(750);
    await snap('lyrics');
    await page.keyboard.press('Escape');
    await wait(400);
  }

  // 14-21. Settings pages
  const settingsSurfaces = [
    'settings-account', 'settings-account-guest', 'settings-look', 'settings-playback',
    'settings-performance', 'settings-shortcuts', 'settings-tour', 'settings-about',
  ];
  if (wantAny(settingsSurfaces)) {
    const accountName = await page.evaluate(async () => (await window.__siennaDebug.music.account()).name);
    await domClick(page, '.st-btn button', 'Settings');
    await page.waitForSelector('.st-settings.show, .st-veil.show', { timeout: 10000 });
    await wait(750);

    const openPage = async (id) => {
      await domClick(page, `.st-side :is(.ui-ink, .st-w)[data-page="${id}"]`);
      await page.waitForFunction((p) => document.querySelector('.st-page.on')?.dataset.page === p, id, { timeout: 5000 });
      await wait(450);
    };

    if (want.has('settings-account')) {
      await openPage('account');
      await page.waitForFunction(name => document.querySelector('.st-page.on .st-name')?.textContent?.includes(name), accountName, { timeout: 10000 });
      await wait(250);
      await snap('settings-account');
    }

    if (want.has('settings-account-guest')) {
      await openPage('account');
      await page.evaluate(() => window.__siennaDebug.music.signOut());
      await page.waitForFunction(() => document.querySelector('.st-page.on .st-name')?.textContent?.includes('Not signed in'), null, { timeout: 10000 });
      await wait(300);
      await snap('settings-account-guest');
      await page.evaluate(() => window.__siennaDebug.music.signIn());
      await page.waitForFunction(name => document.querySelector('.st-page.on .st-name')?.textContent?.includes(name), accountName, { timeout: 10000 });
      await wait(250);
    }

    for (const id of ['look', 'playback', 'performance', 'shortcuts', 'tour', 'about']) {
      if (want.has(`settings-${id}`)) {
        await openPage(id);
        await snap(`settings-${id}`);
        if (id === 'performance') {
          await page.evaluate(() => { const scroller = document.querySelector('.st-scroll'); scroller.scrollTop = scroller.scrollHeight; });
          await raf(page, 2);
          await page.screenshot({ path: join(out, `settings-performance-bottom-${vw}x${vh}-${fontKey}.png`), timeout: 60000 });
        }
      }
    }

    await page.keyboard.press('Escape');
    await wait(400);
  }

  // 22-24. Banners (offline, error, restock-offline)
  if (want.has('banner-offline')) {
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.waitForSelector('.ui-banner.show, .ln-banner.show', { timeout: 5000 });
    await wait(250);
    await snap('banner-offline');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await wait(150);
  }

  if (want.has('banner-error')) {
    await page.waitForFunction(() => document.querySelector('.st-btn button')?.textContent?.trim() === 'Restock', null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => {
      const d = window.__siennaDebug;
      window.__origShelvesErr = d.music.shelves;
      d.music.shelves = async () => { throw new Error('network error'); };
    });
    await domClick(page, '.st-btn button', 'Restock');
    await page.waitForFunction(
      () => document.querySelector(':is(.ui-banner.show .ui-banner-msg, .ln-banner.show .ln-bmsg)')?.textContent?.includes('Could not reach'),
      null,
      { timeout: 5000 },
    );
    await wait(500);
    await snap('banner-error');
    await page.evaluate(() => {
      const d = window.__siennaDebug;
      d.music.shelves = window.__origShelvesErr;
    });
    await domClick(page, '.ui-banner button, .ln-banner button', 'Retry');
    await wait(700);
  }

  if (want.has('banner-restock')) {
    await page.waitForFunction(() => document.querySelector('.st-btn button')?.textContent?.trim() === 'Restock', null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => {
      const d = window.__siennaDebug;
      window.__origShelvesRestock = d.music.shelves;
      d.music.shelves = async () => { throw new Error('offline'); };
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    });
    await domClick(page, '.st-btn button', 'Restock');
    await page.waitForFunction(
      () => document.querySelector(':is(.ui-banner.show .ui-banner-msg, .ln-banner.show .ln-bmsg)')?.textContent?.includes('restock'),
      null,
      { timeout: 5000 },
    );
    await wait(500);
    await snap('banner-restock');
    await page.evaluate(() => {
      const d = window.__siennaDebug;
      d.music.shelves = window.__origShelvesRestock;
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });
    await domClick(page, '.ui-banner button, .ln-banner button', 'Retry');
    await wait(700);
  }

  // 25. WebGL fallback card
  if (want.has('webgl-fallback')) {
    await page.evaluate(async () => {
      const { showWebGLError } = await import('/src/liner.js');
      showWebGLError(new Error('WebGL2 context creation failed'));
    });
    await page.waitForSelector('.ln-fatal-card', { timeout: 5000 });
    await wait(150);
    await snap('webgl-fallback');
    await page.evaluate(() => document.querySelector('.ln-fatal')?.remove());
    await wait(100);
  }

  // 26-32. Tour notes (all 7 steps, deterministic .still mode so seals/letters/buttons are fully settled)
  const tourSteps = ['tour-welcome', 'tour-letters', 'tour-smooth', 'tour-record', 'tour-player', 'tour-keys', 'tour-bye'];
  if (wantAny(tourSteps)) {
    await page.evaluate(async () => {
      const d = window.__siennaDebug;
      await d.music.signOut();
    });
    await wait(350);
    await page.evaluate(() => {
      document.querySelector('.tr')?.classList.add('still');
      window.__siennaDebug.tour.restart();
    });
    await page.waitForFunction(() => window.__siennaDebug.tour.step === 'welcome', null, { timeout: 5000 });
    await wait(300);

    const pressTour = async (label) => {
      await domClick(page, '.tr-stage:not(.tr-ghost) :is(.tr-action, .st-w)', label);
      await wait(220);
      await page.evaluate(() => document.querySelectorAll('.tr-ghost').forEach((g) => g.remove()));
    };
    const snapTour = async (name) => {
      await page.evaluate(() => document.querySelectorAll('.tr-ghost').forEach((g) => g.remove()));
      await snap(name);
    };

    if (want.has('tour-welcome')) await snapTour('tour-welcome');

    await pressTour('Look around first');
    await page.waitForFunction(() => window.__siennaDebug.tour.step === 'letters', null, { timeout: 5000 });
    await wait(200);
    if (want.has('tour-letters')) await snapTour('tour-letters');

    await pressTour('Next');
    await page.waitForFunction(() => window.__siennaDebug.tour.step === 'smooth', null, { timeout: 5000 });
    await wait(200);
    if (want.has('tour-smooth')) await snapTour('tour-smooth');

    await pressTour('Next');
    await page.waitForFunction(() => window.__siennaDebug.tour.step === 'record', null, { timeout: 5000 });
    await wait(200);
    if (want.has('tour-record')) await snapTour('tour-record');

    // Advance record -> player by playing a different song
    await page.evaluate(async () => {
      const d = window.__siennaDebug;
      const it = d.shelves[0]?.items?.[4] ?? d.shelves[0]?.items?.[1];
      await d.music.play(it);
    });
    await page.waitForFunction(() => window.__siennaDebug.tour.step === 'player', null, { timeout: 10000 });
    await wait(250);
    if (want.has('tour-player')) await snapTour('tour-player');

    await pressTour('Got it');
    await page.waitForFunction(() => window.__siennaDebug.tour.step === 'keys', null, { timeout: 5000 });
    await wait(200);
    // Tick search once so the check mark is also visible
    await page.keyboard.press('Control+Alt+KeyJ');
    await wait(300);
    await page.keyboard.press('Escape');
    await wait(300);
    if (want.has('tour-keys')) await snapTour('tour-keys');

    await pressTour('Next');
    await page.waitForFunction(() => window.__siennaDebug.tour.step === 'bye', null, { timeout: 5000 });
    await wait(200);
    if (want.has('tour-bye')) await snapTour('tour-bye');

    await page.keyboard.press('Escape');
    await wait(250);
    await page.evaluate(async () => {
      document.querySelector('.tr')?.classList.remove('still');
      await window.__siennaDebug.music.signIn();
    });
    await wait(300);
  }
}

async function captureStatic3D(browser, baseUrl, vw, vh, surfaceName, query) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${surfaceName} pageerror]`, e.message));
  await page.goto(`${baseUrl}/index.html?shot&hour=14&tour=0${WC_Q}&${query}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__seek(10));
  for (const fontKey of FONTS) {
    await setFontLive(page, fontKey);
    await page.evaluate(() => window.__seek(10));
    await wait(200);
    const dir = join(out, 'shots', `${vw}x${vh}`, fontKey);
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${surfaceName}.png`), timeout: 120000 });
  }
  await ctx.close();
}

async function captureMini(browser, baseUrl, vw, vh) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[mini pageerror]', e.message));
  await page.goto(`${baseUrl}/mini.html?shot&hour=14&p=0.3${WC_Q}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__seek(1.5));
  const stage = page.locator('#stage');
  for (const fontKey of FONTS) {
    await setFontLive(page, fontKey);
    await wait(250);
    const dir = join(out, 'shots', `${vw}x${vh}`, fontKey);
    mkdirSync(dir, { recursive: true });
    await stage.screenshot({ path: join(dir, 'mini-tag.png'), timeout: 60000 });
  }
  await ctx.close();
}

async function captureLabSurfaces(browser, baseUrl, vw, vh) {
  const sizeKey = `${vw}x${vh}`;
  const wantSections = LAB_SECTION_SURFACES.filter((s) => want.has(s));
  const wantSheet = want.has('lab-sheet');

  if (wantSections.length || wantSheet) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`[ui-lab ${sizeKey} pageerror]`, e.message));
    await page.goto(`${baseUrl}/ui-lab.html`, { timeout: 60000 });
    await page.waitForFunction(() => window.__uiLab?.ready === true, null, { timeout: 30000 });
    await wait(200);

    for (const fontKey of FONTS) {
      const dir = join(out, 'shots', sizeKey, fontKey);
      mkdirSync(dir, { recursive: true });
      await setFontLive(page, fontKey);

      for (const surface of wantSections) {
        const loc = page.locator(`#${surface}`);
        await loc.scrollIntoViewIfNeeded();
        await raf(page, 2);
        await loc.screenshot({ path: join(dir, `${surface}.png`), timeout: 60000 });
        process.stdout.write(`  ${surface}\n`);
      }

      if (wantSheet) {
        await page.evaluate(() => window.__uiLab.components.sheet.open());
        await wait(650);
        await raf(page, 2);
        await page.screenshot({ path: join(dir, 'lab-sheet.png'), timeout: 60000 });
        process.stdout.write('  lab-sheet\n');
        await page.evaluate(() => window.__uiLab.components.sheet.close());
        await wait(340);
      }
      console.log(`done  lab surfaces ${sizeKey} ${fontKey}`);
    }
    await ctx.close();
  }

  if (want.has('lab-compare')) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`[ui-lab compare ${sizeKey} pageerror]`, e.message));
    await page.goto(`${baseUrl}/ui-lab.html?compare`, { timeout: 60000 });
    await page.waitForFunction(() => window.__uiLab?.ready === true, null, { timeout: 30000 });
    await raf(page, 3);
    await wait(200);
    const firstDir = join(out, 'shots', sizeKey, FONTS[0]);
    mkdirSync(firstDir, { recursive: true });
    const firstPath = join(firstDir, 'lab-compare.png');
    await page.screenshot({ path: firstPath, fullPage: true, timeout: 60000 });
    const bytes = readFileSync(firstPath);
    for (const fontKey of FONTS.slice(1)) {
      const dir = join(out, 'shots', sizeKey, fontKey);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'lab-compare.png'), bytes);
    }
    await ctx.close();
    console.log(`done  lab-compare ${sizeKey}`);
  }
}

// Serve out_dir over a temporary local HTTP server to render crisp PNG contact sheets via Playwright.
async function startStaticServer(rootDir) {
  const mime = { '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
  const srv = createHttpServer((req, res) => {
    const p = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = join(rootDir, p.replace(/^\/+/, ''));
    if (!file.startsWith(rootDir) || !existsSync(file)) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  return { srv, url: `http://127.0.0.1:${srv.address().port}` };
}

async function buildContactSheets(browser) {
  const { srv, url } = await startStaticServer(out);
  const cols = 4;
  const tileW = 360;
  const pad = 16;
  const pageW = cols * tileW + (cols + 1) * pad;
  const sheetPage = await browser.newPage({ viewport: { width: pageW, height: 900 } });

  const sheets = [];
  for (const [vw, vh] of SIZES) {
    const sizeKey = `${vw}x${vh}`;
    for (const fontKey of FONTS) {
      const tiles = SURFACES.map((surface) => {
        const rel = `shots/${sizeKey}/${fontKey}/${surface}.png`;
        return `<figure class="tile"><figcaption>${surface}</figcaption><img src="${url}/${rel}" alt="${surface}"></figure>`;
      }).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: ${pad}px; background: #1e1916; color: #f6eedc; font: 600 13px/1.3 -apple-system, BlinkMacSystemFont, sans-serif; }
        h1 { margin: 0 0 12px; font-size: 18px; letter-spacing: .02em; color: #fbf5e8; }
        .grid { display: grid; grid-template-columns: repeat(${cols}, ${tileW}px); gap: ${pad}px; align-items: start; }
        .tile { margin: 0; background: #2c2520; border: 1px solid #463a31; border-radius: 4px; overflow: hidden; }
        .tile figcaption { padding: 6px 8px; background: #26201c; border-bottom: 1px solid #3c322a; font-family: ui-monospace, monospace; font-size: 12px; color: #f3e7cf; }
        .tile img { display: block; width: 100%; height: auto; background: #15110f; }
      </style></head><body>
        <h1>Sienna UI Matrix — ${FONT_META[fontKey].label} (${fontKey}) · ${sizeKey} · ${SURFACES.length} surfaces</h1>
        <div class="grid">${tiles}</div>
      </body></html>`;
      await sheetPage.setContent(html, { waitUntil: 'networkidle' });
      const sheetName = `sheet-${sizeKey}-${fontKey}.png`;
      await sheetPage.screenshot({ path: join(out, sheetName), fullPage: true, timeout: 120000 });
      sheets.push({ sizeKey, fontKey, sheetName });
      console.log(`sheet ${sheetName}`);
    }
  }
  await sheetPage.close();
  srv.close();

  // Build index.html linking all contact sheets and individual shots
  const indexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sienna UI Matrix</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #1b1613; color: #f4ead6; font: 14px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
  h1, h2 { margin: 0 0 12px; }
  h2 { margin-top: 28px; border-bottom: 1px solid #3d332c; padding-bottom: 6px; }
  a { color: #e2a272; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .sheets { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  .sheet-card { background: #26201c; border: 1px solid #3d332c; border-radius: 6px; overflow: hidden; }
  .sheet-card header { padding: 8px 12px; font-weight: 600; background: #2f2722; }
  .sheet-card img { display: block; width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; }
  th, td { border: 1px solid #3d332c; padding: 6px 10px; text-align: left; font-size: 13px; }
  th { background: #2a231e; }
  td code { font-family: ui-monospace, monospace; color: #fbf5e8; }
</style>
</head>
<body>
<h1>Sienna UI Matrix</h1>
<p>Surfaces: ${SURFACES.length} · Letterings: ${FONTS.join(', ')} · Sizes: ${SIZES.map(([w, h]) => `${w}x${h}`).join(', ')}</p>

<h2>Contact Sheets</h2>
<div class="sheets">
${sheets.map(({ sizeKey, fontKey, sheetName }) => `  <div class="sheet-card">
    <header><a href="${sheetName}">${FONT_META[fontKey].label} · ${sizeKey}</a></header>
    <a href="${sheetName}"><img src="${sheetName}" alt="${sheetName}"></a>
  </div>`).join('\n')}
</div>

<h2>All Individual Shots</h2>
<table>
  <thead>
    <tr>
      <th>Surface</th>
      ${SIZES.flatMap(([vw, vh]) => FONTS.map((f) => `<th>${vw}×${vh}<br>${FONT_META[f].label}</th>`)).join('')}
    </tr>
  </thead>
  <tbody>
${SURFACES.map((surface) => `    <tr>
      <td><code>${surface}</code></td>
      ${SIZES.flatMap(([vw, vh]) => FONTS.map((f) => `<td><a href="shots/${vw}x${vh}/${f}/${surface}.png">png</a></td>`)).join('')}
    </tr>`).join('\n')}
  </tbody>
</table>
</body>
</html>
`;
  writeFileSync(join(out, 'index.html'), indexHtml);
}

const t0 = Date.now();
const appRoot = process.env.SIENNA_APP_ROOT || new URL('..', import.meta.url).pathname;
const server = await createServer({ root: appRoot, server: { port, host: '127.0.0.1', strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const baseUrl = `http://127.0.0.1:${port}`;
const angleBackend = process.env.SIENNA_ANGLE || (process.platform === 'darwin' ? 'metal' : 'vulkan');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angleBackend}`, '--ignore-gpu-blocklist'] });

try {
  for (const [vw, vh] of SIZES) {
    const sizeKey = `${vw}x${vh}`;
    console.log(`\n=== ${sizeKey} ===`);

    if (wantAny(HOME_SURFACES)) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`[home ${sizeKey} pageerror]`, e.message));
      await page.goto(`${baseUrl}/index.html?shot=1&at=home&tour=0&hour=14&shelves=8&albums=1${WC_Q}`, { timeout: 180000 });
      await waitForShopReady(page);

      for (const fontKey of FONTS) {
        const shotDir = join(out, 'shots', sizeKey, fontKey);
        mkdirSync(shotDir, { recursive: true });
        await setFontLive(page, fontKey);
        await captureHomeSurfaces(page, vw, vh, fontKey, shotDir);
        console.log(`done  home surfaces ${sizeKey} ${fontKey}`);
      }
      await ctx.close();
    }

    if (want.has('shop-3d-tag')) {
      await captureStatic3D(browser, baseUrl, vw, vh, 'shop-3d-tag', 'at=0&hover=2&shelves=8');
      console.log(`done  shop-3d-tag ${sizeKey}`);
    }

    if (want.has('shop-3d-spread')) {
      await captureStatic3D(browser, baseUrl, vw, vh, 'shop-3d-spread', 'at=3&albums=1&open=0&spreadhover=2');
      console.log(`done  shop-3d-spread ${sizeKey}`);
    }

    if (want.has('mini-tag')) {
      await captureMini(browser, baseUrl, vw, vh);
      console.log(`done  mini-tag ${sizeKey}`);
    }

    if (wantAny(LAB_SURFACES)) {
      await captureLabSurfaces(browser, baseUrl, vw, vh);
    }
  }

  await buildContactSheets(browser);
  console.log(`\nui-matrix complete in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}/index.html`);
} finally {
  await browser.close();
  await server.close();
}
