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
//   const slots = createLightSlots(scene);   // after the scene is built
//   slots.update(camera)                     // once a frame, before drawing
import * as THREE from 'three';

export const SLOTS = 5;

export function createLightSlots(scene, { slots = SLOTS } = {}) {
  const lights = [];
  scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
  const frustum = new THREE.Frustum(), m = new THREE.Matrix4();
  const sphere = new THREE.Sphere(), cam = new THREE.Vector3(), fwd = new THREE.Vector3(), at = new THREE.Vector3();
  const score = new Map();
  const order = lights.slice();
  // start with the first SLOTS on, so the shaders compiled before the first frame have the right count
  lights.forEach((l, i) => { l.visible = i < slots; });
  // how much light l puts on a point d metres away (three's punctual falloff with its range window)
  const falloff = (l, d) => {
    const range = l.distance > 0 ? l.distance : 1e6;
    const w = Math.max(0, 1 - (d / range) ** 4);
    return l.intensity * w * w / Math.max(d, 0.5) ** (l.decay ?? 2);
  };
  const AHEAD = [0, 2, 4, 7, 11]; // metres along the view: where what you see mostly is

  return {
    lights,
    inView: 0,
    update(camera) {
      if (lights.length <= slots) return;
      camera.getWorldPosition(cam);
      camera.getWorldDirection(fwd);
      frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const l of lights) {
        l.getWorldPosition(sphere.center);
        sphere.radius = l.distance > 0 ? l.distance : 1e6;
        // the most it lights any of the points ahead; a reach outside the view counts for little
        let best = 0;
        for (const a of AHEAD) best = Math.max(best, falloff(l, sphere.center.distanceTo(at.copy(cam).addScaledVector(fwd, a))));
        score.set(l, frustum.intersectsSphere(sphere) ? best : best * 0.01);
      }
      order.sort((a, b) => score.get(b) - score.get(a));
      this.inView = order.filter((l) => score.get(l) > 0.01).length; // (for checks: lamps that light the view noticeably)
      order.forEach((l, i) => { const on = i < slots; if (l.visible !== on) l.visible = on; });
    },
  };
}
