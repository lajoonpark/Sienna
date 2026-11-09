import { settings } from './settings.js';

// Which look to render. Watercolour is the look; `?style=flat` shows the old flat toon look for comparison.
const style = new URLSearchParams(location.search).get('style') || '';
export const WATERCOLOUR = style.toLowerCase() !== 'flat';

// Hand lettering for buttons, tags and the shop sign. Settings > Lettering picks one (key 'font');
// the page reads it once at load and reloads when it changes (main.js, mini.js), because tags,
// the sign and buttons are painted into canvases with it. The fonts come from src/fonts.js
// (@fontsource, one weight each: whichever face is bundled is used for every size).
// Sizes across the app are tuned for Amatic, a narrow all-caps hand. The others run much wider and
// taller at the same pixel size, so each has `scale` (multiply a font size by it so text takes
// closer to the room Amatic does) and `dy` (em to move the letters down, negative is up, so
// lowercase-heavy hands sit in the middle of a brush stroke like Amatic's capitals do).
export const FONTS = {
  amatic: { label: 'Amatic', family: '"Amatic SC"', scale: 1, dy: 0 },          // hand-drawn capitals, the default
  kaushan: { label: 'Kaushan', family: '"Kaushan Script"', scale: 0.84, dy: -0.04 },
  sriracha: { label: 'Sriracha', family: '"Sriracha"', scale: 0.8, dy: -0.04 },
  caveat: { label: 'Caveat', family: '"Caveat"', scale: 0.9, dy: -0.03 },
};
// ?font=kaushan overrides the setting for shots
export const LETTERING = FONTS[new URLSearchParams(location.search).get('font')] ?? FONTS[settings.get('font')] ?? FONTS.amatic;
export const FONT = `${LETTERING.family}, "Segoe Print", "Bradley Hand", cursive`;
