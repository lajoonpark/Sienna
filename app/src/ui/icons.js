// Hand-drawn SVG icon set in one brush-pen stroke style (currentColor, round caps/joins,
// gently uneven organic paths) so icons sit naturally alongside Sienna's brush lettering.
// Pure data + DOM helper; safe to import in Node (never touches document at module top-level).

const PATHS = Object.freeze({
  search: [
    'M10.6 4.2 C14.5 3.9 17.5 6.8 17.3 10.7 C17.1 14.4 14.1 17.4 10.3 17.2 C6.4 17.0 3.9 14.0 4.1 10.3 C4.3 6.7 7.1 4.4 10.6 4.2',
    'M15.6 15.8 Q18.1 18.1 20.4 20.5',
  ],
  volume: [
    'M4.2 9.5 Q6.0 9.3 7.8 9.3 L12.3 5.4 Q12.8 12.0 12.2 18.6 L7.8 14.7 Q6.0 14.7 4.2 14.5 Q3.9 12.0 4.2 9.5 Z',
    'M15.7 8.9 Q17.6 12.0 15.6 15.1',
    'M18.6 6.4 Q21.3 12.0 18.4 17.6',
  ],
  mute: [
    'M4.2 9.5 Q6.0 9.3 7.8 9.3 L12.3 5.4 Q12.8 12.0 12.2 18.6 L7.8 14.7 Q6.0 14.7 4.2 14.5 Q3.9 12.0 4.2 9.5 Z',
    'M15.6 9.3 Q18.0 11.9 20.4 14.5',
    'M20.3 9.2 Q17.9 11.9 15.5 14.6',
  ],
  shuffle: [
    'M3.8 16.6 C7.5 16.7 9.4 13.7 11.7 11.2 C13.9 8.8 16.0 7.4 19.9 7.4',
    'M17.1 4.8 Q18.6 6.1 20.2 7.4 Q18.6 8.7 17.0 10.0',
    'M3.8 7.5 C7.5 7.4 9.5 10.1 11.8 12.5 C14.0 14.9 16.1 16.5 19.9 16.5',
    'M17.1 13.9 Q18.6 15.2 20.2 16.5 Q18.6 17.8 17.0 19.1',
  ],
  repeat: [
    'M17.1 4.6 Q18.7 6.0 20.1 7.3 Q18.6 8.7 17.0 10.1',
    'M4.3 11.4 C4.2 8.6 6.1 7.3 9.2 7.3 Q14.5 7.1 19.8 7.3',
    'M6.9 19.4 Q5.3 18.0 3.9 16.7 Q5.4 15.3 7.0 13.9',
    'M19.7 12.6 C19.8 15.4 17.9 16.7 14.8 16.7 Q9.5 16.9 4.2 16.7',
  ],
  'repeat-one': [
    'M17.1 4.6 Q18.7 6.0 20.1 7.3 Q18.6 8.7 17.0 10.1',
    'M4.3 11.4 C4.2 8.6 6.1 7.3 9.2 7.3 Q14.5 7.1 19.8 7.3',
    'M6.9 19.4 Q5.3 18.0 3.9 16.7 Q5.4 15.3 7.0 13.9',
    'M19.7 12.6 C19.8 15.4 17.9 16.7 14.8 16.7 Q9.5 16.9 4.2 16.7',
    'M11.1 10.4 L12.3 9.4 Q12.4 12.0 12.2 14.6',
    'M10.9 14.6 Q12.3 14.5 13.6 14.6',
  ],
  queue: [
    'M4.1 6.6 Q11.8 6.3 19.6 6.7',
    'M4.1 11.7 Q9.8 11.4 14.6 11.8',
    'M4.1 16.8 Q8.0 16.6 11.8 16.9',
    'M17.1 17.2 C15.7 17.3 15.0 18.4 15.6 19.2 C16.2 20.0 17.9 19.6 18.1 18.4 L18.2 11.5 Q19.9 12.2 20.8 13.1',
  ],
  lyrics: [
    'M5.3 4.3 C9.6 4.0 14.4 4.3 18.7 4.2 C19.0 9.4 18.8 14.6 18.6 19.7 C14.1 19.9 9.5 19.6 5.4 19.8 C5.0 14.7 5.3 9.4 5.3 4.3 Z',
    'M8.3 8.8 Q12.0 8.5 15.6 8.9',
    'M8.3 12.3 Q12.1 12.0 15.4 12.4',
    'M8.3 15.8 Q10.8 15.6 13.4 15.9',
  ],
  close: [
    'M6.1 6.3 Q12.0 11.9 17.9 17.7',
    'M17.9 6.1 Q11.9 12.1 6.1 17.8',
  ],
  back: [
    'M10.4 6.2 Q7.5 9.1 4.6 12.0 Q7.5 14.9 10.4 17.8',
    'M5.1 12.0 Q12.3 11.7 19.5 12.1',
  ],
  restock: [
    'M19.3 12.6 C19.0 16.7 15.6 19.7 11.5 19.5 C7.3 19.3 4.3 15.8 4.5 11.6 C4.7 7.4 8.2 4.4 12.4 4.6 C15.2 4.7 17.5 6.3 18.8 8.6',
    'M19.3 4.8 Q19.2 6.8 19.1 8.8 Q17.1 8.8 15.2 8.7',
  ],
  settings: [
    'M4.2 7.2 Q6.6 7.0 8.5 7.2',
    'M13.3 7.2 Q16.6 7.1 19.8 7.3',
    'M10.9 5.0 C12.3 4.9 13.3 5.9 13.3 7.2 C13.3 8.5 12.2 9.5 10.8 9.4 C9.5 9.3 8.5 8.4 8.5 7.1 C8.5 5.8 9.6 5.0 10.9 5.0',
    'M4.2 12.1 Q9.2 11.9 13.3 12.1',
    'M18.1 12.1 Q19.0 12.0 19.8 12.1',
    'M15.7 9.9 C17.1 9.8 18.1 10.8 18.1 12.1 C18.1 13.4 17.0 14.4 15.6 14.3 C14.3 14.2 13.3 13.3 13.3 12.0 C13.3 10.7 14.4 9.9 15.7 9.9',
    'M4.2 17.0 Q5.8 16.9 7.2 17.0',
    'M12.0 17.0 Q16.0 16.8 19.8 17.1',
    'M9.6 14.8 C11.0 14.7 12.0 15.7 12.0 17.0 C12.0 18.3 10.9 19.3 9.5 19.2 C8.2 19.1 7.2 18.2 7.2 16.9 C7.2 15.6 8.3 14.8 9.6 14.8',
  ],
  play: [
    'M7.1 5.3 C7.0 9.8 7.2 14.3 7.0 18.7 C11.4 16.4 15.5 14.2 19.3 12.0 C15.4 9.7 11.3 7.5 7.1 5.3 Z',
  ],
  pause: [
    'M7.1 5.4 Q8.3 5.3 9.5 5.4 Q9.7 12.0 9.4 18.6 Q8.2 18.7 7.1 18.6 Q6.9 12.0 7.1 5.4 Z',
    'M14.5 5.4 Q15.7 5.3 16.9 5.4 Q17.1 12.0 16.8 18.6 Q15.6 18.7 14.5 18.6 Q14.3 12.0 14.5 5.4 Z',
  ],
  song: [
    'M8.6 14.6 C10.3 14.5 11.4 15.5 11.3 16.9 C11.2 18.3 9.9 19.3 8.3 19.3 C6.7 19.3 5.6 18.3 5.7 16.9 C5.8 15.5 7.0 14.7 8.6 14.6 Z',
    'M11.2 16.8 Q11.0 10.9 11.3 4.7',
    'M11.4 4.8 C14.2 5.6 17.3 7.4 17.0 11.6',
  ],
  album: [
    'M12.3 3.9 C16.8 4.0 20.2 7.6 20.0 12.2 C19.8 16.7 16.3 20.2 11.8 20.0 C7.3 19.8 3.9 16.3 4.0 11.8 C4.2 7.3 7.8 3.8 12.3 3.9',
    'M12.1 10.1 C13.3 10.1 14.0 11.0 13.9 12.1 C13.8 13.2 12.9 13.9 11.9 13.8 C10.9 13.7 10.1 12.9 10.2 11.9 C10.3 10.9 11.0 10.1 12.1 10.1',
    'M7.0 10.2 C7.6 8.3 9.1 7.1 10.8 6.8',
  ],
  playlist: [
    'M4.1 6.4 Q11.0 6.1 17.8 6.5',
    'M4.1 11.5 Q11.0 11.2 17.8 11.6',
    'M4.1 16.6 Q7.4 16.4 10.6 16.7',
    'M14.0 14.2 C13.9 16.2 14.1 18.2 14.0 20.1 Q16.8 18.7 19.6 17.1 Q16.8 15.6 14.0 14.2 Z',
  ],
  artist: [
    'M12.1 4.5 C14.1 4.4 15.6 5.9 15.5 7.9 C15.4 9.9 13.9 11.4 11.9 11.3 C9.9 11.2 8.5 9.7 8.6 7.8 C8.7 5.9 10.2 4.6 12.1 4.5',
    'M5.0 19.6 C5.3 16.0 8.1 13.7 12.0 13.7 C15.9 13.6 18.6 16.0 19.0 19.5',
  ],
  podcast: [
    'M12.1 3.9 C13.7 3.9 14.7 5.0 14.7 6.5 Q14.8 9.0 14.7 11.4 C14.7 12.9 13.6 14.0 12.0 14.0 C10.4 14.0 9.3 12.9 9.4 11.4 Q9.3 9.0 9.4 6.5 C9.4 5.0 10.5 3.9 12.1 3.9 Z',
    'M6.4 10.9 C6.6 14.4 8.9 16.7 12.0 16.7 C15.1 16.7 17.4 14.4 17.6 10.9',
    'M12.0 16.8 Q12.1 18.6 12.0 20.2',
    'M9.0 20.2 Q12.0 20.0 15.1 20.3',
  ],
});

export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

const SVG_NS = 'http://www.w3.org/2000/svg';

// Which icon marks a list row's item kind; kinds not listed keep a word chip.
const KIND_ICONS = Object.freeze({
  song: 'song', video: 'song', album: 'album', single: 'album', ep: 'album',
  playlist: 'playlist', artist: 'artist', podcast: 'podcast', episode: 'podcast',
});

export function kindIcon(kind) {
  const key = String(kind || '').toLowerCase();
  return Object.hasOwn(KIND_ICONS, key) ? KIND_ICONS[key] : null;
}

export function icon(name, { size = 20, label = null } = {}) {
  const list = PATHS[name];
  if (!list) throw new Error(`Unknown icon "${name}". Valid: ${ICON_NAMES.join(', ')}`);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.1');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('ui-icon', `ui-icon--${name}`);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  }
  for (const d of list) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}
