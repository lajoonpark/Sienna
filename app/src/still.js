// Has anything that is drawn changed since the last frame? The painter (watercolour.js) asks this of
// the world and of the suitcase overlay before it draws, and paints again only what did change: a shop
// nobody is moving in is the same picture frame after frame, and drawing its 3.8 million triangles and
// every paint pass again a dozen times a second was most of what the app cost while idle.
//
//   const w = createWatcher();
//   w.changed(scene, camera) -> bool   call once per drawn frame, after the matrices are up to date
//   w.bounds(scene, camera, out)       where the scene's meshes are on screen (NDC box), or null
//
// It writes down everything a frame is made from (where each visible thing is, its colours, opacity and
// textures, the lights, fog and camera) and compares that with what it wrote the frame before. Nothing
// is hashed, so two different frames can never look the same to it. Values are kept as 32-bit floats: a
// move too small for one (a millionth of a metre) is not a change, which is what lets easing motions
// come to rest instead of creeping forever.
//
// What it cannot see is paint that changes without any of those values changing: a canvas drawn on
// again without `texture.needsUpdate = true`, or a geometry rewritten in place. Nothing in the app does
// either (a redrawn canvas has to set needsUpdate to reach the GPU at all).

const AFFINE = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];
const MAPS = ['map', 'emissiveMap', 'alphaMap', 'gradientMap'];

export function createWatcher() {
  let buf = new Float32Array(8192);
  let n = 0, dirty = false, lastN = -1, why = null, shadowLights = 0;

  function put(v) {
    if (n === buf.length) { const b = new Float32Array(n * 2); b.set(buf); buf = b; }
    const f = Math.fround(v);
    // (NaN never equals itself: written once, then left alone)
    if (buf[n] !== f && (f === f || buf[n] === buf[n])) { buf[n] = f; dirty = true; }
    n++;
  }
  function putColor(c) { put(c.r); put(c.g); put(c.b); }
  function putTexture(t) {
    put(t.id); put(t.version);
    const o = t.offset, r = t.repeat;
    if (o) { put(o.x); put(o.y); put(r.x); put(r.y); put(t.rotation); }
  }
  function putValue(v) {
    if (v == null) put(0);
    else if (typeof v === 'number') put(v);
    else if (typeof v === 'boolean') put(v ? 1 : 0);
    else if (v.isTexture) putTexture(v);
    else if (v.isColor) putColor(v);
    else if (v.elements) for (const e of v.elements) put(e);
    else if (v.isVector2 || v.isVector3 || v.isVector4 || v.isQuaternion) { put(v.x); put(v.y); if (v.z !== undefined) put(v.z); if (v.w !== undefined) put(v.w); }
    else if (Array.isArray(v) || ArrayBuffer.isView(v)) for (const e of v) putValue(e);
    else put(1);
  }
  function putMaterial(m) {
    put(m.id); put(m.opacity); put(m.visible ? 1 : 0);
    // version counts `needsUpdate = true`. three sets that itself, twice, every time it draws a see-through
    // double-sided material (back faces, then front), so there the count says nothing; what such an update
    // is usually for is written down instead.
    if (m.transparent && m.side === 2 && !m.forceSinglePass) put(-1); else put(m.version);
    put(m.side); put(m.transparent ? 1 : 0); put(m.blending); put(m.alphaTest); put((m.depthTest ? 1 : 0) + (m.depthWrite ? 2 : 0) + (m.fog ? 4 : 0));
    if (m.color) putColor(m.color);
    if (m.emissive) { putColor(m.emissive); put(m.emissiveIntensity); }
    for (const k of MAPS) { const t = m[k]; if (t) putTexture(t); else put(-1); }
    if (m.rotation !== undefined) put(m.rotation); // sprites
    if (m.uniforms) for (const k in m.uniforms) putValue(m.uniforms[k].value);
  }
  function visit(o) {
    if (!o.visible) return;
    put(o.id);
    const e = o.matrixWorld.elements;
    for (let i = 0; i < 12; i++) put(e[AFFINE[i]]);
    if (o.isMesh || o.isSprite || o.isLine || o.isPoints) {
      const m = o.material;
      if (Array.isArray(m)) for (const x of m) putMaterial(x); else if (m) putMaterial(m);
      const g = o.geometry;
      if (g) { put(g.id); put(g.drawRange.start); put(g.drawRange.count === Infinity ? -1 : g.drawRange.count); }
      if (o.isInstancedMesh) { put(o.count); put(o.instanceMatrix.version); put(o.instanceColor ? o.instanceColor.version : -1); }
      put(o.renderOrder);
    } else if (o.isLight) {
      putColor(o.color); put(o.intensity); put(o.castShadow ? 1 : 0);
      if (o.castShadow) shadowLights++;
      if (o.groundColor) putColor(o.groundColor);
      if (o.distance !== undefined) { put(o.distance); put(o.decay ?? 0); }
    }
    if (dirty && !why) why = o; // the first thing found changed (for checks)
    const c = o.children;
    for (let i = 0; i < c.length; i++) visit(c[i]);
  }

  // an object's geometry box, as it is on screen: grows out[] = [x0, y0, x1, y1] in NDC; false = cannot say
  function grow(o, vp, out) {
    const g = o.geometry;
    if (!g) return false;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox, w = o.matrixWorld.elements;
    for (let k = 0; k < 8; k++) {
      const x = k & 1 ? b.max.x : b.min.x, y = k & 2 ? b.max.y : b.min.y, z = k & 4 ? b.max.z : b.min.z;
      const wx = w[0] * x + w[4] * y + w[8] * z + w[12], wy = w[1] * x + w[5] * y + w[9] * z + w[13], wz = w[2] * x + w[6] * y + w[10] * z + w[14];
      const cw = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
      if (!(cw > 1e-4)) return false; // at or behind the camera: its box on screen has no end
      const nx = (vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12]) / cw, ny = (vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13]) / cw;
      if (nx < out[0]) out[0] = nx; if (nx > out[2]) out[2] = nx;
      if (ny < out[1]) out[1] = ny; if (ny > out[3]) out[3] = ny;
    }
    return true;
  }
  const vp = new Float64Array(16);
  function bound(o, out) {
    if (!o.visible) return true;
    if (o.isMesh) { if (o.isInstancedMesh || o.isSkinnedMesh || !grow(o, vp, out)) return false; }
    else if (o.isSprite || o.isLine || o.isPoints) return false;
    const c = o.children;
    for (let i = 0; i < c.length; i++) if (!bound(c[i], out)) return false;
    return true;
  }

  return {
    // true when this frame is not what the last call saw. The scene's and camera's world matrices must be current.
    changed(scene, camera) {
      n = 0; dirty = false; why = null; shadowLights = 0;
      if (scene) {
        visit(scene);
        if (scene.fog) { putColor(scene.fog.color); put(scene.fog.near ?? 0); put(scene.fog.far ?? 0); put(scene.fog.density ?? 0); }
        const bg = scene.background;
        if (bg?.isColor) putColor(bg); else if (bg?.isTexture) putTexture(bg); else put(-1);
      }
      if (camera) {
        for (const e of camera.matrixWorld.elements) put(e);
        for (const e of camera.projectionMatrix.elements) put(e);
      }
      const was = lastN;
      lastN = n;
      return dirty || n !== was;
    },
    // lights that cast shadows, as of the last changed(): with none, a shadow map that is due is never drawn
    get shadowLights() { return shadowLights; },
    // what the last changed() found first: an object, or null (nothing, or only the camera / fog / count)
    get why() { return why; },
    // Everything drawn of `scene`, boxed on screen: out = [x0, y0, x1, y1] in NDC (not clamped to the view).
    // null when there is no telling (something at or behind the camera, sprites, instanced meshes).
    bounds(scene, camera, out = [0, 0, 0, 0]) {
      const p = camera.projectionMatrix.elements, v = camera.matrixWorldInverse.elements;
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        vp[c * 4 + r] = p[r] * v[c * 4] + p[4 + r] * v[c * 4 + 1] + p[8 + r] * v[c * 4 + 2] + p[12 + r] * v[c * 4 + 3];
      }
      out[0] = out[1] = Infinity; out[2] = out[3] = -Infinity;
      if (!bound(scene, out)) return null;
      return out[0] <= out[2] ? out : null;
    },
  };
}
