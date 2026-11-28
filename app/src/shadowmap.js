// The sun's shadow map, made here rather than by three (the shop in main.js and the mini window's lounge
// in mini.js). PCF shadows sample only its depth layer, but three gives its target a full RGBA colour layer
// too (64 MB at 4096 px, written and never read). three cannot make a target without one, so it is made as
// the smallest, one byte a pixel (16 MB), and then taken off the framebuffer and freed (dropShadowColour):
// WebGL 2 draws to a depth-only framebuffer. Otherwise as three makes it (WebGLShadowMap: PCF, no reversed
// depth); made again whenever timeofday.js has let go of it for the night.
// Call it at the first shadow draw, not while the scene is being built: a new texture takes a Math.random
// uuid, and the street and shop are built from Math.random, so making it earlier would build a different street.
//   depth32: a 32-bit depth layer instead of 16 (?shadow32=1 in the shop; the mini window's small map)
//   dropColour: free the unread colour layer (?shadowColour=1 keeps it, e.g. where a driver will not draw without one)
import * as THREE from 'three';

export function leanShadowMap(renderer, sun, { depth32 = false, dropColour = true } = {}) {
  if (!sun.castShadow) return;
  if (sun.shadow.map?.texture.format === THREE.RedFormat) return;
  sun.shadow.map?.dispose();   // one three made itself (a render got there first): swap it
  const { x, y } = sun.shadow.mapSize;
  const map = new THREE.WebGLRenderTarget(x, y, { format: THREE.RedFormat, generateMipmaps: false });
  map.texture.name = 'sun.shadowMapColour';
  map.depthTexture = new THREE.DepthTexture(x, y, depth32 ? THREE.UnsignedIntType : THREE.UnsignedShortType);
  map.depthTexture.name = 'sun.shadowMap';
  map.depthTexture.format = THREE.DepthFormat;
  map.depthTexture.compareFunction = THREE.LessEqualCompare;
  map.depthTexture.minFilter = map.depthTexture.magFilter = THREE.LinearFilter;
  sun.shadow.map = map;
  sun.shadow.camera.updateProjectionMatrix();
  if (dropColour) dropShadowColour(renderer, map);
}

// Frees the colour layer of a shadow map nobody reads. If the driver will not draw without one, it stays.
function dropShadowColour(renderer, map) {
  const gl = renderer.getContext(), prev = renderer.getRenderTarget();
  renderer.initRenderTarget(map);
  const fb = renderer.properties.get(map).__webglFramebuffer, tex = renderer.properties.get(map.texture).__webglTexture;
  if (fb && tex && !Array.isArray(fb)) {
    renderer.state.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) gl.deleteTexture(tex); // (three's later delete of it is a no-op)
    else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  }
  renderer.setRenderTarget(prev);
}
