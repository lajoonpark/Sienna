// The demo covers: drawn like the app's fake record store does (a gradient, a few shapes, the title),
// then painted in oil (coverpaint.js) in a worker, one after another. Each record keeps one canvas: it
// shows the flat picture at once and the painted one as soon as it is ready (onPainted).
import { rng } from './rand.js';
import { makeCanvas } from './brushpaint.js';
import { paintCoverCanvas } from './worker.js';

const FACE = 'Alegreya, Georgia, serif';

function heart(g, S, y0) {
  g.beginPath();
  g.moveTo(S / 2, S * (0.68 + y0));
  g.bezierCurveTo(S * 0.22, S * (0.5 + y0), S * 0.2, S * (0.24 + y0), S * 0.37, S * (0.24 + y0));
  g.bezierCurveTo(S * 0.45, S * (0.24 + y0), S * 0.5, S * (0.31 + y0), S * 0.5, S * (0.35 + y0));
  g.bezierCurveTo(S * 0.5, S * (0.31 + y0), S * 0.55, S * (0.24 + y0), S * 0.63, S * (0.24 + y0));
  g.bezierCurveTo(S * 0.8, S * (0.24 + y0), S * 0.78, S * (0.5 + y0), S / 2, S * (0.68 + y0));
  g.closePath();
}

// The flat picture on a size x size canvas (drawn in 256 px units, like the app's).
export function drawCoverBase(g, size, rec) {
  const S = 256;
  g.save();
  g.scale(size / S, size / S);
  if (rec.kind === 'liked') {
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, '#b4503a');
    grad.addColorStop(0.55, '#8c3734');
    grad.addColorStop(1, '#2d3158');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#fbf5e8';
    heart(g, S, 0);
    g.fill();
    g.fillStyle = 'rgba(251,245,232,.92)';
    g.font = `700 22px ${FACE}`;
    g.textAlign = 'center';
    g.fillText('LIKED MUSIC', S / 2, S - 24);
    g.restore();
    return;
  }
  const r = rng(rec.seed);
  const hue = Math.floor(r() * 360);
  const grad = g.createLinearGradient(0, 0, S * r(), S);
  grad.addColorStop(0, `hsl(${hue}, ${40 + r() * 40}%, ${45 + r() * 30}%)`);
  grad.addColorStop(1, `hsl(${(hue + 40 + r() * 80) % 360}, ${40 + r() * 40}%, ${25 + r() * 35}%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 3 + r() * 4; i++) {
    g.fillStyle = `hsla(${(hue + 150 + r() * 120) % 360}, ${50 + r() * 40}%, ${50 + r() * 40}%, ${0.5 + r() * 0.5})`;
    g.beginPath();
    if (r() < 0.5) g.arc(r() * S, r() * S, 20 + r() * 70, 0, Math.PI * 2);
    else g.rect(r() * S, r() * S, 30 + r() * 120, 10 + r() * 60);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.font = `700 26px ${FACE}`;
  g.fillText(rec.title.toUpperCase(), 16, S - 22, S - 32);
  g.restore();
}

// covers = createCovers(records, { size, onPainted(i, painted) }); covers.canvases[i]; covers.done
export function createCovers(records, { size = 384, onPainted = () => {} } = {}) {
  const canvases = records.map(() => makeCanvas(size, size)[0]);
  const fonts = typeof document !== 'undefined' && document.fonts ? document.fonts.load(`700 26px ${FACE}`).catch(() => {}) : Promise.resolve();
  const done = fonts.then(() => {
    canvases.forEach((c, i) => { drawCoverBase(c.getContext('2d', { willReadFrequently: true }), size, records[i]); onPainted(i, false); });
    return Promise.all(canvases.map((c, i) => paintCoverCanvas(c, records[i].seed).then(() => onPainted(i, true))));
  });
  return { canvases, done, size };
}
