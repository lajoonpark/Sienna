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

// Things that turn in place (the plant room's spinner: userData.strokeTurn = { half, y0, y1 }, the box it
// fills in its own frame, half its width and its height). Strokes placed on one are kept in its own frame,
// tagged in aCol.w (+ TURN_TAG), and go round with it: turnM is its frame -> world now, turnOn 0 when it
// is not there or not shown (one such thing at a time).
export const TURN_TAG = 1000;
export const STROKE_FRAME = /* glsl */ `
uniform mat4 turnM;
uniform float turnOn;
vec3 sPos, sTan, sNor;      // the stroke's place, way and normal in the world, now
bool strokeFrame() {
  sPos = aPos.xyz; sTan = aTan.xyz; sNor = aNor.xyz;
  if (aCol.w < ${TURN_TAG / 2}.0) return true;
  if (turnOn < 0.5) return false;
  mat3 R = mat3(turnM);
  sPos = (turnM * vec4(aPos.xyz, 1.0)).xyz; sTan = R * aTan.xyz; sNor = R * aNor.xyz;
  return true;
}
`;
// A face of it is only painted from a view that sees it this square on (the cosine): from a glancing one the
// shape and normal come out rough, and once it turns to face you that shows. The bake turns it a quarter at a
// time instead, so every side is seen nearly square on once.
const TURN_FACING = 0.45;
const inTurnBox = (l, box) => Math.abs(l.x) < box.half && Math.abs(l.z) < box.half && l.y > box.y0 && l.y < box.y1;

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
attribute vec4 aShape;       // length and width after fitting to the shape it sits on, and the room there (metres)
attribute vec4 aCol;         // (here only its w: + TURN_TAG when it is on something that turns)
uniform sampler2D tRef;
uniform sampler2D tDepth;
uniform mat4 viewProj;
uniform vec3 eye;
uniform vec2 clipRange;      // camera near, far
uniform float heightAt1m;    // metres of world filling the screen's height, 1 m from the camera
uniform float lodShift;      // keeps stroke colours at the same scale at any window size
uniform float aspect;        // width / height of the picture
uniform vec2 window;         // stroke length on screen (fraction of its height) where it is fully shown
uniform vec3 farGrow;        // near m, far m, factor: the smallest size grows this much with distance
uniform vec3 fovea;          // where you look (uv) and the reach of full detail (share of the height; 0 = all)
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
${STROKE_FRAME}
void main() {
  // anything not on show collapses off screen before the costly part
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vAtlas = vec2(0.0); vPigment = vec3(1.0); vWants = vec3(1.0); vFade = 0.0; vDepth = 0.0;
  if (!strokeFrame()) return;
  vec4 clipA = viewProj * vec4(sPos, 1.0);
  if (clipA.w < 0.15) return;
  vec2 a = clipA.xy / clipA.w * 0.5 + 0.5;
  if (a.x < -0.5 || a.x > 1.5 || a.y < -0.5 || a.y > 1.5) return;
  if (dot(sNor, eye - sPos) <= 0.0) return;
  float onScreen = aPos.w / (clipA.w * heightAt1m);
  // Far away, fewer and bigger: the smallest size a mark may be on screen grows with distance (farGrow:
  // from x metres to y metres it grows up to z times), so a far wall is painted in a few broad marks
  // rather than many small ones on top of each other (most of this pass's cost is that overlap).
  float minSize = window.x * mix(1.0, farGrow.z, smoothstep(farGrow.x, farGrow.y, clipA.w));
  float fade = smoothstep(minSize * 0.6, minSize, onScreen) * (1.0 - smoothstep(window.y, window.y * 1.5, onScreen));
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
  // away from where you look (other-optimizations, C4): 1
  float periph = fovea.z > 0.0 ? smoothstep(fovea.z, fovea.z * 1.7, length((a - fovea.xy) * vec2(aspect, 1.0))) : 0.0;
#if defined(CORRECT) || defined(TOUCH)
  // the detail marks only around where you look; the coat covers everywhere
  fade *= 1.0 - periph;
#endif
#ifdef GROUND
  // The coat steps aside where the picture has detail, for the smaller marks to paint it. Those are left
  // out away from where you look, so there it stays: else that detail was bare (gaps on busy brick walls).
  fade *= 1.0 - smoothstep(calm.x, calm.y, length(textureLod(tRef, uc, 1.2 + lodShift).rgb - fine)) * (1.0 - periph);
#endif
  if (fade <= 0.01) return;
  vFade = fade;

  // a hand swings in an arc, so no mark is straight
  float len = aShape.x * (0.8 + 0.2 * aNor.w);
  float wid = aShape.y * (0.8 + 0.2 * fract(aNor.w * 7.13));
  float bend = (fract(aNor.w * 11.3) - 0.5) * 0.7;
  vec2 lp = vec2(position.x, position.y + bend * (position.x * position.x - 0.15));
  vec3 side = cross(sNor, sTan);
  vec3 world = sPos + sTan * lp.x * len + side * lp.y * wid + sNor * 0.01;
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
  // fine touches of opaque colour, the only marks that can put light back on a dark wash; cap 200000: the winding shop (2026-11-13) takes ~171k, 120000 left the rooms baked last without them
  { segments: 1, cap: 200000, reach: 0.05, rowGap: 0.5, colGap: 0.5, widthRatio: 0.29, window: [0.03, 0.1], lods: [0.8, 2.2], gate: [0.07, 0.18], opacity: 0.72, rim: 0.2, clip: [0.7, 0.1, 0.22], slack: 1, mode: 'TOUCH' },
];
const BASE_LENGTH = 0.1; // metres; stroke lengths are this times a power of two
// far away, fewer and bigger marks (see farGrow in the vertex shader); ?fargrow=near,far,k to try others
const FAR_GROW = (new URLSearchParams(globalThis.location?.search ?? '').get('fargrow')?.split(',').map(Number) ?? [5, 18, 2.2]);
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

// alpha 1 + k: the point is on something that comes and goes, number k (see `ownStrokes` in bake)
const positionMaterial = (tag = 1) => new THREE.ShaderMaterial({
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
void main() { gl_FragColor = vec4(vW, ${tag.toFixed(1)}); }`,
  side: THREE.DoubleSide,
});

// the id picture: R the object's number, G which of its pieces (strokeEach), as set per draw in bake
const idMaterial = () => new THREE.ShaderMaterial({
  uniforms: { oid: { value: 0 }, each: { value: 0 } },
  vertexShader: /* glsl */ `
varying float vPiece;
void main() {
  vec4 p = vec4(position, 1.0);
  vPiece = 0.0;
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
  vPiece = float(gl_InstanceID);
#endif
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * p;
}`,
  fragmentShader: /* glsl */ `
uniform float oid;
uniform float each;
varying float vPiece;
void main() { gl_FragColor = vec4(oid, each > 0.5 ? floor(vPiece + 0.5) : 0.0, 0.0, 1.0); }`,
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
  // aCol: the paint of the object under it (rgb, linear) and how it is lit: 1 by the lights, 0 it glows by
  // itself (lamps, windows), -1 a crisp thing that is never painted over (covers, labels); plus 10 x k when it
  // is on station furniture number k (ownStrokes), which a rack replaces. Oil paint (oilpaint.js)
  // colours its strokes from this; the other looks read the rendered picture instead.
  const buffers = { aPos: attr('aPos'), aTan: attr('aTan'), aNor: attr('aNor'), aShape: attr('aShape'), aCol: attr('aCol') };
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
// how far apart two paints are (sqrt of linear rgb) before a stroke stops where one meets the other
const PAINT_STEP = 0.14;
const RAY_DIRS = Array.from({ length: RAYS }, (_, k) => [Math.cos((k / RAYS) * Math.PI * 2), Math.sin((k / RAYS) * Math.PI * 2)]);
const flatTol = (d) => 0.015 + 0.006 * d;

const FACES = (n) => (Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? 0 : 1) : Math.abs(n.y) > Math.abs(n.z) ? (n.y > 0 ? 2 : 3) : (n.z > 0 ? 4 : 5));

// A fingerprint of what a bake would see: every solid, drawn mesh (its geometry's size, where it is, its
// instances), the views, and how strokes are laid out. The stroke cache keeps a bake under it, so a
// change to the street, the shop or this file's settings bakes again instead of reusing old strokes.
const CACHE_VERSION = 5; // bump when `place` changes in a way the numbers below do not show
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
  add(BAKE_W); add(BAKE_H); add(BAKE_STRIDE); add(FARTHEST); add(PAINT_STEP);
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
    farGrow: { value: new THREE.Vector3(...FAR_GROW) },
    fovea: { value: new THREE.Vector3(0.5, 0.5, 0) },
    // the thing that turns (STROKE_FRAME): its frame -> world and back, now, and its box (half, y0, y1)
    turnM: { value: new THREE.Matrix4() },
    turnInv: { value: new THREE.Matrix4() },
    turnBox: { value: new THREE.Vector3() },
    turnOn: { value: 0 },
  };
  let turner = null;
  const shownAll = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  // finds the thing that turns in a world (there is one at most)
  function watch(world) {
    let found = null;
    world.traverse((o) => { if (o.userData.strokeTurn) found = o; });
    if (found) turner = found;
    return turner;
  }
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
  // in the turning thing's own frame (STROKE_FRAME)
  const toLocal = new THREE.Matrix4(), pl = new THREE.Vector3(), nl = new THREE.Vector3(), handL = new THREE.Vector3(), acrossL = new THREE.Vector3(), cl = new THREE.Vector3(), tl = new THREE.Vector3();
  // onlyTurning: just the places on the thing that turns (it has been turned for this look)
  const place = (cam, data, albedo, glow, ids, onlyTurning = false) => {
    const box = turner?.userData.strokeTurn;
    if (box) toLocal.copy(turner.matrixWorld).invert();
    const at = (x, y, out) => { if (x < 0 || y < 0 || x >= BAKE_W || y >= BAKE_H) return null; const i = (y * BAKE_W + x) * 4; if (!data[i + 3]) return null; return out.set(data[i], data[i + 1], data[i + 2]); };
    // which object (and, for things painted piece by piece, which piece) is drawn at a pixel
    const idAt = (x, y) => { const i = (y * BAKE_W + x) * 4; return ids[i] * 65536 + ids[i + 1]; };
    const eye = cam.getWorldPosition(new THREE.Vector3());
    for (let y = 0; y < BAKE_H - 2 * BAKE_STRIDE; y += BAKE_STRIDE) {
      for (let x = 0; x < BAKE_W - 2 * BAKE_STRIDE; x += BAKE_STRIDE) {
        const px = x + Math.floor(r() * BAKE_STRIDE), py = y + Math.floor(r() * BAKE_STRIDE);
        if (!at(px, py, p) || !at(px + BAKE_STRIDE, py, a) || !at(px, py + BAKE_STRIDE, b)) continue;
        // on furniture that a rack replaces: its strokes get places of their own, so the wall close behind
        // it (in the same row of places) still gets its coat once the furniture is gone
        const ownK = Math.max(0, Math.round(data[(py * BAKE_W + px) * 4 + 3] - 1)), own = ownK > 0 ? 1 : 0;
        const d = toEye.subVectors(eye, p).length();
        if (d > FARTHEST) continue;
        // On the thing that turns: its places are laid out in its own frame, and kept there, so they go round
        // with it and a later bake from another angle finds them taken.
        const turning = !!box && inTurnBox(pl.copy(p).applyMatrix4(toLocal), box);
        if (onlyTurning && !turning) continue;
        const id = idAt(px, py);
        const mine = (x, y) => x >= 0 && y >= 0 && x < BAKE_W && y < BAKE_H && idAt(x, y) === id;
        // ...and still its paint: a row of record spines or a striped box is many colours on one flat face, and a
        // painter lays each colour as strokes of its own (the faint world blotches in every paint stay under this)
        const j0 = (py * BAKE_W + px) * 4;
        const s0 = Math.sqrt(albedo[j0]), s1 = Math.sqrt(albedo[j0 + 1]), s2 = Math.sqrt(albedo[j0 + 2]);
        const samePaint = (x, y) => {
          const q = (y * BAKE_W + x) * 4;
          return Math.hypot(Math.sqrt(albedo[q]) - s0, Math.sqrt(albedo[q + 1]) - s1, Math.sqrt(albedo[q + 2]) - s2) < PAINT_STEP;
        };
        // the normal, from as wide a patch as is still flat, so a long stroke lies true on bricks
        const tol = flatTol(d);
        let normalOk = false;
        for (const k of [8, 3, 1]) {
          if (!at(px + k, py, a) || !at(px - k, py, c) || !at(px, py + k, b) || !at(px, py - k, e)) continue;
          if (!mine(px + k, py) || !mine(px - k, py) || !mine(px, py + k) || !mine(px, py - k)) continue;
          if (mid.addVectors(a, c).multiplyScalar(0.5).distanceTo(p) > tol || mid.addVectors(b, e).multiplyScalar(0.5).distanceTo(p) > tol) continue;
          n.crossVectors(a.sub(c), b.sub(e));
          if (n.lengthSq() < 1e-12) continue;
          normalOk = true;
          break;
        }
        if (!normalOk) continue; // on an edge
        n.normalize();
        if (n.dot(toEye) < 0) n.negate();
        if (turning && n.dot(toEye) < TURN_FACING * d) continue;
        handDirection(n, hand);
        across.crossVectors(n, hand);
        if (turning) {
          nl.copy(n).transformDirection(toLocal);
          handDirection(nl, handL);
          acrossL.crossVectors(nl, handL);
        }
        const kp = turning ? pl : p, kn = turning ? nl : n, kh = turning ? handL : hand, ka = turning ? acrossL : across;
        let measured = false, longest = 0, crossSpan = 0;
        for (const part of layers) {
          const { layer, buffers, taken } = part;
          if (part.count >= layer.cap) continue;
          const octave = Math.min(MAX_OCTAVE, Math.max(0, Math.round(Math.log2((layer.reach * d) / BASE_LENGTH))));
          const len = BASE_LENGTH * 2 ** octave;
          // one stroke per place in the rows on this surface. Each row starts somewhere of its own: evenly
          // staggered rows line their stroke ends up into a false second diagonal, a zigzag.
          const rowH = len * layer.rowGap;
          const row = Math.floor(kp.dot(ka) / rowH);
          const col = Math.floor(kp.dot(kh) / (len * layer.colGap) + ((row * 0.618) % 1 + 1) % 1);
          const depth = Math.floor(kp.dot(kn) / Math.max(0.15, rowH));
          const key = (row + 16384) * 2 ** 33 + (col + 16384) * 2 ** 18 + (depth + 2048) * 2 ** 6 + octave * 8 + FACES(kn) + own * 2 ** 51 + (turning ? 2 ** 52 : 0);
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
                // on the plane: still this object, or the next one lying flush with it (a row of spines,
                // two boards butted together) or another colour on it, where a stroke laid one by one would stop
                if (Math.abs(a.dot(n)) <= tol) { if (!mine(ix, iy) || !samePaint(ix, iy)) break; end.copy(a); continue; }
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
          const cu = slide(al - wander, ah - wander, fitted) + wander, cv = slide(sl, sh, wid);
          centre.copy(p).addScaledVector(t, cu).addScaledVector(side, cv);
          // the room the shape leaves round that centre, along and across: a fatter dab (oilpaint.js) never
          // grows past it
          const roomU = Math.max(fitted, 2 * Math.min(cu - al, ah - cu)), roomV = Math.max(wid, 2 * Math.min(cv - sl, sh - cv));
          const i = part.count++;
          const cw = turning ? cl.copy(centre).applyMatrix4(toLocal) : centre, tw = turning ? tl.copy(t).transformDirection(toLocal) : t;
          buffers.aPos.setXYZW(i, cw.x, cw.y, cw.z, len);
          buffers.aShape.setXYZW(i, fitted, wid, roomU, roomV);
          buffers.aTan.setXYZW(i, tw.x, tw.y, tw.z, r());
          buffers.aNor.setXYZW(i, kn.x, kn.y, kn.z, r());
          const j = (py * BAKE_W + px) * 4;
          const lit = albedo[j + 3] < 0.5 ? -1 : (glow[j] + glow[j + 1] + glow[j + 2]) > 0.3 * (albedo[j] + albedo[j + 1] + albedo[j + 2]) + 0.01 ? 0 : 1;
          // (w: how it is lit, plus 10 x the number of the furniture it is on, if any, plus TURN_TAG on the thing
          // that turns)
          const tag = 10 * ownK + (turning ? TURN_TAG : 0);
          if (lit === 0) buffers.aCol.setXYZW(i, glow[j], glow[j + 1], glow[j + 2], tag);
          else buffers.aCol.setXYZW(i, Math.max(0, albedo[j] - glow[j]), Math.max(0, albedo[j + 1] - glow[j + 1]), Math.max(0, albedo[j + 2] - glow[j + 2]), lit + tag);
        }
      }
    }
  };

  // views: [{ pos, target, fov }]. Adds strokes for whatever those views can see that has none yet.
  function bake(world, views) {
    const rt = new THREE.WebGLRenderTarget(BAKE_W, BAKE_H, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const mat = positionMaterial();
    // things that come and go (station furniture, userData.ownStrokes = k, a number from 1): drawn again over
    // the positions, alpha 1 + k where they are in front, so their strokes know which one they belong to and
    // can go when it goes (oilpaint.js). (Each listed in a scene of its own without being moved: the renderer
    // only walks `children` and reads the world matrices they already have.)
    const ownScene = new THREE.Scene();
    ownScene.matrixWorldAutoUpdate = false;
    world.updateMatrixWorld();
    watch(world);
    const owners = [];
    world.traverseVisible((o) => { if (o.userData.ownStrokes) owners.push([o, positionMaterial(1 + Math.min(8, Number(o.userData.ownStrokes) || 1))]); });
    const cam = new THREE.PerspectiveCamera(70, BAKE_W / BAKE_H, 0.1, 200);
    const data = new Float32Array(BAKE_W * BAKE_H * 4);
    const albedo = new Float32Array(BAKE_W * BAKE_H * 4), glow = new Float32Array(BAKE_W * BAKE_H * 4), ids = new Float32Array(BAKE_W * BAKE_H * 4);
    // Every object gets a number of its own for the id picture (and every piece of one marked strokeEach: the
    // instanced filler records, each a spine of its own), so a stroke is fitted to one object, not to a row of
    // them that happens to lie flat. Set as three draws each one (onBeforeRender sees the override material).
    const idMat = idMaterial();
    let nextId = 1;
    const tagged = [];
    world.traverse((o) => {
      if (!o.isMesh) return;
      const id = nextId++, each = o.userData.strokeEach ? 1 : 0, before = o.onBeforeRender;
      tagged.push([o, before]);
      o.onBeforeRender = function (rr, s, c, g, m, grp) {
        if (m === idMat) { m.uniforms.oid.value = id; m.uniforms.each.value = each; m.uniformsNeedUpdate = true; }
        before.call(this, rr, s, c, g, m, grp);
      };
    });
    // The paint each object is: the world drawn as it is, but lit only by an even white sky of strength pi (a
    // lit material then shows exactly its own colour) and with no fog; once more with no light at all, which
    // leaves what glows by itself. Lights are turned down, not off, so no shader has to be built again.
    const lights = [];
    world.traverse((o) => { if (o.isLight) lights.push([o, o.intensity, o.isHemisphereLight ? [o.color.clone(), o.groundColor.clone()] : null]); });
    const fog = world.fog && 'near' in world.fog ? [world.fog.near, world.fog.far] : null;
    const evenLight = (k) => {
      for (const [l, , hemi] of lights) {
        if (hemi) { l.color.set(0xffffff); l.groundColor.set(0xffffff); l.intensity = Math.PI * k; } else l.intensity = 0;
      }
    };
    // only solid, drawn meshes: glows, lines and glass have no surface to paint on
    const hidden = [];
    world.traverse((o) => {
      if (!o.visible) return;
      // records, which move: painted as drawn, never stroked (a stroke left in the air when one lifts)
      if (o.userData.noStrokes) { hidden.push(o); o.visible = false; return; }
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
    const shoot = (v, onlyTurning) => {
      cam.fov = v.fov ?? 70;
      cam.updateProjectionMatrix();
      cam.position.copy(v.pos);
      cam.lookAt(v.target);
      cam.updateMatrixWorld();
      renderer.render(world, cam);
      if (owners.length) {
        renderer.autoClear = false;
        for (const [o, m] of owners) {
          ownScene.children[0] = o;
          ownScene.overrideMaterial = m;
          renderer.render(ownScene, cam); // same depth as in the first draw, so it passes (LessEqual) where it is in front
        }
        renderer.autoClear = true;
      }
      renderer.readRenderTargetPixels(rt, 0, 0, BAKE_W, BAKE_H, data);
      world.overrideMaterial = idMat;
      renderer.render(world, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, BAKE_W, BAKE_H, ids);
      world.overrideMaterial = null;
      if (fog) { world.fog.near = 1e5; world.fog.far = 1e6; }
      evenLight(1);
      renderer.render(world, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, BAKE_W, BAKE_H, albedo);
      evenLight(0);
      renderer.render(world, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, BAKE_W, BAKE_H, glow);
      for (const [l, k, hemi] of lights) { l.intensity = k; if (hemi) { l.color.copy(hemi[0]); l.groundColor.copy(hemi[1]); } }
      if (fog) [world.fog.near, world.fog.far] = fog;
      world.overrideMaterial = mat;
      place(cam, data, albedo, glow, ids, onlyTurning);
    };
    for (const v of views) shoot(v, false);
    // The thing that turns (STROKE_FRAME) shows its other sides only once it has turned: it is turned a quarter
    // at a time (for this bake only) and painted again from the views that see it, so every side is painted
    // from nearly square on, as the side you see first was.
    if (turner?.userData.strokeTurn && shownAll(turner)) {
      const base = turner.rotation.y, frustum = new THREE.Frustum(), mid = turner.getWorldPosition(new THREE.Vector3());
      const sees = (v) => {
        cam.fov = v.fov ?? 70; cam.updateProjectionMatrix(); cam.position.copy(v.pos); cam.lookAt(v.target); cam.updateMatrixWorld();
        return frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)).containsPoint(mid);
      };
      const seeing = views.filter(sees);
      if (seeing.length) {
        for (let k = 1; k < 4; k++) {
          turner.rotation.y = base + (k * Math.PI) / 2;
          world.updateMatrixWorld();
          for (const v of seeing) shoot(v, true);
        }
        turner.rotation.y = base;
        world.updateMatrixWorld();
      }
    }
    renderer.setRenderTarget(prev.target);
    renderer.setClearColor(prev.clear, prev.alpha);
    renderer.autoClear = prev.autoClear;
    renderer.shadowMap.needsUpdate = prev.shadows;
    world.background = prev.bg;
    world.overrideMaterial = prev.over;
    for (const o of hidden) o.visible = true;
    for (const [o, before] of tagged) o.onBeforeRender = before;
    idMat.dispose();
    rt.dispose();
    mat.dispose();
    for (const [, m] of owners) m.dispose();
    ownScene.children.length = 0;
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
    // for oil paint (oilpaint.js): the same placed strokes, drawn its own way
    parts: layers.map((part) => ({ geo: part.geo, layer: part.layer })),
    shared,
    bake,
    save,
    load,
    // the thing that turns: found in a world (bake does it too), or given
    watch,
    setTurner(o) { if (o) turner = o; },
    get counts() { return layers.map((l) => l.count); },
    get caps() { return layers.map((l) => l.buffers.aPos.count); },
    setSize(w, h) {
      shared.aspect.value = w / h;
      shared.lodShift.value = Math.log2(Math.max(1, h) / 720);
    },
    setPan(x, y) { shared.pan.value.set(x, y); },
    setFovea(v) { shared.fovea.value.copy(v); },
    setCamera(camera) {
      const on = !!turner && shownAll(turner);
      shared.turnOn.value = on ? 1 : 0;
      if (on) {
        const b = turner.userData.strokeTurn;
        shared.turnM.value.copy(turner.matrixWorld);
        shared.turnInv.value.copy(turner.matrixWorld).invert();
        shared.turnBox.value.set(b.half, b.y0, b.y1);
      }
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
