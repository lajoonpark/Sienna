// How hard the shop window works: how many pixels it is drawn with (Settings > Performance > Sharpness)
// and, with Auto cool-down on, how far it backs off when the computer gets warm or cannot keep up.
//
// Sharpness sets the renderer's pixel ratio. The paint washes out fine detail anyway, so the shop does not
// need every Retina pixel: Balanced draws 1.5 pixels per CSS pixel there (56% of the pixels of Full) and
// the window scales the picture up. On a plain (1x) screen Balanced is the same as Full.
//   full      every screen pixel (pixel ratio up to 2)
//   balanced  3/4 of the screen's pixel ratio, never below 1      (default)
//   light     half of it, never below 0.75                         (what cool-down falls back to)
//
// Auto cool-down (Settings > Performance, on by default) lowers that for as long as it is needed:
//   - the Mac reports it is warm (electron/power.cjs: thermal fair -> one step lighter; serious or
//     critical -> Light and at most 30 fps, critical also idles slower);
//   - the shop cannot keep up: while things move, frames take far longer than the frame-rate cap asks
//     for (SLOW_K times the budget, for SLOW_S seconds) -> one step lighter; after FAST_S seconds of
//     moving frames well inside the budget it steps back up (and waits twice as long next time if that
//     was too much again within a minute).
// It never goes sharper than the setting, and never changes the setting itself.
//
//   const q = createQuality();
//   q.pixelRatio()            renderer pixel ratio to use now
//   q.fpsCap(cap)             the frame-rate cap after cool-down (cap = Settings > Smoothness)
//   q.idleScale               idle frame rate multiplier (1, or 0.5 when critical)
//   q.frame(ms, busy, cap)    report one drawn frame's interval (pacer.js), busy = full-rate period
//   q.onChange(fn)            pixel ratio or caps changed
//   q.reason                  why it is drawing lighter now ('' = it is not), for Settings
import { settings } from './settings.js';

export const SHARPNESS = ['light', 'balanced', 'full'];
const SLOW_K = 1.7, SLOW_S = 4, FAST_K = 1.15, FAST_S = 45;

export function pixelRatioFor(level, dpr = globalThis.devicePixelRatio || 1) {
  const d = Math.min(dpr, 2);
  if (level === 'full') return d;
  if (level === 'light') return Math.max(0.75, d * 0.5);
  return Math.max(1, d * 0.75);
}

export function createQuality({ power = globalThis.window?.sienna?.power } = {}) {
  const fns = new Set();
  let thermal = 'unknown', battery = false;
  let slowSteps = 0;     // steps down for frames that could not keep up
  let slowFor = 0, fastFor = 0, ema = 0;
  let fastNeed = FAST_S, upAt = -Infinity; // stepping up and then straight down again doubles the wait (no see-saw)
  let last = null;       // what the last onChange reported, to tell real changes

  // ?sharp=full|balanced|light pins it, cool-down off (screenshots, benchmarks)
  const pinSharp = new URLSearchParams(globalThis.location?.search ?? '').get('sharp');
  const userIdx = () => Math.max(0, SHARPNESS.indexOf(SHARPNESS.includes(pinSharp) ? pinSharp : settings.get('sharp')));
  // a pinned ?sharp holds still; so do test runs (navigator.webdriver), whose frames are slow on purpose,
  // unless they ask for it with ?cool=1
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const testRun = !!globalThis.navigator?.webdriver && params.get('cool') !== '1';
  const auto = () => !pinSharp && !testRun && settings.get('autoCool') !== false;
  const thermalSteps = () => (!auto() ? 0 : thermal === 'serious' || thermal === 'critical' ? 2 : thermal === 'fair' ? 1 : 0);
  const level = () => SHARPNESS[Math.max(0, userIdx() - Math.max(thermalSteps(), auto() ? slowSteps : 0))];
  const hot = () => auto() && (thermal === 'serious' || thermal === 'critical');

  function changed() {
    const now = `${level()}|${hot()}|${thermal}`;
    if (now === last) return;
    last = now;
    for (const fn of fns) fn();
  }
  settings.on('sharp', changed);
  settings.on('autoCool', () => { slowSteps = 0; changed(); });
  if (power) {
    power.get?.().then((s) => { if (s) { thermal = s.thermal; battery = s.battery; changed(); } }).catch(() => {});
    power.onChange?.((s) => { thermal = s.thermal; battery = s.battery; changed(); });
  }
  // ?thermal=serious tries the cool-down in a plain browser or a screenshot
  const forced = new URLSearchParams(globalThis.location?.search ?? '').get('thermal');
  if (forced) thermal = forced;
  last = `${level()}|${hot()}|${thermal}`;

  return {
    pixelRatio: () => pixelRatioFor(level()),
    get level() { return level(); },
    fpsCap: (cap) => (hot() ? Math.min(cap, 30) : cap),
    get idleScale() { return auto() && thermal === 'critical' ? 0.5 : 1; },
    get reason() {
      if (thermalSteps() && userIdx() > 0) return 'The Mac is warm, so the shop is drawn lighter for now.';
      if (auto() && slowSteps && userIdx() > 0) return 'Frames were slow, so the shop is drawn lighter for now.';
      return '';
    },
    get thermal() { return thermal; },
    get battery() { return battery; },
    // One drawn frame: ms since the one before. Only full-rate periods count (idle frames are slow on purpose).
    frame(ms, busy, cap) {
      if (!busy || !auto() || ms > 1000) { ema = 0; return; } // a long gap is a pause, not a slow frame
      const budget = 1000 / cap;
      ema = ema ? ema * 0.9 + ms * 0.1 : ms;
      const s = ms / 1000;
      if (ema > budget * SLOW_K) { slowFor += s; fastFor = 0; } else if (ema < budget * FAST_K) { fastFor += s; slowFor = 0; } else { slowFor = 0; fastFor = 0; }
      const now = performance.now();
      if (slowFor > SLOW_S && userIdx() - slowSteps > 0) {
        if (now - upAt < 60000) fastNeed *= 2;
        slowSteps++; slowFor = 0; ema = 0; changed();
      } else if (fastFor > fastNeed && slowSteps > 0) { slowSteps--; fastFor = 0; upAt = now; changed(); }
    },
    onChange(fn) { fns.add(fn); return () => fns.delete(fn); },
  };
}
