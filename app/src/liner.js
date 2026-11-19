// Torn-paper overlay sheets matching Sienna's Settings & Tour aesthetic:
//   - Folded liner-note Lyrics sheet (pulled from YouTube Music's `next` -> Lyrics tab)
//   - Up Next Queue sheet (clickable upcoming tracks)
//   - Offline / load-error status banner with Retry button
//   - WebGL initialization fallback screen
import { INK, HOT, PAPER } from './controls.js';
import { torn, word } from './settings-panel.js';
import { onCursorTilt, tiltCSS } from './cursortilt.js';
import { onLettering } from './style.js';

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
  .ln-veil.show .ln-card.unfold .ln-flap, .ln-veil.closing .ln-card.unfold .ln-flap { animation: none !important; }
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
.ln-q { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ln-qi { display: flex; align-items: center; gap: 12px; padding: 7px 12px; border-radius: 6px; cursor: pointer;
  transition: background .15s, transform .15s; }
.ln-qi:hover { background: rgba(45,49,88,.08); transform: translateX(3px); }
.ln-qi.now { background: rgba(180,80,58,.14); }
.ln-qi.now .ln-qt { color: ${HOT}; }
.ln-qn { flex: none; width: 24px; text-align: right; font-size: 18px; color: #8c6c50; }
.ln-qtxt { flex: 1; min-width: 0; }
.ln-qt { font-size: 24px; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ln-qa { font-size: 17px; color: #7a5a40; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ln-qd { flex: none; font-size: 18px; color: #8c6c50; }
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

export function createLiner({ music } = {}) {
  if (!document.getElementById('ln-css')) {
    const st = document.createElement('style'); st.id = 'ln-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  // ---- modal sheet (lyrics or queue) ----
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

  let mode = null; // null | 'lyrics' | 'queue'
  let unlean = null;
  let closeTimer = 0;
  let seq = 0;

  const closeBtn = word('Close', 73, () => close());
  foot.appendChild(closeBtn);
  card.addEventListener('click', (e) => e.stopPropagation());
  veil.addEventListener('click', () => close());

  function openSheet(nextMode) {
    clearTimeout(closeTimer);
    mode = nextMode;
    veil.classList.remove('closing');
    // restart the CSS unfold animation cleanly even when switching modes
    veil.classList.remove('show');
    void card.offsetWidth;
    veil.classList.add('show');
    scroll.scrollTop = 0;
    requestAnimationFrame(() => closeBtn.paint());
    unlean ??= onCursorTilt((x, y) => { leaner.style.transform = tiltCSS(x, y, 5); });
  }

  function close() {
    if (!mode) return;
    mode = null;
    seq++;
    clearTimeout(closeTimer);
    veil.classList.remove('show');
    veil.classList.add('closing');
    closeTimer = setTimeout(() => { veil.classList.remove('closing'); }, 280);
    unlean?.(); unlean = null;
  }

  async function openLyrics(track) {
    if (mode === 'lyrics') { close(); return; }
    const my = ++seq;
    head.textContent = track?.title || 'Liner notes';
    sub.textContent = [track?.artist, track?.album].filter(Boolean).join(' · ') || 'Lyrics';
    srcEl.textContent = '';
    scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'ln-empty', textContent: 'Looking up the liner notes…' }));
    openSheet('lyrics');
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
    const my = ++seq;
    head.textContent = 'Up next';
    sub.textContent = 'Records stacked on the turntable';
    srcEl.textContent = '';
    scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'ln-empty', textContent: 'Checking the stack…' }));
    openSheet('queue');
    const items = await music.queue?.().catch(() => []);
    if (my !== seq || mode !== 'queue') return;
    if (!items?.length) {
      scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'ln-empty', textContent: 'Nothing in the queue yet — pick a record to start one.' }));
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'ln-q';
    items.forEach((it, idx) => {
      const li = document.createElement('li');
      li.className = `ln-qi${it.selected ? ' now' : ''}`;
      const num = document.createElement('span');
      num.className = 'ln-qn';
      num.textContent = it.selected ? '♪' : String(idx + 1);
      const txt = document.createElement('div');
      txt.className = 'ln-qtxt';
      const t = document.createElement('div'); t.className = 'ln-qt'; t.textContent = it.title || 'Untitled';
      const a = document.createElement('div'); a.className = 'ln-qa'; a.textContent = it.artist || '';
      txt.append(t, a);
      const d = document.createElement('span');
      d.className = 'ln-qd';
      d.textContent = it.durationText || mmss(it.duration);
      li.append(num, txt, d);
      li.addEventListener('click', () => {
        if (it.videoId) music.play({ videoId: it.videoId });
        else music.command('queueIndex', it.index ?? idx);
        close();
      });
      ul.appendChild(li);
    });
    scroll.replaceChildren(ul);
    const activeEl = ul.querySelector('.now');
    if (activeEl) activeEl.scrollIntoView({ block: 'center' });
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

  onLettering(veil, () => { closeBtn.paint(); retryBtn.paint(); });

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
