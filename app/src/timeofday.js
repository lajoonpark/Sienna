// Time of day follows the viewer's own clock. The sun's height is estimated from the local hour and
// the date (day length for a mid latitude), and everything blends through a handful of moods keyed on
// that height: night, blue hour, sunset, golden hour, day. Lamps are permanent fixtures that switch on
// one by one as the sun goes down; windows fill in through the evening and thin out late at night.
//   ?hour=20.5      freeze the clock at a given local hour
//   ?speed=600      run the clock faster (600 = ten minutes per second), from ?hour or now
import * as THREE from 'three';
import { updateLamps, updateWindows } from './env.js';

// Moods keyed by sun elevation in degrees.
const MOODS = [
  { e: -14, top: '#141a33', horizon: '#2c3358', cloud: '#3a4270', clouds: 0.35, stars: 1, sun: '#9fb0e0', sunI: 0.35, hemiSky: '#6a7ab0', hemiGround: '#2a2638', hemiI: 0.75, fog: '#28304f' },
  { e: -6, top: '#2f3f72', horizon: '#c98a8a', cloud: '#8a6f90', clouds: 0.6, stars: 0.4, sun: '#c0a0d0', sunI: 0.5, hemiSky: '#8a90c0', hemiGround: '#5a4050', hemiI: 0.95, fog: '#6a5a78' },
  { e: 0, top: '#5f78b0', horizon: '#f2a070', cloud: '#f6b890', clouds: 0.85, stars: 0, sun: '#ff9a50', sunI: 1.4, hemiSky: '#c0c4e8', hemiGround: '#9a6a60', hemiI: 1.25, fog: '#e8a888' },
  { e: 8, top: '#9cc0d4', horizon: '#f6d29a', cloud: '#fbe3c4', clouds: 0.8, stars: 0, sun: '#ffc27a', sunI: 2.3, hemiSky: '#d6dcf2', hemiGround: '#b08a70', hemiI: 1.55, fog: '#f1cf9b' },
  { e: 30, top: '#8fb8e0', horizon: '#e6ecee', cloud: '#ffffff', clouds: 0.7, stars: 0, sun: '#fff2dc', sunI: 2.6, hemiSky: '#e2ebff', hemiGround: '#b8a088', hemiI: 1.6, fog: '#e4e6e2' },
];

const ca = new THREE.Color(), cb = new THREE.Color();
function mixHex(a, b, t) { return ca.set(a).lerp(cb.set(b), t).getStyle(); }

function moodAt(e) {
  if (e <= MOODS[0].e) return { ...MOODS[0] };
  for (let i = 0; i < MOODS.length - 1; i++) {
    const a = MOODS[i], b = MOODS[i + 1];
    if (e <= b.e) {
      const t = (e - a.e) / (b.e - a.e);
      const out = {};
      for (const k of Object.keys(a)) out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * t : mixHex(a[k], b[k], t);
      return out;
    }
  }
  return { ...MOODS[MOODS.length - 1] };
}

// Rough sun for a mid latitude: day length from the date, elevation as a sine through the day,
// and below the horizon it keeps sinking ~12 degrees an hour so twilight takes a while.
export function sunAt(hour, date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const doy = Math.floor((date - start) / 86400000);
  const dayLen = 12 + 3.6 * Math.cos((2 * Math.PI * (doy - 172)) / 365);
  const noon = 12.9; // most clocks run ahead of solar time
  const rise = noon - dayLen / 2, set = noon + dayLen / 2;
  const maxE = 42 + 22 * Math.cos((2 * Math.PI * (doy - 172)) / 365);
  let e, s;
  if (hour >= rise && hour <= set) {
    s = (hour - rise) / dayLen;
    e = Math.sin(Math.PI * s) * maxE;
  } else {
    const after = hour > set ? hour - set : hour + 24 - set;
    const before = hour < rise ? rise - hour : rise + 24 - hour;
    e = -Math.min(after, before) * 12;
    s = after < before ? 1 : 0;
  }
  return { e, s, rise, set };
}

export function createTimeOfDay({ scene, sun, hemi, sky }) {
  const params = new URLSearchParams(location.search);
  const fixed = params.has('hour') ? Number(params.get('hour')) : null;
  const speed = Number(params.get('speed')) || 0;
  const t0 = performance.now();
  const startHour = fixed ?? (() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; })();
  const dir = new THREE.Vector3();
  // The sun creeps: a quarter of a degree a minute at its fastest. The light is worked out again every
  // STEP seconds of the clock (the sun has moved 0.02 degrees at most: well under one step of a colour
  // channel), not every frame: the same picture, without blending a dozen colours through strings 60
  // times a second, and between those moments a shop where nothing moves is exactly the same frame
  // (which the painter then does not paint again, see still.js). ?speed runs the clock fast: every frame.
  const STEP = 5 / 3600; // hours
  let lastHour = null, lampsOn = 0, shown = { hour: 0, e: 0 };

  function hourNow() {
    if (speed) return (startHour + ((performance.now() - t0) / 3600000) * speed) % 24;
    if (fixed !== null) return fixed;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  return {
    update(t) {
      const hour = hourNow();
      if (lastHour === null || speed || Math.abs(hour - lastHour) >= STEP) {
        lastHour = hour;
        const { e, s } = sunAt(hour);
        shown = { hour, e };
        const m = moodAt(e);
        sky.paint({ top: m.top, horizon: m.horizon, cloud: m.cloud, cloudAlpha: m.clouds, stars: m.stars });
        scene.fog.color.set(m.fog);
        scene.background.set(m.horizon);
        hemi.color.set(m.hemiSky);
        hemi.groundColor.set(m.hemiGround);
        hemi.intensity = m.hemiI;
        sun.color.set(m.sun);
        sun.intensity = m.sunI;
        sun.castShadow = e > -2; // moonlight stays soft; crisp moon shadows read as holes
        // No sun shadows, no shadow map: at 4096 px it is 128 MB of video memory (three keeps a colour and a
        // depth layer). It is made again when the sun is back (main.js redraws shadows when castShadow flips).
        if (!sun.castShadow && sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        // sun swings from the right (morning) to the left (evening), always a bit from behind the
        // viewer so the alley is lit; at night the same light is a soft high moon
        const el = THREE.MathUtils.degToRad(e > 2 ? Math.max(e, 9) : 50);
        const az = e > 2 ? (s - 0.5) * Math.PI * 0.9 : 0.4;
        dir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * 0.9 + 0.35).normalize();
        sun.position.copy(sun.target.position).addScaledVector(dir, 45);
        // lamps: the switch-on wave runs while the sun drops from +4 to -5 degrees
        lampsOn = THREE.MathUtils.clamp((4 - e) / 9, 0, 1);
        const lit = THREE.MathUtils.clamp((7 - e) / 16, 0, 1);
        let late = 0;
        if (hour >= 23) late = (hour - 23) / 3;
        else if (hour < 5) late = Math.min(1, (hour + 1) / 3);
        else if (hour < 6.5) late = 1 - (hour - 5) / 1.5;
        updateWindows(lit, THREE.MathUtils.clamp(late, 0, 1));
      }
      // every frame: a lamp warming up flickers, and the intro wakes them as the camera comes near
      updateLamps(lampsOn, t);
      return shown;
    },
  };
}
