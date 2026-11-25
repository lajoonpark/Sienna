import { paintedCoverURL } from '../coverpaint.js';
import { flyIntoCovers } from './cover-flight.js';
import { icon } from './icons.js';
import { followScroll, wheelPixels } from './smooth-scroll.js';
import { injectTokens } from './tokens.js';

const CSS = `
.la-carousel { text-align: center; }
.la-wheel { position: relative; flex: 1 1 304px; min-height: 0; overflow: clip; touch-action: none;
  container-type: size; cursor: grab; }
.la-wheel.is-dragging, .la-wheel.is-dragging .la-cover { cursor: grabbing; }
.la-cover { --cover-size: min(112px, 36cqh); position: absolute; top: 50%; left: 50%;
  width: var(--cover-size); aspect-ratio: 1; display: grid; place-items: center; overflow: hidden;
  background: var(--sienna-paper-lo); color: var(--sienna-ink-3); box-shadow: var(--sienna-shadow-rest);
  backface-visibility: hidden; }
.la-cover[aria-selected="true"] { cursor: pointer; box-shadow: var(--sienna-shadow-lift); }
.la-cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.la-cover[aria-current="true"]::after { content: '♪'; position: absolute; top: var(--sienna-space-2); left: var(--sienna-space-2);
  width: var(--sienna-space-6); height: var(--sienna-space-6); border-radius: 50%; display: grid; place-items: center;
  color: var(--sienna-paper); background: var(--sienna-indigo); font: var(--sienna-text-sm)/1 var(--sienna-serif); }
.la-horizontal .la-wheel { flex-basis: 200px; }
.la-horizontal .la-cover { --cover-size: min(154px, 32cqw, 78cqh); }
.la-horizontal .la-wheel:focus-visible { outline: 2px solid var(--sienna-indigo); outline-offset: -2px; }
.la-details { flex: none; padding: var(--sienna-space-2) var(--sienna-space-4) 0; color: var(--sienna-ink); }
.la-title, .la-artist { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.la-title { font: bold var(--sienna-text-lg)/1.05 var(--sienna-font); }
.la-artist { min-height: 1em; font: var(--sienna-text-sm)/1.15 var(--sienna-serif); color: var(--sienna-ink-2); }
.la-carousel .ui-list-foot { justify-content: center; padding-top: var(--sienna-space-1); padding-bottom: 0; }
.la-vinyl-flight { position: fixed; top: 0; left: 0; z-index: calc(var(--sienna-z-list) + 1);
  display: grid; place-items: center; aspect-ratio: 1; border-radius: 50%; pointer-events: none;
  background: repeating-radial-gradient(circle, #1c1920 0 2px, #28242b 2px 3px);
  box-shadow: var(--sienna-shadow-rest); }
.la-vinyl-flight img { width: 38%; aspect-ratio: 1; object-fit: cover; border-radius: 50%; }
.la-vinyl-flight::after { content: ''; position: absolute; width: 5%; aspect-ratio: 1;
  border-radius: 50%; background: var(--sienna-ink); }
`;

const WHEEL_STEP = 100;
const angleStep = Math.PI / 5.6;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
let nextId = 0;

export function createCoverCarousel({ onPick, onActiveChange, drawer, orientation = 'vertical' }) {
  injectTokens();
  if (!document.getElementById('sienna-cover-carousel')) {
    const style = document.createElement('style');
    style.id = 'sienna-cover-carousel'; style.textContent = CSS; document.head.appendChild(style);
  }
  const horizontal = orientation === 'horizontal';
  const root = document.createElement('div'); root.className = 'la-carousel ui-list'; root.hidden = true;
  if (horizontal) root.classList.add('la-horizontal');
  const wheel = document.createElement('div'); wheel.className = 'la-wheel';
  wheel.id = `la-wheel-${++nextId}`; wheel.setAttribute('role', 'listbox');
  wheel.setAttribute('aria-orientation', orientation);
  if (horizontal) wheel.tabIndex = 0;
  const details = document.createElement('div'); details.className = 'la-details'; details.setAttribute('aria-hidden', 'true');
  const title = document.createElement('div'); title.className = 'la-title';
  const artist = document.createElement('div'); artist.className = 'la-artist';
  const titleText = title.appendChild(document.createTextNode(''));
  const artistText = artist.appendChild(document.createTextNode(''));
  details.append(title, artist);
  const hint = document.createElement('div'); hint.className = 'ui-list-foot';
  hint.id = `${wheel.id}-hint`;
  const setHint = text => { hint.textContent = text; };
  setHint(`Scroll or drag · ${horizontal ? '←→' : '↑↓'} choose · Enter play · Esc close`);
  wheel.setAttribute('aria-describedby', hint.id);
  root.append(wheel, details, hint);

  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let items = [], cards = [], position = 0, active = -1, wheelTimer = 0, drag = null, dragged = false;
  let motionSource;
  let cancelEntrance = null, now = -1;
  const loaded = new Set();
  const itemArtist = item => item.subtitle || item.artist || '';
  const itemTitle = item => item.title || 'Untitled';
  const bound = n => clamp(n, 0, Math.max(0, items.length - 1));
  const activeId = () => cards[active]?.id;
  const pointerAxis = e => horizontal ? e.clientX : e.clientY;
  const motion = followScroll({ read: () => position, write: next => draw(next, motionSource), epsilon: 0.005 });

  function loadArt(i) {
    const { art } = items[i];
    if (!art || loaded.has(i)) return;
    loaded.add(i);
    const card = cards[i];
    paintedCoverURL(art, horizontal ? 160 : undefined).then(src => {
      if (!src || !card.isConnected) return;
      const img = new Image(); img.alt = ''; img.decoding = 'async'; img.draggable = false;
      img.onerror = () => img.remove();
      img.src = src;
      card.appendChild(img);
    });
  }

  function draw(next, source) {
    position = bound(next);
    const index = Math.round(position);
    if (index !== active && items[index]) {
      cards[active]?.setAttribute('aria-selected', 'false');
      active = index;
      cards[index].setAttribute('aria-selected', 'true');
      if (horizontal) wheel.setAttribute('aria-activedescendant', activeId());
      titleText.data = itemTitle(items[index]);
      artistText.data = itemArtist(items[index]);
      onActiveChange?.(source);
    }
    const shownPosition = calm.matches ? index : position;
    cards.forEach((card, i) => {
      const offset = i - shownPosition;
      const distance = Math.abs(offset);
      const angle = clamp(offset * angleStep, -Math.PI / 2, Math.PI / 2);
      const axisOffset = calm.matches ? offset * 83 : 167 * Math.sin(angle);
      const z = (Math.cos(angle) - 1) * 178;
      const scale = 1 - Math.min(distance, 2) * 0.10;
      card.style.transform = `perspective(420px) translate(-50%, -50%) translate${horizontal ? 'X' : 'Y'}(${axisOffset}%) `
        + (calm.matches ? '' : `translateZ(${z}px) ${horizontal ? `rotateY(${angle}rad)` : `rotateX(${-angle}rad)`} `)
        + `scale(${scale})`;
      card.style.opacity = String(clamp(1 - distance * 0.38, 0, 1));
      card.style.zIndex = String(Math.round(100 - distance * 10));
      card.style.pointerEvents = distance < 2.35 ? '' : 'none';
      if (horizontal && distance < 3) loadArt(i);
    });
  }

  function stopMotion() {
    clearTimeout(wheelTimer);
    wheelTimer = 0;
    motion.stop();
    motionSource = undefined;
  }

  function stopEntrance() {
    cancelEntrance?.();
    cancelEntrance = null;
  }
  calm.addEventListener('change', () => {
    if (!items.length) return;
    if (calm.matches) { stopEntrance(); snap(motion.target ?? position, motionSource); }
    else draw(position);
  });

  function snap(next, source) {
    clearTimeout(wheelTimer);
    wheelTimer = 0;
    const to = bound(Math.round(next));
    if (calm.matches || position === to) {
      stopMotion();
      draw(to, source);
      return;
    }
    motionSource = source;
    motion.to(to);
  }

  wheel.addEventListener('wheel', e => {
    const mode = e.deltaMode;
    const delta = horizontal && Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.ctrlKey || !delta) return;
    e.preventDefault();
    stopEntrance();
    if (drag?.moved) return;
    clearTimeout(wheelTimer);
    const pixels = wheelPixels(delta, mode, horizontal ? wheel.clientWidth : wheel.clientHeight);
    const from = motionSource === 'wheel' ? motion.target ?? position : position;
    const to = bound(from + pixels / WHEEL_STEP);
    if (calm.matches) draw(to, 'wheel');
    else {
      motionSource = 'wheel';
      motion.to(to);
    }
    wheelTimer = setTimeout(() => snap(to, 'wheel'), 95);
  }, { passive: false });

  wheel.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    stopEntrance();
    dragged = false;
    const point = pointerAxis(e);
    drag = { id: e.pointerId, start: point, from: position, point, at: e.timeStamp, velocity: 0, moved: false };
  });
  wheel.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const point = pointerAxis(e);
    if (!drag.moved) {
      if (Math.abs(point - drag.start) < 5) return;
      stopMotion();
      drag.from = position;
      drag.moved = dragged = true;
      wheel.setPointerCapture(e.pointerId);
      wheel.classList.add('is-dragging');
    }
    const velocity = (drag.point - point) / WHEEL_STEP / Math.max(8, e.timeStamp - drag.at);
    drag.velocity = 0.4 * drag.velocity + 0.6 * velocity;
    drag.point = point;
    drag.at = e.timeStamp;
    draw(drag.from + (drag.start - point) / WHEEL_STEP);
  });
  function release(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, velocity, at } = drag;
    drag = null;
    wheel.classList.remove('is-dragging');
    if (!moved) return;
    const fling = !calm.matches && e.type === 'pointerup' && e.timeStamp - at < 85 ? clamp(velocity * 140, -3, 3) : 0;
    snap(position + fling);
  }
  wheel.addEventListener('pointerup', release);
  wheel.addEventListener('pointercancel', release);
  wheel.addEventListener('lostpointercapture', e => { if (e.target === wheel) release(e); });
  wheel.addEventListener('pointerleave', () => { if (!drag?.moved) drag = null; });
  wheel.addEventListener('click', e => {
    if (dragged && e.detail) return;
    const i = Number(e.target.closest('.la-cover')?.dataset.index);
    if (!items[i]) return;
    if (i === active) onPick(i);
    else snap(i);
  });

  function stop() {
    stopEntrance();
    stopMotion();
    const id = drag?.id;
    drag = null;
    if (id != null && wheel.hasPointerCapture(id)) wheel.releasePointerCapture(id);
    wheel.classList.remove('is-dragging');
  }

  function setNowPlaying(index) {
    cards[now]?.removeAttribute('aria-current');
    cards[index]?.setAttribute('aria-current', 'true');
    now = index;
  }

  function setItems(next, label, { index = 0, entrance = true } = {}) {
    stop();
    items = next;
    active = now = -1;
    loaded.clear();
    wheel.setAttribute('aria-label', label);
    cards = items.map((item, i) => {
      const card = document.createElement('div'); card.className = 'la-cover';
      card.id = `${wheel.id}-${i}`; card.dataset.index = i;
      card.setAttribute('role', 'option'); card.setAttribute('aria-selected', 'false');
      card.setAttribute('aria-label', [itemTitle(item), itemArtist(item)].filter(Boolean).join(' · '));
      card.appendChild(icon('album', { size: 32 }));
      return card;
    });
    wheel.replaceChildren(...cards);
    if (!horizontal) items.forEach((_, i) => loadArt(i));
    draw(index);
    if (drawer && entrance && !calm.matches && cards.length) {
      const nearby = [active, active + 1, active - 1, active + 2].map(i => cards[i]).filter(Boolean).slice(0, 3);
      cancelEntrance = flyIntoCovers(drawer, nearby, { horizontal });
    }
  }

  function handleKeyDown(e, { passHorizontalEdges = false } = {}) {
    const index = Math.round(motion.target ?? active);
    let next;
    if (e.key === 'ArrowUp' || (horizontal && e.key === 'ArrowLeft')) next = index - 1;
    else if (e.key === 'ArrowDown' || (horizontal && e.key === 'ArrowRight')) next = index + 1;
    else if (horizontal && e.key === 'PageUp') next = index - 5;
    else if (horizontal && e.key === 'PageDown') next = index + 5;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key !== 'Enter' || e.repeat || !items[index]) return;
    if (passHorizontalEdges && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (next < 0 || next >= items.length)) return;
    e.preventDefault();
    stopEntrance();
    if (next === undefined) onPick(index);
    else snap(next);
  }

  const center = index => { stopEntrance(); snap(index); };
  return { el: root, listboxEl: wheel, setItems, setHint, activeId, getActive: () => active, setNowPlaying, center, stop, handleKeyDown };
}
