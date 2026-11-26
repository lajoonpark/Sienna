// Dev-only specimen lab for Sienna's Phase 2 UI kit (`app/src/ui/`).
// Open with: npm run web, then /ui-lab.html
// Flags:
//   ?font=amatic|kaushan|sriracha|caveat   pin one lettering
//   ?sheet=1                               open the Settings-like sheet on load
//   ?compare                               4-column lettering comparison view
import './fonts.js';
import { rng } from './rand.js';
import { createMusic } from './music.js';
import { createCaption } from './controls.js';
import { settings } from './settings.js';
import { FONTS, LETTERING, fontReady, onLettering } from './style.js';
import {
  COLORS, TYPE, SPACE, TILT, ELEVATION, MOTION, Z, CONTRAST_PAIRS, injectTokens,
} from './ui/tokens.js';
import { paperSurface, paperStats } from './ui/paper.js';
import { brushButton, brushStats } from './ui/brush.js';
import { inkButton, segmented, stamp, inputsStats } from './ui/inputs.js';
import { icon, ICON_NAMES } from './ui/icons.js';
import { createSheet, overlayOpen, onOverlay } from './ui/sheet.js';
import { createList, listStats } from './ui/list.js';
import { createBanner } from './ui/banner.js';
import { createScrollCue } from './ui/scroll-cue.js';
import { smoothWheel } from './ui/smooth-scroll.js';

injectTokens();
smoothWheel(document.scrollingElement);

const params = new URLSearchParams(location.search);
const isCompare = params.has('compare');
const autoOpenSheet = params.get('sheet') === '1' || params.has('sheet') && params.get('sheet') !== '0';

// ---- Painted Tuscan wall backdrop (painted once on load, zero per-frame work) ----
function paintBackdrop() {
  const c = document.getElementById('lab-backdrop');
  if (!c) return;
  const W = 1280, H = 720;
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const r = rng(4);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#c89b6e');
  grad.addColorStop(0.55, '#b67d54');
  grad.addColorStop(1, '#784e38');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 240; i++) {
    g.fillStyle = `hsla(${14 + r() * 28} ${36 + r() * 28}% ${32 + r() * 34}% / ${0.12 + r() * 0.18})`;
    const w = 70 + r() * 230, h = 34 + r() * 96;
    g.beginPath();
    g.ellipse(r() * W, r() * H, w, h, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Soft arched shop doorways along the lower third so paper and veil read over real depth
  for (let i = 0; i < 6; i++) {
    const x = 70 + i * 215 + r() * 36;
    const y = 330 + r() * 80;
    const w = 96 + r() * 42;
    g.fillStyle = `rgba(48, 33, 34, ${0.32 + r() * 0.24})`;
    g.beginPath();
    g.arc(x + w / 2, y, w / 2, Math.PI, 0);
    g.lineTo(x + w, H);
    g.lineTo(x, H);
    g.closePath();
    g.fill();
  }
}
paintBackdrop();

// ---- Contrast ratio helper (for swatch labels in the Tokens section) ----
function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLum([r, g, b]) {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratioText(fg, bg) {
  const l1 = relLum(parseHex(fg)), l2 = relLum(parseHex(bg));
  return `${((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)}:1`;
}

// ---- Lab layout stylesheet (layout only; all values from tokens) ----
const LAB_CSS = `
#lab-backdrop { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; pointer-events: none; }
#lab-root { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto;
  padding: var(--sienna-space-6) var(--sienna-space-6) var(--sienna-space-10);
  box-sizing: border-box; font-family: var(--sienna-serif); color: var(--sienna-ink); }
.lab-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: var(--sienna-space-4); padding: var(--sienna-space-5) var(--sienna-space-6);
  margin-bottom: var(--sienna-space-6); }
.lab-header-title { margin: 0; font-family: var(--sienna-font); font-size: var(--sienna-text-2xl);
  line-height: 1; color: var(--sienna-indigo); }
.lab-header-sub { margin: var(--sienna-space-1) 0 0; font-family: var(--sienna-serif);
  font-size: var(--sienna-text-sm); color: var(--sienna-ink-2); }
.lab-header-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sienna-space-3); }
.lab-nav { display: flex; flex-wrap: wrap; gap: var(--sienna-space-2); margin-top: var(--sienna-space-3); width: 100%; }
.lab-nav a { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-weight: 600;
  color: var(--sienna-indigo); text-decoration: none; padding: 2px var(--sienna-space-2);
  background: var(--sienna-paper-lo); border-radius: 3px; }
.lab-nav a:hover { color: var(--sienna-terracotta); }
.lab-nav a:focus-visible { outline: none; box-shadow: var(--sienna-focus-ring); }

.lab-sec { margin-bottom: var(--sienna-space-6); padding: var(--sienna-space-5) var(--sienna-space-6);
  scroll-margin-top: var(--sienna-space-4); }
.lab-sec-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: var(--sienna-space-2); margin-bottom: var(--sienna-space-4);
  padding-bottom: var(--sienna-space-2); border-bottom: 1px solid var(--sienna-hairline); }
.lab-sec-title { margin: 0; font-family: var(--sienna-font); font-size: var(--sienna-text-xl);
  line-height: 1.05; color: var(--sienna-indigo); }
.lab-sec-cap { margin: 0; font-family: var(--sienna-serif); font-size: var(--sienna-text-sm);
  color: var(--sienna-ink-2); }
.lab-subhead { margin: var(--sienna-space-4) 0 var(--sienna-space-2); font-family: var(--sienna-serif);
  font-size: var(--sienna-text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
  color: var(--sienna-ink-3); }
.lab-subhead:first-child { margin-top: 0; }
.lab-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sienna-space-4); }
.lab-row--tight { gap: var(--sienna-space-3); }
.lab-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sienna-space-5); }
@media (max-width: 860px) { .lab-grid-2 { grid-template-columns: 1fr; } }

/* State matrix cells */
.lab-states { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--sienna-space-5);
  padding: var(--sienna-space-3) 0 var(--sienna-space-2); }
.lab-state-cell { display: flex; flex-direction: column; align-items: center; gap: var(--sienna-space-2); }
.lab-state-lbl { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); color: var(--sienna-ink-3); }

/* Tokens section */
.lab-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: var(--sienna-space-3); }
.lab-swatch { border: 1px solid var(--sienna-hairline); border-radius: 4px; overflow: hidden;
  background: var(--sienna-paper); }
.lab-swatch-chip { height: 46px; display: flex; align-items: flex-end; justify-content: flex-end;
  padding: var(--sienna-space-1) var(--sienna-space-2); font-family: var(--sienna-serif);
  font-size: var(--sienna-text-xs); font-weight: 600; }
.lab-swatch-meta { padding: var(--sienna-space-2); font-family: var(--sienna-serif);
  font-size: var(--sienna-text-xs); line-height: 1.35; }
.lab-swatch-name { font-weight: 600; color: var(--sienna-ink); }
.lab-swatch-val { color: var(--sienna-ink-3); font-variant-numeric: lining-nums tabular-nums; }

.lab-type-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sienna-space-4); }
@media (max-width: 780px) { .lab-type-grid { grid-template-columns: 1fr; } }
.lab-type-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sienna-space-3);
  padding: var(--sienna-space-1) 0; border-bottom: 1px dashed var(--sienna-hairline); }
.lab-type-meta { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs);
  color: var(--sienna-ink-3); font-variant-numeric: lining-nums tabular-nums; white-space: nowrap; }
.lab-tabular { font-family: var(--sienna-serif); font-variant-numeric: lining-nums tabular-nums;
  font-size: var(--sienna-text-sm); color: var(--sienna-ink-2); }

.lab-space-list { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--sienna-space-3); }
.lab-space-item { display: flex; flex-direction: column; align-items: center; gap: var(--sienna-space-1); }
.lab-space-bar { background: var(--sienna-indigo); height: 14px; border-radius: 2px; }

.lab-tilt-card { padding: var(--sienna-space-2) var(--sienna-space-4); background: var(--sienna-paper-lo);
  border: 1px solid var(--sienna-hairline); font-family: var(--sienna-serif);
  font-size: var(--sienna-text-sm); color: var(--sienna-ink); box-shadow: var(--sienna-shadow-rest); }

.lab-elev-box { padding: var(--sienna-space-3) var(--sienna-space-5); background: var(--sienna-paper);
  font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); color: var(--sienna-ink); }

.lab-motion-track { position: relative; flex: 1; min-width: 200px; height: 28px; background: var(--sienna-paper-lo);
  border-radius: 4px; overflow: hidden; }
.lab-motion-puck { position: absolute; left: 4px; top: 4px; width: 20px; height: 20px; border-radius: 50%;
  background: var(--sienna-terracotta); transition: transform var(--m-dur, var(--sienna-dur-mid)) var(--m-ease, var(--sienna-ease-out)); }
.lab-motion-puck.go { transform: translateX(180px); }

/* Card section (sits directly on the painted backdrop so the cards' edges and shadows read cleanly) */
.lab-stage { padding: var(--sienna-space-4) 0; }
.lab-paper-grid { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--sienna-space-5); }
.lab-paper-sample { padding: var(--sienna-space-5) var(--sienna-space-6); box-sizing: border-box; }
.lab-paper-sample h3 { margin: 0 0 var(--sienna-space-1); font-family: var(--sienna-font);
  font-size: var(--sienna-text-lg); color: var(--sienna-indigo); }
.lab-tab-card { margin-top: 44px; padding: var(--sienna-space-3) var(--sienna-space-4); }
.lab-paper-sample p { margin: 0; font-family: var(--sienna-serif); font-size: var(--sienna-text-sm);
  color: var(--sienna-ink-2); }

/* Icons grid */
.lab-icons-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(126px, 1fr)); gap: var(--sienna-space-3); }
.lab-icon-card { display: flex; flex-direction: column; align-items: center; gap: var(--sienna-space-2);
  padding: var(--sienna-space-3) var(--sienna-space-2); background: var(--sienna-paper-lo); border-radius: 4px; }
.lab-icon-sizes { display: flex; align-items: center; gap: var(--sienna-space-3); color: var(--sienna-indigo); }
.lab-icon-name { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); font-weight: 600; color: var(--sienna-ink-2); }

/* Stamps stage needs top breathing room for static visible tooltips */
.lab-stamps-states { padding-top: var(--sienna-space-8); }

/* List section */
.lab-list-stage { padding: var(--sienna-space-3); background: rgba(46, 34, 26, 0.14); border-radius: 6px; }
.lab-notes-stack { display: flex; flex-direction: column; gap: var(--sienna-space-3); margin-top: var(--sienna-space-3); }
.lab-status-line { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs);
  color: var(--sienna-ink-3); font-variant-numeric: lining-nums tabular-nums; margin-top: var(--sienna-space-2); }

/* Banners showcase */
.lab-banners-stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sienna-space-4); }

.lab-tag-stage { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--sienna-space-6); padding: var(--sienna-space-4) 0; }
.lab-tag-wrap { width: min(calc(var(--sienna-space-10) * 10), 100%); min-width: 0; }
.lab-tag-wrap .cad-tag.shop, .lab-tag-wrap .cad-tag.mini { position: relative; left: auto; bottom: auto; width: 100%; max-width: 100%; transform: none; perspective: none; }
.lab-tag-wrap .cad-tag > .turn, .lab-tag-wrap .cad-tag .cap { width: 100%; }

/* Sheet inner demo (Settings-like page) */
.lab-sheet-row { margin-bottom: var(--sienna-space-4); }
.lab-sheet-label { font-family: var(--sienna-font); font-size: var(--sienna-text-lg); color: var(--sienna-ink); line-height: 1.08; }
.lab-sheet-hint { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); color: var(--sienna-ink-2);
  margin: var(--sienna-space-1) 0 var(--sienna-space-2); }
.lab-sheet-fine { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); color: var(--sienna-ink-3);
  line-height: 1.45; margin-top: var(--sienna-space-4); }
.lab-sheet-confirm { display: none; margin-top: var(--sienna-space-2); padding: var(--sienna-space-3);
  background: var(--sienna-paper-lo); border-left: 3px solid var(--sienna-danger); }
.lab-sheet-confirm.on { display: block; }
.lab-sheet-confirm-msg { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm);
  color: var(--sienna-danger); font-weight: 600; margin-bottom: var(--sienna-space-2); }

/* Compare mode (?compare): 4 columns, one per lettering */
.lab-compare-wrap { max-width: 1240px !important; }
.lab-compare-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sienna-space-3); }
@media (max-width: 1000px) { .lab-compare-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.lab-compare-col { padding: var(--sienna-space-4); display: flex; flex-direction: column; gap: var(--sienna-space-4); }
.lab-compare-col-head { margin: 0; font-family: var(--sienna-serif); font-size: var(--sienna-text-sm);
  font-weight: 600; color: var(--sienna-ink-2); text-transform: uppercase; letter-spacing: .06em;
  border-bottom: 1px solid var(--sienna-hairline); padding-bottom: var(--sienna-space-1); }
.lab-compare-sheet-title { font-family: var(--sienna-font); font-size: var(--sienna-text-xl);
  color: var(--sienna-indigo); line-height: 1.05; }
.lab-compare-col .cad-tag .cap { min-width: 0; padding: var(--sienna-space-3) var(--sienna-space-4); }
.lab-compare-col .cad-tag .meta, .lab-compare-col .cad-tag .tools { flex-wrap: wrap; }
.lab-compare-col .ui-list-row { padding: 0 var(--sienna-space-4) 0 var(--sienna-space-4); gap: var(--sienna-space-2); }
.lab-compare-col .ui-list-cover { width: 38px; height: 38px; }
.lab-compare-col .ui-list-title { font-size: var(--sienna-text-md); }
`;

const labStyle = document.createElement('style');
labStyle.id = 'sienna-ui-lab-css';
labStyle.textContent = LAB_CSS;
document.head.appendChild(labStyle);

const root = document.getElementById('lab-root');
const music = createMusic();

// Track any keystroke that leaks to window (used by ui-lab-check.mjs to verify sheet isolation).
const leaks = [];
window.addEventListener('keydown', (e) => leaks.push(e.key));

const el = (tag, cls = '', text = null) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// Build a fake store sample with covers + every kind stamp + long titles
async function loadFakeSamples() {
  const res = await music.shelves();
  const songs = (res.shelves ?? []).flatMap((s) => s.items ?? []);
  const pick = (i) => songs[i % songs.length] ?? { title: `Track ${i + 1}`, subtitle: 'Mira Sol', duration: 194, kind: 'song' };

  const searchSample = [
    { ...pick(0), id: 'now-0', title: "Don't Leave Yet", subtitle: 'Eric Nam', album: "Don't Leave Yet", duration: 166, kind: 'song', nowPlaying: true },
    { ...pick(1), id: 'sel-1', title: 'Terracotta Hours (Extended Tuscan Vinyl Session Edition)', subtitle: 'The Arches', album: 'Piazza Echoes & Evening Lights', duration: 248, kind: 'song' },
    { ...pick(2), id: 'alb-2', title: 'Slow Sunday Balcony Tapes', subtitle: 'Lio & Bea', duration: 0, meta: '12 songs', kind: 'album' },
    { ...pick(3), id: 'pl-3', title: 'Golden Hour Crate Digging in Florence', subtitle: 'Sienna Editorial', duration: 0, meta: '42 songs', kind: 'playlist' },
    { ...pick(4), id: 'art-4', title: 'Paper Kites Club', subtitle: '48K monthly listeners', duration: 0, kind: 'artist' },
    { ...pick(5), id: 'ep-5', title: 'Ep. 14 — Analog Tape Mastering & Warm Oil Pigments in Modern Record Shops', subtitle: 'Crate Talk Weekly', duration: 1924, kind: 'episode' },
    { ...pick(6), id: 'pod-6', title: 'Liner Notes Podcast', subtitle: 'Casa Verde Audio', duration: 0, meta: '28 eps', kind: 'podcast' },
  ];

  const list600 = Array.from({ length: 600 }, (_, i) => {
    const base = pick(i);
    return {
      ...base,
      id: `big-${i}`,
      track: i + 1,
      title: `${base.title} #${i + 1}`,
      kind: 'song',
    };
  });

  return { searchSample, list600, songs };
}

// Helper: section shell on a card
function makeSection(id, title, caption, { onPaper = true, seed = 11 } = {}) {
  const sec = el('section', 'lab-sec');
  sec.id = id;
  const head = el('div', 'lab-sec-head');
  head.append(el('h2', 'lab-sec-title', title), el('p', 'lab-sec-cap', caption));
  sec.appendChild(head);
  root.appendChild(sec);
  let surface = null;
  if (onPaper) surface = paperSurface(sec, { seed, elevation: 'rest', amp: 4, cap: 8 });
  return { sec, surface };
}

function buildComposedTag({ variant = 'shop' } = {}) {
  const wrap = el('div', 'lab-tag-wrap');
  let state = {
    ready: true, signedIn: false, title: "Don't Leave Yet", artist: 'Eric Nam',
    album: "Don't Leave Yet", position: 56, duration: 166, shuffle: true, repeat: 'OFF',
  };
  const update = () => caption.setState(state, { real: true });
  const caption = createCaption({
    parent: wrap, variant,
    onSeek: (position) => { state = { ...state, position }; update(); },
    onSignIn: () => { state = { ...state, signedIn: true }; update(); },
    onCommand: (command) => {
      if (command === 'mute') state = { ...state, muted: !state.muted };
      if (command === 'shuffle') state = { ...state, shuffle: !state.shuffle };
      if (command === 'repeat') state = { ...state, repeat: { OFF: 'ALL', ALL: 'ONE', ONE: 'OFF' }[state.repeat] };
      update();
    },
    onQueue: () => {}, onLyrics: () => {},
  });
  update();
  caption.show(true, true);
  return { el: wrap, caption, signInBtn: caption.el.querySelector('.ui-brush') };
}

// ---- Compare mode (?compare): 4 columns, one per lettering ----
async function buildCompareView(samples) {
  root.classList.add('lab-compare-wrap');

  // Ensure all 4 letterings are loaded before measuring plates
  await Promise.all(
    Object.values(FONTS).map((f) => document.fonts?.load(`34px ${f.family}`).catch(() => {})),
  );

  const head = el('header', 'lab-header');
  const hLeft = el('div');
  hLeft.append(
    el('h1', 'lab-header-title', 'Lettering comparison'),
    el('p', 'lab-header-sub', 'All four Sienna letterings side by side with Alegreya serif for small text.'),
  );
  const backLink = inkButton('Back to full lab', {
    icon: 'back',
    size: 'sm',
    onClick: () => { location.search = ''; },
  });
  head.append(hLeft, backLink);
  root.appendChild(head);
  paperSurface(head, { seed: 3, elevation: 'rest', amp: 4, cap: 8 });

  const grid = el('div', 'lab-compare-grid');
  grid.id = 'lab-compare';
  root.appendChild(grid);

  const cols = [];
  const entries = Object.entries(FONTS);
  entries.forEach(([key, fontDef], colIdx) => {
    const col = el('div', 'lab-compare-col');
    col.dataset.font = key;
    col.style.setProperty('--sienna-font', `${fontDef.family}, "Segoe Print", cursive`);
    col.appendChild(el('h2', 'lab-compare-col-head', fontDef.label));

    // Sheet title
    col.appendChild(el('div', 'lab-compare-sheet-title', 'Settings — Look'));

    // Brush plates
    const plateRow = el('div', 'lab-row lab-row--tight');
    const p1 = brushButton('Quick picks', { size: 'md', tone: 'ink', seed: 19 + colIdx * 3 });
    const p2 = brushButton('Done', { size: 'sm', tone: 'hot', seed: 29 + colIdx * 3 });
    plateRow.append(p1, p2);
    col.appendChild(plateRow);

    // Ink words
    const inkRow = el('div', 'lab-row lab-row--tight');
    inkRow.append(
      inkButton('Restock', { icon: 'restock', size: 'sm' }),
      inkButton('Settings', { icon: 'settings', size: 'sm', selected: true }),
    );
    col.appendChild(inkRow);

    // Segmented chips
    const seg = segmented(
      [{ value: 'songs', label: 'Songs' }, { value: 'albums', label: 'Albums' }, { value: 'artists', label: 'Artists' }],
      { value: 'songs', role: 'tabs', label: `${fontDef.label} tabs`, seed: 41 + colIdx * 5 },
    );
    col.appendChild(seg.el);

    // Mini list (2 rows)
    const miniList = createList({
      label: `${fontDef.label} sample rows`,
      items: samples.searchSample.slice(0, 2),
      showKind: false,
      showNowBadge: false,
      seed: 210 + colIdx * 7,
    });
    miniList.setActive(1, { scroll: false });
    col.appendChild(miniList.el);

    // Composed tag
    const tag = buildComposedTag();
    col.appendChild(tag.el);

    grid.appendChild(col);
    paperSurface(col, { seed: 13 + colIdx * 11, elevation: 'rest', amp: 4, cap: 8 });
    cols.push({ key, col, plates: [p1, p2, tag.signInBtn], seg, miniList, tag });
  });

  // Repaint after layout settles so each column measures its own --sienna-font cleanly
  await document.fonts?.ready;
  for (const c of cols) {
    for (const p of c.plates) p.repaint(true);
    c.seg.repaint(true);
    c.miniList.repaint(true);
  }

  window.__uiLab = {
    mode: 'compare',
    ready: true,
    leaks,
    stats: () => ({ paper: paperStats(), brush: brushStats(), inputs: inputsStats(), list: listStats() }),
    cols,
  };
}

// ---- Full Lab View ----
async function buildFullLab(samples) {
  const lab = {
    mode: 'full',
    ready: false,
    leaks,
    overlayOpen,
    onOverlay,
    stats: () => ({ paper: paperStats(), brush: brushStats(), inputs: inputsStats(), list: listStats() }),
    components: {},
  };

  // ---- Header & live lettering switcher ----
  const header = el('header', 'lab-header');
  const hLeft = el('div');
  hLeft.append(
    el('h1', 'lab-header-title', 'Sienna UI Kit Lab'),
    el('p', 'lab-header-sub', 'One card, one brush, two voices — every shared component over a painted backdrop.'),
  );
  const hRight = el('div', 'lab-header-controls');
  const currentKey = Object.entries(FONTS).find(([, f]) => f === LETTERING)?.[0] ?? settings.get('font') ?? 'amatic';
  const fontSwitcher = segmented(
    Object.entries(FONTS).map(([k, f]) => ({ value: k, label: f.label, font: f.family })),
    {
      value: currentKey,
      role: 'radio',
      label: 'Lettering switcher',
      seed: 101,
      onChange: (val) => settings.set('font', val),
    },
  );
  onLettering(fontSwitcher.el, () => {
    const active = Object.entries(FONTS).find(([, f]) => f === LETTERING)?.[0];
    if (active) fontSwitcher.setValue(active, { notify: false });
  });
  const compareBtn = inkButton('4-font compare', {
    size: 'sm',
    onClick: () => { location.search = '?compare'; },
  });
  hRight.append(fontSwitcher.el, compareBtn);

  const nav = el('nav', 'lab-nav');
  nav.setAttribute('aria-label', 'Kit sections');
  const SECTIONS = [
    ['lab-tokens', 'Tokens'],
    ['lab-paper', 'Paper'],
    ['lab-brush', 'Brush plates'],
    ['lab-ink', 'Ink words'],
    ['lab-segmented', 'Segmented'],
    ['lab-stamps', 'Stamps'],
    ['lab-icons', 'Icons'],
    ['lab-list', 'List'],
    ['lab-sheet', 'Sheet'],
    ['lab-banners', 'Banners'],
    ['lab-tag', 'Now-playing tag'],
  ];
  for (const [id, lbl] of SECTIONS) {
    const a = el('a', '', lbl);
    a.href = `#${id}`;
    nav.appendChild(a);
  }
  header.append(hLeft, hRight, nav);
  root.appendChild(header);
  paperSurface(header, { seed: 3, elevation: 'rest', amp: 4, cap: 8 });
  lab.components.fontSwitcher = fontSwitcher;

  // ============================================================================
  // 1. TOKENS
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-tokens',
      'Tokens',
      'Shared by every 2D surface and canvas painter (ui/tokens.js).',
      { seed: 11 },
    );

    sec.appendChild(el('div', 'lab-subhead', 'Palette & WCAG contrast ratios'));
    const swatches = el('div', 'lab-swatches');
    const SWATCH_META = [
      ['paper', COLORS.paper, COLORS.ink, 'Primary cream'],
      ['paperLo', COLORS.paperLo, COLORS.ink, 'Recessed cream'],
      ['ink', COLORS.ink, COLORS.paper, `${ratioText(COLORS.ink, COLORS.paper)} on paper`],
      ['ink2', COLORS.ink2, COLORS.paper, `${ratioText(COLORS.ink2, COLORS.paper)} on paper`],
      ['ink3', COLORS.ink3, COLORS.paper, `${ratioText(COLORS.ink3, COLORS.paper)} on paper`],
      ['indigo', COLORS.indigo, COLORS.paper, `${ratioText(COLORS.indigo, COLORS.paper)} w/ paper`],
      ['terracotta', COLORS.terracotta, COLORS.paper, `${ratioText(COLORS.terracotta, COLORS.paper)} w/ paper`],
      ['danger', COLORS.danger, COLORS.paper, `${ratioText(COLORS.danger, COLORS.paper)} w/ paper`],
      ['veil', COLORS.veil, COLORS.paper, 'Overlay backdrop'],
    ];
    for (const [name, bg, fg, note] of SWATCH_META) {
      const card = el('div', 'lab-swatch');
      const chip = el('div', 'lab-swatch-chip');
      chip.style.background = bg;
      chip.style.color = fg;
      chip.textContent = name === 'veil' ? 'rgba' : bg;
      const meta = el('div', 'lab-swatch-meta');
      meta.append(el('div', 'lab-swatch-name', name), el('div', 'lab-swatch-val', note));
      card.append(chip, meta);
      swatches.appendChild(card);
    }
    sec.appendChild(swatches);

    sec.appendChild(el('div', 'lab-subhead', '6-step type scale — display lettering & Alegreya serif'));
    const typeGrid = el('div', 'lab-type-grid');
    const dispCol = el('div');
    const serifCol = el('div');
    for (const [step, px] of Object.entries(TYPE)) {
      const r1 = el('div', 'lab-type-row');
      const s1 = el('span', '', `Tuscan Vinyl Shop (${step})`);
      s1.style.fontFamily = 'var(--sienna-font)';
      s1.style.fontSize = `${px}px`;
      s1.style.lineHeight = '1.08';
      r1.append(s1, el('span', 'lab-type-meta', `${px}px`));
      dispCol.appendChild(r1);

      const r2 = el('div', 'lab-type-row');
      const s2 = el('span', '', `Warm oil-dabbed cream · 0:10 / 2:46`);
      s2.style.fontFamily = 'var(--sienna-serif)';
      s2.style.fontSize = `${px}px`;
      s2.style.lineHeight = '1.25';
      s2.style.fontVariantNumeric = 'lining-nums tabular-nums';
      r2.append(s2, el('span', 'lab-type-meta', `${px}px`));
      serifCol.appendChild(r2);
    }
    typeGrid.append(dispCol, serifCol);
    sec.appendChild(typeGrid);

    const lowerRow = el('div', 'lab-grid-2');
    const leftBlock = el('div');
    leftBlock.appendChild(el('div', 'lab-subhead', '4 px spacing scale'));
    const spList = el('div', 'lab-space-list');
    for (const [k, px] of Object.entries(SPACE)) {
      const item = el('div', 'lab-space-item');
      const bar = el('div', 'lab-space-bar');
      bar.style.width = `${px * 1.6}px`;
      item.append(bar, el('span', 'lab-type-meta', `${k} (${px}px)`));
      spList.appendChild(item);
    }
    leftBlock.appendChild(spList);

    leftBlock.appendChild(el('div', 'lab-subhead', '3 resting tilts & 2 elevations'));
    const teRow = el('div', 'lab-row lab-row--tight');
    for (const [k, deg] of Object.entries(TILT)) {
      const tc = el('div', 'lab-tilt-card', `tilt-${k}: ${deg}°`);
      tc.style.transform = `rotate(${deg}deg)`;
      teRow.appendChild(tc);
    }
    for (const [k, sh] of Object.entries(ELEVATION)) {
      const eb = el('div', 'lab-elev-box', `shadow-${k}`);
      eb.style.boxShadow = sh;
      teRow.appendChild(eb);
    }
    leftBlock.appendChild(teRow);

    const rightBlock = el('div');
    rightBlock.appendChild(el('div', 'lab-subhead', 'Motion demo (3 durations × 3 easings — click to run)'));
    const pucks = [];
    for (const [dKey, dMs] of Object.entries(MOTION.dur)) {
      const eKey = dKey === 'fast' ? 'pop' : dKey === 'mid' ? 'out' : 'in';
      const mRow = el('div', 'lab-row lab-row--tight');
      mRow.style.marginBottom = 'var(--sienna-space-2)';
      mRow.appendChild(el('span', 'lab-type-meta', `${dKey} (${dMs}ms) · ${eKey}`));
      const track = el('div', 'lab-motion-track');
      const puck = el('div', 'lab-motion-puck');
      puck.style.setProperty('--m-dur', `${dMs}ms`);
      puck.style.setProperty('--m-ease', MOTION.ease[eKey]);
      track.appendChild(puck);
      mRow.appendChild(track);
      rightBlock.appendChild(mRow);
      pucks.push(puck);
    }
    const motionBtn = inkButton('Play motion', {
      size: 'sm',
      onClick: () => {
        for (const p of pucks) p.classList.toggle('go');
      },
    });
    rightBlock.appendChild(motionBtn);
    lowerRow.append(leftBlock, rightBlock);
    sec.appendChild(lowerRow);
  }

  // ============================================================================
  // 2. PAPER (shown on a translucent stage over the painted backdrop)
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-paper',
      'Paper',
      'Used by: now-playing tag (shop & mini), Settings, Lyrics, Tour notes, banners, and list notes.',
      { onPaper: true, seed: 19 },
    );
    const stage = el('div', 'lab-list-stage');
    const grid = el('div', 'lab-paper-grid');
    const paperSpecs = [
      { w: 220, h: 110, elevation: 'rest', title: 'Compact tag · rest', desc: 'thin board edge' },
      { w: 260, h: 132, elevation: 'lift', title: 'Tour note · lift', desc: 'lifted shadow' },
      { w: 340, h: 150, elevation: 'lift', title: 'Menu card · lift', desc: 'rag-fibre grain, cut edge' },
    ];
    const paperHandles = [];
    for (const sp of paperSpecs) {
      const box = el('div', 'lab-paper-sample');
      box.style.width = `${sp.w}px`;
      box.style.minHeight = `${sp.h}px`;
      box.append(el('h3', '', sp.title), el('p', '', sp.desc));
      grid.appendChild(box);
      paperHandles.push(paperSurface(box, { elevation: sp.elevation }));
    }
    stage.appendChild(grid);
    sec.appendChild(stage);
    lab.components.paper = paperHandles;
  }

  // ============================================================================
  // 3. BRUSH PLATES
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-brush',
      'Brush plates',
      'Used by: shelf words, Home, Sign in, and each surface’s one primary action.',
      { seed: 29 },
    );

    sec.appendChild(el('div', 'lab-subhead', 'Sizes, tones & flipped right-edge plates'));
    const row1 = el('div', 'lab-row');
    const bSm = brushButton('Play album', { size: 'sm', tone: 'ink', seed: 11 });
    const bMd = brushButton('Quick picks', { size: 'md', tone: 'ink', seed: 17 });
    const bLg = brushButton('Sign in', { size: 'lg', tone: 'ink', seed: 23 });
    const bHot = brushButton('Done', { size: 'md', tone: 'hot', seed: 31 });
    const bFlip = brushButton('Listen again', { size: 'md', tone: 'ink', flipX: true, seed: 37 });
    const bDanger = brushButton('Yes, sign out', { size: 'sm', tone: 'danger', seed: 41 });
    row1.append(bSm, bMd, bLg, bHot, bFlip, bDanger);
    sec.appendChild(row1);

    sec.appendChild(el('div', 'lab-subhead', 'States (static for visual review)'));
    const states = el('div', 'lab-states');
    const stateList = [
      ['Rest', brushButton('Quick picks', { size: 'md', tone: 'ink', seed: 53 })],
      ['Hover', (() => { const b = brushButton('Quick picks', { size: 'md', tone: 'ink', seed: 53 }); b.classList.add('is-hover'); return b; })()],
      ['On / Selected', brushButton('Quick picks', { size: 'md', tone: 'ink', seed: 53, pressed: true })],
      ['Focus', (() => { const b = brushButton('Quick picks', { size: 'md', tone: 'ink', seed: 53 }); b.classList.add('is-focus'); return b; })()],
      ['Disabled', brushButton('Quick picks', { size: 'md', tone: 'ink', seed: 53, disabled: true })],
    ];
    for (const [lbl, btn] of stateList) {
      const cell = el('div', 'lab-state-cell');
      cell.append(btn, el('span', 'lab-state-lbl', lbl));
      states.appendChild(cell);
    }
    sec.appendChild(states);
    const multiline = el('div', 'lab-row');
    const twoLine = brushButton(['Forgotten', 'favourites'], { size: 'lg', seed: 43 });
    const threeLine = brushButton(['Songs for', 'a quiet', 'Sunday'], { size: 'lg', seed: 47 });
    threeLine.setCurrent(true);
    multiline.append(twoLine, threeLine);
    sec.appendChild(multiline);

    lab.components.brush = [bSm, bMd, bLg, bHot, bFlip, bDanger, twoLine, threeLine, ...stateList.map((x) => x[1])];
  }

  // ============================================================================
  // 4. INK WORDS
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-ink',
      'Ink words',
      'Used by: top-right utilities (Restock, Settings), Settings rail, Shuffle, and Retry actions.',
      { seed: 37 },
    );

    sec.appendChild(el('div', 'lab-subhead', 'Variants & with icons'));
    const r1 = el('div', 'lab-row');
    const iRestock = inkButton('Restock', { icon: 'restock', size: 'md', seed: 3 });
    const iSettings = inkButton('Settings', { icon: 'settings', size: 'md', seed: 5 });
    const iShuffle = inkButton('Shuffle', { icon: 'shuffle', size: 'sm', seed: 7 });
    const iDanger = inkButton('Sign out', { danger: true, size: 'md', seed: 9 });
    r1.append(iRestock, iSettings, iShuffle, iDanger);
    sec.appendChild(r1);

    sec.appendChild(el('div', 'lab-subhead', 'States (static)'));
    const states = el('div', 'lab-states');
    const inkStates = [
      ['Rest', inkButton('Playback', { size: 'md', seed: 11 })],
      ['Hover', (() => { const b = inkButton('Playback', { size: 'md', seed: 11 }); b.classList.add('is-hover'); return b; })()],
      ['Selected', inkButton('Playback', { size: 'md', seed: 11, selected: true })],
      ['Focus', (() => { const b = inkButton('Playback', { size: 'md', seed: 11 }); b.classList.add('is-focus'); return b; })()],
      ['Disabled', inkButton('Playback', { size: 'md', seed: 11, disabled: true })],
    ];
    for (const [lbl, btn] of inkStates) {
      const cell = el('div', 'lab-state-cell');
      cell.append(btn, el('span', 'lab-state-lbl', lbl));
      states.appendChild(cell);
    }
    sec.appendChild(states);
    lab.components.ink = [iRestock, iSettings, iShuffle, iDanger, ...inkStates.map((x) => x[1])];
  }

  // ============================================================================
  // 5. SEGMENTED
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-segmented',
      'Segmented',
      'Used by: Search tabs (tablist), Collection field filters, and Settings options (radiogroup).',
      { seed: 47 },
    );

    const grid = el('div', 'lab-grid-2');
    const col1 = el('div');
    col1.appendChild(el('div', 'lab-subhead', 'Search-style tabs (role="tablist")'));
    const tabStatus = el('div', 'lab-status-line', 'Selected tab: songs');
    const searchTabs = segmented(
      [
        { value: 'songs', label: 'Songs' },
        { value: 'albums', label: 'Albums' },
        { value: 'playlists', label: 'Playlists' },
        { value: 'artists', label: 'Artists' },
      ],
      {
        value: 'songs',
        role: 'tabs',
        variant: 'tabs',
        label: 'Search filter',
        onChange: (v) => { tabStatus.textContent = `Selected tab: ${v}`; },
      },
    );
    const tabCard = el('div', 'lab-tab-card');
    tabCard.append(searchTabs.el, tabStatus);
    paperSurface(tabCard, { elevation: 'lift' });
    tabCard.classList.add('crate-card');
    col1.append(tabCard);

    const col2 = el('div');
    col2.appendChild(el('div', 'lab-subhead', 'Settings-style options (role="radiogroup")'));
    const radioStatus = el('div', 'lab-status-line', 'Selected sharpness: balanced');
    const settingsRadio = segmented(
      [
        { value: 'full', label: 'Full' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'light', label: 'Light' },
      ],
      {
        value: 'balanced',
        role: 'radio',
        label: 'Sharpness',
        seed: 41,
        onChange: (v) => { radioStatus.textContent = `Selected sharpness: ${v}`; },
      },
    );
    col2.append(settingsRadio.el, radioStatus);
    grid.append(col1, col2);
    sec.appendChild(grid);

    sec.appendChild(el('div', 'lab-subhead', 'States (static)'));
    const segState = segmented(
      [
        { value: 'rest', label: 'Rest' },
        { value: 'hover', label: 'Hover' },
        { value: 'selected', label: 'Selected' },
        { value: 'focus', label: 'Focus' },
        { value: 'disabled', label: 'Disabled', disabled: true },
      ],
      { value: 'selected', role: 'tabs', label: 'Chip states', seed: 61 },
    );
    segState.buttons[1].classList.add('is-hover');
    segState.buttons[3].classList.add('is-focus');
    sec.appendChild(segState.el);

    lab.components.segmented = { tabs: searchTabs, radio: settingsRadio, states: segState };
  }

  // ============================================================================
  // 6. STAMPS
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-stamps',
      'Stamps',
      'Used by: now-playing caption tools (Mute, Shuffle, Repeat, Queue, Lyrics) and Close buttons.',
      { seed: 53 },
    );

    sec.appendChild(el('div', 'lab-subhead', 'Every icon — off (top row) and terracotta on (bottom row)'));
    const offRow = el('div', 'lab-row lab-row--tight');
    const onRow = el('div', 'lab-row lab-row--tight');
    onRow.style.marginTop = 'var(--sienna-space-2)';
    const interactiveStamps = {};
    for (const name of ICON_NAMES) {
      const nice = name.replace('-', ' ').replace(/^./, (c) => c.toUpperCase());
      const sOff = stamp(name, { label: nice, toggle: true, on: false, size: 'md' });
      const sOn = stamp(name, { label: nice, toggle: true, on: true, size: 'md' });
      offRow.appendChild(sOff);
      onRow.appendChild(sOn);
      if (name === 'shuffle') interactiveStamps.shuffle = sOff;
      if (name === 'mute') interactiveStamps.mute = sOff;
    }
    sec.append(offRow, onRow);

    sec.appendChild(el('div', 'lab-subhead', 'States (static, showing painted tooltips)'));
    const stStates = el('div', 'lab-states lab-stamps-states');
    const sRest = stamp('shuffle', { label: 'Shuffle', toggle: true, on: false });
    const sHover = stamp('shuffle', { label: 'Shuffle', toggle: true, on: false });
    sHover.classList.add('is-hover');
    const sOn = stamp('shuffle', { label: 'Shuffle', toggle: true, on: true });
    const sFocus = stamp('repeat', { label: 'Repeat', toggle: true, on: true });
    sFocus.classList.add('is-focus');
    const sDis = stamp('queue', { label: 'Queue', disabled: true });
    for (const [lbl, btn] of [['Rest', sRest], ['Hover', sHover], ['On', sOn], ['Focus', sFocus], ['Disabled', sDis]]) {
      const cell = el('div', 'lab-state-cell');
      cell.append(btn, el('span', 'lab-state-lbl', lbl));
      stStates.appendChild(cell);
    }
    sec.appendChild(stStates);
    lab.components.stamps = { interactive: interactiveStamps, states: { sRest, sHover, sOn, sFocus, sDis } };
  }

  // ============================================================================
  // 7. ICONS
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-icons',
      'Icons',
      'Used by: stamps, Search bar, top-right utilities, and Collection header, and list-row kind marks (19 hand-drawn SVGs).',
      { seed: 59 },
    );
    const grid = el('div', 'lab-icons-grid');
    for (const name of ICON_NAMES) {
      const card = el('div', 'lab-icon-card');
      const sizes = el('div', 'lab-icon-sizes');
      sizes.append(icon(name, { size: 16 }), icon(name, { size: 20 }), icon(name, { size: 28 }));
      card.append(sizes, el('span', 'lab-icon-name', name));
      grid.appendChild(card);
    }
    sec.appendChild(grid);
    lab.components.icons = ICON_NAMES;
  }

  // ============================================================================
  // 8. LIST
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-list',
      'List',
      'Used by: Search results, Collection list (40-row progressive batching), and Up Next Queue.',
      { seed: 67 },
    );

    const grid = el('div', 'lab-grid-2');

    // Left: search-style list with covers, now-playing pinned, selected terracotta band, long titles, every kind stamp
    const left = el('div');
    left.appendChild(el('div', 'lab-subhead', 'Search / Queue rows — pinned now-playing, terracotta cursor, all kind stamps'));
    const stage1 = el('div', 'lab-list-stage');
    const pickStatus = el('div', 'lab-status-line', 'Last picked: (press Enter or click a row)');
    const mainList = createList({
      label: 'Sample results',
      items: samples.searchSample,
      showIndex: true,
      showKind: true,
      pinNowPlaying: true,
      maxHeight: '380px',
      footerHints: ['↑↓ move', 'Home/End jump', 'Enter play', 'Tab switch', 'Esc close'],
      seed: 200,
      onPick: (item) => {
        lab.lastPicked = item;
        pickStatus.textContent = `Last picked: ${item.title} (${item.kind})`;
      },
    });
    mainList.setActive(1, { scroll: false });
    stage1.appendChild(mainList.el);
    left.append(stage1, pickStatus);

    // Right: 600-row progressive list + paper notes (loading, empty, error with Retry)
    const right = el('div');
    right.appendChild(el('div', 'lab-subhead', '600-row collection list (40 per batch on scroll)'));
    const stage2 = el('div', 'lab-list-stage');
    const batchStatus = el('div', 'lab-status-line', '');
    const list600 = createList({
      label: 'Liked music (600 songs)',
      items: samples.list600,
      batchSize: 40,
      showIndex: true,
      showKind: false,
      maxHeight: '220px',
      seed: 260,
      onPick: (item) => { batchStatus.textContent = `Picked #${item.track}: ${item.title} · rendered ${list600.getRenderedCount()} / 600`; },
    });
    const updateBatchText = () => {
      batchStatus.textContent = `Rendered ${list600.getRenderedCount()} of ${list600.getItems().length} rows (scroll to load next batch)`;
    };
    updateBatchText();
    list600.scrollEl.addEventListener('scroll', updateBatchText, { passive: true });
    stage2.appendChild(list600.el);
    right.append(stage2, batchStatus);

    right.appendChild(el('div', 'lab-subhead', 'Paper notes — loading, empty & error with Retry'));
    const notesStack = el('div', 'lab-notes-stack');
    const retryStatus = el('div', 'lab-status-line', 'Retry clicks: 0');
    let retryCount = 0;

    const loadingList = createList({ label: 'Loading note', seed: 301 });
    loadingList.setLoading('Looking through the crates');
    const emptyList = createList({ label: 'Empty note', seed: 311 });
    emptyList.setEmpty('Nothing found for “zzzx” — try another artist or title.');
    const errorList = createList({ label: 'Error note', seed: 321 });
    errorList.setError('Could not reach YouTube Music just now.', () => {
      retryCount++;
      lab.listRetryCount = retryCount;
      retryStatus.textContent = `Retry clicks: ${retryCount}`;
    });
    notesStack.append(loadingList.el, emptyList.el, errorList.el, retryStatus);
    right.appendChild(notesStack);

    grid.append(left, right);
    sec.appendChild(grid);
    lab.components.list = mainList;
    lab.components.list600 = list600;
    lab.components.listNotes = { loadingList, emptyList, errorList };
  }

  // ============================================================================
  // 9. SHEET
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-sheet',
      'Sheet',
      'Used by: Settings and Lyrics (shared veil, cursor lean, unfold/fold/flap, focus trap, Esc).',
      { seed: 73 },
    );

    const sheet = createSheet({
      title: 'Settings — Look & Account',
      description: 'Changes apply straight away across the shop and the mini player.',
      seed: 7,
      onClose: () => {
        sheetStatus.textContent = `Sheet closed · overlayOpen() = ${overlayOpen()}`;
      },
      onOpen: () => {
        sheetStatus.textContent = `Sheet open · overlayOpen() = ${overlayOpen()}`;
      },
    });

    // Settings-like page inside the sheet body
    const rowSharp = el('div', 'lab-sheet-row');
    rowSharp.append(
      el('div', 'lab-sheet-label', 'Sharpness'),
      el('div', 'lab-sheet-hint', 'How many pixels the shop is drawn with. Lighter runs cooler; the oil paint hides most of the difference.'),
    );
    const sheetSharp = segmented(
      [{ value: 'full', label: 'Full' }, { value: 'balanced', label: 'Balanced' }, { value: 'light', label: 'Light' }],
      { value: 'balanced', role: 'radio', label: 'Sheet sharpness', seed: 77 },
    );
    rowSharp.appendChild(sheetSharp.el);

    const rowCovers = el('div', 'lab-sheet-row');
    rowCovers.append(
      el('div', 'lab-sheet-label', 'Cover art'),
      el('div', 'lab-sheet-hint', 'How strongly album covers are painted over in oil.'),
    );
    const sheetCovers = segmented(
      [{ value: 0, label: 'Off' }, { value: 1, label: 'Light' }, { value: 2, label: 'Medium' }, { value: 3, label: 'Heavy' }],
      { value: 3, role: 'radio', label: 'Cover art painting', seed: 83 },
    );
    rowCovers.appendChild(sheetCovers.el);

    // Danger action with confirm step
    const rowDanger = el('div', 'lab-sheet-row');
    rowDanger.append(
      el('div', 'lab-sheet-label', 'Sign out'),
      el('div', 'lab-sheet-hint', 'Signs Sienna out of every Google account in it. Your library stays on YouTube Music.'),
    );
    const confirmBox = el('div', 'lab-sheet-confirm');
    confirmBox.appendChild(el('div', 'lab-sheet-confirm-msg', 'Sign out of YouTube Music in Sienna?'));
    const confirmRow = el('div', 'lab-row lab-row--tight');
    const signOutBtn = inkButton('Sign out', {
      danger: true,
      size: 'md',
      onClick: () => {
        confirmBox.classList.add('on');
        signOutBtn.style.display = 'none';
        yesBtn.repaint(true);
        keepBtn.focus();
      },
    });
    const yesBtn = brushButton('Yes, sign out', {
      size: 'sm',
      tone: 'danger',
      seed: 97,
      onClick: () => {
        confirmBox.classList.remove('on');
        signOutBtn.style.display = '';
        signOutBtn.focus();
      },
    });
    const keepBtn = inkButton('Keep me in', {
      size: 'sm',
      onClick: () => {
        confirmBox.classList.remove('on');
        signOutBtn.style.display = '';
        signOutBtn.focus();
      },
    });
    confirmRow.append(yesBtn, keepBtn);
    confirmBox.appendChild(confirmRow);
    rowDanger.append(signOutBtn, confirmBox);

    const fine = el(
      'p',
      'lab-sheet-fine',
      'Sienna keeps no passwords and stores nothing about you. Sign-in happens on Google’s page, and the session stays inside Sienna’s own player on this computer.',
    );

    sheet.body.append(rowSharp, rowCovers, rowDanger, fine);
    createScrollCue(sheet.body, { parent: sheet.footer });

    const doneBtn = brushButton('Done', {
      size: 'md',
      tone: 'ink',
      seed: 31,
      onClick: () => sheet.close(),
    });
    sheet.footer.appendChild(doneBtn);

    const sheetStatus = el('div', 'lab-status-line', `Sheet closed · overlayOpen() = ${overlayOpen()}`);
    const opener = brushButton('Open Settings sheet', {
      size: 'md',
      tone: 'ink',
      seed: 71,
      onClick: () => sheet.open({ returnFocusTo: opener }),
    });
    const row = el('div', 'lab-row');
    row.append(opener, sheetStatus);
    sec.appendChild(row);

    lab.components.sheet = sheet;
    lab.components.sheetOpener = opener;
    lab.components.sheetControls = { sheetSharp, sheetCovers, signOutBtn, yesBtn, keepBtn, doneBtn };
  }

  // ============================================================================
  // 10. BANNERS
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-banners',
      'Banners',
      'Used by: offline notice (status), load error with Retry (alert), and Restock status (status).',
      { seed: 83 },
    );

    const stack = el('div', 'lab-banners-stack');
    const bannerStatus = el('div', 'lab-status-line', 'Banner action clicks: 0');
    let bannerActionCount = 0;

    const bOffline = createBanner({ parent: stack, floating: false, seed: 89 });
    bOffline.show({ message: 'You appear to be offline — showing cached shelves.', kind: 'offline' });

    const bError = createBanner({ parent: stack, floating: false, seed: 97 });
    bError.show({
      message: 'Could not load your YouTube Music shelves.',
      kind: 'error',
      actionLabel: 'Retry',
      onAction: () => {
        bannerActionCount++;
        lab.bannerActionCount = bannerActionCount;
        bannerStatus.textContent = `Banner action clicks: ${bannerActionCount}`;
      },
    });

    const bRestock = createBanner({ parent: stack, floating: false, seed: 103 });
    bRestock.show({ message: 'Restocked 6 shelves from YouTube Music.', kind: 'restock' });

    const floatingBanner = createBanner({ parent: document.body, floating: true, seed: 109 });
    const triggers = el('div', 'lab-row lab-row--tight');
    triggers.style.marginTop = 'var(--sienna-space-3)';
    triggers.append(
      inkButton('Preview floating offline', {
        size: 'sm',
        onClick: () => floatingBanner.show({ message: 'Offline — reconnect to play new records.', kind: 'offline', dismissible: true }),
      }),
      inkButton('Preview floating error', {
        size: 'sm',
        danger: true,
        onClick: () => floatingBanner.show({
          message: 'Playback stalled on YouTube Music.',
          kind: 'error',
          actionLabel: 'Retry',
          onAction: () => {
            bannerActionCount++;
            lab.bannerActionCount = bannerActionCount;
            bannerStatus.textContent = `Banner action clicks: ${bannerActionCount}`;
            floatingBanner.hide();
          },
          dismissible: true,
        }),
      }),
      inkButton('Preview floating restock', {
        size: 'sm',
        onClick: () => floatingBanner.show({ message: 'Shelves restocked!', kind: 'restock', autoHideMs: 2600 }),
      }),
    );

    sec.append(stack, triggers, bannerStatus);
    lab.components.banners = { offline: bOffline, error: bError, restock: bRestock, floating: floatingBanner };
  }

  // ============================================================================
  // 11. NOW-PLAYING TAG (shared with the shop and mini player)
  // ============================================================================
  {
    const { sec } = makeSection(
      'lab-tag',
      'Now-playing tag',
      'The real shop and mini captions, with a fake song and working seek, Sign in, mute, shuffle and repeat controls.',
      { seed: 97 },
    );
    const stage = el('div', 'lab-list-stage');
    const tagRow = el('div', 'lab-tag-stage');
    const tag = buildComposedTag();
    const miniTag = buildComposedTag({ variant: 'mini' });
    tagRow.append(tag.el, miniTag.el);
    stage.appendChild(tagRow);
    sec.appendChild(stage);
    lab.components.tag = tag;
    lab.components.miniTag = miniTag;
  }

  // Scratch mount helpers for ui-lab-check.mjs performance & cache tests
  const scratchHost = el('div');
  scratchHost.id = 'lab-scratch';
  scratchHost.style.position = 'relative';
  scratchHost.style.marginTop = 'var(--sienna-space-4)';
  root.appendChild(scratchHost);

  lab.mountTestPaper = (w, h, seed = 7) => {
    const box = el('div');
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    scratchHost.appendChild(box);
    const handle = paperSurface(box, { elevation: 'rest' });
    return {
      el: box,
      resize(nw, nh) {
        box.style.width = `${nw}px`;
        box.style.height = `${nh}px`;
      },
      destroy() {
        handle.destroy();
        box.remove();
      },
    };
  };

  lab.mountTestBrush = (label, opts = {}) => {
    const btn = brushButton(label, opts);
    scratchHost.appendChild(btn);
    btn.repaint(false);
    return {
      el: btn,
      destroy() {
        btn.destroy();
        btn.remove();
      },
    };
  };

  window.__uiLab = lab;

  // Wait for fonts & initial paints to settle
  await fontReady;
  await document.fonts?.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  if (autoOpenSheet) {
    lab.components.sheet.open({ returnFocusTo: lab.components.sheetOpener });
  }

  lab.ready = true;
}

loadFakeSamples().then((samples) => (isCompare ? buildCompareView(samples) : buildFullLab(samples)));
