// The floating vinyls. One fixed canvas behind the page: the same records regroup as you scroll
// (floating -> a rack to flip through -> one on the suitcase player -> the edges -> a ring).
import {
  WebGLRenderer, Scene, PerspectiveCamera, Mesh, CylinderGeometry, BoxGeometry, ShaderMaterial,
  MeshStandardMaterial, Color, Vector3, Quaternion, Euler, Group, HemisphereLight, DirectionalLight, Fog,
} from 'three';
import { clamp, smoothstep, rand, modeBlend, armAngle, needleRadius } from './layout.js';

const LABELS = ['#a6442f', '#2d3158', '#f2c641', '#5d7a3a', '#f3e6cc', '#963420', '#c96a3f', '#3f5a26'];
const FOV = 35;
const CAM_Z = 14;
const FOG_NEAR = 13;
const FOG_FAR = 40;
const SONG_SECONDS = 90;
const RPM_33 = (33.333 / 60) * Math.PI * 2;

const VERT = /* glsl */ `
varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN; varying vec3 vRad; varying float vCap;
void main() {
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * normal;
  vRad = mat3(modelMatrix) * vec3(position.xy, 0.0);
  vCap = abs(normal.z);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// A bare record: black grooves that catch the light in the two streaks real vinyl shows, and a
// plain painted label (a colour and a ring, no cover art).
const FRAG = /* glsl */ `
uniform vec3 uLabel; uniform vec3 uFog; uniform float uGlow; uniform float uFogNear; uniform float uFogFar;
uniform float uLight;
varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN; varying vec3 vRad; varying float vCap;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float streak(vec3 T, vec3 L, vec3 V, float n) {
  vec3 H = normalize(L + V);
  float d = dot(T, H);
  return pow(sqrt(max(0.0, 1.0 - d * d)), n);
}
void main() {
  float r = length(vLocal.xy);
  if (r < 0.03) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 Lk = normalize(vec3(-0.4, 0.6, 0.7));
  vec3 Lr = normalize(vec3(0.7, -0.25, 0.55));
  vec3 keyCol = vec3(1.0, 0.86, 0.66) * uLight;
  vec3 rimCol = vec3(0.55, 0.66, 1.0) * uLight;
  vec3 col;
  if (vCap < 0.5) {
    col = vec3(0.012) + keyCol * 0.25 * pow(max(dot(N, normalize(Lk + V)), 0.0), 20.0);
  } else {
    float facing = abs(dot(N, V));
    vec3 T = normalize(cross(N, normalize(vRad)));
    float w = fwidth(r) * 420.0;
    float groove = mix(0.5, 0.5 + 0.5 * sin(r * 420.0), clamp(1.0 - w / 2.5, 0.0, 1.0));
    float gap = smoothstep(0.007, 0.0, abs(r - 0.56)) + smoothstep(0.007, 0.0, abs(r - 0.74))
              + smoothstep(0.006, 0.0, abs(r - 0.88)) + smoothstep(0.40, 0.385, r) + smoothstep(0.965, 0.985, r);
    gap = clamp(gap, 0.0, 1.0);
    float sk = streak(T, Lk, V, 26.0);
    float sr = streak(T, Lr, V, 40.0);
    vec3 vinyl = vec3(0.016, 0.014, 0.013) * (0.6 + 0.8 * facing);
    vinyl += keyCol * sk * mix(0.26 + 0.34 * groove, 0.10, gap);
    vinyl += rimCol * sr * mix(0.10 + 0.16 * groove, 0.04, gap);
    vinyl += vec3(0.05, 0.045, 0.04) * pow(1.0 - facing, 3.0);
    float lit = 0.5 + 0.55 * max(dot(N, Lk), 0.0) + 0.2 * max(dot(N, Lr), 0.0);
    float dab = 0.94 + 0.12 * hash(floor(vLocal.xy * 46.0));
    vec3 label = uLabel * lit * dab * (0.75 + 0.25 * uLight);
    label *= 1.0 - 0.35 * smoothstep(0.006, 0.0, abs(r - 0.30));
    label *= 1.0 - 0.55 * smoothstep(0.024, 0.016, length(vLocal.xy - vec2(0.2, 0.0)));
    label *= 1.0 - 0.6 * smoothstep(0.05, 0.035, r);
    label += uLabel * uGlow * 0.45;
    col = mix(label, vinyl, smoothstep(0.336, 0.346, r));
  }
  float fog = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld));
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createScene(canvas, { count = 26, onHover = () => {}, onRack = () => {}, onPlayer = () => {} } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new Scene();
  scene.fog = new Fog(0xf8ecd0, FOG_NEAR, FOG_FAR);
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  camera.position.set(0, 0, CAM_Z);

  const hemi = new HemisphereLight(0xfff1dc, 0x3a2a20, 1.2);
  const sun = new DirectionalLight(0xffe2b8, 2.2);
  sun.position.set(-4, 6, 8);
  scene.add(hemi, sun);

  const fogColor = new Color(0xf8ecd0);
  const diskGeo = new CylinderGeometry(1, 1, 0.035, 96, 1).rotateX(Math.PI / 2);
  const disks = [];
  for (let i = 0; i < count; i++) {
    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uLabel: { value: new Color(LABELS[i % LABELS.length]) },
        uFog: { value: fogColor },
        uGlow: { value: 0 },
        uLight: { value: 1 },
        uFogNear: { value: FOG_NEAR },
        uFogFar: { value: FOG_FAR },
      },
    });
    const mesh = new Mesh(diskGeo, material);
    scene.add(mesh);
    disks.push({
      mesh, material, i,
      offset: new Vector3(), vel: new Vector3(),
      spin: rand(i, 9) * 6.28, spinVel: 0.3, glow: 0, grow: 0,
      ndc: new Vector3(), ndcR: 0,
    });
  }

  // The suitcase player under record 0.
  const player = new Group();
  const std = (color, roughness = 0.8) => new MeshStandardMaterial({ color, roughness, metalness: 0 });
  const cyl = (r, h) => new CylinderGeometry(r, r, h, 48).rotateX(Math.PI / 2);
  const add = (geo, mat, x, y, z, parent = player) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  add(new BoxGeometry(3.5, 2.9, 0.5), std('#7a4526'), 0.2, 0, -0.37);
  add(new BoxGeometry(3.3, 2.7, 0.04), std('#d9c39a', 0.95), 0.2, 0, -0.11);
  add(cyl(1.04, 0.06), std('#2a2320', 0.6), 0, 0, -0.055);
  add(cyl(0.022, 0.12), std('#e8dcc0', 0.4), 0, 0, 0.03);
  const knob = add(cyl(0.16, 0.12), std('#a6442f', 0.5), 1.5, -0.95, -0.04);
  add(new BoxGeometry(0.03, 0.12, 0.02), std('#f8f1e2'), 0, 0.07, 0.065, knob);
  add(cyl(0.13, 0.16), std('#3a302b', 0.5), 1.3, 0.95, -0.02);
  const arm = new Group();
  arm.position.set(1.3, 0.95, 0.1);
  add(new BoxGeometry(1.45, 0.045, 0.04).translate(0.52, 0, 0), std('#e8dcc0', 0.35), 0, 0, 0, arm);
  add(new BoxGeometry(0.17, 0.1, 0.06), std('#2b2436', 0.5), 1.25, 0, -0.02, arm);
  add(cyl(0.07, 0.09).rotateY(Math.PI / 2), std('#3a302b', 0.5), -0.24, 0, 0, arm);
  player.add(arm);
  player.visible = false;
  scene.add(player);

  let hw = 7;
  let hh = 4;
  let mode = 0;
  let motion = 1;
  let light = 1;
  const pointer = { x: 0, y: 0, active: false, px: 0, py: 0 };
  const song = { playing: true, progress: 0.12 };
  let armR = needleRadius(null);
  let scrub = null;
  let hovered = -1;
  let rackFocus = 0;

  const tmpE = new Euler();
  const A = { p: new Vector3(), q: new Quaternion(), s: 1, repel: 1 };
  const B = { p: new Vector3(), q: new Quaternion(), s: 1, repel: 1 };
  const base = { p: new Vector3(), q: new Quaternion() };
  const qTilt = new Quaternion();
  const qSpin = new Quaternion();
  const Z_AXIS = new Vector3(0, 0, 1);
  const v = new Vector3();
  const ray = new Vector3();

  const wide = () => hw > hh * 1.05;

  const layouts = [
    function float(i, t, out) {
      const side = i % 2 ? 1 : -1;
      const ph = rand(i, 8) * 6.28;
      out.p.set(
        side * (0.3 + 0.85 * rand(i, 1)) * hw + Math.sin(t * 0.15 + ph) * 0.5,
        (rand(i, 2) * 2 - 1) * hh * 1.05 + Math.cos(t * 0.12 + ph * 1.7) * 0.45,
        -7 + rand(i, 3) * 9,
      );
      tmpE.set(Math.sin(t * 0.21 + ph) * 0.7 + rand(i, 5) - 0.5, Math.cos(t * 0.17 + ph * 1.3) * 0.7 + rand(i, 6) - 0.5, 0);
      out.q.setFromEuler(tmpE);
      out.s = 0.55 + rand(i, 4) * 0.9;
      out.repel = 1;
    },
    function rack(i, t, out) {
      const spacing = Math.min(0.7, (hw * 1.7) / count);
      const x0 = (i - (count - 1) / 2) * spacing;
      const d = x0 - rackFocus;
      const near = smoothstep(0, 1, 1 - Math.abs(d) / (spacing * 2.2));
      const far = 1 - near;
      const sgn = d >= 0 ? 1 : -1;
      out.p.set(x0 + sgn * far * 0.75, -hh * 0.36, near * 1.8);
      tmpE.set(0, -sgn * far * 1.15, 0);
      out.q.setFromEuler(tmpE);
      out.s = Math.min(1.15, hw * 0.34) * (1 + near * 0.2);
      out.repel = 0;
    },
    function playerMode(i, t, out) {
      if (i === 0) {
        if (wide()) out.p.set(hw * 0.42, -0.1, 0);
        else out.p.set(-0.1, -hh * 0.45, 0);
        tmpE.set(-0.95, wide() ? -0.22 : 0, 0);
        out.q.setFromEuler(tmpE);
        out.s = wide() ? Math.min(1.7, hw * 0.2) : hw * 0.48;
        out.repel = 0;
        return;
      }
      const ph = rand(i, 8) * 6.28;
      out.p.set((rand(i, 1) * 2 - 1) * hw * 2.4, (rand(i, 2) * 2 - 1) * hh * 2 + Math.sin(t * 0.1 + ph), -12 - rand(i, 3) * 10);
      tmpE.set(t * 0.1 + ph, t * 0.07 + ph, 0);
      out.q.setFromEuler(tmpE);
      out.s = 0.9;
      out.repel = 0.3;
    },
    function edge(i, t, out) {
      const side = i % 2 ? 1 : -1;
      const ph = rand(i, 8) * 6.28;
      out.p.set(
        side * hw * (0.95 + rand(i, 7) * 0.5),
        (rand(i, 2) * 2 - 1) * hh * 1.1 + Math.cos(t * 0.14 + ph) * 0.5,
        -4 + rand(i, 3) * 4,
      );
      tmpE.set(Math.sin(t * 0.2 + ph) * 0.8, side * -0.5 + Math.cos(t * 0.16 + ph) * 0.6, 0);
      out.q.setFromEuler(tmpE);
      out.s = 0.45 + rand(i, 4) * 0.5;
      out.repel = 1;
    },
    function ring(i, t, out) {
      const a = (i / count) * Math.PI * 2 + t * 0.1;
      out.p.set(Math.cos(a) * Math.min(hw * 0.84, 7.2), Math.sin(a) * hh * 0.72, -1.5);
      tmpE.set(-Math.sin(a) * 0.5, Math.cos(a) * 0.6, 0);
      out.q.setFromEuler(tmpE);
      out.s = clamp(hw * 0.12, 0.38, 0.8);
      out.repel = 0.8;
    },
  ];

  // Cursor position in the world at depth z.
  function pointerAt(z, out) {
    ray.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const k = (z - camera.position.z) / ray.z;
    return out.copy(camera.position).addScaledVector(ray, k);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    hh = Math.tan((FOV * Math.PI) / 360) * CAM_Z;
    hw = hh * camera.aspect;
  }

  const toPx = (ndc) => ({ x: (ndc.x * 0.5 + 0.5) * canvas.clientWidth, y: (-ndc.y * 0.5 + 0.5) * canvas.clientHeight });

  let last = performance.now();
  let time = 0;
  let raf = 0;
  const cur = new Vector3();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt * motion;
    const t = time;
    const { a, b, t: k } = modeBlend(mode);
    const weight = (m) => (a === m ? 1 - k : b === m ? k : 0);
    const wRack = weight(1);
    const wPlayer = weight(2);

    // The rack opens at the cursor; with no cursor (touch) it flips through by itself.
    const span = Math.min(0.7, (hw * 1.7) / count) * (count - 1) * 0.5;
    const wantFocus = pointer.active ? clamp(pointerAt(0, cur).x, -span, span) : Math.sin(t * 0.5) * span * 0.8;
    rackFocus += (wantFocus - rackFocus) * Math.min(1, dt * 7);

    // Song and tonearm.
    if (song.playing && !scrub && wPlayer > 0.5) song.progress = (song.progress + dt / SONG_SECONDS) % 1;
    const wantR = needleRadius(wPlayer > 0.6 ? song.progress : null);
    armR += (wantR - armR) * Math.min(1, dt * 5);
    arm.rotation.z = armAngle(armR);
    knob.rotation.z = -2.2 + pointer.x * 0.6;

    let best = -1;
    let bestDepth = Infinity;
    let rackTop = -1;
    let rackNear = Infinity;

    for (const d of disks) {
      layouts[a](d.i, t, A);
      layouts[b](d.i, t, B);
      base.p.lerpVectors(A.p, B.p, k);
      base.q.slerpQuaternions(A.q, B.q, k);
      const s = A.s + (B.s - A.s) * k;
      const repel = A.repel + (B.repel - A.repel) * k;

      // Spring back to the layout, pushed off by the cursor.
      let prox = 0;
      let dx = 0;
      let dy = 0;
      if (pointer.active) {
        pointerAt(base.p.z, cur);
        dx = base.p.x + d.offset.x - cur.x;
        dy = base.p.y + d.offset.y - cur.y;
        const dist = Math.hypot(dx, dy) || 1e-3;
        const reach = 2.6 + s;
        if (dist < reach) {
          const f = (1 - dist / reach) ** 2 * 46 * repel;
          d.vel.x += (dx / dist) * f * dt;
          d.vel.y += (dy / dist) * f * dt;
        }
        prox = Math.exp(-(dist * dist) / 14) * Math.max(repel, 0.25);
      }
      d.vel.addScaledVector(d.offset, -9 * dt).multiplyScalar(Math.exp(-3.2 * dt));
      d.offset.addScaledVector(d.vel, dt);

      const isHover = hovered === d.i;
      d.glow += ((isHover ? 1 : 0) - d.glow) * Math.min(1, dt * 8);
      const onPlatter = d.i === 0 && wPlayer > 0.5;
      const wantSpin = onPlatter ? (song.playing && !scrub ? -RPM_33 : 0) : isHover ? 7 : 0.35 * motion;
      d.spinVel += (wantSpin - d.spinVel) * Math.min(1, dt * (onPlatter ? 4 : 2.5));
      if (!(onPlatter && scrub)) d.spin += d.spinVel * dt;

      // Records lean toward the cursor as it passes.
      tmpE.set(clamp(dy * 0.16, -0.6, 0.6) * prox, clamp(-dx * 0.16, -0.6, 0.6) * prox, 0);
      qTilt.setFromEuler(tmpE);
      qSpin.setFromAxisAngle(Z_AXIS, d.spin);
      d.mesh.position.copy(base.p).add(d.offset);
      d.mesh.quaternion.copy(qTilt).multiply(base.q).multiply(qSpin);
      d.mesh.scale.setScalar(s * (1 + d.glow * 0.12));
      d.material.uniforms.uGlow.value = d.glow;
      d.material.uniforms.uLight.value = light;

      d.ndc.copy(d.mesh.position).project(camera);
      const depth = camera.position.z - d.mesh.position.z;
      d.ndcR = s / (hh * (depth / CAM_Z));
      if (pointer.active) {
        const ex = (d.ndc.x - pointer.x) * camera.aspect;
        const ey = d.ndc.y - pointer.y;
        if (Math.hypot(ex, ey) < d.ndcR && depth < bestDepth) {
          best = d.i;
          bestDepth = depth;
        }
      }
      if (wRack > 0.5) {
        const off = Math.abs(base.p.x - rackFocus);
        if (off < rackNear) {
          rackNear = off;
          rackTop = d.i;
        }
      }
      if (d.i === 0) {
        player.visible = wPlayer > 0.02;
        if (player.visible) {
          player.position.copy(d.mesh.position);
          player.quaternion.copy(qTilt).multiply(base.q);
          player.scale.setScalar(s * smoothstep(0, 1, wPlayer));
        }
      }
    }

    if (wRack > 0.5 && rackTop >= 0) best = pointer.active || best < 0 ? rackTop : best;
    if (best !== hovered) {
      hovered = best;
      onHover(best < 0 ? null : best === 0 && wPlayer > 0.5 ? 'player' : 'disk');
    }

    if (wRack > 0.5 && rackTop >= 0) {
      const d = disks[rackTop];
      v.copy(d.mesh.position);
      v.y += d.mesh.scale.x + 0.15;
      onRack({ visible: true, index: rackTop, color: LABELS[rackTop % LABELS.length], ...toPx(v.project(camera)) });
    } else onRack({ visible: false });
    onPlayer({ visible: wPlayer > 0.5, playing: song.playing, seconds: song.progress * SONG_SECONDS, total: SONG_SECONDS });

    renderer.render(scene, camera);
  }

  function setPointer(clientX, clientY, active = true) {
    const rect = canvas.getBoundingClientRect();
    pointer.px = clientX;
    pointer.py = clientY;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    pointer.active = active;
    if (scrub) {
      const c = toPx(disks[0].ndc);
      const ang = Math.atan2(-(clientY - c.y), clientX - c.x);
      let delta = ang - scrub.angle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      scrub.angle = ang;
      scrub.moved += Math.abs(delta);
      disks[0].spin += delta;
      song.progress = (((song.progress - (delta / (Math.PI * 2)) * 0.1) % 1) + 1) % 1;
    }
  }

  // Returns true when the press was on the record on the player (so the page skips its burst).
  function press(clientX, clientY) {
    setPointer(clientX, clientY);
    const onPlayerDisk = Math.abs(mode - 2) < 0.5;
    const d0 = disks[0];
    const hit = Math.hypot((d0.ndc.x - pointer.x) * camera.aspect, d0.ndc.y - pointer.y) < d0.ndcR;
    if (onPlayerDisk && hit) {
      const c = toPx(d0.ndc);
      scrub = { angle: Math.atan2(-(clientY - c.y), clientX - c.x), moved: 0 };
      return true;
    }
    burst();
    return false;
  }

  function release() {
    if (!scrub) return;
    if (scrub.moved < 0.06) song.playing = !song.playing;
    scrub = null;
  }

  function burst() {
    for (const d of disks) {
      pointerAt(d.mesh.position.z, cur);
      const dx = d.mesh.position.x - cur.x;
      const dy = d.mesh.position.y - cur.y;
      const dist = Math.hypot(dx, dy) || 1e-3;
      const f = 16 / (1 + dist * dist * 0.12);
      d.vel.x += (dx / dist) * f;
      d.vel.y += (dy / dist) * f;
      d.vel.z += (rand(d.i, 11) - 0.5) * f * 0.5;
      d.spinVel += 9;
    }
  }

  function setSky(hex, dark) {
    fogColor.set(hex);
    scene.fog.color.copy(fogColor);
    light = dark ? 0.62 : 1;
    hemi.intensity = 1.2 * light;
    sun.intensity = 2.2 * light;
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
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
    setMotion: (m) => { motion = m; },
    debug: () => ({ mode, hovered, song: { ...song }, hw, hh }),
  };
}
