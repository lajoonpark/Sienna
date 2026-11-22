// The records behind the page. One fixed canvas: a painted sky, 24 painted vinyls and their sleeves,
// and the suitcase player, regrouping as you scroll:
//   float   bare vinyls drifting about; brush and scatter them with the cursor
//   alley   they lift away while the shop section has the screen
//   rack    they line up, slip one by one into their sleeves, and the sleeves stand in a crate-table
//           rack (the app's trough): hover lifts three like a hand of cards, with a paper name tag
//   player  the picked record slides out of its sleeve and flies onto the suitcase player
//   edge    the sleeves float at the edges
//   ring    each record slides out of its sleeve to form a ring, the empty sleeves fall back
// Nothing passes through anything else: collide.js keeps records, sleeves and the case apart.
import {
  WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Mesh, CylinderGeometry, BoxGeometry, PlaneGeometry,
  ShaderMaterial, Color, Vector3, Vector2, Quaternion, Euler, Matrix4, HemisphereLight, DirectionalLight, Fog, Raycaster,
  CanvasTexture, SRGBColorSpace, RepeatWrapping,
} from 'three';
import { clamp, smoothstep, lerp, rand, modeBlend, scatter, wave, MODE } from './layout.js';
import { resolve, separation } from './collide.js';
import { buildSuitcase } from './suitcase/model.js';
import { LidHinge } from './suitcase/lid.js';
import { LAYOUT as L, armAngleForProgress, parkedArmAngle } from './suitcase/tonearm.js';
import { VolumeKnob, RecordScrub, recordAngle } from './suitcase/controls.js';
import { RECORDS } from './paint/records.js';
import { createCovers } from './paint/coverart.js';
import { paintTexture } from './paint/worker.js';

const N = RECORDS.length;
const FOV = 35;
const CAM_Z = 14;
const FOG_NEAR = 13;
const FOG_FAR = 40;
const VINYL = 0.468;     // vinyl radius per sleeve size (the app's 0.145 m vinyl in a 0.31 m sleeve)
const SLIDE = 1.03;      // how far, in sleeve sizes, a vinyl slides to be clear of its sleeve
const THICK = 0.045;     // sleeve thickness per size
const DISC_H = 0.0175;   // vinyl half thickness per radius
const LABEL = 0.4;       // label radius per vinyl radius: the cover is printed on it
const RPM_33 = 3.49;
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

const VERT = /* glsl */ `
varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN; varying vec3 vRad; varying float vCap; varying vec2 vUv;
void main() {
  vLocal = position;
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * normal;
  vRad = mat3(modelMatrix) * vec3(position.xy, 0.0);
  vCap = normal.z;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const COMMON = /* glsl */ `
uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uLight; uniform float uGlow;
varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN; varying vec3 vRad; varying float vCap; varying vec2 vUv;
const vec3 LK = vec3(-0.4, 0.6, 0.7);
const vec3 LR = vec3(0.7, -0.25, 0.55);
float streak(vec3 T, vec3 L, vec3 V, float n) {
  vec3 H = normalize(L + V);
  float d = dot(T, H);
  return pow(sqrt(max(0.0, 1.0 - d * d)), n);
}
vec3 fogged(vec3 col) { return mix(col, uFog, smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld))); }`;

// A record: the app's painted vinyl face (concentric oil dabs, grooves, scuffs) with the light caught in
// the two streaks real vinyl shows, and the cover printed on the label.
const VINYL_FRAG = /* glsl */ `${COMMON}
uniform sampler2D uPaint; uniform float uHasPaint; uniform sampler2D uArt; uniform float uHasArt; uniform vec3 uSpine;
void main() {
  float r = length(vLocal.xy);
  if (r < 0.025) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 Lk = normalize(LK), Lr = normalize(LR);
  vec3 keyCol = vec3(1.0, 0.86, 0.66) * uLight;
  vec3 rimCol = vec3(0.55, 0.66, 1.0) * uLight;
  vec3 col;
  if (abs(vCap) < 0.5) {
    col = vec3(0.03, 0.025, 0.03) + keyCol * 0.22 * pow(max(dot(N, normalize(Lk + V)), 0.0), 20.0);
  } else {
    vec2 uv = vLocal.xy * 0.5 + 0.5;
    float facing = abs(dot(N, V));
    vec3 T = normalize(cross(N, normalize(vRad + vec3(1e-5))));
    vec3 paint = mix(vec3(0.026, 0.02, 0.025), texture2D(uPaint, uv).rgb, uHasPaint);
    float lit = 0.62 + 0.5 * max(dot(N, Lk), 0.0) + 0.16 * max(dot(N, Lr), 0.0);
    vec3 vinyl = paint * lit * (0.7 + 0.3 * uLight);
    vinyl += keyCol * streak(T, Lk, V, 26.0) * 0.24 + rimCol * streak(T, Lr, V, 40.0) * 0.1;
    vinyl += vec3(0.05, 0.045, 0.04) * pow(1.0 - facing, 3.0);
    vec2 luv = vLocal.xy / ${(2 * LABEL).toFixed(3)} + 0.5;
    if (vCap < 0.0) luv.x = 1.0 - luv.x;
    vec3 art = mix(uSpine, texture2D(uArt, luv).rgb, uHasArt);
    vec3 label = art * (0.6 + 0.46 * max(dot(N, Lk), 0.0)) * (0.78 + 0.22 * uLight);
    label *= 1.0 - 0.55 * smoothstep(0.05, 0.035, r);
    label += art * uGlow * 0.3;
    col = mix(label, vinyl, smoothstep(${(LABEL - 0.006).toFixed(3)}, ${(LABEL + 0.004).toFixed(3)}, r));
  }
  gl_FragColor = vec4(fogged(col), 1.0);
  #include <colorspace_fragment>
}`;

// A sleeve: the oil-painted cover front and back, a spine in the cover's own colour.
const SLEEVE_FRAG = /* glsl */ `${COMMON}
uniform sampler2D uArt; uniform float uHasArt; uniform vec3 uSpine; uniform float uEmpty;
void main() {
  vec3 N = normalize(vN);
  vec3 Lk = normalize(LK);
  float lit = 0.5 + 0.52 * max(dot(N, Lk), 0.0) + 0.12 * (N.y * 0.5 + 0.5);
  vec3 base = uSpine;
  if (abs(vCap) > 0.5) base = mix(uSpine * 1.15, texture2D(uArt, vUv).rgb, uHasArt);
  vec3 col = base * lit * (0.74 + 0.26 * uLight) + base * uGlow * 0.12;
  gl_FragColor = vec4(fogged(col), 1.0);
  #include <colorspace_fragment>
}`;

// The sky behind the page: the visitor's sky, laid on in broad white oil dabs, with a warm glow at the cursor.
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uBottom; uniform sampler2D uTex; uniform float uHasTex; uniform vec2 uRes; uniform vec3 uSun;
void main() {
  vec2 p = gl_FragCoord.xy;
  vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, p.y / uRes.y));
  float dab = texture2D(uTex, p / (560.0 * uSun.z)).r;
  c *= mix(1.0, 0.8 + 0.24 * dab, uHasTex);
  float d = length(p - uSun.xy) / uRes.y;
  c += vec3(0.95, 0.75, 0.45) * 0.09 * exp(-d * d * 3.5);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// a spring toward target on o[k] (velocity in o[k + 'V']), as the app's racks use
function spring(o, k, target, dt, w, z = 1, floor = -Infinity) {
  const vk = `${k}V`;
  let x = o[k] ?? 0, v = o[vk] ?? 0;
  const h = Math.min(dt, 1 / 30), n = Math.max(1, Math.ceil(h * 120));
  for (let i = 0; i < n; i++) { v += (w * w * (target - x) - 2 * z * w * v) * (h / n); x += v * (h / n); }
  if (dt > 1 / 30) x += (target - x) * (1 - Math.exp(-14 * (dt - 1 / 30)));
  if (x < floor) { x = floor; v = Math.max(0, v); }
  o[k] = x; o[vk] = v;
  return x;
}
const approach = (x, target, rate, dt) => (x < target ? Math.min(target, x + rate * dt) : Math.max(target, x - rate * dt));

export function createScene(canvas, { onHover = () => {}, onRack = () => {}, onPlayer = () => {}, onPick = () => {} } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  const scene = new Scene();
  const fogColor = new Color(0xf8ecd0);
  scene.fog = new Fog(fogColor, FOG_NEAR, FOG_FAR);
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  camera.position.set(0, 0, CAM_Z);

  // light for the suitcase, as the app lights it: warm, from the upper left front of the case
  const hemi = new HemisphereLight('#fff1da', '#a98a6a', 1.55);
  const sun = new DirectionalLight('#ffd9a2', 2.2);
  sun.position.set(-4, 3.5, 10);
  scene.add(hemi, sun);

  // ---- the sky ----
  const skyU = {
    uTop: { value: new Color('#9cc6e4') }, uBottom: { value: new Color('#f8f1e2') },
    uTex: { value: null }, uHasTex: { value: 0 }, uRes: { value: new Vector2(1, 1) }, uSun: { value: new Vector3(-9999, -9999, 1) },
  };
  const skyScene = new Scene();
  const skyCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  skyScene.add(new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}', fragmentShader: SKY_FRAG, uniforms: skyU, depthTest: false, depthWrite: false })));

  // ---- shared uniforms and textures ----
  const shared = {
    uFog: { value: fogColor }, uFogNear: { value: FOG_NEAR }, uFogFar: { value: FOG_FAR }, uLight: { value: 1 },
    uPaint: { value: null }, uHasPaint: { value: 0 },
  };
  const coverTex = RECORDS.map(() => null);
  const spines = RECORDS.map((r, i) => new Color().setHSL(rand(i, 21), 0.35, 0.45));
  const discGeo = new CylinderGeometry(1, 1, 2 * DISC_H, 96, 1).rotateX(Math.PI / 2);
  const sleeveGeo = new BoxGeometry(1, 1, 1);
  // BoxGeometry's normal.z marks the cover faces (vCap) in the sleeve shader

  const recs = RECORDS.map((rec, i) => {
    const vU = { ...shared, uGlow: { value: 0 }, uArt: { value: null }, uHasArt: { value: 0 }, uSpine: { value: spines[i] } };
    const sU = { ...shared, uGlow: { value: 0 }, uArt: { value: null }, uHasArt: { value: 0 }, uSpine: { value: spines[i] }, uEmpty: { value: 0 } };
    const vinyl = new Mesh(discGeo, new ShaderMaterial({ vertexShader: VERT, fragmentShader: VINYL_FRAG, uniforms: vU }));
    const sleeve = new Mesh(sleeveGeo, new ShaderMaterial({ vertexShader: VERT, fragmentShader: SLEEVE_FRAG, uniforms: sU }));
    sleeve.visible = false;
    scene.add(vinyl, sleeve);
    return {
      i, rec, vinyl, sleeve, vU, sU,
      // the pair's poses this frame (targets) and the physics on top of them
      sp: new Vector3(), sq: new Quaternion(), sc: 1,          // sleeve target: centre, turn, size
      vp: new Vector3(), vq: new Quaternion(), vr: 1,          // vinyl target: centre, turn, radius
      sOff: new Vector3(), sVel: new Vector3(), vOff: new Vector3(), vVel: new Vector3(),
      spin: rand(i, 9) * 6.28, spinVel: 0.3, glow: 0,
      slip: 0, fly: 0, ring: 0, present: 0, appear: 0, out: 1, glued: false,
      // the trough's springs (racks/trough.js in the app)
      fanA: 0, slot: 0, fx: 0, lift: 0,
      ndc: new Vector3(), ndcR: 0,
    };
  });

  const covers = createCovers(RECORDS, {
    size: 384,
    onPainted(i, painted) {
      const r = recs[i];
      if (!coverTex[i]) {
        const t = new CanvasTexture(covers.canvases[i]);
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 8;
        coverTex[i] = t;
        r.vU.uArt.value = r.sU.uArt.value = t;
        r.vU.uHasArt.value = r.sU.uHasArt.value = 1;
      }
      coverTex[i].needsUpdate = true;
      if (painted) {
        // the spine is the cover's average colour, a little deeper, as in the app
        const g = covers.canvases[i].getContext('2d');
        const d = g.getImageData(0, 0, covers.size, covers.size).data;
        let R = 0, G = 0, B = 0, n = 0;
        for (let k = 0; k < d.length; k += 4 * 97) { R += d[k]; G += d[k + 1]; B += d[k + 2]; n++; }
        spines[i].set(`rgb(${Math.round(R / n)},${Math.round(G / n)},${Math.round(B / n)})`).offsetHSL(0, 0.08, -0.06);
      }
    },
  });

  const texFrom = (c, repeat = false) => {
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
    return t;
  };
  paintTexture('vinyl').then((c) => { shared.uPaint.value = texFrom(c); shared.uHasPaint.value = 1; });
  paintTexture('sky').then((c) => { skyU.uTex.value = texFrom(c, true); skyU.uHasTex.value = 1; });

  // ---- the suitcase ----
  const kit = buildSuitcase();
  const player = kit.root;
  player.visible = false;
  scene.add(player);
  const caseTextures = {};
  for (const name of ['leather', 'lining', 'deck', 'cloth', 'strokes']) {
    paintTexture(name).then((c) => { caseTextures[name] = c; kit.paint(caseTextures); });
  }
  const hinge = new LidHinge();
  const knob = new VolumeKnob(0.7);
  const caseQ = new Quaternion();
  let caseScale = 1;
  const caseBox = { kind: 'box', p: new Vector3(), ax: new Vector3(), ay: new Vector3(), az: new Vector3(), e: [0, 0, 0], w: 0 };
  const lidBox = { kind: 'box', p: new Vector3(), ax: new Vector3(), ay: new Vector3(), az: new Vector3(), e: [0, 0, 0], w: 0 };

  // ---- state ----
  let hw = 7, hh = 4;
  let mode = 0;
  let motion = 1;
  let light = 1;
  let active = true;
  let picked = 2;
  const pointer = { x: 0, y: 0, active: false, px: 0, py: 0 };
  const song = { playing: true, progress: 0.18, liked: new Set([0]) };
  let scrub = null, knobDrag = null, pressed = null, caseHover = null, downAt = null;
  let thump = 0;
  let armAngle = parkedArmAngle(), armLift = 1;
  const hov = { previous: 0, playPause: 0, next: 0, like: 0, knob: 0, record: 0 };
  let hovered = -1, rackHover = -1, autoRack = 0;
  let layouts = null;
  const memory = new Map();

  const wide = () => hw > hh * 1.05;

  // ---- where everything goes, per section (recomputed when the window changes size) ----
  function relayout() {
    const rFloat = (i) => 0.55 + rand(i, 4) * 0.8;
    const float = scatter(N, { x0: 0.32 * hw, x1: 1.12 * hw, y0: -hh * 1.0, y1: hh * 1.0, z0: -7, z1: 2 }, rFloat, { room: 0.7, seed: 1, side: (i) => (i % 2 ? 1 : -1) });
    float.forEach((p, i) => { p.r = rFloat(i); });
    const away = scatter(N, { x0: -1.3 * hw, x1: 1.3 * hw, y0: hh * 1.35, y1: hh * 2.6, z0: -9, z1: 0 }, () => 1.2, { room: 0.3, seed: 3 });
    const back = scatter(N, { x0: -2.3 * hw, x1: 2.3 * hw, y0: -1.8 * hh, y1: 1.8 * hh, z0: -22, z1: -12 }, () => 1.3, { room: 0.4, seed: 5 });
    const cEdge = (i) => 0.95 + rand(i, 14) * 0.5;
    const edge = scatter(N, { x0: 1.02 * hw, x1: 1.5 * hw, y0: -1.1 * hh, y1: 1.1 * hh, z0: -7, z1: -1 }, (i) => cEdge(i) * 0.75, { room: 0.35, seed: 7, side: (i) => (i % 2 ? 1 : -1) });
    edge.forEach((p, i) => { p.c = cEdge(i); });
    // the rack: a row of sleeves standing mostly edge-on, a sliver of each cover showing
    const C = clamp(Math.min((hw * 1.5) / 7.4, hh * 0.36), 0.55, 1.6);
    const sp = 0.272 * C;
    const x0 = -((N - 1) * sp) / 2;
    const rack = recs.map((r, i) => ({
      x: x0 + i * sp + (rand(i, 31) - 0.5) * 0.03 * C,
      yaw: 1.3 + (rand(i, 32) - 0.5) * 0.08,
      roll: (rand(i, 33) - 0.5) * 0.05,
    }));
    const rackBase = wide() ? -hh * 0.8 : -hh * 0.62;
    // the ring around the download words: sleeves on the inside, their records slide out onto the ring
    const ra = Math.min(hw * 0.82, 7.2), rb = hh * 0.74;
    const per = Math.PI * (3 * (ra + rb) - Math.sqrt((3 * ra + rb) * (ra + 3 * rb)));
    const vr = clamp((per / N) * 0.36, 0.3, 0.62);
    layouts = { float, away, back, edge, rack, rackC: C, rackBase, ring: { ra, rb, vr, c: vr / VINYL } };
  }

  const tmpE = new Euler();
  const tq = new Quaternion(), tq2 = new Quaternion();
  const tv = new Vector3(), tv2 = new Vector3(), tv3 = new Vector3();
  const pose = () => ({ p: new Vector3(), q: new Quaternion(), c: 1 });
  const A = pose(), B = pose();

  // A sleeve pose for record i in layout m at time t (out: p, q, c). Vinyl-led layouts place the
  // (unseen) sleeve just below where the vinyl floats, so the vinyl rides SLIDE above it.
  function sleevePose(m, r, t, out) {
    const i = r.i;
    if (m === MODE.float || m === MODE.alley) {
      const f = m === MODE.float ? layouts.float[i] : layouts.away[i];
      const ph = rand(i, 8) * 6.28;
      const rad = m === MODE.float ? f.r : 0.85;
      tmpE.set(Math.sin(t * 0.21 + ph) * 0.7 + rand(i, 5) - 0.5, Math.cos(t * 0.17 + ph * 1.3) * 0.7 + rand(i, 6) - 0.5, 0);
      if (m === MODE.alley) tmpE.set(t * 0.12 + ph, t * 0.09 + ph, 0);
      out.q.setFromEuler(tmpE);
      out.c = rad / VINYL;
      out.p.set(f.x + Math.sin(t * 0.15 + ph) * 0.35, f.y + Math.cos(t * 0.12 + ph * 1.7) * 0.3, f.z);
      out.p.addScaledVector(tv.copy(Y).applyQuaternion(out.q), -SLIDE * out.c);
      return;
    }
    if (m === MODE.rack) {
      const C = layouts.rackC, rr = layouts.rack[i];
      const F = r.fanA, Lf = r.lift;
      const up = ss(F / 0.45), spread = ss((F - 0.25) / 0.42), T = ss((F - 0.4) / 0.6);
      const fanY = 0.97 * (1 - 0.12 * Math.abs(r.slot));
      const grow = 1 + 0.16 * T;
      out.c = C * grow;
      out.p.set(
        rr.x * (1 - spread) + r.fx * spread,
        layouts.rackBase + (C * grow) / 2 + C * (1.16 * up + (fanY - 1.16) * T + 0.13 * Lf),
        -0.065 * C + C * (0.9 + 0.16 * Lf - 0.1 * Math.abs(r.slot)) * spread,
      );
      tmpE.set(-0.26 * T, rr.yaw * (1 - T) - r.slot * 0.14 * T, rr.roll * (1 - T) - r.slot * 0.09 * T, 'YXZ');
      out.q.setFromEuler(tmpE);
      return;
    }
    if (m === MODE.player) {
      const b = layouts.back[i], ph = rand(i, 8) * 6.28;
      out.p.set(b.x, b.y + Math.sin(t * 0.1 + ph), b.z);
      tmpE.set(t * 0.08 + ph, t * 0.06 + ph, 0);
      out.q.setFromEuler(tmpE);
      out.c = 1.5;
      if (r.present > 0) {
        // the picked sleeve stands by the case, turned toward it
        const w = ss(r.present);
        const C = wide() ? Math.min(2.1, hh * 0.44) : Math.min(1.7, hw * 0.55);
        if (wide()) tv.set(hw * 0.13, hh * 0.1, -2.2);
        else tv.set(-hw * 0.45, -hh * 0.12, -2.0);
        tmpE.set(-0.05, wide() ? 0.32 : 0.22, -0.05);
        tq.setFromEuler(tmpE);
        out.p.lerp(tv, w);
        out.q.slerp(tq, w);
        out.c = lerp(out.c, C, w);
      }
      return;
    }
    if (m === MODE.edge) {
      const e = layouts.edge[i], ph = rand(i, 8) * 6.28, side = i % 2 ? 1 : -1;
      out.p.set(e.x, e.y + Math.cos(t * 0.14 + ph) * 0.4, e.z);
      tmpE.set(Math.sin(t * 0.2 + ph) * 0.35, side * -0.45 + Math.cos(t * 0.16 + ph) * 0.3, Math.sin(t * 0.11 + ph) * 0.2);
      out.q.setFromEuler(tmpE);
      out.c = e.c;
      return;
    }
    // ring
    const { ra, rb, c } = layouts.ring;
    const a = (i / N) * Math.PI * 2 + t * 0.06;
    const dx = Math.cos(a), dy = Math.sin(a);
    const recede = ss((wave(r.ring, i, N, 0.5) - 0.45) / 0.55);
    // the sleeve sits inward of the ring so its record slides out onto it, then falls back behind the
    // ring into the haze
    out.c = c * (1 - 0.25 * recede);
    out.p.set(dx * lerp(ra - SLIDE * c * 0.95, ra * 2.25, recede), dy * lerp(rb - SLIDE * c * 0.6, rb * 2.25, recede), -1.5 - 15 * recede);
    tmpE.set(-dy * 0.25 + recede * 0.4, dx * 0.3, a - Math.PI / 2 + recede * 0.5);
    out.q.setFromEuler(tmpE);
  }

  // where a record's vinyl sits on the ring
  function ringSpot(r, t, outP, outQ) {
    const { ra, rb, vr } = layouts.ring;
    const a = (r.i / N) * Math.PI * 2 + t * 0.06;
    outP.set(Math.cos(a) * ra, Math.sin(a) * rb, -1.2);
    tmpE.set(-Math.sin(a) * 0.45, Math.cos(a) * 0.55, 0);
    outQ.setFromEuler(tmpE);
    return vr;
  }

  // the platter's world pose for a record (the record's axis along the case's up)
  const seatM = new Matrix4(), seatQ = new Quaternion(), seatP = new Vector3(), seatS = new Vector3();
  const flatToDisc = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  function seatPose() {
    player.updateMatrixWorld(true);
    seatM.copy(kit.seat.matrixWorld).decompose(seatP, seatQ, seatS);
    seatQ.multiply(flatToDisc);
    return L.recordRadius * caseScale;
  }

  // The vinyl's flight from just above its sleeve (u = 0) to the platter (u = 1): up in an arc that
  // swells as it swoops over, then straight down onto the spindle. Reversible.
  const fp0 = new Vector3(), fp1 = new Vector3(), fp2 = new Vector3(), fp3 = new Vector3(), hover = new Vector3();
  function flight(u, startP, startQ, startR, outP, outQ) {
    const endR = seatPose();
    const caseUp = tv3.copy(Y).applyQuaternion(caseQ);
    hover.copy(seatP).addScaledVector(caseUp, 1.5 * caseScale);
    const toHover = 0.82;
    let r;
    if (u < toHover) {
      const e = ss(u / toHover);
      fp0.copy(startP);
      fp1.copy(startP).addScaledVector(Y, 2.6).lerp(hover, 0.15);
      fp2.copy(hover).addScaledVector(Y, 2.2);
      fp3.copy(hover);
      const k = 1 - e;
      outP.set(0, 0, 0)
        .addScaledVector(fp0, k * k * k).addScaledVector(fp1, 3 * k * k * e)
        .addScaledVector(fp2, 3 * k * e * e).addScaledVector(fp3, e * e * e);
      outQ.copy(startQ).slerp(seatQ, ss((e - 0.1) / 0.8));
      const wob = 1 - ss(e / 0.9);
      tmpE.set(0.35 * wob * Math.sin(e * 14), 0.25 * wob * Math.cos(e * 11), 0);
      outQ.multiply(tq2.setFromEuler(tmpE));
      r = lerp(startR, endR, e) * (1 + 0.28 * Math.sin(Math.PI * e));
    } else {
      const e = (u - toHover) / (1 - toHover);
      outP.copy(hover).lerp(seatP, e * e);
      outQ.copy(seatQ);
      r = endR;
    }
    return r;
  }

  // Cursor position in the world at depth z.
  const ray = new Vector3();
  function pointerAt(z, out) {
    ray.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
    return out.copy(camera.position).addScaledVector(ray, (z - camera.position.z) / ray.z);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    hh = Math.tan((FOV * Math.PI) / 360) * CAM_Z;
    hw = hh * camera.aspect;
    skyU.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    skyU.uSun.value.z = renderer.getPixelRatio();
    relayout();
  }

  const toPx = (ndc) => ({ x: (ndc.x * 0.5 + 0.5) * canvas.clientWidth, y: (-ndc.y * 0.5 + 0.5) * canvas.clientHeight });

  // ---- the suitcase's pose, state and hover ----
  const caseRay = new Raycaster();
  const hitMeshes = kit.hits.map((h) => h.mesh);
  const controlOf = new Map(kit.hits.map((h) => [h.mesh, h.control]));
  const ndcV = new Vector2();
  function pickCase() {
    if (!pointer.active || !player.visible) return null;
    ndcV.set(pointer.x, pointer.y);
    caseRay.setFromCamera(ndcV, camera);
    const hit = caseRay.intersectObjects(hitMeshes, false)[0];
    return hit ? controlOf.get(hit.object) : null;
  }
  // where the pointer's ray meets the deck's plane `height` up, in case coordinates
  const inv = new Matrix4(), localRay = new Vector3(), localO = new Vector3();
  function deckPoint(height) {
    ndcV.set(pointer.x, pointer.y);
    caseRay.setFromCamera(ndcV, camera);
    inv.copy(kit.caseRoot.matrixWorld).invert();
    localO.copy(caseRay.ray.origin).applyMatrix4(inv);
    localRay.copy(caseRay.ray.direction).transformDirection(inv);
    if (Math.abs(localRay.y) < 1e-5) return null;
    const k = (height - localO.y) / localRay.y;
    return k > 0 ? localO.addScaledVector(localRay, k) : null;
  }
  const seated = () => recs[picked].fly > 0.999;
  const duration = () => RECORDS[picked].duration;

  function setPicked(i) {
    picked = ((i % N) + N) % N;
    song.progress = 0.04;
    song.playing = true;
  }

  function placeCase(wPlayer) {
    const k = wide() ? Math.min(0.98, hw * 0.13, hh * 0.24) : Math.min(0.9, hw * 0.19);
    caseScale = k;
    if (wide()) player.position.set(hw * 0.42, -hh * 0.3, 0);
    else player.position.set(0.05, -hh * 0.5, 0);
    tmpE.set(0.62, wide() ? -0.36 : -0.12, 0, 'XYZ');
    caseQ.setFromEuler(tmpE);
    player.quaternion.copy(caseQ);
    player.scale.setScalar(k * (0.12 + 0.88 * ss(wPlayer)));
    player.visible = wPlayer > 0.05;
    kit.caseRoot.position.y = -thump;
  }

  let last = performance.now();
  let time = 0;
  let raf = 0;
  const cur = new Vector3();
  const qTilt = new Quaternion(), qSpin = new Quaternion();
  const bodies = [];
  const before = [];
  let lastCheck = null;
  const startP = new Vector3(), startQ = new Quaternion(), tp = new Vector3(), tqA = new Quaternion();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!active) return;
    time += dt * motion;
    const t = time;
    const { a, b, t: k } = modeBlend(mode);
    const weight = (m) => (a === m ? 1 - k : b === m ? k : 0);
    const wRack = weight(MODE.rack);
    const wPlayer = weight(MODE.player);

    // ---- the story beats: each runs at its own pace toward where the page is ----
    const sleeveOn = mode > 1.5;
    const flyOn = mode > 2.6 && mode < 3.45;
    const ringOn = mode > 4.6;
    for (const r of recs) {
      r.slip = approach(r.slip, sleeveOn ? 1 : 0, 0.55 * Math.max(1, motion), dt);
      r.present = approach(r.present, flyOn || (mode > 2.3 && mode < 3.6) ? (r.i === picked ? 1 : 0) : 0, 1.4, dt);
      const flyTarget = flyOn && r.i === picked && r.present > 0.7 ? 1 : 0;
      r.fly = approach(r.fly, flyTarget, flyTarget ? 0.62 : 0.8, dt);
      r.ring = approach(r.ring, ringOn ? 1 : 0, 0.42, dt);
    }

    // ---- the rack: which record is under the cursor (or, with no cursor, a slow flip through) ----
    if (wRack > 0.8) {
      const C = layouts.rackC;
      const settled = recs.every((r) => wave(r.slip, r.i, N, 0.45) > 0.999);
      let want = -1;
      if (pointer.active && settled) {
        pointerAt(0, cur);
        if (cur.y < layouts.rackBase + C * 3.2 && cur.y > layouts.rackBase - C * 1.4) {
          let best = Infinity;
          for (const r of recs) { const d = Math.abs(layouts.rack[r.i].x - cur.x); if (d < best) { best = d; want = r.i; } }
        }
      } else if (settled) {
        autoRack += dt * 0.55;
        const p = (Math.sin(autoRack * 0.6) * 0.5 + 0.5) * (N - 1);
        want = Math.round(p);
      }
      rackHover = want;
    } else rackHover = -1;
    for (const r of recs) {
      const kk = r.i - rackHover;
      const inFan = rackHover >= 0 && Math.abs(kk) <= 1;
      if (inFan) {
        const anchorX = layouts.rack[rackHover].x;
        const fxT = anchorX + kk * 0.88 * layouts.rackC;
        if (r.fanA < 0.02) { r.slot = kk; r.slotV = 0; r.fx = fxT; r.fxV = 0; }
        r.slotT = kk; r.fxT = fxT;
      }
      spring(r, 'slot', r.slotT ?? 0, dt, 16);
      spring(r, 'fx', r.fxT ?? layouts.rack[r.i].x, dt, 16);
      spring(r, 'fanA', inFan ? 1 : 0, dt, inFan ? 15 : 18, inFan ? 0.8 : 1, 0);
      spring(r, 'lift', r.i === rackHover ? 1 : 0, dt, r.i === rackHover ? 19 : 21, 1, 0);
    }

    // ---- poses: blend the two layouts, then the beats ----
    for (const r of recs) {
      sleevePose(a, r, t, A);
      sleevePose(b, r, t, B);
      r.sp.lerpVectors(A.p, B.p, k);
      r.sq.slerpQuaternions(A.q, B.q, k);
      r.sc = lerp(A.c, B.c, k);
      const q = wave(r.slip, r.i, N, 0.45);
      r.appear = ss(q / 0.35);
      const inSleeve = ss((q - 0.35) / 0.45);
      const flyOut = ss(r.fly / 0.22);
      const ringOut = ss(wave(r.ring, r.i, N, 0.5) / 0.45);
      r.ringT = wave(r.ring, r.i, N, 0.5);
      r.out = Math.max(1 - inSleeve, flyOut, ringOut);
      // the vinyl rides out of its sleeve along the sleeve's up
      r.vr = VINYL * r.sc;
      r.vq.copy(r.sq);
      r.vp.copy(Y).applyQuaternion(r.sq).multiplyScalar(r.out * SLIDE * r.sc).add(r.sp);
      r.glued = r.out < 0.985;
      r.free = 0;
      if (r.fly > 0.22) {
        startP.copy(r.vp); startQ.copy(r.vq);
        r.vr = flight((r.fly - 0.22) / 0.78, startP, startQ, r.vr, r.vp, r.vq);
        r.free = 1;
      } else if (r.ringT > 0.45) {
        const e = ss((r.ringT - 0.45) / 0.55);
        const vr = ringSpot(r, t, tp, tqA);
        r.vp.lerp(tp, e);
        r.vq.slerp(tqA, e);
        r.vr = lerp(r.vr, vr, e);
        r.free = 1;
      }
    }

    // ---- the suitcase ----
    placeCase(wPlayer);
    if (mode > 2.35 && mode < 3.65) { if (hinge.mode !== 'opening' && hinge.angle < hinge.stop - 1e-3) hinge.release(); }
    else if (hinge.angle > 0 && hinge.mode !== 'closing') hinge.shut();
    let impact = 0;
    for (let rest = dt; rest > 1e-6; rest -= 0.25) impact = Math.max(impact, hinge.step(Math.min(rest, 0.25)));
    kit.lidPivot.rotation.x = -hinge.angle;
    if (impact > 0) thump = Math.max(thump, Math.min(impact, 8) * 0.012);
    thump *= Math.exp(-dt * 16);
    const onPlatter = seated();
    if (onPlatter && song.playing && !scrub) song.progress = Math.min(1, song.progress + dt / duration());
    if (song.progress >= 1) { setPicked(picked + 1); }
    const armTarget = onPlatter ? armAngleForProgress(song.progress) : parkedArmAngle();
    armAngle += (armTarget - armAngle) * (1 - Math.exp(-6 * dt));
    kit.armPivot.rotation.y = armAngle;
    const travelling = Math.abs(armTarget - armAngle) > 0.04;
    armLift += ((!onPlatter || travelling ? 1 : 0) - armLift) * (1 - Math.exp(-8 * dt));
    kit.armLift.rotation.z = -0.1 * armLift;
    kit.knob.rotation.y = -knob.angle;
    caseHover = knobDrag || scrub ? caseHover : wPlayer > 0.5 && hinge.openness > 0.55 ? pickCase() : null;
    for (const name of Object.keys(hov)) {
      const want = caseHover === name || (name === 'knob' && knobDrag) || (name === 'record' && scrub) ? 1 : 0;
      hov[name] += (want - hov[name]) * (1 - Math.exp(-16 * dt));
    }
    for (const [name, btn] of Object.entries(kit.buttons)) {
      const h = hov[name];
      btn.capMat.color.lerpColors(kit.colors.ink, kit.colors.hot, h);
      btn.ringMat.color.lerpColors(kit.colors.brass, kit.colors.brassLight, h);
      btn.cap.position.y = 0.03 * h - (pressed === name ? 0.032 : 0);
      btn.glyph.scale.setScalar(1 + 0.12 * h);
    }
    const glyphFor = { playPause: song.playing ? 'pause' : 'play', like: song.liked.has(picked) ? 'heartFill' : 'heart' };
    for (const [name, key] of Object.entries(glyphFor)) {
      const m = kit.buttons[name].glyphMat;
      if (m.map !== kit.glyphs[key]) { m.map = m.emissiveMap = kit.glyphs[key]; m.needsUpdate = true; }
    }
    kit.knobMat.color.lerpColors(kit.colors.ink, kit.colors.hot, hov.knob);
    kit.knobTopMat.color.lerpColors(kit.colors.knobTop, kit.colors.hot, hov.knob);
    kit.rimMat.opacity = 0.6 * hov.record * (onPlatter ? 1 : 0.4);
    kit.sheen.visible = onPlatter;
    player.updateMatrixWorld(true);
    kit.space.value.copy(kit.caseRoot.matrixWorld).invert();

    // ---- physics: spring back to the layout, pushed off by the cursor, kept apart ----
    const repel = [1, 0.3, 0, 0.3, 1, 0.8];
    const rep = repel[a] * (1 - k) + repel[b] * k;
    const step = (off, vel, base, s) => {
      if (pointer.active && rep > 0) {
        pointerAt(base.z, cur);
        const dx = base.x + off.x - cur.x, dy = base.y + off.y - cur.y;
        const dist = Math.hypot(dx, dy) || 1e-3, reach = 2.4 + s;
        if (dist < reach) {
          const f = (1 - dist / reach) ** 2 * 46 * rep;
          vel.x += (dx / dist) * f * dt;
          vel.y += (dy / dist) * f * dt;
        }
      }
      vel.addScaledVector(off, -9 * dt).multiplyScalar(Math.exp(-3.2 * dt));
      off.addScaledVector(vel, dt);
    };
    for (const r of recs) {
      step(r.sOff, r.sVel, r.sp, r.sc * 0.5);
      if (r.glued) { r.vOff.copy(r.sOff); r.vVel.copy(r.sVel); }
      else if (r.free && r.fly > 0) { r.vOff.multiplyScalar(Math.exp(-6 * dt)); r.vVel.set(0, 0, 0); }
      else step(r.vOff, r.vVel, r.vp, r.vr);
    }
    // the bodies, at their positions this frame
    bodies.length = 0;
    before.length = 0;
    const caseOn = player.visible && wPlayer > 0.3;
    if (caseOn) {
      // the base, and the open lid standing up behind it
      const s = player.scale.x;
      caseBox.ax.set(1, 0, 0).applyQuaternion(caseQ); caseBox.ay.set(0, 1, 0).applyQuaternion(caseQ); caseBox.az.set(0, 0, 1).applyQuaternion(caseQ);
      caseBox.e = [L.caseWidth / 2 * s, L.baseHeight / 2 * s, L.caseDepth / 2 * s];
      caseBox.p.copy(caseBox.ay).multiplyScalar(L.baseHeight / 2 * s).add(player.position);
      const la = hinge.angle;
      tq.setFromAxisAngle(caseBox.ax, -la).multiply(caseQ);
      lidBox.ax.set(1, 0, 0).applyQuaternion(tq); lidBox.ay.set(0, 1, 0).applyQuaternion(tq); lidBox.az.set(0, 0, 1).applyQuaternion(tq);
      lidBox.e = [L.caseWidth / 2 * s, L.lidHeight / 2 * s, L.caseDepth / 2 * s];
      lidBox.p.copy(caseBox.ay).multiplyScalar(L.baseHeight * s).add(player.position)
        .addScaledVector(caseBox.az, -L.caseDepth / 2 * s).addScaledVector(lidBox.az, L.caseDepth / 2 * s).addScaledVector(lidBox.ay, L.lidHeight / 2 * s);
      bodies.push(caseBox, lidBox);
    }
    const index = [];
    for (const r of recs) {
      const sleeveIn = r.appear > 0.5;
      if (sleeveIn) {
        const body = r.sBody ??= { kind: 'box', p: new Vector3(), ax: new Vector3(), ay: new Vector3(), az: new Vector3(), e: [0, 0, 0], w: 1, v: null };
        body.p.copy(r.sp).add(r.sOff);
        body.ax.set(1, 0, 0).applyQuaternion(r.sq); body.ay.set(0, 1, 0).applyQuaternion(r.sq); body.az.set(0, 0, 1).applyQuaternion(r.sq);
        body.e = [r.sc / 2, r.sc / 2, (THICK * r.sc) / 2];
        // held: the hand of cards at the rack, and the picked sleeve once it stands by the case
        body.w = (r.fanA > 0.05 && rackHover >= 0) || r.present > 0.95 ? 0 : 1;
        body.v = r.sVel;
        index.push({ r, kind: 's' });
        bodies.push(body);
      }
      const vinylIn = !r.glued || r.free;
      if (vinylIn) {
        const body = r.vBody ??= { kind: 'disk', p: new Vector3(), n: new Vector3(), r: 1, h: 0, w: 1, v: null };
        body.p.copy(r.vp).add(r.vOff);
        body.n.copy(Z).applyQuaternion(r.vq);
        body.r = r.vr;
        body.h = DISC_H * r.vr;
        body.w = r.fly > 0 ? 0 : 1;
        body.v = r.vVel;
        index.push({ r, kind: 'v' });
        bodies.push(body);
      }
    }
    for (const b2 of bodies) before.push(b2.p.clone());
    const off = caseOn ? 2 : 0;
    const skip = (i, j) => {
      if (i < off && j < off) return true;
      const A2 = index[i - off], B2 = index[j - off];
      if (!A2 || !B2) {
        // the case against a record on (or flying to) its platter
        const x = A2 ?? B2;
        return x.r.i === picked && x.r.fly > 0;
      }
      return A2.r === B2.r;
    };
    resolve(bodies, { margin: 0.03, iterations: 8, memory, skip });
    lastCheck = { bodies, skip };
    for (let n = off; n < bodies.length; n++) {
      const { r, kind } = index[n - off];
      const d = tv.copy(bodies[n].p).sub(before[n]);
      if (kind === 's') { r.sOff.add(d); if (r.glued) r.vOff.copy(r.sOff); }
      else r.vOff.add(d);
    }

    // ---- hover (bare records) ----
    let best = -1, bestDepth = Infinity;
    for (const r of recs) {
      const vis = r.vinyl.visible;
      if (!vis || r.glued || !pointer.active || wRack > 0.5 || r.fly > 0) continue;
      const ex = (r.ndc.x - pointer.x) * camera.aspect, ey = r.ndc.y - pointer.y;
      const depth = camera.position.z - r.vinyl.position.z;
      if (Math.hypot(ex, ey) < r.ndcR && depth < bestDepth) { best = r.i; bestDepth = depth; }
    }
    if (best !== hovered) hovered = best;

    // ---- meshes ----
    for (const r of recs) {
      const isHover = hovered === r.i;
      r.glow += ((isHover ? 1 : 0) - r.glow) * Math.min(1, dt * 8);
      const platter = r.fly > 0.999;
      const wantSpin = platter ? (song.playing && !scrub ? -RPM_33 : 0) : r.fly > 0 ? -9 : isHover ? 7 : 0.35 * motion;
      r.spinVel += (wantSpin - r.spinVel) * Math.min(1, dt * (platter ? 4 : 2.5));
      if (!(platter && scrub)) r.spin += r.spinVel * dt;
      // records lean toward the cursor as it passes
      let prox = 0, dx = 0, dy = 0;
      if (pointer.active && rep > 0 && !r.glued) {
        pointerAt(r.vp.z, cur);
        dx = r.vp.x + r.vOff.x - cur.x; dy = r.vp.y + r.vOff.y - cur.y;
        prox = Math.exp(-(dx * dx + dy * dy) / 14) * Math.max(rep, 0.25);
      }
      tmpE.set(clamp(dy * 0.16, -0.6, 0.6) * prox, clamp(-dx * 0.16, -0.6, 0.6) * prox, 0);
      qTilt.setFromEuler(tmpE);
      // sleeve
      r.sleeve.visible = r.appear > 0.01;
      if (r.sleeve.visible) {
        r.sleeve.position.copy(r.sp).add(r.sOff);
        r.sleeve.quaternion.copy(r.sq);
        const sc = r.sc * ss(r.appear);
        r.sleeve.scale.set(sc, sc, THICK * r.sc);
        if (r.appear < 1) r.sleeve.position.y -= (1 - ss(r.appear)) * r.sc * 0.6;
        r.sU.uGlow.value = r.lift * 0.6;
      }
      // vinyl
      r.vinyl.visible = r.out > 0.02 || r.free > 0;
      if (r.vinyl.visible) {
        r.vinyl.position.copy(r.vp).add(r.vOff);
        if (r.glued) r.vinyl.quaternion.copy(r.vq);
        else r.vinyl.quaternion.copy(qTilt).multiply(r.vq);
        r.vinyl.quaternion.multiply(qSpin.setFromAxisAngle(Z, r.spin));
        r.vinyl.scale.setScalar(r.vr * (1 + r.glow * 0.1));
        r.vU.uGlow.value = r.glow;
      }
      r.ndc.copy(r.vinyl.position).project(camera);
      r.ndcR = r.vr / (hh * ((camera.position.z - r.vinyl.position.z) / CAM_Z));
    }
    shared.uLight.value = light;

    // ---- tell the page ----
    const caseCtl = caseHover && isButtonOrKnob(caseHover) ? 'link' : caseHover === 'record' ? 'player' : null;
    onHover(caseCtl ?? (hovered >= 0 ? 'disk' : rackHover >= 0 && pointer.active ? 'disk' : null));
    if (wRack > 0.5 && rackHover >= 0 && recs[rackHover].fanA > 0.6) {
      const r = recs[rackHover];
      tv.set(0, -0.5, 0).applyQuaternion(r.sleeve.quaternion).multiplyScalar(r.sleeve.scale.x).add(r.sleeve.position);
      tv2.set(0.5, 0, 0).applyQuaternion(r.sleeve.quaternion).multiplyScalar(r.sleeve.scale.x).add(r.sleeve.position);
      const p = toPx(tv.project(camera)), q2 = toPx(tv2.project(camera));
      onRack({ visible: true, index: rackHover, x: p.x, y: p.y, w: Math.abs(q2.x - p.x) * 2, color: `#${spines[rackHover].getHexString()}` });
    } else onRack({ visible: false });
    let rect = null;
    if (wPlayer > 0.5) {
      // the case's box on screen, for the paper caption to dock to
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [cx, cy, cz] of [[-1, 0, 1], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 1, 1], [1, 1, 1]]) {
        tv.set(cx * L.caseWidth / 2, cy * L.baseHeight, cz * L.caseDepth / 2).applyMatrix4(kit.caseRoot.matrixWorld).project(camera);
        const p = toPx(tv);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      rect = { left: x0, right: x1, top: y0, bottom: y1 };
    }
    onPlayer({
      visible: wPlayer > 0.5, rect, index: picked, title: RECORDS[picked].title, artist: RECORDS[picked].artist,
      playing: song.playing, seconds: song.progress * duration(), total: duration(), liked: song.liked.has(picked), seated: onPlatter,
      volume: knob.volume,
    });

    renderer.clear();
    renderer.render(skyScene, skyCam);
    renderer.render(scene, camera);
  }
  const isButtonOrKnob = (c) => c === 'previous' || c === 'playPause' || c === 'next' || c === 'like' || c === 'knob';

  function setPointer(clientX, clientY, on = true) {
    const rect = canvas.getBoundingClientRect();
    pointer.px = clientX;
    pointer.py = clientY;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    pointer.active = on;
    const pr = renderer.getPixelRatio();
    skyU.uSun.value.set(clientX * pr, (rect.height - clientY) * pr, pr);
    if (knobDrag) {
      const p = deckPoint(L.deckHeight + 0.12);
      if (p) knob.drag(recordAngle(p.x - 1.4, p.z + 0.3));
    }
    if (scrub) {
      const p = deckPoint(L.recordTop);
      if (p) {
        const ang = recordAngle(p.x - L.record.x, p.z - L.record.z);
        const before2 = scrub.s.lastAngle;
        scrub.s.update(ang);
        let step2 = ang - before2;
        while (step2 > Math.PI) step2 -= 2 * Math.PI;
        while (step2 < -Math.PI) step2 += 2 * Math.PI;
        scrub.moved += Math.abs(step2);
        recs[picked].spin -= step2;
        song.progress = scrub.s.progress;
      }
      scrub.travel += Math.hypot(clientX - scrub.x, clientY - scrub.y);
      scrub.x = clientX; scrub.y = clientY;
    }
  }

  // Returns true when the press was taken (a control, the record, a sleeve) so the page skips its burst.
  function press(clientX, clientY) {
    setPointer(clientX, clientY);
    const { a, b, t: k } = modeBlend(mode);
    const wRack = a === MODE.rack ? 1 - k : b === MODE.rack ? k : 0;
    const control = pickCase();
    if (control) {
      if (isButtonOrKnob(control) && control !== 'knob') {
        pressed = control;
        if (control === 'playPause') song.playing = !song.playing;
        else if (control === 'like') { if (song.liked.has(picked)) song.liked.delete(picked); else song.liked.add(picked); }
        else setPicked(picked + (control === 'next' ? 1 : -1));
      } else if (control === 'knob') knobDrag = true;
      else if (control === 'record' && seated()) {
        const p = deckPoint(L.recordTop);
        scrub = { s: new RecordScrub(p ? recordAngle(p.x - L.record.x, p.z - L.record.z) : 0, song.progress * duration(), duration()), moved: 0, travel: 0, x: clientX, y: clientY };
      }
      return true;
    }
    if (wRack > 0.5 && rackHover >= 0) {
      setPicked(rackHover);
      recs[rackHover].lift = 1.3;
      onPick(rackHover);
      return true;
    }
    burst();
    return false;
  }

  function release() {
    pressed = null;
    knobDrag = null;
    if (scrub) {
      if (scrub.moved < 0.06 && scrub.travel < 6) song.playing = !song.playing;
      scrub = null;
    }
  }

  function burst() {
    for (const r of recs) {
      if (r.glued) continue;
      pointerAt(r.vinyl.position.z, cur);
      const dx = r.vinyl.position.x - cur.x, dy = r.vinyl.position.y - cur.y;
      const dist = Math.hypot(dx, dy) || 1e-3;
      const f = 16 / (1 + dist * dist * 0.12);
      r.vVel.x += (dx / dist) * f;
      r.vVel.y += (dy / dist) * f;
      r.vVel.z += (rand(r.i, 11) - 0.5) * f * 0.5;
      r.spinVel += 9;
    }
  }

  function setSky(top, bottom, mid, dark) {
    skyU.uTop.value.set(top);
    skyU.uBottom.value.set(bottom);
    fogColor.set(mid);
    scene.fog.color.copy(fogColor);
    light = dark ? 0.62 : 1;
    hemi.intensity = 1.55 * (dark ? 0.7 : 1);
    sun.intensity = 2.2 * (dark ? 0.62 : 1);
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  raf = requestAnimationFrame(frame);

  return {
    setMode: (s) => { mode = s; },
    setSky,
    setPointer,
    clearPointer: () => { pointer.active = false; },
    press,
    release,
    togglePlay: () => { song.playing = !song.playing; },
    command(name) {
      if (name === 'next' || name === 'previous') setPicked(picked + (name === 'next' ? 1 : -1));
      else if (name === 'like') { if (song.liked.has(picked)) song.liked.delete(picked); else song.liked.add(picked); }
      else if (name === 'toggle') song.playing = !song.playing;
    },
    seek: (p) => { song.progress = clamp(p, 0, 1); },
    setMotion: (m) => { motion = m; },
    setActive: (on) => { if (on && !active) last = performance.now(); active = on; },
    covers,
    // checks: how many pairs of bodies still overlap after this frame's solve (should stay 0)
    overlaps(details = false) {
      if (!lastCheck) return 0;
      const { bodies: b, skip } = lastCheck;
      const out = [];
      for (let i = 0; i < b.length; i++) {
        for (let j = i + 1; j < b.length; j++) {
          const s = (b[i].w || b[j].w) && !skip(i, j) && separation(b[i], b[j], 0);
          if (s) out.push({ a: [b[i].kind, b[i].w], b: [b[j].kind, b[j].w], depth: +s.depth.toFixed(3) });
        }
      }
      return details ? out : out.length;
    },
    debug: () => ({ mode, hovered, rackHover, picked, song: { ...song, liked: [...song.liked] }, hw, hh, recs: recs.map((r) => ({ slip: r.slip, fly: r.fly, ring: r.ring, out: r.out, appear: r.appear })) }),
  };
}
