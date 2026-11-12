// Getting things onto the GPU before they are needed, so nothing compiles or uploads mid-animation.
//
//   warmUp(renderer, root, camera, scene, target)
//                                          compiles every material under root (hidden objects too,
//                                          e.g. racks and the suitcase before they are shown) and
//                                          uploads their textures. Resolves when the shaders are ready.
//                                          target = the render target root is really drawn into (the
//                                          painter's): a shader compiled for the screen is a different
//                                          program and would be compiled again on first use.
//   uploadSoon(renderer, texture)          queues one texture upload; at most UPLOAD_BUDGET ms of
//                                          uploads run per animation frame.
//   options.draw: also draw it once, off screen, so its geometry is on the GPU too (compile() does
//                 not upload vertex buffers; the suitcase's first draw uploaded ~240 of them)
export function warmUp(renderer, root, camera, scene = root, target = null, { draw = false } = {}) {
  // compile() only counts visible lights (and the draw only draws visible meshes), and both run
  // synchronously, so hidden things are shown just for the call and hidden again before any frame.
  // Not lights: how many are on is part of every shader, and lightslots.js keeps that count fixed.
  const hidden = [];
  root.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } });
  let ready;
  const prevTarget = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    ready = renderer.compileAsync(root, camera, scene);
    if (draw) {
      const tiny = scratchTarget(target);
      const shadows = renderer.shadowMap.needsUpdate;
      renderer.shadowMap.needsUpdate = false; // no shadow-map redraw for this
      renderer.setRenderTarget(tiny);
      renderer.render(root, camera);
      renderer.shadowMap.needsUpdate = shadows;
    }
  } finally {
    renderer.setRenderTarget(prevTarget);
    for (const o of hidden) o.visible = false;
  }
  const seen = new Set();
  const add = (v) => { if (v?.isTexture && !v.isRenderTargetTexture && !seen.has(v)) seen.add(v); };
  root.traverse((o) => {
    for (const m of [].concat(o.material ?? [])) {
      for (const v of Object.values(m)) add(v);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) add(u?.value);
    }
  });
  for (const tex of seen) uploadSoon(renderer, tex);
  return ready;
}

const UPLOAD_BUDGET = 3; // ms per frame
const queue = new Set();
let pumping = false;
export function uploadSoon(renderer, tex) {
  queue.add([renderer, tex]);
  if (!pumping) { pumping = true; requestAnimationFrame(pump); }
}
function pump() {
  const t0 = performance.now();
  for (const job of queue) {
    queue.delete(job);
    const [renderer, tex] = job;
    // a canvas texture whose picture has not arrived yet uploads when it does (needsUpdate)
    if (tex.image && !(tex.image instanceof HTMLImageElement && !tex.image.complete)) renderer.initTexture(tex);
    if (performance.now() - t0 > UPLOAD_BUDGET) break;
  }
  if (queue.size) requestAnimationFrame(pump); else pumping = false;
}

// a 4x4 stand-in for the real target (same kind, so the same shader variants are used)
let scratch = null;
function scratchTarget(like) {
  if (!scratch) scratch = like ? like.clone() : null;
  if (scratch) scratch.setSize(4, 4);
  return scratch;
}
