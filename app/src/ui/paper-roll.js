import { COLORS } from './tokens.js';

const TAU = 2 * Math.PI;
const CORE = 11;
const LAYER = 0.85 / TAU;
export const ROLL_MIDLINE = 44;
export const ROLL_HEIGHT = 2 * ROLL_MIDLINE;

// Trace the paper from the tangent into the roll. Each turn builds up one
// paper thickness, so feeding more paper in increases the outer radius.
export function rollProfile(remaining) {
  const radius = Math.sqrt(CORE ** 2 + 2 * LAYER * remaining);
  const angle = 2 * remaining / (radius + CORE);
  return { end: Math.min(angle, TAU), hasLip: angle < TAU, point(a) {
    const r = radius - LAYER * a;
    return { y: r * Math.sin(a), z: radius - r * Math.cos(a), feed: a * (radius - LAYER * a / 2) };
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
    const { end, hasLip, point } = rollProfile(remaining);
    const stripCount = Math.ceil(end / 0.14);
    const project = a => {
      const { y, z, feed } = point(a);
      return { y: ROLL_MIDLINE + y - z * 0.18, z, feed,
        left: 3 + z * 0.10, right: w - 3 + z * 0.06 };
    };
    const strips = [];
    for (let i = 0, from = project(0); i < stripCount; i++) {
      const to = project(end * (i + 1) / stripCount);
      strips.push({ from, to, angle: end * (i + 0.5) / stripCount, lip: hasLip && i === stripCount - 1 });
      from = to;
    }
    strips.sort((a, b) => (a.from.z + a.to.z) - (b.from.z + b.to.z));
    const textured = image && texture.complete && texture.naturalWidth && textureHeight;

    for (const { from, to, angle, lip } of strips) {
      const y = Math.min(from.y, to.y), h = Math.abs(to.y - from.y) + 0.65;
      const left = (from.left + to.left) / 2, right = (from.right + to.right) / 2;
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(left, y, right - left, h);
      if (textured) {
        const texel = texture.naturalHeight / textureHeight;
        const v = Math.min(texture.naturalHeight - 1, (flat + from.feed) * texel);
        const sample = Math.min(texture.naturalHeight - v, Math.max(1, (to.feed - from.feed) * texel));
        ctx.save();
        if (to.y < from.y) { ctx.translate(0, 2 * y + h); ctx.scale(1, -1); }
        ctx.drawImage(texture, 0, v, texture.naturalWidth, sample, left, y, right - left, h);
        ctx.restore();
      }
      const light = Math.sin(angle);
      ctx.fillStyle = light > 0 ? `rgba(93, 62, 39, ${light * 0.28})` : `rgba(255, 252, 241, ${-light * 0.32})`;
      ctx.fillRect(left, y, right - left, h);
      ctx.fillStyle = 'rgba(103, 77, 50, 0.18)';
      ctx.fillRect(left, y, 0.75, h);
      if (lip && to.z > 1) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const x = to.left + (to.right - to.left) * i / 24;
          ctx.lineTo(x, to.y + Math.sin(i * 4.3) * Math.min(0.7, to.z * 0.08));
        }
        ctx.strokeStyle = 'rgba(103, 77, 50, 0.44)';
        ctx.stroke();
      }
    }
  };
}
