// The app's two kinds of surface (app/src/materials.js): painted toon (flat light bands, with pigment
// that settles unevenly, fixed to the object so the blotches stay put as it moves) and crisp (covers,
// labels and glyphs you need to read: lit, with a little self-light).
import { MeshToonMaterial, MeshLambertMaterial, DataTexture, RedFormat, NearestFilter, Matrix4 } from 'three';

function toonGradient(steps = 4, floor = 70) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round(floor + ((255 - floor) * i) / (steps - 1));
  const t = new DataTexture(data, steps, 1, RedFormat);
  t.minFilter = t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}
const gradientMap = toonGradient(4);

const NOISE = /* glsl */ `
float wcHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float wcNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wcHash(i), wcHash(i + vec3(1,0,0)), f.x), mix(wcHash(i + vec3(0,1,0)), wcHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wcHash(i + vec3(0,0,1)), wcHash(i + vec3(1,0,1)), f.x), mix(wcHash(i + vec3(0,1,1)), wcHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

// space: a uniform { value: Matrix4 } taking world positions into the object's own frame (null: world)
export function toon(color, { map = null, space = null, blotch = 1, ...rest } = {}) {
  const m = new MeshToonMaterial({ color, map, gradientMap, ...rest });
  if (!blotch) return m;
  const local = space ?? { value: new Matrix4() };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSpace = local;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform mat4 uSpace;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
  #endif
  vWPos = (uSpace * modelMatrix * wp).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float n = wcNoise(vWPos * 0.9) * 0.6 + wcNoise(vWPos * 3.1) * 0.4;
  diffuseColor.rgb *= mix(1.0 - 0.16 * ${blotch.toFixed(2)}, 1.0 + 0.12 * ${blotch.toFixed(2)}, n);
  float hue = wcNoise(vWPos * 0.35 + 11.0);
  diffuseColor.rgb *= mix(vec3(1.07, 0.99, 0.9), vec3(0.93, 0.99, 1.08), hue);
}`);
  };
  m.customProgramCacheKey = () => `toon-blotch-${blotch}`;
  return m;
}

export function crisp(params) {
  return new MeshLambertMaterial({ emissive: '#ffffff', emissiveMap: params.map, emissiveIntensity: 0.35, ...params });
}
