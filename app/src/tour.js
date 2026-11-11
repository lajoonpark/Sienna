// The first-run tour: torn paper notes in the shop, with brush-stroke words floating under them, the same
// paper and words as the Settings card. It starts once the intro reaches home on a new install, and each
// step ends when you have done the thing it is about (signed in, played a record, pressed a shortcut).
//
//   welcome  sign in, or look around first; small print on ads, money, data and the source code
//   paint    how the shop is painted          } choices apply at once, so the shop behind the note
//   letters  the handwriting                  } shows each one; they are the Settings card's choices,
//   smooth   60 or 30 fps                     } just floating in the shop
//   record   pick a record (a small note at the top, the shop stays usable)
//   player   the suitcase: volume is the Mac's own, scrubbing, keys (a note above the case)
//   keys     the three shortcuts: each is ticked when pressed, a click on one changes it
//   bye      the menu bar, Settings, and this tour again
//
// SKIP TOUR (top) or Esc ends it. Where it got to is saved after every step (localStorage 'sienna.tour'),
// so quitting half-way carries on from there. Installs from before
// the tour (saved settings, or already signed in) never get it on their own: Settings > Tour starts it.
// Not on its own in a plain browser (fake store) or under automation (navigator.webdriver), so the check
// scripts see the shop as before. ?tour=0 keeps it away; ?tour=<step name or number> shows that step
// without saving anything; ?tour=new runs it as on a new install (screenshots: SIENNA_QUERY="at=home&tour=keys" node scripts/shot.mjs out 3; add &guest for
// the welcome note as a guest sees it, since the fake store counts as signed in).
import { settings } from './settings.js';
import { shortcuts } from './shortcuts.js';
import { torn, word } from './settings-panel.js';
import { FONTS, onLettering } from './style.js';
import { INK, HOT } from './controls.js';
import { createFx, COLOURS } from './tourfx.js';
import { onCursorTilt, tiltCSS } from './cursortilt.js';

const KEY = 'sienna.tour';
const STEPS = ['welcome', 'paint', 'letters', 'smooth', 'record', 'player', 'keys', 'bye'];
const SOURCE = 'github.com/lajoonpark/Sienna';
const mac = /Mac/.test(navigator.platform);
// the small print on the welcome note: [sticker, under it, colour, what it means]
const SEALS = [
  ['Free', 'forever', HOT, 'No price, no plans, no catch. Sienna makes no money at all.'],
  ['Private', '', INK, "No servers, and it keeps nothing about you. You sign in on Google's own page; settings stay on this computer."],
  ['Ads?', '', '#c99a3c', 'Without Premium you will hear some. YouTube Music chooses and plays them, and Sienna earns nothing from them.'],
  ['Open', 'source', '#6f8f5c', 'Don\'t take our word for it: every line is at <b class="tr-src"></b>'],
];

const CSS = `
.tr { position: fixed; inset: 0; z-index: 8; pointer-events: none; font-family: var(--sienna-font); color: #2b2436; perspective: 1100px;
  opacity: 0; visibility: hidden; transition: opacity .45s ease, visibility 0s .45s; }
.tr.show { opacity: 1; visibility: visible; transition: opacity .45s ease; }
.tr-skip { position: absolute; top: 3.4vh; left: 50%; transform: translateX(-50%); font-size: 22px; pointer-events: auto; opacity: .85; }
.tr-skip:hover { opacity: 1; }
.tr-stage { position: absolute; left: 50%; top: 50%; width: min(620px, 92vw); transform-style: preserve-3d; will-change: transform;
  display: flex; flex-direction: column; align-items: center; }
.tr-stage[data-at="upper"] { top: 9vh; }
.tr-stage[data-at="top"] { top: 11vh; width: min(560px, 88vw); }
.tr-stage[data-at="player"] { left: auto; top: auto; width: min(430px, 60vw); align-items: flex-start; }

/* the note: it drops onto the shop with a little bounce, and is flicked away when you move on */
.tr-note { position: relative; box-sizing: border-box; width: 100%; padding: 24px 30px 18px; transform: rotate(-.6deg); opacity: 0; }
.tr-note.in { opacity: 1; animation: tr-drop .62s cubic-bezier(.3,.7,.4,1) both; }
@keyframes tr-drop {
  0% { opacity: 0; transform: translateY(-70px) rotate(5deg) scale(1.08); }
  45% { opacity: 1; transform: translateY(7px) rotate(-1.4deg) scale(.985, 1.01); }
  70% { transform: translateY(-4px) rotate(-.3deg) scale(1.005); }
  100% { transform: rotate(-.6deg); } }
.tr-sh { position: absolute; inset: 0; filter: drop-shadow(0 8px 12px rgba(50,35,25,.28)); }
.tr-paper { position: absolute; inset: 0; background: #f4ead6; }
.tr-tape { position: absolute; top: -13px; left: 26px; width: 96px; height: 28px; transform: rotate(-7deg);
  background: linear-gradient(90deg, rgba(232,214,160,.82), rgba(240,226,180,.78)); box-shadow: 0 1px 2px rgba(60,40,20,.15);
  clip-path: polygon(0 8%, 4% 0, 8% 10%, 12% 0, 100% 0, 96% 12%, 100% 25%, 96% 40%, 100% 55%, 96% 70%, 100% 85%, 96% 100%, 0 100%, 4% 85%, 0 70%, 4% 55%, 0 40%, 4% 25%); }
.tr-stage[data-at="player"] .tr-tape, .tr-stage[data-at="top"] .tr-tape { width: 70px; }

/* a record peeks out from behind the note, like one out of its sleeve, and spins; its label is the step */
.tr-disc { position: absolute; top: -54px; right: -50px; width: 98px; height: 98px; animation: tr-out .8s cubic-bezier(.2,1.25,.4,1) .3s both; }
.tr-stage[data-at="top"] .tr-disc, .tr-stage[data-at="player"] .tr-disc { width: 78px; height: 78px; top: -42px; right: -38px; }
@keyframes tr-out { from { transform: translate(-50px, 50px) rotate(-120deg); } }
.tr-vinyl { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 4px 10px rgba(30,20,15,.4);
  background: radial-gradient(circle, transparent 0 31%, #141216 31.5% 34%, transparent 34.5%),
    conic-gradient(from 20deg, rgba(255,255,255,0) 0 10%, rgba(255,255,255,.18) 14%, rgba(255,255,255,0) 20% 60%, rgba(255,255,255,.12) 64%, rgba(255,255,255,0) 70%),
    repeating-radial-gradient(circle, #1c191f 0 1.6px, #29252d 1.6px 3px);
  animation: tr-spin 1.8s linear 1.1s infinite; }
@keyframes tr-spin { to { transform: rotate(360deg); } }
.tr-lab { position: absolute; inset: 31%; border-radius: 50%; background: var(--lab, ${HOT}); display: grid; place-items: center;
  font-size: 22px; line-height: 1; color: #fbf5e8; text-shadow: 0 1px 1px rgba(30,20,15,.4); box-shadow: inset 0 0 0 2px rgba(251,245,232,.35); }
.tr-stage[data-at="top"] .tr-lab, .tr-stage[data-at="player"] .tr-lab { font-size: 18px; }
.tr-lab span { padding-top: .12em; }

/* the title falls in letter by letter, and a brush stroke underlines it */
.tr-title { position: relative; font-size: 40px; line-height: 1; color: ${INK}; margin: 0 0 12px; }
.tr-tt { position: relative; display: inline-block; }
.tr-tw { display: inline-block; white-space: nowrap; }
.tr-tw.hot { color: ${HOT}; }
.tr-ch { display: inline-block; animation: tr-ch .55s cubic-bezier(.2,1.7,.4,1) calc(var(--i) * 30ms + .18s) both; }
@keyframes tr-ch { from { opacity: 0; transform: translateY(-30px) rotate(calc(var(--k) * 1deg)) scale(1.5); } }
.tr-tw.hot .tr-ch { animation-name: tr-ch, tr-glint; animation-duration: .55s, 3.6s; animation-timing-function: cubic-bezier(.2,1.7,.4,1), ease-in-out;
  animation-delay: calc(var(--i) * 30ms + .18s), calc(var(--i) * 70ms + 1.6s); animation-iteration-count: 1, infinite; animation-fill-mode: both, none; }
@keyframes tr-glint { 0%, 82%, 100% { transform: none; } 88% { transform: translateY(-5px) rotate(-6deg); } }
.tr-sw { position: absolute; left: -3%; bottom: -9px; width: 106%; height: 12px; overflow: visible; }
.tr-sw path { fill: none; stroke: ${HOT}; stroke-width: 3.2; stroke-linecap: round; opacity: .75; stroke-dasharray: 1; stroke-dashoffset: 0;
  animation: tr-draw .55s ease-out var(--sd, .5s) both; }
@keyframes tr-draw { from { stroke-dashoffset: 1; } }

/* the words ink in one after another */
.tr-body { position: relative; font-size: 24px; line-height: 1.15; }
.tr-body b { font-weight: inherit; color: ${HOT}; }
.tr-wd { animation: tr-ink .5s ease calc(var(--i) * 15ms + var(--w0, .3s)) both; }
@keyframes tr-ink { from { opacity: 0; filter: blur(3px); } }
.tr-stage[data-at="top"] .tr-title { font-size: 32px; }
.tr-stage[data-at="top"] .tr-body, .tr-stage[data-at="player"] .tr-body { font-size: 21px; }

/* the small print, as price stickers slapped on the note one by one */
.tr-fine { position: relative; color: #6b4f3a; }
.tr-fine:empty { display: none; }
.tr-fh { font-size: 20px; color: ${INK}; margin: 16px 0 8px; text-align: center; animation: tr-up .4s ease var(--fh, 1s) both; }
.tr-fh span { color: #9a7a5c; font-size: .85em; }
.tr-stk { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 10px 14px; }
.tr-s { display: flex; flex-direction: column; align-items: center; text-align: center; pointer-events: auto; }
.tr-sx { transition: transform .3s cubic-bezier(.2,1.8,.4,1); }
.tr-s:hover .tr-sx { transform: scale(1.14) rotate(9deg); }
.tr-seal { position: relative; width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; transform: rotate(var(--r));
  background: radial-gradient(circle at 34% 28%, rgba(255,255,255,.28), rgba(255,255,255,0) 45%), var(--c);
  box-shadow: 0 3px 5px rgba(50,35,25,.3), inset 0 0 0 5px var(--c), inset 0 0 0 7px rgba(251,245,232,.75);
  color: #fbf5e8; font-size: 23px; line-height: .95; text-shadow: 0 1px 1px rgba(30,20,15,.35);
  animation: tr-slam .52s cubic-bezier(.3,.7,.4,1) var(--t) both; }
.tr-seal small { display: block; font-size: 13px; opacity: .9; }
@keyframes tr-slam {
  0% { opacity: 0; transform: scale(2.8) rotate(calc(var(--r) + 30deg)); }
  50% { opacity: 1; transform: scale(.86) rotate(var(--r)); }
  72% { transform: scale(1.07) rotate(var(--r)); }
  100% { transform: rotate(var(--r)); } }
.tr-cap { margin-top: 7px; font-size: 16px; line-height: 1.12; animation: tr-up .45s ease calc(var(--t) + .22s) both; }
.tr-cap b { font-weight: inherit; color: ${INK}; user-select: text; }
@keyframes tr-up { from { opacity: 0; transform: translateY(8px); } }

/* music notes drift up beside the welcome and goodbye notes */
.tr-amb { position: absolute; inset: 0; pointer-events: none; display: none; }
.tr-stage[data-amb] .tr-amb { display: block; }
.tr-amb i { position: absolute; bottom: 10%; left: var(--x); font-style: normal; font-family: serif; font-size: var(--s); color: var(--c);
  opacity: 0; text-shadow: 0 0 6px rgba(251,245,232,.7); animation: tr-rise var(--d) ease-in var(--o) infinite; }
@keyframes tr-rise { 0% { opacity: 0; transform: translate(0, 0) rotate(-12deg); } 15% { opacity: .95; }
  100% { opacity: 0; transform: translate(var(--dx), -300px) rotate(18deg); } }

/* the words float in the shop, not on the paper: each bobs on its own, out of step with the others */
.tr-float { position: relative; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 14px 18px;
  margin-top: 22px; font-size: 30px; transform-style: preserve-3d; }
.tr-stage[data-list] .tr-float { flex-direction: column; align-items: flex-end; width: max-content; margin-left: auto; margin-right: auto; }
.tr-brk { flex-basis: 100%; height: 0; }
.tr-stage[data-at="player"] .tr-float { justify-content: flex-start; margin-top: 12px; font-size: 26px; }
.tr-b { display: inline-flex; align-items: center; gap: 8px; pointer-events: auto; transform: translateY(0) rotate(var(--r, 0deg));
  animation: tr-bob var(--d, 3.2s) ease-in-out var(--o, 0s) infinite alternate; }
.tr-b.pop { animation: tr-pop .6s cubic-bezier(.2,1.6,.4,1) both, tr-bob var(--d, 3.2s) ease-in-out .6s infinite alternate; }
@keyframes tr-bob { from { transform: translateY(-5px) rotate(var(--r, 0deg)); } to { transform: translateY(6px) rotate(calc(var(--r, 0deg) * -0.6)); } }
@keyframes tr-pop { from { opacity: 0; transform: translateY(26px) scale(.5) rotate(calc(var(--r, 0deg) * 4)); } }
.tr-b .st-w { font-size: inherit; transition: transform .25s cubic-bezier(.2,1.8,.4,1); }
.tr-b .st-w:hover { transform: translateY(-3px) rotate(-2.5deg) scale(1.1); }
.tr-b .st-w:active { transform: scale(.92); transition-duration: .06s; }
.tr-b .st-w.big { font-size: 1.2em; }
.tr-key { display: inline-flex; align-items: center; gap: 8px; }
.tr-kname { font-size: 24px; color: #fbf5e8; text-shadow: 0 1px 3px rgba(30,20,15,.85), 0 0 8px rgba(30,20,15,.5); }
.tr-tick { font-size: 46px; font-weight: bold; color: ${HOT}; opacity: 0; transform: scale(.3) rotate(-25deg); transition: transform .35s cubic-bezier(.2,1.8,.4,1), opacity .2s; text-shadow: 0 1px 2px rgba(251,245,232,.9); }
.tr.away .tr-stage:not(.tr-ghost) .tr-note { opacity: .5; }
.tr-tick.on { opacity: 1; transform: scale(1) rotate(-8deg); }
.tr-msg { position: relative; min-height: 1.2em; color: #a0442c; font-size: 18px; margin-top: 6px; }

/* the note before, flicked off to one side */
.tr-ghost { position: absolute; margin: 0; pointer-events: none !important; animation: tr-toss .6s cubic-bezier(.55,0,.8,.3) forwards; }
.tr-ghost * { animation: none !important; transition: none !important; pointer-events: none !important; }
.tr-ghost .tr-note { opacity: 1; }
@keyframes tr-toss { to { opacity: 0; transform: translate(var(--tx), 26vh) rotate(var(--tr)) scale(.82); } }

/* where you are: a row of little records, the one playing spins */
.tr-prog { position: absolute; bottom: 3vh; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 9px; }
.tr-p { position: relative; width: 16px; height: 16px; border-radius: 50%; opacity: .45; transition: opacity .3s, transform .4s cubic-bezier(.2,1.8,.4,1);
  background: radial-gradient(circle, #fbf5e8 0 9%, var(--pl, #9a8f86) 10% 34%, #141216 35%), repeating-radial-gradient(circle, #1c191f 0 1px, #2c2830 1px 2px);
  box-shadow: 0 1px 3px rgba(30,20,15,.5); }
.tr-p.done { opacity: .95; --pl: ${INK}; }
.tr-p.now { opacity: 1; --pl: ${HOT}; transform: scale(1.55); animation: tr-spin 1.4s linear infinite; }
.tr-p.now::after { content: ''; position: absolute; width: 2px; height: 2px; border-radius: 50%; background: #fbf5e8; top: 22%; left: 48%; }
.tr-pl { margin-left: 8px; font-size: 19px; color: #fbf5e8; text-shadow: 0 1px 3px rgba(30,20,15,.85), 0 0 8px rgba(30,20,15,.5); white-space: nowrap; }

.tr.still, .tr.still * { transition: none !important; animation: none !important; }
.tr.still .tr-amb { display: none; }
@media (prefers-reduced-motion: reduce) {
  .tr-b, .tr-b.pop, .tr-ch, .tr-wd, .tr-seal, .tr-cap, .tr-fh, .tr-disc, .tr-vinyl, .tr-sw path, .tr-p.now { animation: none !important; }
  .tr-amb { display: none !important; }
  .tr-note.in { animation: tr-fade .25s ease both; }
  .tr-tick { transition: opacity .2s ease; }
}
@keyframes tr-fade { from { opacity: 0; } }
`;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function save(rec) {
  try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* not remembered: it just starts again next time */ }
}
// A Sienna (or Cadence) install from before the tour: it has saved settings
function oldInstall() {
  try { return localStorage.getItem('sienna.settings') != null || localStorage.getItem('cadence.settings') != null; } catch { return false; }
}

// music: the backend (src/music.js). goHome(): walk the camera back to the entrance.
export function createTour({ music, goHome = () => {}, isSearchOpen = () => false, playerBox = () => null } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const params = new URLSearchParams(location.search);
  const forced = params.get('tour');
  const fresh = forced === 'new';   // ?tour=new: as on a new install, saved as it goes (scripts/tour-check.mjs)
  const preview = forced != null && forced !== '0' && !fresh;   // a step for a screenshot: shown, never saved
  let rec = load();
  // Who gets it on their own: a new install of the real app, not a check script
  if (!rec && !fresh && (oldInstall() || !music.real || navigator.webdriver || forced === '0')) {
    rec = { step: 0, done: true };
    if (music.real && !navigator.webdriver && forced !== '0') save(rec);
  }
  if (preview) {
    const n = Number(forced);
    rec = { step: Number.isInteger(n) ? Math.min(Math.max(n, 0), STEPS.length - 1) : Math.max(0, STEPS.indexOf(forced)), done: false };
  }
  rec ??= { step: 0, done: false };
  const remember = () => { if (!preview) save(rec); };

  // ---- the page: SKIP TOUR at the top, the note, and the floating words under it ----
  const root = document.createElement('div');
  root.className = 'tr';
  root.innerHTML = '<div class="tr-stage"><div class="tr-amb"></div><div class="tr-note"><div class="tr-disc"><div class="tr-vinyl"><div class="tr-lab"><span></span></div></div></div>'
    + '<div class="tr-sh"><div class="tr-paper"></div></div><div class="tr-tape"></div><div class="tr-title"></div><div class="tr-body"></div><div class="tr-fine"></div><div class="tr-msg"></div></div>'
    + '<div class="tr-float"></div></div><div class="tr-prog"></div>';
  const still = params.has('shot');
  if (still) root.classList.add('still');   // screenshots: no fades, no bobbing, no particles
  document.body.appendChild(root);
  const fx = createFx({ still });
  const stage = root.querySelector('.tr-stage');
  const note = root.querySelector('.tr-note');
  const paper = root.querySelector('.tr-paper');
  const disc = root.querySelector('.tr-disc'), lab = root.querySelector('.tr-lab');
  // the notes drifting up beside the welcome and goodbye notes, each on its own path and beat
  root.querySelector('.tr-amb').innerHTML = Array.from({ length: 10 }, (_, k) => {
    const side = k % 2 ? 1 : -1;
    const x = side < 0 ? -10 + ((k * 7) % 12) : 98 + ((k * 5) % 12);
    return `<i style="--x:${x}%;--s:${20 + ((k * 11) % 16)}px;--c:${COLOURS[k % COLOURS.length]};--d:${4.2 + ((k * 13) % 9) * 0.3}s;--o:${-k * 0.7}s;--dx:${side * (10 + ((k * 17) % 40))}px">${'♪♫♩♬'[k % 4]}</i>`;
  }).join('');
  // the row of little records at the bottom, one per step
  const prog = root.querySelector('.tr-prog');
  const dots = STEPS.map(() => prog.appendChild(Object.assign(document.createElement('i'), { className: 'tr-p' })));
  const progLabel = prog.appendChild(Object.assign(document.createElement('span'), { className: 'tr-pl' }));
  const titleEl = root.querySelector('.tr-title'), bodyEl = root.querySelector('.tr-body'), fineEl = root.querySelector('.tr-fine'), msgEl = root.querySelector('.tr-msg');
  const floatEl = root.querySelector('.tr-float');
  const skipWrap = document.createElement('div');
  skipWrap.className = 'tr-skip';
  const skip = word('Skip tour', 53, () => finish());
  skipWrap.appendChild(skip);
  root.appendChild(skipWrap);
  note.addEventListener('click', (e) => e.stopPropagation());

  let words = [skip];
  const paintAll = () => words.forEach((w) => w.paint());
  document.fonts?.addEventListener?.('loadingdone', paintAll);
  onLettering(root, paintAll); // Settings > Lettering

  // a floating word: bobbing out of step with the others, a little tilted; `big` for the main choice
  let seed = 200;
  function float(text, onClick, { on = false, big = false, font = null, extra = null } = {}) {
    const w = word(text, seed += 7, () => {
      fx.burst(w, big ? { count: 26, power: 560 } : { count: 16, power: 380, kinds: ['splat', 'strip'], colours: [HOT, '#d9a441', INK] });
      onClick();
    });
    if (on) w.classList.add('on');
    if (big) w.classList.add('big');
    if (font) w.style.fontFamily = font;
    const b = document.createElement('span');
    b.className = 'tr-b pop';
    const k = words.length;
    b.style.setProperty('--r', `${(((k * 37) % 9) - 4) * 0.6}deg`);
    b.style.setProperty('--d', `${2.6 + ((k * 13) % 7) * 0.25}s`);
    b.style.setProperty('--o', `${-((k * 0.71) % 2.4)}s`);
    b.style.animationDelay = `${k * 0.06}s, ${0.5 + k * 0.06}s`;
    if (extra) b.append(...extra(w));
    else b.appendChild(w);
    floatEl.appendChild(b);
    words.push(w);
    return w;
  }

  const brk = () => floatEl.appendChild(Object.assign(document.createElement('span'), { className: 'tr-brk' }));

  let at = -1;           // index into STEPS of the step on screen, -1 none
  let started = false;   // the intro has reached home and the tour is running
  let player = null;     // the newest player state
  let stepVideo = null;  // the song at the start of the record step
  let onKey = null;      // the step's own key handler (Enter)
  let cleanup = [];
  // a timeout that is called off when the step changes
  const later = (fn, ms) => { const id = setTimeout(fn, ms); cleanup.push(() => clearTimeout(id)); };

  function show(on) { root.classList.toggle('show', on); }

  // Write a step: where it sits, its words, its floating buttons
  function render() {
    for (const fn of cleanup) fn();
    cleanup = [];
    onKey = null;
    floatEl.replaceChildren();
    words = [skip];
    msgEl.textContent = '';
    fineEl.replaceChildren();
    delete stage.dataset.list;
    delete stage.dataset.amb;
    note.classList.remove('in');
    const name = STEPS[at];
    STEP[name]();
    paper.style.clipPath = torn(31 + at * 5, 6);
    // the record behind the note slides out again, with this step's number on its label
    lab.firstChild.textContent = at + 1;
    lab.style.setProperty('--lab', COLOURS[at % COLOURS.length]);
    disc.style.animation = 'none';
    void disc.offsetWidth;
    disc.style.animation = '';
    dots.forEach((d, i) => { d.className = `tr-p${i < at ? ' done' : i === at ? ' now' : ''}`; });
    progLabel.textContent = `Track ${at + 1} of ${STEPS.length}`;
    requestAnimationFrame(() => {
      note.classList.add('in');
      paintAll();
      requestAnimationFrame(paintAll);
    });
    place();
    // a few notes pop out of the record as it comes out
    later(() => fx.burst(disc, { count: 6, kinds: ['note'], power: 220, angle: -Math.PI / 2, spread: 0.9 }), 950);
  }
  // the title falls in letter by letter (*word* is painted terracotta) and the body inks in word by word
  function text(title, body) {
    const tt = Object.assign(document.createElement('span'), { className: 'tr-tt' });
    let i = 0;
    title.split(' ').forEach((w, n) => {
      if (n) tt.append(' ');
      const hot = /^\*.*\*$/.test(w);
      const ws = Object.assign(document.createElement('span'), { className: `tr-tw${hot ? ' hot' : ''}` });
      for (const c of hot ? w.slice(1, -1) : w) {
        const ch = Object.assign(document.createElement('span'), { className: 'tr-ch', textContent: c });
        ch.style.setProperty('--i', i);
        ch.style.setProperty('--k', ((i * 53 + at * 7) % 41) - 20);
        i++;
        ws.append(ch);
      }
      tt.append(ws);
    });
    tt.insertAdjacentHTML('beforeend', '<svg class="tr-sw" viewBox="0 0 200 12" preserveAspectRatio="none"><path pathLength="1" d="M3 8 C 40 3, 70 11, 110 6 S 170 3, 197 7"/></svg>');
    tt.lastChild.style.setProperty('--sd', `${0.3 + i * 0.03}s`);
    titleEl.replaceChildren(tt);
    titleEl.setAttribute('aria-label', title.replaceAll('*', ''));
    bodyEl.innerHTML = body;
    return inkIn(bodyEl, 0.25 + i * 0.02);
  }
  // wrap each word of el in a span that fades in after the one before; returns when the last is in (s)
  function inkIn(el, start) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    let n = 0;
    for (const t of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of t.textContent.split(/(\s+)/)) {
        if (!part.trim()) { frag.append(part); continue; }
        const s = Object.assign(document.createElement('span'), { className: 'tr-wd', textContent: part });
        s.style.setProperty('--i', n++);
        s.style.setProperty('--w0', `${start}s`);
        frag.append(s);
      }
      t.replaceWith(frag);
    }
    return start + n * 0.015 + 0.3;
  }
  const where = (w) => { root.dataset.at = w; stage.dataset.at = w; };
  const next = () => go(at + 1);
  // the choices of one setting, as floating words; the chosen one is painted terracotta
  function choices(key, opts) {
    const ws = opts.map(([label, value, font]) => float(label, () => settings.set(key, value), { on: settings.get(key) === value, font }));
    const mark = () => ws.forEach((w, i) => w.classList.toggle('on', opts[i][1] === settings.get(key)));
    cleanup.push(settings.on(key, mark));
  }

  const STEP = {
    welcome() {
      where('centre');
      stage.dataset.amb = '';
      const signedIn = !!player?.signedIn && !params.has('guest');   // ?guest: the guest note in a shot (the fake store is signed in)
      const end = text('Welcome to *Sienna*', signedIn
        ? 'A little record shop for your YouTube Music. You are signed in, so the shelves are already yours: your mixes, your albums, what you played last.'
        : 'A little record shop for your YouTube Music. Sign in and the shelves fill with your own records: your mixes, your albums, what you played last. Or look around as a guest first.');
      // the small print, as four price stickers slapped on one after another, each landing with a thud
      fineEl.innerHTML = `<div class="tr-fh" style="--fh:${end.toFixed(2)}s">The small print <span>(it's short, promise)</span></div><div class="tr-stk"></div>`;
      const stk = fineEl.querySelector('.tr-stk');
      SEALS.forEach(([big, small, colour, caption], i) => {
        const t = end + 0.25 + i * 0.24;
        const s = document.createElement('div');
        s.className = 'tr-s';
        s.style.setProperty('--t', `${t.toFixed(2)}s`);
        s.innerHTML = `<div class="tr-sx"><div class="tr-seal" style="--c:${colour};--r:${[-8, 6, -4, 9][i]}deg">
          <span>${big}${small ? `<small>${small}</small>` : ''}</span></div></div><div class="tr-cap">${caption}</div>`;
        stk.appendChild(s);
        later(() => {
          if (!fx.calm) note.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 200, composite: 'add' });
        }, (t + 0.26) * 1000);
      });
      stk.querySelector('.tr-src').innerHTML = SOURCE.replace('/', '/<wbr>');   // breaks after github.com/ if it must
      // and a burst of paint and music as the note lands
      later(() => fx.burst(note, { count: 70, power: 950, kinds: ['splat', 'strip', 'note', 'disc'] }), 380);
      if (signedIn) {
        float("Let's go", next, { big: true });
      } else {
        float('Sign in', () => {
          music.signIn();
          msgEl.textContent = 'Finish signing in in the Google window. The shelves fill as soon as you are in.';
        }, { big: true });
        float('Look around first', next);
      }
      onKey = (e) => { if (e.key === 'Enter') { signedIn ? next() : music.signIn(); return true; } };
    },
    paint() {
      where('upper');
      text('Make it yours', 'How should the shop be painted? Try them: the shop changes behind this note as you pick.');
      choices('paint', [['Brush strokes', 4], ['Heavy watercolour', 3], ['Medium watercolour', 2], ['Light watercolour', 1]]);
      brk();
      float('Next', next, { big: true });
      onKey = (e) => { if (e.key === 'Enter') { next(); return true; } };
    },
    letters() {
      where('upper');
      text('And the handwriting?', 'The lettering on the tags, the sign and every button. Picking one repaints the shop, so it blinks for a moment.');
      choices('font', Object.entries(FONTS).map(([k, f]) => [f.label, k, f.family]));
      brk();
      float('Next', next, { big: true });
      onKey = (e) => { if (e.key === 'Enter') { next(); return true; } };
    },
    smooth() {
      where('upper');
      text('Smooth or cool?', '60 frames a second is smoothest. 30 keeps a laptop cooler and its battery going longer. Either way the shop rests when nothing moves.');
      choices('maxFps', [['60 fps, smooth', 60], ['30 fps, cooler', 30]]);
      brk();
      float('Next', next, { big: true });
      onKey = (e) => { if (e.key === 'Enter') { next(); return true; } };
    },
    record() {
      where('top');
      stepVideo = player?.videoId ?? null;
      text('Now pick a record', 'Click a shelf name on either side and walk over to it. Rest the cursor on a record to lift it, click to play it. <b>Tab</b> walks to the next shelf, <b>Esc</b> comes back to the door.');
    },
    player() {
      where('player');
      text('Your record player', `The knob is the volume: drag it, scroll, or press <b>↑ ↓</b>.${mac
        ? " It turns your Mac's own volume, the same one the volume keys change, so it can go louder than the player alone could."
        : ''} Drag the record to jump through the song. <b>Space</b> pauses, <b>← →</b> go back and skip, <b>L</b> likes it.`);
      float('Got it', next, { big: true });
      onKey = (e) => { if (e.key === 'Enter') { next(); return true; } };
    },
    keys() {
      where('upper');
      text('Sienna from anywhere', 'The mini player and the way back to the shop work from any app, search works in Sienna. Try each one now: it gets a tick. Click a shortcut to change it to keys you like better.');
      stage.dataset.list = '';
      const used = new Set();
      const ticks = {};
      const keyWords = {};
      const tick = (name) => {
        if (STEPS[at] !== 'keys') return;
        if (!used.has(name) && ticks[name]) later(() => fx.burst(ticks[name], { count: 22, power: 420, colours: [HOT, '#d9a441', '#6f8f5c'] }), 60);
        used.add(name);
        ticks[name]?.classList.add('on');
      };
      for (const [name, label] of [['mini', 'Mini player, over any app'], ['search', 'Search'], ['app', 'Back to the shop']]) {
        keyWords[name] = float(shortcuts.label(name), () => change(name), {
          extra: (w) => {
            const n = Object.assign(document.createElement('span'), { className: 'tr-kname', textContent: label });
            const t = Object.assign(document.createElement('span'), { className: 'tr-tick', textContent: '✓' });
            ticks[name] = t;
            const row = Object.assign(document.createElement('span'), { className: 'tr-key' });
            row.append(n, w, t);
            return [row];
          },
        });
      }
      float('Next', next, { big: true });
      const relabel = () => {
        for (const [name, w] of Object.entries(keyWords)) {
          w.querySelector('span').textContent = shortcuts.recording && recordingName === name ? 'Press keys…' : shortcuts.label(name);
          w.classList.toggle('on', shortcuts.recording && recordingName === name);
          requestAnimationFrame(() => w.paint());
        }
      };
      let recordingName = null;
      function change(name) {
        if (shortcuts.recording) { shortcuts.cancelRecording(); return; }
        recordingName = name;
        msgEl.textContent = 'Press the keys you want, or Esc to keep it.';
        relabel();
        shortcuts.record(name).then((r) => {
          recordingName = null;
          msgEl.textContent = !r || r.ok ? ''
            : r.error === 'clash' ? 'That one is already taken by another of the three.'
            : r.error === 'taken' ? 'Another app already uses that, or the system keeps it. Try another.'
            : 'That cannot be used as a shortcut.';
          relabel();
        });
      }
      cleanup.push(shortcuts.on(relabel), () => { if (shortcuts.recording) shortcuts.cancelRecording(); });
      keysUsed = tick;
      cleanup.push(() => { keysUsed = null; });
      onKey = (e) => { if (e.key === 'Enter') { next(); return true; } };
    },
    bye() {
      where('centre');
      stage.dataset.amb = '';
      later(() => fx.cannons(55), 350);
      text("The shop is *yours*", `Close the window and the music keeps going: Sienna stays in the ${mac ? 'menu bar' : 'tray'}, the little record in a sleeve.
        <b>${mac ? '⌘' : 'Ctrl'} ,</b> opens Settings any time, and this tour is in there too.`);
      const enjoy = () => { fx.cannons(80); fx.burst(note, { count: 60, power: 1000, kinds: ['note', 'splat', 'disc'] }); finish(); };
      float('Enjoy', enjoy, { big: true });
      onKey = (e) => { if (e.key === 'Enter') { enjoy(); return true; } };
    },
  };

  // the global shortcuts come from the main process; search is seen opening (main.js calls update)
  let keysUsed = null;
  shortcuts.onUsed((name) => keysUsed?.(name));
  let searchWas = false;

  // the note on screen, copied and flicked off to one side while the next one drops in
  let flick = 1;
  function toss() {
    if (fx.calm || at < 0 || !root.classList.contains('show')) return;
    const r = stage.getBoundingClientRect();
    const g = stage.cloneNode(true);
    g.classList.add('tr-ghost');
    flick = -flick;
    g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;--tx:${flick * 34}vw;--tr:${flick * 22}deg`;
    root.appendChild(g);
    setTimeout(() => g.remove(), 700);
  }

  function go(i) {
    if (i >= STEPS.length) { finish(); return; }
    toss();
    at = i;
    rec = { step: i, done: false };
    remember();
    render();
    show(true);
  }
  function finish() {
    for (const fn of cleanup) fn();
    cleanup = [];
    at = -1;
    rec = { step: 0, done: true };
    remember();
    show(false);
  }

  // the note leans toward the cursor (cursortilt.js runs its own easing, so it turns even while the shop's
  // camera holds still for a record at a rack)
  let leanX = 0, leanY = 0;
  function lean() {
    if (at < 0) return;
    stage.style.transform = `${STEPS[at] === 'player' ? '' : 'translate(-50%, 0) '}${stage.dataset.at === 'centre' ? 'translateY(-50%) ' : ''}${tiltCSS(leanX, leanY, 9)}`;
  }
  onCursorTilt((x, y) => { leanX = x; leanY = y; lean(); });

  // where the note sits; the player note stands just above the suitcase
  function place() {
    if (STEPS[at] !== 'player') { stage.style.left = stage.style.bottom = ''; return; }
    const r = playerBox();
    // beside the case, on its right, standing on the same floor line (above it there are the shelf words)
    stage.style.left = `${Math.max(16, r ? r.right + 18 : 360)}px`;
    stage.style.bottom = `${Math.max(16, r ? innerHeight - r.bottom + 10 : 40)}px`;
  }

  // Keys while a note is up: Enter does its main thing, Esc ends the tour, and the shop's own keys
  // (Space, Tab, arrows) stay quiet so they do not move things behind the note. Shortcuts with
  // Control / Option / Command pass, so the search key and Settings still work. The record step is a
  // hint over a usable shop, so it leaves every key alone.
  addEventListener('keydown', (e) => {
    if (at < 0 || shortcuts.recording || isSearchOpen()) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (STEPS[at] === 'record') return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(); return; }
    if (onKey?.(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (STEPS[at] === 'player') return;   // the player keys are what that note is about: let them work
    if (!['Shift', 'CapsLock'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  addEventListener('resize', () => { if (at >= 0) place(); });

  return {
    // the player's newest state (main.js passes every one on)
    setState(s) {
      const wasIn = !!player?.signedIn;
      player = s;
      if (STEPS[at] === 'welcome' && s.signedIn && !wasIn && music.real) next();
      if (STEPS[at] === 'record' && s.videoId && s.videoId !== stepVideo && (s.playerState === 1 || s.playerState === 3)) {
        fx.burst([innerWidth / 2, innerHeight * 0.3], { count: 50, power: 800, kinds: ['note', 'disc', 'strip'] });
        next();
      }
    },
    // every frame. ui: the intro is over and the shop's own words are showing. tx, ty: unused (the note's lean
    // comes from cursortilt.js now; kept so main.js's call stays the same)
    // atHome: the camera is at the door (away from it, the record note fades so the racks show through)
    update(ui, tx = 0, ty = 0, atHome = true) {
      if (!started && ui && !rec.done) {
        started = true;
        // already signed in before the tour ever showed (an install that kept its sign-in): it does not need one
        if (!preview && !fresh && !load() && player?.signedIn && music.real) { finish(); return; }
        go(rec.step);
      }
      if (at < 0) return;
      const open = isSearchOpen();
      if (open && !searchWas) keysUsed?.('search');
      searchWas = open;
      if (STEPS[at] === 'player') place();
      root.classList.toggle('away', STEPS[at] === 'record' && !atHome);
      lean();
    },
    // Settings > Tour: from the start, at the door
    restart() {
      started = true;
      goHome();
      go(0);
    },
    get active() { return at >= 0; },
    get step() { return at >= 0 ? STEPS[at] : null; },
    // the player note wants the suitcase up, even at a rack where it would tuck away
    get wantsPlayer() { return STEPS[at] === 'player'; },
  };
}
