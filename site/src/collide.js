// Records never pass through each other: a small position solver for thin disks (vinyls) and thin
// boxes (sleeves). Pure maths on {x, y, z} objects (THREE.Vector3 works), shared with the Node tests.
//
//   body = { kind: 'disk', p, n, r, h, w }            centre, unit normal, radius, half thickness
//        | { kind: 'box', p, ax, ay, az, e, w }       centre, unit axes, half extents [x, y, z]
//   w: how easily it is pushed (0 = held in place). Optional v (velocity) loses its approaching part.
//   separation(A, B, margin) -> null | { depth, x, y, z }   push B along (x, y, z) by depth (A the other way)
//   resolve(bodies, { margin, iterations, skip(i, j), memory }) moves the bodies apart in place.

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// Half the extent of a body along unit axis k.
export function reach(b, kx, ky, kz) {
  if (b.kind === 'disk') {
    const c = b.n.x * kx + b.n.y * ky + b.n.z * kz;
    return b.r * Math.sqrt(Math.max(0, 1 - c * c)) + b.h * Math.abs(c);
  }
  return b.e[0] * Math.abs(b.ax.x * kx + b.ax.y * ky + b.ax.z * kz)
    + b.e[1] * Math.abs(b.ay.x * kx + b.ay.y * ky + b.ay.z * kz)
    + b.e[2] * Math.abs(b.az.x * kx + b.az.y * ky + b.az.z * kz);
}

export const bound = (b) => (b.kind === 'disk' ? b.r : Math.hypot(b.e[0], b.e[1], b.e[2]));

// Overlap of A and B along unit axis k (<= 0: separated), and the sign that pushes B away from A.
function along(A, B, dx, dy, dz, kx, ky, kz, margin) {
  const d = dx * kx + dy * ky + dz * kz;
  return { o: reach(A, kx, ky, kz) + reach(B, kx, ky, kz) + margin - Math.abs(d), s: d >= 0 ? 1 : -1 };
}

// The smallest push along a set of candidate axes, or null if one of them separates the pair.
function satAxes(A, B, axes, dx, dy, dz, margin) {
  let best = null;
  for (const [kx, ky, kz] of axes) {
    const m = len(kx, ky, kz);
    if (m < 1e-6) continue;
    const ux = kx / m, uy = ky / m, uz = kz / m;
    const { o, s } = along(A, B, dx, dy, dz, ux, uy, uz, margin);
    if (o <= 0) return null;
    if (!best || o < best.depth) best = { depth: o, x: ux * s, y: uy * s, z: uz * s };
  }
  return best;
}

const cross = (a, b) => [a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x];

function diskDisk(A, B, dx, dy, dz, margin) {
  const nA = A.n, nB = B.n;
  const dist = len(dx, dy, dz);
  const cands = [];
  // the faces: B pushed off A's face, or A off B's
  const fa = along(A, B, dx, dy, dz, nA.x, nA.y, nA.z, margin);
  if (fa.o <= 0) return null;
  cands.push({ depth: fa.o, x: nA.x * fa.s, y: nA.y * fa.s, z: nA.z * fa.s });
  const fb = along(A, B, dx, dy, dz, nB.x, nB.y, nB.z, margin);
  if (fb.o <= 0) return null;
  cands.push({ depth: fb.o, x: nB.x * fb.s, y: nB.y * fb.s, z: nB.z * fb.s });
  if (dist > 1e-6) {
    const c = along(A, B, dx, dy, dz, dx / dist, dy / dist, dz / dist, margin);
    if (c.o <= 0) return null;
    cands.push({ depth: c.o, x: (dx / dist) * c.s, y: (dy / dist) * c.s, z: (dz / dist) * c.s });
  }
  const cosAB = dot(nA, nB);
  if (Math.abs(cosAB) > 0.99) {
    // (nearly) parallel: apart within their plane, or one in front of the other
    const dn = dx * nA.x + dy * nA.y + dz * nA.z;
    const px = dx - dn * nA.x, py = dy - dn * nA.y, pz = dz - dn * nA.z, pd = len(px, py, pz);
    const o = A.r + B.r + margin - pd;
    if (o <= 0) return null;
    if (pd > 1e-6) cands.push({ depth: o, x: px / pd, y: py / pd, z: pz / pd });
  } else {
    // crossing planes: each disk cuts their common line in a chord; apart once the chords part
    let [ux, uy, uz] = cross(nA, nB);
    const s = len(ux, uy, uz);
    ux /= s; uy /= s; uz /= s;
    const dB = dx * nB.x + dy * nB.y + dz * nB.z;         // B's plane, measured from A's centre
    // the common line's point nearest A's centre: along u x nA, at dB / s
    const qx = (uy * nA.z - uz * nA.y) * (dB / s), qy = (uz * nA.x - ux * nA.z) * (dB / s), qz = (ux * nA.y - uy * nA.x) * (dB / s);
    // a thick rim can reach into the other slab without crossing its middle plane: it does so within
    // (thicknesses / sin of the angle between the planes) of the common line, so the radii grow by that
    const grow = (A.h + B.h + margin) / s;
    const rA = A.r + margin + grow, rB = B.r + margin + grow;
    const distA = len(qx, qy, qz);
    if (distA >= rA) return null;
    const tB = dx * ux + dy * uy + dz * uz;
    const bx = dx - qx - tB * ux, by = dy - qy - tB * uy, bz = dz - qz - tB * uz;
    const distB = len(bx, by, bz);
    if (distB >= rB) return null;
    const chord = Math.sqrt(rA * rA - distA * distA) + Math.sqrt(rB * rB - distB * distB) + A.h + B.h - Math.abs(tB);
    if (chord <= 0) return null;
    const sg = tB >= 0 ? 1 : -1;
    cands.push({ depth: chord, x: ux * sg, y: uy * sg, z: uz * sg });
  }
  let best = cands[0];
  for (const c of cands) if (c.depth < best.depth) best = c;
  return best;
}

export function separation(A, B, margin = 0) {
  const dx = B.p.x - A.p.x, dy = B.p.y - A.p.y, dz = B.p.z - A.p.z;
  if (len(dx, dy, dz) > bound(A) + bound(B) + margin) return null;
  if (A.kind === 'disk' && B.kind === 'disk') return diskDisk(A, B, dx, dy, dz, margin);
  const axes = [];
  const boxAxes = (b) => [b.ax, b.ay, b.az];
  if (A.kind === 'box' && B.kind === 'box') {
    const a = boxAxes(A), b = boxAxes(B);
    for (const k of a) axes.push([k.x, k.y, k.z]);
    for (const k of b) axes.push([k.x, k.y, k.z]);
    for (const i of a) for (const j of b) axes.push(cross(i, j));
  } else {
    const disk = A.kind === 'disk' ? A : B, box = A.kind === 'disk' ? B : A;
    axes.push([disk.n.x, disk.n.y, disk.n.z]);
    for (const k of boxAxes(box)) { axes.push([k.x, k.y, k.z]); axes.push(cross(disk.n, k)); }
  }
  axes.push([dx, dy, dz]);
  return satAxes(A, B, axes, dx, dy, dz, margin);
}

// A pair of nearly parallel disks that swapped sides within one step went through each other: push
// them back to the side they were on (memory keeps that side per pair).
function tunnelled(A, B, key, memory, margin) {
  if (!memory || A.kind !== 'disk' || B.kind !== 'disk' || Math.abs(dot(A.n, B.n)) < 0.97) { memory?.delete(key); return null; }
  const dx = B.p.x - A.p.x, dy = B.p.y - A.p.y, dz = B.p.z - A.p.z;
  const dn = dx * A.n.x + dy * A.n.y + dz * A.n.z;
  const inPlane = len(dx - dn * A.n.x, dy - dn * A.n.y, dz - dn * A.n.z);
  if (inPlane > A.r + B.r || Math.abs(dn) > (A.r + B.r) * 0.5) { memory.delete(key); return null; }
  const side = Math.sign(dn) || 1;
  const was = memory.get(key);
  if (was === undefined || was === side) { memory.set(key, side); return null; }
  return { depth: Math.abs(dn) + A.h + B.h + margin, x: A.n.x * was, y: A.n.y * was, z: A.n.z * was };
}

export function resolve(bodies, { margin = 0.02, iterations = 3, skip = null, memory = null } = {}) {
  const n = bodies.length;
  let pushes = 0;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const A = bodies[i];
      if (!A) continue;
      for (let j = i + 1; j < n; j++) {
        const B = bodies[j];
        if (!B || (A.w === 0 && B.w === 0) || skip?.(i, j)) continue;
        const key = i * n + j;
        const sep = (it === 0 && tunnelled(A, B, key, memory, margin)) || separation(A, B, margin);
        if (!sep) continue;
        const total = A.w + B.w, kA = A.w / total, kB = B.w / total;
        A.p.x -= sep.x * sep.depth * kA; A.p.y -= sep.y * sep.depth * kA; A.p.z -= sep.z * sep.depth * kA;
        B.p.x += sep.x * sep.depth * kB; B.p.y += sep.y * sep.depth * kB; B.p.z += sep.z * sep.depth * kB;
        // contact is soft and dead: whatever was carrying them into each other stops
        if (A.v && kA > 0) { const a = A.v.x * sep.x + A.v.y * sep.y + A.v.z * sep.z; if (a > 0) { A.v.x -= a * sep.x; A.v.y -= a * sep.y; A.v.z -= a * sep.z; } }
        if (B.v && kB > 0) { const b = B.v.x * sep.x + B.v.y * sep.y + B.v.z * sep.z; if (b < 0) { B.v.x -= b * sep.x; B.v.y -= b * sep.y; B.v.z -= b * sep.z; } }
        if (memory && A.kind === 'disk' && B.kind === 'disk') {
          const dn = (B.p.x - A.p.x) * A.n.x + (B.p.y - A.p.y) * A.n.y + (B.p.z - A.p.z) * A.n.z;
          if (memory.has(key)) memory.set(key, Math.sign(dn) || 1);
        }
        moved = true;
        pushes++;
      }
    }
    if (!moved) break;
  }
  return pushes;
}

// Do two bodies overlap at all (for tests and checks)?
export const overlaps = (A, B, margin = 0) => !!separation(A, B, margin);
