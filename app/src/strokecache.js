// Keeps the shop's placed brush strokes between runs (IndexedDB, in the app's own data). Placing them from
// the shop's 31 views was ~2.8 s of every start; read back they take a few tens of ms. One bake is kept,
// under the fingerprint of what it saw (brushstrokes.js strokeFingerprint), so anything that changes the
// scene, the views or the stroke settings bakes again and replaces it. Any failure just means a bake.
//   ?strokecache=0 never reads or writes it (checks that time the bake itself).
const DB = 'sienna-cache', STORE = 'strokes', KEY = 'shop';
const off = new URLSearchParams(globalThis.location?.search ?? '').get('strokecache') === '0';

function open() {
  return new Promise((resolve, reject) => {
    if (off || !globalThis.indexedDB) { reject(new Error('no cache')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}

// -> the saved strokes if they were baked from the same fingerprint, else null
export async function loadStrokes(fingerprint) {
  try {
    const rec = await run('readonly', (s) => s.get(KEY));
    return rec && rec.fingerprint === fingerprint ? rec.state : null;
  } catch { return null; }
}
export function saveStrokes(fingerprint, state) {
  return run('readwrite', (s) => s.put({ fingerprint, state, at: Date.now() }, KEY)).catch(() => {});
}
