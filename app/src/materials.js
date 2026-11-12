import * as THREE from 'three';
import { toonGradient } from './textures.js';
import { WATERCOLOUR } from './style.js';

// Watercolour: fewer, lighter glaze layers (shadows in watercolour are thin washes, never near-black).
const gradientMap = WATERCOLOUR ? toonGradient(3, 120) : toonGradient(4);

// Pigment settles unevenly in a wash. Vary each surface's density with noise fixed to world space,
// so the blotches stay on the wall as the camera moves instead of sliding over the screen.
function addPigmentBlotches(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
  #endif
  vWPos = (modelMatrix * wp).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
float wcHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float wcNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wcHash(i), wcHash(i + vec3(1,0,0)), f.x), mix(wcHash(i + vec3(0,1,0)), wcHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wcHash(i + vec3(0,0,1)), wcHash(i + vec3(1,0,1)), f.x), mix(wcHash(i + vec3(0,1,1)), wcHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float n = wcNoise(vWPos * 0.9) * 0.6 + wcNoise(vWPos * 3.1) * 0.4;
  diffuseColor.rgb *= mix(0.84, 1.12, n);
  // wet-in-wet colour drift: neighbouring patches lean warm or cool
  float hue = wcNoise(vWPos * 0.35 + 11.0);
  diffuseColor.rgb *= mix(vec3(1.07, 0.99, 0.9), vec3(0.93, 0.99, 1.08), hue);
}`);
  };
  material.customProgramCacheKey = () => 'wc-blotch';
  return material;
}

export function toon(color, extra = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
  return WATERCOLOUR ? addPigmentBlotches(m) : m;
}

export function glow(color) {
  return new THREE.MeshBasicMaterial({ color });
}

// Album art and labels: lit like everything else, but flagged (alpha 0 in the scene buffer) so
// the watercolour pass leaves them sharp. Covers are the one thing you need to read exactly.
// Any material: flag it like crisp() so the watercolour pass leaves it sharp (signs you need to read).
export function keepSharp(m) {
  if (!WATERCOLOUR) return m;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 0.0;');
  };
  m.customProgramCacheKey = () => `sharp-${m.type}`;
  return m;
}

// Things that move (records, their discs): flagged (alpha 0.99 in the scene buffer, too little for the other
// looks to notice) so Oil paint's under-coat, which is pinned to the world, does not slide over them as they
// go. They show as drawn there, like everything the strokes are not pinned to.
export const UNPINNED_ALPHA = 0.99;
export function unpinned(m) {
  const before = m.onBeforeCompile, key = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (shader, r) => {
    before?.call(m, shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n  gl_FragColor.a = min(gl_FragColor.a, ${UNPINNED_ALPHA});`);
  };
  m.customProgramCacheKey = () => `unpinned-${key ? key() : m.type}`;
  return m;
}

export function crisp(params) {
  // a little self-light so paper and covers stay readable in the shop's warm, dim corners
  const m = new THREE.MeshLambertMaterial({ emissive: '#ffffff', emissiveMap: params.map, emissiveIntensity: 0.35, ...params });
  if (WATERCOLOUR) {
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 0.0;');
    };
    m.customProgramCacheKey = () => 'crisp';
  }
  return m;
}
