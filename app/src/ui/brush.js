// Oil-paint brush stroke plates for buttons, menu words, Settings words, Sign In, and rack signs.
// Moved from controls.js so every surface shares one brush plate helper.
import { dabCluster, TONES } from '../brushpaint.js';
import { COLORS } from './tokens.js';

function tonesFor(color) {
  if (color === COLORS.indigo) return TONES.ink;
  if (color === COLORS.terracotta) return TONES.hot;
  const n = parseInt(String(color).replace('#', ''), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return [
    rgb,
    [clamp(rgb[0] * 1.07 + 3), clamp(rgb[1] * 1.03 + 2), clamp(rgb[2] * 0.97)],
    [clamp(rgb[0] * 0.91), clamp(rgb[1] * 0.94), clamp(rgb[2] * 1.05 + 3)],
  ];
}

// Thick, opaque loaded oil-paint dab plate (used for menu buttons, Settings words, Sign In, and rack signs).
export function brushStroke(w, h, color, seed, { flipX = false } = {}) {
  return dabCluster(w, h, {
    tones: tonesFor(color),
    seed,
    rows: h > 64 ? 2 : 1,
    flipX,
    tilt: 0.05,
    overlap: 0.56,
    minCols: 2,
    // One even, opaque coat: varied tones, strong ridges and see-through tails made the overlaps show
    // as brighter and darker patches across a word.
    impasto: 0.55,
    even: true,
    solid: true,
  });
}
