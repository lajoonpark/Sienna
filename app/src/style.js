import { settings } from './settings.js';

// Which look to render. Watercolour is the look; `?style=flat` shows the old flat toon look for comparison.
const style = new URLSearchParams(location.search).get('style') || '';
export const WATERCOLOUR = style.toLowerCase() !== 'flat';

// Hand lettering for buttons, tags and the shop sign. Settings > Lettering picks one (key 'font');
// the page reads it once at load and reloads when it changes (main.js, mini.js), because tags,
// the sign and buttons are painted into canvases with it. The fonts come from src/fonts.js
// (@fontsource, one weight each: whichever face is bundled is used for every size).
export const FONTS = {
  amatic: { label: 'Amatic', family: '"Amatic SC"' },          // hand-drawn capitals, the default
  kaushan: { label: 'Kaushan', family: '"Kaushan Script"' },
  sriracha: { label: 'Sriracha', family: '"Sriracha"' },
  caveat: { label: 'Caveat', family: '"Caveat"' },
};
// ?font=kaushan overrides the setting for shots
const chosen = FONTS[new URLSearchParams(location.search).get('font')] ?? FONTS[settings.get('font')] ?? FONTS.amatic;
export const FONT = `${chosen.family}, "Segoe Print", "Bradley Hand", cursive`;
