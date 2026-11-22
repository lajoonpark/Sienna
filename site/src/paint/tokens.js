// The app's design tokens (app/src/ui/tokens.js), the part the page and its painters use.
// Pure constants: safe in Node tests and in the cover worker.

export const COLORS = Object.freeze({
  paper: '#f8f1e2',
  paperLo: '#ece1cc',
  ink: '#2b2436',
  ink2: '#5c4636',
  ink3: '#705742',
  indigo: '#2d3158',
  terracotta: '#a6442f',
  danger: '#963420',
  mustard: '#f2c641',
});

export const ELEVATION = Object.freeze({
  rest: '0 3px 6px rgba(36, 25, 18, 0.22)',
  lift: '0 8px 16px rgba(36, 25, 18, 0.30)',
});
