// Time of day for the shop, as the app works it out (app/src/timeofday.js): the sun's height from the
// local hour and the date (a mid latitude), and moods keyed on that height. Pure maths, Node-safe.
import { Color } from 'three';

export const MOODS = [
  { e: -14, top: '#141a33', horizon: '#2c3358', cloud: '#3a4270', clouds: 0.35, stars: 1, sun: '#9fb0e0', sunI: 0.35, hemiSky: '#6a7ab0', hemiGround: '#2a2638', hemiI: 0.75, fog: '#28304f' },
  { e: -6, top: '#2f3f72', horizon: '#c98a8a', cloud: '#8a6f90', clouds: 0.6, stars: 0.4, sun: '#c0a0d0', sunI: 0.5, hemiSky: '#8a90c0', hemiGround: '#5a4050', hemiI: 0.95, fog: '#6a5a78' },
  { e: 0, top: '#5f78b0', horizon: '#f2a070', cloud: '#f6b890', clouds: 0.85, stars: 0, sun: '#ff9a50', sunI: 1.4, hemiSky: '#c0c4e8', hemiGround: '#9a6a60', hemiI: 1.25, fog: '#e8a888' },
  { e: 8, top: '#9cc0d4', horizon: '#f6d29a', cloud: '#fbe3c4', clouds: 0.8, stars: 0, sun: '#ffc27a', sunI: 2.3, hemiSky: '#d6dcf2', hemiGround: '#b08a70', hemiI: 1.55, fog: '#f1cf9b' },
  { e: 30, top: '#8fb8e0', horizon: '#e6ecee', cloud: '#ffffff', clouds: 0.7, stars: 0, sun: '#fff2dc', sunI: 2.6, hemiSky: '#e2ebff', hemiGround: '#b8a088', hemiI: 1.6, fog: '#e4e6e2' },
];

const ca = new Color(), cb = new Color();
export function moodAt(e) {
  if (e <= MOODS[0].e) return { ...MOODS[0] };
  for (let i = 0; i < MOODS.length - 1; i++) {
    const a = MOODS[i], b = MOODS[i + 1];
    if (e <= b.e) {
      const t = (e - a.e) / (b.e - a.e), out = {};
      for (const k of Object.keys(a)) out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * t : `#${ca.set(a[k]).lerp(cb.set(b[k]), t).getHexString()}`;
      return out;
    }
  }
  return { ...MOODS[MOODS.length - 1] };
}

// Day length from the date, elevation as a sine through the day; below the horizon it keeps sinking
// about 12 degrees an hour so twilight takes a while.
export function sunAt(hour, date = new Date()) {
  const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  const dayLen = 12 + 3.6 * Math.cos((2 * Math.PI * (doy - 172)) / 365);
  const noon = 12.9, rise = noon - dayLen / 2, set = noon + dayLen / 2;
  const maxE = 42 + 22 * Math.cos((2 * Math.PI * (doy - 172)) / 365);
  if (hour >= rise && hour <= set) { const s = (hour - rise) / dayLen; return { e: Math.sin(Math.PI * s) * maxE, s }; }
  const after = hour > set ? hour - set : hour + 24 - set, before = hour < rise ? rise - hour : rise + 24 - hour;
  return { e: -Math.min(after, before) * 12, s: after < before ? 1 : 0 };
}
