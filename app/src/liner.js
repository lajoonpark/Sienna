// Torn-paper overlay sheets matching Sienna's Settings & Tour aesthetic:
//   - Lyrics sheet with 3D paper-unfold animation (pulled from YouTube Music's `next` -> Lyrics tab)
//   - Up Next Queue list that emerges directly from the open suitcase bottom drawer
//   - Offline / load-error status banner with Retry button
//   - WebGL initialization fallback screen
import { INK, HOT, PAPER } from './controls.js';
import { torn, word } from './settings-panel.js';
import { onCursorTilt, tiltCSS } from './cursortilt.js';
import { onLettering } from './style.js';
import { paintedCoverURL } from './coverpaint.js';
import { rng } from './rand.js';

const CSS = `
.ln-veil { position: fixed; inset: 0; z-index: 65; display: flex; align-items: center; justify-content: center;
  background: rgba(60,45,35,.18); perspective: 1500px; opacity: 0; visibility: hidden;
  transition: opacity .26s ease, visibility 0s .32s; font-family: var(--sienna-font); color: #2b2436; }
.ln-veil.show { opacity: 1; visibility: visible; transition: opacity .26s ease; }
.ln-veil.closing { opacity: 0; visibility: visible; pointer-events: none; transition: opacity .26s ease; }
.ln-lean { display: flex; justify-content: center; will-change: transform; transform-style: preserve-3d; }
.ln-card { position: relative; width: min(560px, 90vw); max-height: min(640px, 84vh); box-sizing: border-box;
  display: flex; flex-direction: column; padding: 28px 34px 22px; filter: drop-shadow(0 8px 14px rgba(45,30,20,.28));
  transform-style: preserve-3d; transform-origin: 50% 54%; transform: rotate(-.4deg); }
.ln-veil.show .ln-card.unfold { animation: ln-unfold .62s cubic-bezier(.22,.82,.28,1) both; }
.ln-veil.closing .ln-card.unfold { animation: ln-fold .26s ease-in both; }
@keyframes ln-unfold {
  0%   { opacity: 0; transform: translateY(34px) translateZ(-90px) rotateX(66deg) rotateY(-10deg) rotateZ(-3.2deg) scaleY(.48) scaleX(.92); filter: drop-shadow(0 22px 26px rgba(45,30,20,.38)); }
  38%  { opacity: 1; transform: translateY(-6px) translateZ(18px) rotateX(-15deg) rotateY(3.6deg) rotateZ(.9deg) scaleY(1.03) scaleX(1.01); filter: drop-shadow(0 14px 18px rgba(45,30,20,.32)); }
  68%  { opacity: 1; transform: translateY(2px) translateZ(3px) rotateX(4.8deg) rotateY(-1.4deg) rotateZ(-.85deg) scaleY(.994) scaleX(1); filter: drop-shadow(0 9px 15px rgba(45,30,20,.29)); }
  86%  { opacity: 1; transform: translateY(0) translateZ(0) rotateX(-1.4deg) rotateY(.4deg) rotateZ(-.25deg) scale(1); }
  100% { opacity: 1; transform: rotate(-.4deg); filter: drop-shadow(0 8px 14px rgba(45,30,20,.28)); }
}
@keyframes ln-fold {
  0%   { opacity: 1; transform: rotate(-.4deg); }
  100% { opacity: 0; transform: translateY(26px) translateZ(-70px) rotateX(-52deg) rotateY(7deg) rotateZ(2.4deg) scaleY(.52) scaleX(.93); }
}
.ln-paper { position: absolute; inset: 0; background: #f4ead6; }
/* transient 3D unfolding flap: visible only during the unfold/fold motion, completely gone once settled */
.ln-flap { position: absolute; left: 0; right: 0; top: 0; height: 50%; background: linear-gradient(180deg, #f6eedc 0%, #efe2c8 100%);
  transform-origin: 50% 100%; backface-visibility: visible; pointer-events: none; opacity: 0; z-index: 3; }
.ln-veil.show .ln-card.unfold .ln-flap { animation: ln-flap-open .56s cubic-bezier(.22,.82,.3,1) both; }
.ln-veil.closing .ln-card.unfold .ln-flap { animation: ln-flap-close .24s ease-in both; }
@keyframes ln-flap-open {
  0%   { opacity: .96; transform: rotateX(-165deg); box-shadow: 0 12px 24px rgba(55,38,24,.28); }
  55%  { opacity: .62; transform: rotateX(-14deg); box-shadow: 0 4px 10px rgba(55,38,24,.12); }
  85%  { opacity: .18; transform: rotateX(4deg); box-shadow: none; }
  100% { opacity: 0; transform: rotateX(0deg); box-shadow: none; }
}
@keyframes ln-flap-close {
  0%   { opacity: 0; transform: rotateX(0deg); }
  35%  { opacity: .55; transform: rotateX(-55deg); }
  100% { opacity: .9; transform: rotateX(-145deg); }
}
@media (prefers-reduced-motion: reduce) {
  .ln-veil.show .ln-card.unfold, .ln-veil.closing .ln-card.unfold,
  .ln-veil.show .ln-card.unfold .ln-flap, .ln-veil.closing .ln-card.unfold .ln-flap,
  .ln-qveil.show .ln-qslip, .ln-qveil.closing .ln-qslip { animation: none !important; transition: none !important; }
  .ln-flap { display: none; }
}
.ln-head { position: relative; flex: none; margin: 0 0 4px; font-size: 36px; line-height: 1.05; color: ${INK}; }
.ln-sub { position: relative; flex: none; margin: 0 0 14px; font-size: 20px; color: #7a5a40; }
.ln-scroll { position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
  margin-right: -12px; padding: 6px 14px 10px 0;
  -webkit-mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent);
  mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent);
  scrollbar-width: thin; scrollbar-color: rgba(122,90,64,.45) transparent; }
.ln-scroll::-webkit-scrollbar { width: 7px; }
.ln-scroll::-webkit-scrollbar-thumb { background: rgba(122,90,64,.45); border-radius: 4px; }
.ln-lyrics { white-space: pre-wrap; font-size: 24px; line-height: 1.38; color: #2b2436; user-select: text; }
.ln-src { position: relative; flex: none; margin-top: 10px; font-size: 16px; color: #8c6c50; }
.ln-foot { position: relative; flex: none; display: flex; justify-content: flex-end; gap: 10px; padding-top: 10px; font-size: 26px; }
.ln-empty { font-size: 23px; color: #7a5a40; padding: 18px 0; }

/* ---- Queue overlay: songs emerge physically from the open suitcase bottom drawer ---- */
.ln-qveil { position: fixed; inset: 0; z-index: 64; pointer-events: none; visibility: hidden; opacity: 0;
  transition: opacity .22s ease, visibility 0s .28s; font-family: var(--sienna-font); user-select: none; }
.ln-qveil.show { pointer-events: auto; visibility: visible; opacity: 1; transition: opacity .22s ease; }
.ln-qveil.closing { pointer-events: none; visibility: visible; opacity: 0; transition: opacity .24s ease .08s; }
.ln-qbackdrop { position: absolute; inset: 0; background: rgba(40,28,20,.14); }
.ln-qbox { position: fixed; left: 50%; top: 7vh; transform: translateX(-50%); width: min(560px, 90vw);
  max-height: min(68vh, 620px); display: flex; flex-direction: column; pointer-events: auto; }
.ln-qtop { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 8px 8px;
  opacity: 0; transform: translateY(18px) scale(.94); transition: opacity .32s ease, transform .38s cubic-bezier(.22,.85,.3,1); }
.ln-qveil.show .ln-qtop { opacity: 1; transform: none; }
.ln-qveil.closing .ln-qtop { opacity: 0; transform: translateY(14px) scale(.94); transition: opacity .18s ease, transform .18s ease; }
.ln-qtitle { position: relative; padding: 8px 24px 7px 18px; font-size: 32px; line-height: 1; color: ${INK};
  background: #f4ead6; transform: rotate(-1.1deg); filter: drop-shadow(0 4px 8px rgba(35,24,18,.24)); }
.ln-qclose { font-size: 26px; }
.ln-qscroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: visible; padding: 8px 14px 20px;
  scrollbar-width: thin; scrollbar-color: rgba(45,49,88,.45) transparent; }
.ln-qscroll::-webkit-scrollbar { width: 6px; }
.ln-qscroll::-webkit-scrollbar-thumb { background: rgba(45,49,88,.45); border-radius: 3px; }
.ln-qlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ln-qslip { position: relative; display: flex; align-items: center; gap: 12px; padding: 10px 20px 10px 14px;
  background: #f6eedc; color: #2b2436; cursor: pointer; filter: drop-shadow(0 4px 7px rgba(32,22,18,.22));
  transform: rotate(var(--r, 0deg)); transition: background .16s ease, color .16s ease, transform .18s cubic-bezier(.25,1.4,.4,1);
  will-change: transform, opacity; }
.ln-qslip.emerging {
  animation: ln-q-out .56s cubic-bezier(.2,.88,.28,1) var(--delay, 0ms) both;
}
.ln-qslip.tucking {
  animation: ln-q-in .24s cubic-bezier(.55,.06,.78,.32) var(--cdelay, 0ms) both;
}
@keyframes ln-q-out {
  0%   { opacity: 0; transform: translate(var(--fx, -220px), var(--fy, 320px)) scale(.24) rotate(-14deg); }
  22%  { opacity: 1; }
  72%  { opacity: 1; transform: translate(calc(var(--fx, -220px) * -.03), -7px) scale(1.025) rotate(calc(var(--r, 0deg) + 1.2deg)); }
  100% { opacity: 1; transform: translate(0, 0) scale(1) rotate(var(--r, 0deg)); }
}
@keyframes ln-q-in {
  0%   { opacity: 1; transform: translate(0, 0) scale(1) rotate(var(--r, 0deg)); }
  100% { opacity: 0; transform: translate(var(--fx, -220px), var(--fy, 320px)) scale(.24) rotate(-12deg); }
}
.ln-qslip:hover { background: ${HOT}; color: ${PAPER}; transform: translateX(6px) scale(1.015) rotate(0deg); z-index: 2; }
.ln-qslip.now { background: ${INK}; color: ${PAPER}; }
.ln-qslip.now:hover { background: ${HOT}; color: ${PAPER}; }
.ln-qslip:hover .ln-qa, .ln-qslip:hover .ln-qd, .ln-qslip:hover .ln-qn,
.ln-qslip.now .ln-qa, .ln-qslip.now .ln-qd, .ln-qslip.now .ln-qn { color: rgba(251,245,232,.84); }
.ln-qcov { flex: none; width: 42px; height: 42px; background: #d9cbb2; transform: rotate(-2.5deg); overflow: hidden;
  box-shadow: 0 1px 3px rgba(30,20,14,.25); }
.ln-qcov img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ln-qn { flex: none; width: 22px; text-align: right; font-size: 18px; color: #8c6c50; }
.ln-qtxt { flex: 1; min-width: 0; }
.ln-qt { font-size: 25px; line-height: 1.04; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ln-qa { font-size: 17px; color: #7a5a40; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.ln-qd { flex: none; font-size: 18px; color: #8c6c50; }
.ln-qempty { padding: 18px 24px; background: #f4ead6; color: #7a5a40; font-size: 24px; text-align: center;
  filter: drop-shadow(0 4px 8px rgba(32,22,18,.2)); transform: rotate(-.6deg); }

/* offline / error banner at top centre */
.ln-banner { position: fixed; top: 3vh; left: 50%; z-index: 55; transform: translateX(-50%) rotate(-.5deg);
  display: none; align-items: center; gap: 16px; padding: 12px 24px; font-family: var(--sienna-font);
  color: #2b2436; filter: drop-shadow(0 5px 10px rgba(40,28,20,.25)); max-width: min(640px, 90vw); }
.ln-banner.show { display: flex; }
.ln-banner .ln-bpaper { position: absolute; inset: 0; background: #f4ead6; z-index: -1; }
.ln-banner .ln-bmsg { font-size: 23px; line-height: 1.15; }
.ln-banner .ln-bact { flex: none; font-size: 22px; }
/* WebGL fallback */
.ln-fatal { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  background: #1b1410; padding: 24px; font-family: system-ui, -apple-system, sans-serif; }
.ln-fatal-card { max-width: 520px; background: #f4ead6; color: #2b2436; padding: 28px 32px; border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,.45); }
.ln-fatal-card h1 { margin: 0 0 10px; font-size: 22px; color: ${INK}; }
.ln-fatal-card p { margin: 0 0 12px; font-size: 15px; line-height: 1.5; }
.ln-fatal-card code { font-size: 13px; background: rgba(45,49,88,.1); padding: 2px 6px; border-radius: 4px; }
`;

const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

export function showWebGLError(err) {
  if (!document.getElementById('ln-css')) {
    const st = document.createElement('style'); st.id = 'ln-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const wrap = document.createElement('div');
  wrap.className = 'ln-fatal';
  const card = document.createElement('div');
  card.className = 'ln-fatal-card';
  const h1 = document.createElement('h1'); h1.textContent = 'Sienna could not start 3D graphics (WebGL)';
  const p1 = document.createElement('p'); p1.textContent = 'Sienna renders its painted Tuscan record shop with WebGL2, which is currently unavailable on this system or disabled in your GPU driver.';
  const p2 = document.createElement('p'); p2.textContent = `Details: ${String(err?.message ?? err ?? 'WebGL context creation failed')}`;
  card.append(h1, p1, p2);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
}

export function createLiner({ music, onQueueOpen = null, onQueueClose = null, getDrawerPos = null, onPickQueue = null } = {}) {
  if (!document.getElementById('ln-css')) {
    const st = document.createElement('style'); st.id = 'ln-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  // ---- lyrics sheet (3D paper unfold) ----
  const veil = document.createElement('div');
  veil.className = 'ln-veil';
  veil.innerHTML = `<div class="ln-lean"><div class="ln-card unfold"><div class="ln-paper"></div><div class="ln-flap"></div>
    <div class="ln-head"></div><div class="ln-sub"></div>
    <div class="ln-scroll"></div><div class="ln-src"></div>
    <div class="ln-foot"></div></div></div>`;
  document.body.appendChild(veil);
  const leaner = veil.querySelector('.ln-lean');
  const card = veil.querySelector('.ln-card');
  const paper = veil.querySelector('.ln-paper');
  const flap = veil.querySelector('.ln-flap');
  const head = veil.querySelector('.ln-head');
  const sub = veil.querySelector('.ln-sub');
  const scroll = veil.querySelector('.ln-scroll');
  const srcEl = veil.querySelector('.ln-src');
  const foot = veil.querySelector('.ln-foot');
  paper.style.clipPath = torn(43);
  flap.style.clipPath = torn(43, 4, 8);

  // ---- queue drawer-to-list overlay ----
  const qveil = document.createElement('div');
  qveil.className = 'ln-qveil';
  qveil.innerHTML = `<div class="ln-qbackdrop"></div><div class="ln-qbox">
    <div class="ln-qtop"><div class="ln-qtitle">Up next</div><div class="ln-qclose"></div></div>
    <div class="ln-qscroll"><ul class="ln-qlist"></ul></div>
  </div>`;
  document.body.appendChild(qveil);
  const qBackdrop = qveil.querySelector('.ln-qbackdrop');
  const qBox = qveil.querySelector('.ln-qbox');
  const qTitle = qveil.querySelector('.ln-qtitle');
  const qCloseWrap = qveil.querySelector('.ln-qclose');
  const qScroll = qveil.querySelector('.ln-qscroll');
  const qList = qveil.querySelector('.ln-qlist');
  qTitle.style.clipPath = torn(61, 3, 6);

  let mode = null; // null | 'lyrics' | 'queue'
  let unlean = null;
  let closeTimer = 0;
  let qCloseTimer = 0;
  let seq = 0;

  const closeBtn = word('Close', 73, () => close());
  foot.appendChild(closeBtn);
  const qCloseBtn = word('Close', 79, () => close());
  qCloseWrap.appendChild(qCloseBtn);

  card.addEventListener('click', (e) => e.stopPropagation());
  veil.addEventListener('click', () => close());
  qBox.addEventListener('click', (e) => e.stopPropagation());
  qBackdrop.addEventListener('click', () => close());

  function openLyricsSheet() {
    clearTimeout(closeTimer);
    mode = 'lyrics';
    veil.classList.remove('closing');
    veil.classList.remove('show');
    void card.offsetWidth;
    veil.classList.add('show');
    scroll.scrollTop = 0;
    requestAnimationFrame(() => closeBtn.paint());
    unlean ??= onCursorTilt((x, y) => { leaner.style.transform = tiltCSS(x, y, 5); });
  }

  function closeLyricsSheet() {
    clearTimeout(closeTimer);
    veil.classList.remove('show');
    veil.classList.add('closing');
    closeTimer = setTimeout(() => { veil.classList.remove('closing'); }, 280);
    unlean?.(); unlean = null;
  }

  function drawerOrigin() {
    const pos = getDrawerPos?.();
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return pos;
    return { x: innerWidth * 0.16, y: innerHeight * 0.80 };
  }

  function closeQueueOverlay({ keepDrawer = false } = {}) {
    clearTimeout(qCloseTimer);
    const origin = drawerOrigin();
    const slips = [...qList.querySelectorAll('.ln-qslip')];
    const scrollBox = qScroll.getBoundingClientRect();
    const visible = slips.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom >= scrollBox.top - 20 && r.top <= scrollBox.bottom + 20;
    });
    visible.forEach((el, k) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--fx', `${Math.round(origin.x - (r.left + r.width / 2))}px`);
      el.style.setProperty('--fy', `${Math.round(origin.y - (r.top + r.height / 2))}px`);
      el.style.setProperty('--cdelay', `${Math.min(110, (visible.length - 1 - k) * 18)}ms`);
      el.classList.remove('emerging');
      el.classList.add('tucking');
    });
    qveil.classList.remove('show');
    qveil.classList.add('closing');
    qCloseTimer = setTimeout(() => {
      qveil.classList.remove('closing');
      if (!keepDrawer) onQueueClose?.();
    }, keepDrawer ? 220 : 210);
  }

  function close({ keepDrawer = false } = {}) {
    if (!mode) return;
    const prev = mode;
    mode = null;
    seq++;
    if (prev === 'lyrics') closeLyricsSheet();
    else if (prev === 'queue') closeQueueOverlay({ keepDrawer });
  }

  async function openLyrics(track) {
    if (mode === 'lyrics') { close(); return; }
    if (mode === 'queue') close();
    const my = ++seq;
    head.textContent = track?.title || 'Liner notes';
    sub.textContent = [track?.artist, track?.album].filter(Boolean).join(' · ') || 'Lyrics';
    srcEl.textContent = '';
    scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'ln-empty', textContent: 'Looking up the liner notes…' }));
    openLyricsSheet();
    if (!track?.videoId) {
      scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'ln-empty', textContent: 'Play a record first to read its lyrics.' }));
      return;
    }
    const res = await music.lyrics?.(track.videoId).catch(() => null);
    if (my !== seq || mode !== 'lyrics') return;
    if (!res?.lyrics) {
      scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'ln-empty', textContent: 'No lyrics are available for this track on YouTube Music.' }));
      return;
    }
    const body = document.createElement('div');
    body.className = 'ln-lyrics';
    body.textContent = res.lyrics;
    scroll.replaceChildren(body);
    srcEl.textContent = res.source || '';
  }

  async function openQueue() {
    if (mode === 'queue') { close(); return; }
    if (mode === 'lyrics') close();
    const my = ++seq;
    clearTimeout(qCloseTimer);
    mode = 'queue';

    // Step 1: fetch the queue tracks while sliding the entire bottom drawer of the suitcase open
    const itemsPromise = music.queue?.().catch(() => []) ?? Promise.resolve([]);
    const items = await itemsPromise;
    if (my !== seq || mode !== 'queue') return;

    // Open the full bottom drawer (showing the top queue covers inside it) and wait for it to slide out
    const drawerReady = onQueueOpen ? Promise.resolve(onQueueOpen(items)) : Promise.resolve();
    await drawerReady;
    if (my !== seq || mode !== 'queue') return;

    // Step 2: populate the Queue slips and launch them straight out of the open suitcase drawer
    qList.innerHTML = '';
    qScroll.scrollTop = 0;
    qveil.classList.remove('closing');

    if (!items?.length) {
      const empty = document.createElement('li');
      empty.className = 'ln-qempty';
      empty.style.clipPath = torn(55, 3, 6);
      empty.textContent = 'Nothing in the queue yet — pick a record to start one.';
      qList.appendChild(empty);
      qveil.classList.add('show');
      requestAnimationFrame(() => qCloseBtn.paint());
      return;
    }

    const slips = [];
    items.forEach((it, idx) => {
      const r = rng(301 + idx * 19);
      const li = document.createElement('li');
      li.className = `ln-qslip${it.selected ? ' now' : ''}`;
      li.style.clipPath = torn(110 + (idx % 7) * 13, 3, 6);
      li.style.setProperty('--r', `${((r() - 0.5) * 1.4).toFixed(2)}deg`);

      const num = document.createElement('span');
      num.className = 'ln-qn';
      num.textContent = it.selected ? '♪' : String(idx + 1);

      const cov = document.createElement('div');
      cov.className = 'ln-qcov';
      if (it.art) {
        const img = new Image();
        img.alt = '';
        img.decoding = 'async';
        paintedCoverURL(it.art).then((src) => { if (src) { img.src = src; cov.replaceChildren(img); } });
      }

      const txt = document.createElement('div');
      txt.className = 'ln-qtxt';
      const t = document.createElement('div'); t.className = 'ln-qt'; t.textContent = it.title || 'Untitled';
      const a = document.createElement('div'); a.className = 'ln-qa'; a.textContent = it.artist || '';
      txt.append(t, a);

      const d = document.createElement('span');
      d.className = 'ln-qd';
      d.textContent = it.durationText || mmss(it.duration);

      li.append(num, cov, txt, d);
      li.addEventListener('click', () => {
        if (onPickQueue) {
          close({ keepDrawer: true });
          onPickQueue(it, idx);
        } else {
          if (it.videoId) music.play({ videoId: it.videoId });
          else music.command('queueIndex', it.index ?? idx);
          close();
        }
      });
      qList.appendChild(li);
      slips.push(li);
    });

    // Reveal the container first (still invisible for 1 frame) so we can measure each slip's exact final rect
    qveil.classList.add('show');
    requestAnimationFrame(() => qCloseBtn.paint());

    const activeEl = qList.querySelector('.now');
    if (activeEl) activeEl.scrollIntoView({ block: 'center' });

    const origin = drawerOrigin();
    const boxRect = qScroll.getBoundingClientRect();
    let order = 0;
    slips.forEach((li) => {
      const rect = li.getBoundingClientRect();
      const visible = rect.bottom >= boxRect.top - 40 && rect.top <= boxRect.bottom + 40;
      const fx = Math.round(origin.x - (rect.left + rect.width / 2));
      const fy = Math.round(origin.y - (rect.top + rect.height / 2));
      li.style.setProperty('--fx', `${fx}px`);
      li.style.setProperty('--fy', `${fy}px`);
      if (visible) {
        li.style.setProperty('--delay', `${Math.min(480, (order++) * 38)}ms`);
        li.classList.add('emerging');
      }
    });
  }

  // ---- offline / error status banner ----
  const banner = document.createElement('div');
  banner.className = 'ln-banner';
  const bpaper = document.createElement('div'); bpaper.className = 'ln-bpaper';
  bpaper.style.clipPath = torn(89, 4, 8);
  const bmsg = document.createElement('div'); bmsg.className = 'ln-bmsg';
  const bact = document.createElement('div'); bact.className = 'ln-bact';
  let retryCb = null;
  const retryBtn = word('Retry', 97, () => retryCb?.());
  bact.appendChild(retryBtn);
  banner.append(bpaper, bmsg, bact);
  document.body.appendChild(banner);

  function setStatus(message, onRetry = null) {
    retryCb = onRetry;
    if (!message) {
      banner.classList.remove('show');
      return;
    }
    bmsg.textContent = message;
    bact.style.display = onRetry ? '' : 'none';
    banner.classList.add('show');
    requestAnimationFrame(() => retryBtn.paint());
  }

  onLettering(veil, () => { closeBtn.paint(); qCloseBtn.paint(); retryBtn.paint(); });

  addEventListener('keydown', (e) => {
    if (!mode) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);

  return {
    openLyrics,
    openQueue,
    close,
    setStatus,
    isOpen: () => !!mode,
  };
}
