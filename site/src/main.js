import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/amatic-sc/700.css';
import '@fontsource/caveat/400.css';
import './style.css';
import { createScene } from './scene.js';
import { skyAt, lanternLevel, hourNow, clockLabel } from './sky.js';
import { clamp, timeLabel, rand } from './layout.js';

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

const RECORDS = [
  ['Quiet Mornings', 'Album, 11 songs'], ['Liked Music', 'Playlist'], ['Sunday Kitchen', 'Playlist, 42 songs'],
  ['Night Drive', 'Album, 9 songs'], ['Old Favourites', 'Playlist, 120 songs'], ['Rainy Window', 'Album, 8 songs'],
  ['Summer Tape', 'Playlist, 30 songs'], ['Slow Dance', 'Album, 12 songs'],
];
const cursor = $('.cursor');
const rackTag = $('.rack-tag');
const playerState = $('.player-state');
const playerTime = $('.player-time');
const playerLine = $('.player-line i');

let scene = null;
try {
  scene = createScene($('#vinyls'), {
    onHover(kind) {
      cursor.classList.toggle('disk', kind === 'disk');
      cursor.classList.toggle('player', kind === 'player');
    },
    onRack(r) {
      rackTag.classList.toggle('show', !!r.visible);
      if (!r.visible) return;
      const [title, sub] = RECORDS[r.index % RECORDS.length];
      rackTag.firstElementChild.textContent = title;
      rackTag.lastElementChild.textContent = sub;
      rackTag.style.setProperty('--tag', r.color);
      const x = clamp(r.x + 24, 12, innerWidth - rackTag.offsetWidth - 12);
      const y = clamp(r.y - 90, 12, innerHeight - rackTag.offsetHeight - 12);
      rackTag.style.transform = `translate(${x}px, ${y}px)`;
    },
    onPlayer(p) {
      playerState.textContent = p.playing ? 'Playing' : 'Paused';
      playerTime.textContent = `${timeLabel(p.seconds)} / ${timeLabel(p.total)}`;
      playerLine.style.width = `${(p.seconds / p.total) * 100}%`;
    },
  });
  if (reduced) scene.setMotion(0.25);
  window.__sienna = scene;
} catch (err) {
  document.body.classList.add('no-webgl');
  console.warn('Sienna: 3D records unavailable', err);
}

// Scroll position picks the record layout: each section owns one, blended in between.
const sections = $$('[data-mode]');
function updateMode() {
  const mid = scrollY + innerHeight / 2;
  let s = 0;
  for (let i = 0; i < sections.length; i++) {
    const a = sections[i].offsetTop + sections[i].offsetHeight / 2;
    const next = sections[i + 1];
    if (!next) { s = i; break; }
    const b = next.offsetTop + next.offsetHeight / 2;
    if (mid <= b) { s = i + clamp((mid - a) / (b - a), 0, 1); break; }
  }
  scene?.setMode(s);
}
addEventListener('scroll', updateMode, { passive: true });
addEventListener('resize', updateMode);
updateMode();

// Sky
const clockInput = $('.clock input');
const clockTime = $('.clock-time');
let manualHour = null;
function paintSky() {
  const hour = manualHour ?? hourNow();
  const sky = skyAt(hour);
  root.style.setProperty('--sky-top', sky.top);
  root.style.setProperty('--sky-bottom', sky.bottom);
  root.style.setProperty('--fg', sky.fg);
  root.style.setProperty('--halo', sky.dark ? 'rgba(20, 18, 40, 0.6)' : 'rgba(248, 241, 226, 0.6)');
  root.style.setProperty('--lantern', lanternLevel(hour).toFixed(3));
  document.body.classList.toggle('dark', sky.dark);
  $('.sun').style.opacity = sky.dark ? 0.35 : 1;
  scene?.setSky(sky.mid, sky.dark);
  clockTime.textContent = clockLabel(hour);
  if (manualHour == null) clockInput.value = hour;
}
clockInput.addEventListener('input', () => { manualHour = +clockInput.value; paintSky(); });
$('[data-clock-now]').addEventListener('click', () => { manualHour = null; paintSky(); });
paintSky();
setInterval(paintSky, 30000);

// Pointer
let scrubbing = false;
const interactive = 'a, button, input, kbd, .lanterns i, .stamp';
addEventListener('pointermove', (e) => {
  cursor.classList.add('on');
  cursor.style.translate = `${e.clientX}px ${e.clientY}px`;
  root.style.setProperty('--mx', `${e.clientX}px`);
  root.style.setProperty('--my', `${e.clientY}px`);
  cursor.classList.toggle('link', !!e.target.closest?.(interactive));
  scene?.setPointer(e.clientX, e.clientY, !e.target.closest?.('.card, .nav'));
});
document.addEventListener('pointerleave', () => { cursor.classList.remove('on'); scene?.clearPointer(); });
addEventListener('pointerdown', (e) => {
  cursor.classList.add('down');
  if (e.target.closest(`${interactive}, .card`)) return;
  if (scene?.press(e.clientX, e.clientY)) { scrubbing = true; e.preventDefault(); }
});
const endScrub = () => { scrubbing = false; scene?.release(); };
addEventListener('pointerup', () => { cursor.classList.remove('down'); endScrub(); });
addEventListener('pointercancel', endScrub);
// A finger dragging the record must not scroll the page out from under it.
addEventListener('touchmove', (e) => { if (scrubbing) e.preventDefault(); }, { passive: false });
$('.player-tag').addEventListener('click', () => scene?.togglePlay());

// Cards lean toward the cursor; buttons are pulled a little toward it.
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

// The shortcut keys press down when you press them for real.
const keys = $$('kbd[data-key]');
const setKey = (e, on) => keys.forEach((k) => { if (k.dataset.key.toLowerCase() === e.key.toLowerCase()) k.classList.toggle('down', on); });
addEventListener('keydown', (e) => setKey(e, true));
addEventListener('keyup', (e) => setKey(e, false));
addEventListener('blur', () => keys.forEach((k) => k.classList.remove('down')));

// Downloads: nothing to download yet, so the buttons only answer.
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
