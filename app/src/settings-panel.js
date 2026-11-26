import { createSheet } from './ui/sheet.js';
import { createScrollCue } from './ui/scroll-cue.js';
import { smoothWheel } from './ui/smooth-scroll.js';
// Settings: the Settings sign top-right and Cmd+, (Ctrl+, elsewhere) tip up a crate card in the middle
// of the screen. Its divider tabs pick a page (Account, Look, Playback, Performance, Shortcuts, Tour,
// About). Each setting is a row: what it is on the left, a switch (or its buttons) on the right. Changes
// apply at once and are remembered (settings.js). Esc, the close stamp or clicking outside the card
// closes it. While it is open the shop's keys stay quiet (main.js checks isOpen()); the arrows (or
// Tab) move through the tabs.
//
//   const panel = createSettingsPanel({ music, onTour });   panel.open(page?) / close() / toggle() / isOpen()
//   music: the store (music.js), for Settings > Account (who is signed in, switch, add, sign out)
//   onTour: Settings > Tour > SHOW IT AGAIN (main.js restarts src/tour.js)
//
// Shot hook: ?settings opens it, ?settings=<page> on that page (account, look, playback, performance,
// shortcuts, tour). With the fake store, add ?guest for the signed-out Account page.
import { FONTS } from './style.js';
import { injectTokens } from './ui/tokens.js';
import { inkButton, segmented } from './ui/inputs.js';
import { brushButton } from './ui/brush.js';
import { settings } from './settings.js';
import { shortcuts, fromEvent } from './shortcuts.js';

const CSS = `
.st-btn { position: fixed; top: max(calc(var(--sienna-space-8) + var(--sienna-space-6)), 7vh); right: max(calc(var(--sienna-space-10) * 2), 8vw); z-index: var(--sienna-z-chrome); pointer-events: none; perspective: 900px; perspective-origin: 80% 50%;
  line-height: 1; user-select: none; opacity: 0; transition: opacity var(--sienna-dur-slow) ease; }
.st-btn.show { opacity: .96; }
.st-btn-stack { display: flex; align-items: center; gap: var(--sienna-space-1); transform-style: preserve-3d; transform-origin: 100% 50%; will-change: transform; }
.st-btn .ui-brush { pointer-events: auto; }
.st-btn:not(.show) .ui-brush { pointer-events: none; }

.st-settings .ui-sheet-card { width: var(--ui-sheet-w); height: min(560px, calc(100dvh - var(--sienna-space-10) * 3));
  margin-top: var(--sienna-space-8); }
.st-settings .ui-sheet-head { align-items: center; margin-bottom: 0; padding-bottom: var(--sienna-space-2);
  border-bottom: 2px solid var(--sienna-indigo); }
.st-settings .ui-sheet-body { display: flex; overflow: hidden; padding: 0; }
.st-settings .ui-sheet-foot { display: none; }
/* the page tabs, along the card's top edge */
.st-side.crate-tabs .ui-ink { gap: 0; margin: 0; padding: 6px var(--sienna-space-3) 4px;
  font-size: var(--sienna-text-md); color: var(--sienna-ink); }
.st-side.crate-tabs .ui-ink-line { display: none; }
.st-side.crate-tabs .ui-ink:not(:disabled):hover { transform: none; color: var(--sienna-terracotta); }
.st-side.crate-tabs .ui-ink[aria-current="page"],
.st-side.crate-tabs .ui-ink[aria-current="page"]:hover { padding: 10px var(--sienna-space-3) 6px; color: var(--sienna-indigo); }
.st-side.crate-tabs .ui-ink:focus-visible { border-radius: 0; box-shadow: none; }
.st-scroll { flex: 1; min-width: 0; overflow-y: auto; padding: 0 var(--sienna-space-3) var(--sienna-space-5) 0; }
.st-page { display: none; }
.st-page.on { display: block; }
/* the open tab already names the page */
.st-page-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.st-page-desc, .st-hint { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); line-height: 1.45; color: var(--sienna-ink-2); }
.st-page-desc { margin: var(--sienna-space-3) 0 0; font-style: italic; }
.st-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: var(--sienna-space-2) var(--sienna-space-6); padding: var(--sienna-space-4) 0; border-bottom: 1px solid var(--sienna-hairline); }
.st-page > .st-row:last-child { border-bottom: 0; }
.st-text { flex: 1 1 260px; min-width: 0; }
.st-label { font-family: var(--sienna-serif); font-size: 17px; font-weight: 600; line-height: 1.35; color: var(--sienna-ink); }
.st-opts { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--sienna-space-2) var(--sienna-space-4); max-width: 100%; }
.st-opts:empty { display: none; }
/* a setting's buttons are little cards you can press */
.st-opts > .ui-ink, .st-alt > .ui-ink { margin-bottom: 3px; padding: 5px var(--sienna-space-4) 6px; border-radius: 7px;
  font-size: var(--sienna-text-md); background: var(--sienna-paper) var(--sienna-grain);
  box-shadow: 0 0 0 1px rgba(120, 90, 58, 0.34), 0 3px 0 var(--sienna-edge); }
.st-opts > .ui-ink .ui-ink-line, .st-alt > .ui-ink .ui-ink-line { display: none; }
.st-opts > .ui-ink:not(:disabled):hover, .st-alt > .ui-ink:not(:disabled):hover { transform: translateY(-1px); }
.st-opts > .ui-ink:not(:disabled):active, .st-alt > .ui-ink:not(:disabled):active { transform: translateY(2px);
  box-shadow: 0 0 0 1px rgba(120, 90, 58, 0.34), 0 1px 0 var(--sienna-edge); }
.st-opts > .ui-ink:focus-visible, .st-alt > .ui-ink:focus-visible { border-radius: 7px; box-shadow: var(--sienna-focus-ring); }
.st-row > .st-hint, .st-row > .st-small, .st-row > .st-confirm { flex-basis: 100%; }
.st-hint:empty { display: none; }
.st-small, .st-handle, .st-kname { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); line-height: 1.45; color: var(--sienna-ink-3); }
.st-page > .st-small { margin: var(--sienna-space-3) 0 0; }
.st-name { font-family: var(--sienna-font); font-size: var(--sienna-text-lg); line-height: 1.2; color: var(--sienna-indigo); }
.st-confirm { display: none; }
.st-confirm.on { display: block; }
.st-confirm .st-opts { justify-content: flex-start; margin-top: var(--sienna-space-2); }
.st-who { display: flex; align-items: center; gap: var(--sienna-space-3); padding: var(--sienna-space-4) 0; border-bottom: 1px solid var(--sienna-hairline); }
.st-alt { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--sienna-space-3); }
.st-face { flex: none; width: calc(var(--sienna-space-6) * 2); height: calc(var(--sienna-space-6) * 2);
  border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: var(--sienna-paper-lo); font-size: var(--sienna-text-lg); }
.st-face.small { width: var(--sienna-space-8); height: var(--sienna-space-8); }
.st-face img { width: 100%; height: 100%; object-fit: cover; }
/* shortcuts: each one a row, its keys on a keycap */
.st-keys .st-opts { flex-basis: 100%; flex-direction: column; align-items: stretch; gap: 0; }
.st-kpair { display: flex; align-items: center; justify-content: space-between; gap: var(--sienna-space-4);
  padding: var(--sienna-space-3) 0; border-bottom: 1px solid var(--sienna-hairline); }
.st-kname { font-size: var(--sienna-text-sm); color: var(--sienna-ink); }
.st-kpair .ui-ink { margin-bottom: 3px; padding: 5px var(--sienna-space-3) 6px; border-radius: 7px;
  font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); font-weight: 600; color: var(--sienna-ink);
  background: var(--sienna-paper) var(--sienna-grain); box-shadow: 0 0 0 1px rgba(120, 90, 58, 0.32), 0 3px 0 var(--sienna-edge); }
.st-kpair .ui-ink .ui-ink-line { display: none; }
.st-kpair .ui-ink.is-on { color: var(--sienna-paper); background: var(--sienna-terracotta); box-shadow: 0 0 0 1px var(--sienna-terracotta), 0 1px 0 var(--sienna-danger); transform: translateY(2px); }
.st-kpair .ui-ink:focus-visible { box-shadow: var(--sienna-focus-ring); }
.st-keys .st-opts > .ui-ink { align-self: flex-start; margin-top: var(--sienna-space-3); }
.st-settings .ui-scroll-cue { display: none; }
@media (max-width: 720px) { .st-side.crate-tabs { overflow-x: auto; } }
`;

const action = (text, seed, onClick, danger = false) => inkButton(text, { seed, onClick, danger });

export function createSettingsPanel({ music = null, onTour = null, onRestock = null, onClose = null } = {}) {
  injectTokens();
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Top-right painted words: Restock, Settings — angled & reactive like the side menus
  const btnWrap = document.createElement('div');
  btnWrap.className = 'st-btn';
  const btnStack = document.createElement('div');
  btnStack.className = 'st-btn-stack';
  btnWrap.appendChild(btnStack);
  let restockBtn = null;
  let restocking = false;
  let restockResetTimer = 0;

  function setRestockLabel(text, hot = false) {
    if (!restockBtn) return;
    restockBtn.setLabel(text);
    restockBtn.classList.toggle('is-on', hot);   // lit while it is working or has just done it
  }

  async function runRestock() {
    if (!onRestock || restocking) return;
    clearTimeout(restockResetTimer);
    restocking = true;
    restockBtn?.setDisabled(true);
    restockBtn?.setSpinning(true);
    setRestockLabel('Restocking…', true);
    const t0 = performance.now();
    let ok = true;
    try {
      const res = await onRestock();
      if (res === false || res?.ok === false) ok = false;
    } catch {
      ok = false;
    }
    const elapsed = performance.now() - t0;
    if (elapsed < 400) await new Promise((r) => setTimeout(r, 400 - elapsed));
    restocking = false;
    restockBtn?.setDisabled(false);
    restockBtn?.setSpinning(false);
    setRestockLabel(ok ? 'Done!' : 'Restock', ok);
    if (ok) {
      restockResetTimer = setTimeout(() => {
        setRestockLabel('Restock', false);
      }, 1800);
    }
  }

  if (onRestock) {
    restockBtn = brushButton('Restock', { icon: 'restock', size: 'sm', flipX: true, seed: 13, onClick: () => runRestock() });
    restockBtn.setAttribute('aria-description', 'Refresh shelves from YouTube Music');
    btnStack.appendChild(restockBtn);
  }
  const btn = brushButton('Settings', { icon: 'settings', size: 'sm', flipX: true, seed: 17, onClick: () => toggle() });
  btnStack.appendChild(btn);
  btnStack.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.detail) e.target.closest('button')?.blur();
  });
  document.body.appendChild(btnWrap);

  const sheet = createSheet({ title: 'Settings',
    width: 'min(calc(var(--sienna-space-10) * 20), calc(100vw - var(--sienna-space-10)))',
    onClose: () => { openNow = false; stopPageScroll(); stopRecording(); onClose?.(); },
  });
  const veil = sheet.el;
  veil.classList.add('st-settings');
  const side = document.createElement('nav');
  side.className = 'st-side crate-tabs';
  side.setAttribute('aria-label', 'Settings pages');
  const scroller = document.createElement('div');
  scroller.className = 'st-scroll';
  const stopPageScroll = smoothWheel(scroller);
  sheet.card.classList.add('crate-card');
  sheet.card.insertBefore(side, sheet.header);
  sheet.body.append(scroller);
  const cue = createScrollCue(scroller, { parent: sheet.footer });

  const optWords = [];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // a row: what it is (a label and a hint) and a box for its switch or buttons
  function makeRow(label, hint, cls = '') {
    const row = el('div', `st-row ${cls}`.trim());
    const text = el('div', 'st-text');
    text.append(el('div', 'st-label', label), el('div', 'st-hint', hint));
    const box = el('div', 'st-opts');
    row.append(text, box);
    return { row, box };
  }

  // ---- the pages, and the rail that picks one ----
  const PAGES = [];
  const railWords = {};
  let current = null;
  function addPage(id, label, onShow = null) {
    const page = el('div', 'st-page');
    page.dataset.page = id;
    const descriptions = {
      account: 'Your YouTube Music identity and accounts.',
      look: 'Handwriting and painted cover art, made yours.',
      playback: 'Choose how Sienna plays and lives on your computer.',
      performance: 'Balance smooth motion, detail and battery life.',
      shortcuts: 'Your quickest ways back to the music.',
      tour: 'Take another walk around the record shop.',
      about: 'Version, updates and private diagnostics.',
    };
    page.append(el('h3', 'st-page-title', label), el('p', 'st-page-desc', descriptions[id]));
    scroller.appendChild(page);
    const w = action(label, 141 + PAGES.length * 11, () => show(id));
    w.classList.add('crate-tab');
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
    for (const x of PAGES) {
      x.page.classList.toggle('on', x === p);
      railWords[x.id].setSelected(x === p);
      if (x === p) railWords[x.id].setAttribute('aria-current', 'page');
      else railWords[x.id].removeAttribute('aria-current');
    }
    stopPageScroll();
    scroller.scrollTop = 0;
    railWords[p.id].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    stopRecording();
    p.onShow?.();
    requestAnimationFrame(refreshLayout);
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

    const add = action('Use another account', 211, () => music.addAccount());
    addRow.box.appendChild(add);
    const out = action('Sign out', 223, () => { confirm.classList.add('on'); out.style.display = 'none'; refreshLayout(); }, true);
    outRow.box.appendChild(out);
    const yes = action('Yes, sign out', 227, async () => {
      busy('Signing out…');
      await music.signOut().catch(() => {});
      resetConfirm();
      // the player reloads as a guest; onAccount brings the page up to date (and once more here, in case)
      setTimeout(() => refreshAccount(), 2500);
    }, true);
    const no = action('Keep me in', 229, () => resetConfirm());
    confirmBox.append(yes, no);
    const signIn = action('Sign in', 233, () => music.signIn());
    inRow.box.appendChild(signIn);
    const retry = action('Try again', 239, () => refreshAccount());
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
        requestAnimationFrame(refreshLayout);
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
          const w = action(a.name, 251 + i * 7, async () => {
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
      requestAnimationFrame(refreshLayout);
    };
    // signed in, out or switched (here, in the sign-in window, or by Google itself)
    music.onAccount?.(() => { if (current === 'account') refreshAccount(); else who.replaceChildren(); });
  }

  // ---- the plain settings: a row of words each ----
  function settingRows(page, rows, seed0) {
    rows.forEach((row, r) => {
      const { row: rowEl, box } = makeRow(row.label, row.hint);
      page.appendChild(rowEl);
      const chips = segmented(row.opts.map(([label, value, font]) => ({ label, value, font: font?.family })), {
        role: 'radio', label: row.label, value: settings.get(row.key), seed: seed0 + r * 13,
        onChange: value => settings.set(row.key, value),
      });
      box.appendChild(chips.el);
      settings.on(row.key, value => chips.setValue(value));
    });
  }
  settingRows(addPage('look', 'Look'), [
    { key: 'covers', label: 'Cover art', hint: 'How strongly album covers are painted over.', opts: ['Off', 'Light', 'Medium', 'Heavy'].map((l, i) => [l, i]) },
    { key: 'font', label: 'Lettering', hint: 'The handwriting on tags, signs and buttons. It changes straight away.', opts: Object.entries(FONTS).map(([k, f]) => [f.label, k, f]) },
    { key: 'coverCarousel', label: 'Cover carousel', hint: 'Spin through Up next, Listen again and the top five search results by their covers, or keep to lists.', opts: [['Carousel', true], ['List', false]] },
  ], 23);
  const isMac = /Mac/.test(navigator.platform);
  const playbackPage = addPage('playback', 'Playback');
  settingRows(playbackPage, [
    { key: 'playOnArm', label: 'Start of a song', hint: 'Play when the arm touches the record and it spins, or straight away.', opts: [['When the arm lands', true], ['At once', false]] },
    ...(isMac ? [{ key: 'volumeMode', label: 'Volume control', hint: 'Control your Mac’s system volume, or keep Sienna’s volume separate from other apps.', opts: [['Mac system volume', 'system'], ['Sienna only', 'app']] }] : []),
    { key: 'miniAutoClose', label: 'Mini player', hint: 'Shut the mini player when the cursor leaves it. It waits until the cursor has been over it first.', opts: [['Close on leave', true], ['Stay open', false]] },
    { key: 'discordRpc', label: 'Discord Rich Presence', hint: 'Opt-in: show your current track in a local Discord desktop app. Never contacts remote servers.', opts: [['Off', false], ['On', true]] },
  ], 61);
  if (music?.volumeMode && isMac) {
    music.volumeMode(settings.get('volumeMode'));
    settings.on('volumeMode', (v) => music.volumeMode(v));
  }
  if (music?.app?.discordRpc) {
    music.app.discordRpc(!!settings.get('discordRpc')).catch(() => {});
    settings.on('discordRpc', (v) => music.app.discordRpc(!!v).catch(() => {}));
  }
  if (music?.app?.loginItem) {
    const { row: loginRow, box: loginBox } = makeRow('Start at login', 'Launch Sienna automatically when you sign in to your computer.');
    playbackPage.appendChild(loginRow);
    let loginState = false;
    const login = segmented([['Off', false], ['On', true]], { role: 'radio', label: 'Start at login', value: false,
      onChange: v => {
        login.setValue(loginState);
        music.app.loginItem(v).then(res => { loginState = !!res; markLogin(); }).catch(() => {});
      },
    });
    loginBox.appendChild(login.el);
    const markLogin = () => login.setValue(loginState);
    markLogin();
    music.app.info?.().then((info) => { if (info) { loginState = !!info.loginItem; markLogin(); } }).catch(() => {});
  }
  settingRows(addPage('performance', 'Performance'), [
    { key: 'maxFps', label: 'Smoothness', hint: 'Frames per second at most. 30 runs cooler and saves battery.', opts: [['60 fps', 60], ['30 fps', 30]] },
    { key: 'sharp', label: 'Sharpness', hint: 'How many pixels the shop is drawn with. Lighter runs cooler; the paint hides most of the difference.', opts: [['Full', 'full'], ['Balanced', 'balanced'], ['Light', 'light']] },
    { key: 'autoCool', label: 'Auto cool-down', hint: 'Draw lighter while the Mac is warm or frames are slow, then go back.', opts: [['On', true], ['Off', false]] },
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
    const w = action('', 91 + i * 7, () => (recording === name ? stopRecording() : startRecording(name)));
    pair.appendChild(w);
    keyWords[name] = w;
    optWords.push(w);
  });
  const resetWord = action('Reset', 117, () => { stopRecording(); shortcuts.reset().then(() => { msg.textContent = ''; }); });
  keysBox.appendChild(resetWord);
  optWords.push(resetWord);
  function showKeys() {
    for (const [name] of KEYS) {
      const w = keyWords[name];
      w.setLabel(recording === name ? 'Press keys…' : shortcuts.label(name));
      w.setSelected(recording === name);
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
    const again = action('Show it again', 131, () => { close(); onTour(); });
    box.appendChild(again);
    optWords.push(again);
  }

  // ---- About & Diagnostics: version, manual update check (privacy-first), sanitized debug report ----
  const aboutPage = addPage('about', 'About');
  const verHint = el('div', 'st-hint', 'Sienna — free, open-source 3D vinyl shop for YouTube Music (MIT License).');
  const unsignedNote = el('div', 'st-small', 'Open-source releases are unsigned (no paid Apple or Microsoft certificate). Installing via Homebrew on macOS automatically clears macOS quarantine (xattr).');
  const { row: updRow, box: updBox } = makeRow('Updates', 'Sienna never phones home in the background. Check GitHub Releases manually whenever you like.');
  const updMsg = el('div', 'st-hint');
  updRow.appendChild(updMsg);
  let releaseUrl = null;
  const openRelBtn = action('Open release page', 293, () => { if (releaseUrl) music?.app?.openRelease?.(releaseUrl); });
  openRelBtn.style.display = 'none';
  const checkBtn = action('Check for updates', 283, async () => {
    updMsg.textContent = 'Checking GitHub Releases…';
    openRelBtn.style.display = 'none';
    const res = await music?.app?.checkUpdates?.().catch(() => ({ ok: false, error: 'Could not check for updates.' }));
    if (!res?.ok) {
      updMsg.textContent = res?.error || 'Could not reach GitHub.';
    } else if (res.hasUpdate) {
      releaseUrl = res.url;
      updMsg.textContent = `Sienna ${res.latest} is available (you have ${res.current}).`;
      openRelBtn.style.display = '';
      requestAnimationFrame(refreshLayout);
    } else {
      updMsg.textContent = res.note || `You are up to date (v${res.current}).`;
    }
  });
  updBox.append(checkBtn, openRelBtn);
  optWords.push(checkBtn, openRelBtn);

  const { row: diagRow, box: diagBox } = makeRow('Diagnostics', 'Copy a sanitized summary (version, OS, GPU, player status — never cookies, account info, or listening history) for bug reports.');
  const diagMsg = el('div', 'st-hint');
  diagRow.appendChild(diagMsg);
  const copyDiagBtn = action('Copy debug info', 307, async () => {
    try {
      const base = (await music?.app?.diagnostics?.()) ?? {};
      let webgl = null;
      try {
        const gl = document.querySelector('canvas')?.getContext('webgl2') || document.querySelector('canvas')?.getContext('webgl');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        webgl = { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? 'unknown' };
      } catch { /* ignore */ }
      const report = JSON.stringify({
        ...base,
        viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
        settings: { sharp: settings.get('sharp'), maxFps: settings.get('maxFps'), autoCool: settings.get('autoCool'), covers: settings.get('covers'), volumeMode: settings.get('volumeMode') },
        webgl,
      }, null, 2);
      await navigator.clipboard.writeText(report);
      diagMsg.textContent = 'Copied sanitized debug info to clipboard.';
    } catch {
      diagMsg.textContent = 'Could not copy debug info to clipboard.';
    }
  });
  diagBox.appendChild(copyDiagBtn);
  optWords.push(copyDiagBtn);
  const { row: versionRow } = makeRow('Version', '');
  versionRow.append(verHint, unsignedNote);
  aboutPage.append(versionRow, updRow, diagRow);
  music?.app?.info?.().then((info) => {
    if (info?.version) verHint.textContent = `Sienna v${info.version} — free, open-source 3D vinyl shop for YouTube Music (MIT License).`;
  }).catch(() => {});

  const refreshLayout = () => cue.refresh();

  let openNow = false;
  function open(page = null) {
    openNow = true;
    if (page || !current) show(page || 'account');
    else PAGES.find(x => x.id === current)?.onShow?.();
    sheet.open({ returnFocusTo: document.activeElement === document.body ? btn : document.activeElement });
    railWords[current].focus({ preventScroll: true });
    refreshLayout();
  }
  function close() { sheet.close(); }
  function toggle() { (openNow ? close : open)(); }
  function step(d) {
    const i = PAGES.findIndex((x) => x.id === current);
    show(PAGES[(i + d + PAGES.length) % PAGES.length].id);
  }

  // Cmd+, on macOS (the usual Preferences key), Ctrl+, elsewhere; Esc closes; the arrows or Tab move
  // through the tabs. Capture phase, so it runs before the shop's own key handler and can swallow keys
  // while the card is up.
  const mac = /Mac/.test(navigator.platform);
  addEventListener('keydown', (e) => {
    if (openNow && !sheet.isTopmost()) return;
    if (openNow && recording) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) record(e); return; }
    if (e.key === ',' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey) {
      e.preventDefault(); e.stopImmediatePropagation(); toggle(); return;
    }
    if (!openNow) return;
    if (side.contains(e.target) && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault(); e.stopImmediatePropagation();
      step(e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);
      railWords[current].focus();
    }
  }, true);

  const shot = new URLSearchParams(location.search);
  if (shot.has('settings')) open(shot.get('settings') || null);

  function tilt(tx = 0, ty = 0) {
    btnStack.style.transform = `rotateY(${-30 + tx * 10}deg) rotateX(${-ty * 8}deg) rotateZ(${2 - tx * 1.5}deg)`;
  }
  tilt(0, 0);

  return {
    open, close, toggle,
    isOpen: () => openNow,
    page: () => current,
    tilt,
    restock: runRestock,
    // where the top-right words are on screen ({ l, t, r, b } px), or null while they are hidden
    buttonsBox() {
      if (!btnWrap.classList.contains('show')) return null;
      const r = btnStack.getBoundingClientRect();
      return r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
    },
    // the top-right words show once the intro is over (like the section buttons)
    show(on) { btnWrap.classList.toggle('show', on); if (on) refreshLayout(); },
  };
}
