export function flyIntoCovers(drawer, cards, { horizontal = false } = {}) {
  const opened = drawer.open();
  if (!opened) return null;
  const discs = new Map();
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    for (const [disc, animation] of discs) {
      animation.cancel();
      disc.remove();
    }
    discs.clear();
    drawer.close();
  }

  opened.then(() => {
    if (stopped) return;
    const start = drawer.position();
    cards.forEach((card, i) => {
      const slot = card.getBoundingClientRect();
      if (!slot.width || !slot.height) return;
      const size = (horizontal ? slot.height : slot.width) * 0.88;
      const x = slot.left + slot.width / 2, y = slot.top + slot.height / 2;
      const edge = slot.right;
      const sx = horizontal ? slot.width / slot.height : 1, sy = horizontal ? 1 : slot.height / slot.width;
      const disc = document.createElement('div'); disc.className = 'la-vinyl-flight';
      disc.setAttribute('aria-hidden', 'true');
      disc.style.width = `${size}px`;
      const cover = card.querySelector('img');
      const label = cover && disc.appendChild(cover.cloneNode());
      document.body.appendChild(disc);
      const pose = (cx, cy, sx, sy) =>
        `translate(${cx - size / 2}px, ${cy - size / 2}px) scale(${sx}, ${sy})`;
      const timing = { duration: 620, delay: i * 80, fill: 'both' };
      const animation = disc.animate([
        { transform: pose(start.x, start.y, 0.66, 0.26), opacity: 0, offset: 0 },
        { transform: pose(start.x + (edge - start.x) * 0.7 + size * 0.48, start.y + (y - start.y) * 0.38 - size * 0.44, 1.03, 0.82), opacity: 1, offset: 0.36 },
        { transform: pose(edge + size * sx / 2, y, sx, sy), clipPath: 'inset(0 0 0 0)', offset: 0.72, easing: 'ease-in' },
        { transform: pose(x, y, sx * 0.9, sy * 0.9), clipPath: 'inset(0 0 0 100%)', offset: 1 },
      ], timing);
      label?.animate([{ rotate: '0deg' }, { rotate: '195deg' }], timing);
      discs.set(disc, animation);
      animation.onfinish = () => {
        disc.remove();
        discs.delete(disc);
        if (!discs.size) stop();
      };
    });
    if (!discs.size) stop();
  });
  return stop;
}
