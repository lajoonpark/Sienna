// Oil paint (Settings > Painting > Oil paint): the shop painted in thick, opaque dabs of oil paint.
//
// The strokes are the brush-stroke look's (brushstrokes.js: same places, pinned to the world), but each one
// is loaded with its own paint instead of reading the rendered picture: the colour of the object under it,
// recorded when it was placed (aCol), lit right here by the shop's own lights (sky, sun with its shadow,
// the lamps that are on, fog) the same way the toon materials light themselves. So one dab is one decisive
// colour that never swims as the camera moves, and the wash passes are not needed at all.
// Each dab stands up off the canvas: the brush sheet holds a height, and the room's light, from the upper
// left of the canvas, rakes across its ridges (after blendi's oil-paint demo, MIT: patch.gg/blendi/oil-paint).
//
// Wherever the placed dabs leave canvas showing (they are capped in size, and none are placed on mortar lines,
// thin edges or rails), an under-coat of smaller dabs, worked out per pixel on the surface's own plane, fills
// it (UNDER). What moves (records and their discs) has neither and shows the scene as drawn; crisp things
// (covers, labels) and the suitcase overlay always do.
//
//   const oil = createOilPaint(renderer, strokes, sceneTarget)   // strokes = createBrushStrokes(...)
//   oil.render(world, camera)       // dabs into oil.texture (premultiplied, linear)
//   oil.finalMaterial(uniforms)     // the last pass, sharing the painter's uniforms
import * as THREE from 'three';

const params = new URLSearchParams(globalThis.location?.search ?? '');
// dabs are drawn at this many drawing-buffer px per CSS px (1 = one per CSS px); ?oilscale= to try others
const OIL_SCALE = Number(params.get('oilscale')) || 1;
// how much fatter and shorter a dab is than the stroke placed there (oil is laid in short, loaded dabs)
const OIL_SHAPE = (params.get('oilshape')?.split(',').map(Number)) ?? [2.2, 1.0];
// how strongly the ridges catch the light
const IMPASTO = Number(params.get('impasto') ?? 1.3);
// how much of its quad a dab fills across (the rest is room for its ragged sides and the hand's waver)
const DAB_WIDTH = Number(params.get('dabwidth')) || 0.62;
// which of the placed layers (coat, medium, fine) are painted; ?oillayers=1,1,0 to leave the fine one out
const OIL_LAYERS = params.get('oillayers')?.split(',').map(Number) ?? [1, 1, 0];
// the biggest a dab may be on screen, across and along (shares of its height); ?oilmax=0.05,0.12
const MAX_SIZE = params.get('oilmax')?.split(',').map(Number) ?? [0.045, 0.11];
// the share of each layer's strokes painted (coat, medium, fine); ?oilkeep=0.5,0.7,1
const OIL_KEEP = params.get('oilkeep')?.split(',').map(Number) ?? [0.55, 0.7, 1];
// A stroke's patch can be laid as up to this many dabs along and across (a dab is capped by MAX_SIZE, the patch
// is not), STEP apart (shares of a dab's length and width: its paint fills about 0.8 of its quad along and
// 0.6 across, so these overlap). Off (1 x 1) by default: the strokes overlap so much (each spot lies under
// ~20 of them, placed from views at other distances) that filling every patch doubled the frame and still
// left the edges, mortar and rails bare; the under-coat (UNDER) fills the canvas they leave instead.
// ?oilsub=4,3  ?oilstep=0.6,0.5  (and ROW_SPAN, below)
const [SUB_ALONG, SUB_ACROSS] = params.get('oilsub')?.split(',').map(Number) ?? [1, 1];
const STEP = params.get('oilstep')?.split(',').map(Number) ?? [0.6, 0.5];
// The under-coat: wherever the placed strokes leave canvas showing (mortar lines, the edges of boards, rails,
// the street through the door), dabs pinned to the surface itself, worked out per pixel from where it is in
// the world: a grid of dabs laid on the surface's plane, about this big on screen (share of its height),
// each one colour (the scene where its middle lies) with the paint's ridges. The placed dabs go over it.
// ?under=0.035 (size), ?under=0 for none
const UNDER = params.get('under') === '0' ? new THREE.Vector2(0.035, 0) : new THREE.Vector2(Number(params.get('under')) || 0.035, 1);
// Dabs are depth tested against the scene (its depth, brought down to the dabs' size), pulled this far toward
// the eye (metres, plus a share of the distance) so a dab on its own face passes: the GPU then skips the
// parts of dabs hidden behind something before working them out. ?oilbias=0.02,0.004
const BIAS = params.get('oilbias')?.split(',').map(Number) ?? [0.02, 0.004];
// how much of its row a stroke's patch spans across (1 = rows just touch); ?oilrow=1.5
const ROW_SPAN = Number(params.get('oilrow')) || 1.5;
const MAX_POINTS = 8;
const ATLAS_COLS = 4, ATLAS_ROWS = 2;

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 + 1.7) * 0.15; }
`;

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// The brush sheet: 4 x 2 dabs, baked once. Each runs along u, from where the loaded brush lands (thick,
// a rounded end) to where it lifts off dry and breaks into bristle tracks. R height of the paint, G where
// there is paint, B the streak where the brush's second colour shows.
const atlasFragment = /* glsl */ `
varying vec2 vUv;
uniform float WIDTH;
${NOISE}
void main() {
  vec2 g = vUv * vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
  vec2 id = floor(g), f = fract(g);
  float seed = id.x * 7.3 + id.y * 13.1 + 1.0;
  float u = f.x, v = f.y * 2.0 - 1.0;
  // the hand wavers: the dab's middle line wanders a little, more toward its tail
  float centre = (fbm(vec2(u * 1.6, seed + 9.0)) - 0.5) * 0.25 * (0.4 + u);
  float x = v - centre;
  // width: full almost at once, a touch narrower as the paint runs out
  float w = WIDTH * (0.85 + 0.15 * sin(3.14159 * min(1.0, u * 1.1))) * (1.0 + (fbm(vec2(u * 6.0, seed + 2.0)) - 0.5) * 0.18);
  float start = 0.05 + 0.04 * noise(vec2(x * 4.0, seed + 3.0)) + 0.06 * x * x;   // a rounded, loaded start
  float end = 0.92 - 0.28 * fbm(vec2(x * 5.0 + 2.0, seed + 4.0));               // a dry, ragged end
  float ax = abs(x) + (noise(vec2(u * 30.0, x * 6.0 + seed)) - 0.5) * 0.06;      // a torn side
  float body = (1.0 - smoothstep(w - 0.06, w, ax)) * smoothstep(start, start + 0.03, u) * (1.0 - smoothstep(end - 0.02, end + 0.015, u));
  // bristle tracks run its length; toward the tail they open into gaps
  float tracks = noise(vec2(x * 22.0, u * 2.0 + seed)) * 0.65 + noise(vec2(x * 53.0, u * 3.0 + seed * 2.0)) * 0.35;
  float dry = smoothstep(end - 0.3, end, u);
  float paint = body * step(dry * 0.65, tracks + 0.05);
  // height: a ridge where the brush pushed paint to its sides, a heap where it landed, the tracks in between
  float ridge = smoothstep(w - 0.34, w - 0.07, ax);
  float heap = 1.0 - smoothstep(start, start + 0.22, u);
  float h = paint * (0.3 + 0.24 * tracks + 0.28 * ridge + 0.26 * heap + 0.08 * fbm(vec2(u * 5.0, x * 5.0 + seed)));
  float streak = fbm(vec2(x * 3.4 + seed, u * 1.2));
  gl_FragColor = vec4(min(h, 1.0), paint, streak, 1.0);
}
`;

// The sheet as the dabs read it, one look a pixel: R paint, G streak, B/A the slope of the paint along and across
// (x 2, about 0.5), read from the height a little blurred: the slope of the paint, not every bristle's edge,
// catches the light.
const slopeFragment = /* glsl */ `
uniform sampler2D tSheet;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(tSheet, vUv);
  vec2 e = vec2(1.5 / 1024.0, 0.0), e2 = vec2(0.0, 1.5 / 512.0);
  float hu = textureLod(tSheet, vUv + e, 1.0).r - textureLod(tSheet, vUv - e, 1.0).r;
  float hv = textureLod(tSheet, vUv + e2, 1.0).r - textureLod(tSheet, vUv - e2, 1.0).r;
  gl_FragColor = vec4(s.g, s.b, clamp(hu * 2.0 + 0.5, 0.0, 1.0), clamp(hv * 2.0 + 0.5, 0.0, 1.0));
}
`;

// How the shop's lights fall on a point: the toon materials' own light (three's toon model with the shop's
// three-step gradient), so a dab is the colour its object would be drawn there, only as one even tone.
const LIGHT = /* glsl */ `
uniform vec3 hemiSky;        // colour x intensity
uniform vec3 hemiGround;
uniform vec3 hemiUp;
uniform vec3 sunDir;         // toward the sun
uniform vec3 sunCol;         // 0 when the sun is off
uniform mat4 sunMatrix;      // world -> its shadow map
uniform sampler2DShadow tSunShadow;
uniform vec3 sunShadow;      // on, bias, normal bias
uniform vec4 pointPos[${MAX_POINTS}];  // xyz, cutoff distance
uniform vec4 pointCol[${MAX_POINTS}];  // colour x intensity, decay
uniform int points;
uniform vec3 fogColor;
uniform vec2 fogRange;       // near, far (far 0 = no fog)
// three's toon gradient: the shop's three steps (textures.js toonGradient(3, 120))
float toonStep(float nl) {
  float x = nl * 0.5 + 0.5;
  return x < 1.0 / 3.0 ? 120.0 / 255.0 : x < 2.0 / 3.0 ? 187.5 / 255.0 : 1.0;
}
float sunShade(vec3 P, vec3 N) {
  if (sunShadow.x < 0.5) return 1.0;
  vec4 c = sunMatrix * vec4(P + N * sunShadow.z, 1.0);
  c.xyz /= c.w;
  c.z += sunShadow.y;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  // one look (the map filters it over 2 x 2 texels): a dab is in the sun or in the shade
  return texture(tSunShadow, c.xyz);
}
// irradiance at P (facing N), ready to multiply a colour by (the 1/pi of a lambert surface is in it)
vec3 shopLight(vec3 P, vec3 N) {
  vec3 e = mix(hemiGround, hemiSky, dot(N, hemiUp) * 0.5 + 0.5);
  if (dot(sunCol, sunCol) > 0.0) e += sunCol * toonStep(dot(N, sunDir)) * sunShade(P, N);
  for (int i = 0; i < ${MAX_POINTS}; i++) {
    if (i >= points) break;
    vec3 d = pointPos[i].xyz - P;
    float dist = length(d);
    float k = 1.0 / max(pow(dist, pointCol[i].w), 0.01);
    if (pointPos[i].w > 0.0) { float q = clamp(1.0 - pow(dist / pointPos[i].w, 4.0), 0.0, 1.0); k *= q * q; }
    e += pointCol[i].rgb * k * toonStep(dot(N, d / max(dist, 1e-4)));
  }
  return e / 3.14159265;
}
`;

const dabVertex = /* glsl */ `
attribute vec4 aPos;         // world position, stroke length in metres
attribute vec4 aTan;         // direction along the surface, random
attribute vec4 aNor;         // surface normal, random
attribute vec4 aShape;       // length and width fitted to the shape it sits on, and the room the shape leaves there (metres)
attribute vec4 aCol;         // its object's paint, and how it is lit (1 lights, 0 glows, -1 never painted)
attribute float sub;         // which of the stroke's dabs this quad is (SUB_ALONG along x SUB_ACROSS across)
uniform sampler2D tDepth;
uniform mat4 viewProj;
uniform vec3 eye;
uniform vec2 clipRange;
uniform float heightAt1m;
uniform float aspect;
uniform vec2 window;
uniform vec3 farGrow;
uniform vec2 shape;          // OIL_SHAPE: wider, shorter
uniform int hiddenOwn;        // bit k: station furniture k is hidden (a rack stands there)
uniform float keep;          // the share of this layer's strokes painted as dabs
uniform vec2 maxSize;        // the most a dab may be across and along, in shares of the screen's height
uniform float rowGap;        // this layer's rows on a surface, apart (shares of the stroke's length)
const float ROW_SPAN = ${ROW_SPAN.toFixed(3)};
const vec2 BIAS = vec2(${BIAS[0].toFixed(4)}, ${BIAS[1].toFixed(4)});
const float STEP_ALONG = ${STEP[0].toFixed(3)}, STEP_ACROSS = ${STEP[1].toFixed(3)};
varying vec2 vAtlas;
varying vec3 vC1;
varying vec3 vC2;
varying vec4 vAxis;
varying float vDepth;
varying float vPlane;        // how far its plane is from the eye, along its normal
${LIGHT}
float sceneDepth(vec2 uv) {
  float z = textureLod(tDepth, uv, 0.0).x * 2.0 - 1.0;
  return (2.0 * clipRange.x * clipRange.y) / (clipRange.y + clipRange.x - z * (clipRange.y - clipRange.x));
}
void main() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vAtlas = vec2(0.0); vC1 = vC2 = vec3(0.0); vAxis = vec4(0.0); vDepth = 0.0; vPlane = 0.0;
  // how it is lit (aCol.w = lit + 10 x the station furniture it is on)
  float ownK = floor((aCol.a + 1.5) / 10.0);
  float lit = aCol.a - 10.0 * ownK;
  if (lit < -0.5) return;
  // on furniture a rack has replaced: gone with it (else it floats on the rack)
  if (ownK > 0.5 && ((hiddenOwn >> int(ownK)) & 1) == 1) return;
  // oil dabs are fatter than the strokes placed for them: fewer are needed to cover (and each costs)
  if (fract(aTan.w * 13.7 + aNor.w * 3.3) > keep) return;
  vec4 clipA = viewProj * vec4(aPos.xyz, 1.0);
  if (clipA.w < 0.15) return;
  vec2 a = clipA.xy / clipA.w * 0.5 + 0.5;
  if (a.x < -0.5 || a.x > 1.5 || a.y < -0.5 || a.y > 1.5) return;
  if (dot(aNor.xyz, eye - aPos.xyz) <= 0.0) return;
  float onScreen = aPos.w / (clipA.w * heightAt1m);
  float minSize = window.x * mix(1.0, farGrow.z, smoothstep(farGrow.x, farGrow.y, clipA.w));
  // a dab too small or too big on screen for this layer is not faded (oil does not go thin): it shrinks away
  float grow = smoothstep(minSize * 0.6, minSize, onScreen) * (1.0 - smoothstep(window.y, window.y * 1.5, onScreen));
  if (grow <= 0.02) return;
  grow = sqrt(grow);

  // The patch of surface this stroke answers for: its fitted length along, its own row across (a little more,
  // so the rows meet), never past the edges of the thing it is on (the room its face leaves round it,
  // measured when it was placed).
  float r1 = aNor.w, r2 = fract(aNor.w * 7.13);
  float patchL = min(aShape.x * shape.y * (0.92 + 0.16 * r1), aShape.z) * grow;
  float patchW = min(min(aShape.y * shape.x, max(aPos.w * rowGap * ROW_SPAN, aShape.y)), aShape.w) * grow;
  // A dab is never bigger on the canvas than a brush that size could lay (far walls get broad dabs, not
  // smears), and no wider than most of its length. So the patch is laid as a few dabs side by side and end to
  // end, as many as it takes to leave no canvas showing, each overlapping the last.
  float px = clipA.w * heightAt1m;
  float dl = min(patchL, maxSize.y * px), dw = min(min(patchW, maxSize.x * px), dl * 0.75);
  float nA = clamp(ceil((patchL - dl) / (dl * STEP_ALONG) - 0.05) + 1.0, 1.0, ${SUB_ALONG}.0);
  float nC = clamp(ceil((patchW - dw) / (dw * STEP_ACROSS) - 0.05) + 1.0, 1.0, ${SUB_ACROSS}.0);
  // (more than that is too many: the few there are grow until they meet)
  if (${SUB_ALONG * SUB_ACROSS} > 1) {
    dl = max(dl, patchL / (1.0 + STEP_ALONG * (nA - 1.0)));
    dw = max(dw, patchW / (1.0 + STEP_ACROSS * (nC - 1.0)));
  }
  float si = mod(sub, ${SUB_ALONG}.0), sj = floor(sub / ${SUB_ALONG}.0);
  if (si >= nA || sj >= nC) return;
  // this dab's own hand: where in the patch, a little off true, its own load and its own brush
  float h1 = fract(sin(sub * 12.9898 + aTan.w * 78.233) * 43758.5453), h2 = fract(h1 * 9.31 + aNor.w), h3 = fract(h1 * 4.77 + aTan.w * 3.1);
  float ou = nA > 1.0 ? (si / (nA - 1.0) - 0.5) * (patchL - dl) + (h2 - 0.5) * 0.18 * dl : 0.0;
  float ov = nC > 1.0 ? (sj / (nC - 1.0) - 0.5) * (patchW - dw) + (h3 - 0.5) * 0.14 * dw : 0.0;
  vec3 side0 = cross(aNor.xyz, aTan.xyz);
  vec3 P = aPos.xyz + aTan.xyz * ou + side0 * ov;
  float turn = (h1 - 0.5) * 0.22;
  vec3 tanD = aTan.xyz * cos(turn) + side0 * sin(turn);
  float r3 = fract(aTan.w * 5.37 + h2), r4 = fract(aTan.w * 11.9 + h3);
  // hidden here (behind something in front): no dab. Looked for at its own middle, so the dabs of a stroke
  // half behind a post still paint the half that shows
  vec4 clipP = viewProj * vec4(P, 1.0);
  if (clipP.w < 0.15) return;
  vec2 ua = clamp(clipP.xy / clipP.w * 0.5 + 0.5, 0.0, 1.0);
  float bias = 0.05 + 0.012 * clipP.w;
  float seen = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i < 2 ? -0.006 : 0.006, (i == 0 || i == 2) ? -0.009 : 0.009);
    seen += step(clipP.w - bias, sceneDepth(clamp(ua + o, 0.0, 1.0))) * 0.25;
  }
  if (seen < 0.25) return;
  float len = dl * (0.92 + 0.16 * h3), wid = dw * (0.9 + 0.2 * h2);
  float bend = (fract(aNor.w * 11.3 + h1) - 0.5) * 0.5;
  vec2 lp = vec2(position.x, position.y + bend * (position.x * position.x - 0.15));
  vec3 side = cross(aNor.xyz, tanD);
  // (in its plane exactly: dabs are not depth tested, the fragment shader keeps them to their face)
  vec3 world = P + tanD * lp.x * len + side * lp.y * wid;
  gl_Position = viewProj * vec4(world, 1.0);
  vDepth = gl_Position.w;
  // tested against the scene's depth a little nearer than it lies (BIAS): its own face never hides it
  vec3 toEye = eye - world;
  vec4 nearer = viewProj * vec4(world + toEye * min(0.5, (BIAS.x + BIAS.y * vDepth) / max(length(toEye), 1e-3)), 1.0);
  gl_Position.z = nearer.z / nearer.w * gl_Position.w;
  vPlane = abs(dot(aPos.xyz - eye, aNor.xyz));

  // its paint, lit where it lies
  vec3 c = lit > 0.5 ? aCol.rgb * shopLight(P, aNor.xyz) : aCol.rgb;
  if (fogRange.y > 0.0) c = mix(c, fogColor, smoothstep(fogRange.x, fogRange.y, clipP.w));
  // no two loads alike: a little lighter or darker, leaning warm or cool, as if the brush was not rinsed
  c *= (0.9 + 0.2 * r3) * mix(vec3(1.05, 1.0, 0.93), vec3(0.94, 1.0, 1.07), r4);
  vC1 = c;
  // the second colour streaked into it: a lighter, warmer note or a deeper, cooler one
  vC2 = r2 > 0.5 ? c * vec3(1.16, 1.1, 1.0) + 0.012 : c * vec3(0.8, 0.84, 0.92);

  // which way it runs on the canvas, for the light raking across its ridges
  vec4 clipB = viewProj * vec4(P + tanD * len * 0.5, 1.0);
  vec2 along = (clipB.xy / clipB.w - clipP.xy / clipP.w) * vec2(aspect, 1.0);
  along = dot(along, along) > 1e-10 ? normalize(along) : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float flip = fract(aTan.w * 3.1 + h2) > 0.5 ? -1.0 : 1.0;
  vAxis = vec4(along, across * flip);
  float cell = floor(fract(aTan.w + h1) * 97.0);
  vec2 id = vec2(mod(cell, ${ATLAS_COLS}.0), mod(floor(cell / ${ATLAS_COLS}.0), ${ATLAS_ROWS}.0));
  vec2 q = vec2(uv.x, flip > 0.0 ? uv.y : 1.0 - uv.y);
  vAtlas = (id + q) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
}
`;

const dabFragment = /* glsl */ `
uniform sampler2D tAtlas;
uniform sampler2D tDepth;
uniform sampler2D tScene;     // the scene as drawn (linear)
uniform vec2 clipRange;
uniform vec2 screen;         // size of the target the dabs are drawn into
uniform float impasto;
uniform vec2 agree;          // for checks (scripts/oil-cover-check.mjs): x 0 = no plane cut, y 0 = no colour check
varying vec2 vAtlas;
varying vec3 vC1;
varying vec3 vC2;
varying vec4 vAxis;
varying float vDepth;
varying float vPlane;
float sceneDepth(vec2 uv) {
  float z = textureLod(tDepth, uv, 0.0).x * 2.0 - 1.0;
  return (2.0 * clipRange.x * clipRange.y) / (clipRange.y + clipRange.x - z * (clipRange.y - clipRange.x));
}
void main() {
#ifdef COUNT
  // (scripts/oil-cover-check.mjs: how many dab fragments a pixel works out)
  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return;
#endif
  vec4 t = texture2D(tAtlas, vAtlas);   // paint, streak, slope along, slope across
  if (t.r < 0.3) discard;
  // Its own face only, to about a centimetre: what is drawn at this pixel must lie on the dab's plane (the
  // scene's point along this pixel's ray, measured square to the plane, not along the ray, which at a glancing
  // look let paint wrap round a corner or float over a gap). Past the edge of the face it stops.
  vec2 uv = gl_FragCoord.xy / screen;
  float off = vPlane * abs(sceneDepth(uv) / vDepth - 1.0);
  float tol = 0.006 + 0.0015 * vDepth;
  float own = agree.x < 0.5 ? 1.0 : 1.0 - smoothstep(tol, tol * 1.8, off);
  if (own <= 0.0) discard;
  // and only where the scene agrees it is this paint: a dab stops where something it does not know about
  // is drawn on its surface (a lit window, glass, a sign), as a careful hand paints round it
  vec3 there = sqrt(max(texture2D(tScene, uv).rgb, 0.0)), mine = sqrt(max(vC1, 0.0));
  if (agree.y > 0.5) own *= 1.0 - smoothstep(0.26, 0.4, length(there - mine));
  if (own <= 0.0) discard;
  // the paint stands up off the canvas, and the room's light, from the upper left, rakes across it
  vec2 g = vAxis.xy * (t.b - 0.5) * 0.5 + vAxis.zw * (t.a - 0.5) * 0.5;
  float rake = 0.5 * g.x - 0.7 * g.y;
  vec3 col = mix(vC1, vC2, smoothstep(0.52, 0.78, t.g));
  col *= 1.0 + rake * 2.5 * impasto;
  col += vec3(1.0, 0.97, 0.9) * pow(max(rake, 0.0), 2.0) * 1.6 * impasto * (0.3 + dot(col, vec3(0.3, 0.5, 0.2)));
  float a = smoothstep(0.3, 0.62, t.r) * own;
  gl_FragColor = vec4(max(col, 0.0), a);
}
`;

// The under-coat (see UNDER) and the scene's depth (see depthDown), in one pass.
const underFragment = /* glsl */ `
uniform sampler2D tDepth;
uniform sampler2D tScene;
uniform sampler2D tAtlas;
uniform vec2 texel;          // one paint-target pixel, in uv
uniform vec2 full;           // one scene pixel, in uv
uniform mat4 projInv;
uniform mat4 viewInv;
uniform mat4 viewProj;
uniform vec3 eye;
uniform float heightAt1m;
uniform float aspect;
uniform vec2 under;          // dab size (share of the screen's height), on (1) or off (0)
uniform float impasto;
varying vec2 vUv;
const float COLS = ${ATLAS_COLS}.0, ROWS = ${ATLAS_ROWS}.0;
// A dab's quad, in cells (the paint fills about 0.85 of it along, 0.6 across), and how far off its cell's
// middle it may sit: small enough that the painted part never reaches past the 2 x 2 cells nearest a pixel,
// so only those four are looked at.
const float LEN = 1.5, WID = 1.2, JITTER = 0.3;
vec3 worldAt(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  vec4 v = projInv * vec4(uv * 2.0 - 1.0, z, 1.0);
  return (viewInv * vec4(v.xyz / v.w, 1.0)).xyz;
}
// (hashes without sine: cheaper, and the same on every GPU)
float h21(vec2 p) { vec3 p3 = fract(p.xyx * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
void main() {
  // the depth, for the dabs' test
  vec2 o = texel * 0.25;
  gl_FragDepth = max(max(texture2D(tDepth, vUv + vec2(-o.x, -o.y)).x, texture2D(tDepth, vUv + vec2(o.x, -o.y)).x),
                     max(texture2D(tDepth, vUv + vec2(-o.x, o.y)).x, texture2D(tDepth, vUv + vec2(o.x, o.y)).x));
  gl_FragColor = vec4(0.0);
  if (under.y < 0.5) return;
  vec4 here = texture2D(tScene, vUv);
  float z0 = texture2D(tDepth, vUv).x;
  // the sky, crisp things (alpha 0) and things that move (alpha 0.99, materials.js unpinned): as drawn
  if (z0 >= 0.99999 || here.a < 0.995) return;
  // where this pixel is, and which way its surface faces (from the nearer neighbour each way, so an edge
  // does not bend it)
  vec3 P = worldAt(vUv);
  vec3 px1 = worldAt(vUv + vec2(full.x, 0.0)) - P, px0 = P - worldAt(vUv - vec2(full.x, 0.0));
  vec3 py1 = worldAt(vUv + vec2(0.0, full.y)) - P, py0 = P - worldAt(vUv - vec2(0.0, full.y));
  vec3 dx = dot(px1, px1) < dot(px0, px0) ? px1 : px0, dy = dot(py1, py1) < dot(py0, py0) ? py1 : py0;
  vec3 N = normalize(cross(dx, dy));
  float dist = length(P - eye);
  // the surface's grid: on the plane of the axis it faces most (so it holds still as the camera moves)
  vec3 an = abs(N);
  int ax = an.x > an.y && an.x > an.z ? 0 : an.y > an.z ? 1 : 2;
  vec3 U = ax == 0 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0), V = ax == 1 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 W = ax == 0 ? vec3(1.0, 0.0, 0.0) : ax == 1 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec2 q = vec2(dot(P, U), dot(P, V));
  // its cells: about UNDER of the screen's height wherever they are, a power of two in metres, so they only
  // ever halve or double (and then dab by dab, not all at once)
  float oct = log2(max(under.x * dist * heightAt1m, 1e-4) / 0.05);
  float o0 = floor(oct);
  float bestR = -1.0;
  vec4 bestT = vec4(0.0);
  vec2 bestC = vec2(0.0), bestA = vec2(1.0, 0.0);
  float bestS = 1.0;
  float fbOff = 1e9, fbS = 1.0;
  vec2 fbC = q, fbA = vec2(1.0, 0.0);
  for (int k = 0; k < 2; k++) {   // this octave and the next
    float ok = o0 + float(k), s = 0.05 * exp2(ok);
    // (the sheet's level for a dab this size on screen: no shimmer, no blur)
    float lod = max(0.0, log2(256.0 * dist * heightAt1m * texel.y / (s * LEN)));
    for (int layer = 0; layer < 2; layer++) {   // two grids, half a cell apart
      vec2 shift = layer == 1 ? vec2(0.5) : vec2(0.0);
      vec2 g = q / s + shift;
      vec2 base = floor(g - 0.5);
      for (int c = 0; c < 4; c++) {
        vec2 cell = base + vec2(float(c & 1), float(c >> 1));
        vec2 id = cell + vec2(float(layer) * 31.7 + ok * 7.1, float(ax) * 13.3);
        float r = h21(id + 5.3);
        if (r < bestR) continue;   // under one already found
        vec2 j = h22(id);
        vec2 cen = cell + 0.5 + (j - 0.5) * JITTER;
        // which way it runs: mostly one way per grid, as a hand lays them (no trig: a slope, normalised)
        vec2 al = normalize(vec2(1.0, (j.y - j.x) * 0.6 + (layer == 1 ? 0.5 : -0.35))), ac = vec2(-al.y, al.x);
        vec2 d = g - cen;
        float u = dot(d, al) / LEN + 0.5, v = dot(d, ac) / WID + 0.5;
        // (the nearest dab, in case none has paint here: its colour, without its ridges, fills the hole)
        vec2 qc = (cen - shift) * s;
        float off = max(abs(u - 0.5) * LEN, abs(v - 0.5) * WID);
        if (bestR < 0.0 && off < fbOff) { fbOff = off; fbC = qc; fbA = al; fbS = s; }
        if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) continue;
        // the octave where its middle is: it is there for the near half of that octave's dabs and the far half
        // of the next one's, so the cells halve and double dab by dab (log2 of a ratio this near 1, by series)
        vec3 C = P + U * (qc.x - q.x) + V * (qc.y - q.y);
        C -= W * dot(C - P, N) / max(abs(dot(W, N)), 0.3) * sign(dot(W, N));
        float x = length(C - eye) / dist - 1.0;
        float f = oct + 1.442695 * x * (1.0 - 0.5 * x) - ok;   // in [-1, 1) where it may be shown
        if (f >= 1.0 || f < -1.0) continue;
        float h = h21(id + 9.1);
        if (f >= 0.0 ? h < f : h >= 1.0 + f) continue;
        float cellA = floor(h21(id + 4.4) * 97.0);
        vec2 aid = vec2(mod(cellA, COLS), mod(floor(cellA / COLS), ROWS));
        vec4 t = textureLod(tAtlas, (aid + vec2(u, v)) / vec2(COLS, ROWS), lod);
        if (t.r < 0.3) continue;
        bestR = r; bestT = t; bestC = qc; bestA = al; bestS = s;
      }
    }
  }
  if (bestR < 0.0) { bestC = fbC; bestA = fbA; bestS = fbS; bestT = vec4(0.5); }
  // its colour: the scene where its middle lies, if that is this same surface (else this pixel's own)
  vec3 C = P + U * (bestC.x - q.x) + V * (bestC.y - q.y);
  C -= W * dot(C - P, N) / max(abs(dot(W, N)), 0.3) * sign(dot(W, N));
  vec4 cc = viewProj * vec4(C, 1.0);
  vec2 cuv = cc.xy / cc.w * 0.5 + 0.5;
  vec3 col = here.rgb;
  if (cc.w > 0.1 && cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0) {
    vec3 Q = worldAt(cuv);
    vec4 there = texture2D(tScene, cuv);
    if (abs(dot(Q - C, N)) < 0.01 + 0.004 * dist && there.a > 0.5) col = mix(here.rgb, there.rgb, 0.85);
  }
  float r3 = h21(bestC * 3.1), r4 = h21(bestC * 5.7 + 1.0);
  col *= (0.93 + 0.14 * r3) * mix(vec3(1.04, 1.0, 0.95), vec3(0.95, 1.0, 1.05), r4);
  vec3 col2 = r3 > 0.5 ? col * vec3(1.16, 1.1, 1.0) + 0.012 : col * vec3(0.8, 0.84, 0.92);
  // which way it runs on the screen, for the light raking across its ridges
  vec3 Dw = U * bestA.x + V * bestA.y;
  Dw -= N * dot(Dw, N);
  vec4 cb = viewProj * vec4(C + Dw * bestS * 0.5, 1.0);
  vec2 along = (cb.xy / cb.w - cc.xy / cc.w) * vec2(aspect, 1.0);
  along = dot(along, along) > 1e-10 ? normalize(along) : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  vec2 gr = along * (bestT.b - 0.5) * 0.5 + across * (bestT.a - 0.5) * 0.5;
  float rake = 0.5 * gr.x - 0.7 * gr.y;
  col = mix(col, col2, smoothstep(0.52, 0.78, bestT.g));
  col *= 1.0 + rake * 2.5 * impasto;
  col += vec3(1.0, 0.97, 0.9) * pow(max(rake, 0.0), 2.0) * 1.6 * impasto * (0.3 + dot(col, vec3(0.3, 0.5, 0.2)));
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

// The last pass: the dabs over the scene, to the screen.
const finalFragment = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tPaint;
uniform sampler2D tPaper;
uniform vec2 resolution;
uniform vec2 paperOffset;
uniform float overlayOn;
uniform float bars;
uniform vec3 grade;
uniform float vignette;
uniform float borderSeed;
varying vec2 vUv;
${NOISE}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  float aspect = resolution.x / resolution.y;
  vec4 base = texture2D(tScene, vUv);
  vec4 p = texture2D(tPaint, vUv);
  vec3 col = p.rgb + base.rgb * (1.0 - p.a);
  // crisp things (album art, labels: alpha 0) and the suitcase overlay are shown as drawn
  float keep = clamp(1.0 - base.a, 0.0, 1.0);
  if (overlayOn > 0.5) keep = max(keep, step(texture2D(tDepth, vUv).x, 0.99999));
  col = mix(col, base.rgb, keep);
  col = toSRGB(clamp(col, 0.0, 1.0));
  // the canvas: its weave shows faintly through the thinner paint and in the gaps
  vec2 cq = gl_FragCoord.xy + paperOffset * 512.0;
  float weave = (sin(cq.x * 1.9) * sin(cq.y * 1.9 + 1.3)) * 0.5 + 0.5;
  float tooth = texture2D(tPaper, gl_FragCoord.xy / 512.0 + paperOffset).r;
  col *= mix(0.965, 1.02, mix(tooth, weave, 0.35)) * mix(1.0, 0.985 + 0.03 * tooth, keep);
  col *= grade;
  vec2 q = vUv * vec2(aspect, 1.0);
  if (vignette > 0.001) {
    float r = length((vUv - 0.5) * vec2(aspect, 1.0)) / length(vec2(aspect, 1.0) * 0.5);
    col *= 1.0 - vignette * smoothstep(0.45, 1.05, r) * 0.75;
  }
  // cinema bars, as in the other looks: dark paint pulled across in long strokes
  if (bars > 0.001) {
    float barH = max(0.0, 0.5 - aspect / (2.0 * 2.2)) * bars;
    float ey = min(vUv.y, 1.0 - vUv.y);
    float ragged = (fbm(vec2(q.x * 7.0, vUv.y > 0.5 ? 3.0 : 9.0) + borderSeed * 0.2) - 0.5) * 0.03 + (noise(vec2(q.x * 60.0, 1.0)) - 0.5) * 0.004;
    float ink = smoothstep(0.0, 0.004, barH - ey + ragged);
    float streak = fbm(vec2(q.x * 1.4, vUv.y * 22.0));
    col = mix(col, vec3(0.13, 0.105, 0.1) * (0.8 + 0.45 * streak), ink);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

function bakeAtlas(renderer) {
  const t = new THREE.WebGLRenderTarget(1024, 512, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });
  t.texture.anisotropy = 4;
  const sheet = t.clone();
  const draw = (fragmentShader, uniforms, into) => {
    const m = new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    q.frustumCulled = false;
    const sc = new THREE.Scene();
    sc.add(q);
    renderer.setRenderTarget(into);
    renderer.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    m.dispose();
    q.geometry.dispose();
  };
  const prev = renderer.getRenderTarget();
  draw(atlasFragment, { WIDTH: { value: DAB_WIDTH } }, sheet);
  draw(slopeFragment, { tSheet: { value: sheet.texture } }, t);
  renderer.setRenderTarget(prev);
  sheet.dispose();
  return t;
}

// sceneTarget: the painter's scene target (its depth tells each dab which surface it is on)
export function createOilPaint(renderer, strokes, sceneTarget) {
  const atlas = bakeAtlas(renderer);
  const paintT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
  // The first pass into the paint target: the under-coat (UNDER, below), and the scene's depth into the
  // target's own: for each of its pixels the farthest of the scene's under it (so where an edge splits a pixel
  // a dab is not held back; its fragment shader keeps it to its face).
  const depthDown = new THREE.ShaderMaterial({
    uniforms: {
      tDepth: { value: sceneTarget.depthTexture }, tScene: { value: sceneTarget.texture }, tAtlas: { value: atlas.texture },
      texel: { value: new THREE.Vector2(1, 1) }, full: { value: new THREE.Vector2(1, 1) },
      projInv: { value: new THREE.Matrix4() }, viewInv: { value: new THREE.Matrix4() },
      viewProj: strokes.shared.viewProj, eye: strokes.shared.eye, heightAt1m: strokes.shared.heightAt1m, aspect: strokes.shared.aspect,
      under: { value: UNDER }, impasto: { value: IMPASTO },
    },
    vertexShader: quadVertex,
    fragmentShader: underFragment,
    depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, blending: THREE.NoBlending,
  });
  const depthQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthDown);
  depthQuad.frustumCulled = false;
  const depthScene = new THREE.Scene();
  depthScene.add(depthQuad);
  const flatCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const light = {
    hemiSky: { value: new THREE.Color() }, hemiGround: { value: new THREE.Color() }, hemiUp: { value: new THREE.Vector3(0, 1, 0) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunMatrix: { value: new THREE.Matrix4() },
    tSunShadow: { value: null }, sunShadow: { value: new THREE.Vector3() },
    pointPos: { value: Array.from({ length: MAX_POINTS }, () => new THREE.Vector4()) },
    pointCol: { value: Array.from({ length: MAX_POINTS }, () => new THREE.Vector4()) },
    points: { value: 0 },
    fogColor: { value: new THREE.Color() }, fogRange: { value: new THREE.Vector2() },
  };
  const own = {
    tDepth: { value: sceneTarget.depthTexture },
    tScene: { value: sceneTarget.texture },
    maxSize: { value: new THREE.Vector2(...MAX_SIZE) },
    hiddenOwn: { value: 0 },
    tAtlas: { value: atlas.texture },
    screen: { value: new THREE.Vector2(1, 1) },
    shape: { value: new THREE.Vector2(...OIL_SHAPE) },
    impasto: { value: IMPASTO },
    agree: { value: new THREE.Vector2(1, 1) },
  };
  const scene = new THREE.Scene();
  // Each stroke's dabs: SUB_ALONG x SUB_ACROSS quads, one segment long each (an oil dab is short enough to bend
  // on 4 corners, and every corner works out the dab's light again); the ones a stroke does not need are
  // dropped in the vertex shader before any of that. The placed strokes' attributes are shared, not copied;
  // the instance count follows them (render).
  const quads = SUB_ALONG * SUB_ACROSS;
  const pos = new Float32Array(quads * 12), uvs = new Float32Array(quads * 8), subs = new Float32Array(quads * 4), index = [];
  const unit = new THREE.PlaneGeometry(1, 1, 1, 1);
  for (let k = 0; k < quads; k++) {
    pos.set(unit.getAttribute('position').array, k * 12);
    uvs.set(unit.getAttribute('uv').array, k * 8);
    subs.fill(k, k * 4, k * 4 + 4);
    for (const i of unit.index.array) index.push(i + k * 4);
  }
  unit.dispose();
  const geos = strokes.parts.map(({ geo }) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(index);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('sub', new THREE.BufferAttribute(subs, 1));
    for (const k of ['aPos', 'aTan', 'aNor', 'aShape', 'aCol']) g.setAttribute(k, geo.getAttribute(k));
    g.instanceCount = 0;
    return g;
  });
  const materials = strokes.parts.map(({ layer }, i) => {
    const geo = geos[i];
    const mat = new THREE.ShaderMaterial({
      vertexShader: dabVertex,
      fragmentShader: dabFragment,
      uniforms: {
        ...strokes.shared, ...light, ...own,
        window: { value: new THREE.Vector2(...layer.window) },
        keep: { value: OIL_KEEP[i] ?? 1 },
        rowGap: { value: layer.rowGap },
      },
      transparent: true, depthTest: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = i;
    mesh.visible = !!OIL_LAYERS[i];
    scene.add(mesh);
    return mat;
  });

  // the shop's lights, found again now and then (lamps are added as the shop is built)
  let found = null, foundAt = -1, frame = 0;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  function gather(world) {
    if (found && frame - foundAt < 120) return found;
    found = { hemi: [], sun: [], points: [], owners: [] };
    world.traverse((o) => {
      if (o.userData.ownStrokes) found.owners.push(o);
      if (o.isHemisphereLight) found.hemi.push(o);
      else if (o.isDirectionalLight) found.sun.push(o);
      else if (o.isPointLight) found.points.push(o);
    });
    foundAt = frame;
    return found;
  }
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  function updateLights(world) {
    frame++;
    const L = gather(world);
    light.hemiSky.value.setRGB(0, 0, 0); light.hemiGround.value.setRGB(0, 0, 0);
    for (const h of L.hemi) {
      if (!shown(h)) continue;
      light.hemiSky.value.r += h.color.r * h.intensity; light.hemiSky.value.g += h.color.g * h.intensity; light.hemiSky.value.b += h.color.b * h.intensity;
      light.hemiGround.value.r += h.groundColor.r * h.intensity; light.hemiGround.value.g += h.groundColor.g * h.intensity; light.hemiGround.value.b += h.groundColor.b * h.intensity;
      light.hemiUp.value.copy(h.getWorldPosition(v)).normalize();
    }
    const sun = L.sun.find(shown);
    light.sunCol.value.setRGB(0, 0, 0);
    light.sunShadow.value.x = 0;
    if (sun) {
      light.sunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
      light.sunDir.value.copy(sun.getWorldPosition(v)).sub(sun.target.getWorldPosition(w)).normalize();
      const map = sun.shadow.map?.depthTexture;
      if (sun.castShadow && map) {
        light.tSunShadow.value = map;
        light.sunMatrix.value.copy(sun.shadow.matrix);
        light.sunShadow.value.set(1, sun.shadow.bias, sun.shadow.normalBias);
      }
    }
    let n = 0;
    for (const l of L.points) {
      if (n >= MAX_POINTS || !shown(l) || l.intensity <= 0) continue;
      l.getWorldPosition(v);
      light.pointPos.value[n].set(v.x, v.y, v.z, l.distance);
      light.pointCol.value[n].set(l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity, l.decay);
      n++;
    }
    light.points.value = n;
    let hidden = 0;
    for (const o of L.owners) if (!shown(o)) hidden |= 1 << Math.min(8, Number(o.userData.ownStrokes) || 1);
    own.hiddenOwn.value = hidden;
    const fog = world.fog;
    if (fog && 'near' in fog) { light.fogColor.value.copy(fog.color); light.fogRange.value.set(fog.near, fog.far); } else light.fogRange.value.set(0, 0);
  }

  return {
    texture: paintT.texture,
    target: paintT,
    sceneTarget,
    strokes,
    scene,
    materials,
    // the dabs, into the paint target (cleared clear)
    render(world, camera, sync) {
      updateLights(world);
      strokes.parts.forEach(({ geo }, i) => { geos[i].instanceCount = geo.instanceCount; });
      strokes.setCamera(camera);
      depthDown.uniforms.projInv.value.copy(camera.projectionMatrixInverse);
      depthDown.uniforms.viewInv.value.copy(camera.matrixWorld);
      renderer.setRenderTarget(paintT);
      const prev = renderer.getClearAlpha(), col = renderer.getClearColor(new THREE.Color());
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(depthScene, flatCam);
      renderer.render(scene, camera);
      renderer.autoClear = auto;
      renderer.setClearColor(col, prev);
      sync?.('strokes');
    },
    setSize(full, pixelRatio) {
      // full = drawing-buffer size; dabs at OIL_SCALE px per CSS px
      const k = Math.min(1, OIL_SCALE / Math.max(1, pixelRatio));
      const x = Math.max(1, Math.round(full.x * k)), y = Math.max(1, Math.round(full.y * k));
      paintT.setSize(x, y);
      own.screen.value.set(x, y);
      depthDown.uniforms.texel.value.set(1 / x, 1 / y);
      depthDown.uniforms.full.value.set(1 / full.x, 1 / full.y);
      strokes.setSize(x, y);
    },
    finalMaterial(u) {
      return new THREE.ShaderMaterial({
        vertexShader: quadVertex,
        fragmentShader: finalFragment,
        uniforms: {
          tScene: u.tScene, tDepth: u.tDepth, tPaper: u.tPaper, resolution: u.resolution, paperOffset: u.paperOffset,
          overlayOn: u.overlayOn, bars: u.bars, grade: u.grade, vignette: u.vignette, borderSeed: u.borderSeed,
          tPaint: { value: paintT.texture },
        },
        depthTest: false, depthWrite: false,
      });
    },
    dispose() {
      atlas.dispose();
      paintT.dispose();
      depthDown.dispose();
      depthQuad.geometry.dispose();
      for (const m of materials) m.dispose();
      for (const g of geos) g.dispose();
    },
  };
}
