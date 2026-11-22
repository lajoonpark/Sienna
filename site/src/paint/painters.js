// Every painted texture of the page, as in the app's suitcase (app/src/suitcase/paint.js): thick opaque
// oil dabs with impasto ridges over a subtle canvas weave. Each painter draws into a square 2D canvas
// and runs in the paint worker (OffscreenCanvas) or, without one, on the main thread.
import { rng } from './rand.js';
import { coat, mark, canvasWeavePattern, TONES, LEAN } from './brushpaint.js';
import { COLORS } from './tokens.js';

export const COL = {
  leather: '#c98c57',
  leatherDark: '#8f5733',
  lining: '#f1e3bf',
  brass: '#d9a441',
  brassLight: '#ecc468',
  deck: '#e2d5b4',
  platter: '#7a6c68',
  vinyl: '#2d262c',
  cloth: '#d6c08a',
  steel: '#cfc3ab',
  ink: COLORS.indigo,
  hot: COLORS.terracotta,
  paper: COLORS.paper,
};

function weave(g, S, alpha = 0.25) {
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = alpha;
  g.fillStyle = canvasWeavePattern(g);
  g.fillRect(0, 0, S, S);
  g.restore();
}

// A tiling coat of dabs over the weave.
function coated(g, S, tones, { len = 140, wid = 48, seed, impasto = 1.1, extra } = {}) {
  const k = S / 512;
  g.fillStyle = tones[0];
  g.fillRect(0, 0, S, S);
  coat(g, S, S, { tones, len: len * k, wid: wid * k, seed, tile: true, impasto });
  extra?.(g, S);
  weave(g, S);
}

// The vinyl's face: concentric dabs in dark charcoal-plum, then grooves, the rim lip and a few scuffs.
function vinyl(g, S, labelFraction = 0.34) {
  const m = S / 2, r = rng(21), k = S / 1024;
  g.clearRect(0, 0, S, S);
  g.fillStyle = COL.vinyl;
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.clip();
  for (let ring = m * labelFraction + 30 * k; ring < m; ring += 42 * k) {
    const n = Math.round((ring * Math.PI * 2) / (140 * k));
    for (let i = 0; i < n; i++) {
      const a = ((i + r()) / n) * Math.PI * 2;
      mark(g, m + Math.cos(a) * ring, m + Math.sin(a) * ring, 210 * k, 62 * k, a + Math.PI / 2, ['#2d262c', '#393037', '#241e25', '#40363c'][Math.floor(r() * 4)], r, 1, { impasto: 0.75 });
    }
  }
  g.restore();
  let rad = m * labelFraction + 8 * k;
  const limit = m * 0.965;
  while (rad < limit) {
    const gap = r() < 0.018;
    g.strokeStyle = `rgba(255,236,226,${gap ? 0.03 : 0.05 + r() * 0.12})`;
    g.lineWidth = (gap ? 6 : 0.9 + r() * 1.4) * k;
    g.beginPath(); g.arc(m, m, rad, 0, Math.PI * 2); g.stroke();
    rad += (2.4 + r() * 3.4) * k;
  }
  g.strokeStyle = 'rgba(255,236,226,.22)'; g.lineWidth = 4 * k;
  g.beginPath(); g.arc(m, m, m * 0.985, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3 * k;
  g.beginPath(); g.arc(m, m, m * labelFraction + 3 * k, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2, w = 0.04 + r() * 0.09;
    g.fillStyle = `rgba(255,236,226,${0.05 + r() * 0.06})`;
    g.beginPath(); g.moveTo(m, m); g.arc(m, m, limit, a, a + w); g.closePath(); g.fill();
  }
}

// A plain label for a record with no cover: terracotta dabs and a cream ring, like a pressing label.
function label(g, S) {
  g.fillStyle = COL.hot;
  g.fillRect(0, 0, S, S);
  coat(g, S, S, { tones: TONES.hot, len: 84 * (S / 256), wid: 30 * (S / 256), seed: 43, impasto: 0.9 });
  g.strokeStyle = 'rgba(251,245,232,.88)'; g.lineWidth = 6 * (S / 256);
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(251,245,232,.92)';
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.12, 0, Math.PI * 2); g.fill();
}

// White dabs on white, for multiplying by any colour (the sky, the alley's walls, the case's metal).
function strokes(g, S) {
  coated(g, S, ['#ffffff', '#f0ebe2', '#fff7ea', '#e4dccf', '#eef1f6', '#f7f2e8', '#d9d0c1'], { seed: 19, len: 130, wid: 44, impasto: 1.15 });
}

// Large soft dabs for the sky behind the page: the same, broader and gentler.
function skyStrokes(g, S) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  coat(g, S, S, { tones: ['#ffffff', '#f4f1ec', '#fbf8f2', '#eceae6', '#f7f4ee'], len: 260 * (S / 512), wid: 92 * (S / 512), seed: 77, tile: true, impasto: 0.7, quiet: true, rowGap: 0.3, colGap: 0.55 });
  weave(g, S, 0.18);
}

// Courses of stone or brick, each one dab inside its mortar joint; tiles both ways.
function masonry(g, S, { tones, mortar, rows, len, seed, impasto = 0.8 }) {
  g.fillStyle = mortar;
  g.fillRect(0, 0, S, S);
  const r = rng(seed), rowH = S / rows;
  for (let j = 0; j < rows; j++) {
    let x = -((j % 2) * 0.5 + r() * 0.3) * len;
    while (x < S) {
      const l = len * (0.75 + r() * 0.5);
      const col = tones[Math.floor(r() * tones.length)];
      const a = (r() - 0.5) * 0.05, seedR = Math.floor(r() * 1e6);
      for (const dx of [0, S]) mark(g, x + l / 2 - dx, (j + 0.5) * rowH, l * 1.08, rowH * 0.8, a, col, rng(seedR), 1, { impasto });
      x += l + rowH * 0.14;
    }
  }
  weave(g, S, 0.2);
}

// Flagstones: rows of slabs of uneven length, two or three dabs each, dark joints between.
function slabs(g, S, { tones, joint, rows, seed }) {
  g.fillStyle = joint;
  g.fillRect(0, 0, S, S);
  const r = rng(seed), rowH = S / rows;
  for (let j = 0; j < rows; j++) {
    let x = -r() * rowH;
    while (x < S) {
      const l = rowH * (1.1 + r() * 1.3);
      const col = tones[Math.floor(r() * tones.length)];
      const seedR = Math.floor(r() * 1e6);
      for (const dx of [0, S]) {
        const rr = rng(seedR);
        for (let k = 0; k < 3; k++) mark(g, x + l * (0.3 + 0.2 * k) - dx, (j + 0.5) * rowH + (rr() - 0.5) * rowH * 0.15, l * 0.62, rowH * 0.42, LEAN * 0.2 + (rr() - 0.5) * 0.3, col, rr, 1, { impasto: 0.7 });
      }
      x += l + rowH * 0.08;
    }
  }
  weave(g, S, 0.2);
}

const STONE = ['#d9b98a', '#cfa877', '#e2c79c', '#c99f6e', '#dcc095', '#bf9466', '#e6cfa6'];
const BRICK = ['#b8664a', '#a85a40', '#c4704f', '#9c5139', '#b5604a', '#c97a58'];

export const PAINTERS = {
  stone: { size: 512, tile: 2.4, draw: (g, S) => masonry(g, S, { tones: STONE, mortar: '#c9b08c', rows: 16, len: 76, seed: 3 }) },
  brick: { size: 512, tile: 2.4, draw: (g, S) => masonry(g, S, { tones: BRICK, mortar: '#d8c2a4', rows: 24, len: 62, seed: 9 }) },
  paving: { size: 512, tile: 4.2, draw: (g, S) => slabs(g, S, { tones: ['#b8aca0', '#c4b6a8', '#ab9e92', '#cbbdb0', '#b2a294', '#bfae9c'], joint: '#6d6259', rows: 7, seed: 11 }) },
  piazza: { size: 512, tile: 4.2, draw: (g, S) => slabs(g, S, { tones: ['#cdb4a0', '#d8c0aa', '#c2a892', '#dcc6b2', '#c9ae96'], joint: '#7a6556', rows: 7, seed: 12 }) },
  floor: { size: 512, tile: 2.4, draw: (g, S) => masonry(g, S, { tones: ['#b5643e', '#c2724a', '#a85a38', '#c97b52', '#b86a44', '#ad5f3b'], mortar: '#8a5a3c', rows: 8, len: 58, seed: 21, impasto: 0.6 }) },
  leather: { size: 512, tile: 2.6, draw: (g, S) => coated(g, S, ['#c98c57', '#bd7d49', '#d49a66', '#b3713f', '#d9a470', '#c48450', '#c9895a'], { seed: 7 }) },
  lining: { size: 512, tile: 3, draw: (g, S) => coated(g, S, ['#f1e3bf', '#ecdbb2', '#f5eacc', '#e8d5a8', '#f7eed6'], { seed: 11, impasto: 0.9 }) },
  deck: { size: 512, tile: 3, draw: (g, S) => coated(g, S, ['#e2d5b4', '#ddcfac', '#e7dbbd', '#d8c9a4', '#e4d8b9'], { seed: 23, impasto: 0.85 }) },
  cloth: {
    size: 256, tile: 1,
    draw: (g, S) => coated(g, S, ['#d6c08a', '#cbb379', '#e0cd9c', '#c4aa6e'], {
      len: 172, wid: 60, seed: 5, impasto: 0.9,
      extra: (c, s) => {
        c.lineWidth = 1.4;
        for (let i = -s; i < s * 2; i += 8) {
          c.strokeStyle = 'rgba(110,80,36,.24)';
          c.beginPath(); c.moveTo(i, 0); c.lineTo(i + s, s); c.stroke();
          c.strokeStyle = 'rgba(255,248,214,.26)';
          c.beginPath(); c.moveTo(i, s); c.lineTo(i + s, 0); c.stroke();
        }
      },
    }),
  },
  strokes: { size: 512, tile: 1.6, draw: strokes },
  sky: { size: 512, tile: 1, draw: skyStrokes },
  vinyl: { size: 1024, draw: (g, S) => vinyl(g, S) },
  label: { size: 256, draw: label },
};

export function paintNamed(name, g) {
  const p = PAINTERS[name];
  p.draw(g, p.size);
}
