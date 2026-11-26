// Card stock for Sienna's 2D UI layer. Every menu, note and tag is a rigid board cut from the same
// sleeve card: a flat warm face with a fine rag-fibre grain, lightly rounded corners, the cut edge of
// the board showing along the bottom, and a soft shadow. One recipe, shared through paperSurface().
// (It replaced the torn, oil-dabbed paper: the crate-card menus, ui/crate.js.)
import { rng } from '../rand.js';
import { injectTokens } from './tokens.js';

const stats = { paints: 0, hits: 0 };
let grain = null;

export function paperStats() {
  return { paints: stats.paints, hits: stats.hits, size: grain ? 1 : 0 };
}

const TILE = 192;

// A tileable rag-fibre grain, painted once a page: short darker and paler fibres on a clear ground,
// each drawn again across the edges so the tiles never show a seam.
function paintGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  const r = rng(1907);
  g.lineCap = 'round';
  for (let i = 0; i < 1100; i++) {
    const x = r() * TILE, y = r() * TILE, angle = r() * Math.PI, length = 1.5 + r() * 5;
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    g.strokeStyle = r() < 0.55 ? `rgba(122, 90, 58, ${0.05 + r() * 0.08})` : `rgba(255, 253, 244, ${0.3 + r() * 0.4})`;
    g.lineWidth = 0.35 + r() * 0.65;
    for (const ox of x < 8 ? [0, TILE] : x > TILE - 8 ? [0, -TILE] : [0]) {
      for (const oy of y < 8 ? [0, TILE] : y > TILE - 8 ? [0, -TILE] : [0]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + dx, y + oy + dy);
        g.stroke();
      }
    }
  }
  for (let i = 0; i < 520; i++) {
    g.fillStyle = `rgba(96, 66, 40, ${0.04 + r() * 0.09})`;
    g.fillRect(r() * (TILE - 1), r() * (TILE - 1), 1, 1);
  }
  return c.toDataURL('image/png');
}

// The grain as a CSS image, published once as --sienna-grain for every card face and tab.
export function cardGrain() {
  if (grain) { stats.hits++; return grain; }
  grain = `url(${paintGrain()})`;
  stats.paints++;
  document.documentElement.style.setProperty('--sienna-grain', grain);
  return grain;
}

const PAPER_CSS = `
:where(.ui-paper) { position: relative; color: var(--sienna-ink); }
.ui-paper-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.ui-paper-bg { position: absolute; inset: 0; border-radius: var(--ui-card-radius, 6px);
  background-color: var(--sienna-paper);
  box-shadow: 0 var(--ui-card-edge, 2px) 0 var(--sienna-edge), var(--ui-paper-shadow, var(--sienna-shadow-rest));
  transition: box-shadow var(--sienna-dur-fast) var(--sienna-ease-out); }
.ui-paper--lift > .ui-paper-layer { --ui-card-edge: 4px;
  --ui-paper-shadow: 0 22px 38px rgba(22, 12, 10, 0.34), 0 6px 10px rgba(22, 12, 10, 0.2); }
.ui-paper--rest > .ui-paper-layer { --ui-card-edge: 2px; --ui-paper-shadow: 0 5px 10px rgba(36, 25, 18, 0.24); }
:where(.ui-paper > :not(.ui-paper-layer)) { position: relative; z-index: 1; }
`;

function injectPaperCss() {
  injectTokens();
  if (typeof document === 'undefined' || !document.head || document.getElementById('sienna-ui-paper')) return;
  const st = document.createElement('style');
  st.id = 'sienna-ui-paper';
  st.textContent = PAPER_CSS;
  document.head.appendChild(st);
}

// Lay `el` on a card: the board sits in its own layer behind the content, so its shadow and edge
// never flatten 3D children of `el`.
export function paperSurface(el, { elevation = 'rest' } = {}) {
  injectPaperCss();
  el.classList.add('ui-paper', elevation === 'lift' ? 'ui-paper--lift' : 'ui-paper--rest');

  const layer = document.createElement('div');
  layer.className = 'ui-paper-layer';
  layer.setAttribute('aria-hidden', 'true');
  const bg = document.createElement('div');
  bg.className = 'ui-paper-bg';
  cardGrain();
  bg.style.backgroundImage = 'var(--sienna-grain)';
  layer.appendChild(bg);
  el.prepend(layer);

  let destroyed = false;
  return {
    el,
    layer,
    bg,
    setElevation(next) {
      el.classList.toggle('ui-paper--lift', next === 'lift');
      el.classList.toggle('ui-paper--rest', next !== 'lift');
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      layer.remove();
      el.classList.remove('ui-paper', 'ui-paper--rest', 'ui-paper--lift');
    },
  };
}
