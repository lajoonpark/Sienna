import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Sticker-style lettering: chunky white fill, thick black outline, hard offset shadow.
// `font` (a CSS family list) swaps the default Arial Black; the texture is drawn again once that
// web font has loaded, so it never stays in the fallback face.
export function stickerTexture(text, { w = 1024, h = 256, size = 170, color = '#fff', font = null } = {}) {
  const [c, g] = canvas(w, h);
  const face = font ? `700 ${size}px ${font}` : `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  const draw = () => {
    g.clearRect(0, 0, w, h);
    g.font = face;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const x = w / 2, y = h / 2;
    g.fillStyle = '#000';
    g.fillText(text, x + 10, y + 12);
    g.lineWidth = 26; g.strokeStyle = '#000';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (font && typeof document !== 'undefined' && document.fonts) {
    document.fonts.load(face).then(() => { draw(); t.needsUpdate = true; }, () => {});
  }
  return t;
}

// Stepped gradient so lights read as flat bands (non-photoreal look).
export function toonGradient(steps = 4, floor = 70) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round(floor + ((255 - floor) * i) / (steps - 1));
  const t = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
