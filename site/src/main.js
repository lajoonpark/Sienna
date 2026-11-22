import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/amatic-sc/700.css';
import '@fontsource/caveat/400.css';
import './style.css';
import { createScene } from './scene.js';
import { skyAt, lanternLevel, hourNow, clockLabel } from './sky.js';
import { clamp, timeLabel, rand, scrollToMode, MODE } from './layout.js';
import { brushPlate, lineUrl } from './ui/brush.js';
import { paperSurface, tornBand } from './ui/paper.js';
import { icon } from './ui/icons.js';
import { dabCluster, TONES } from './paint/brushpaint.js';
import { COLORS } from './paint/tokens.js';
import { RECORDS, subtitleOf } from './paint/records.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

// Every letter of a heading and every word of body copy is its own hover target.
for (const el of $$('[data-letters]')) {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.textContent = '';
  let i = 0;
  text.split(' ').forEach((word, n, all) => {
    const w = document.createElement('span');
    w.style.whiteSpace = 'nowrap';
    w.setAttribute('aria-hidden', 'true');
    for (const c of word) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.style.setProperty('--r', `${(rand(i++, 3) - 0.5) * 22}deg`);
      s.textContent = c;
      w.append(s);
    }
    el.append(w, n < all.length - 1 ? ' ' : '');
  });
}
for (const el of $$('[data-words]')) {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  words.forEach((w, i) => {
    const s = document.createElement('span');
    s.className = 'w';
    s.textContent = w;
    el.append(s, i < words.length - 1 ? ' ' : '');
  });
}
$$('.lanterns i').forEach((l, i) => l.style.setProperty('--n', i));

// ---- the painted kit, once the lettering has loaded (plates are sized to their words) ----
const fontsIn = Promise.all([
  document.fonts.load('700 30px "Amatic SC"'), document.fonts.load('400 20px Alegreya'), document.fonts.load('400 24px Caveat'),
]).catch(() => {});
fontsIn.then(() => {
  for (const el of $$('[data-brush]')) brushPlate(el, { tone: el.dataset.brush, hot: el.dataset.hot ?? (el.dataset.brush === 'ink' ? 'hot' : null), seed: Number(el.dataset.seed) || 17 });
  for (const el of $$('[data-paper]')) paperSurface(el, { seed: Number(el.dataset.paper) || 1, amp: el.classList.contains('card') || el.classList.contains('note-card') ? 6 : 4 });
  root.style.setProperty('--underline', `url(${lineUrl(180, 12, COLORS.terracotta, 505)})`);
  root.style.setProperty('--track', `url(${lineUrl(400, 16, COLORS.paperLo, 62, { soft: true })})`);
});

// ---- the now-playing tag (the app's caption): title, artist, a painted progress line, tools ----
const caption = $('.caption');
const capT = $('.t', caption), capA = $('.a', caption), capBar = $('.bar', caption), capFill = $('.bar i', caption), capTime = $('.time', caption);
const stampDot = (hot) => dabCluster(44, 44, { tones: hot ? TONES.hot : TONES.track, seed: hot ? 73 : 79, rows: 2, tilt: 0.14, overlap: 0.58, minCols: 1, impasto: hot ? 0.52 : 0.25, even: hot, soft: !hot, solid: true, scale: 1.5 });
fontsIn.then(() => {
  const warm = stampDot(false), hot = stampDot(true);
  for (const [name, label] of [['volume', 'Mute'], ['shuffle', 'Shuffle'], ['repeat', 'Repeat']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', label);
    const w = Object.assign(document.createElement('span'), { className: 'warm' });
    const h = Object.assign(document.createElement('span'), { className: 'hot' });
    w.style.backgroundImage = `url(${warm})`;
    h.style.backgroundImage = `url(${hot})`;
    const tip = Object.assign(document.createElement('span'), { className: 'tip', textContent: `${label}: off` });
    b.append(w, h, icon(name), tip);
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      tip.textContent = `${label}: ${on ? 'on' : 'off'}`;
      if (name === 'volume') b.replaceChild(icon(on ? 'mute' : 'volume'), b.querySelector('svg'));
    });
    $('.tools', caption).append(b);
  }
  const w = Math.max(160, Math.round(capBar.offsetWidth || 240));
  caption.style.setProperty('--barw', `${w}px`);
  caption.style.setProperty('--track', `url(${lineUrl(w, 16, COLORS.paperLo, 62, { soft: true })})`);
  caption.style.setProperty('--fill', `url(${lineUrl(w, 16, COLORS.indigo, 63)})`);
  caption.style.setProperty('--fillhot', `url(${lineUrl(w, 16, COLORS.terracotta, 64)})`);
});

const cursor = $('.cursor');
const rackTag = $('.rack-tag');
let lastCap = '';

let scene = null;
try {
  scene = createScene($('#vinyls'), {
    onHover(kind) {
      cursor.classList.toggle('disk', kind === 'disk');
      cursor.classList.toggle('player', kind === 'player');
      cursor.classList.toggle('case', kind === 'link');
    },
    onRack(r) {
      rackTag.classList.toggle('show', !!r.visible);
      if (!r.visible) return;
      const rec = RECORDS[r.index];
      if (rackTag.dataset.index !== String(r.index)) {
        rackTag.dataset.index = String(r.index);
        rackTag.querySelector('.rack-tag-title').textContent = rec.title;
        rackTag.querySelector('.rack-tag-sub').textContent = subtitleOf(rec);
      }
      const x = clamp(r.x - rackTag.offsetWidth / 2 + 6, 12, innerWidth - rackTag.offsetWidth - 12);
      const y = clamp(r.y - 14, 12, innerHeight - rackTag.offsetHeight - 12);
      rackTag.style.transform = `translate(${x}px, ${y}px) rotate(2deg)`;
    },
    onPlayer(p) {
      caption.classList.toggle('show', p.visible && !!p.rect);
      if (!p.visible || !p.rect) return;
      const key = `${p.index}|${p.liked}`;
      if (key !== lastCap) { lastCap = key; capT.textContent = p.title; capA.textContent = p.artist; }
      const frac = p.total ? p.seconds / p.total : 0;
      capFill.style.width = `${frac * 100}%`;
      capTime.textContent = `${timeLabel(p.seconds)} / ${timeLabel(p.total)}`;
      capBar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
      capBar.setAttribute('aria-valuetext', `${timeLabel(p.seconds)} of ${timeLabel(p.total)}`);
      // dock beside the case: to its left on a wide view (the copy is above), under it on a narrow one
      const cw = caption.offsetWidth, ch = caption.offsetHeight;
      let x, y;
      if (innerWidth > innerHeight * 1.05) { x = p.rect.left - cw * 0.55; y = p.rect.bottom - ch * 0.2; }
      else { x = (p.rect.left + p.rect.right) / 2 - cw / 2; y = p.rect.bottom + 6; }
      caption.style.transform = `translate(${clamp(x, 12, innerWidth - cw - 12)}px, ${clamp(y, 70, innerHeight - ch - 12)}px)`;
    },
    onPick() {
      $('#player').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    },
  });
  if (reduced) scene.setMotion(0.25);
  window.__sienna = scene;
} catch (err) {
  document.body.classList.add('no-webgl');
  console.warn('Sienna: 3D records unavailable', err);
}
capBar.addEventListener('click', (e) => {
  const b = capBar.getBoundingClientRect();
  scene?.seek((e.clientX - b.left) / b.width);
});
capBar.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); scene?.command(e.key === 'ArrowRight' ? 'next' : 'previous'); }
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); scene?.command('toggle'); }
});

// ---- the shop: a stage pinned while the page scrolls through it; the camera walks down the alley ----
const alleyEl = $('#alley');
const stage = $('.alley-stage');
const notes = $$('.note-card', alleyEl);
const cue = $('.scroll-cue', alleyEl);
const bars = $$('.bar', alleyEl);
// the painted letterbox of the app's intro: dark bands with torn inner edges
bars[0].style.clipPath = tornBand(91, 9, 'bottom');
bars[1].style.clipPath = tornBand(92, 9, 'top');
let alley = null, alleyLoading = false, alleyP = 0;
function alleyProgress() {
  const span = alleyEl.offsetHeight - innerHeight;
  return clamp((scrollY - alleyEl.offsetTop) / Math.max(1, span), 0, 1);
}
function loadAlley() {
  if (alley || alleyLoading || document.body.classList.contains('no-webgl')) return;
  alleyLoading = true;
  import('./alley/scene.js').then(({ createAlley }) => {
    try {
      alley = createAlley($('#alley-canvas'), { reduced, covers: scene?.covers });
      alley.setHour(manualHour ?? hourNow());
      alley.setProgress(alleyP, true);
    } catch (err) {
      console.warn('Sienna: the shop could not be drawn', err);
      stage.classList.add('no-3d');
    }
  });
}
function updateAlley() {
  const top = alleyEl.offsetTop, h = alleyEl.offsetHeight;
  const near = scrollY + innerHeight * 2.5 > top && scrollY < top + h + innerHeight;
  if (near) loadAlley();
  alleyP = alleyProgress();
  const onScreen = scrollY + innerHeight > top && scrollY < top + h;
  alley?.setActive(onScreen);
  alley?.setProgress(alleyP);
  for (const n of notes) n.classList.toggle('show', onScreen && alleyP >= Number(n.dataset.from) && alleyP < Number(n.dataset.to));
  cue.classList.toggle('gone', alleyP > 0.02);
  // the letterbox bars open up as the camera reaches the hall, as the app's intro does
  const barH = 8 * (1 - clamp((alleyP - 0.86) / 0.12, 0, 1));
  for (const b of bars) b.style.height = `${barH}vh`;
  // the records are hidden behind the stage while it fills the screen
  const covered = scrollY >= top && scrollY <= top + h - innerHeight;
  scene?.setActive(!covered);
}

// ---- scroll position picks the record layout: each section holds one, blended in between ----
const sections = $$('[data-mode]');
function anchors() {
  const out = [];
  for (const s of sections) {
    const m = MODE[s.dataset.mode];
    if (s === alleyEl) {
      out.push({ y: s.offsetTop + innerHeight / 2, s: m }, { y: s.offsetTop + s.offsetHeight - innerHeight / 2, s: m });
    } else out.push({ y: s.offsetTop + s.offsetHeight / 2, s: m });
  }
  return out;
}
let marks = anchors();
function updateMode() {
  scene?.setMode(scrollToMode(scrollY + innerHeight / 2, marks));
  updateAlley();
}
addEventListener('scroll', updateMode, { passive: true });
addEventListener('resize', () => { marks = anchors(); updateMode(); });
updateMode();

// ---- the sky follows the visitor's clock ----
const clockInput = $('.clock input');
const clockTime = $('.clock-time');
// ?hour=20.5 freezes the clock, as in the app (for checks and screenshots)
const pinnedHour = new URLSearchParams(location.search).get('hour');
let manualHour = pinnedHour != null && Number.isFinite(+pinnedHour) ? +pinnedHour : null;
function paintSky() {
  const hour = manualHour ?? hourNow();
  const sky = skyAt(hour);
  root.style.setProperty('--sky-top', sky.top);
  root.style.setProperty('--sky-bottom', sky.bottom);
  root.style.setProperty('--fg', sky.fg);
  root.style.setProperty('--halo', sky.dark ? 'rgba(20, 18, 40, 0.6)' : 'rgba(248, 241, 226, 0.6)');
  root.style.setProperty('--lantern', lanternLevel(hour).toFixed(3));
  document.body.classList.toggle('dark', sky.dark);
  scene?.setSky(sky.top, sky.bottom, sky.mid, sky.dark);
  alley?.setHour(hour);
  clockTime.textContent = clockLabel(hour);
  if (manualHour == null) clockInput.value = hour;
}
clockInput.addEventListener('input', () => { manualHour = +clockInput.value; paintSky(); });
$('[data-clock-now]').addEventListener('click', () => { manualHour = null; paintSky(); });
paintSky();
setInterval(paintSky, 30000);

// ---- pointer ----
let scrubbing = false;
const interactive = 'a, button, input, kbd, .lanterns i, .stamp, .caption';
addEventListener('pointermove', (e) => {
  cursor.classList.add('on');
  cursor.style.translate = `${e.clientX}px ${e.clientY}px`;
  root.style.setProperty('--mx', `${e.clientX}px`);
  root.style.setProperty('--my', `${e.clientY}px`);
  const t = e.target.closest?.(interactive);
  cursor.classList.toggle('link', !!t || cursor.classList.contains('case'));
  const overStage = !!e.target.closest?.('.alley-stage');
  document.body.classList.toggle('over-stage', overStage);
  scene?.setPointer(e.clientX, e.clientY, !e.target.closest?.('.card, .nav, .caption, .alley-stage'));
  alley?.setPointer(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1));
});
document.addEventListener('pointerleave', () => { cursor.classList.remove('on'); scene?.clearPointer(); });
addEventListener('pointerdown', (e) => {
  cursor.classList.add('down');
  if (e.target.closest(`${interactive}, .card, .alley-stage`)) return;
  if (scene?.press(e.clientX, e.clientY)) { scrubbing = true; e.preventDefault(); }
});
const endScrub = () => { scrubbing = false; scene?.release(); };
addEventListener('pointerup', () => { cursor.classList.remove('down'); endScrub(); });
addEventListener('pointercancel', endScrub);
// a finger turning the record or the knob must not scroll the page out from under it
addEventListener('touchmove', (e) => { if (scrubbing) e.preventDefault(); }, { passive: false });

// ---- cards lean toward the cursor; buttons are pulled a little toward it ----
for (const el of $$('.card')) {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--px', `${x * 100}%`);
    el.style.setProperty('--py', `${y * 100}%`);
    if (reduced) return;
    const k = el.classList.contains('wide') ? 3 : 9;
    el.style.setProperty('--ry', `${(x - 0.5) * k}deg`);
    el.style.setProperty('--rx', `${(0.5 - y) * k}deg`);
  });
  el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
}
if (!reduced) {
  for (const el of $$('[data-magnet]')) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.22}px ${(e.clientY - r.top - r.height / 2) * 0.3}px`;
    });
    el.addEventListener('pointerleave', () => { el.style.translate = ''; });
  }
}

// ---- the shortcut keys press down when you press them for real ----
const keys = $$('kbd[data-key]');
const setKey = (e, on) => keys.forEach((k) => { if (k.dataset.key.toLowerCase() === e.key.toLowerCase()) k.classList.toggle('down', on); });
addEventListener('keydown', (e) => setKey(e, true));
addEventListener('keyup', (e) => setKey(e, false));
addEventListener('blur', () => keys.forEach((k) => k.classList.remove('down')));

// ---- downloads: nothing to download yet, so the buttons only answer ----
const note = $('.download .note');
for (const b of $$('.dl')) {
  b.addEventListener('click', () => {
    b.classList.remove('shake');
    note.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('shake');
    note.classList.add('show');
    note.textContent = `The ${b.dataset.os} build is not out yet.`;
  });
}
