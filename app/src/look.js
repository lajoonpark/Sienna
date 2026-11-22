// Watercolour is the default look; ?style=flat shows the old toon palette.
const style = new URLSearchParams(globalThis.location?.search).get('style') || '';
export const WATERCOLOUR = style.toLowerCase() !== 'flat';
