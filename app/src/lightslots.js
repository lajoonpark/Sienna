// Lamp light, cheaper. Every lit material loops over every point light in the scene for every pixel, and
// the shop has 8 of them (pendants, skylights, lanterns), always on and wherever the camera is: about a
// ninth of a frame on the RX 550. A point light's reach ends at its `distance`, so most of them light
// nothing you can see from where you stand. Only SLOTS of them are switched on at a time: the ones that
// light the view most (their falloff at a few points straight ahead of the camera, with their reach in
// view). The ones left off are far, faint or behind you; at home and the hall's first stations all 8
// reach into the view, so a little faint light at the far end goes (checked with scripts/lights-check.mjs).
//
// The count of lights on never changes (it is part of every shader, so a change would compile them all
// again); a light that is off just does not take a slot. warmUp (warmup.js) leaves lights as they are.
//
// A lamp is never switched off or on at once (Lajoon, 2026-11-13: the light vanished in an instant as the
// camera moved): one that drops out of the best SLOTS dims over FADE_S seconds and only then hands its slot
// to the one waiting, which brightens over FADE_S. A lamp holding a slot counts a little more (KEEP), so two
// lamps scoring alike do not keep trading places. Whatever else sets a lamp's intensity (env.js
// updateLamps: the evening switch-on, the intro wake) is kept: the fade multiplies it.
//
//   const slots = createLightSlots(scene);   // after the scene is built
//   slots.update(camera, dt)                 // once a frame, before drawing (dt seconds; big = settle at once)
import * as THREE from 'three';

export const SLOTS = 5;
export const FADE_S = 0.9;
const KEEP = 1.25;

export function createLightSlots(scene, { slots = SLOTS } = {}) {
  const lights = [];
  scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
  const frustum = new THREE.Frustum(), m = new THREE.Matrix4();
  const sphere = new THREE.Sphere(), cam = new THREE.Vector3(), fwd = new THREE.Vector3(), at = new THREE.Vector3();
  const score = new Map();
  const order = lights.slice();
  // start with the first SLOTS on, so the shaders compiled before the first frame have the right count
  lights.forEach((l, i) => { l.visible = i < slots; });
  // per lamp: its fade (0..1), the intensity it should have unfaded, and the intensity last written here
  const fade = new Map(lights.map((l, i) => [l, i < slots ? 1 : 0]));
  const base = new Map(lights.map((l) => [l, l.intensity]));
  const wrote = new Map();
  // how much light l puts on a point d metres away (three's punctual falloff with its range window)
  const falloff = (l, d) => {
    const range = l.distance > 0 ? l.distance : 1e6;
    const w = Math.max(0, 1 - (d / range) ** 4);
    return base.get(l) * w * w / Math.max(d, 0.5) ** (l.decay ?? 2);
  };
  const AHEAD = [0, 2, 4, 7, 11]; // metres along the view: where what you see mostly is
  const ease = (f) => f * f * (3 - 2 * f);

  return {
    lights,
    inView: 0,
    // (for checks) a lamp's fade, 0..1
    fadeOf: (l) => fade.get(l),
    update(camera, dt = 1) {
      if (lights.length <= slots) return;
      // someone else set the intensity since (the switch-on wave, the wake): that is the new unfaded value
      for (const l of lights) if (l.intensity !== wrote.get(l)) base.set(l, l.intensity);
      camera.getWorldPosition(cam);
      camera.getWorldDirection(fwd);
      frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const l of lights) {
        l.getWorldPosition(sphere.center);
        sphere.radius = l.distance > 0 ? l.distance : 1e6;
        // the most it lights any of the points ahead; a reach outside the view counts for little
        let best = 0;
        for (const a of AHEAD) best = Math.max(best, falloff(l, sphere.center.distanceTo(at.copy(cam).addScaledVector(fwd, a))));
        score.set(l, (frustum.intersectsSphere(sphere) ? best : best * 0.01) * (l.visible ? KEEP : 1));
      }
      order.sort((a, b) => score.get(b) - score.get(a));
      this.inView = order.filter((l) => score.get(l) > 0.01).length; // (for checks: lamps that light the view noticeably)
      const want = new Set(order.slice(0, slots));
      const step = Math.min(1, dt / FADE_S);
      // lamps waiting for a slot, best first
      const waiting = order.filter((l) => want.has(l) && !l.visible);
      for (const l of lights) {
        if (!l.visible) continue;
        let f = fade.get(l);
        f = want.has(l) ? Math.min(1, f + step) : Math.max(0, f - step);
        // dimmed right out and someone is waiting: the slot changes hands
        if (f <= 0 && waiting.length) {
          const next = waiting.shift();
          l.visible = false;
          next.visible = true;
          fade.set(next, dt >= FADE_S ? 1 : 0); // starts dark and brightens (a big step, as in screenshots: at once)
        }
        fade.set(l, f);
      }
      for (const l of lights) {
        const f = l.visible ? fade.get(l) : 0;
        if (!l.visible) fade.set(l, 0);
        const v = base.get(l) * ease(f);
        l.intensity = v;
        wrote.set(l, v);
      }
    },
  };
}
