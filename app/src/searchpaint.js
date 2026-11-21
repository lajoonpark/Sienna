// How the search bar and slips arrive and leave: as chunky individual oil-paint dabs.
//   Open:  each indigo oil dab is pressed onto the canvas one by one (squash-pop as the loaded brush
//          lands, throwing thick flecks of paint), followed by the cream dabs on top, then the
//          magnifying glass and typed text.
//   Close: the dabs flick and lift off to the right one after another.
// Results use chunky dab footprints as a stop-motion mask (slipMasks), so 20 slips cost no canvas each.
//
// Everything hangs off one clock, so a hotkey pressed halfway just runs that clock backwards.
import { rng } from './rand.js';
import { drawOilDab, solidify, TONES } from './brushpaint.js';
import { prefersReducedMotion } from './ui/tokens.js';

export const IN_MS = 620, OUT_MS = 460;
export const MARGIN = 64;    // room around the bar for droplets (the canvas is this much larger on every side)
export const SLIP_FRAMES = 10;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const flick = (x) => x * x;
const backOut = (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
const spring = (x) => 1 - Math.exp(-5.5 * x) * Math.cos(11 * x);

// One sprite per dab direction: frame 0 is bare (hides the slip while it waits), each subsequent
// frame presses down another chunky oil-dab footprint across the slip until the final frame is solid.
export function slipMasks() {
  const W = 240, H = 24;
  const make = (mirror) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H * SLIP_FRAMES;
    const g = c.getContext('2d');
    const r = rng(mirror ? 18 : 7);
    const dabs = Array.from({ length: 6 }, (_, i) => {
      const u = (i + 0.5) / 6;
      const x = (mirror ? 1 - u : u) * W + (r() - 0.5) * 10;
      const y = H * (0.45 + (r() - 0.5) * 0.24);
      return { x, y, rx: 32 + r() * 12, ry: H * (0.58 + r() * 0.2), a: (r() - 0.5) * 0.24 };
    });
    for (let k = 1; k < SLIP_FRAMES; k++) {
      g.save();
      g.beginPath();
      g.rect(0, k * H, W, H);
      g.clip();
      g.translate(0, k * H);
      if (k === SLIP_FRAMES - 1) {
        g.fillRect(0, 0, W, H);
      } else {
        const p = k / (SLIP_FRAMES - 1);
        dabs.forEach((d, idx) => {
          const dp = span(p, idx * 0.1, idx * 0.1 + 0.38);
          if (dp <= 0) return;
          const s = backOut(dp);
          g.save();
          g.translate(d.x, d.y);
          g.rotate(d.a);
          g.beginPath();
          g.ellipse(0, 0, d.rx * s, d.ry * (0.75 + 0.25 * dp), 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        });
      }
      g.restore();
    }
    return `url(${c.toDataURL()})`;
  };
  return { fromLeft: make(false), fromRight: make(true) };
}

//   const paint = createBarPaint({ canvas, bar, glass, input, onClosed });
//   paint.setLayers({ w, h, inkDabs, paperDabs, paperRect });
//   paint.play(true | false);
//   paint.lead();
export function createBarPaint({ canvas, bar, glass, input, onClosed }) {
  const g = canvas.getContext('2d');
  const r = rng(77);
  const calm = prefersReducedMotion();

  let layers = null, inkLayer = null, paperLayer = null, frameId = 0, last = 0;
  let phase = 'in', t = 0, dir = 1, want = false;
  let landed = new Set();
  let drops = [];

  const dur = () => (phase === 'in' ? IN_MS : OUT_MS);
  const atEnd = () => (dir > 0 ? t >= dur() : t <= 0);

  function spawn(x, y, n, colours, { fast = 0, spread = 170 } = {}) {
    for (let i = 0; i < n && drops.length < 90; i++) {
      drops.push({
        x, y,
        vx: 110 + r() * 300 + fast * r(),
        vy: (r() - 0.6) * spread * 2,
        size: 1.1 + r() ** 2 * 3.4,
        life: 220 + r() * 280,
        colour: colours[Math.floor(r() * colours.length)],
      });
    }
  }

  function scheduleDabs() {
    if (!layers) return [];
    const { inkDabs, paperDabs, paperRect: pr } = layers;
    const nI = inkDabs.length || 1, nP = paperDabs.length || 1;
    const list = [];
    inkDabs.forEach((dab, i) => {
      const s = (i / Math.max(1, nI)) * 0.42;
      const outS = 0.2 + (i / Math.max(1, nI)) * 0.42;
      const colours = dab.soft ? [dab.color] : TONES.ink;
      list.push({ id: `i${i}`, dab, ox: 0, oy: 0, colours, inAt: s, inEnd: s + 0.19, outAt: outS, outEnd: outS + 0.34 });
    });
    paperDabs.forEach((dab, i) => {
      const s = 0.22 + (i / Math.max(1, nP)) * 0.4;
      const outS = 0.04 + (i / Math.max(1, nP)) * 0.38;
      const colours = dab.soft ? [dab.color] : TONES.paper;
      list.push({ id: `p${i}`, dab, ox: pr.x, oy: pr.y, colours, inAt: s, inEnd: s + 0.19, outAt: outS, outEnd: outS + 0.32 });
    });
    return list;
  }

  function bakeLayer(w, h, dabs, dpr) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * dpr));
    c.height = Math.max(1, Math.ceil(h * dpr));
    const cg = c.getContext('2d');
    cg.scale(dpr, dpr);
    for (const dab of dabs) drawOilDab(cg, dab);
    solidify(cg, c.width, c.height);
    return c;
  }

  let plan = [];

  function pose() {
    const u = t / dur();
    if (phase === 'in') {
      const s = spring(u), thwack = Math.sin(Math.PI * span(u, 0.45, 0.8)) * 0.045;
      bar.style.transform = `translateY(${-10 * (1 - s)}px) rotate(${-2.5 + 1.9 * s}deg) scale(${0.96 + 0.04 * s}, ${0.86 + 0.14 * s + thwack})`;
    } else {
      const e = flick(u);
      bar.style.transform = `translate(${42 * e}px, ${-7 * e}px) rotate(${-0.6 - 3.0 * e}deg) skewX(${-8 * e}deg)`;
    }
    const k = phase === 'in' ? span(u, 0.52, 1) : 1 - span(u, 0, 0.24);
    glass.style.opacity = input.style.opacity = String(k);
    glass.style.transform = `scale(${0.3 + 0.7 * backOut(k)}) rotate(${-25 * (1 - k)}deg)`;
    input.style.transform = `translateX(${-10 * (1 - k)}px)`;
  }

  function draw(dt) {
    const u = t / dur(), going = phase === 'out';
    g.clearRect(-MARGIN, -MARGIN, canvas.width, canvas.height);

    for (const item of plan) {
      if (going) {
        const p = span(u, item.outAt, item.outEnd);
        if (p >= 1) continue;
        if (dir > 0 && p > 0.05 && !landed.has(item.id)) {
          landed.add(item.id);
          spawn(item.ox + item.dab.x + item.dab.len * 0.35, item.oy + item.dab.y, 4, item.colours, { fast: 320, spread: 210 });
        }
        const e = flick(p);
        drawOilDab(g, item.dab, {
          dx: item.ox + 44 * e,
          dy: item.oy - 8 * e,
          scaleX: 1 - 0.55 * e,
          scaleY: 1 - 0.35 * e,
          alpha: 1 - smooth(p),
        });
      } else {
        const p = span(u, item.inAt, item.inEnd);
        if (p <= 0) continue;
        if (dir > 0 && p >= 0.4 && !landed.has(item.id)) {
          landed.add(item.id);
          spawn(item.ox + item.dab.x + item.dab.len * 0.3, item.oy + item.dab.y, 3, item.colours, { fast: 160, spread: 165 });
        }
        const s = backOut(p);
        const sq = 0.74 + 0.26 * s;
        drawOilDab(g, item.dab, {
          dx: item.ox - 6 * (1 - smooth(p)),
          dy: item.oy - 9 * (1 - smooth(p)),
          scaleX: 0.35 + 0.65 * s,
          scaleY: sq,
          alpha: clamp01(p * 2.2),
        });
      }
    }

    const sec = dt / 1000;
    drops = drops.filter((d) => (d.life -= dt) > 0);
    for (const d of drops) {
      d.x += d.vx * sec; d.y += d.vy * sec;
      d.vy += 880 * sec; d.vx *= 0.985;
      g.globalAlpha = clamp01(d.life / 120);
      g.fillStyle = d.colour;
      g.beginPath();
      g.ellipse(d.x, d.y, d.size * (1 + Math.hypot(d.vx, d.vy) / 520), d.size, Math.atan2(d.vy, d.vx), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function rest() {
    bar.style.transform = glass.style.transform = input.style.transform = '';
    glass.style.opacity = input.style.opacity = '';
    g.clearRect(-MARGIN, -MARGIN, canvas.width, canvas.height);
    if (want) {
      const { w, h, paperRect: pr } = layers;
      if (inkLayer) g.drawImage(inkLayer, 0, 0, w, h);
      if (paperLayer) g.drawImage(paperLayer, pr.x, pr.y, pr.w, pr.h);
    } else onClosed();
  }

  function frame(now) {
    frameId = 0;
    if (!layers) { frameId = requestAnimationFrame(frame); last = now; return; }
    const dt = Math.max(0, now - last);
    last = now;
    t = Math.min(dur(), Math.max(0, t + dir * dt));
    pose();
    draw(dt);
    if (atEnd() && !drops.length) { rest(); return; }
    frameId = requestAnimationFrame(frame);
  }

  function play(open) {
    want = open;
    if (calm) { if (layers || !open) { drops = []; if (layers) rest(); else onClosed(); } return; }
    if (!frameId || atEnd()) {
      phase = open ? 'in' : 'out';
      t = 0; dir = 1;
      landed.clear();
    } else dir = (phase === 'in') === open ? 1 : -1;
    pose();
    if (!frameId) { last = performance.now(); frameId = requestAnimationFrame(frame); }
  }

  function setLayers(next) {
    layers = next;
    plan = scheduleDabs();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    inkLayer = bakeLayer(next.w, next.h, next.inkDabs, dpr);
    paperLayer = bakeLayer(next.paperRect.w, next.paperRect.h, next.paperDabs, dpr);
    canvas.width = Math.ceil((next.w + MARGIN * 2) * dpr);
    canvas.height = Math.ceil((next.h + MARGIN * 2) * dpr);
    g.setTransform(dpr, 0, 0, dpr, MARGIN * dpr, MARGIN * dpr);
    if (!frameId && want) rest();
  }

  const lead = () => (phase === 'in' && dir > 0 && frameId ? Math.max(0, IN_MS * 0.42 - t) : 0);

  return { setLayers, play, lead };
}
