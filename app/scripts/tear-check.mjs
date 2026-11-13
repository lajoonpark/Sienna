// Checks the torn paper edge (torn() in src/settings-panel.js) can never reach the words: no tear goes
// deeper than its cap over many seeds, and on every tour note and the Settings card the text sits further
// in from each edge than that cap. Screenshots of each note go to out_dir.
// Usage: node scripts/tear-check.mjs [out_dir]      (SIENNA_PORT=5243)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert';
import { outDir } from './safe.mjs';

const out = outDir(process.argv[2], 'sienna-tear');
const port = Number(process.env.SIENNA_PORT) || 5243;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MARGIN = 3; // px of clear paper wanted between the deepest tear and the text

async function open(query) {
  await page.goto(`http://127.0.0.1:${port}/?${query}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__siennaDebug?.state.introDone, null, { timeout: 120000 });
  await wait(1200);
}

// the text's inset from each side of its card, in the card's own (unrotated) frame
const insets = (card, kids) => page.evaluate(([cardSel, kidSel]) => {
  const card = document.querySelector(cardSel);
  const els = [...card.querySelectorAll(kidSel)].filter((e) => e.offsetHeight > 0 && e.textContent.trim());
  const W = card.offsetWidth, H = card.offsetHeight;
  const pos = (e) => { let x = 0, y = 0; for (let n = e; n && n !== card; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return [x, y]; };
  let l = Infinity, t = Infinity, r = Infinity, b = Infinity;
  for (const e of els) {
    const [x, y] = pos(e);
    l = Math.min(l, x); t = Math.min(t, y); r = Math.min(r, W - x - e.offsetWidth); b = Math.min(b, H - y - e.offsetHeight);
  }
  return { l, t, r, b, n: els.length };
}, [card, kids]);

// 1. the numbers: no seed tears deeper than its cap
await open('at=home&tour=0');
const worst = await page.evaluate(async () => {
  const { tornDepths } = await import('/src/settings-panel.js');
  let deepest = 0, over = 0;
  for (let s = 0; s < 2000; s++) for (const [amp, cap] of [[5, 10], [6, 12]]) {
    const d = tornDepths(s, amp, cap);
    for (const e of ['top', 'right', 'bottom', 'left']) for (const [, v] of d[e]) { deepest = Math.max(deepest, v / cap); if (v > cap) over++; }
    for (const c of d.chips) if (c > cap) over++;
  }
  return { deepest, over };
});
assert.strictEqual(worst.over, 0, 'a tear went past its cap');
console.log(`ok   2000 seeds stay within the cap (deepest ${(worst.deepest * 100).toFixed(0)}% of it)`);

// 2. every tour note keeps its words clear of the tear (cap 12 there)
for (const step of ['welcome', 'letters', 'smooth', 'record', 'player', 'keys', 'bye']) {
  await open(`at=home&tour=${step}`);
  const i = await insets('.tr-stage:not(.tr-ghost) .tr-note', '.tr-title, .tr-body, .tr-fine, .tr-msg');
  assert.ok(i.n > 0, `${step}: no text found`);
  for (const k of ['l', 't', 'r', 'b']) assert.ok(i[k] >= 12 + MARGIN, `${step}: text only ${i[k]}px from the ${k} edge`);
  await page.screenshot({ path: `${out}/${step}.png` });
  console.log(`ok   ${step} text clear of the tear (l${i.l} t${i.t} r${i.r} b${i.b})`);
}

// 3. the Settings card (cap 10), wide and narrow
for (const [w, h] of [[1280, 720], [700, 600]]) {
  await page.setViewportSize({ width: w, height: h });
  await open('at=home&tour=0&settings');
  const i = await insets('.st-card', '.st-head, .st-side, .st-body, .st-foot');
  for (const k of ['l', 't', 'r', 'b']) assert.ok(i[k] >= 10 + MARGIN, `settings ${w}px: text only ${i[k]}px from the ${k} edge`);
  await page.screenshot({ path: `${out}/settings-${w}.png` });
  console.log(`ok   settings ${w}px text clear of the tear (l${i.l} t${i.t} r${i.r} b${i.b})`);
}

assert.deepStrictEqual(errors, []);
console.log('all good, shots in', out);
await browser.close();
await server.close();
