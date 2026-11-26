// The record carousel: covers as real 3D sleeves (front and back, cut edges, a spine) with their vinyl
// poking out, swinging round a cylinder about the centred one. Scroll, drag, arrows or a click turn it.
//   fullSize   fills its container, floating straight on the dimmed shop with its caption and keys
//              under it (Up next, the mini player's Listen again). Otherwise a compact strip (search).
// The sleeves come out of the suitcase drawer: enter({ origin }) deals them from the drawer into their
// places, the centred one last, and its vinyl slides out as it lands; leave({ origin }) sends them back.
// origin() gives the open drawer on screen as { x, y, size } in CSS px. Any input skips the flight.
import { paintedCoverURL } from '../coverpaint.js';
import { icon } from './icons.js';
import { followScroll, wheelPixels } from './smooth-scroll.js';
import { injectTokens } from './tokens.js';
import { injectCrateCss, renderHints } from './crate.js';

const CSS = `
.la-carousel { text-align: center; }
.la-carousel[hidden] { display: none; }
.la-wheel { position: relative; flex: 1 1 304px; min-height: 0; overflow: clip; touch-action: none;
  container-type: size; cursor: grab; }
.la-wheel.is-dragging, .la-wheel.is-dragging .la-cover { cursor: grabbing; }
.la-wheel:focus { outline: none; }
.la-stage { position: absolute; inset: 0; pointer-events: none;
  perspective: calc(var(--cover-size) * 3.75); transform-style: preserve-3d; }
.la-tilt { transform: perspective(1400px) rotateY(var(--cover-yaw, 0deg)) rotateX(var(--cover-pitch, 0deg)); }
.la-cover { --sleeve-depth: 10px; position: absolute; top: 50%; left: 50%; width: var(--cover-size); aspect-ratio: 1;
  transform-style: preserve-3d; color: var(--sienna-ink-3); cursor: pointer; }
.la-cover.is-outside :is(.la-sleeve-face, .la-sleeve-edge, .la-disc),
.la-cover.is-outside::after, .la-cover.is-gone { visibility: hidden; }
.la-cover.is-waiting { opacity: 0; }       /* still in the drawer, but still a record on the wheel */
.la-sleeve-face, .la-sleeve-edge, .la-disc { position: absolute; pointer-events: none; }
.la-sleeve-face { inset: 0; display: grid; place-items: center; background: var(--sienna-paper-lo); backface-visibility: hidden; }
.la-sleeve-face img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.la-sleeve-front { transform: translateZ(calc(var(--sleeve-depth) / 2)); box-shadow: var(--sienna-shadow-rest); pointer-events: auto; }
.la-sleeve-back { transform: rotateY(180deg) translateZ(calc(var(--sleeve-depth) / 2)); }
.la-sleeve-edge { background: var(--sienna-edge); }
.la-sleeve-edge.top, .la-sleeve-edge.bottom { inset-inline: 0; height: var(--sleeve-depth); }
.la-sleeve-edge.top { top: 0; transform: translateY(-50%) rotateX(90deg); }
.la-sleeve-edge.bottom { bottom: 0; transform: translateY(50%) rotateX(-90deg); }
.la-sleeve-edge.spine { inset-block: 0; left: 0; width: var(--sleeve-depth); transform: translateX(-50%) rotateY(-90deg); }
.la-cover[aria-current="true"]::after { content: '♪'; position: absolute; top: var(--sienna-space-2); left: var(--sienna-space-2);
  width: var(--sienna-space-6); height: var(--sienna-space-6); border-radius: 50%; display: grid; place-items: center;
  color: var(--sienna-paper); background: var(--sienna-indigo); box-shadow: 0 0 0 2px var(--sienna-paper);
  font: var(--sienna-text-sm)/1 var(--sienna-serif); transform: translateZ(calc(var(--sleeve-depth) / 2 + 1px)); }
/* the record, resting in its sleeve with its edge poking out; tucked right in while it flies */
.la-disc { width: 91%; aspect-ratio: 1; top: 4.5%; left: 14%; transform-style: preserve-3d;
  transition: translate 460ms cubic-bezier(0.3, 1.35, 0.45, 1) 40ms; }
.la-cover.is-flying .la-disc { translate: -13.5% 0; transition: none; }
.la-disc-face { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 50%; pointer-events: auto;
  box-shadow: inset 0 0 0 1px rgba(255, 238, 218, 0.22);
  background: conic-gradient(from 20deg, transparent 0 9%, rgba(255, 236, 214, 0.24) 16%, transparent 24% 59%,
      rgba(255, 236, 214, 0.18) 66%, transparent 74%),
    repeating-radial-gradient(circle, #221e25 0 2px, #38323d 2px 3px); }
.la-disc-face:first-child { transform: translateZ(1px); backface-visibility: hidden; }
.la-disc-face:last-child { transform: rotateY(180deg) translateZ(1px); backface-visibility: hidden; }
.la-disc-face::after { content: ''; position: absolute; width: 5%; aspect-ratio: 1;
  border-radius: 50%; background: var(--sienna-ink); }
.la-disc-face img { width: 38%; height: auto; aspect-ratio: 1; border-radius: 50%; }
.la-cover.is-flying :is(.la-sleeve-front, .la-disc-face) { pointer-events: none; }
.la-details { flex: none; color: var(--sienna-ink); }
.la-title, .la-artist { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- the strip over the search results ---- */
.la-strip .la-wheel { flex-basis: 116px; --cover-size: min(104px, 24cqw, 86cqh); }
.la-strip .la-cover { --sleeve-depth: 5px; --cover-size: inherit; }
.la-strip .la-sleeve-front { box-shadow: 0 3px 8px rgba(36, 25, 18, 0.28); }
.la-strip .la-cover[aria-current="true"]::after { display: none; }
.la-strip .la-details { display: flex; justify-content: center; align-items: baseline; gap: var(--sienna-space-3);
  padding: 0 var(--sienna-space-3); font-family: var(--sienna-serif); }
.la-strip .la-title { font-size: var(--sienna-text-sm); font-weight: 600; min-width: 0; }
.la-strip .la-artist { font-size: var(--sienna-text-xs); font-style: italic; color: var(--sienna-ink-2); min-width: 0; }
.la-strip .la-place, .la-strip > .ui-list-foot { display: none; }

/* ---- the whole window: sleeves floating on the dimmed shop ---- */
.la-carousel.la-full { display: grid; grid-template: minmax(0, 1fr) auto auto / minmax(0, 1fr); }
.la-carousel.la-full[hidden] { display: none; }
.la-full .la-wheel { grid-area: 1 / 1; isolation: isolate; }
.la-full.la-horizontal .la-wheel { --cover-size: min(46cqw, 93cqh); }
/* the upright wheel runs on down behind its caption, where the sleeve below fades away; the sleeves
   centre on the part above it */
.la-full:not(.la-horizontal) .la-wheel { grid-area: 1 / 1 / 4 / 1; --la-under: 84px;
  --cover-size: min(58cqw, calc(74cqh - 62px)); }
.la-full:not(.la-horizontal) .la-stage { bottom: var(--la-under); }
.la-full:not(.la-horizontal) :is(.la-details, .ui-list-foot) { position: relative; z-index: 1; }
.la-full .la-cover { --cover-size: inherit; }
.la-full .la-sleeve-front { box-shadow: 0 22px 40px rgba(8, 3, 6, 0.5), 0 4px 10px rgba(8, 3, 6, 0.32); }
.la-full .la-wheel:focus-visible .la-cover[aria-selected="true"] .la-sleeve-front {
  box-shadow: 0 0 0 2px var(--sienna-paper), 0 0 0 5px var(--sienna-terracotta), 0 22px 40px rgba(8, 3, 6, 0.5); }
.la-full .la-details { grid-area: 2 / 1; justify-self: center; box-sizing: border-box; width: max-content; max-width: 90%;
  min-width: 0; padding: var(--sienna-space-1) var(--sienna-space-3) var(--sienna-space-2); color: var(--sienna-on-night);
  text-shadow: 0 2px 8px rgba(10, 4, 8, 0.7); }
.la-full .la-title { font: 700 var(--sienna-text-xl)/1.15 var(--sienna-font); }
.la-full .la-sub { display: flex; justify-content: center; align-items: baseline; gap: var(--sienna-space-4);
  font: var(--sienna-text-sm)/1.35 var(--sienna-serif); color: var(--sienna-on-night-2); }
.la-full .la-artist { min-height: 1.35em; min-width: 0; font-style: italic; }
.la-full .la-place { flex: none; font-size: var(--sienna-text-xs); font-variant-numeric: lining-nums tabular-nums; }
.la-full > .ui-list-foot { grid-area: 3 / 1; justify-content: center; padding: 0; }
.la-full .la-details, .la-full > .ui-list-foot { transition: opacity var(--sienna-dur-mid) var(--sienna-ease-out); }
/* soft ends where the wheel runs on past the window */
.la-full:not(.la-horizontal) .la-wheel { mask-image: linear-gradient(to bottom, transparent, #000 6%, #000 68%, transparent 91%); }
.la-full.la-horizontal .la-wheel { mask-image: linear-gradient(to right, transparent, #000 3%, #000 97%, transparent); }
/* across the shop the drawer is below the wheel's box, so it opens up while sleeves cross it */
.la-full.la-horizontal.is-moving .la-wheel, .la-full.is-picking .la-wheel { mask-image: none; overflow: visible; }
.la-full.is-entering .la-details { transition: none; }
/* the caption inks in once the centred sleeve has landed, and goes before they fly home */
.la-full.is-entering .la-details, .la-full.is-leaving .la-details, .la-full.is-leaving > .ui-list-foot,
.la-full.is-picking .la-details, .la-full.is-picking > .ui-list-foot { opacity: 0; }
.la-full.is-leaving :is(.la-wheel, .la-sleeve-front, .la-disc-face) { pointer-events: none; }
.la-full.is-picking .la-cover { transition: opacity var(--sienna-dur-fast) var(--sienna-ease-out); }
.la-full.is-picking .la-cover:not(.is-picked) { opacity: 0; }
.la-full.is-picking .la-wheel { overflow: visible; pointer-events: none; }
.la-full.is-picking :is(.la-cover, .la-sleeve-front, .la-disc-face) { pointer-events: none; }
@media (max-height: 660px), (max-width: 620px) {
  .la-full .la-title { font-size: var(--sienna-text-lg); }
}
`;

const WHEEL_STEP = 100;
const ANGLE_STEP = Math.PI / 5.6;
const REACH = 2.65;        // how far (in places) a sleeve can be from the middle and still show
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;
let nextId = 0;

// The flight between the drawer and a sleeve's place, u from 0 (in the drawer) to 1 (home).
const IN_MS = 500, LAST_IN_MS = 580, STAGGER_MS = 64;
const OUT_MS = 330, OUT_STAGGER_MS = 34;
const ART_WAIT_MS = 360;   // how long the first sleeve waits for its painted cover
const smooth = t => t * t * (3 - 2 * t);
const arrive = t => 1 - (1 - t) ** 1.9;                 // quick out of the drawer, soft into place
const bezier = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

export function createCoverTilt(el) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let yaw = 0, pitch = 0;
  el.classList.add('la-tilt');
  return {
    update(tx, ty) {
      const nextYaw = calm.matches ? 0 : tx * 10;
      const nextPitch = calm.matches ? 0 : -ty * 8;
      if (yaw === nextYaw && pitch === nextPitch) return;
      yaw = nextYaw;
      pitch = nextPitch;
      el.style.setProperty('--cover-yaw', `${yaw}deg`);
      el.style.setProperty('--cover-pitch', `${pitch}deg`);
    },
    pose: () => ({ yaw, pitch }),
  };
}

export function createCoverCarousel({ onPick, onActiveChange, onBackground = null, orientation = 'vertical', fullSize = false }) {
  injectTokens();
  injectCrateCss();
  if (!document.getElementById('sienna-cover-carousel')) {
    const style = document.createElement('style');
    style.id = 'sienna-cover-carousel'; style.textContent = CSS; document.head.appendChild(style);
  }
  const horizontal = orientation === 'horizontal';
  const spatialRadius = horizontal ? 1.82 : 1.72;
  const root = document.createElement('div');
  root.className = `la-carousel ui-list ${fullSize ? 'la-full' : 'la-strip'}`;
  root.hidden = true;
  if (horizontal) root.classList.add('la-horizontal');
  const wheel = document.createElement('div'); wheel.className = 'la-wheel';
  wheel.id = `la-wheel-${++nextId}`; wheel.setAttribute('role', 'listbox');
  wheel.setAttribute('aria-orientation', orientation);
  if (horizontal) wheel.tabIndex = 0;
  const stage = document.createElement('div');
  stage.className = 'la-stage'; stage.setAttribute('role', 'presentation');
  wheel.appendChild(stage);
  const details = document.createElement('div'); details.className = 'la-details'; details.setAttribute('aria-hidden', 'true');
  const title = document.createElement('div'); title.className = 'la-title';
  const sub = document.createElement('div'); sub.className = 'la-sub';
  const artist = document.createElement('div'); artist.className = 'la-artist';
  const place = document.createElement('div'); place.className = 'la-place';
  const titleText = title.appendChild(document.createTextNode(''));
  const artistText = artist.appendChild(document.createTextNode(''));
  if (fullSize) { sub.append(artist, place); details.append(title, sub); }
  else details.append(title, artist);
  const foot = document.createElement('div'); foot.className = 'ui-list-foot';
  foot.id = `${wheel.id}-hint`;
  const hintLine = foot.appendChild(Object.assign(document.createElement('div'), { className: 'crate-hints' }));
  const setHint = hints => renderHints(hintLine, hints);
  setHint([[horizontal ? '← →' : '↑ ↓', 'choose'], ['Enter', 'play'], ['Esc', 'close']]);
  wheel.setAttribute('aria-describedby', foot.id);
  root.append(wheel, details, foot);

  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let items = [], cards = [], art = [], position = 0, active = -1, wheelTimer = 0, drag = null, dragged = false;
  let motionSource;
  let now = -1;
  const flights = new Map();     // sleeve index -> its flight
  let flightFrame = 0, flightRun = 0, entering = false, left = null;
  const itemArtist = item => item.subtitle || item.artist || '';
  const itemTitle = item => item.title || 'Untitled';
  const bound = n => clamp(n, 0, Math.max(0, items.length - 1));
  const activeId = () => cards[active]?.id;
  const pointerAxis = e => horizontal ? e.clientX : e.clientY;
  const motion = followScroll({ read: () => position, write: next => draw(next, motionSource), epsilon: 0.005 });

  function loadArt(i) {
    const { art: url } = items[i];
    if (art[i] || !url) return art[i] ?? Promise.resolve();
    const card = cards[i];
    art[i] = paintedCoverURL(url, fullSize ? 256 : 160).then(src => {
      if (!src || !card.isConnected) return;
      const img = new Image(); img.alt = ''; img.decoding = 'async'; img.draggable = false;
      img.onerror = () => img.remove();
      img.src = src;
      card.querySelector('.la-sleeve-front').appendChild(img);
      for (const face of card.querySelectorAll('.la-disc-face')) face.appendChild(img.cloneNode());
    });
    return art[i];
  }

  // Where sleeve i sits when the wheel is at `shown`: along it (percent of a cover), back (covers), turned.
  function slotOf(i, shown) {
    const offset = i - shown;
    const angle = clamp(offset * ANGLE_STEP, -Math.PI / 2, Math.PI / 2);
    const travel = calm.matches ? offset * 104 : 100 * spatialRadius * Math.sin(angle);
    const depth = calm.matches ? 0 : spatialRadius * (Math.cos(angle) - 1);
    return { travel, depth, angle, distance: Math.abs(offset) };
  }

  function restTransform({ travel, depth, angle }) {
    return `translate(-50%, -50%) translate${horizontal ? 'X' : 'Y'}(${travel}%)`
      + (calm.matches ? '' : ` translateZ(calc(var(--cover-size) * ${depth})) ${horizontal ? `rotateY(${angle}rad)` : `rotateX(${-angle}rad)`}`);
  }

  const shownPosition = () => (calm.matches ? Math.round(position) : position);

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
      place.textContent = items.length > 1 ? `${index + 1} of ${items.length}` : '';
      onActiveChange?.(source);
    }
    const shown = shownPosition();
    cards.forEach((card, i) => {
      const slot = slotOf(i, shown);
      const outside = slot.distance > (calm.matches ? 2 : REACH);
      card.classList.toggle('is-outside', outside);
      card.style.pointerEvents = outside ? 'none' : '';
      if (slot.distance < 3) loadArt(i);
      if (!flights.has(i)) card.style.transform = restTransform(slot);
    });
  }

  // ---- the flights between the drawer and the wheel ----
  function pose(i, u, f) {
    const slot = slotOf(i, shownPosition());
    const { x0, y0, size, coverPx } = f.from;
    const x1 = horizontal ? slot.travel / 100 * coverPx : 0;
    const y1 = horizontal ? 0 : slot.travel / 100 * coverPx;
    const z1 = slot.depth * coverPx;
    const t = arrive(u);
    const lift = coverPx * 0.5;                  // straight up out of the drawer, then down into its place
    const x = bezier(x0, lerp(x0, x1, 0.05), lerp(x0, x1, 0.9), x1, t);
    const y = bezier(y0, y0 - lift * 1.1, y1 - lift * 0.55, y1, t);
    const z = z1 * t + coverPx * 0.1 * Math.sin(Math.PI * u);
    // record-sized while it clears the drawer, growing as it nears its place, with a small swell on landing
    const swell = f.homing ? 0 : 0.045 * Math.sin(Math.PI * clamp((u - 0.72) / 0.28, 0, 1));
    const scale = lerp(size / coverPx, 1, smooth(clamp(u / 0.94, 0, 1))) + swell;
    const lie = 68 * (1 - smooth(Math.min(1, u / 0.82)));     // lying in the drawer -> facing you
    const spin = f.spin * (1 - arrive(u));
    const twist = f.twist * Math.sin(Math.PI * u);
    const turn = slot.angle * t;
    return `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) `
      + (horizontal ? `rotateY(${turn.toFixed(4)}rad) ` : `rotateX(${(-turn).toFixed(4)}rad) `)
      + `rotateY(${twist.toFixed(2)}deg) rotateX(${lie.toFixed(2)}deg) rotateZ(${spin.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
  }

  // Measured as a sleeve sets off, so it leaves from wherever the drawer is by then.
  function measure(i, origin) {
    const box = stage.getBoundingClientRect();
    const coverPx = cards[i].offsetWidth;
    const from = origin?.() ?? { x: box.left + box.width / 2, y: box.bottom, size: coverPx * 0.25 };
    return { x0: from.x - (box.left + box.width / 2), y0: from.y - (box.top + box.height / 2),
      size: Math.max(24, from.size || coverPx * 0.25), coverPx };
  }

  const syncMoving = () => root.classList.toggle('is-moving', flights.size > 0);

  // instant: skipped rather than landed, so the record is home at once instead of sliding out
  function settleSleeve(i, gone, instant = false) {
    const card = cards[i];
    flights.delete(i);
    const disc = instant ? card.querySelector('.la-disc') : null;
    if (disc) disc.style.transition = 'none';
    card.classList.remove('is-flying', 'is-waiting');
    if (disc) {
      void disc.offsetWidth;
      disc.style.transition = '';
    }
    card.classList.toggle('is-gone', gone);
    card.style.opacity = '';
    card.style.transform = restTransform(slotOf(i, shownPosition()));
    if (!gone && i === Math.round(position)) root.classList.remove('is-entering');
  }

  function tick() {
    flightFrame = 0;
    const time = performance.now();
    for (const [i, f] of flights) {
      if (f.start == null || time < f.start) continue;
      f.from ??= measure(i, f.origin);
      const p = clamp((time - f.start) / f.duration, 0, 1);
      const u = f.homing ? f.u * (1 - p * p) : p;
      f.at = u;
      const card = cards[i];
      card.classList.remove('is-waiting');
      card.style.transform = pose(i, u, f);
      card.style.opacity = String(clamp(u / (f.homing ? 0.2 : 0.1), 0, 1));
      if (p >= 1) settleSleeve(i, f.homing);
    }
    syncMoving();
    if (flights.size) flightFrame = requestAnimationFrame(tick);
    else finishFlights();
  }

  function finishFlights() {
    entering = false;
    root.classList.remove('is-entering');
    syncMoving();
    const done = left;
    left = null;
    done?.();
  }

  function dropFlights() {
    flightRun++;
    cancelAnimationFrame(flightFrame);
    flightFrame = 0;
  }

  // Jump every flight to its end. True if there was one to skip.
  function settle() {
    if (!flights.size) return false;
    dropFlights();
    for (const [i, f] of [...flights]) settleSleeve(i, f.homing, true);
    finishFlights();
    return true;
  }

  const visibleFrom = centre => cards.map((_, i) => i).filter(i => Math.abs(i - centre) <= REACH);

  function enter({ origin, notBefore = 0 } = {}) {
    settle();
    for (const card of cards) card.classList.remove('is-gone');
    root.classList.remove('is-leaving');
    if (calm.matches || !origin || !items.length || root.hidden) return;
    const centre = Math.round(position);
    // the farthest first; the centred sleeve, the one that matters, last
    const order = visibleFrom(centre).sort((a, b) => Math.abs(b - centre) - Math.abs(a - centre) || a - b);
    order.forEach((i, rank) => {
      const last = i === centre;
      flights.set(i, { homing: false, origin, start: null, delay: rank * STAGGER_MS + (last ? 40 : 0),
        duration: last ? LAST_IN_MS : IN_MS, spin: (i % 2 ? 1 : -1) * (14 + (rank % 3) * 8), twist: i < centre ? 20 : -20 });
      cards[i].classList.add('is-waiting', 'is-flying');
    });
    entering = true;
    root.classList.add('is-entering');
    syncMoving();
    const run = ++flightRun;
    const ready = Promise.race([Promise.all(order.map(loadArt)), new Promise(r => setTimeout(r, ART_WAIT_MS))]);
    const drawer = new Promise(r => setTimeout(r, Math.max(0, notBefore - performance.now())));
    Promise.all([ready, drawer]).then(() => {
      if (run !== flightRun) return;
      const start = performance.now();
      for (const f of flights.values()) f.start = start + f.delay;
      tick();
    });
  }

  // Back into the drawer, the centred sleeve first. Sleeves still on their way turn round where they are.
  function leave({ origin } = {}) {
    if (calm.matches || !origin || !items.length || root.hidden) {
      settle();
      return Promise.resolve();
    }
    dropFlights();
    const before = new Map(flights);
    flights.clear();
    const centre = Math.round(position);
    const going = visibleFrom(centre)
      .filter(i => !cards[i].classList.contains('is-gone') && !cards[i].classList.contains('is-waiting'))
      .sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b);
    for (const [i] of before) if (!going.includes(i)) settleSleeve(i, true, true);
    for (let i = 0; i < cards.length; i++) if (!going.includes(i)) cards[i].classList.add('is-gone');
    entering = false;
    root.classList.remove('is-entering');
    root.classList.add('is-leaving');
    const time = performance.now();
    going.forEach((i, rank) => {
      const was = before.get(i);
      const u = was?.at ?? 1;
      flights.set(i, { homing: true, origin, u, at: u, start: time + rank * OUT_STAGGER_MS, duration: OUT_MS * Math.max(0.4, u),
        spin: was?.spin ?? (i % 2 ? 1 : -1) * 18, twist: was?.twist ?? (i < centre ? 14 : -14), from: was?.from });
      cards[i].classList.add('is-flying');
    });
    syncMoving();
    left?.();
    return new Promise(resolve => {
      left = resolve;
      flightFrame = requestAnimationFrame(tick);
    });
  }

  function stopMotion() {
    clearTimeout(wheelTimer);
    wheelTimer = 0;
    motion.stop();
    motionSource = undefined;
  }

  calm.addEventListener('change', () => {
    if (!items.length) return;
    settle();
    if (calm.matches) snap(motion.target ?? position, motionSource);
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
    if (drag?.moved) return;
    if (entering) settle();
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
    // a press while the sleeves are still flying only brings them home
    if (entering && settle()) { dragged = true; return; }
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
    const card = e.target.closest('.la-cover');
    if (!card) { onBackground?.(e); return; }
    const i = Number(card.dataset.index);
    if (!items[i]) return;
    if (i === active) pick(i);
    else snap(i);
  });

  function stop() {
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

  function pick(index) {
    if (fullSize) {
      stop();
      settle();
      draw(index);
    }
    onPick(index);
  }

  function extractDisc(index) {
    settle();
    const card = cards[index];
    const disc = card.querySelector('.la-disc');
    const start = disc.getBoundingClientRect();
    root.classList.add('is-picking');
    card.classList.add('is-picked');
    for (const other of cards) if (other !== card) other.setAttribute('aria-hidden', 'true');
    const timing = { duration: 240, easing: 'cubic-bezier(.32,.02,.56,1)', fill: 'forwards' };
    const shift = Math.max(0, start.right + start.width * 0.82 - innerWidth);
    const shifted = shift ? card.animate([{ translate: '0' }, { translate: `${-shift}px` }], timing) : null;
    const slide = disc.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(102%)' }],
      timing);
    let fade;
    const done = slide.finished.then(() => {
      const rect = disc.getBoundingClientRect();
      disc.style.visibility = 'hidden';
      slide.cancel();
      fade = card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: 'forwards' });
      return rect;
    }, () => null);
    return { done, hide() {
      card.style.visibility = 'hidden';
      shifted?.cancel();
      slide.cancel();
      fade?.cancel();
    } };
  }

  function setItems(next, label, { index = 0 } = {}) {
    stop();
    dropFlights();
    flights.clear();
    finishFlights();
    root.classList.remove('is-picking', 'is-leaving');
    items = next;
    art = [];
    active = now = -1;
    wheel.setAttribute('aria-label', label);
    cards = items.map((item, i) => {
      const card = document.createElement('div'); card.className = 'la-cover';
      card.id = `${wheel.id}-${i}`; card.dataset.index = i;
      card.setAttribute('role', 'option'); card.setAttribute('aria-selected', 'false');
      card.setAttribute('aria-label', [itemTitle(item), itemArtist(item)].filter(Boolean).join(' · '));
      card.innerHTML = `<div class="la-sleeve-face la-sleeve-back"></div>
        <div class="la-sleeve-edge top"></div><div class="la-sleeve-edge bottom"></div><div class="la-sleeve-edge spine"></div>
        <div class="la-disc"><div class="la-disc-face"></div><div class="la-disc-face"></div><div class="la-disc-face"></div></div>
        <div class="la-sleeve-face la-sleeve-front"></div>`;
      card.querySelector('.la-sleeve-front').appendChild(icon('album', { size: fullSize ? 32 : 22 }));
      return card;
    });
    stage.replaceChildren(...cards);
    draw(index);
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
    if (entering) settle();
    if (next === undefined) {
      stopMotion();
      if (position !== index) draw(index);
      pick(index);
    } else snap(next);
  }

  const center = index => snap(index);
  return { el: root, stageEl: stage, listboxEl: wheel, setItems, setHint, activeId, getActive: () => active, setNowPlaying,
    center, stop, handleKeyDown, extractDisc, enter, leave, settle, isFlying: () => flights.size > 0 };
}
