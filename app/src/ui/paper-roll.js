import { COLORS } from './tokens.js';

const TAU = 2 * Math.PI;
const CORE = 9;
const TURN_GAP = 6 / TAU;
export const ROLL_MIDLINE = 86;
export const ROLL_HEIGHT = 2 * ROLL_MIDLINE;

// Trace a loose spool from the tangent inwards. The space between turns lets
// the torn tip be seen winding inside the coil as the sheet feeds out.
export function rollProfile(remaining) {
  const radius = Math.sqrt(CORE ** 2 + 2 * TURN_GAP * remaining);
  const end = 2 * remaining / (radius + CORE);
  return { end, point(a) {
    const r = radius - TURN_GAP * a;
    return { y: r * Math.sin(a), z: radius - r * Math.cos(a), feed: a * (radius - TURN_GAP * a / 2) };
  } };
}

export function createPaperRoll(canvas, paper) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const texture = new Image();
  let textureHeight = 0, image = '', width = 0, dpr = 0;
  const load = () => {
    const next = paper.style.backgroundImage;
    if (image !== next && next) texture.src = next.slice(5, -2); // CSSOM serializes url("…").
    image = next;
    textureHeight = parseFloat(paper.style.backgroundSize.split(' ')[1]);
  };
  load();
  new MutationObserver(load).observe(paper, { attributes: true, attributeFilter: ['style'] });

  return (w, flat, remaining) => {
    const scale = Math.min(2, devicePixelRatio);
    if (w !== width || scale !== dpr) {
      width = w; dpr = scale;
      canvas.width = Math.ceil(w * scale);
      canvas.height = Math.ceil(ROLL_HEIGHT * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    ctx.clearRect(0, 0, w, ROLL_HEIGHT);
    const { end, point } = rollProfile(remaining);
    const project = (a, inner) => {
      const { y, z, feed } = point(a);
      return { y: ROLL_MIDLINE + y - z * 0.28, z, feed,
        left: 3 + z * 0.62, right: inner ? Math.min(88, w - 3) : w - 3 - z * 0.06 };
    };
    // Look into one end of the spiral. Inner turns can only show at that end;
    // the outer turn occludes them everywhere else.
    const strips = [];
    for (let a = 0; a < end;) {
      const inner = a >= TAU;
      const b = Math.min(end, inner ? a + 0.25 : Math.min(a + 0.14, TAU));
      strips.push({ from: project(a, inner), to: project(b, inner), angle: (a + b) / 2, inner, lip: b === end });
      a = b;
    }
    strips.sort((a, b) => (a.from.z + a.to.z) - (b.from.z + b.to.z));
    const textured = image && texture.complete && texture.naturalWidth && textureHeight;

    for (const { from, to, angle, inner, lip } of strips) {
      const y = Math.min(from.y, to.y) - 0.35, h = Math.abs(to.y - from.y) + 0.7;
      const left = (from.left + to.left) / 2, right = (from.right + to.right) / 2;
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(left, y, right - left, h);
      if (!inner && textured) {
        const texel = texture.naturalHeight / textureHeight;
        const v = Math.min(texture.naturalHeight - 1, (flat + from.feed) * texel);
        const sample = Math.min(texture.naturalHeight - v, Math.max(1, (to.feed - from.feed) * texel));
        ctx.save();
        if (to.y < from.y) { ctx.translate(0, 2 * y + h); ctx.scale(1, -1); }
        ctx.drawImage(texture, 0, v, texture.naturalWidth, sample, left, y, right - left, h);
        ctx.restore();
      }
      const light = Math.sin(angle);
      ctx.fillStyle = `rgba(90, 57, 37, ${Math.max(0, light) * 0.19 + (inner ? 0.26 : 0.02)})`;
      ctx.fillRect(left, y, right - left, h);
      const rim = ctx.createLinearGradient(left, 0, left + (inner ? 13 : 22), 0);
      rim.addColorStop(0, inner ? 'rgba(72, 43, 26, 0.55)' : 'rgba(91, 56, 32, 0.38)');
      rim.addColorStop(1, 'rgba(91, 56, 32, 0)');
      ctx.fillStyle = rim;
      ctx.fillRect(left, y, right - left, h);
      ctx.fillStyle = 'rgba(255, 247, 224, 0.62)';
      ctx.fillRect(left, y, 1.2, h);
      if (lip && to.z > 1) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const x = to.left + (to.right - to.left) * i / 24;
          ctx.lineTo(x, to.y + Math.sin(i * 4.3) * Math.min(0.7, to.z * 0.08));
        }
        ctx.strokeStyle = inner ? '#785841' : 'rgba(103, 77, 50, 0.6)';
        ctx.stroke();
      }
    }
  };
}
