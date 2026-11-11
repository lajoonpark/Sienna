// Settings > Lettering reloads the page, because tags, the shop sign and the buttons are painted into
// canvases and textures with the font. A plain reload blinks (the window goes dark while the shop is
// rebuilt), so the reload hides behind a curtain instead:
//   - in Electron the main process photographs the window just before the reload and hands the picture
//     to the fresh page (preload.cjs, window.sienna.curtain), which shows it on top straight away, then
//     cross-fades to the real shop once it has been drawn in the new lettering: the letters just change.
//   - in a plain browser (no photograph) the page fades to the shop's dark and back in again.
// Imported first by main.js, so the curtain is up before anything else builds or paints.
const KEY = 'sienna.curtain';
const DARK = '#1b1410';      // the window's own background (index.html, electron/main.cjs)
const FADE_IN = 220;         // ms, browser only: to dark before the reload
const FADE_OUT = 450;        // ms, the picture (or dark) giving way to the new shop
const GIVE_UP = 6000;        // ms: lift it anyway if the shop never says it is ready

let curtain = null;

function hang(picture, opacity) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;z-index:2147483647;background:${DARK};opacity:${opacity};`
    + `transition:opacity ${FADE_OUT}ms ease;pointer-events:auto;cursor:progress`;
  if (picture) {
    const img = document.createElement('img');
    img.src = picture;
    img.alt = '';
    img.style.cssText = 'display:block;width:100%;height:100%;object-fit:fill;user-select:none';
    el.appendChild(img);
  }
  document.body.appendChild(el);
  return el;
}

// On load: did the last page leave a curtain for us?
{
  let flagged = false;
  try { flagged = sessionStorage.getItem(KEY) === '1'; sessionStorage.removeItem(KEY); } catch { /* storage off: no curtain */ }
  const picture = typeof window.sienna?.curtain === 'string' ? window.sienna.curtain : null;
  if (flagged || picture) {
    curtain = hang(picture, 1);
    setTimeout(lift, GIVE_UP);
  }
}

function lift() {
  const el = curtain;
  if (!el) return;
  curtain = null;
  el.style.pointerEvents = 'none';
  el.style.opacity = '0';
  setTimeout(() => el.remove(), FADE_OUT + 50);
}

// Reload into `url` behind the curtain.
export async function reloadBehindCurtain(url) {
  let photographed = false;
  try { photographed = !!(await window.sienna?.snapshot?.()); } catch { /* no picture: fade to dark instead */ }
  try { sessionStorage.setItem(KEY, '1'); } catch { /* no storage: the new page just appears */ }
  if (!photographed) {
    const el = hang(null, 0);
    el.style.transition = `opacity ${FADE_IN}ms ease`;
    el.getBoundingClientRect(); // commit opacity 0 so the change animates
    el.style.opacity = '1';
    await new Promise((r) => setTimeout(r, FADE_IN + 30));
  }
  location.replace(url);
}

// The fresh shop calls this with a promise that settles once it has been drawn; the curtain then fades.
export function liftCurtainWhen(ready) {
  if (!curtain) return;
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  Promise.resolve(ready).then(frames, () => {}).then(lift);
}
