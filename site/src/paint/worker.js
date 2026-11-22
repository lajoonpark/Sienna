// The main thread's side of the paint worker (cover.worker.js). Without workers (or OffscreenCanvas)
// every job is painted here instead, one per idle moment so the page keeps scrolling.
import { makeCanvas } from './brushpaint.js';
import { paintCover } from './coverpaint.js';
import { PAINTERS, paintNamed } from './painters.js';

let worker;
const jobs = new Map();
let nextId = 0;
let chain = Promise.resolve();

function getWorker() {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
      worker = new Worker(new URL('./cover.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { jobs.get(data.id)?.(data); jobs.delete(data.id); };
      worker.onerror = () => { for (const j of jobs.values()) j({ error: 'worker' }); jobs.clear(); worker?.terminate(); worker = null; };
    }
  } catch { worker = null; }
  return worker;
}

const idle = () => new Promise((res) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(res, { timeout: 500 }) : setTimeout(res, 16)));

function post(msg, transfer = []) {
  const w = getWorker();
  if (!w) return Promise.resolve({ error: 'none' });
  return new Promise((res) => {
    const id = ++nextId;
    jobs.set(id, res);
    w.postMessage({ ...msg, id }, transfer);
  });
}

// Paints into `canvas` (sized already). Jobs run one after another.
function run(canvas, toWorker, here) {
  const job = chain.then(async () => {
    const out = await toWorker();
    const g = canvas.getContext('2d');
    if (out.bitmap) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(out.bitmap, 0, 0, canvas.width, canvas.height);
      out.bitmap.close();
    } else {
      await idle();
      here(g);
    }
    return canvas;
  });
  chain = job.catch(() => {});
  return job;
}

// A named texture (painters.js) on a fresh canvas.
export function paintTexture(name) {
  const [c] = makeCanvas(PAINTERS[name].size, PAINTERS[name].size);
  return run(c, () => post({ kind: 'named', name }), (g) => paintNamed(name, g));
}

// Repaints a cover canvas (already showing the flat picture) in oil.
export function paintCoverCanvas(canvas, seed) {
  return run(canvas, async () => {
    if (!getWorker()) return { error: 'none' };
    const bitmap = await createImageBitmap(canvas);
    return post({ kind: 'cover', bitmap, size: canvas.width, seed }, [bitmap]);
  }, (g) => paintCover(g, canvas.width, seed));
}
