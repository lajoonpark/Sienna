// Settings: a SETTINGS word top-right (like HOME top-left) and Cmd+, (Ctrl+, elsewhere) open a
// torn paper card in the middle of the screen. Each setting is a row of brush-stroke words; the chosen
// one is painted terracotta. Changes apply at once and are remembered (settings.js).
// Esc, clicking outside the card, or DONE closes it. While it is open the shop's keys stay quiet
// (main.js checks isOpen()).
//
//   const panel = createSettingsPanel();   panel.open() / close() / toggle() / isOpen()
//
// Shot hook: ?settings opens it.
import { FONT, FONTS } from './style.js';
import { INK, HOT, PAPER, brushStroke } from './controls.js';
import { settings } from './settings.js';
import { shortcuts, fromEvent } from './shortcuts.js';
import { rng } from './rand.js';

// Settings > Painting: watercolour strength (LEVELS in watercolour.js), lightest first
const PAINT = ['Faint', 'Light', 'Medium', 'Heavy', 'Brush strokes'];

const CSS = `
.st-btn { position: fixed; top: 3.4vh; right: 2.6vw; z-index: 6; border: 0; padding: 0; background: none; cursor: pointer;
  font-family: ${FONT}; color: ${PAPER}; font-size: 26px; line-height: 1; user-select: none; opacity: 0; transition: opacity .6s ease, transform .18s cubic-bezier(.3,1.6,.5,1); }
.st-btn.show { opacity: .9; }
.st-btn:hover { opacity: 1; transform: translateX(-4px) rotate(1deg); }
.st-w { position: relative; display: inline-block; border: 0; padding: 0; background: none; cursor: pointer; font-family: ${FONT};
  font-size: inherit; color: ${PAPER}; line-height: 1; transition: transform .18s cubic-bezier(.3,1.6,.5,1); }
.st-w .plate { position: absolute; inset: 0; background-size: 100% 100%; transition: opacity .25s; }
.st-w .plate.hot { opacity: 0; }
.st-w:hover .plate.hot, .st-w.on .plate.hot { opacity: 1; }
.st-w:hover { transform: translateY(-2px) rotate(-1deg); }
.st-w span { position: relative; display: block; padding: .16em 1em .1em .7em; white-space: nowrap; text-shadow: 0 0 1px rgba(251,245,232,.7); }
.st-btn .st-w span { padding: .16em .7em .1em 1em; }
.st-btn .plate { transform: scaleX(-1); }
.st-veil { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center;
  background: rgba(60,45,35,.18); opacity: 0; visibility: hidden; transition: opacity .3s ease, visibility 0s .3s; }
.st-veil.show { opacity: 1; visibility: visible; transition: opacity .3s ease; }
.st-card { position: relative; width: min(920px, 94vw); max-height: 94vh; box-sizing: border-box; overflow-y: auto; padding: 30px 40px 26px; color: #2b2436;
  font-family: ${FONT}; filter: drop-shadow(0 6px 10px rgba(50,35,25,.25));
  transform: translateY(18px) rotate(-1.4deg) scale(.96); transition: transform .45s cubic-bezier(.2,1.5,.4,1); }
.st-veil.show .st-card { transform: rotate(-.5deg); }
.st-paper { position: absolute; inset: 0; background: #f4ead6; }
.st-head { position: relative; font-size: 42px; margin: 0 0 12px; color: ${INK}; }
.st-rows { position: relative; display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 0 36px; }
.st-row { position: relative; margin: 0 0 16px; }
.st-label { font-size: 30px; }
.st-hint { font-size: 19px; color: #7a5a40; margin: 2px 0 10px; }
.st-opts { display: flex; flex-wrap: wrap; gap: 6px 4px; font-size: 27px; }
.st-keys { grid-column: 1 / -1; }
.st-keys .st-opts { align-items: center; gap: 6px 4px; }
.st-kname { font-size: 24px; color: #5a4636; margin: 0 2px 0 14px; }
.st-kname:first-child { margin-left: 0; }
.st-keys .st-msg { min-height: 1.2em; color: #a0442c; }
.st-foot { position: relative; display: flex; justify-content: flex-end; font-size: 28px; }
`;

// A hand-torn outline as a CSS polygon (same idea as the search slips).
function torn(seed, amp = 5) {
  const r = rng(seed);
  const j = () => (r() * amp).toFixed(1);
  const pts = [];
  const n = 16;
  for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(1)}% ${j()}px`);
  for (let i = 1; i < 6; i++) pts.push(`calc(100% - ${j()}px) ${((i / 6) * 100).toFixed(1)}%`);
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(1)}% calc(100% - ${j()}px)`);
  for (let i = 5; i > 0; i--) pts.push(`${j()}px ${((i / 6) * 100).toFixed(1)}%`);
  return `polygon(${pts.join(',')})`;
}

// A word in a brush stroke. Plates are painted once the word has its real size (after fonts load).
function word(text, seed, onClick) {
  const el = document.createElement('button');
  el.className = 'st-w';
  el.tabIndex = -1;
  el.innerHTML = '<div class="plate"></div><div class="plate hot"></div><span></span>';
  el.querySelector('span').textContent = text;
  el.addEventListener('click', (e) => { e.stopPropagation(); el.blur(); onClick(); });
  let painted = '';
  el.paint = () => {
    const w = Math.ceil(el.offsetWidth), h = Math.ceil(el.offsetHeight);
    if (!w || !h || painted === `${w}x${h}`) return;
    painted = `${w}x${h}`;
    const [cold, hot] = el.querySelectorAll('.plate');
    cold.style.backgroundImage = `url(${brushStroke(w, h, INK, seed)})`;
    hot.style.backgroundImage = `url(${brushStroke(w, h, HOT, seed)})`;
  };
  return el;
}

export function createSettingsPanel() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // the SETTINGS word, top right
  const btnWrap = document.createElement('div');
  btnWrap.className = 'st-btn';
  const btn = word('Settings', 17, () => toggle());
  btnWrap.appendChild(btn);
  document.body.appendChild(btnWrap);

  // the card: one row per setting, each a row of brush-stroke words
  const ROWS = [
    { key: 'paint', label: 'Painting', hint: 'How much the colours run and pool, like wet paint.', opts: PAINT.map((l, i) => [l, i]) },
    { key: 'covers', label: 'Cover art', hint: 'How strongly album covers are painted over.', opts: ['Off', 'Light', 'Medium', 'Heavy'].map((l, i) => [l, i]) },
    { key: 'playOnArm', label: 'Start of a song', hint: 'Play when the arm touches the record and it spins, or straight away.', opts: [['When the arm lands', true], ['At once', false]] },
    { key: 'maxFps', label: 'Smoothness', hint: 'Frames per second at most. 30 runs cooler and saves battery.', opts: [['60 fps', 60], ['30 fps', 30]] },
    { key: 'font', label: 'Lettering', hint: 'The handwriting on tags, signs and buttons. The shop reloads.', opts: Object.entries(FONTS).map(([k, f]) => [f.label, k, f]) },
    { key: 'fps', label: 'Frame rate', hint: 'Show frames per second in the corner.', opts: [['Off', false], ['On', true]] },
  ];
  const veil = document.createElement('div');
  veil.className = 'st-veil';
  veil.innerHTML = `<div class="st-card"><div class="st-paper"></div><div class="st-head">Settings</div>
    <div class="st-rows">${ROWS.map(() => '<div class="st-row"><div class="st-label"></div><div class="st-hint"></div><div class="st-opts"></div></div>').join('')}</div>
    <div class="st-foot"></div></div>`;
  document.body.appendChild(veil);
  const card = veil.querySelector('.st-card');
  card.querySelector('.st-paper').style.clipPath = torn(7);
  card.addEventListener('click', (e) => e.stopPropagation());
  veil.addEventListener('click', () => close());

  const optWords = [];
  card.querySelectorAll('.st-row').forEach((rowEl, r) => {
    const row = ROWS[r];
    rowEl.querySelector('.st-label').textContent = row.label;
    rowEl.querySelector('.st-hint').textContent = row.hint;
    const box = rowEl.querySelector('.st-opts');
    const ws = row.opts.map(([label, value, font], i) => {
      const w = word(label, 23 + r * 13 + i * 5, () => settings.set(row.key, value));
      if (font) w.style.fontFamily = font.family; // each lettering choice is written in itself
      box.appendChild(w);
      optWords.push(w);
      return w;
    });
    const mark = () => ws.forEach((w, i) => w.classList.toggle('on', row.opts[i][1] === settings.get(row.key)));
    mark();
    settings.on(row.key, mark);
  });

  // Shortcuts: click one, then press the new keys (Esc cancels). The global ones are let go meanwhile
  // (shortcuts.pause), so pressing the current combination reaches this page instead of firing.
  const KEYS = [['search', 'Search'], ['app', 'Full app'], ['mini', 'Mini player']];
  const NAMES = Object.fromEntries(KEYS);
  const keysRow = document.createElement('div');
  keysRow.className = 'st-row st-keys';
  keysRow.innerHTML = '<div class="st-label">Shortcuts</div><div class="st-hint">Click one, then press the keys you want. Search works in the shop and the mini player; the other two work from any app.</div><div class="st-opts"></div><div class="st-hint st-msg"></div>';
  card.querySelector('.st-rows').appendChild(keysRow);
  const keysBox = keysRow.querySelector('.st-opts');
  const msg = keysRow.querySelector('.st-msg');
  let recording = null;   // name of the shortcut being recorded
  const keyWords = {};
  KEYS.forEach(([name, label], i) => {
    const n = document.createElement('span');
    n.className = 'st-kname';
    n.textContent = label;
    keysBox.appendChild(n);
    const w = word('', 91 + i * 7, () => (recording === name ? stopRecording() : startRecording(name)));
    keysBox.appendChild(w);
    keyWords[name] = w;
    optWords.push(w);
  });
  const resetWord = word('Reset', 117, () => { stopRecording(); shortcuts.reset().then(() => { msg.textContent = ''; }); });
  resetWord.style.marginLeft = '14px';
  keysBox.appendChild(resetWord);
  optWords.push(resetWord);
  function showKeys() {
    for (const [name] of KEYS) {
      const w = keyWords[name];
      w.querySelector('span').textContent = recording === name ? 'Press keys…' : shortcuts.label(name);
      w.classList.toggle('on', recording === name);
      requestAnimationFrame(() => w.paint());
    }
    const refused = KEYS.filter(([n]) => shortcuts.failed(n)).map(([, l]) => l);
    if (!recording && refused.length && !msg.dataset.sticky) msg.textContent = `${refused.join(' and ')}: another app already uses that shortcut. Pick another.`;
  }
  function startRecording(name) {
    recording = name;
    shortcuts.recording = true;
    shortcuts.pause(true);
    msg.textContent = ''; delete msg.dataset.sticky;
    showKeys();
  }
  function stopRecording() {
    if (!recording) return;
    recording = null;
    shortcuts.recording = false;
    shortcuts.pause(false);
    showKeys();
  }
  function record(e) {
    if (e.key === 'Escape') { stopRecording(); return; }
    const accel = fromEvent(e);
    if (!accel) return;   // only modifiers so far, or a bare key: keep listening
    const name = recording;
    recording = null;
    shortcuts.recording = false;
    shortcuts.set(name, accel).then((r) => {
      if (r?.ok) { msg.textContent = ''; delete msg.dataset.sticky; }
      else {
        msg.dataset.sticky = '1';
        msg.textContent = r?.error === 'clash' ? `That is already the ${NAMES[r.with]} shortcut.`
          : r?.error === 'taken' ? 'Another app already uses that, or the system keeps it. Try another.'
          : 'That cannot be used as a shortcut.';
      }
      showKeys();
    });
    showKeys();
  }
  showKeys();
  shortcuts.on(showKeys);

  const done = word('Done', 31, () => close());
  card.querySelector('.st-foot').appendChild(done);

  const words = [btn, ...optWords, done];
  const paintAll = () => words.forEach((w) => w.paint());
  document.fonts?.ready.then(paintAll);
  document.fonts?.addEventListener?.('loadingdone', paintAll); // the lettering choices load when first shown
  requestAnimationFrame(paintAll);

  let openNow = false;
  function open() {
    openNow = true;
    veil.classList.add('show');
    requestAnimationFrame(paintAll);
  }
  function close() {
    stopRecording();
    openNow = false;
    veil.classList.remove('show');
  }
  function toggle() { (openNow ? close : open)(); }

  // Cmd+, on macOS (the usual Preferences key), Ctrl+, elsewhere; Esc closes. Capture phase, so it
  // runs before the shop's own key handler and can swallow keys while the card is up.
  const mac = /Mac/.test(navigator.platform);
  addEventListener('keydown', (e) => {
    if (openNow && recording) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) record(e); return; }
    if (e.key === ',' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey) {
      e.preventDefault(); e.stopImmediatePropagation(); toggle(); return;
    }
    if (!openNow) return;
    if (e.key === 'Escape') close();
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  if (new URLSearchParams(location.search).has('settings')) open();

  return {
    open, close, toggle,
    isOpen: () => openNow,
    // the SETTINGS word shows once the intro is over (like the section buttons)
    show(on) { btnWrap.classList.toggle('show', on); if (on) requestAnimationFrame(paintAll); },
  };
}
