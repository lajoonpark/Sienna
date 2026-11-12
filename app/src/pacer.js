// Frame pacing for the shop window. The watercolour pass is expensive (several full-screen passes at
// Retina size), so drawing it at the screen's full rate all the time kept the GPU flat out and the
// laptop hot even when nothing on screen moved. The pacer:
//   - never draws faster than Settings > Smoothness (60 or 30 fps), even on a 120 Hz screen;
//   - while something moves (camera, input, flights, animations), draws at that cap;
//   - once things settle, drops to idleFps() (enough for the boiling edges, lanterns and a spinning record);
//   - a few seconds later, if nothing animates on its own, to a deep idle of 2 looks a second with the
//     border's boil held still, so nothing is drawn at all (see DEEP_MS);
//   - stops completely while the window is hidden, minimised or fully covered (document.hidden).
//
//   const pacer = createPacer({ renderer, step: (now) => frame(...), busy: () => bool, idleFps: () => 12 });
//   pacer.start(); pacer.kick();   // kick: something changed, draw at full rate for a moment
import { settings } from './settings.js';

const GRACE_MS = 1200; // keep the full rate this long after the last sign of movement
// Deep idle: this long after the last movement, with nothing that animates on its own on screen (idleFps()
// at its base rate, so not a record turning on the suitcase), the shop only looks DEEP_FPS times a second
// whether anything changed (a cover arriving, the sun creeping) and the painter stops the border's boil, so
// nothing at all is drawn. Any input, or a change the painter finds, brings the full rate straight back.
const DEEP_MS = 4000, DEEP_FPS = 2, DEEP_BASE = 12;
const SLACK_MS = 2;    // vsync jitter: a 60 cap on a 120 Hz screen must give 60, not 40

export const maxFps = () => (Number(settings.get('maxFps')) === 30 ? 30 : 60);

// quality: src/quality.js (cool-down caps the rate and is told how long each frame took), optional
export function createPacer({ renderer, step, busy = () => false, idleFps = () => 12, quality = null }) {
  let running = false;
  let last = -Infinity;
  let busyUntil = 0;
  let deep = false;
  const noDeep = new URLSearchParams(globalThis.location?.search ?? '').get('deep') === '0'; // ?deep=0: never (checks of the boil)

  function loop() {
    const now = performance.now();
    if (busy()) busyUntil = now + GRACE_MS;
    const cap = quality ? quality.fpsCap(maxFps()) : maxFps();
    const full = now < busyUntil;
    const base = idleFps();
    deep = !full && now - busyUntil > DEEP_MS && base <= DEEP_BASE && !noDeep;
    const fps = full ? cap : deep ? DEEP_FPS : Math.min(cap, base * (quality?.idleScale ?? 1));
    if (now - last < 1000 / fps - SLACK_MS) return;
    quality?.frame(now - last, full, cap);
    last = now;
    step(now);
  }

  const sync = () => renderer.setAnimationLoop(running && !document.hidden ? loop : null);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) busyUntil = performance.now() + GRACE_MS; sync(); });

  return {
    start() { running = true; sync(); },
    stop() { running = false; sync(); },
    kick(ms = GRACE_MS) { busyUntil = Math.max(busyUntil, performance.now() + ms); },
    get idle() { return performance.now() >= busyUntil; },   // for checks: drawing at the idle rate now
    get deep() { return deep; },                              // deep idle: the border's boil holds still
  };
}
