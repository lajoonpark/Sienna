// Everything the suitcase wears is painted here with canvas 2D, so the app ships no image files:
// leather, quilted lining, speaker cloth, the grooves of the vinyl, glyphs for the buttons, the shadow
// and the shine. The surfaces carry thick opaque oil-paint dabs (brushpaint.js) with impasto ridges
// and subtle canvas weave, matching the 3D shop.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { coat, mark, dabClusterCanvas, canvasWeavePattern, LEAN, TONES } from '../brushpaint.js';
import { COLORS } from '../ui/tokens.js';

export const COL = {
  leather: '#c98c57',
  leatherDark: '#8f5733',
  lining: '#f1e3bf',
  brass: '#d9a441',
  brassLight: '#ecc468',
  deck: '#e2d5b4',        // cream deck plate: the dark record and the indigo caps read against it
  platter: '#7a6c68',
  vinyl: '#2d262c',
  cloth: '#d6c08a',
  steel: '#cfc3ab',       // the arm: pale warm metal, oil-painted rather than chrome
  ink: COLORS.indigo,     // indigo, matching the shop's oil-dab buttons
  hot: COLORS.terracotta, // terracotta on hover / liked
  paper: COLORS.paper,
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, { repeat, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// A coat of oil dabs that tiles, over subtle canvas weave. `tile`: how many units of the case one repeat covers.
function coated(tones, { S = 512, tile, len = 140, wid = 48, seed, impasto = 1.1, extra }) {
  const [c, g] = canvas(S, S);
  g.fillStyle = tones[0];
  g.fillRect(0, 0, S, S);
  coat(g, S, S, { tones, len, wid, seed, tile: true, impasto });
  extra?.(g, S);
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.25;
  g.fillStyle = canvasWeavePattern(g);
  g.fillRect(0, 0, S, S);
  g.restore();
  return texture(c, { repeat: [1 / tile, 1 / tile] });
}

// Tan leather.
export function leatherTexture() {
  return coated(['#c98c57', '#bd7d49', '#d49a66', '#b3713f', '#d9a470', '#c48450', '#c9895a'], { tile: 2.6, seed: 7 });
}

// Cream lining of the lid.
export function liningTexture() {
  return coated(['#f1e3bf', '#ecdbb2', '#f5eacc', '#e8d5a8', '#f7eed6'], { tile: 3, seed: 11, impasto: 0.9 });
}

// The cream deck plate, in quiet impasto dabs under the controls.
export function deckTexture() {
  return coated(['#e2d5b4', '#ddcfac', '#e7dbbd', '#d8c9a4', '#e4d8b9'], { tile: 3, seed: 23, impasto: 0.85 });
}

// Speaker cloth: wheat oil dabs with the weave showing through.
export function clothTexture() {
  return coated(['#d6c08a', '#cbb379', '#e0cd9c', '#c4aa6e'], {
    S: 256, tile: 1, len: 86, wid: 30, seed: 5, impasto: 0.9,
    extra: (g, S) => {
      g.lineWidth = 1.4;
      for (let i = -S; i < S * 2; i += 8) {
        g.strokeStyle = 'rgba(110,80,36,.24)';
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
        g.strokeStyle = 'rgba(255,248,214,.26)';
        g.beginPath(); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke();
      }
    },
  });
}

// Oil dabs in shades of white, multiplied by a part's own colour (metal, caps, knob, cartridge).
export function strokesTexture() {
  return coated(['#ffffff', '#f0ebe2', '#fff7ea', '#e4dccf', '#eef1f6', '#f7f2e8', '#d9d0c1'], { tile: 1.6, seed: 19, len: 130, wid: 44, impasto: 1.15 });
}

// The face of the vinyl: concentric oil dabs in dark charcoal-plum, then grooves and scuffs.
export function vinylTexture(labelFraction) {
  const S = 1024, [c, g] = canvas(S, S), m = S / 2, r = rng(21);
  g.fillStyle = COL.vinyl;
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.clip();
  for (let ring = m * labelFraction + 30; ring < m; ring += 42) {
    const n = Math.round((ring * Math.PI * 2) / 140);
    for (let i = 0; i < n; i++) {
      const a = ((i + r()) / n) * Math.PI * 2;
      mark(g, m + Math.cos(a) * ring, m + Math.sin(a) * ring, 210, 62, a + Math.PI / 2, ['#2d262c', '#393037', '#241e25', '#40363c'][Math.floor(r() * 4)], r, 1, { impasto: 0.75 });
    }
  }
  g.restore();
  let rad = m * labelFraction + 8;
  const limit = m * 0.965;
  while (rad < limit) {
    const gap = r() < 0.018;
    g.strokeStyle = `rgba(255,236,226,${gap ? 0.03 : 0.05 + r() * 0.12})`;
    g.lineWidth = gap ? 6 : 0.9 + r() * 1.4;
    g.beginPath(); g.arc(m, m, rad, 0, Math.PI * 2); g.stroke();
    rad += 2.4 + r() * 3.4;
  }
  // lip at the rim and the run-out ring by the label
  g.strokeStyle = 'rgba(255,236,226,.22)'; g.lineWidth = 4;
  g.beginPath(); g.arc(m, m, m * 0.985, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.arc(m, m, m * labelFraction + 3, 0, Math.PI * 2); g.stroke();
  // scuffs: a few faint wedges that are NOT symmetric, so the turning shows
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2, w = 0.04 + r() * 0.09;
    g.fillStyle = `rgba(255,236,226,${0.05 + r() * 0.06})`;
    g.beginPath(); g.moveTo(m, m); g.arc(m, m, limit, a, a + w); g.closePath(); g.fill();
  }
  const t = texture(c);
  t.anisotropy = 8;
  return t;
}

// Plain label for a track without a cover: terracotta oil dabs with a cream ring, like a pressing label.
export function fallbackLabel() {
  const S = 256, [c, g] = canvas(S, S);
  g.fillStyle = COL.hot;
  g.fillRect(0, 0, S, S);
  coat(g, S, S, { tones: TONES.hot, len: 84, wid: 30, seed: 43, impasto: 0.9 });
  g.strokeStyle = 'rgba(251,245,232,.88)'; g.lineWidth = 6;
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(251,245,232,.92)';
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.12, 0, Math.PI * 2); g.fill();
  return texture(c);
}

// Two soft bright wedges that stay put while the record turns under them (the shine of a lamp).
export function sheenTexture(labelFraction) {
  const S = 512, [c, g] = canvas(S, S), m = S / 2;
  g.save();
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.arc(m, m, m * labelFraction, 0, Math.PI * 2, true);
  g.clip('evenodd');
  for (let deg = 0; deg < 360; deg++) {
    const a = (deg * Math.PI) / 180, lobe = Math.pow(Math.abs(Math.cos(a - Math.PI * 0.28)), 20);
    if (lobe < 0.01) continue;
    g.fillStyle = `rgba(255,250,235,${0.34 * lobe})`;
    g.beginPath(); g.moveTo(m, m); g.lineTo(m + m * Math.cos(a), m + m * Math.sin(a));
    g.lineTo(m + m * Math.cos(a + Math.PI / 180), m + m * Math.sin(a + Math.PI / 180)); g.closePath(); g.fill();
  }
  g.restore();
  return texture(c);
}

// Brown oil dabs under the case: the shadow is painted on the same diagonal, thinning out from the middle.
export function shadowTexture() {
  const S = 512, [c, g] = canvas(S, S), r = rng(31);
  for (let i = 0; i < 120; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.44;
    const x = S / 2 + Math.cos(a) * d * S, y = S / 2 + Math.sin(a) * d * S * 0.88;
    const falloff = 1 - (d / 0.44) ** 2;
    mark(g, x, y, 120 + r() * 55, 38 + r() * 18, LEAN + (r() - 0.5) * 0.16, ['#604232', '#6d4c3a', '#573b30'][Math.floor(r() * 3)], r, 0.34 * falloff, { impasto: 0.65 });
  }
  return texture(c);
}

// ---- glyphs for the buttons: chunky shapes with rounded joins, cream (or terracotta when liked) ----
const GLYPHS = {
  play: (g, S) => { g.beginPath(); g.moveTo(S * 0.36, S * 0.25); g.lineTo(S * 0.76, S * 0.5); g.lineTo(S * 0.36, S * 0.75); g.closePath(); },
  pause: (g, S) => { g.beginPath(); g.roundRect(S * 0.28, S * 0.25, S * 0.17, S * 0.5, S * 0.04); g.roundRect(S * 0.55, S * 0.25, S * 0.17, S * 0.5, S * 0.04); },
  previous: (g, S) => {
    g.beginPath(); g.roundRect(S * 0.22, S * 0.26, S * 0.1, S * 0.48, S * 0.03);
    g.moveTo(S * 0.78, S * 0.27); g.lineTo(S * 0.4, S * 0.5); g.lineTo(S * 0.78, S * 0.73); g.closePath();
  },
  next: (g, S) => {
    g.beginPath(); g.roundRect(S * 0.68, S * 0.26, S * 0.1, S * 0.48, S * 0.03);
    g.moveTo(S * 0.22, S * 0.27); g.lineTo(S * 0.6, S * 0.5); g.lineTo(S * 0.22, S * 0.73); g.closePath();
  },
  heart: (g, S) => {
    g.beginPath(); g.moveTo(S * 0.5, S * 0.78);
    g.bezierCurveTo(S * 0.14, S * 0.52, S * 0.2, S * 0.2, S * 0.38, S * 0.24);
    g.bezierCurveTo(S * 0.46, S * 0.26, S * 0.5, S * 0.32, S * 0.5, S * 0.36);
    g.bezierCurveTo(S * 0.5, S * 0.32, S * 0.54, S * 0.26, S * 0.62, S * 0.24);
    g.bezierCurveTo(S * 0.8, S * 0.2, S * 0.86, S * 0.52, S * 0.5, S * 0.78);
    g.closePath();
  },
};

export function glyphTexture(kind) {
  const S = 128, [c, g] = canvas(S, S);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const shape = GLYPHS[kind === 'heartFill' ? 'heart' : kind];
  shape(g, S);
  if (kind === 'heart') {
    g.strokeStyle = COL.paper; g.lineWidth = S * 0.07; g.stroke();   // an outline heart
  } else if (kind === 'heartFill') {
    g.fillStyle = COL.hot; g.fill();
    g.strokeStyle = COL.paper; g.lineWidth = S * 0.06; g.stroke();   // terracotta, edged in cream so it reads on indigo
  } else {
    g.fillStyle = COL.paper; g.fill();
    g.strokeStyle = COL.paper; g.lineWidth = S * 0.05; g.stroke();
  }
  return texture(c);
}

// Blending that keeps the scene buffer's alpha alone: alpha 0 there means "crisp, leave unpainted",
// so a soft wash or shine must mix its colour in without touching it.
export function washBlend(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}

// The small window's backdrop: a quiet corner inside the Sienna shop painted in crisp, low-contrast
// oil dabs (no blur) — limestone plaster wall with the shop's arched window on the left, a soft
// shaft of daylight across the wall and oak-walnut shop table, and a terracotta potted plant on the desk.
export function brushBackdrop(w, h) {
  const S = 2, W = w * S, H = h * S, [c, g] = canvas(W, H);
  // Wall-meets-table edge tilted slightly up-right to match the mini camera's yaw (-0.34).
  const wallY0 = H * 0.455, wallY1 = H * 0.365;
  const wallAngle = Math.atan2(wallY1 - wallY0, W);
  const wallY = (x) => wallY0 + (wallY1 - wallY0) * (x / W);
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mixRGB = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));

  // Soft diagonal daylight spilling from the upper-left arched window across the wall and desk.
  const sunAt = (x, y) => {
    const u = x / W, v = y / H;
    const across = (u - 0.19) * 0.86 - (v - 0.14) * 0.54;
    const beam = (1 - smooth(0.14, 0.44, Math.abs(across))) * (1 - smooth(0.58, 1.05, v));
    return Math.max(0, Math.min(1, beam));
  };

  // 1. Warm limestone plaster wall (upper region)
  g.fillStyle = '#d9c6aa';
  g.fillRect(0, 0, W, H);
  g.save();
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, wallY1 + 28); g.lineTo(0, wallY0 + 28);
  g.closePath();
  g.clip();
  const wallShade = [198, 180, 158];
  const wallMid = [224, 205, 178];
  const wallLit = [244, 229, 200];
  coat(g, W, H * 0.54, {
    tones: (x, y, r) => {
      const u = x / W, v = y / H;
      const sun = sunAt(x, y);
      const base = mixRGB(wallMid, wallShade, smooth(0.45, 0.98, u) * 0.68 + (1 - v) * 0.1);
      const col = mixRGB(base, wallLit, sun * 0.72);
      const j = (r() - 0.5) * 6;
      return col.map((ch) => Math.max(0, Math.min(255, Math.round(ch + j))));
    },
    len: 290, wid: 112, seed: 76, lean: 0.42, rowGap: 0.28, colGap: 0.48, impasto: 0.24, quiet: true,
  });

  // 2. Sienna's arched window on the upper-left, tilted gently at wallAngle to match the room perspective
  const winCx = W * 0.175, winHalf = W * 0.138;
  const winSillY = wallY(winCx) - H * 0.044;
  const winSpringY = H * 0.21;
  const winSkew = (x) => (x - winCx) * Math.tan(wallAngle);
  const archPath = (inset = 0) => {
    const r = winHalf - inset;
    g.beginPath();
    g.moveTo(winCx - r, winSillY + winSkew(winCx - r));
    g.lineTo(winCx - r, winSpringY + winSkew(winCx - r));
    g.arc(winCx, winSpringY, r, Math.PI, 0, false);
    g.lineTo(winCx + r, winSillY + winSkew(winCx + r));
    g.closePath();
  };

  // Deep masonry arch reveal (#e0c9a0 from shop.js), lit along the right inside cheek
  archPath(-18);
  g.fillStyle = '#c8af8c';
  g.fill();
  g.save();
  archPath(-18);
  g.clip();
  const rr = rng(61);
  for (let i = 0; i < 24; i++) {
    const a = (i / 23) * Math.PI;
    const px = winCx + Math.cos(a) * (winHalf + 4);
    const py = winSpringY - Math.sin(a) * (winHalf + 4);
    mark(g, px, py, 64, 24, -a + Math.PI / 2, px > winCx ? '#e4cfa8' : '#b89f7d', rr, 0.85, { impasto: 0.22, quiet: true });
  }
  g.restore();

  // Inside the window: soft dusty sky and garden greenery outside
  g.save();
  archPath(0);
  g.clip();
  g.fillStyle = '#bdd0dc';
  g.fillRect(winCx - winHalf - 10, winSpringY - winHalf - 10, winHalf * 2 + 20, winSillY + 40);
  coat(g, winCx + winHalf + 40, winSillY + 40, {
    tones: (x, y, r) => {
      const fy = Math.max(0, Math.min(1, (y - (winSpringY - winHalf)) / (winSillY - (winSpringY - winHalf))));
      const sky = mixRGB([164, 190, 208], [218, 224, 212], smooth(0.15, 0.72, fy));
      const leaf = [122, 146, 98];
      const garden = smooth(0.56, 0.84, fy + (r() - 0.5) * 0.14);
      const col = mixRGB(sky, leaf, garden * 0.88);
      return col.map((ch) => Math.max(0, Math.min(255, Math.round(ch + (r() - 0.5) * 8))));
    },
    len: 120, wid: 54, seed: 64, lean: 0.35, rowGap: 0.34, colGap: 0.52, impasto: 0.18, quiet: true,
  });
  // Soft sunlit foliage clumps in the courtyard beyond
  const gr = rng(65);
  for (let i = 0; i < 16; i++) {
    const gx = winCx + (gr() - 0.5) * winHalf * 1.9;
    const gy = winSillY - H * (0.02 + gr() * 0.12);
    const tone = ['#788f5b', '#8aa06a', '#647b4c', '#98ab76'][Math.floor(gr() * 4)];
    mark(g, gx, gy, 72 + gr() * 34, 38 + gr() * 18, 0.3 + (gr() - 0.5) * 0.5, tone, gr, 0.78, { impasto: 0.2, quiet: true });
  }
  // Right-side reveal thickness inside the opening (sunlit plaster cheek on the right)
  g.fillStyle = 'rgba(232,212,178,0.65)';
  g.beginPath();
  g.moveTo(winCx + winHalf - 10, winSillY + 20);
  g.lineTo(winCx + winHalf - 10, winSpringY);
  g.arc(winCx, winSpringY, winHalf - 10, 0, -Math.PI * 0.45, true);
  g.lineTo(winCx + winHalf, winSpringY - winHalf);
  g.lineTo(winCx + winHalf, winSillY + 20);
  g.closePath();
  g.fill();

  // Cream glazing bars (#efe8da, matching lounge window in shop.js) aligned with wall perspective
  g.strokeStyle = '#ebe2cf';
  g.lineWidth = 7.5;
  g.lineCap = 'round';
  for (const fx of [-0.5, 0, 0.5]) {
    const bx = winCx + winHalf * fx;
    const topY = winSpringY - Math.sqrt(Math.max(0, winHalf * winHalf - (winHalf * fx) ** 2)) + 2;
    g.beginPath(); g.moveTo(bx, winSillY + winSkew(bx)); g.lineTo(bx, topY); g.stroke();
  }
  for (const by of [winSpringY, (winSpringY + winSillY) * 0.54]) {
    g.beginPath();
    g.moveTo(winCx - winHalf, by + winSkew(winCx - winHalf));
    g.lineTo(winCx + winHalf, by + winSkew(winCx + winHalf));
    g.stroke();
  }
  archPath(3);
  g.lineWidth = 8.5;
  g.stroke();
  g.restore();

  // Stone window sill (#e2d4ba) tilted along the wall, casting a gentle shadow onto the plaster below
  g.save();
  g.translate(winCx, winSillY);
  g.rotate(wallAngle);
  g.fillStyle = 'rgba(84,62,44,0.2)';
  g.fillRect(-winHalf - 16, 10, winHalf * 2 + 32, 11);
  g.fillStyle = '#e2d4ba';
  g.fillRect(-winHalf - 20, -4, winHalf * 2 + 40, 15);
  g.fillStyle = '#ccb99d';
  g.fillRect(-winHalf - 20, 7, winHalf * 2 + 40, 5);
  g.restore();
  g.restore();

  // 3. Warm painted wood shop table (lower region, inspired by binTable & shop counter)
  g.save();
  g.beginPath();
  g.moveTo(0, wallY0); g.lineTo(W, wallY1); g.lineTo(W, H); g.lineTo(0, H);
  g.closePath();
  g.clip();
  g.fillStyle = '#8b6342';
  g.fillRect(0, wallY1 - 10, W, H);
  const woodDark = [118, 84, 58];
  const woodMid = [152, 110, 74];
  const woodLit = [194, 146, 98];
  coat(g, W, H, {
    tones: (x, y, r) => {
      const u = x / W, v = y / H;
      const sun = sunAt(x, y);
      const depth = smooth(0.42, 0.96, v);
      const base = mixRGB(woodMid, woodDark, depth * 0.52 + smooth(0.55, 1.0, u) * 0.36);
      const col = mixRGB(base, woodLit, sun * 0.72);
      const j = (r() - 0.5) * 7;
      return col.map((ch) => Math.max(0, Math.min(255, Math.round(ch + j))));
    },
    len: 320, wid: 96, seed: 83, lean: wallAngle, rowGap: 0.26, colGap: 0.48, impasto: 0.25, quiet: true,
  });

  // Painted plank seams and subtle wood grain aligned along the table perspective
  const pr = rng(88);
  for (const frac of [0.17, 0.4, 0.66, 0.89]) {
    const yL = wallY0 + (H - wallY0) * frac;
    const yR = wallY1 + (H - wallY1) * (frac * 0.94);
    for (let k = 0; k < 7; k++) {
      const t = (k + 0.5) / 7;
      mark(g, W * t, lerp(yL, yR, t) + (pr() - 0.5) * 2.5, 220, 9, wallAngle + (pr() - 0.5) * 0.014, '#5a3c26', pr, 0.24, { impasto: 0.14, quiet: true });
    }
  }
  // Wall crease shadow + faint table back-edge bevel
  g.save();
  g.translate(0, wallY0);
  g.rotate(wallAngle);
  const creaseLen = Math.hypot(W, wallY1 - wallY0) + 40;
  const crease = g.createLinearGradient(0, -2, 0, 48);
  crease.addColorStop(0, 'rgba(54,36,24,0.36)');
  crease.addColorStop(0.38, 'rgba(54,36,24,0.12)');
  crease.addColorStop(1, 'rgba(54,36,24,0)');
  g.fillStyle = crease;
  g.fillRect(-20, -2, creaseLen, 54);
  g.restore();

  // 4. Terracotta potted plant sitting on the right side of the desk (clear of suitcase & controls)
  const px = W * 0.84, py = H * 0.465;
  const dr = rng(109);
  // Soft cast shadow on the table toward the lower-right (away from the upper-left window)
  for (let i = 0; i < 6; i++) {
    mark(g, px + 34 + i * 10, py + 8 + i * 3, 76, 30, 0.14, '#533826', dr, 0.28 - i * 0.03, { impasto: 0.1, quiet: true });
  }
  g.restore();

  // Draw the pot & foliage unclipped by wall/table so leaves rise naturally in front of the wall
  const potH = H * 0.088, potTopW = W * 0.106, potBotW = W * 0.074;
  const potY0 = py - potH, potY1 = py;
  // Pot body (terracotta #c4673d painted in oil dabs, lit left, shaded right)
  g.save();
  g.beginPath();
  g.moveTo(px - potTopW / 2, potY0 + 10);
  g.lineTo(px + potTopW / 2, potY0 + 10);
  g.lineTo(px + potBotW / 2, potY1);
  g.quadraticCurveTo(px, potY1 + 12, px - potBotW / 2, potY1);
  g.closePath();
  g.fillStyle = '#bd5f38';
  g.fill();
  g.clip();
  for (let i = 0; i < 6; i++) {
    const fx = -0.38 + (i / 5) * 0.76;
    const col = fx < -0.1 ? '#d4784d' : fx > 0.12 ? '#914224' : '#be6039';
    mark(g, px + fx * potTopW, potY0 + potH * 0.56, 78, 30, Math.PI / 2, col, dr, 0.88, { impasto: 0.3, quiet: true });
  }
  g.restore();

  // Curved 3D rim & soil ellipse (seen from above, matching the camera pitch)
  g.save();
  const rimGrad = g.createLinearGradient(px - potTopW * 0.56, 0, px + potTopW * 0.56, 0);
  rimGrad.addColorStop(0, '#dd865a');
  rimGrad.addColorStop(0.5, '#c4673d');
  rimGrad.addColorStop(1, '#944627');
  g.fillStyle = rimGrad;
  g.beginPath();
  g.ellipse(px, potY0 + 10, potTopW * 0.55, 11, 0, 0, Math.PI);
  g.lineTo(px - potTopW * 0.55, potY0 - 2);
  g.ellipse(px, potY0 - 2, potTopW * 0.55, 11, 0, Math.PI, 0, true);
  g.closePath();
  g.fill();
  g.fillStyle = '#473429';
  g.beginPath();
  g.ellipse(px, potY0 - 2, potTopW * 0.46, 8.5, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Lush rounded foliage: orient dabs INWARD toward the pot center so the rounded brush start
  // forms organic leaf tips instead of spiky tails, with a couple leaves draping over the rim.
  const leafClumps = [
    { dx: -26, dy: -46, len: 68, wid: 34, ang: -2.05, col: '#5a7843' },
    { dx: 24, dy: -44, len: 66, wid: 34, ang: -1.1, col: '#4a6436' },
    { dx: -10, dy: -62, len: 70, wid: 36, ang: -1.75, col: '#69894f' },
    { dx: 12, dy: -58, len: 66, wid: 34, ang: -1.35, col: '#54713d' },
    { dx: 0, dy: -74, len: 64, wid: 34, ang: -1.56, col: '#719257' },
    { dx: -38, dy: -22, len: 58, wid: 30, ang: -2.55, col: '#6d8d52' },
    { dx: 38, dy: -18, len: 56, wid: 28, ang: -0.58, col: '#4c6738' },
    { dx: -18, dy: -32, len: 56, wid: 30, ang: -2.1, col: '#7c9c60' },
    { dx: 18, dy: -26, len: 54, wid: 28, ang: -0.95, col: '#64834b' },
    { dx: -32, dy: 2, len: 52, wid: 26, ang: -2.85, col: '#739358' },
    { dx: 32, dy: 4, len: 50, wid: 25, ang: -0.22, col: '#53703d' },
    { dx: -2, dy: -16, len: 54, wid: 28, ang: -1.62, col: '#5e7d45' },
  ];
  for (const lf of leafClumps) {
    mark(g, px + lf.dx, potY0 + lf.dy, lf.len, lf.wid, lf.ang + Math.PI, lf.col, dr, 0.95, { impasto: 0.34, quiet: true });
  }

  g.save();
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.2;
  g.fillStyle = canvasWeavePattern(g);
  g.fillRect(0, 0, W, H);
  g.restore();
  return texture(c);
}

// A cluster of thick cream oil dabs under the in-shop case, with warm umber shadow dabs beneath it,
// separating the suitcase cleanly from the wood and carpet behind it.
export function paperPatchTexture() {
  const S = 256, [c, g] = canvas(S, S), r = rng(53);
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * S * 0.26;
    mark(g, S * 0.54 + Math.cos(a) * rad, S * 0.56 + Math.sin(a) * rad * 0.78, 95 + r() * 30, 34 + r() * 12, LEAN + (r() - 0.5) * 0.2, ['#78563c', '#6a4b35'][Math.floor(r() * 2)], r, 0.26, { impasto: 0.6 });
  }
  const patch = dabClusterCanvas(Math.round(S * 0.82), Math.round(S * 0.72), {
    tones: TONES.paper,
    seed: 55,
    rows: 4,
    tilt: 0.14,
    overlap: 0.46,
    minCols: 3,
    impasto: 1.05,
    scale: 1,
  });
  g.save();
  g.globalAlpha = 0.94;
  g.drawImage(patch, S * 0.08, S * 0.12);
  g.restore();
  return texture(c);
}
