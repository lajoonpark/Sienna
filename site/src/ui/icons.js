// The app's hand-drawn icons (app/src/ui/icons.js): one brush-pen stroke style, currentColor.
const PATHS = {
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
  restock: [
    'M19.3 12.6 C19.0 16.7 15.6 19.7 11.5 19.5 C7.3 19.3 4.3 15.8 4.5 11.6 C4.7 7.4 8.2 4.4 12.4 4.6 C15.2 4.7 17.5 6.3 18.8 8.6',
    'M19.3 4.8 Q19.2 6.8 19.1 8.8 Q17.1 8.8 15.2 8.7',
  ],
};

export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.1');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of PATHS[name]) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
