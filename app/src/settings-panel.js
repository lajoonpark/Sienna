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
import { COLORS, injectTokens } from './ui/tokens.js';
import { brushStroke } from './ui/brush.js';
import { torn, tornDepths } from './ui/paper.js';
import { settings } from './settings.js';
import { shortcuts, fromEvent } from './shortcuts.js';
import { rng } from './rand.js';
import { onCursorTilt, tiltCSS } from './cursortilt.js';

export { torn, tornDepths };

const CSS = `
.st-btn { position: fixed; top: 3.4vh; right: 2.2vw; z-index: var(--sienna-z-chrome); pointer-events: none; perspective: 900px; perspective-origin: 80% 50%;
  font-family: var(--sienna-font); color: var(--sienna-paper); font-size: var(--sienna-text-lg); line-height: 1; user-select: none; opacity: 0; transition: opacity var(--sienna-dur-slow) ease; }
.st-btn.show { opacity: .94; }
.st-btn-stack { display: flex; align-items: center; gap: var(--sienna-space-2); transform-style: preserve-3d; transform-origin: 100% 50%; will-change: transform; }
.st-btn .st-w { pointer-events: auto; }
.st-btn:not(.show) .st-w { pointer-events: none; }
.st-btn .st-w:hover { transform: translateX(-6px) translateZ(18px) rotate(calc(var(--sienna-tilt-md) * -1)); }
.st-btn .st-w:active { transform: translateZ(4px) scale(.97); }
.st-btn .st-w[disabled] { cursor: default; opacity: .92; }
.st-w { position: relative; display: inline-block; border: 0; padding: 0; background: none; cursor: pointer; font-family: var(--sienna-font);
  font-size: inherit; color: var(--sienna-paper); line-height: 1; transition: transform var(--sienna-dur-fast) var(--sienna-ease-pop); }
.st-w .plate { position: absolute; inset: 0; background-size: 100% 100%; transition: opacity var(--sienna-dur-mid); filter: drop-shadow(var(--sienna-shadow-rest)); }
.st-w .plate.hot { opacity: 0; }
.st-w:hover .plate.hot, .st-w.on .plate.hot { opacity: 1; }
.st-w:hover { transform: translateY(-2px) rotate(var(--sienna-tilt-md)); }
.st-w span { position: relative; display: block; padding: .16em 1em .1em .7em; white-space: nowrap; text-shadow: 0 0 1px rgba(248,241,226,.7); }
.st-btn .st-w span { padding: .16em .7em .1em 1em; }
.st-veil { position: fixed; inset: 0; z-index: var(--sienna-z-modal); display: flex; align-items: center; justify-content: center;
  background: var(--sienna-veil); perspective: 1600px; opacity: 0; visibility: hidden; transition: opacity var(--sienna-dur-mid) ease, visibility 0s var(--sienna-dur-mid); }
.st-veil.show { opacity: 1; visibility: visible; transition: opacity var(--sienna-dur-mid) ease; }
.st-veil.closing { opacity: 0; visibility: visible; pointer-events: none; transition: opacity var(--sienna-dur-mid) ease; }
/* the card leans toward the cursor (cursortilt.js); a wrapper carries the lean so the card's own open/close unfold stays */
.st-lean { display: flex; justify-content: center; will-change: transform; transform-style: preserve-3d; }
.st-card { position: relative; width: min(940px, 94vw); height: min(640px, 92vh); box-sizing: border-box; display: flex; flex-direction: column; padding: var(--sienna-space-8) var(--sienna-space-10) var(--sienna-space-6); color: var(--sienna-ink);
  font-family: var(--sienna-font); filter: drop-shadow(var(--sienna-shadow-lift));
  transform-style: preserve-3d; transform-origin: 50% 54%; transform: rotate(var(--sienna-tilt-sm)); }
.st-veil.show .st-card { animation: st-unfold var(--sienna-dur-slow) var(--sienna-ease-out) both; }
.st-veil.closing .st-card { animation: st-fold var(--sienna-dur-mid) var(--sienna-ease-in) both; }
@keyframes st-unfold {
  0%   { opacity: 0; transform: translateY(34px) translateZ(-95px) rotateX(64deg) rotateY(-9deg) rotateZ(-3deg) scaleY(.48) scaleX(.93); filter: drop-shadow(0 22px 28px rgba(50,35,25,.36)); }
  38%  { opacity: 1; transform: translateY(-6px) translateZ(18px) rotateX(-14deg) rotateY(3.2deg) rotateZ(.85deg) scaleY(1.028) scaleX(1.008); filter: drop-shadow(0 13px 18px rgba(50,35,25,.3)); }
  68%  { opacity: 1; transform: translateY(2px) translateZ(3px) rotateX(4.4deg) rotateY(-1.2deg) rotateZ(-.9deg) scaleY(.995) scaleX(1); }
  86%  { opacity: 1; transform: translateY(0) translateZ(0) rotateX(-1.3deg) rotateY(.35deg) rotateZ(-.3deg) scale(1); }
  100% { opacity: 1; transform: rotate(var(--sienna-tilt-sm)); filter: drop-shadow(var(--sienna-shadow-lift)); }
}
@keyframes st-fold {
  0%   { opacity: 1; transform: rotate(var(--sienna-tilt-sm)); }
  100% { opacity: 0; transform: translateY(26px) translateZ(-75px) rotateX(-50deg) rotateY(6deg) rotateZ(2.2deg) scaleY(.52) scaleX(.93); }
}
.st-paper { position: absolute; inset: 0; background: var(--sienna-paper); }
/* transient 3D unfolding flap: vanishes completely once the sheet settles flat */
.st-flap { position: absolute; left: 0; right: 0; top: 0; height: 50%; background: linear-gradient(180deg, var(--sienna-paper) 0%, var(--sienna-paper-lo) 100%);
  transform-origin: 50% 100%; backface-visibility: visible; pointer-events: none; opacity: 0; z-index: 4; }
.st-veil.show .st-flap { animation: st-flap-open var(--sienna-dur-slow) var(--sienna-ease-out) both; }
.st-veil.closing .st-flap { animation: st-flap-close var(--sienna-dur-mid) var(--sienna-ease-in) both; }
@keyframes st-flap-open {
  0%   { opacity: .95; transform: rotateX(-165deg); box-shadow: 0 12px 24px rgba(55,38,24,.26); }
  55%  { opacity: .58; transform: rotateX(-14deg); box-shadow: 0 4px 10px rgba(55,38,24,.1); }
  85%  { opacity: .16; transform: rotateX(4deg); box-shadow: none; }
  100% { opacity: 0; transform: rotateX(0deg); box-shadow: none; }
}
@keyframes st-flap-close {
  0%   { opacity: 0; transform: rotateX(0deg); }
  35%  { opacity: .55; transform: rotateX(-55deg); }
  100% { opacity: .9; transform: rotateX(-145deg); }
}
.st-head { position: relative; flex: none; font-size: var(--sienna-text-2xl); margin: 0 0 var(--sienna-space-3); color: var(--sienna-indigo); }
/* the rail on the left, the page on the right; a painted line between them */
.st-body { position: relative; flex: 1 1 auto; min-height: 0; display: flex; gap: 0 var(--sienna-space-8); }
.st-side { position: relative; flex: none; width: 190px; display: flex; flex-direction: column; align-items: flex-start; gap: var(--sienna-space-2); padding-top: var(--sienna-space-2); font-size: var(--sienna-text-lg); overflow-y: auto; scrollbar-width: none; }
.st-side::-webkit-scrollbar { display: none; }
.st-side .st-w:not(.on) .plate:not(.hot) { opacity: 0; }
.st-side .st-w:not(.on) span { color: var(--sienna-indigo); text-shadow: none; }
.st-side .st-w:not(.on):hover span { color: var(--sienna-paper); }
.st-rule { flex: none; width: 4px; align-self: stretch; margin: var(--sienna-space-2) 0; background-size: 100% 100%; opacity: .55; }
/* only the page scrolls: the paper, the title, the rail and DONE stay put, so the card is always whole */
.st-scroll { position: relative; flex: 1 1 auto; min-width: 0; overflow-y: auto; overflow-x: hidden; margin-right: -14px; padding-right: 14px; perspective: 900px;
  -webkit-mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent); mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent);
  padding-top: var(--sienna-space-2); padding-bottom: var(--sienna-space-2); scrollbar-width: thin; scrollbar-color: rgba(112,87,66,.45) transparent; }
.st-scroll::-webkit-scrollbar { width: 8px; }
.st-scroll::-webkit-scrollbar-track { background: transparent; }
.st-scroll::-webkit-scrollbar-thumb { background: rgba(112,87,66,.45); border-radius: 4px; }
.st-page { display: none; transform-origin: 0% 45%; }
.st-page.on { display: block; animation: st-in var(--sienna-dur-mid) var(--sienna-ease-out); }
@keyframes st-in {
  0%   { opacity: 0; transform: translateX(14px) rotateY(-18deg) rotateZ(-.6deg); }
  65%  { opacity: 1; transform: translateX(-1px) rotateY(2deg) rotateZ(.15deg); }
  100% { opacity: 1; transform: none; }
}
.st-row { position: relative; margin: 0 0 var(--sienna-space-5); }
.st-label { font-size: var(--sienna-text-lg); }
.st-hint { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); line-height: 1.4; color: var(--sienna-ink-2); margin: var(--sienna-space-1) 0 var(--sienna-space-3); }
.st-opts { display: flex; flex-wrap: wrap; gap: var(--sienna-space-2) var(--sienna-space-1); font-size: var(--sienna-text-lg); }
.st-keys .st-opts { align-items: center; gap: var(--sienna-space-2) var(--sienna-space-1); }
.st-kpair { display: inline-flex; align-items: center; gap: var(--sienna-space-1); white-space: nowrap; margin-right: var(--sienna-space-4); }
.st-kname { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); font-weight: 600; color: var(--sienna-ink-2); margin: 0 var(--sienna-space-1) 0 0; }
.st-keys .st-msg { min-height: 1.2em; color: var(--sienna-danger); }
/* Settings > Account */
.st-who { display: flex; align-items: center; gap: var(--sienna-space-4); margin: var(--sienna-space-1) 0 var(--sienna-space-2); }
.st-face { flex: none; width: 74px; height: 74px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: var(--sienna-terracotta); color: var(--sienna-paper); font-size: var(--sienna-text-xl); box-shadow: 0 0 0 3px var(--sienna-paper), 0 0 0 5px rgba(45,49,88,.55); }
.st-face.small { width: 34px; height: 34px; font-size: var(--sienna-text-sm); box-shadow: 0 0 0 2px var(--sienna-paper), 0 0 0 3px rgba(45,49,88,.4); }
.st-face img { width: 100%; height: 100%; object-fit: cover; }
.st-name { font-size: var(--sienna-text-xl); color: var(--sienna-indigo); line-height: 1.05; }
.st-handle { font-family: var(--sienna-serif); font-size: var(--sienna-text-sm); line-height: 1.35; color: var(--sienna-ink-2); }
.st-alt { display: flex; align-items: center; gap: var(--sienna-space-3); margin: 0 0 var(--sienna-space-2); font-size: var(--sienna-text-lg); }
.st-alt .st-hint { margin: 0; }
.st-confirm { display: none; }
.st-confirm.on { display: block; }
.st-confirm .st-hint { color: var(--sienna-danger); }
.st-small { font-family: var(--sienna-serif); font-size: var(--sienna-text-xs); line-height: 1.45; color: var(--sienna-ink-3); margin-top: var(--sienna-space-4); max-width: 44em; }
.st-foot { position: relative; flex: none; display: flex; padding-top: var(--sienna-space-2); justify-content: flex-end; font-size: var(--sienna-text-lg); }
@media (max-width: 720px) { .st-side { width: 130px; font-size: var(--sienna-text-md); } .st-body { gap: 0 var(--sienna-space-4); } .st-card { padding: var(--sienna-space-6) var(--sienna-space-5) var(--sienna-space-5); } }
`;

// A word in an oil-dab plate. Plates are painted once the word has its real size (after fonts load).
export function word(text, seed, onClick, { flipX = false } = {}) {
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
    cold.style.backgroundImage = `url(${brushStroke(w, h, COLORS.indigo, seed, { flipX })})`;
    hot.style.backgroundImage = `url(${brushStroke(w, h, COLORS.terracotta, seed, { flipX })})`;
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
  g.fillStyle = COLORS.indigo;
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

export function createSettingsPanel({ music = null, onTour = null, onRestock = null } = {}) {
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
  const topWords = [];
  let restockBtn = null;
  let restocking = false;
  let restockResetTimer = 0;

  function setRestockLabel(text, hot = false) {
    if (!restockBtn) return;
    restockBtn.querySelector('span').textContent = text;
    restockBtn.classList.toggle('on', hot);
    requestAnimationFrame(() => restockBtn.paint());
  }

  async function runRestock() {
    if (!onRestock || restocking) return;
    clearTimeout(restockResetTimer);
    restocking = true;
    if (restockBtn) restockBtn.disabled = true;
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
    if (restockBtn) restockBtn.disabled = false;
    setRestockLabel(ok ? 'Done!' : 'Restock', ok);
    if (ok) {
      restockResetTimer = setTimeout(() => {
        setRestockLabel('Restock', false);
      }, 1800);
    }
  }

  if (onRestock) {
    restockBtn = word('Restock', 13, () => runRestock(), { flipX: true });
    restockBtn.title = 'Refresh shelves from YouTube Music';
    btnStack.appendChild(restockBtn);
    topWords.push(restockBtn);
  }
  const btn = word('Settings', 17, () => toggle(), { flipX: true });
  btnStack.appendChild(btn);
  topWords.push(btn);
  document.body.appendChild(btnWrap);

  const veil = document.createElement('div');
  veil.className = 'st-veil';
  veil.innerHTML = `<div class="st-lean"><div class="st-card"><div class="st-paper"></div><div class="st-flap"></div><div class="st-head">Settings</div>
    <div class="st-body"><div class="st-side"></div><div class="st-rule"></div><div class="st-scroll"></div></div>
    <div class="st-foot"></div></div></div>`;
  document.body.appendChild(veil);
  const card = veil.querySelector('.st-card');
  const leaner = veil.querySelector('.st-lean');
  const side = veil.querySelector('.st-side');
  const rule = veil.querySelector('.st-rule');
  const scroller = veil.querySelector('.st-scroll');
  let unlean = null;
  let closeTimer = 0;
  card.querySelector('.st-paper').style.clipPath = torn(7);
  card.querySelector('.st-flap').style.clipPath = torn(7, 4, 8);
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
    { key: 'covers', label: 'Cover art', hint: 'How strongly album covers are painted over.', opts: ['Off', 'Light', 'Medium', 'Heavy'].map((l, i) => [l, i]) },
    { key: 'font', label: 'Lettering', hint: 'The handwriting on tags, signs and buttons. It changes straight away.', opts: Object.entries(FONTS).map(([k, f]) => [f.label, k, f]) },
  ], 23);
  const isMac = /Mac/.test(navigator.platform);
  const playbackPage = addPage('playback', 'Playback');
  settingRows(playbackPage, [
    { key: 'playOnArm', label: 'Start of a song', hint: 'Play when the arm touches the record and it spins, or straight away.', opts: [['When the arm lands', true], ['At once', false]] },
    ...(isMac ? [{ key: 'volumeMode', label: 'Volume control', hint: 'Control your Mac’s system volume, or keep Sienna’s volume separate from other apps.', opts: [['Mac system volume', 'system'], ['Sienna only', 'app']] }] : []),
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
    const loginOff = word('Off', 173, () => setLogin(false));
    const loginOn = word('On', 179, () => setLogin(true));
    loginBox.append(loginOff, loginOn);
    optWords.push(loginOff, loginOn);
    const markLogin = () => {
      loginOff.classList.toggle('on', !loginState);
      loginOn.classList.toggle('on', !!loginState);
    };
    const setLogin = (v) => {
      music.app.loginItem(v).then((res) => { loginState = !!res; markLogin(); }).catch(() => {});
    };
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

  // ---- About & Diagnostics: version, manual update check (privacy-first), sanitized debug report ----
  const aboutPage = addPage('about', 'About');
  const verHint = el('div', 'st-hint', 'Sienna — free, open-source 3D vinyl shop for YouTube Music (MIT License).');
  const unsignedNote = el('div', 'st-small', 'Open-source releases are unsigned (no paid Apple or Microsoft certificate). Installing via Homebrew on macOS automatically clears macOS quarantine (xattr).');
  const { row: updRow, box: updBox } = makeRow('Updates', 'Sienna never phones home in the background. Check GitHub Releases manually whenever you like.');
  const updMsg = el('div', 'st-hint');
  updRow.appendChild(updMsg);
  let releaseUrl = null;
  const openRelBtn = word('Open release page', 293, () => { if (releaseUrl) music?.app?.openRelease?.(releaseUrl); });
  openRelBtn.style.display = 'none';
  const checkBtn = word('Check for updates', 283, async () => {
    updMsg.textContent = 'Checking GitHub Releases…';
    openRelBtn.style.display = 'none';
    const res = await music?.app?.checkUpdates?.().catch(() => ({ ok: false, error: 'Could not check for updates.' }));
    if (!res?.ok) {
      updMsg.textContent = res?.error || 'Could not reach GitHub.';
    } else if (res.hasUpdate) {
      releaseUrl = res.url;
      updMsg.textContent = `Sienna ${res.latest} is available (you have ${res.current}).`;
      openRelBtn.style.display = '';
      requestAnimationFrame(paintAll);
    } else {
      updMsg.textContent = res.note || `You are up to date (v${res.current}).`;
    }
  });
  updBox.append(checkBtn, openRelBtn);
  optWords.push(checkBtn, openRelBtn);

  const { row: diagRow, box: diagBox } = makeRow('Diagnostics', 'Copy a sanitized summary (version, OS, GPU, player status — never cookies, account info, or listening history) for bug reports.');
  const diagMsg = el('div', 'st-hint');
  diagRow.appendChild(diagMsg);
  const copyDiagBtn = word('Copy debug info', 307, async () => {
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
  aboutPage.append(verHint, updRow, diagRow, unsignedNote);
  music?.app?.info?.().then((info) => {
    if (info?.version) verHint.textContent = `Sienna v${info.version} — free, open-source 3D vinyl shop for YouTube Music (MIT License).`;
  }).catch(() => {});

  const done = word('Done', 31, () => close());
  card.querySelector('.st-foot').appendChild(done);

  const paintAll = () => {
    for (const w of topWords) w.paint();
    if (!openNow) return;
    for (const w of [...Object.values(railWords), ...optWords, done]) w.paint();
    paintRule(rule, 5);
  };
  document.fonts?.ready.then(paintAll);
  onLettering(done, paintAll); // Settings > Lettering: words reflow in the new face, plates follow
  document.fonts?.addEventListener?.('loadingdone', paintAll); // the lettering choices load when first shown
  requestAnimationFrame(paintAll);

  let openNow = false;
  function open(page = null) {
    clearTimeout(closeTimer);
    openNow = true;
    veil.classList.remove('closing');
    veil.classList.remove('show');
    void card.offsetWidth;
    veil.classList.add('show');
    if (page || !current) show(page || 'account');
    else PAGES.find((x) => x.id === current)?.onShow?.();   // the same page as last time, brought up to date
    paintAll();
    requestAnimationFrame(paintAll);
    // a big card, so a gentler lean than the tour's notes
    unlean ??= onCursorTilt((x, y) => { leaner.style.transform = tiltCSS(x, y, 5); });
  }
  function close() {
    if (!openNow) return;
    stopRecording();
    openNow = false;
    clearTimeout(closeTimer);
    veil.classList.remove('show');
    veil.classList.add('closing');
    closeTimer = setTimeout(() => { veil.classList.remove('closing'); }, 280);
    unlean?.(); unlean = null; // it holds its last lean while it folds away
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
    // the top-right words show once the intro is over (like the section buttons)
    show(on) { btnWrap.classList.toggle('show', on); if (on) requestAnimationFrame(paintAll); },
  };
}
