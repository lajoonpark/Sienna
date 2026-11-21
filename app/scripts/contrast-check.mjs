// Checks WCAG 2.1 contrast ratios for every text/background pair under 24 px defined in src/ui/tokens.js.
// Fails with exit code 1 if any pair falls below 4.5:1 (WCAG AA normal text).
// Usage: node scripts/contrast-check.mjs
import { COLORS, CONTRAST_PAIRS } from '../src/ui/tokens.js';

const MIN_RATIO = 4.5;

function parseColor(str) {
  const s = String(str).trim();
  if (s.startsWith('#')) {
    const hex = s.length === 4
      ? s.slice(1).split('').map((c) => c + c).join('')
      : s.slice(1);
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])];
  throw new Error(`Unsupported color format: ${str}`);
}

function composite(fg, bg) {
  const a = fg[3];
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
  ];
}

function relativeLuminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fgStr, bgStr) {
  const bg = parseColor(bgStr);
  if (bg[3] < 1) throw new Error(`Background color must be opaque for contrast check: ${bgStr}`);
  const fg = composite(parseColor(fgStr), bg);
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

let failures = 0;
console.log(`Checking ${CONTRAST_PAIRS.length} token text/background pairs (min ${MIN_RATIO}:1)...\n`);
for (const { name, fg, bg } of CONTRAST_PAIRS) {
  const ratio = contrastRatio(fg, bg);
  const ok = ratio >= MIN_RATIO;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${ratio.toFixed(2).padStart(5)}:1  ${fg} on ${bg}  — ${name}`);
}

// Sanity-check all named opaque palette tokens exist
for (const key of ['paper', 'paperLo', 'ink', 'ink2', 'ink3', 'indigo', 'terracotta', 'danger', 'veil']) {
  if (!COLORS[key]) {
    console.error(`FAIL missing token COLORS.${key}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\ncontrast-check failed: ${failures} pair(s) below ${MIN_RATIO}:1`);
  process.exit(1);
}
console.log(`\ncontrast-check passed: all ${CONTRAST_PAIRS.length} pairs >= ${MIN_RATIO}:1`);
