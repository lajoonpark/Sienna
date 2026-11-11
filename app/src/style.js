import { settings } from './settings.js';
import { FONTS } from './fonts.js';

// Which look to render. Watercolour is the look; `?style=flat` shows the old flat toon look for comparison.
const style = new URLSearchParams(location.search).get('style') || '';
export const WATERCOLOUR = style.toLowerCase() !== 'flat';

// Hand lettering for buttons, tags and the shop sign. Settings > Lettering picks one (key 'font');
// the faces and their sizing are in fonts.js. The choice changes LIVE, without a reload:
//   - FONT, LETTERING and fontReady are `let` exports, so importers always read the current one
//     (ES modules hand out live bindings). Read them when painting, never copy them into a const.
//   - CSS uses var(--sienna-font) (set on <html>), never a baked-in family, so DOM text just reflows.
//   - Anything painted into a canvas or texture registers a repaint with onLettering(owner, draw).
//     It runs once the new face has loaded, so nothing is ever drawn in a fallback face.
// ?font=kaushan pins one for shots (and then ignores the setting).
export { FONTS };
const pinned = FONTS[new URLSearchParams(location.search).get('font')];
const familyOf = (l) => `${l.family}, "Segoe Print", "Bradley Hand", cursive`;
const load = (font) => (typeof document !== 'undefined' && document.fonts
  ? document.fonts.load(`64px ${font}`).then(() => {}, () => {})
  : Promise.resolve());

export let LETTERING = pinned ?? FONTS[settings.get('font')] ?? FONTS.amatic;
export let FONT = familyOf(LETTERING);
export let fontReady = load(FONT);   // the current face has loaded (or failed: paint with the fallback)
const setVar = () => document.documentElement?.style.setProperty('--sienna-font', FONT);
if (typeof document !== 'undefined') setVar();

// owner -> draw, held weakly: a texture or tag that is thrown away takes its repaint with it
const owners = new Set();
const draws = new WeakMap();
export function onLettering(owner, draw) {
  if (!draws.has(owner)) owners.add(new WeakRef(owner));
  draws.set(owner, draw);
}

let want = null;
settings.on('font', async (key) => {
  if (pinned) return;
  const next = FONTS[key] ?? FONTS.amatic;
  want = next;
  if (next === LETTERING) return;
  const font = familyOf(next);
  await load(font);                 // switch only once the new face is here: no fallback flash
  if (want !== next) return;        // picked another one meanwhile
  LETTERING = next;
  FONT = font;
  fontReady = Promise.resolve();
  setVar();
  for (const ref of owners) {
    const o = ref.deref();
    if (!o) { owners.delete(ref); continue; }
    try { draws.get(o)?.(); } catch (e) { console.error('lettering repaint', e); }
  }
});
