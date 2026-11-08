// Screen pass that turns the rendered scene into a watercolour painting:
// wobbling edges, colour bleed, darker wet edges, pigment granulating in the paper tooth,
// a high-key paper tint and an unpainted ragged border.
import * as THREE from 'three';
import { paperTexture } from './paint.js';
import { settings } from './settings.js';
import { createBrushStrokes } from './brushstrokes.js';

const BOIL_FPS = 8; // edges re-wobble at a hand-drawn frame rate instead of every frame

// How far the scene is pushed from "render" toward "painting" (Settings > Painting; ?wc=N overrides
// for screenshots). 0 is the old single pass (grain, small blur); higher levels first flatten the
// image into washes (Kuwahara filter)
// and then let neighbouring washes run, in patches, into each other along a wandering flow (bleed).
//   radius: Kuwahara radius in pixels (bigger = flatter, bigger washes)
//   bleed:  how far colour runs, pixels; bleedMix: how strongly, in the patches where it runs
//   bloom:  strength of backruns (pale blooms with a dark rim where wet paint pushed back)
const LEVELS = [
  null,
  { radius: 3, bleed: 7, bleedMix: 0.55, bloom: 0.5, edge: 0.9, lift: 0.09 },
  { radius: 4, bleed: 12, bleedMix: 0.75, bloom: 0.8, edge: 0.8, lift: 0.12 },
  { radius: 6, bleed: 20, bleedMix: 0.9, bloom: 1.0, edge: 0.7, lift: 0.15 },
  // Brush strokes (brushstrokes.js): the world is repainted stroke by stroke, then the strokes run into
  // each other along the same bleed. radius/lift also set how the suitcase overlay is washed, as above.
  { strokes: true, radius: 6, bleed: 10, bleedMix: 0.4, bloom: 1.0, edge: 0.55, lift: 0.05, grain: 0.4 },
];
// Brush strokes in the small card window. It holds only the suitcase, whose strokes are in its textures
// (suitcase/paint.js) and swing with the lid, so there is no world to pin strokes to. A light wash keeps
// those marks readable, and like the shop's strokes the paint stays still.
const CARD_BRUSH = { still: true, radius: 2, bleed: 5, bleedMix: 0.3, bloom: 0.35, edge: 0.5, lift: 0.04, grain: 0.35 };
export const PAINT_LEVELS = LEVELS.length;
const validLevel = (v) => Number.isInteger(v) && v >= 0 && v < LEVELS.length;
function levelFromUrl() {
  const raw = new URLSearchParams(globalThis.location?.search ?? '').get('wc');
  return raw !== null && validLevel(Number(raw)) ? Number(raw) : null;
}

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 + 1.7) * 0.15; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

// Pass 1: smoothed Kuwahara. Each pixel takes the mean of whichever quarter of its
// neighbourhood is most even, so gradients and fine 3D shading collapse into flat washes while the
// boundaries between them stay put. Quarters are blended by evenness (not picked) to avoid blocks.
const washShader = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 texel;   // full-res texel
varying vec2 vUv;
${NOISE}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 at(vec2 uv) { return texture2D(tScene, uv).rgb; } // already sRGB (prep pass)
void main() {
  vec3 m[4]; vec3 s[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
  float n = float((RADIUS + 1) * (RADIUS + 1));
  for (int j = 0; j <= RADIUS; j++) {
    for (int i = 0; i <= RADIUS; i++) {
      vec2 o = vec2(float(i), float(j)) * texel;
      vec3 a = at(vUv + vec2(-o.x, -o.y)); m[0] += a; s[0] += a * a;
      vec3 b = at(vUv + vec2( o.x, -o.y)); m[1] += b; s[1] += b * b;
      vec3 c = at(vUv + vec2(-o.x,  o.y)); m[2] += c; s[2] += c * c;
      vec3 d = at(vUv + vec2( o.x,  o.y)); m[3] += d; s[3] += d * d;
    }
  }
  vec3 col = vec3(0.0); float wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    vec3 mean = m[k] / n;
    vec3 v = abs(s[k] / n - mean * mean);
    float sd = sqrt(v.r + v.g + v.b);
    float w = 1.0 / (1e-5 + pow(sd * 12.0, 6.0));
    col += mean * w; wsum += w;
  }
  gl_FragColor = vec4(col / wsum, texture2D(tScene, vUv).a);
}
`;

// Pass 0: the scene, converted to sRGB once and box-downsampled to the wash size, so the Kuwahara
// pass (up to 196 taps a pixel) neither converts every tap nor runs on every Retina pixel.
const prepShader = /* glsl */ `
uniform sampler2D tScene;
varying vec2 vUv;
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec4 c = texture2D(tScene, vUv);
  gl_FragColor = vec4(toSRGB(clamp(c.rgb, 0.0, 1.0)), c.a);
}
`;

// Pass 2: bleed. Only in patches (a noise mask), so some shapes stay crisp and others run. Colour is smeared along a slowly wandering flow field that is glued to
// the paper (so it does not swim over the scene), over a distance that itself varies, and darker,
// denser pigment carries further into light areas than the other way round, like wet-in-wet.
const bleedShader = /* glsl */ `
uniform sampler2D tWash;
uniform vec2 texel;
uniform vec2 paperOffset;
uniform float seed;
varying vec2 vUv;
${NOISE}
#ifdef OWN_SURFACE
// Brush mode: paint runs along a surface, never across an outline onto what is behind it. The depth
// buffer is linear on screen for a flat surface, so a neighbour on the same one is predicted exactly.
uniform sampler2D tDepth;
uniform float near;
uniform float far;
float metres(float z) { z = z * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }
float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
float nearer(float a, float b) { return abs(a) < abs(b) ? a : b; }
#endif
void main() {
#ifdef OWN_SURFACE
  float z0 = rawDepth(vUv);
  vec2 slope = vec2(
    nearer(rawDepth(vUv + vec2(texel.x, 0.0)) - z0, z0 - rawDepth(vUv - vec2(texel.x, 0.0))),
    nearer(rawDepth(vUv + vec2(0.0, texel.y)) - z0, z0 - rawDepth(vUv - vec2(0.0, texel.y))));
  float tol = 0.02 + 0.006 * metres(z0);
#endif
  vec2 pq = gl_FragCoord.xy * FRAG / 512.0 + paperOffset;
  float ang = fbm(pq * 1.1) * 12.566 + (fbm(pq * 3.0 + seed * 0.02) - 0.5) * 0.6;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 side = vec2(-dir.y, dir.x);
  float len = BLEED * mix(0.3, 1.0, smoothstep(0.25, 0.75, fbm(pq * 2.3 + 5.0)));
  vec4 c0 = texture2D(tWash, vUv);
  float l0 = lum(c0.rgb);
  vec3 acc = c0.rgb; float wsum = 1.0;
  float jit = hash(floor(gl_FragCoord.xy * FRAG) + seed) - 0.5;
  for (int i = 1; i <= 6; i++) {
    float t = (float(i) + jit * 0.8) / 6.0;
    float g = exp(-t * t * 2.2);
    for (int sgn = -1; sgn <= 1; sgn += 2) {
      vec2 o = (dir * t * float(sgn) + side * jit * 0.25) * len * texel;
      vec3 c = texture2D(tWash, vUv + o).rgb;
      // dark into light: a darker neighbour gets more say
      float w = g * clamp(1.0 + 2.5 * (l0 - lum(c)), 0.25, 2.5);
#ifdef OWN_SURFACE
      float expected = z0 + dot(slope, o / texel);
      w *= 1.0 - smoothstep(tol, tol * 1.6, abs(metres(rawDepth(vUv + o)) - metres(expected)));
#endif
      acc += c * w; wsum += w;
    }
  }
  float runs = smoothstep(0.34, 0.62, fbm(pq * 0.9 + 41.0));
  gl_FragColor = vec4(mix(c0.rgb, acc / wsum, runs * BLEED_MIX), c0.a);
}
`;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tPaper;
uniform vec2 resolution;
uniform vec2 paperOffset;
uniform float seed;
uniform float borderSeed; // keeps boiling in brush mode, where seed stays 0
uniform float bars;       // 0..1: painted cinema bars (letterbox) top and bottom, during the intro
uniform vec3 grade;       // colour grade multiplied in (intro: cool street, warm shop); 1,1,1 = none
uniform float vignette;   // 0..1: darker corners (intro)
uniform float near;
uniform float far;
uniform sampler2D tWash;   // the bled washes, only with WASH
uniform float bloomAmt;
uniform float edgeAmt;
uniform float lift;       // how far every wash is thinned toward the paper
uniform sampler2D tOver;  // brush mode: the suitcase overlay's own wash, inside overBox
uniform float overlayOn;
uniform vec4 overBox;
uniform float grainAmt;
varying vec2 vUv;
float ovMask = 0.0;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 + 1.7) * 0.15; }

vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 sceneAt(vec2 uv) { return toSRGB(clamp(texture2D(tScene, uv).rgb, 0.0, 1.0)); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// Brush mode: the overlay has no strokes on it. Outside the box its wash was not rendered, so things
// flying there (a record on its way to the case) show as drawn.
vec3 washAt(vec2 uv) {
  vec3 c = texture2D(tWash, uv).rgb;
#ifdef STROKES
  if (ovMask > 0.0) {
    bool inBox = uv.x > overBox.x && uv.y > overBox.y && uv.x < overBox.z && uv.y < overBox.w;
    c = mix(c, inBox ? texture2D(tOver, uv).rgb : sceneAt(uv), ovMask);
  }
#endif
  return c;
}
float depthAt(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}

void main() {
  vec2 px = 1.0 / resolution;
  float aspect = resolution.x / resolution.y;
  vec2 q = vUv * vec2(aspect, 1.0);

  // 1. hand wobble: displace where we read the scene with slow noise that boils at BOIL_FPS
  vec2 wob = vec2(fbm(q * 7.0 + seed), fbm(q * 7.0 + seed + 31.7)) - 0.5;
  vec2 uv = vUv + wob * px * 5.0;

#ifdef WASH
  // 2. the bled washes from the wash passes; depth jumps (silhouettes) add a broken drawn line
  // under the wash, the way a painter keeps the pencil sketch.
#ifdef STROKES
  // the overlay cleared the depth buffer and drew itself, so its depth marks its pixels
  if (overlayOn > 0.5) {
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(i < 2 ? (i == 0 ? -1.0 : 1.0) : 0.0, i < 2 ? 0.0 : (i == 2 ? -1.0 : 1.0));
      ovMask += step(texture2D(tDepth, uv + o * px).x, 0.99999) * 0.25;
    }
  }
#endif
  vec3 sharp = washAt(uv);
  vec3 soft = sharp;
  float j = hash(gl_FragCoord.xy + seed) * 6.2831;
  for (int i = 0; i < 8; i++) {
    float a = j + float(i) * 0.7854;
    soft += washAt(uv + vec2(cos(a), sin(a)) * px * 3.0);
  }
  soft /= 9.0;
  vec3 col = mix(sharp, soft, 0.2);

  // 3. hard wash edges: where one wash meets another, pigment dries darker at the rim
  float lx = lum(washAt(uv + vec2(px.x * 2.0, 0.0))) - lum(washAt(uv - vec2(px.x * 2.0, 0.0)));
  float ly = lum(washAt(uv + vec2(0.0, px.y * 2.0))) - lum(washAt(uv - vec2(0.0, px.y * 2.0)));
  float cEdge = smoothstep(0.03, 0.16, length(vec2(lx, ly)));
  float d = depthAt(uv);
  float dx = depthAt(uv + vec2(px.x * 1.5, 0.0)) - depthAt(uv - vec2(px.x * 1.5, 0.0));
  float dy = depthAt(uv + vec2(0.0, px.y * 1.5)) - depthAt(uv - vec2(0.0, px.y * 1.5));
  float dEdge = smoothstep(0.08, 0.3, length(vec2(dx, dy)) / max(d, 0.5));
  // (a soft deepening of the same hue, not an outline: watercolour has no ink line)
  float edge = max(cEdge * 0.7, dEdge * 0.6) * (0.4 + 0.6 * fbm(q * 30.0 + seed)) * edgeAmt;
  float pool = smoothstep(0.03, 0.12, length(soft - sharp));
  float wet = clamp(max(edge, pool * 0.6), 0.0, 1.0);
  col = mix(col, col * col * 0.92, wet * 0.55);

  // backruns: pale blooms with a cauliflower dark rim, glued to the paper
  vec2 pq = gl_FragCoord.xy / 512.0 + paperOffset;
  float bm = fbm(pq * 0.7 + 17.0) + (noise(pq * 11.0) - 0.5) * 0.05;
  float inside = smoothstep(0.66, 0.69, bm);
  float rim = inside - smoothstep(0.69, 0.72, bm);
  col = mix(col, col * 0.8 + 0.2 * vec3(0.985, 0.965, 0.93), inside * 0.3 * bloomAmt);
  col = mix(col, col * 0.85, rim * 0.35 * bloomAmt);
#else
  // 2. colour bleed: soft ring of taps, jittered so the blur reads as wet spreading, not a lens blur
  vec3 sharp = sceneAt(uv);
  vec3 soft = sharp;
  float j = hash(gl_FragCoord.xy + seed) * 6.2831;
  for (int i = 0; i < 8; i++) {
    float a = j + float(i) * 0.7854;
    soft += sceneAt(uv + vec2(cos(a), sin(a)) * px * 2.6);
  }
  soft /= 9.0;
  vec3 col = mix(sharp, soft, 0.45);

  // 3. edges, from colour and depth (Sobel-ish cross)
  float lx = lum(sceneAt(uv + vec2(px.x * 1.5, 0.0))) - lum(sceneAt(uv - vec2(px.x * 1.5, 0.0)));
  float ly = lum(sceneAt(uv + vec2(0.0, px.y * 1.5))) - lum(sceneAt(uv - vec2(0.0, px.y * 1.5)));
  float cEdge = smoothstep(0.04, 0.22, length(vec2(lx, ly)));
  float d = depthAt(uv);
  float dx = depthAt(uv + vec2(px.x * 1.5, 0.0)) - depthAt(uv - vec2(px.x * 1.5, 0.0));
  float dy = depthAt(uv + vec2(0.0, px.y * 1.5)) - depthAt(uv - vec2(0.0, px.y * 1.5));
  float dEdge = smoothstep(0.05, 0.25, length(vec2(dx, dy)) / max(d, 0.5));
  // break the line up so it reads as pigment pooling, not an ink outline
  float edge = max(cEdge, dEdge) * (0.55 + 0.45 * fbm(q * 40.0 + seed));

  // wet edge: pigment collects at the boundary of a wash -> same hue, deeper.
  // (soft - sharp) is large just inside a colour boundary, which is where the pooling shows.
  float pool = smoothstep(0.035, 0.14, length(soft - sharp));
  float wet = clamp(max(edge * 0.8, pool), 0.0, 1.0);
  col = mix(col, col * col * 0.9, wet * 0.7);

#endif

  // darks are glazes, not black: lift them and lean them cool (violet-brown)
  float dark = 1.0 - smoothstep(0.08, 0.45, lum(col));
  col = mix(col, col * 0.75 + vec3(0.17, 0.13, 0.18), dark * 0.75);

  // 4. paper: granulation settles in the valleys, more so for denser (darker) pigment
  vec2 paperUv = (gl_FragCoord.xy / 512.0) + paperOffset;
  float h = texture2D(tPaper, paperUv).r;
  h = smoothstep(0.35, 0.95, h);
  float density = 1.0 - lum(col);
#ifdef WASH
  col *= 1.0 - (1.0 - h) * (0.18 + 0.55 * density) * grainAmt;
#else
  col *= 1.0 - (1.0 - h) * (0.12 + 0.4 * density);
#endif

  // 5. watercolour is transparent: lift toward the paper and calm the saturation a touch
  vec3 paper = vec3(0.985, 0.965, 0.93);
  col = mix(col, paper, lift);
#ifdef WASH
  // highlights are the bare paper left unpainted
  col = mix(col, paper, smoothstep(0.72, 0.95, lum(col)) * 0.6);
#endif
  col = mix(vec3(lum(col)), col, 1.08);

  // low-frequency blooms (uneven wash density) in screen space, very gentle
  col *= mix(0.95, 1.04, fbm(q * 2.2 + 3.0));

  // crisp things (album art, labels) wrote alpha 0: show them as rendered, barely touched by paper
  float crisp = clamp(1.0 - texture2D(tScene, vUv).a, 0.0, 1.0);
  vec3 clean = sceneAt(vUv);
  clean *= 0.97 + 0.03 * h;
  col = mix(col, clean, crisp);

  // 5a. intro grade and vignette (introlight.js), before the bars so the ink stays its own colour
  col *= grade;
  if (vignette > 0.001) {
    vec2 vq = (vUv - 0.5) * vec2(aspect, 1.0);
    float r = length(vq) / length(vec2(aspect, 1.0) * 0.5);
    col *= 1.0 - vignette * smoothstep(0.45, 1.05, r) * 0.75;
  }

  // 5b. cinema bars: dark ink pulled across the sheet in long horizontal strokes, cropping the
  // picture to about 2.2:1. bars 0..1 slides them in from the top and bottom edges.
  if (bars > 0.001) {
    float barH = (max(0.0, 0.5 - aspect / (2.0 * 2.2)) + 0.02) * bars; // +0.02: the paper margin eats that much
    float ey = min(vUv.y, 1.0 - vUv.y);
    float ragged = (fbm(vec2(q.x * 7.0, vUv.y > 0.5 ? 3.0 : 9.0) + borderSeed * 0.2) - 0.5) * 0.03
                 + (noise(vec2(q.x * 60.0, 1.0)) - 0.5) * 0.004;
    float ink = smoothstep(0.0, 0.004, barH - ey + ragged);
    float streak = fbm(vec2(q.x * 1.4, vUv.y * 22.0)); // the drag of a wide flat brush
    vec3 inkCol = vec3(0.13, 0.105, 0.1) * (0.8 + 0.45 * streak) * (0.94 + 0.06 * h);
    col = mix(col, inkCol, ink); // fully opaque: any of the picture left under it ghosts through
  }

  // 6. unpainted ragged border, like a painting that stops short of the sheet edge
  vec2 e = min(vUv, 1.0 - vUv) * vec2(aspect, 1.0);
  float border = min(e.x, e.y) + (fbm(q * 9.0 + borderSeed * 0.3) - 0.5) * 0.05;
#ifdef CARD
  border -= 0.05; // a wider paper margin: the sheet itself is the card
#endif
  float paint = smoothstep(0.0, 0.045, border);
  vec3 paperShade = paper * (0.94 + 0.06 * h);
  col = mix(paperShade, col, paint);

#ifdef CARD
  // The sheet is a torn card with a deckle edge; beyond it the window is transparent (premultiplied).
  float sheet = min(e.x, e.y) + (fbm(q * 13.0 + 5.0) - 0.5) * 0.04 + (noise(q * 75.0) - 0.5) * 0.008 - 0.02;
  float a = smoothstep(0.0, 0.006, sheet);
  gl_FragColor = vec4(col * a, a);
#else
  gl_FragColor = vec4(col, 1.0);
#endif
}
`;

// Draws `overlay` ({ scene, camera }) on top of what is already in the target, with the depth
// cleared so it never clips into the world (a camera-space HUD that is still painted).
export function renderOverlay(renderer, overlay) {
  if (!overlay) return;
  const auto = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(overlay.scene, overlay.camera);
  renderer.autoClear = auto;
}

// { card: true } turns the unpainted border into a deckle-edged card and makes everything beyond it
// transparent (for the small frameless window; the renderer needs alpha: true).
// level: fixed strength; left out, it follows Settings > Painting live (unless ?wc= pins it).
export function createWatercolour(renderer, { card = false, level = levelFromUrl() } = {}) {
  const follow = level === null || level === undefined;
  if (follow) level = validLevel(settings.get('paint')) ? settings.get('paint') : LEVELS.length - 1;
  const levelOf = (n) => (card && LEVELS[n]?.strokes ? CARD_BRUSH : LEVELS[n]);
  let L = levelOf(level);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    // hi-dpi pixels are small enough that 2x MSAA reads the same under the paint, at half the memory traffic
    samples: renderer.getPixelRatio() >= 2 ? 2 : 4,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
  });

  function finalDefines() {
    return { ...(card ? { CARD: '' } : {}), ...(L ? { WASH: '' } : {}), ...(L?.strokes ? { STROKES: '' } : {}) };
  }
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: finalDefines(),
    uniforms: {
      tScene: { value: target.texture },
      tDepth: { value: target.depthTexture },
      tPaper: { value: paperTexture() },
      resolution: { value: size.clone() },
      paperOffset: { value: new THREE.Vector2() },
      seed: { value: 0 },
      borderSeed: { value: 0 },
      bars: { value: 0 },
      grade: { value: new THREE.Vector3(1, 1, 1) },
      vignette: { value: 0 },
      near: { value: 0.1 },
      far: { value: 100 },
      tWash: { value: null },
      bloomAmt: { value: 0 },
      edgeAmt: { value: 1 },
      lift: { value: 0.07 },
      tOver: { value: null },
      overlayOn: { value: 0 },
      overBox: { value: new THREE.Vector4(2, 2, 2, 2) },
      grainAmt: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const dir = new THREE.Vector3();
  const pan = new THREE.Vector2();

  // wash + bleed passes (level > 0), rebuilt when the level changes.
  // Two copies: `full`, and `lite` at half the size (a quarter of the pixels, half the radius: about
  // 1/16 of the Kuwahara work) for while the camera travels. setMotion(on) eases between them over
  // ~0.5 s through a small mix pass, so the paint never pops; at rest only `full` runs.
  let wash = null;
  const pass = (fragmentShader, defines, uniforms) => {
    const m = new THREE.ShaderMaterial({ vertexShader, fragmentShader, defines, uniforms, depthTest: false, depthWrite: false });
    const sc = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    q.frustumCulled = false;
    sc.add(q);
    return { m, sc };
  };
  function makeWash(mul) {
    // The washes are soft by nature, so on a hi-dpi screen they are painted at CSS-pixel size and
    // upscaled; radius and bleed shrink to match, so a wash covers the same area as before.
    const scale = washScale() * mul;
    const radius = Math.max(1, Math.round(L.radius * scale));
    const ws = washSize(renderer.getDrawingBufferSize(new THREE.Vector2()), scale);
    const rt = () => new THREE.WebGLRenderTarget(ws.x, ws.y, { type: THREE.HalfFloatType });
    const prepT = rt(), washT = rt(), bleedT = rt();
    const prepP = pass(prepShader, {}, { tScene: { value: target.texture } });
    const washP = pass(washShader, { RADIUS: radius }, { tScene: { value: prepT.texture }, texel: { value: new THREE.Vector2() } });
    const bleedP = pass(bleedShader, { BLEED: (L.bleed * scale).toFixed(2), BLEED_MIX: L.bleedMix.toFixed(2), FRAG: (1 / scale).toFixed(4) }, {
      tWash: { value: washT.texture }, texel: { value: new THREE.Vector2() },
      paperOffset: material.uniforms.paperOffset, seed: material.uniforms.seed,
    });
    const w = {
      mul,
      scale,
      texture: bleedT.texture,
      steps: [[prepT, prepP], [washT, washP], [bleedT, bleedP]],
      render(sync) {
        for (const [t, p] of this.steps) { renderer.setRenderTarget(t); renderer.render(p.sc, postCam); sync?.(t === prepT ? 'prep' : t === washT ? 'wash' : 'bleed'); }
      },
      setSize(full) {
        const s = washSize(full, scale);
        for (const t of [prepT, washT, bleedT]) t.setSize(s.x, s.y);
        washP.m.uniforms.texel.value.set(1 / s.x, 1 / s.y);
        bleedP.m.uniforms.texel.value.set(1 / s.x, 1 / s.y);
      },
      dispose() {
        prepT.dispose(); washT.dispose(); bleedT.dispose();
        for (const p of [prepP, washP, bleedP]) { p.m.dispose(); p.sc.children[0].geometry.dispose(); }
      },
    };
    w.setSize(renderer.getDrawingBufferSize(new THREE.Vector2()));
    // no shader-compile hitch the first time it runs (compiled for the target it draws into: a
    // screen-variant program would not be reused)
    const prev = renderer.getRenderTarget();
    for (const [t, p] of w.steps) { renderer.initRenderTarget(t); renderer.setRenderTarget(t); renderer.compile(p.sc, postCam); }
    renderer.setRenderTarget(prev);
    return w;
  }
  // Brush mode: the world alone goes through here (the overlay is drawn after). Prep is mip-mapped: each
  // stroke reads its colour from the level matching its size.
  let brush = null;
  // Every view strokes were placed from, kept so they can be placed again if the brush is rebuilt
  // (a level change, a move to a screen with another pixel ratio).
  const strokeViews = [];
  let strokeWorld = null;
  function makeBrush() {
    const scale = washScale();
    const ws = washSize(renderer.getDrawingBufferSize(new THREE.Vector2()), scale);
    const refT = new THREE.WebGLRenderTarget(ws.x, ws.y, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, depthBuffer: false });
    const paintT = new THREE.WebGLRenderTarget(ws.x, ws.y, { type: THREE.HalfFloatType, depthBuffer: false });
    const bleedT = new THREE.WebGLRenderTarget(ws.x, ws.y, { type: THREE.HalfFloatType, depthBuffer: false });
    const prepP = pass(prepShader, {}, { tScene: { value: target.texture } });
    const strokes = createBrushStrokes(renderer, refT.texture, target.depthTexture);
    const bleedP = pass(bleedShader, { OWN_SURFACE: '', BLEED: (L.bleed * scale).toFixed(2), BLEED_MIX: L.bleedMix.toFixed(2), FRAG: (1 / scale).toFixed(4) }, {
      tWash: { value: paintT.texture }, texel: { value: new THREE.Vector2() },
      paperOffset: material.uniforms.paperOffset, seed: material.uniforms.seed,
      tDepth: { value: target.depthTexture }, near: material.uniforms.near, far: material.uniforms.far,
    });
    const steps = [[refT, prepP.sc, 'prep'], [paintT, strokes.scene, 'strokes'], [bleedT, bleedP.sc, 'bleed']];
    const b = {
      scale,
      texture: bleedT.texture,
      strokes,
      render(pan, camera, sync) {
        strokes.setPan(pan.x, pan.y);
        strokes.setCamera(camera);
        for (const [t, sc, name] of steps) { renderer.setRenderTarget(t); renderer.render(sc, postCam); sync?.(name); }
      },
      setSize(full) {
        const s = washSize(full, scale);
        for (const [t] of steps) t.setSize(s.x, s.y);
        bleedP.m.uniforms.texel.value.set(1 / s.x, 1 / s.y);
        strokes.setSize(s.x, s.y);
      },
      dispose() {
        for (const [t] of steps) t.dispose();
        for (const p of [prepP, bleedP]) { p.m.dispose(); p.sc.children[0].geometry.dispose(); }
        strokes.dispose();
      },
    };
    b.setSize(renderer.getDrawingBufferSize(new THREE.Vector2()));
    const prev = renderer.getRenderTarget();
    for (const [t, sc] of steps) { renderer.initRenderTarget(t); renderer.setRenderTarget(t); renderer.compile(sc, postCam); }
    renderer.setRenderTarget(prev);
    return b;
  }
  // blends lite (k = 1) over full (k = 0) while the two hand over
  const mixT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const mixP = pass(/* glsl */ `
uniform sampler2D tA;
uniform sampler2D tB;
uniform float k;
uniform vec4 hi;      // a box (uv: x0, y0, x1, y1) where tA stays full strength: the suitcase while the camera travels
uniform vec2 feather; // its soft edge, uv
varying vec2 vUv;
void main() {
  vec2 a = smoothstep(vec2(0.0), feather, vUv - hi.xy) * smoothstep(vec2(0.0), feather, hi.zw - vUv);
  gl_FragColor = mix(texture2D(tA, vUv), texture2D(tB, vUv), k * (1.0 - a.x * a.y));
}
`, {}, { tA: { value: null }, tB: { value: null }, k: { value: 0 }, hi: { value: new THREE.Vector4(2, 2, 2, 2) }, feather: { value: new THREE.Vector2(0.01, 0.01) } });
  { const prev = renderer.getRenderTarget(); renderer.initRenderTarget(mixT); renderer.setRenderTarget(mixT); renderer.compile(mixP.sc, postCam); renderer.setRenderTarget(prev); } // first used as the intro ends: compile it now
  let lite = null;
  let motion = false, motionK = 0, lastT = null, sawFrame = false;
  function buildWash() {
    const u = material.uniforms;
    u.bloomAmt.value = L?.bloom ?? 0;
    u.edgeAmt.value = L?.edge ?? 1;
    u.lift.value = L?.lift ?? 0.07;
    u.grainAmt.value = L?.grain ?? 1;
    material.defines = finalDefines();
    material.needsUpdate = true;
    wash?.dispose(); lite?.dispose(); brush?.dispose();
    wash = lite = brush = null;
    if (!L) return;
    wash = makeWash(1);
    if (L.strokes) {
      brush = makeBrush();
      if (strokeViews.length) brush.strokes.bake(strokeWorld, strokeViews);
      material.uniforms.tWash.value = brush.texture;
      material.uniforms.tOver.value = wash.texture;
      return;
    }
    lite = makeWash(0.5);
    const s = washSize(renderer.getDrawingBufferSize(new THREE.Vector2()), wash.scale);
    mixT.setSize(s.x, s.y);
    renderer.initRenderTarget(mixT); // allocated now, not in the frame the intro ends
    material.uniforms.tWash.value = wash.texture;
  }
  // While the camera travels the world is washed at half size, but the suitcase (an overlay that does
  // not move with the camera) keeps the full wash: the full pipeline runs only inside its box (scissored,
  // each step a little wider than the next so the Kuwahara and bleed taps read valid pixels), and the
  // mix pass keeps full strength inside the box with a soft edge. hiRect: CSS px { left, right, top, bottom }.
  const FEATHER = 28; // CSS px
  function scissorFull(r) {
    const css = renderer.domElement.clientWidth || innerWidth, cssH = renderer.domElement.clientHeight || innerHeight;
    const ws = washSize(renderer.getDrawingBufferSize(new THREE.Vector2()), wash.scale);
    const f = ws.x / css, fy = ws.y / cssH;
    const bleedPx = Math.ceil(L.bleed * wash.scale) + 4, radPx = Math.ceil(L.radius * wash.scale) + 4;
    const grow = [bleedPx + radPx + 4, bleedPx + 2, 0]; // prep, wash, bleed
    wash.steps.forEach(([rt], i) => {
      const g = grow[i];
      const x0 = Math.max(0, Math.floor(r.left * f) - g), x1 = Math.min(ws.x, Math.ceil(r.right * f) + g);
      const y0 = Math.max(0, Math.floor((cssH - r.bottom) * fy) - g), y1 = Math.min(ws.y, Math.ceil((cssH - r.top) * fy) + g);
      rt.scissor.set(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      rt.scissorTest = true;
    });
    const mu = mixP.m.uniforms;
    // a box that reaches near the screen edge runs off it, so no soft edge shows there
    const near = 2 * FEATHER;
    const u0 = r.left < near ? -1 : r.left / css, u1 = r.right > css - near ? 2 : r.right / css;
    const v0 = r.bottom > cssH - near ? -1 : (cssH - r.bottom) / cssH, v1 = r.top < near ? 2 : (cssH - r.top) / cssH;
    mu.hi.value.set(u0, v0, u1, v1);
    mu.feather.value.set(FEATHER / css, FEATHER / cssH);
  }
  function unscissor() { for (const [rt] of wash.steps) rt.scissorTest = false; mixP.m.uniforms.hi.value.set(2, 2, 2, 2); }
  function renderWash(t, sync, hiRect) {
    if (!wash) return;
    const dt = lastT === null ? 0 : Math.min(0.25, Math.max(0, t - lastT));
    lastT = t;
    if (dt === 0 && !sawFrame) motionK = motion ? 1 : 0; // the first frame starts where it should (the intro opens lite)
    else motionK = motion ? Math.min(1, motionK + dt / 0.35) : Math.max(0, motionK - dt / 0.6);
    sawFrame = true;
    const u = material.uniforms;
    if (motionK <= 0) { wash.render(sync); u.tWash.value = wash.texture; return; }
    const keep = motionK >= 1 && hiRect && hiRect.right > hiRect.left;
    if (motionK >= 1 && !keep) { lite.render(sync); u.tWash.value = lite.texture; return; }
    if (keep) scissorFull(hiRect);
    wash.render(sync); lite.render(sync);
    if (keep) unscissor(); else mixP.m.uniforms.hi.value.set(2, 2, 2, 2);
    const mu = mixP.m.uniforms;
    mu.tA.value = wash.texture; mu.tB.value = lite.texture;
    mu.k.value = motionK * motionK * (3 - 2 * motionK);
    renderer.setRenderTarget(mixT);
    renderer.render(mixP.sc, postCam);
    u.tWash.value = mixT.texture;
  }
  // drawing-buffer px per CSS px, inverted: 0.5 on a Retina screen, 1 elsewhere
  function washScale() { return Math.min(1, 1 / Math.max(1, renderer.getPixelRatio())); }
  function washSize(full, scale) { return new THREE.Vector2(Math.max(1, Math.round(full.x * scale)), Math.max(1, Math.round(full.y * scale))); }
  buildWash();

  function setLevel(n) {
    if (!validLevel(n)) return;
    if (n === level) return;
    level = n;
    L = levelOf(n);
    buildWash();
  }
  if (follow) settings.on('paint', setLevel);

  function bakeStrokes(world, views) {
    strokeWorld = world;
    strokeViews.push(...views);
    if (brush) brush.strokes.bake(world, views);
  }

  return {
    // Brush mode: views ([{ pos, target, fov }]) the camera will see, so strokes get placed there, now
    // (not during a frame). In the other modes they are only kept, for when brush mode is switched on.
    bakeStrokes,
    // cinema bars (0 = none, 1 = full ~2.2:1 letterbox), painted on the sheet inside the ragged border
    setBars(k) { material.uniforms.bars.value = Math.max(0, Math.min(1, k)); },
    get bars() { return material.uniforms.bars.value; },
    // intro grade ([r, g, b] multiplier) and vignette 0..1 (introlight.js)
    setGrade(rgb, vig = 0) { material.uniforms.grade.value.set(rgb[0], rgb[1], rgb[2]); material.uniforms.vignette.value = vig; },
    // overlay = { scene, camera }: drawn into the same target after the world, depth cleared, so it is
    // painted by the same pass but never hidden by (or clipped into) the walls.
    // sync (profiling only): called after each step with its name, to time it (see __siennaDebug.profile)
    render(scene, camera, t, overlay, sync) {
      const u = material.uniforms;
      u.borderSeed.value = (Math.floor(t * BOIL_FPS) % 64) * 1.37;
      u.seed.value = brush || L?.still ? 0 : u.borderSeed.value; // dry paint does not boil, but the sheet's ragged border does
      u.near.value = camera.near;
      u.far.value = camera.far;
      // Pan the paper with the camera's turn so cursor tilt moves scene and sheet together
      // (a grain glued to the screen would look like a filter on glass).
      camera.getWorldDirection(dir);
      const yaw = Math.atan2(dir.x, -dir.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
      const fovY = THREE.MathUtils.degToRad(camera.fov);
      const pxPerRad = u.resolution.value.y / fovY;
      u.paperOffset.value.set((yaw * pxPerRad) / 512, (pitch * pxPerRad) / 512);

      if (brush) {
        // a page that named no views gets strokes for what it is looking at
        if (!strokeViews.length) {
          bakeStrokes(scene, [{ pos: camera.getWorldPosition(new THREE.Vector3()), target: camera.getWorldPosition(new THREE.Vector3()).add(dir), fov: Math.min(100, camera.fov * 1.2) }]);
        }
      }
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      if (brush) {
        sync?.('scene');
        pan.set((yaw * pxPerRad) / u.resolution.value.x, (pitch * pxPerRad) / u.resolution.value.y);
        brush.render(pan, camera, sync);
        renderer.setRenderTarget(target);
        renderOverlay(renderer, overlay);
        u.overlayOn.value = overlay ? 1 : 0;
        const rect = overlay?.hiRect?.();
        u.overBox.value.set(2, 2, 2, 2);
        if (rect && rect.right > rect.left) {
          scissorFull(rect);
          wash.render(sync);
          u.overBox.value.copy(mixP.m.uniforms.hi.value);
          unscissor();
        }
        renderer.setRenderTarget(null);
        renderer.render(post, postCam);
        sync?.('final');
        return;
      }
      renderOverlay(renderer, overlay);
      sync?.('scene');
      renderWash(t, sync, overlay?.hiRect?.());
      renderer.setRenderTarget(null);
      renderer.render(post, postCam);
      sync?.('final');
    },
    setSize() {
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      target.setSize(s.x, s.y);
      material.uniforms.resolution.value.copy(s);
      // a new pixel ratio (window moved to another screen) changes the wash scale: rebuild
      if (wash && wash.scale !== washScale()) buildWash();
      else if (brush) { wash.setSize(s); brush.setSize(s); }
      else if (wash) {
        wash.setSize(s); lite.setSize(s);
        const m = washSize(s, wash.scale);
        mixT.setSize(m.x, m.y);
      }
    },
    setLevel,
    // the camera is travelling (intro, flights): paint with the cheap half-size washes until it stops
    setMotion(on) { motion = !!on; },
    get level() { return level; },
    // where the world is drawn: warm-up compiles must use it too (it picks the shader's output variant)
    get target() { return target; },
  };
}
