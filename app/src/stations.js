// The sections of the shop. Each YouTube Music home shelf ("Quick picks", "Listen again"...) gets
// one station: a spot in the shop with its own kind of record rack and a place for the camera to
// stand while you browse it. Shelves YouTube always sends have a fixed home; the rest fill the
// free stations in order.
//
// pos / rotY place the rack (its front faces local +z). cam is in WORLD coordinates.
// Rack agents tune their own row; nav.js owns how the camera gets there.
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const H = Math.PI / 2;

export const HOME = { pos: v(0, 1.75, -2.2), target: v(0, 1.6, -12) };

export const STATIONS = [
  { id: 'table', style: 'trough', room: 'hall', pos: v(0, 0, -5.6), rotY: 0,
    cam: { pos: v(0, 1.82, -4.48), target: v(0, 0.98, -5.72) }, prefer: /quick picks/i },
  { id: 'cubby', style: 'cubby', room: 'hall', pos: v(5.2, 0, -6.4), rotY: -H,
    cam: { pos: v(3.4, 1.55, -6.4), target: v(5.2, 1.1, -6.4) }, prefer: /listen again/i },
  { id: 'gallery', style: 'floorlean', room: 'gallery', pos: v(-5.2, 3.03, -6.0), rotY: H,
    cam: { pos: v(-3.8, 4.35, -6.0), target: v(-5.2, 3.4, -6.0) }, prefer: /forgotten/i },
  { id: 'counter', style: 'easel', room: 'hall', pos: v(4.0, 1.08, -8.85), rotY: 0,
    cam: { pos: v(4.0, 1.75, -7.3), target: v(4.0, 1.35, -8.85) }, prefer: /album|release/i },
  // the sunken lounge (floor -0.6): the record wall on its left
  { id: 'lounge', style: 'wall', room: 'lounge', pos: v(-3.22, -0.6, -13.4), rotY: H,
    cam: { pos: v(-0.5, 1.05, -13.4), target: v(-3.2, 1.0, -13.4) }, prefer: /mix/i },
  // the stacks (floor -0.6, running sideways): the tall rack on the hall-side wall, facing -z
  { id: 'stacks', style: 'tall', room: 'stacks', pos: v(6.1, -0.6, -11.25), rotY: Math.PI,
    cam: { pos: v(6.1, 1.05, -14.25), target: v(6.1, 1.0, -11.3) }, prefer: /library|playlist/i },
  // the glasshouse (floor +1.2), seen from the top of its stair
  { id: 'plants', style: 'spinner', room: 'plants', pos: v(9.5, 1.2, -20.9), rotY: 0,
    cam: { pos: v(9.5, 2.95, -18.45), target: v(9.5, 2.28, -20.9) }, prefer: /similar|recommended|because/i },
  // the garden: the market stall faces the far wall, so you look back across the garden to the lounge window
  { id: 'courtyard', style: 'crates', room: 'courtyard', pos: v(3.6, 0, -26.4), rotY: Math.PI - 0.35,
    cam: { pos: v(4.12, 1.70, -28.13), target: v(3.57, 0.92, -26.31) }, prefer: null },
];

// shelves -> [{ station, shelf }] in station order (only stations that got a shelf).
export function assignShelves(shelves) {
  const taken = new Map(); // station index -> shelf
  const rest = [];
  for (const shelf of shelves) {
    const i = STATIONS.findIndex((s, k) => !taken.has(k) && s.prefer?.test(shelf.title));
    if (i >= 0) taken.set(i, shelf);
    else rest.push(shelf);
  }
  STATIONS.forEach((_, k) => { if (!taken.has(k) && rest.length) taken.set(k, rest.shift()); });
  return STATIONS.map((station, k) => ({ station, index: k, shelf: taken.get(k) })).filter((a) => a.shelf);
}
