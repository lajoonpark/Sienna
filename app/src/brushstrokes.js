// Paints the world with real brush strokes, pinned to it: each stroke is a small painted decal fixed
// to a spot on a wall, floor or table, so it moves exactly with that surface and sits perfectly still
// when the camera does. Only its colour is live, read from the rendered scene at that spot, so lighting
// and time of day still reach the paint. A stroke is painted only on its own surface: per pixel it
// compares its depth with the scene's, so rack paint never lands on the wall behind and wall paint never
// lands on the rack. Each stroke is also fitted to the shape under it when placed: it runs along a board
// or post, is no wider than it, and slides so both of its ends land on it.
//
// Where strokes go is found by rendering the scene's positions from the places the camera visits and
// reading them back, so hidden faces get none. Closer views add smaller strokes, and each stroke fades
// in and out by its size on screen, so the marks stay about the same size wherever you stand.
// Surfaces get a full coat first: dense opaque strokes laid in staggered rows, all pulled the same way,
// as a painter works across a wall. Smaller strokes then add only what the coat could not hold.
import * as THREE from 'three';
import { rng } from './rand.js';

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 + 1.7) * 0.15; }
`;

// metres from the camera at a screen position
const SCENE_DEPTH = /* glsl */ `
float sceneDepth(vec2 uv) {
  float z = textureLod(tDepth, uv, 0.0).x * 2.0 - 1.0;
  return (2.0 * clipRange.x * clipRange.y) / (clipRange.y + clipRange.x - z * (clipRange.y - clipRange.x));
}
// 1 where a point d metres away is on the surface drawn at that position, 0 where it is on something else
uniform float slack;         // a long stroke lying across bricks or a curve needs more give than a small one
float sameSurface(vec2 uv, float d) {
  float tol = (0.02 + 0.006 * d) * slack;
  return 1.0 - smoothstep(tol, tol * 1.6, abs(sceneDepth(uv) - d));
}
`;

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Atlas of brush marks, baked once. R coverage (ragged sides, frayed tail), G pigment density (bristle
// streaks), B wet rim (where pigment pools at the edge of the mark).
const ATLAS_COLS = 2, ATLAS_ROWS = 4;
const atlasFragment = /* glsl */ `
varying vec2 vUv;
${NOISE}
void main() {
  vec2 g = vUv * vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
  vec2 id = floor(g), f = fract(g);
  float seed = id.x * 7.3 + id.y * 13.1 + 1.0;
  float u = f.x, v = f.y * 2.0 - 1.0;
  // the brush lands, loads the paper, then lifts off and runs dry
  float body = smoothstep(0.0, 0.05, u) * (1.0 - pow(smoothstep(0.7, 0.99, u), 2.0));
  float centre = (fbm(vec2(u * 1.3, seed + 9.0)) - 0.5) * 0.45;
  float width = 0.6 * body * (1.0 + (fbm(vec2(u * 2.5, seed)) - 0.5) * 0.6)
    + (fbm(vec2(u * 9.0, seed + 3.0)) - 0.5) * 0.2 * body;
  float d = abs(v - centre) / max(width, 0.001);
  d += (noise(vec2(u * 26.0, v * 7.0 + seed)) - 0.5) * 0.22; // a torn, uneven edge
  float cover = 1.0 - smoothstep(0.84, 1.0, d);
  // dry brush: bristle tracks open up toward the tail
  float bristle = fbm(vec2(u * 1.5, v * 9.0 + seed * 2.0));
  float dry = smoothstep(0.35, 1.0, u) * 0.75 + (fbm(vec2(u * 6.0, v * 4.0 + seed)) - 0.5) * 0.35;
  cover *= smoothstep(dry - 0.16, dry + 0.16, bristle + 0.14);
  float density = 0.8 + 0.2 * smoothstep(0.25, 0.75, bristle);
  float rim = smoothstep(0.7, 0.98, d) * cover;
  gl_FragColor = vec4(cover, density, rim, 1.0);
}
`;

const strokeVertex = /* glsl */ `
attribute vec4 aPos;         // world position, stroke length in metres
attribute vec4 aTan;         // direction along the surface, random
attribute vec4 aNor;         // surface normal, random
attribute vec2 aShape;       // length and width after fitting to the shape it sits on (metres)
uniform sampler2D tRef;
uniform sampler2D tDepth;
uniform mat4 viewProj;
uniform vec3 eye;
uniform vec2 clipRange;      // camera near, far
uniform float heightAt1m;    // metres of world filling the screen's height, 1 m from the camera
uniform float lodShift;      // keeps stroke colours at the same scale at any window size
uniform float aspect;        // width / height of the picture
uniform vec2 window;         // stroke length on screen (fraction of its height) where it is fully shown
uniform vec2 lods;           // fine, coarse colour levels
uniform vec2 gate;           // detail difference that starts / fully shows a stroke (0 0: always)
uniform float power;         // the coat is lighter than the scene: thin paint with the paper glowing through it
uniform vec2 calm;           // the coat: picture detail that starts / fully stops it, for smaller marks to paint
varying vec2 vAtlas;
varying vec3 vPigment;
varying vec3 vWants;         // the colour this mark is painting: it stops where the picture stops being that
varying float vFade;
varying float vDepth;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
${SCENE_DEPTH}
void main() {
  // anything not on show collapses off screen before the costly part
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vAtlas = vec2(0.0); vPigment = vec3(1.0); vWants = vec3(1.0); vFade = 0.0; vDepth = 0.0;
  vec4 clipA = viewProj * vec4(aPos.xyz, 1.0);
  if (clipA.w < 0.15) return;
  vec2 a = clipA.xy / clipA.w * 0.5 + 0.5;
  if (a.x < -0.5 || a.x > 1.5 || a.y < -0.5 || a.y > 1.5) return;
  if (dot(aNor.xyz, eye - aPos.xyz) <= 0.0) return;
  float onScreen = aPos.w / (clipA.w * heightAt1m);
  float fade = smoothstep(window.x * 0.6, window.x, onScreen) * (1.0 - smoothstep(window.y, window.y * 1.5, onScreen));
  if (fade <= 0.01) return;

  // hidden behind something nearer? Several taps, so a stroke fades as it goes behind an edge
  float bias = 0.05 + 0.012 * clipA.w;
  vec2 ua = clamp(a, 0.0, 1.0);
  float seen = 0.0;
  vec2 seenAt = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i < 2 ? -0.006 : 0.006, (i == 0 || i == 2) ? -0.009 : 0.009);
    float tap = step(clipA.w - bias, sceneDepth(clamp(ua + o, 0.0, 1.0)));
    seen += tap * 0.25;
    seenAt += o * tap;
  }
  // half in view is enough: the fragment shader cuts it off at whatever is in front
  fade *= smoothstep(0.0, 0.5, seen);
  if (fade <= 0.01) return;

  // its colour comes from the part in view, not from what is covering its middle
  vec2 uc = clamp(ua + seenAt / max(seen * 4.0, 1.0), 0.0, 1.0);
  // Read over the mark's own patch, not at one point: a single texel of a mip level jumps as the
  // picture slides under it, and the whole mark would flicker to a new colour with it.
  vec2 spread = vec2(onScreen * 0.25 / aspect, onScreen * 0.25);
  vec3 fine = vec3(0.0), coarse = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    vec2 o = i == 0 ? vec2(0.0) : vec2(i == 1 ? -1.0 : i == 2 ? 1.0 : 0.0, i == 3 ? -1.0 : i == 4 ? 1.0 : 0.0) * spread;
    vec2 at = clamp(uc + o, 0.0, 1.0);
    float k = i == 0 ? 0.4 : 0.15;
    fine += textureLod(tRef, at, lods.x + lodShift).rgb * k;
    coarse += textureLod(tRef, at, lods.y + lodShift).rgb * k;
  }
  // Album covers are not paint on this surface: a stroke beside one must not pick up its colours.
  // (Covers wrote alpha 0, which the blurred level still shows.)
  fade *= smoothstep(0.9, 0.99, textureLod(tRef, uc, lods.x + lodShift).a);
  if (gate.y > 0.0) fade *= smoothstep(gate.x, gate.y, length(fine - coarse));
#ifdef GROUND
  fade *= 1.0 - smoothstep(calm.x, calm.y, length(textureLod(tRef, uc, 1.2 + lodShift).rgb - fine));
#endif
  if (fade <= 0.01) return;
  vFade = fade;

  // a hand swings in an arc, so no mark is straight
  float len = aShape.x * (0.8 + 0.2 * aNor.w);
  float wid = aShape.y * (0.8 + 0.2 * fract(aNor.w * 7.13));
  float bend = (fract(aNor.w * 11.3) - 0.5) * 0.7;
  vec2 lp = vec2(position.x, position.y + bend * (position.x * position.x - 0.15));
  vec3 side = cross(aNor.xyz, aTan.xyz);
  vec3 world = aPos.xyz + aTan.xyz * lp.x * len + side * lp.y * wid + aNor.xyz * 0.01;
  gl_Position = viewProj * vec4(world, 1.0);
  vDepth = gl_Position.w;
  vWants = fine;

  float cell = floor(aTan.w * 97.0);
  vec2 id = vec2(mod(cell, ${ATLAS_COLS}.0), mod(floor(cell / ${ATLAS_COLS}.0), ${ATLAS_ROWS}.0));
  vAtlas = (id + uv) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
#ifdef CORRECT
  // a correction on top of the coat: only what this spot needs beyond the coarser colour
  vPigment = clamp(fine / max(coarse, vec3(0.04)), 0.0, 1.0);
#elif defined(GROUND)
  // opaque, so each stroke shows; no two come off the brush quite the same tone
  vPigment = pow(clamp(mix(vec3(lum(fine)), fine, 1.25), 0.0, 1.0), vec3(power)) * (0.96 + 0.08 * fract(aNor.w * 5.37));
#elif defined(TOUCH)
  vPigment = fine;
#endif
  // each mark leans a little warm or cool, as if the brush was not rinsed between loads
  vPigment *= mix(vec3(1.04, 1.0, 0.95), vec3(0.96, 1.0, 1.05), fract(aNor.w * 3.71));
}
`;

const strokeFragment = /* glsl */ `
uniform sampler2D tAtlas;
uniform sampler2D tRef;
uniform sampler2D tDepth;
uniform vec2 clipRange;
uniform float opacity;
uniform float rimPower;
uniform float lodShift;
uniform vec3 clip;           // reference level, colour distance where the mark starts to break, and stops
varying vec2 vAtlas;
varying vec3 vPigment;
varying vec3 vWants;
varying float vFade;
varying float vDepth;
${SCENE_DEPTH}
void main() {
  vec4 s = texture2D(tAtlas, vAtlas);
  if (s.r < 0.01) discard; // the empty part of the quad: most of the overdraw, so out before the costly reads
  // The mark stops at the edge of the shape it is painting, raggedly: the bristle pattern shifts
  // where it looks, so the edge is uneven and sometimes overshoots.
  vec2 screen = gl_FragCoord.xy / vec2(textureSize(tRef, 0));
  vec2 off = (s.gb - vec2(0.8, 0.2)) * 0.022;
  // Its own surface only. The second look, shifted by the bristles, stops the mark a hair short of the
  // edge, unevenly, the way a careful hand cuts in: it can fall short but never crosses.
  float own = sameSurface(screen, vDepth);
  if (own <= 0.0) discard;
  own *= sameSurface(screen + off * 0.2, vDepth);
  vec3 here = textureLod(tRef, screen + off, clip.x + lodShift).rgb;
  float stay = 1.0 - smoothstep(clip.y, clip.z, length(here - vWants));
  float cover = s.r * stay * vFade * own;
  vec3 pig = pow(max(vPigment, vec3(0.001)), vec3(1.0 + s.b * rimPower));
#if defined(GROUND)
  gl_FragColor = vec4(pig * (0.9 + 0.5 * (s.g - 0.8)), cover * opacity);
#elif defined(TOUCH)
  gl_FragColor = vec4(pig, cover * opacity);
#else
  gl_FragColor = vec4(mix(vec3(1.0), pig, cover * s.g * opacity), 1.0);
#endif
}
`;

// The first thin wash under everything: moving things (records, the door) get no pinned strokes, and
// gaps between strokes show this, not white.
const underFragment = /* glsl */ `
uniform sampler2D tRef;
uniform float lodShift;
uniform float power;
uniform vec2 pan;
uniform float aspect;
uniform sampler2D tDepth;
uniform vec2 clipRange;
varying vec2 vUv;
${NOISE}
${SCENE_DEPTH}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 q = (vUv + pan) * vec2(aspect, 1.0);
  // every shape's edge wanders here, in the first wash, before a brush touches it
  vec2 wander = (vec2(fbm(q * 5.0 + 11.0), fbm(q * 5.0 + 37.0)) - 0.5) * 0.028
              + (vec2(fbm(q * 19.0 + 3.0), fbm(q * 19.0 + 23.0)) - 0.5) * 0.009;
  // ...but only within its own surface: past an outline this wash keeps its own colour
  vec3 c = mix(textureLod(tRef, vUv, 1.0 + lodShift).rgb, textureLod(tRef, vUv + wander, 2.2 + lodShift).rgb, sameSurface(vUv + wander, sceneDepth(vUv)));
  c = clamp(mix(vec3(lum(c)), c, 1.3), 0.0, 1.0);
  // Busy things (records in a bin, railings, leaves) are too small for the coat, which leaves them to
  // this wash: keep what they look like here, at full strength.
  // (Not finer than this: at full detail thin bars and leaves shimmer as the camera moves.)
  vec3 near = textureLod(tRef, vUv, 1.4 + lodShift).rgb;
  float busy = smoothstep(0.05, 0.16, length(textureLod(tRef, vUv, 1.8 + lodShift).rgb - textureLod(tRef, vUv, 3.4 + lodShift).rgb));
  // left bare in places: the paper shows through as light catches
  float thin = smoothstep(0.5, 0.74, fbm(q * 2.6 + 3.0));
  gl_FragColor = vec4(mix(mix(pow(c, vec3(power)), vec3(1.0), thin * 0.12), near, busy), 1.0);
}
`;

// reach: stroke length as a fraction of its distance from the view that placed it.
// rowGap, colGap: distance between rows of strokes and along a row, as fractions of stroke length.
const LAYERS = [
  // the coat: rows close enough that the strokes overlap and no wall is left bare
  { segments: 3, cap: 150000, reach: 0.3, rowGap: 0.17, colGap: 0.8, widthRatio: 0.3, window: [0.16, 0.8], lods: [3.0, 4.2], gate: [0, 0], calm: [0.1, 0.22], power: 0.82, opacity: 0.94, rim: 0.2, clip: [1.6, 0.15, 0.3], slack: 1.4, mode: 'GROUND' },
  // medium strokes, where the picture has detail the coat could not hold
  { segments: 3, cap: 90000, reach: 0.14, rowGap: 0.55, colGap: 0.55, widthRatio: 0.33, window: [0.08, 0.24], lods: [1.6, 3.4], gate: [0.025, 0.09], opacity: 0.85, rim: 0.4, clip: [1.2, 0.08, 0.2], slack: 1.5, mode: 'CORRECT' },
  // fine touches of opaque colour, the only marks that can put light back on a dark wash
  { segments: 1, cap: 120000, reach: 0.05, rowGap: 0.5, colGap: 0.5, widthRatio: 0.29, window: [0.03, 0.1], lods: [0.8, 2.2], gate: [0.07, 0.18], opacity: 0.72, rim: 0.2, clip: [0.7, 0.1, 0.22], slack: 1, mode: 'TOUCH' },
];
const BASE_LENGTH = 0.1; // metres; stroke lengths are this times a power of two
const MAX_OCTAVE = 6;
const BAKE_W = 320, BAKE_H = 200;
const BAKE_STRIDE = 3;
const FARTHEST = 70; // metres: the sky dome is painted by the first wash alone

function bakeAtlas(renderer) {
  const t = new THREE.WebGLRenderTarget(1024, 1024, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });
  const m = new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: atlasFragment, depthTest: false, depthWrite: false });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  q.frustumCulled = false;
  const sc = new THREE.Scene();
  sc.add(q);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(t);
  renderer.render(sc, cam);
  renderer.setRenderTarget(prev);
  m.dispose();
  q.geometry.dispose();
  return t;
}

const positionMaterial = () => new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
varying vec3 vW;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  vec4 w = modelMatrix * p;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
  fragmentShader: /* glsl */ `
varying vec3 vW;
void main() { gl_FragColor = vec4(vW, 1.0); }`,
  side: THREE.DoubleSide,
});

function layerMesh(layer, shared, atlas) {
  const geo = new THREE.InstancedBufferGeometry();
  // x -0.5..0.5 along the stroke, y -0.5..0.5 across; enough segments to bend (small marks need few)
  const plane = new THREE.PlaneGeometry(1, 1, layer.segments, 1);
  geo.index = plane.index;
  geo.setAttribute('position', plane.getAttribute('position'));
  geo.setAttribute('uv', plane.getAttribute('uv'));
  const attr = (name, size = 4) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(layer.cap * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const buffers = { aPos: attr('aPos'), aTan: attr('aTan'), aNor: attr('aNor'), aShape: attr('aShape', 2) };
  geo.instanceCount = 0;
  const blend = layer.mode === 'TOUCH' || layer.mode === 'GROUND'
    ? { blending: THREE.NormalBlending }
    : { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
  const mat = new THREE.ShaderMaterial({
    vertexShader: strokeVertex,
    fragmentShader: strokeFragment,
    defines: { [layer.mode]: '' },
    uniforms: {
      ...shared,
      tAtlas: { value: atlas.texture },
      window: { value: new THREE.Vector2(...layer.window) },
      lods: { value: new THREE.Vector2(...layer.lods) },
      gate: { value: new THREE.Vector2(...layer.gate) },
      power: { value: layer.power ?? 1 },
      calm: { value: new THREE.Vector2(...(layer.calm ?? [0, 0])) },
      opacity: { value: layer.opacity },
      rimPower: { value: layer.rim },
      slack: { value: layer.slack },
      clip: { value: new THREE.Vector3(...layer.clip) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...blend,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, geo, mat, plane, buffers, layer, count: 0, taken: new Set() };
}

// The one direction a painter pulls the brush across an open surface: left to right as you face it,
// on the diagonal the arm falls into (level rows would read as planks). The rows are laid out along this.
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const LEAN = -0.5;
const tangent = new THREE.Vector3();
function handDirection(n, out) {
  return out.crossVectors(Math.abs(n.y) > 0.8 ? X : UP, n).normalize().applyAxisAngle(n, LEAN);
}
// A real stroke from that hand: the arm drifts slowly over the surface and wavers a few degrees, no more.
function chooseTangent(p, n, r) {
  const drift = Math.sin(p.x * 0.7 + p.z * 0.4) * 0.06 + Math.sin(p.y * 1.1 - p.z * 0.6) * 0.05;
  return handDirection(n, tangent).applyAxisAngle(n, drift + (r - 0.5) * 0.1);
}

// Looks around a point in the position picture for the flat piece of surface it belongs to.
const RAYS = 16, RAY_STEP = 2, RAY_STEPS = 30;
const RAY_DIRS = Array.from({ length: RAYS }, (_, k) => [Math.cos((k / RAYS) * Math.PI * 2), Math.sin((k / RAYS) * Math.PI * 2)]);
const flatTol = (d) => 0.015 + 0.006 * d;

const FACES = (n) => (Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? 0 : 1) : Math.abs(n.y) > Math.abs(n.z) ? (n.y > 0 ? 2 : 3) : (n.z > 0 ? 4 : 5));

// A fingerprint of what a bake would see: every solid, drawn mesh (its geometry's size, where it is, its
// instances), the views, and how strokes are laid out. The stroke cache keeps a bake under it, so a
// change to the street, the shop or this file's settings bakes again instead of reusing old strokes.
const CACHE_VERSION = 1; // bump when `place` changes in a way the numbers below do not show
export function strokeFingerprint(world, views) {
  let h1 = 0x811c9dc5 ^ CACHE_VERSION, h2 = 0x9e3779b9;
  const add = (v) => {
    const x = Math.round(v * 4096) | 0;
    h1 = Math.imul(h1 ^ x, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (x >>> 7) ^ (x << 3), 2246822519) >>> 0;
  };
  world.updateMatrixWorld();
  world.traverseVisible((o) => {
    if (!o.isMesh || [].concat(o.material).every((m) => m.transparent || m.opacity < 1)) return;
    const g = o.geometry;
    add(g.attributes.position?.count ?? 0); add(g.index?.count ?? -1);
    for (const e of o.matrixWorld.elements) add(e);
    if (o.isInstancedMesh) {
      add(o.count);
      const a = o.instanceMatrix.array;
      let sum = 0;
      for (let i = 0; i < o.count * 16; i++) sum += a[i] * ((i % 13) + 1);
      add(sum);
    }
  });
  for (const v of views) { add(v.pos.x); add(v.pos.y); add(v.pos.z); add(v.target.x); add(v.target.y); add(v.target.z); add(v.fov ?? 70); }
  add(BAKE_W); add(BAKE_H); add(BAKE_STRIDE); add(FARTHEST);
  for (const l of LAYERS) for (const v of Object.values(l)) if (typeof v === 'number') add(v); else if (Array.isArray(v)) v.forEach(add);
  return `${h1.toString(16)}${h2.toString(16)}`;
}

export function createBrushStrokes(renderer, refTexture, depthTexture) {
  const shared = {
    tRef: { value: refTexture },
    tDepth: { value: depthTexture },
    viewProj: { value: new THREE.Matrix4() },
    eye: { value: new THREE.Vector3() },
    clipRange: { value: new THREE.Vector2(0.1, 100) },
    heightAt1m: { value: 1 },
    pan: { value: new THREE.Vector2() },
    aspect: { value: 1 },
    lodShift: { value: 0 },
  };
  const atlas = bakeAtlas(renderer);
  const scene = new THREE.Scene();
  const under = new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: underFragment,
    uniforms: { slack: { value: 1 }, tRef: shared.tRef, tDepth: shared.tDepth, clipRange: shared.clipRange, lodShift: shared.lodShift, pan: shared.pan, aspect: shared.aspect, power: { value: 0.82 } },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const underQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), under);
  underQuad.frustumCulled = false;
  underQuad.renderOrder = 0;
  scene.add(underQuad);
  const layers = LAYERS.map((l, i) => {
    const part = layerMesh(l, shared, atlas);
    part.mesh.renderOrder = i + 1;
    part.mesh.visible = false; // until the first bake
    scene.add(part.mesh);
    return part;
  });

  const r = rng(7);
  const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), n = new THREE.Vector3(), toEye = new THREE.Vector3(), side = new THREE.Vector3(), centre = new THREE.Vector3(), long = new THREE.Vector3(), mid = new THREE.Vector3(), hit = new THREE.Vector3(), hand = new THREE.Vector3(), across = new THREE.Vector3();
  const ends = Array.from({ length: RAYS }, () => new THREE.Vector3());
  const place = (cam, data) => {
    const at = (x, y, out) => { if (x < 0 || y < 0 || x >= BAKE_W || y >= BAKE_H) return null; const i = (y * BAKE_W + x) * 4; if (!data[i + 3]) return null; return out.set(data[i], data[i + 1], data[i + 2]); };
    const eye = cam.getWorldPosition(new THREE.Vector3());
    for (let y = 0; y < BAKE_H - 2 * BAKE_STRIDE; y += BAKE_STRIDE) {
      for (let x = 0; x < BAKE_W - 2 * BAKE_STRIDE; x += BAKE_STRIDE) {
        const px = x + Math.floor(r() * BAKE_STRIDE), py = y + Math.floor(r() * BAKE_STRIDE);
        if (!at(px, py, p) || !at(px + BAKE_STRIDE, py, a) || !at(px, py + BAKE_STRIDE, b)) continue;
        const d = toEye.subVectors(eye, p).length();
        if (d > FARTHEST) continue;
        // the normal, from as wide a patch as is still flat, so a long stroke lies true on bricks
        const tol = flatTol(d);
        let normalOk = false;
        for (const k of [8, 3, 1]) {
          if (!at(px + k, py, a) || !at(px - k, py, c) || !at(px, py + k, b) || !at(px, py - k, e)) continue;
          if (mid.addVectors(a, c).multiplyScalar(0.5).distanceTo(p) > tol || mid.addVectors(b, e).multiplyScalar(0.5).distanceTo(p) > tol) continue;
          n.crossVectors(a.sub(c), b.sub(e));
          if (n.lengthSq() < 1e-12) continue;
          normalOk = true;
          break;
        }
        if (!normalOk) continue; // on an edge
        n.normalize();
        if (n.dot(toEye) < 0) n.negate();
        handDirection(n, hand);
        across.crossVectors(n, hand);
        let measured = false, longest = 0, crossSpan = 0;
        for (const part of layers) {
          const { layer, buffers, taken } = part;
          if (part.count >= layer.cap) continue;
          const octave = Math.min(MAX_OCTAVE, Math.max(0, Math.round(Math.log2((layer.reach * d) / BASE_LENGTH))));
          const len = BASE_LENGTH * 2 ** octave;
          // one stroke per place in the rows on this surface. Each row starts somewhere of its own: evenly
          // staggered rows line their stroke ends up into a false second diagonal, a zigzag.
          const rowH = len * layer.rowGap;
          const row = Math.floor(p.dot(across) / rowH);
          const col = Math.floor(p.dot(hand) / (len * layer.colGap) + ((row * 0.618) % 1 + 1) % 1);
          const depth = Math.floor(p.dot(n) / Math.max(0.15, rowH));
          const key = (row + 16384) * 2 ** 33 + (col + 16384) * 2 ** 18 + (depth + 2048) * 2 ** 6 + octave * 8 + FACES(n);
          if (taken.has(key)) continue;
          taken.add(key);
          if (!measured) {
            measured = true;
            for (let k = 0; k < RAYS; k++) {
              const [dx, dy] = RAY_DIRS[k], end = ends[k].set(0, 0, 0);
              for (let step = 1; step <= RAY_STEPS; step++) {
                const ix = Math.round(px + dx * step * RAY_STEP), iy = Math.round(py + dy * step * RAY_STEP);
                if (!at(ix, iy, a)) break;
                a.sub(p);
                if (Math.abs(a.dot(n)) <= tol) { end.copy(a); continue; }
                // Off the plane. Something in front only hides the surface, which carries on behind it
                // (a wall seen between two posts is not a thin wall); anything farther means it ended.
                hit.set(((ix + 0.5) / BAKE_W) * 2 - 1, ((iy + 0.5) / BAKE_H) * 2 - 1, 0.5).unproject(cam).sub(eye);
                const along = hit.dot(n);
                if (Math.abs(along) < 1e-6) break;
                const scale = mid.subVectors(p, eye).dot(n) / along;
                if (scale <= 0) break;
                hit.multiplyScalar(scale).add(eye);
                if (a.add(p).distanceTo(eye) >= hit.distanceTo(eye)) break;
                end.subVectors(hit, p);
              }
            }
            for (let k = 0; k < RAYS / 2; k++) {
              const chord = a.subVectors(ends[k], ends[k + RAYS / 2]).length();
              if (chord > longest) { longest = chord; long.copy(a); }
            }
            long.addScaledVector(n, -long.dot(n)).normalize();
            // always pulled the same way: down a post, along a board like everything else
            if (Math.abs(long.dot(UP)) > 0.7 ? long.dot(UP) > 0 : long.dot(hand) < 0) long.negate();
            let lo = 0, hi = 0;
            side.crossVectors(n, long);
            for (const q of ends) { const v = q.dot(side); lo = Math.min(lo, v); hi = Math.max(hi, v); }
            crossSpan = hi - lo;
          }
          // a board, a post, a shelf edge: the stroke runs along it when it is too big to lie across it
          const follow = longest > crossSpan * 1.6 && crossSpan < len * 0.6;
          const t = follow ? tangent.copy(long).applyAxisAngle(n, (r() - 0.5) * 0.08) : chooseTangent(p, n, r());
          side.crossVectors(n, t);
          let al = 0, ah = 0, sl = 0, sh = 0;
          for (const q of ends) {
            const u = q.dot(t), v = q.dot(side);
            al = Math.min(al, u); ah = Math.max(ah, u); sl = Math.min(sl, v); sh = Math.max(sh, v);
          }
          // fit it, then slide it so both ends land on the shape
          const wid = Math.max(0.006, Math.min(len * layer.widthRatio, (sh - sl) * 1.1));
          const fitted = Math.max(wid * 1.6, Math.min(len, (ah - al) * 1.1));
          const slide = (lo, hi, size) => (size >= hi - lo ? (lo + hi) / 2 : Math.max(lo + size / 2, Math.min(hi - size / 2, 0)));
          // and no two land quite evenly along the row (the slide still keeps both ends on the shape)
          const wander = (r() - 0.5) * len * layer.colGap * 0.8;
          centre.copy(p).addScaledVector(t, slide(al - wander, ah - wander, fitted) + wander).addScaledVector(side, slide(sl, sh, wid));
          const i = part.count++;
          buffers.aPos.setXYZW(i, centre.x, centre.y, centre.z, len);
          buffers.aShape.setXY(i, fitted, wid);
          buffers.aTan.setXYZW(i, t.x, t.y, t.z, r());
          buffers.aNor.setXYZW(i, n.x, n.y, n.z, r());
        }
      }
    }
  };

  // views: [{ pos, target, fov }]. Adds strokes for whatever those views can see that has none yet.
  function bake(world, views) {
    const rt = new THREE.WebGLRenderTarget(BAKE_W, BAKE_H, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const mat = positionMaterial();
    const cam = new THREE.PerspectiveCamera(70, BAKE_W / BAKE_H, 0.1, 200);
    const data = new Float32Array(BAKE_W * BAKE_H * 4);
    // only solid, drawn meshes: glows, lines and glass have no surface to paint on
    const hidden = [];
    world.traverse((o) => {
      if (!o.visible) return;
      const solid = o.isMesh && ![].concat(o.material).every((m) => m.transparent || m.opacity < 1);
      if (!solid && (o.isSprite || o.isLine || o.isPoints || o.isMesh)) { hidden.push(o); o.visible = false; }
    });
    const prev = { target: renderer.getRenderTarget(), bg: world.background, over: world.overrideMaterial, autoClear: renderer.autoClear, shadows: renderer.shadowMap.needsUpdate, clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
    world.background = null;
    world.overrideMaterial = mat;
    renderer.shadowMap.needsUpdate = false;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt);
    for (const v of views) {
      cam.fov = v.fov ?? 70;
      cam.updateProjectionMatrix();
      cam.position.copy(v.pos);
      cam.lookAt(v.target);
      cam.updateMatrixWorld();
      renderer.render(world, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, BAKE_W, BAKE_H, data);
      place(cam, data);
    }
    renderer.setRenderTarget(prev.target);
    renderer.setClearColor(prev.clear, prev.alpha);
    renderer.autoClear = prev.autoClear;
    renderer.shadowMap.needsUpdate = prev.shadows;
    world.background = prev.bg;
    world.overrideMaterial = prev.over;
    for (const o of hidden) o.visible = true;
    rt.dispose();
    mat.dispose();
    upload();
  }

  // The placed strokes as plain arrays, and back (the stroke cache, strokecache.js): placing them from the
  // shop's 31 views took ~2.8 s of every start.
  function save() {
    return {
      rng: r.state,
      layers: layers.map((part) => ({
        count: part.count,
        taken: Float64Array.from(part.taken),
        buffers: Object.fromEntries(Object.entries(part.buffers).map(([k, buf]) => [k, buf.array.slice(0, part.count * buf.itemSize)])),
      })),
    };
  }
  function load(state) {
    if (!state || state.layers?.length !== layers.length) return false;
    for (let i = 0; i < layers.length; i++) {
      const part = layers[i], s = state.layers[i];
      if (s.count > part.layer.cap) return false;
      for (const [k, buf] of Object.entries(part.buffers)) if (!s.buffers[k] || s.buffers[k].length !== s.count * buf.itemSize) return false;
    }
    r.state = state.rng;
    layers.forEach((part, i) => {
      const s = state.layers[i];
      part.count = s.count;
      part.taken = new Set(s.taken);
      for (const [k, buf] of Object.entries(part.buffers)) buf.array.set(s.buffers[k], 0);
    });
    upload();
    return true;
  }
  function upload() {
    for (const part of layers) {
      part.geo.instanceCount = part.count;
      part.mesh.visible = part.count > 0;
      for (const buf of Object.values(part.buffers)) { buf.clearUpdateRanges(); buf.addUpdateRange(0, part.count * buf.itemSize); buf.needsUpdate = true; }
    }
  }

  return {
    scene,
    bake,
    save,
    load,
    get counts() { return layers.map((l) => l.count); },
    get caps() { return layers.map((l) => l.buffers.aPos.count); },
    setSize(w, h) {
      shared.aspect.value = w / h;
      shared.lodShift.value = Math.log2(Math.max(1, h) / 720);
    },
    setPan(x, y) { shared.pan.value.set(x, y); },
    setCamera(camera) {
      shared.viewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      camera.getWorldPosition(shared.eye.value);
      shared.clipRange.value.set(camera.near, camera.far);
      shared.heightAt1m.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    },
    dispose() {
      atlas.dispose();
      under.dispose();
      underQuad.geometry.dispose();
      for (const part of layers) { part.mat.dispose(); part.geo.dispose(); part.plane.dispose(); }
    },
  };
}
