// Instanced building kit. Thousands of bricks, flagstones, tiles and slats are collected here as
// (matrix, colour) pairs and turned into InstancedMeshes at the end, so a whole street of real 3D
// masonry costs a handful of draw calls. An InstancedMesh is drawn all or nothing, and as one mesh
// per part every brick of the street was still sent to the GPU from deep inside the shop (3.8
// million triangles a frame, many of them behind the camera). So a part with a lot of pieces is cut
// into one mesh per CELL-metre square of ground, and a square outside the view is skipped. Only
// squares worth a draw call of their own: a few pieces here and there stay together in one mesh,
// since a draw call costs more than their triangles do. Measured from home and the eight stations:
// 15 more draw calls a frame on average, 43% fewer of these triangles (smaller squares or none
// left over: twice the draw calls for another 5%).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from './materials.js';

export const BRICK = { len: 0.5, row: 0.24, gap: 0.028, depth: 0.2 };
const CELL = 8;       // metres
const CELL_MIN = 150; // pieces a square needs to be a mesh of its own

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Matrix from position, Euler rotation (x, y, z) and scale.
export function trs(px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
}

class Part {
  constructor(geometry, material, { castShadow = true, receiveShadow = true } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.matrices = [];
    this.colors = [];
  }
  add(matrix, color) {
    this.matrices.push(matrix.clone());
    this.colors.push(_c.set(color).clone());
  }
  // -> its InstancedMeshes: one per well-filled square, and one for everything else
  build() {
    const cells = new Map();
    this.matrices.forEach((m, i) => {
      const key = `${Math.floor(m.elements[12] / CELL)},${Math.floor(m.elements[14] / CELL)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    });
    const groups = [], rest = [];
    for (const ids of cells.values()) { if (ids.length >= CELL_MIN) groups.push(ids); else rest.push(...ids); }
    if (rest.length) groups.push(rest);
    return groups.map((ids) => {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, ids.length);
      ids.forEach((id, i) => {
        mesh.setMatrixAt(i, this.matrices[id]);
        mesh.setColorAt(i, this.colors[id]);
      });
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
      mesh.computeBoundingSphere(); // of its instances: what the renderer culls it by
      return mesh;
    });
  }
}

function halfPipe() {
  // canal roof tile: half cylinder along +z, open side down
  const g = new THREE.CylinderGeometry(0.11, 0.12, 1, 7, 1, true, -Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  return g;
}

export function createKit() {
  const white = () => toon('#ffffff');
  const parts = {
    brick: new Part(new RoundedBoxGeometry(BRICK.len, BRICK.row - BRICK.gap, BRICK.depth, 2, 0.035), white()),
    block: new Part(new RoundedBoxGeometry(1, 1, 1, 1, 0.06), white()), // generic stone/wood block, scaled freely
    flag: new Part(new RoundedBoxGeometry(1, 0.12, 1, 2, 0.05), white(), { castShadow: false }),
    tile: new Part(halfPipe(), toon('#ffffff', { side: THREE.DoubleSide })),
    slat: new Part(new THREE.BoxGeometry(1, 1, 1), white()),
    rod: new Part(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), white()), // iron bars, pipes, poles (unit, scaled)
    ball: new Part(new THREE.IcosahedronGeometry(0.5, 1), white()), // fruit, flowers, leaves (scaled)
    leaf: new Part(new THREE.SphereGeometry(0.5, 7, 5), white()),
    cone: new Part(new THREE.ConeGeometry(0.5, 1, 4), white()),
    pot: new Part(new THREE.CylinderGeometry(0.5, 0.36, 1, 12), white()),
    disc: new Part(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), white()),
  };
  return {
    ...parts,
    // Bake everything into the given group.
    flush(root) {
      for (const p of Object.values(parts)) for (const mesh of p.build()) root.add(mesh);
    },
  };
}

// Mul helper: parent * child, returns new matrix.
export function mul(parent, child) {
  return _m.multiplyMatrices(parent, child).clone();
}
