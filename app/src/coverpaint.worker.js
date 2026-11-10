// Paints covers off the main thread: the blur filters in paintCover cost several ms per cover, and a
// shelf's worth arrives at once, usually just as the intro starts pushing in.
//   in:  { id, url, size, level }
//   out: { id, bitmap, color: [r, g, b] | null } (bitmap transferred), or { id, error }
import { paintCover, coverSeed } from './coverpaint.js';
import { safeArtUrl, artSizeOk, ART_MAX_BYTES, ART_TIMEOUT_MS } from './arturl.js';

// The picture's bytes, refused past ART_MAX_BYTES (whatever Content-Length claims).
async function readCapped(res) {
  const declared = Number(res.headers.get('content-length'));
  if (declared > ART_MAX_BYTES) throw new Error('picture too large');
  const reader = res.body.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ART_MAX_BYTES) { reader.cancel().catch(() => {}); throw new Error('picture too large'); }
    parts.push(value);
  }
  return new Blob(parts, { type: res.headers.get('content-type') || '' });
}

self.onmessage = async ({ data: { id, url, size, level } }) => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ART_TIMEOUT_MS);
  try {
    if (!safeArtUrl(url)) throw new Error('cover url not allowed');
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: abort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const img = await createImageBitmap(await readCapped(res));
    if (!artSizeOk(img.width, img.height)) { img.close(); throw new Error('picture too large'); }
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext('2d');
    const s = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    let color = null;
    if (size <= 256) { // spine colour: the 8x8 average, as averageColor() in racks/common.js
      const a = new OffscreenCanvas(8, 8).getContext('2d');
      a.drawImage(img, 0, 0, 8, 8);
      const d = a.getImageData(0, 0, 8, 8).data;
      let R = 0, G = 0, B = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
      const n = d.length / 4;
      color = [Math.round(R / n), Math.round(G / n), Math.round(B / n)];
    }
    img.close();
    paintCover(g, size, coverSeed(url), level);
    const bitmap = c.transferToImageBitmap();
    self.postMessage({ id, bitmap, color }, [bitmap]);
  } catch (e) {
    self.postMessage({ id, error: String(e?.message ?? e) });
  } finally {
    clearTimeout(timer);
  }
};
