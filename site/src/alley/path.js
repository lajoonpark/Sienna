// Scroll scrubs the app's intro, then lingers just inside the hall.
import { Vector3 } from 'three';
import { BASE_FOV, introDoorOpen, introPose, T } from '../../../app/src/nav.js';
import { HOME } from '../../../app/src/stations.js';
import { clamp, smoothstep } from '../layout.js';

export { HOME, T };
const ARRIVE = 0.9;
export const clockAt = (p) => clamp(p / ARRIVE, 0, 1) * T.enter;
export const DOOR_OPEN = (p) => introDoorOpen(clockAt(p));

export function cameraAt(p, out = { pos: new Vector3(), target: new Vector3(), fov: BASE_FOV }) {
  introPose(clockAt(p), HOME, out);
  const linger = smoothstep(ARRIVE, 1, p);
  out.target.y += linger * 2.6;
  out.pos.z -= linger * 0.6;
  return out;
}
