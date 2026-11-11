// The first-run tour: torn paper notes in the shop, with brush-stroke words floating under them, the same
// paper and words as the Settings card. It starts once the intro reaches home on a new install, and each
// step ends when you have done the thing it is about (signed in, played a record, pressed a shortcut).
//
//   welcome  sign in, or look around first; small print on ads, money, data and the source code
//   paint    how the shop is painted          } choices apply at once, so the shop behind the note
//   letters  the handwriting (page reloads)   } shows each one; they are the Settings card's choices,
//   smooth   60 or 30 fps                     } just floating in the shop
//   record   pick a record (a small note at the top, the shop stays usable)
//   player   the suitcase: volume is the Mac's own, scrubbing, keys (a note above the case)
//   keys     the three shortcuts: each is ticked when pressed, a click on one changes it
//   bye      the menu bar, Settings, and this tour again
//
// SKIP TOUR (top) or Esc ends it. Where it got to is saved after every step (localStorage 'sienna.tour'),
// so quitting half-way, or the reload a new lettering needs, carries on from there. Installs from before
// the tour (saved settings, or already signed in) never get it on their own: Settings > Tour starts it.
// Not on its own in a plain browser (fake store) or under automation (navigator.webdriver), so the check
// scripts see the shop as before. ?tour=0 keeps it away; ?tour=<step name or number> shows that step
// without saving anything; ?tour=new runs it as on a new install (screenshots: SIENNA_QUERY="at=home&tour=keys" node scripts/shot.mjs out 3; add &guest for
// the welcome note as a guest sees it, since the fake store counts as signed in).
import { settings } from './settings.js';
import { shortcuts } from './shortcuts.js';
import { torn, word } from './settings-panel.js';
import { FONT, FONTS } from './style.js';
import { INK, HOT } from './controls.js';

const KEY = 'sienna.tour';
const STEPS = ['welcome', 'paint', 'letters', 'smooth', 'record', 'player', 'keys', 'bye'];
const SOURCE = 'github.com/lajoonpark/Sienna';
const mac = /Mac/.test(navigator.platform);

const CSS = `
.tr { position: fixed; inset: 0; z-index: 8; pointer-events: none; font-family: ${FONT}; color: #2b2436; perspective: 1100px;
  opacity: 0; visibility: hidden; transition: opacity .45s ease, visibility 0s .45s; }
.tr.show { opacity: 1; visibility: visible; transition: opacity .45s ease; }
.tr-skip { position: absolute; top: 3.4vh; left: 50%; transform: translateX(-50%); font-size: 22px; pointer-events: auto; opacity: .85; }
.tr-skip:hover { opacity: 1; }
.tr-stage { position: absolute; left: 50%; top: 50%; width: min(620px, 92vw); transform-style: preserve-3d; will-change: transform;
  display: flex; flex-direction: column; align-items: center; }
.tr[data-at="upper"] .tr-stage { top: 9vh; }
.tr[data-at="top"] .tr-stage { top: 11vh; width: min(560px, 88vw); }
.tr[data-at="player"] .tr-stage { left: auto; top: auto; width: min(430px, 60vw); align-items: flex-start; }
.tr-note { position: relative; box-sizing: border-box; width: 100%; padding: 22px 30px 18px; filter: drop-shadow(0 6px 10px rgba(50,35,25,.25));
  transform: translateY(16px) rotate(-1.6deg) scale(.95); opacity: 0; transition: transform .5s cubic-bezier(.2,1.5,.4,1), opacity .3s ease; }
.tr-note.in { transform: rotate(-.6deg); opacity: 1; }
.tr-paper { position: absolute; inset: 0; background: #f4ead6; }
.tr-title { position: relative; font-size: 40px; line-height: 1; color: ${INK}; margin: 0 0 8px; }
.tr-body { position: relative; font-size: 24px; line-height: 1.15; }
.tr-body b { font-weight: inherit; color: ${HOT}; }
.tr-fine { position: relative; font-size: 17px; line-height: 1.2; color: #7a5a40; margin-top: 12px; }
.tr-fine b { font-weight: inherit; color: ${INK}; user-select: text; pointer-events: auto; }
.tr[data-at="top"] .tr-title { font-size: 32px; }
.tr[data-at="top"] .tr-body, .tr[data-at="player"] .tr-body { font-size: 21px; }
/* the words float in the shop, not on the paper: each bobs on its own, out of step with the others */
.tr-float { position: relative; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 14px 18px;
  margin-top: 22px; font-size: 30px; transform-style: preserve-3d; }
.tr[data-list] .tr-float { flex-direction: column; align-items: flex-end; width: max-content; margin-left: auto; margin-right: auto; }
.tr-brk { flex-basis: 100%; height: 0; }
.tr[data-at="player"] .tr-float { justify-content: flex-start; margin-top: 12px; font-size: 26px; }
.tr-b { display: inline-flex; align-items: center; gap: 8px; pointer-events: auto; transform: translateY(0) rotate(var(--r, 0deg));
  animation: tr-bob var(--d, 3.2s) ease-in-out var(--o, 0s) infinite alternate; }
.tr-b.pop { animation: tr-pop .5s cubic-bezier(.2,1.6,.4,1) both, tr-bob var(--d, 3.2s) ease-in-out .5s infinite alternate; }
@keyframes tr-bob { from { transform: translateY(-5px) rotate(var(--r, 0deg)); } to { transform: translateY(6px) rotate(calc(var(--r, 0deg) * -0.6)); } }
@keyframes tr-pop { from { opacity: 0; transform: translateY(18px) scale(.7) rotate(var(--r, 0deg)); } }
.tr-b .st-w { font-size: inherit; }
.tr-b .st-w.big { font-size: 1.2em; }
.tr-key { display: inline-flex; align-items: center; gap: 8px; }
.tr-kname { font-size: 24px; color: #fbf5e8; text-shadow: 0 1px 3px rgba(30,20,15,.85), 0 0 8px rgba(30,20,15,.5); }
.tr-tick { font-size: 46px; font-weight: bold; color: ${HOT}; opacity: 0; transform: scale(.3) rotate(-25deg); transition: transform .35s cubic-bezier(.2,1.8,.4,1), opacity .2s; text-shadow: 0 1px 2px rgba(251,245,232,.9); }
.tr.away .tr-note { opacity: .5; }
.tr-tick.on { opacity: 1; transform: scale(1) rotate(-8deg); }
.tr-msg { position: relative; min-height: 1.2em; color: #a0442c; font-size: 18px; margin-top: 6px; }
.tr.still, .tr.still * { transition: none !important; animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  .tr-b, .tr-b.pop { animation: none; }
  .tr-note, .tr-tick { transition: opacity .2s ease; }
}
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
  root.innerHTML = '<div class="tr-stage"><div class="tr-note"><div class="tr-paper"></div><div class="tr-title"></div><div class="tr-body"></div><div class="tr-fine"></div><div class="tr-msg"></div></div><div class="tr-float"></div></div>';
  if (params.has('shot')) root.classList.add('still');   // screenshots: no fades, no bobbing
  document.body.appendChild(root);
  const stage = root.querySelector('.tr-stage');
  const note = root.querySelector('.tr-note');
  const paper = root.querySelector('.tr-paper');
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

  // a floating word: bobbing out of step with the others, a little tilted; `big` for the main choice
  let seed = 200;
  function float(text, onClick, { on = false, big = false, font = null, extra = null } = {}) {
    const w = word(text, seed += 7, onClick);
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
    delete root.dataset.list;
    note.classList.remove('in');
    const name = STEPS[at];
    STEP[name]();
    paper.style.clipPath = torn(31 + at * 5, 6);
    requestAnimationFrame(() => {
      note.classList.add('in');
      paintAll();
      requestAnimationFrame(paintAll);
    });
    place();
  }
  const text = (title, body) => { titleEl.textContent = title; bodyEl.innerHTML = body; };
  const where = (w) => { root.dataset.at = w; };
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
      const signedIn = !!player?.signedIn && !params.has('guest');   // ?guest: the guest note in a shot (the fake store is signed in)
      text('Welcome to Sienna', signedIn
        ? 'A little record shop for your YouTube Music. You are signed in, so the shelves are already yours: your mixes, your albums, what you played last.'
        : 'A little record shop for your YouTube Music. Sign in and the shelves fill with your own records: your mixes, your albums, what you played last. Or look around as a guest first.');
      fineEl.innerHTML = `Sienna is free and open source, and makes no money at all. It has no servers and keeps nothing about you:
        signing in happens on Google's own page, between you and YouTube Music, and your settings stay on this computer.
        Unless you have YouTube Premium you will hear ads. YouTube Music chooses and plays them, not Sienna, and Sienna earns nothing from them.
        Don't take our word for it: every line of the code is at <b class="tr-src"></b>.`;
      fineEl.querySelector('.tr-src').textContent = SOURCE;
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
      root.dataset.list = '';
      const used = new Set();
      const ticks = {};
      const keyWords = {};
      const tick = (name) => {
        if (STEPS[at] !== 'keys') return;
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
      text("That's the shop", `Close the window and the music keeps going: Sienna stays in the ${mac ? 'menu bar' : 'tray'}, the little record in a sleeve.
        <b>${mac ? '⌘' : 'Ctrl'} ,</b> opens Settings any time, and this tour is in there too.`);
      float('Enjoy', () => finish(), { big: true });
      onKey = (e) => { if (e.key === 'Enter') { finish(); return true; } };
    },
  };

  // the global shortcuts come from the main process; search is seen opening (main.js calls update)
  let keysUsed = null;
  shortcuts.onUsed((name) => keysUsed?.(name));
  let searchWas = false;

  function go(i) {
    if (i >= STEPS.length) { finish(); return; }
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
      if (STEPS[at] === 'record' && s.videoId && s.videoId !== stepVideo && (s.playerState === 1 || s.playerState === 3)) next();
    },
    // every frame. ui: the intro is over and the shop's own words are showing. tx, ty: the cursor tilt, -1..1
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
      stage.style.transform = `${STEPS[at] === 'player' ? '' : 'translate(-50%, 0) '}${root.dataset.at === 'centre' ? 'translateY(-50%) ' : ''}rotateY(${tx * 5}deg) rotateX(${-ty * 4}deg)`;
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
