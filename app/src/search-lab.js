// Dev page for the search bar on its own: a painted wall behind it, the fake record store, and
// counters that show whether any key leaks through to the "shop" while the bar is open.
//   npm run web, then /search-lab.html?search=lemon   (or SIENNA_PAGE=search-lab.html node scripts/shot.mjs ...)
import '@fontsource/dancing-script/700.css';
import { rng } from './rand.js';
import { createMusic } from './music.js';
import { createSearch } from './search.js';

// Something painterly to sit on: warm washes, brick-ish blocks and a few dark doorways.
const c = document.querySelector('canvas') ?? document.body.appendChild(document.createElement('canvas'));
c.width = 1280; c.height = 720;
const g = c.getContext('2d');
const r = rng(4);
g.fillStyle = '#d9b98a';
g.fillRect(0, 0, 1280, 720);
for (let i = 0; i < 260; i++) {
  g.fillStyle = `hsla(${12 + r() * 30} ${40 + r() * 30}% ${40 + r() * 35}% / ${0.12 + r() * 0.2})`;
  const w = 60 + r() * 220, h = 30 + r() * 90;
  g.beginPath();
  g.ellipse(r() * 1280, r() * 720, w, h, r() * 3, 0, Math.PI * 2);
  g.fill();
}
for (let i = 0; i < 6; i++) {
  g.fillStyle = `rgba(60,40,45,${0.35 + r() * 0.3})`;
  g.fillRect(100 + i * 210 + r() * 40, 300 + r() * 80, 90 + r() * 40, 400);
}

const music = createMusic();
window.__played = [];
window.__leaks = [];
// The "shop": any key that reaches here while the bar is open is a leak.
window.addEventListener('keydown', (e) => window.__leaks.push(e.key));
const search = createSearch({ music, onPlay: (item) => { window.__played.push(item); } });
window.__search = search;
window.__music = music;
window.__artLog = [];
music.onArt?.((item) => window.__artLog.push([Math.round(performance.now()), item.title, item.art?.slice(0, 16)]));
window.__seek = () => {};
search.ready().then(() => setTimeout(() => { window.__ready = true; }, 1200));
