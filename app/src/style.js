// Which look to render. Watercolour is the look; `?style=flat` shows the old flat toon look for comparison.
const style = new URLSearchParams(location.search).get('style') || '';
export const WATERCOLOUR = style.toLowerCase() !== 'flat';

// Handwritten cursive for buttons, tags and the shop sign (Dancing Script Bold, bundled via
// @fontsource; each page imports '@fontsource/dancing-script/700.css'). Only the 700 weight is
// bundled, so every size in the app draws in it.
export const FONT = `"Dancing Script", "Segoe Script", "Apple Chancery", cursive`;
