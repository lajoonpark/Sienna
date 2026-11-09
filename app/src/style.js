import { settings } from './settings.js';
import { FONTS } from './fonts.js';

// Which look to render. Watercolour is the look; `?style=flat` shows the old flat toon look for comparison.
const style = new URLSearchParams(location.search).get('style') || '';
export const WATERCOLOUR = style.toLowerCase() !== 'flat';

// Hand lettering for buttons, tags and the shop sign. Settings > Lettering picks one (key 'font');
// the page reads it once at load and reloads when it changes (main.js, mini.js), because tags,
// the sign and buttons are painted into canvases with it. The faces and their sizing are in fonts.js.
export { FONTS };
// ?font=kaushan overrides the setting for shots
export const LETTERING = FONTS[new URLSearchParams(location.search).get('font')] ?? FONTS[settings.get('font')] ?? FONTS.amatic;
export const FONT = `${LETTERING.family}, "Segoe Print", "Bradley Hand", cursive`;
