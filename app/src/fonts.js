// The lettering fonts, bundled via @fontsource. Settings > Lettering picks one (key 'font', style.js).
// Each @font-face only downloads when text actually uses it, so the unused choices cost nothing until
// Settings shows them. style.js imports this, so the faces exist before anything measures with them.
//
// Every size in the app (CSS, canvas tags, the shop sign, the fit-to-width code) is tuned for Amatic,
// a narrow all-caps hand. The other letterings run wider and taller at the same pixel size, so each is
// registered under its own family name with `size-adjust` (it takes about the room Amatic does) and
// ascent/descent overrides (its line box is Amatic's 1.27 em, with the letters centred in it the way
// Amatic's capitals are). Then every use of the font fits without knowing which one is chosen.
import amaticCss from '@fontsource/amatic-sc/700.css?inline';
import kaushanCss from '@fontsource/kaushan-script/400.css?inline';
import srirachaCss from '@fontsource/sriracha/400.css?inline';
import caveatCss from '@fontsource/caveat/700.css?inline';

// scale: size against Amatic (wider fonts smaller). cap, xh: cap and x-height in em, measured from
// the font, to find where the letters' visual middle is.
export const FONTS = {
  amatic: { label: 'Amatic', family: '"Amatic SC"', css: amaticCss },   // hand-drawn capitals, the default, as is
  kaushan: { label: 'Kaushan', family: '"Sienna Kaushan"', css: kaushanCss, scale: 0.84, cap: 0.75, xh: 0.48 },
  sriracha: { label: 'Sriracha', family: '"Sienna Sriracha"', css: srirachaCss, scale: 0.8, cap: 0.67, xh: 0.49 },
  caveat: { label: 'Caveat', family: '"Sienna Caveat"', css: caveatCss, scale: 0.9, cap: 0.73, xh: 0.37 },
};

const LINE = 1.27; // Amatic's natural line height (ascent 1.02 + descent .25)
const pct = (n) => `${(n * 100).toFixed(1)}%`;

function faces({ family, css, scale, cap, xh }) {
  if (!scale) return css;
  // the letters' visual band, mixed caps and lowercase, runs from the baseline up to about
  // (cap + xh) / 2 of the adjusted size; put its middle at the middle of a LINE-tall box
  const mid = (scale * (cap + xh)) / 4;
  const ascent = LINE / 2 + mid, descent = LINE / 2 - mid;
  // overrides are scaled by size-adjust as well, so divide it back out
  const extra = `size-adjust: ${pct(scale)}; ascent-override: ${pct(ascent / scale)}; descent-override: ${pct(descent / scale)}; line-gap-override: 0%;`;
  return css.replace(/font-family:\s*(['"]?)[^;'"}]+\1\s*;/g, `font-family: ${family}; ${extra}`);
}

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = Object.values(FONTS).map(faces).join('\n');
  document.head.appendChild(style);
}
