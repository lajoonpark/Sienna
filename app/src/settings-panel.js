// Settings: a SETTINGS word top-right (like HOME top-left) and Cmd+, (Ctrl+, elsewhere) open a
// torn paper card in the middle of the screen. A side rail of brush-stroke words on the left picks a
// page (Account, Look, Playback, Performance, Shortcuts, Tour); the page shows on the right. Each
// setting is a row of brush-stroke words; the chosen one is painted terracotta. Changes apply at once
// and are remembered (settings.js). The card leans toward the cursor (cursortilt.js), like the tour's notes.
// Esc, clicking outside the card, or DONE closes it. While it is open the shop's keys stay quiet
// (main.js checks isOpen()); Up/Down (or Tab) move through the rail.
//
//   const panel = createSettingsPanel({ music, onTour });   panel.open(page?) / close() / toggle() / isOpen()
//   music: the store (music.js), for Settings > Account (who is signed in, switch, add, sign out)
//   onTour: Settings > Tour > SHOW IT AGAIN (main.js restarts src/tour.js)
//
// Shot hook: ?settings opens it, ?settings=<page> on that page (account, look, playback, performance,
// shortcuts, tour). With the fake store, add ?guest for the signed-out Account page.
import { FONTS, onLettering } from './style.js';
import { INK, HOT, PAPER, brushStroke } from './controls.js';
import { settings } from './settings.js';
import { shortcuts, fromEvent } from './shortcuts.js';
import { rng } from './rand.js';
import { onCursorTilt, tiltCSS } from './cursortilt.js';

// Settings > Look > Painting: watercolour strength (LEVELS in watercolour.js), lightest first
const PAINT = ['Faint', 'Light', 'Medium', 'Heavy', 'Brush strokes'];

const CSS = `
.st-btn { position: fixed; top: 3.4vh; right: 2.6vw; z-index: 6; border: 0; padding: 0; background: none; cursor: pointer;
  font-family: var(--sienna-font); color: ${PAPER}; font-size: 26px; line-height: 1; user-select: none; opacity: 0; transition: opacity .6s ease, transform .18s cubic-bezier(.3,1.6,.5,1); }
.st-btn.show { opacity: .9; }
.st-btn:hover { opacity: 1; transform: translateX(-4px) rotate(1deg); }
.st-w { position: relative; display: inline-block; border: 0; padding: 0; background: none; cursor: pointer; font-family: var(--sienna-font);
  font-size: inherit; color: ${PAPER}; line-height: 1; transition: transform .18s cubic-bezier(.3,1.6,.5,1); }
.st-w .plate { position: absolute; inset: 0; background-size: 100% 100%; transition: opacity .25s; }
.st-w .plate.hot { opacity: 0; }
.st-w:hover .plate.hot, .st-w.on .plate.hot { opacity: 1; }
.st-w:hover { transform: translateY(-2px) rotate(-1deg); }
.st-w span { position: relative; display: block; padding: .16em 1em .1em .7em; white-space: nowrap; text-shadow: 0 0 1px rgba(251,245,232,.7); }
.st-btn .st-w span { padding: .16em .7em .1em 1em; }
.st-btn .plate { transform: scaleX(-1); }
.st-veil { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center;
  background: rgba(60,45,35,.18); perspective: 1600px; opacity: 0; visibility: hidden; transition: opacity .3s ease, visibility 0s .3s; }
.st-veil.show { opacity: 1; visibility: visible; transition: opacity .3s ease; }
/* the card leans toward the cursor (cursortilt.js); a wrapper carries the lean so the card's own open/close bounce stays */
.st-lean { display: flex; justify-content: center; will-change: transform; }
.st-card { position: relative; width: min(940px, 94vw); height: min(640px, 92vh); box-sizing: border-box; display: flex; flex-direction: column; padding: 30px 40px 22px; color: #2b2436;
  font-family: var(--sienna-font); filter: drop-shadow(0 6px 10px rgba(50,35,25,.25));
  transform: translateY(18px) rotate(-1.4deg) scale(.96); transition: transform .45s cubic-bezier(.2,1.5,.4,1); }
.st-veil.show .st-card { transform: rotate(-.5deg); }
.st-paper { position: absolute; inset: 0; background: #f4ead6; }
.st-head { position: relative; flex: none; font-size: 42px; margin: 0 0 12px; color: ${INK}; }
/* the rail on the left, the page on the right; a painted line between them */
.st-body { position: relative; flex: 1 1 auto; min-height: 0; display: flex; gap: 0 30px; }
.st-side { position: relative; flex: none; width: 190px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding-top: 8px; font-size: 27px; overflow-y: auto; scrollbar-width: none; }
.st-side::-webkit-scrollbar { display: none; }
.st-side .st-w:not(.on) .plate:not(.hot) { opacity: 0; }
.st-side .st-w:not(.on) span { color: ${INK}; text-shadow: none; }
.st-side .st-w:not(.on):hover span { color: ${PAPER}; }
.st-rule { flex: none; width: 4px; align-self: stretch; margin: 6px 0; background-size: 100% 100%; opacity: .55; }
/* only the page scrolls: the paper, the title, the rail and DONE stay put, so the card is always whole */
.st-scroll { position: relative; flex: 1 1 auto; min-width: 0; overflow-y: auto; overflow-x: hidden; margin-right: -14px; padding-right: 14px;
  -webkit-mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent); mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent);
  padding-top: 8px; padding-bottom: 8px; scrollbar-width: thin; scrollbar-color: rgba(122,90,64,.45) transparent; }
.st-scroll::-webkit-scrollbar { width: 8px; }
.st-scroll::-webkit-scrollbar-track { background: transparent; }
.st-scroll::-webkit-scrollbar-thumb { background: rgba(122,90,64,.45); border-radius: 4px; }
.st-page { display: none; }
.st-page.on { display: block; animation: st-in .3s ease; }
@keyframes st-in { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
.st-row { position: relative; margin: 0 0 18px; }
.st-label { font-size: 30px; }
.st-hint { font-size: 19px; color: #7a5a40; margin: 2px 0 10px; }
.st-opts { display: flex; flex-wrap: wrap; gap: 6px 4px; font-size: 27px; }
.st-keys .st-opts { align-items: center; gap: 6px 4px; }
.st-kpair { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; margin-right: 14px; }
.st-kname { font-size: 24px; color: #5a4636; margin: 0 2px 0 0; }
.st-keys .st-msg { min-height: 1.2em; color: #a0442c; }
/* Settings > Account */
.st-who { display: flex; align-items: center; gap: 18px; margin: 4px 0 6px; }
.st-face { flex: none; width: 74px; height: 74px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: ${HOT}; color: ${PAPER}; font-size: 40px; box-shadow: 0 0 0 3px #f4ead6, 0 0 0 5px rgba(45,49,88,.55); }
.st-face.small { width: 34px; height: 34px; font-size: 19px; box-shadow: 0 0 0 2px #f4ead6, 0 0 0 3px rgba(45,49,88,.4); }
.st-face img { width: 100%; height: 100%; object-fit: cover; }
.st-name { font-size: 36px; color: ${INK}; line-height: 1.05; }
.st-handle { font-size: 21px; color: #7a5a40; }
.st-alt { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; font-size: 25px; }
.st-alt .st-hint { margin: 0; }
.st-confirm { display: none; }
.st-confirm.on { display: block; }
.st-confirm .st-hint { color: #a0442c; }
.st-small { font-size: 17px; color: #8c6c50; margin-top: 18px; max-width: 36em; }
.st-foot { position: relative; flex: none; display: flex; padding-top: 6px; justify-content: flex-end; font-size: 28px; }
@media (max-width: 720px) { .st-side { width: 130px; font-size: 22px; } .st-body { gap: 0 14px; } .st-card { padding: 24px 22px 18px; } }
`;

// A hand-torn outline as a CSS polygon (same idea as the search slips).
export function torn(seed, amp = 5) {
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
export function word(text, seed, onClick) {
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


// A painted vertical line (the rule between the rail and the page).
function paintRule(el, seed) {
  const h = Math.ceil(el.offsetHeight);
  if (!h || el.dataset.h === String(h)) return;
  el.dataset.h = String(h);
  const c = document.createElement('canvas');
  c.width = 8; c.height = h;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = INK;
  for (let pass = 0; pass < 6; pass++) {
    g.globalAlpha = 0.18;
    g.beginPath();
    let x = 4;
    g.moveTo(x, 0);
    for (let y = 0; y <= h; y += 12) { x = Math.max(2, Math.min(6, x + (r() - 0.5) * 1.6)); g.lineTo(x + 1.2, y); }
    for (let y = h; y >= 0; y -= 12) g.lineTo(4 - 1.2 + (r() - 0.5), y);
    g.fill();
  }
  el.style.backgroundImage = `url(${c.toDataURL()})`;
}

export function createSettingsPanel({ music = null, onTour = null } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // the SETTINGS word, top right
  const btnWrap = document.createElement('div');
  btnWrap.className = 'st-btn';
  const btn = word('Settings', 17, () => toggle());
  btnWrap.appendChild(btn);
  document.body.appendChild(btnWrap);

  const veil = document.createElement('div');
  veil.className = 'st-veil';
  veil.innerHTML = `<div class="st-lean"><div class="st-card"><div class="st-paper"></div><div class="st-head">Settings</div>
    <div class="st-body"><div class="st-side"></div><div class="st-rule"></div><div class="st-scroll"></div></div>
    <div class="st-foot"></div></div></div>`;
  document.body.appendChild(veil);
  const card = veil.querySelector('.st-card');
  const leaner = veil.querySelector('.st-lean');
  const side = veil.querySelector('.st-side');
  const rule = veil.querySelector('.st-rule');
  const scroller = veil.querySelector('.st-scroll');
  let unlean = null;
  card.querySelector('.st-paper').style.clipPath = torn(7);
  card.addEventListener('click', (e) => e.stopPropagation());
  veil.addEventListener('click', () => close());

  const optWords = [];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // a row: a label, a hint, and a box of words
  function makeRow(label, hint, cls = '') {
    const row = el('div', `st-row ${cls}`.trim());
    row.append(el('div', 'st-label', label), el('div', 'st-hint', hint));
    const box = el('div', 'st-opts');
    row.appendChild(box);
    return { row, box };
  }

  // ---- the pages, and the rail that picks one ----
  const PAGES = [];
  const railWords = {};
  let current = null;
  function addPage(id, label, onShow = null) {
    const page = el('div', 'st-page');
    page.dataset.page = id;
    scroller.appendChild(page);
    const w = word(label, 141 + PAGES.length * 11, () => show(id));
    w.dataset.page = id;
    side.appendChild(w);
    railWords[id] = w;
    PAGES.push({ id, page, onShow });
    return page;
  }
  function show(id) {
    const p = PAGES.find((x) => x.id === id) ?? PAGES[0];
    if (current === p.id) return;
    current = p.id;
    for (const x of PAGES) { x.page.classList.toggle('on', x === p); railWords[x.id].classList.toggle('on', x === p); }
    scroller.scrollTop = 0;
    stopRecording();
    p.onShow?.();
    requestAnimationFrame(paintAll);
  }

  // ---- Account ----
  let refreshAccount = () => {};   // set by buildAccount
  const acct = addPage('account', 'Account', () => refreshAccount());
  if (music?.account) buildAccount(acct);
  else acct.appendChild(el('div', 'st-hint', 'No account here.'));
  function face(person, small = false) {
    const f = el('div', `st-face${small ? ' small' : ''}`);
    const initial = (person?.name || '?').trim().charAt(0).toUpperCase();
    if (person?.photo) {
      const img = new Image();
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { f.textContent = initial; };
      img.src = person.photo;
      f.appendChild(img);
    } else f.textContent = initial;
    return f;
  }
  function buildAccount(page) {
    const who = el('div');
    const switchRow = makeRow('Switch account', 'Other Google accounts signed in here. Pick one to hear its music and see its shelves.');
    const addRow = makeRow('Add an account', 'Sign in with another Google account. The ones already here stay.');
    const outRow = makeRow('Sign out', 'Signs Sienna out of every Google account in it. Your library stays on YouTube Music.');
    const confirm = el('div', 'st-confirm');
    confirm.appendChild(el('div', 'st-hint', 'Sign out of YouTube Music in Sienna?'));
    const confirmBox = el('div', 'st-opts');
    confirm.appendChild(confirmBox);
    outRow.row.appendChild(confirm);
    const inRow = makeRow('Sign in', 'Sign in with your Google account to see your own shelves, likes and mixes. It is Google’s own sign-in page.');
    const small = el('div', 'st-small', 'Sienna keeps no passwords and stores nothing about you. Sign-in happens on Google’s page, and the session stays inside Sienna’s own player on this computer.');
    page.append(who, switchRow.row, addRow.row, outRow.row, inRow.row, small);

    const add = word('Use another account', 211, () => music.addAccount());
    addRow.box.appendChild(add);
    const out = word('Sign out', 223, () => { confirm.classList.add('on'); out.style.display = 'none'; requestAnimationFrame(paintAll); });
    outRow.box.appendChild(out);
    const yes = word('Yes, sign out', 227, async () => {
      busy('Signing out…');
      await music.signOut().catch(() => {});
      resetConfirm();
      // the player reloads as a guest; onAccount brings the page up to date (and once more here, in case)
      setTimeout(() => refreshAccount(), 2500);
    });
    const no = word('Keep me in', 229, () => resetConfirm());
    confirmBox.append(yes, no);
    const signIn = word('Sign in', 233, () => music.signIn());
    inRow.box.appendChild(signIn);
    const retry = word('Try again', 239, () => refreshAccount());
    optWords.push(add, out, yes, no, signIn, retry);
    function resetConfirm() { confirm.classList.remove('on'); out.style.display = ''; }

    let altWords = [];
    function busy(text) {
      who.replaceChildren(el('div', 'st-hint', text));
      for (const r of [switchRow, addRow, outRow, inRow]) r.row.style.display = 'none';
      small.style.display = 'none';
    }
    let seq = 0;
    refreshAccount = async () => {
      const n = ++seq;
      if (!who.childElementCount) busy('Asking YouTube Music…');
      let me, list;
      try { [me, list] = await Promise.all([music.account(), music.accounts?.() ?? []]); }
      catch (e) {
        if (n !== seq) return;
        console.warn('[sienna] account', e);
        who.replaceChildren(el('div', 'st-hint', 'Could not reach YouTube Music just now.'), retry);
        for (const r of [switchRow, addRow, outRow, inRow]) r.row.style.display = 'none';
        requestAnimationFrame(paintAll);
        return;
      }
      if (n !== seq) return;
      resetConfirm();
      small.style.display = '';
      if (!me) {
        const line = el('div', 'st-who');
        const text = el('div');
        text.append(el('div', 'st-name', 'Not signed in'), el('div', 'st-handle', 'You are browsing as a guest: the shelves are YouTube Music’s general picks.'));
        line.append(face({ name: '?' }), text);
        who.replaceChildren(line);
        inRow.row.style.display = '';
        switchRow.row.style.display = addRow.row.style.display = outRow.row.style.display = 'none';
      } else {
        const line = el('div', 'st-who');
        const text = el('div');
        text.append(el('div', 'st-hint', 'Signed in as'), el('div', 'st-name', me.name));
        if (me.handle) text.appendChild(el('div', 'st-handle', me.handle));
        line.append(face(me), text);
        who.replaceChildren(line);
        inRow.row.style.display = 'none';
        addRow.row.style.display = outRow.row.style.display = '';
        // the other accounts, each with its face; the list keeps its order, so the index is the one to switch to
        altWords.forEach((w) => optWords.splice(optWords.indexOf(w), 1));
        altWords = [];
        switchRow.box.replaceChildren();
        switchRow.box.style.display = 'block';
        list.forEach((a, i) => {
          if (a.selected) return;
          const alt = el('div', 'st-alt');
          const w = word(a.name, 251 + i * 7, async () => {
            busy(`Switching to ${a.name}…`);
            if (!(await music.switchAccount(i).catch(() => false))) refreshAccount();
            else setTimeout(() => { if (who.textContent.startsWith('Switching')) refreshAccount(); }, 8000);
          });
          alt.append(face(a, true), w);
          if (a.byline) alt.appendChild(el('div', 'st-hint', a.byline));
          switchRow.box.appendChild(alt);
          altWords.push(w);
        });
        optWords.push(...altWords);
        switchRow.row.style.display = altWords.length ? '' : 'none';
      }
      requestAnimationFrame(paintAll);
    };
    // signed in, out or switched (here, in the sign-in window, or by Google itself)
    music.onAccount?.(() => { if (current === 'account') refreshAccount(); else who.replaceChildren(); });
  }

  // ---- the plain settings: a row of words each ----
  function settingRows(page, rows, seed0) {
    rows.forEach((row, r) => {
      const { row: rowEl, box } = makeRow(row.label, row.hint);
      page.appendChild(rowEl);
      const ws = row.opts.map(([label, value, font], i) => {
        const w = word(label, seed0 + r * 13 + i * 5, () => settings.set(row.key, value));
        if (font) w.style.fontFamily = font.family; // each lettering choice is written in itself
        box.appendChild(w);
        optWords.push(w);
        return w;
      });
      const mark = () => ws.forEach((w, i) => w.classList.toggle('on', row.opts[i][1] === settings.get(row.key)));
      mark();
      settings.on(row.key, mark);
    });
  }
  settingRows(addPage('look', 'Look'), [
    { key: 'paint', label: 'Painting', hint: 'How much the colours run and pool, like wet paint.', opts: PAINT.map((l, i) => [l, i]) },
    { key: 'covers', label: 'Cover art', hint: 'How strongly album covers are painted over.', opts: ['Off', 'Light', 'Medium', 'Heavy'].map((l, i) => [l, i]) },
    { key: 'font', label: 'Lettering', hint: 'The handwriting on tags, signs and buttons. It changes straight away.', opts: Object.entries(FONTS).map(([k, f]) => [f.label, k, f]) },
  ], 23);
  settingRows(addPage('playback', 'Playback'), [
    { key: 'playOnArm', label: 'Start of a song', hint: 'Play when the arm touches the record and it spins, or straight away.', opts: [['When the arm lands', true], ['At once', false]] },
  ], 61);
  settingRows(addPage('performance', 'Performance'), [
    { key: 'maxFps', label: 'Smoothness', hint: 'Frames per second at most. 30 runs cooler and saves battery.', opts: [['60 fps', 60], ['30 fps', 30]] },
    { key: 'fps', label: 'Frame rate', hint: 'Show frames per second in the corner.', opts: [['Off', false], ['On', true]] },
  ], 79);

  // ---- Shortcuts: click one, then press the new keys (Esc cancels). The global ones are let go meanwhile
  // (shortcuts.pause), so pressing the current combination reaches this page instead of firing.
  const KEYS = [['search', 'Search'], ['app', 'Full app'], ['mini', 'Mini player']];
  const NAMES = Object.fromEntries(KEYS);
  const { row: keysRow, box: keysBox } = makeRow('Shortcuts', 'Click one, then press the keys you want. Search works in the shop and the mini player; the other two work from any app.', 'st-keys');
  const msg = el('div', 'st-hint st-msg');
  keysRow.appendChild(msg);
  addPage('shortcuts', 'Shortcuts').appendChild(keysRow);
  let recording = null;   // name of the shortcut being recorded
  const keyWords = {};
  KEYS.forEach(([name, label], i) => {
    const pair = el('span', 'st-kpair');
    keysBox.appendChild(pair);
    pair.appendChild(el('span', 'st-kname', label));
    const w = word('', 91 + i * 7, () => (recording === name ? stopRecording() : startRecording(name)));
    pair.appendChild(w);
    keyWords[name] = w;
    optWords.push(w);
  });
  const resetWord = word('Reset', 117, () => { stopRecording(); shortcuts.reset().then(() => { msg.textContent = ''; }); });
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

  // ---- Tour: the first-run tour again, from the door (src/tour.js) ----
  if (onTour) {
    const { row, box } = makeRow('Tour', 'The welcome notes from the first time, with the choices and shortcuts.');
    addPage('tour', 'Tour').appendChild(row);
    const again = word('Show it again', 131, () => { close(); onTour(); });
    box.appendChild(again);
    optWords.push(again);
  }

  const done = word('Done', 31, () => close());
  card.querySelector('.st-foot').appendChild(done);

  const paintAll = () => {
    for (const w of [btn, ...Object.values(railWords), ...optWords, done]) w.paint();
    paintRule(rule, 5);
  };
  document.fonts?.ready.then(paintAll);
  onLettering(done, paintAll); // Settings > Lettering: words reflow in the new face, plates follow
  document.fonts?.addEventListener?.('loadingdone', paintAll); // the lettering choices load when first shown
  requestAnimationFrame(paintAll);

  let openNow = false;
  function open(page = null) {
    openNow = true;
    veil.classList.add('show');
    if (page || !current) show(page || 'account');
    else PAGES.find((x) => x.id === current)?.onShow?.();   // the same page as last time, brought up to date
    requestAnimationFrame(paintAll);
    // a big card, so a gentler lean than the tour's notes
    unlean ??= onCursorTilt((x, y) => { leaner.style.transform = tiltCSS(x, y, 5); });
  }
  function close() {
    stopRecording();
    openNow = false;
    veil.classList.remove('show');
    unlean?.(); unlean = null; // it holds its last lean while it fades
  }
  function toggle() { (openNow ? close : open)(); }
  function step(d) {
    const i = PAGES.findIndex((x) => x.id === current);
    show(PAGES[(i + d + PAGES.length) % PAGES.length].id);
  }

  // Cmd+, on macOS (the usual Preferences key), Ctrl+, elsewhere; Esc closes; Up/Down or Tab move
  // through the rail. Capture phase, so it runs before the shop's own key handler and can swallow keys
  // while the card is up.
  const mac = /Mac/.test(navigator.platform);
  addEventListener('keydown', (e) => {
    if (openNow && recording) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) record(e); return; }
    if (e.key === ',' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey) {
      e.preventDefault(); e.stopImmediatePropagation(); toggle(); return;
    }
    if (!openNow) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) step(1);
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) step(-1);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  const shot = new URLSearchParams(location.search);
  if (shot.has('settings')) open(shot.get('settings') || null);

  return {
    open, close, toggle,
    isOpen: () => openNow,
    page: () => current,
    // the SETTINGS word shows once the intro is over (like the section buttons)
    show(on) { btnWrap.classList.toggle('show', on); if (on) requestAnimationFrame(paintAll); },
  };
}
