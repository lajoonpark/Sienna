// Checks Sienna's Phase 2 UI kit & lab (ui-lab.html):
//   1. All 11 sections render cleanly at 1280x720 and 1024x640 with zero errors or overflow
//   2. Sheet: labelled role="dialog", aria-modal="true", focus trap (Tab / Shift+Tab),
//      Esc close + opener focus restore, window keydown isolation, overlayOpen/onOverlay
//   3. Segmented: arrow keys + Home/End move selection, aria-selected/aria-checked & onChange follow
//   4. Stamps: aria-pressed toggles, painted tooltip names state & appears on keyboard focus, no title=
//   5. List: keyboard cursor updates aria-activedescendant, Enter picks, 600-row batching (40 until scroll)
//   6. Banners: role="status" (offline/restock) & role="alert" (error), action fires
//   7. Performance: cache hit on same-size remount, sub-step resize paints nothing, lettering switch
//      repaints each plate once, and zero rAF/timer callbacks for 2 s while idle (including open sheet)
//
// Usage: node scripts/ui-lab-check.mjs [out_dir]      (SIENNA_PORT=5247)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-ui-lab');
const port = Number(process.env.SIENNA_PORT) || 5247;
const appRoot = new URL('..', import.meta.url).pathname;
const server = await createServer({
  root: appRoot,
  server: { port, host: '127.0.0.1', strictPort: true, hmr: false },
  logLevel: 'error',
});
await server.listen();

const angleBackend = process.env.SIENNA_ANGLE || (process.platform === 'darwin' ? 'metal' : 'vulkan');
const browser = await chromium.launch({
  args: ['--use-gl=angle', `--use-angle=${angleBackend}`, '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (msg) => console.log('ok  ', msg);

try {
  await page.goto(`http://127.0.0.1:${port}/ui-lab.html`, { timeout: 60000 });
  await page.waitForFunction(() => window.__uiLab?.ready === true, null, { timeout: 30000 });
  await wait(250);

  // ---- 1. Every section renders, no overflow at 1280x720 and 1024x640 ----
  const EXPECTED_SECTIONS = [
    'lab-tokens', 'lab-paper', 'lab-brush', 'lab-ink', 'lab-segmented',
    'lab-stamps', 'lab-icons', 'lab-list', 'lab-sheet', 'lab-banners', 'lab-tag',
  ];
  const secBoxes = await page.evaluate((ids) => ids.map((id) => {
    const el = document.getElementById(id);
    if (!el) return { id, missing: true };
    const r = el.getBoundingClientRect();
    return { id, w: Math.round(r.width), h: Math.round(r.height) };
  }), EXPECTED_SECTIONS);
  for (const s of secBoxes) {
    assert.ok(!s.missing && s.w > 200 && s.h > 60, `section ${s.id} did not render properly: ${JSON.stringify(s)}`);
  }
  for (const [vw, vh] of [[1280, 720], [1024, 640]]) {
    await page.setViewportSize({ width: vw, height: vh });
    await wait(120);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 2, `horizontal overflow at ${vw}x${vh}: ${overflow}px`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await wait(120);
  await page.screenshot({ path: `${out}/lab-top.png` });
  ok(`all ${EXPECTED_SECTIONS.length} sections rendered with zero horizontal overflow at 1280x720 & 1024x640`);

  // ---- 2. Sheet: ARIA dialog, focus trap, Esc restore, key isolation, overlay signal ----
  await page.evaluate(() => {
    window.__overlayLog = [];
    window.__uiLab.onOverlay((open) => window.__overlayLog.push(open));
    window.__uiLab.leaks.length = 0;
    window.__uiLab.components.sheetOpener.scrollIntoView({ block: 'center' });
    window.__uiLab.components.sheetOpener.focus();
  });
  await page.keyboard.press('Enter');
  await wait(350);

  const sheetInfo = await page.evaluate(() => {
    const { sheet, sheetOpener } = window.__uiLab.components;
    const card = sheet.card;
    const labelId = card.getAttribute('aria-labelledby');
    const titleText = labelId ? document.getElementById(labelId)?.textContent : '';
    return {
      isOpen: sheet.isOpen(),
      overlayOpen: window.__uiLab.overlayOpen(),
      role: card.getAttribute('role'),
      modal: card.getAttribute('aria-modal'),
      titleText,
      focusInside: card.contains(document.activeElement),
      openerFocused: document.activeElement === sheetOpener,
    };
  });
  assert.strictEqual(sheetInfo.isOpen, true);
  assert.strictEqual(sheetInfo.overlayOpen, true);
  assert.strictEqual(sheetInfo.role, 'dialog');
  assert.strictEqual(sheetInfo.modal, 'true');
  assert.ok(sheetInfo.titleText.length > 0, 'dialog must be labelled by its title');
  assert.strictEqual(sheetInfo.focusInside, true, 'focus must move inside dialog on open');

  // Cycle Tab and Shift+Tab many times — focus must never leave the dialog
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => window.__uiLab.components.sheet.card.contains(document.activeElement));
    assert.strictEqual(inside, true, `Tab #${i + 1} escaped dialog`);
  }
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Shift+Tab');
    const inside = await page.evaluate(() => window.__uiLab.components.sheet.card.contains(document.activeElement));
    assert.strictEqual(inside, true, `Shift+Tab #${i + 1} escaped dialog`);
  }

  // Keys pressed inside must not reach window keydown listener
  await page.evaluate(() => { window.__uiLab.leaks.length = 0; });
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyK');
  await page.keyboard.press('ArrowLeft');
  const leaked = await page.evaluate(() => window.__uiLab.leaks.slice());
  assert.deepStrictEqual(leaked, [], `keys leaked to window while sheet open: ${leaked.join(', ')}`);

  await page.screenshot({ path: `${out}/sheet-open.png` });

  // Measure idle while sheet (with backdrop-filter veil) is open & still
  await wait(700);
  const sheetIdle = await page.evaluate(async () => {
    let rafs = 0;
    const origRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { rafs++; return origRaf(cb); };
    await new Promise((r) => setTimeout(r, 800));
    window.requestAnimationFrame = origRaf;
    return rafs;
  });
  assert.strictEqual(sheetIdle, 0, `open sheet triggered ${sheetIdle} idle rAFs`);

  // Esc closes sheet and returns focus to opener
  await page.keyboard.press('Escape');
  await wait(350);
  const afterClose = await page.evaluate(() => ({
    isOpen: window.__uiLab.components.sheet.isOpen(),
    overlayOpen: window.__uiLab.overlayOpen(),
    overlayLog: window.__overlayLog,
    openerFocused: document.activeElement === window.__uiLab.components.sheetOpener,
  }));
  assert.strictEqual(afterClose.isOpen, false);
  assert.strictEqual(afterClose.overlayOpen, false);
  assert.deepStrictEqual(afterClose.overlayLog, [true, false]);
  assert.strictEqual(afterClose.openerFocused, true, 'focus must return to opener on close');
  ok('sheet dialog ARIA, focus trap (Tab/Shift+Tab), key isolation, Esc restore, overlay signal & zero-idle-cost veil');

  // ---- 3. Segmented: arrow keys + Home/End move selection, ARIA & onChange follow ----
  const segResult = await page.evaluate(() => {
    const { tabs, radio } = window.__uiLab.components.segmented;
    const log = [];
    const tabEvents = [];
    // focus first tab
    tabs.buttons[0].focus();
    tabs.buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    tabEvents.push({
      val: tabs.getValue(),
      selected: tabs.buttons.map((b) => b.getAttribute('aria-selected')),
      tabIndexes: tabs.buttons.map((b) => b.tabIndex),
      focused: document.activeElement === tabs.buttons[1],
    });
    tabs.buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    tabEvents.push({ val: tabs.getValue(), focused: document.activeElement === tabs.buttons[3] });
    tabs.buttons[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    tabEvents.push({ val: tabs.getValue(), focused: document.activeElement === tabs.buttons[0] });

    // radio group
    radio.buttons[1].focus();
    radio.buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    log.push({
      role: radio.el.getAttribute('role'),
      itemRole: radio.buttons[0].getAttribute('role'),
      val: radio.getValue(),
      checked: radio.buttons.map((b) => b.getAttribute('aria-checked')),
      focused: document.activeElement === radio.buttons[0],
    });
    return {
      tabRole: tabs.el.getAttribute('role'),
      tabItemRole: tabs.buttons[0].getAttribute('role'),
      tabEvents,
      radio: log[0],
      tabStatusText: document.querySelector('#lab-segmented .lab-status-line')?.textContent,
    };
  });
  assert.strictEqual(segResult.tabRole, 'tablist');
  assert.strictEqual(segResult.tabItemRole, 'tab');
  assert.strictEqual(segResult.tabEvents[0].val, 'albums');
  assert.deepStrictEqual(segResult.tabEvents[0].selected, ['false', 'true', 'false', 'false']);
  assert.deepStrictEqual(segResult.tabEvents[0].tabIndexes, [-1, 0, -1, -1]);
  assert.strictEqual(segResult.tabEvents[0].focused, true);
  assert.strictEqual(segResult.tabEvents[1].val, 'artists');
  assert.strictEqual(segResult.tabEvents[2].val, 'songs');
  assert.strictEqual(segResult.radio.role, 'radiogroup');
  assert.strictEqual(segResult.radio.itemRole, 'radio');
  assert.strictEqual(segResult.radio.val, 'full');
  assert.deepStrictEqual(segResult.radio.checked, ['true', 'false', 'false']);
  assert.strictEqual(segResult.radio.focused, true);
  ok('segmented tabs & radio roving tabindex, Arrow/Home/End, ARIA state & onChange');

  // ---- 4. Stamps: aria-pressed toggles, painted tooltip names state & shows on keyboard focus, no title= ----
  const stampCheck = await page.evaluate(async () => {
    const allStamps = [...document.querySelectorAll('.ui-stamp')];
    const anyNativeTitle = allStamps.some((el) => el.hasAttribute('title'));
    const shuf = window.__uiLab.components.stamps.interactive.shuffle;
    shuf.scrollIntoView({ block: 'center' });
    shuf.focus();
    await new Promise((r) => setTimeout(r, 200));
    const tipWrap = shuf.querySelector('.ui-tip-wrap');
    const tipEl = shuf.tooltipEl;
    const csBefore = getComputedStyle(tipWrap);
    const before = {
      pressed: shuf.getAttribute('aria-pressed'),
      tipText: tipEl.textContent,
      ariaLabel: shuf.getAttribute('aria-label'),
      tipVisible: csBefore.visibility === 'visible' && parseFloat(csBefore.opacity) > 0.9,
    };
    shuf.click();
    await new Promise((r) => setTimeout(r, 50));
    const after = {
      pressed: shuf.getAttribute('aria-pressed'),
      tipText: tipEl.textContent,
      ariaLabel: shuf.getAttribute('aria-label'),
    };
    shuf.blur();
    return { count: allStamps.length, anyNativeTitle, before, after };
  });
  assert.ok(stampCheck.count >= 28, 'expected all icons in off+on rows plus tag stamps');
  assert.strictEqual(stampCheck.anyNativeTitle, false, 'stamps must never use native title=');
  assert.strictEqual(stampCheck.before.pressed, 'false');
  assert.strictEqual(stampCheck.before.tipText, 'Shuffle: off');
  assert.strictEqual(stampCheck.before.tipVisible, true, 'painted tooltip must appear on keyboard focus');
  assert.strictEqual(stampCheck.after.pressed, 'true');
  assert.strictEqual(stampCheck.after.tipText, 'Shuffle: on');
  assert.strictEqual(stampCheck.after.ariaLabel, 'Shuffle: on');
  ok('stamps toggle aria-pressed, name state in painted tooltip on focus, zero native title=');

  // ---- 5. List: keyboard cursor moves aria-activedescendant, Enter picks, 600-row batching ----
  const listCheck = await page.evaluate(() => {
    const list = window.__uiLab.components.list;
    const lb = list.listboxEl;
    lb.scrollIntoView({ block: 'center' });
    lb.focus();
    const initialActive = lb.getAttribute('aria-activedescendant');
    lb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    const afterDown = lb.getAttribute('aria-activedescendant');
    const activeIdx = list.getActive();
    lb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const picked = window.__uiLab.lastPicked?.title;

    // 600-row batch check
    const big = window.__uiLab.components.list600;
    const beforeScrollCount = big.getRenderedCount();
    const totalCount = big.getItems().length;
    big.scrollEl.scrollTop = big.scrollEl.scrollHeight;
    big.scrollEl.dispatchEvent(new Event('scroll'));
    const afterScrollCount = big.getRenderedCount();

    // Error note retry button
    const errBtn = window.__uiLab.components.listNotes.errorList.el.querySelector('button');
    errBtn?.click();

    return {
      role: lb.getAttribute('role'),
      initialActive,
      afterDown,
      activeIdx,
      picked,
      totalCount,
      beforeScrollCount,
      afterScrollCount,
      retryCount: window.__uiLab.listRetryCount,
    };
  });
  assert.strictEqual(listCheck.role, 'listbox');
  assert.notStrictEqual(listCheck.afterDown, listCheck.initialActive, 'ArrowDown must move aria-activedescendant');
  assert.strictEqual(listCheck.activeIdx, 2);
  assert.strictEqual(listCheck.picked, 'Slow Sunday Balcony Tapes');
  assert.strictEqual(listCheck.totalCount, 600);
  assert.strictEqual(listCheck.beforeScrollCount, 40, '600-row list must render 1 batch (40) initially');
  assert.strictEqual(listCheck.afterScrollCount, 80, 'scrolling must append the next 40-row batch');
  assert.strictEqual(listCheck.retryCount, 1, 'error note Retry ink button must fire');
  ok('list aria-activedescendant cursor, Enter pick, 600-row 40/batch rendering, error note Retry');

  // ---- 6. Banners: roles and action ----
  const bannerCheck = await page.evaluate(() => {
    const { offline, error, restock } = window.__uiLab.components.banners;
    const retryBtn = error.el.querySelector('button');
    retryBtn?.click();
    return {
      offlineRole: offline.el.getAttribute('role'),
      restockRole: restock.el.getAttribute('role'),
      errorRole: error.el.getAttribute('role'),
      actionClicks: window.__uiLab.bannerActionCount,
    };
  });
  assert.strictEqual(bannerCheck.offlineRole, 'status');
  assert.strictEqual(bannerCheck.restockRole, 'status');
  assert.strictEqual(bannerCheck.errorRole, 'alert');
  assert.strictEqual(bannerCheck.actionClicks, 1);
  ok('banners carry status/alert roles and action fires');

  // ---- 7. Performance ----
  // 7a. Re-showing a component at the same size paints nothing new
  // 7b. A resize within one rounding step (< 8px) paints nothing
  const cachePerf = await page.evaluate(async () => {
    const a = window.__uiLab.mountTestPaper(240, 120, 777);
    const s1 = window.__uiLab.stats().paper;
    a.destroy();
    const b = window.__uiLab.mountTestPaper(240, 120, 777);
    const s2 = window.__uiLab.stats().paper;
    // Sub-step resize (+3px, +2px < 8px)
    b.resize(243, 122);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const s3 = window.__uiLab.stats().paper;
    b.destroy();

    // Brush plate same-size remount
    const ba = window.__uiLab.mountTestBrush('Cache test', { size: 'md', tone: 'ink', seed: 901 });
    const bs1 = window.__uiLab.stats().brush;
    ba.destroy();
    const bb = window.__uiLab.mountTestBrush('Cache test', { size: 'md', tone: 'ink', seed: 901 });
    const bs2 = window.__uiLab.stats().brush;
    bb.destroy();

    return {
      paperRemountNewPaints: s2.paints - s1.paints,
      paperRemountNewHits: s2.hits - s1.hits,
      paperSubStepPaints: s3.paints - s2.paints,
      brushRemountNewPaints: bs2.paints - bs1.paints,
      brushRemountNewHits: bs2.hits - bs1.hits,
    };
  });
  assert.strictEqual(cachePerf.paperRemountNewPaints, 0, 're-showing paper at same size must paint nothing new');
  assert.ok(cachePerf.paperRemountNewHits >= 1, 're-showing paper at same size must hit cache');
  assert.strictEqual(cachePerf.paperSubStepPaints, 0, 'resize within one 8px step must paint nothing');
  assert.strictEqual(cachePerf.brushRemountNewPaints, 0, 're-showing brush plate at same size must paint nothing new');
  assert.ok(cachePerf.brushRemountNewHits >= 2, 're-showing brush plate must hit cold & hot plate cache');
  ok('paper & brush cache hits on remount + zero paints on sub-step resize');

  // 7c. A lettering switch repaints each visible brush plate exactly once
  const letterPerf = await page.evaluate(async () => {
    const visibleBrushCount = [...document.querySelectorAll('.ui-brush')].filter((b) => b.offsetWidth > 0 && b.offsetHeight > 0).length;
    const before = window.__uiLab.stats().brush.repaints;
    const { settings } = await import('/src/settings.js');
    settings.set('font', 'kaushan');
    await new Promise((resolve) => {
      const check = () => {
        if (getComputedStyle(document.documentElement).getPropertyValue('--sienna-font').includes('Kaushan')) resolve();
        else setTimeout(check, 20);
      };
      check();
    });
    await document.fonts?.ready;
    await new Promise((r) => setTimeout(r, 150));
    const after = window.__uiLab.stats().brush.repaints;
    // Switch back to amatic for clean state
    settings.set('font', 'amatic');
    await new Promise((resolve) => {
      const check = () => {
        if (getComputedStyle(document.documentElement).getPropertyValue('--sienna-font').includes('Amatic')) resolve();
        else setTimeout(check, 20);
      };
      check();
    });
    await new Promise((r) => setTimeout(r, 150));
    return { visibleBrushCount, repaintsDelta: after - before };
  });
  assert.strictEqual(
    letterPerf.repaintsDelta,
    letterPerf.visibleBrushCount,
    `lettering switch repainted ${letterPerf.repaintsDelta} times for ${letterPerf.visibleBrushCount} visible plates`,
  );
  ok(`lettering switch repainted each visible plate exactly once (${letterPerf.repaintsDelta}/${letterPerf.visibleBrushCount})`);

  // 7d. Idle check: with pointer still, zero rAF or timer callbacks run for 2 s after settling
  await wait(400);
  const idleCheck = await page.evaluate(async () => {
    let rafs = 0;
    let timeouts = 0;
    let intervals = 0;
    const origRaf = window.requestAnimationFrame;
    const origSetTimeout = window.setTimeout;
    const origSetInterval = window.setInterval;
    window.requestAnimationFrame = (cb) => { rafs++; return origRaf(cb); };
    window.setTimeout = (cb, ms, ...args) => { timeouts++; return origSetTimeout(cb, ms, ...args); };
    window.setInterval = (cb, ms, ...args) => { intervals++; return origSetInterval(cb, ms, ...args); };
    await new Promise((r) => origSetTimeout(r, 2000));
    window.requestAnimationFrame = origRaf;
    window.setTimeout = origSetTimeout;
    window.setInterval = origSetInterval;
    return { rafs, timeouts, intervals };
  });
  assert.strictEqual(idleCheck.rafs, 0, `idle page scheduled ${idleCheck.rafs} rAFs in 2s`);
  assert.strictEqual(idleCheck.timeouts, 0, `idle page scheduled ${idleCheck.timeouts} setTimeouts in 2s`);
  assert.strictEqual(idleCheck.intervals, 0, `idle page scheduled ${idleCheck.intervals} setIntervals in 2s`);
  ok('zero rAF and timer callbacks for 2 s while idle');

  // Quick check of ?compare and ?sheet=1 URL flags
  await page.goto(`http://127.0.0.1:${port}/ui-lab.html?compare`, { timeout: 60000 });
  await page.waitForFunction(() => window.__uiLab?.ready === true, null, { timeout: 30000 });
  await wait(200);
  const compareCols = await page.evaluate(() => document.querySelectorAll('.lab-compare-col').length);
  assert.strictEqual(compareCols, 4, '?compare must render 4 lettering columns');
  await page.screenshot({ path: `${out}/compare.png`, fullPage: true });
  ok('?compare renders 4 lettering columns cleanly');

  await page.goto(`http://127.0.0.1:${port}/ui-lab.html?sheet=1`, { timeout: 60000 });
  await page.waitForFunction(() => window.__uiLab?.ready === true, null, { timeout: 30000 });
  await wait(450);
  const autoOpen = await page.evaluate(() => window.__uiLab.components.sheet.isOpen());
  assert.strictEqual(autoOpen, true, '?sheet=1 must open the sheet automatically');
  ok('?sheet=1 auto-opens sheet');

  assert.deepStrictEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`);
  assert.deepStrictEqual(consoleErrors, [], `console errors: ${consoleErrors.join('; ')}`);
  console.log('\nall ui-lab checks passed ->', out);
} finally {
  await browser.close();
  await server.close();
}
