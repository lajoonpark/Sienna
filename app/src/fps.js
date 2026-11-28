// The frame-rate readout (Settings > Performance > Frame rate, or ?fps=1): a small paper ticket in the
// bottom right corner with the average frames per second and the slowest frame of the last half second.
//   const fps = createFpsTicket();
//   fps.tick()      once per drawn frame (does nothing while the ticket is not shown)
import { settings } from './settings.js';
import { paperSurface } from './ui/paper.js';

export function createFpsTicket() {
  const pinned = new URLSearchParams(location.search).get('fps') === '1';
  const box = document.createElement('div');
  box.className = 'fps-ticket';
  box.style.cssText = 'position:fixed;right:var(--sienna-space-8);bottom:var(--sienna-space-6);z-index:var(--sienna-z-chrome);width:calc(var(--sienna-space-10) * 4);height:calc(var(--sienna-space-8) + var(--sienna-space-1));box-sizing:border-box;font:var(--sienna-text-xs)/1.3 var(--sienna-serif);font-variant-numeric:lining-nums tabular-nums;white-space:nowrap;color:var(--sienna-ink);padding:var(--sienna-space-2) var(--sienna-space-3);pointer-events:none;display:none';
  const text = document.createElement('span');
  text.textContent = '— fps · worst — ms';
  box.appendChild(text);
  document.body.appendChild(box);
  paperSurface(box);
  const on = () => pinned || !!settings.get('fps');
  const sync = () => { box.style.display = on() ? 'block' : 'none'; };
  sync();
  settings.on('fps', sync);

  const stat = { n: 0, since: performance.now(), last: performance.now(), worst: 0 };
  return {
    el: box,
    tick() {
      if (box.style.display === 'none') return;
      const now = performance.now();
      stat.worst = Math.max(stat.worst, now - stat.last);
      stat.last = now; stat.n++;
      if (now - stat.since < 500) return;
      text.textContent = `${Math.round(stat.n * 1000 / (now - stat.since))} fps · worst ${stat.worst.toFixed(1)} ms`;
      stat.n = 0; stat.since = now; stat.worst = 0;
    },
  };
}
