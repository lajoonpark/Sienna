// Paints off the main thread (tens of ms per job):
//   { id, kind: 'cover', bitmap, size, seed } -> the cover repainted in oil
//   { id, kind: 'named', name }               -> one of the PAINTERS (painters.js)
import { paintCover } from './coverpaint.js';
import { PAINTERS, paintNamed } from './painters.js';

self.onmessage = ({ data }) => {
  const { id } = data;
  try {
    const size = data.kind === 'cover' ? data.size : PAINTERS[data.name].size;
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext('2d', { willReadFrequently: data.kind === 'cover' });
    if (data.kind === 'cover') {
      g.drawImage(data.bitmap, 0, 0, size, size);
      data.bitmap.close();
      paintCover(g, size, data.seed);
    } else paintNamed(data.name, g);
    const out = c.transferToImageBitmap();
    self.postMessage({ id, bitmap: out }, [out]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
