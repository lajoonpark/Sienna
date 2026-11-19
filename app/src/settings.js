// User settings, kept in localStorage so they survive restarts. The shop window and the
// mini window share one origin, so a change in one reaches the other through the
// 'storage' event. Storage can be unavailable (private mode, blocked): everything still works with
// the defaults, it just does not remember.
const KEY = 'sienna.settings';
const OLD_KEY = 'cadence.settings';

export const DEFAULTS = {
  covers: 3,            // how strongly album covers are painted, 0..3 (COVER_LEVELS in coverpaint.js)
  playOnArm: true,      // the song starts when the tonearm lands and the record spins up (false: at once)
  volumeMode: 'system', // macOS: 'system' (Mac output volume) or 'app' (Sienna player volume only)
  discordRpc: false,    // opt-in Discord Rich Presence over local IPC (off by default)
  maxFps: 60,           // frame-rate cap, 60 or 30 (pacer.js); 30 runs cooler on a laptop
  sharp: 'balanced',    // how many pixels the shop is drawn with: 'full', 'balanced', 'light' (quality.js)
  autoCool: true,       // draw lighter while the computer is warm or frames are slow (quality.js)
  font: 'amatic',       // lettering, a key of FONTS in style.js (changes live, see style.js)
  fps: false,           // frame-rate readout in the corner (for perf reports)
};

function load() {
  try {
    let text = localStorage.getItem(KEY);
    if (text == null && (text = localStorage.getItem(OLD_KEY)) != null) {
      localStorage.setItem(KEY, text);
      localStorage.removeItem(OLD_KEY);
    }
    const raw = JSON.parse(text || '{}');
    if (!raw || typeof raw !== 'object') return {};
    delete raw.paint; delete raw.paintV;
    return raw;
  } catch {
    return {};
  }
}

const listeners = new Map(); // key -> Set<fn>
let values = { ...DEFAULTS, ...load() };

function emit(key) {
  for (const fn of listeners.get(key) ?? []) fn(values[key]);
}

export const settings = {
  get(key) { return values[key]; },
  set(key, value) {
    if (values[key] === value) return;
    values[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* not remembered, still applied */ }
    emit(key);
  },
  on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
  },
};

// the other window changed something
globalThis.addEventListener?.('storage', (e) => {
  if (e.key !== KEY) return;
  const before = values;
  values = { ...DEFAULTS, ...load() };
  for (const k of Object.keys(values)) if (before[k] !== values[k]) emit(k);
});
