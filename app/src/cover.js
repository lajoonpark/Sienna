// Cover repair, in the shop window. YouTube Music sometimes gives playlists / mixes no usable
// cover (blank tile, a url that 404s, a placeholder). Contract: music.shelves() returns at once with
// the parsed art and starts `repairArt` in the background; when an item's art is replaced (a working
// alternative url, or a data: URL collage painted here from the playlist's first songs) item.art is
// updated in place and music.onArt callbacks get the item, so racks can reload that cover.
// What the repair does for an item (songs that have art are left alone):
//   1. probe item.art, then item.artAlt[] (same way the racks load them: crossOrigin anonymous)
//   2. else a collage of item.arts (parser found a multi-image renderer) or of the first songs
//      of the playlist / mix (window.sienna.playlistArt(play), main process, via the API)
//   3. else (songs) the video frame of play.videoId
import { rng } from './rand.js';
import { safeArtUrl } from './arturl.js';

const SIZE = 512;

function loadImage(url, ms = 6000) {
  if (!safeArtUrl(url)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const done = (ok) => { clearTimeout(t); img.onload = img.onerror = null; resolve(ok ? img : null); };
    const t = setTimeout(() => done(false), ms);
    // YouTube answers a missing video frame with a 404 that still carries a picture (a grey 120x90),
    // and Chrome fires load for it: tiny images and exactly that placeholder do not count.
    img.onload = () => done(img.naturalWidth >= 40 && img.naturalHeight >= 40 && !(img.naturalWidth === 120 && img.naturalHeight === 90));
    img.onerror = () => done(false);
    img.src = url;
  });
}

// A 2x2 collage of covers, hand-placed on paper and lightly washed, as a data: URL.
// Returns null when no cover loads (or the canvas is tainted).
export async function paintCollage(urls, seed = 1) {
  const imgs = (await Promise.all(urls.slice(0, 4).map((u) => loadImage(u)))).filter(Boolean);
  if (!imgs.length) return null;
  const cells = [0, 1, 2, 3].map((i) => imgs[i % imgs.length]);
  if (imgs.length === 3) cells[3] = imgs[0];
  if (imgs.length === 2) { cells[2] = imgs[1]; cells[3] = imgs[0]; } // checkerboard, not two stripes
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = '#efe3c9';
  g.fillRect(0, 0, SIZE, SIZE);
  const gap = 10, cell = (SIZE - gap * 3) / 2;
  // one distinct cover (an album's songs share it): one big painted square instead of four copies
  const one = imgs.length === 1;
  (one ? [imgs[0]] : cells).forEach((img, i) => {
    const big = SIZE - gap * 2;
    const cs = one ? big : cell;
    const x = one ? gap : gap + (i % 2) * (cell + gap), y = one ? gap : gap + Math.floor(i / 2) * (cell + gap);
    const s = Math.min(img.width, img.height);
    g.save();
    g.translate(x + cs / 2 + (r() - 0.5) * 4, y + cs / 2 + (r() - 0.5) * 4);
    g.rotate((r() - 0.5) * 0.03);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, -cs / 2, -cs / 2, cs, cs);
    // wet edge: pigment pooling at the border of each square
    g.strokeStyle = 'rgba(45,49,88,.32)';
    g.lineWidth = 2.2;
    g.strokeRect(-cs / 2, -cs / 2, cs, cs);
    g.restore();
  });
  // a pale wash over everything, uneven blotches of warm and cool, and paper grain
  g.globalCompositeOperation = 'soft-light';
  for (let i = 0; i < 9; i++) {
    const x = r() * SIZE, y = r() * SIZE, rad = 90 + r() * 160;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = i % 2 ? '212,160,90' : '90,110,150';
    grad.addColorStop(0, `rgba(${col},.30)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SIZE, SIZE);
  }
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(251,245,232,.08)';
  g.fillRect(0, 0, SIZE, SIZE);
  g.fillStyle = 'rgba(80,60,40,.07)';
  for (let i = 0; i < 2500; i++) g.fillRect(r() * SIZE, r() * SIZE, 1 + r() * 1.5, 1 + r() * 1.5);
  try { return c.toDataURL('image/jpeg', 0.9); } catch { return null; } // tainted canvas
}

const hash = (s) => [...String(s)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);

async function repairOne(item, getSongArts) {
  const song = item.kind === 'song';
  if (song && item.art) return;
  const tries = [item.art, ...(item.artAlt ?? [])].filter(Boolean);
  if (song && item.play?.videoId) tries.push(`https://i.ytimg.com/vi/${item.play.videoId}/hq720.jpg`, `https://i.ytimg.com/vi/${item.play.videoId}/mqdefault.jpg`);
  for (const url of tries) {
    if (url.startsWith('data:') || await loadImage(url)) { item.art = url; return; }
  }
  if (song) return;
  let urls = item.arts;
  if (!urls?.length && item.play?.playlistId) urls = await getSongArts?.(item.play).catch(() => []);
  const art = urls?.length ? await paintCollage(urls, hash(item.play?.playlistId ?? item.title)) : null;
  console.warn(`[sienna] cover for ${item.kind} "${item.title}" ${art ? 'painted from its songs' : 'could not be built'}`);
  if (art) item.art = art;
}

// Repairs items in place, 6 at a time, in the background: callers do NOT wait for it. Whenever an
// item's art is replaced (item.art already updated), onChange(item) is called so the racks can
// reload that cover. Items whose art loads fine are not touched and not reported.
export function repairArt(items, { getSongArts, onChange } = {}) {
  const queue = items.filter((i) => i.kind !== 'song' || !i.art);
  return Promise.all(Array.from({ length: 6 }, async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      const before = it.art;
      try {
        await repairOne(it, getSongArts);
        if (it.art !== before) onChange?.(it);
      } catch (e) { console.warn('[sienna] cover repair', e); }
    }
  }));
}
