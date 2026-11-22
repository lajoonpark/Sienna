// The page sky follows the visitor's clock, like the shop's sky in the app.
// Pure maths (no DOM), so Node tests can import it.

// hour, sky top, sky bottom
const KEYS = [
  [0, '#14152e', '#2d3158'],
  [5, '#23234a', '#5a3f63'],
  [5.75, '#3a3763', '#7d4f5f'],
  [6.5, '#93a6d6', '#f6c9a6'],
  [9, '#a9cbe0', '#f8ecd0'],
  [13, '#9cc6e4', '#f8f1e2'],
  [17, '#edc27f', '#f6dcae'],
  [18.25, '#e3a26a', '#f0b98a'],
  [19, '#5c3d6b', '#a6442f'],
  [20.5, '#23234a', '#5a3f63'],
  [24, '#14152e', '#2d3158'],
];

export const INK = '#2b2436';
export const PAPER = '#f8f1e2';

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// How lit the lanterns are (0..1): they come on through dusk and go out at dawn.
export function lanternLevel(hour) {
  return hour >= 12 ? smooth(17.5, 19.5, hour) : 1 - smooth(5.5, 7, hour);
}

export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const [h0, top0, bot0] = KEYS[i];
  const [h1, top1, bot1] = KEYS[i + 1];
  const t = (h - h0) / (h1 - h0);
  const top = rgbToHex(mix(hexToRgb(top0), hexToRgb(top1), t));
  const bottom = rgbToHex(mix(hexToRgb(bot0), hexToRgb(bot1), t));
  const mid = rgbToHex(mix(hexToRgb(top), hexToRgb(bottom), 0.5));
  // Text on the sky is ink by day and paper by night: whichever reads better on both ends.
  const worst = (fg) => Math.min(contrast(fg, top), contrast(fg, bottom));
  const dark = worst(PAPER) > worst(INK);
  return { top, bottom, mid, dark, fg: dark ? PAPER : INK, lanterns: lanternLevel(h) };
}

export const hourNow = (d = new Date()) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

export function clockLabel(hour) {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
