// Design tokens for Sienna's 2D UI layer and canvas painters.
// Pure constants on import (never touches the DOM), so Node scripts (e.g. scripts/contrast-check.mjs)
// and Web Workers can import it safely. Call injectTokens() once in browser entrypoints / UI modules
// to attach the CSS custom properties and centralized reduced-motion rule to :root.

export const COLORS = Object.freeze({
  paper: '#f8f1e2',             // primary torn-paper cream
  paperLo: '#ece1cc',           // recessed / aged cream (placeholders, flaps, tracks, subtle chips)
  ink: '#2b2436',               // primary dark plum-charcoal text
  ink2: '#5c4636',              // secondary warm umber text (subtitles, hints, labels)
  ink3: '#705742',              // muted sepia text (placeholders, fine print, times, track numbers)
  indigo: '#2d3158',            // indigo oil paint (plates, headings, progress, now-playing)
  terracotta: '#a6442f',        // terracotta oil paint (hover, active, selected, liked)
  danger: '#963420',            // deeper burnt-sienna red (errors, confirmations, destructive actions)
  veil: 'rgba(46, 34, 26, 0.24)', // warm umber overlay backdrop
});

// Readable book serif for small text, meta, hints, times, lyrics, Settings copy and tour body.
export const SERIF = '"Alegreya", Georgia, "Times New Roman", serif';

// 6-step type scale (px)
export const TYPE = Object.freeze({
  xs: 14,
  sm: 16,
  md: 20,
  lg: 26,
  xl: 34,
  xxl: 42,
});

// 4 px spacing scale (px)
export const SPACE = Object.freeze({
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
});

// 3 resting tilts (deg)
export const TILT = Object.freeze({
  sm: -0.6,
  md: -1.2,
  lg: -2.2,
});

// 2 elevations (resting, lifted) — compatible with both drop-shadow() and box-shadow
export const ELEVATION = Object.freeze({
  rest: '0 3px 6px rgba(36, 25, 18, 0.22)',
  lift: '0 8px 16px rgba(36, 25, 18, 0.30)',
});

// Motion: 3 durations (ms) and 3 easings
export const MOTION = Object.freeze({
  dur: Object.freeze({
    fast: 160,
    mid: 280,
    slow: 560,
  }),
  ease: Object.freeze({
    out: 'cubic-bezier(0.22, 0.82, 0.28, 1)',
    pop: 'cubic-bezier(0.28, 1.55, 0.45, 1)',
    in: 'cubic-bezier(0.55, 0.06, 0.78, 0.32)',
  }),
});

// Z-index scale (replaces ad-hoc numbers 2..100)
export const Z = Object.freeze({
  caption: 10,
  chrome: 20,
  tour: 30,
  banner: 40,
  list: 50,
  sheet: 60,
  modal: 70,
  fatal: 100,
});

export const TOKENS = Object.freeze({
  color: COLORS,
  serif: SERIF,
  type: TYPE,
  space: SPACE,
  tilt: TILT,
  elevation: ELEVATION,
  motion: MOTION,
  z: Z,
});

// Every foreground/background text pair used under 24 px across Sienna's 2D UI.
// Verified by scripts/contrast-check.mjs (all must reach >= 4.5:1 WCAG AA).
export const CONTRAST_PAIRS = Object.freeze([
  { name: 'ink on paper (body, lyrics, inputs)', fg: COLORS.ink, bg: COLORS.paper },
  { name: 'ink2 on paper (subtitles, hints, tour fine print)', fg: COLORS.ink2, bg: COLORS.paper },
  { name: 'ink3 on paper (placeholders, times, source, track #)', fg: COLORS.ink3, bg: COLORS.paper },
  { name: 'indigo on paper (headings, active labels, links)', fg: COLORS.indigo, bg: COLORS.paper },
  { name: 'terracotta on paper (active tools, hover, emphasis)', fg: COLORS.terracotta, bg: COLORS.paper },
  { name: 'danger on paper (errors, sign-out confirm)', fg: COLORS.danger, bg: COLORS.paper },
  { name: 'ink on paperLo (recessed cards, chips, code)', fg: COLORS.ink, bg: COLORS.paperLo },
  { name: 'ink2 on paperLo (inactive tabs, subtle buttons)', fg: COLORS.ink2, bg: COLORS.paperLo },
  { name: 'ink3 on paperLo (muted meta on recessed paper)', fg: COLORS.ink3, bg: COLORS.paperLo },
  { name: 'indigo on paperLo (tab hover, close chip)', fg: COLORS.indigo, bg: COLORS.paperLo },
  { name: 'terracotta on paperLo (accent on recessed paper)', fg: COLORS.terracotta, bg: COLORS.paperLo },
  { name: 'danger on paperLo (error on recessed paper)', fg: COLORS.danger, bg: COLORS.paperLo },
  { name: 'paper on indigo (brush plates, now-playing queue row)', fg: COLORS.paper, bg: COLORS.indigo },
  { name: 'paperLo on indigo (secondary text on indigo row/badge)', fg: COLORS.paperLo, bg: COLORS.indigo },
  { name: 'paper on terracotta (hot plates, selected tabs/rows)', fg: COLORS.paper, bg: COLORS.terracotta },
  { name: 'paperLo on terracotta (secondary text on selected row)', fg: COLORS.paperLo, bg: COLORS.terracotta },
  { name: 'paper on danger (destructive action button)', fg: COLORS.paper, bg: COLORS.danger },
]);

export const CSS_VARS = Object.freeze({
  '--sienna-paper': COLORS.paper,
  '--sienna-paper-lo': COLORS.paperLo,
  '--sienna-ink': COLORS.ink,
  '--sienna-ink-2': COLORS.ink2,
  '--sienna-ink-3': COLORS.ink3,
  '--sienna-indigo': COLORS.indigo,
  '--sienna-terracotta': COLORS.terracotta,
  '--sienna-danger': COLORS.danger,
  '--sienna-veil': COLORS.veil,

  '--sienna-serif': SERIF,

  '--sienna-text-xs': `${TYPE.xs}px`,
  '--sienna-text-sm': `${TYPE.sm}px`,
  '--sienna-text-md': `${TYPE.md}px`,
  '--sienna-text-lg': `${TYPE.lg}px`,
  '--sienna-text-xl': `${TYPE.xl}px`,
  '--sienna-text-2xl': `${TYPE.xxl}px`,

  '--sienna-space-1': `${SPACE[1]}px`,
  '--sienna-space-2': `${SPACE[2]}px`,
  '--sienna-space-3': `${SPACE[3]}px`,
  '--sienna-space-4': `${SPACE[4]}px`,
  '--sienna-space-5': `${SPACE[5]}px`,
  '--sienna-space-6': `${SPACE[6]}px`,
  '--sienna-space-8': `${SPACE[8]}px`,
  '--sienna-space-10': `${SPACE[10]}px`,

  '--sienna-tilt-sm': `${TILT.sm}deg`,
  '--sienna-tilt-md': `${TILT.md}deg`,
  '--sienna-tilt-lg': `${TILT.lg}deg`,

  '--sienna-shadow-rest': ELEVATION.rest,
  '--sienna-shadow-lift': ELEVATION.lift,

  '--sienna-dur-fast': `${MOTION.dur.fast}ms`,
  '--sienna-dur-mid': `${MOTION.dur.mid}ms`,
  '--sienna-dur-slow': `${MOTION.dur.slow}ms`,
  '--sienna-ease-out': MOTION.ease.out,
  '--sienna-ease-pop': MOTION.ease.pop,
  '--sienna-ease-in': MOTION.ease.in,

  '--sienna-z-caption': String(Z.caption),
  '--sienna-z-chrome': String(Z.chrome),
  '--sienna-z-tour': String(Z.tour),
  '--sienna-z-banner': String(Z.banner),
  '--sienna-z-list': String(Z.list),
  '--sienna-z-sheet': String(Z.sheet),
  '--sienna-z-modal': String(Z.modal),
  '--sienna-z-fatal': String(Z.fatal),
});

export const TOKENS_CSS = `:root {\n${
  Object.entries(CSS_VARS).map(([k, v]) => `  ${k}: ${v};`).join('\n')
}\n}\n@media (prefers-reduced-motion: reduce) {\n  :root {\n    --sienna-dur-fast: 0ms;\n    --sienna-dur-mid: 0ms;\n    --sienna-dur-slow: 0ms;\n  }\n  *, *::before, *::after {\n    animation-duration: 0.01ms !important;\n    animation-delay: 0ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0ms !important;\n    scroll-behavior: auto !important;\n  }\n  .st-flap, .ln-flap, .tr-amb { display: none !important; }\n  .cs .cs-slipwrap, .cl .cl-slipwrap { mask-image: none !important; }\n}\n`;

export function injectTokens(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('sienna-tokens')) return;
  const style = doc.createElement('style');
  style.id = 'sienna-tokens';
  style.textContent = TOKENS_CSS;
  doc.head.prepend(style);
}

export function prefersReducedMotion() {
  return typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
