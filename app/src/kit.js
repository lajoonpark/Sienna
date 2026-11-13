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
import { toon, ownColour } from './materials.js';

// the unit chain link (kit.link): ring radius and wire radius before scaling
export const LINK = { r: 0.5, tube: 0.12 };
export const BRICK = { len: 0.5, row: 0.24, gap: 0.028, depth: 0.2 };
const CELL = 8;       // metres
const CELL_MIN = 150; // pieces a square needs to be a mesh of its own
// Far squares of rounded pieces (bricks, blocks, flagstones: 108-300 triangles each) are drawn as plain
// boxes (12): under the paint a rounded edge a few metres away reads the same, and the street and vaults
// were most of the frame's triangles. A square is drawn rounded while the camera is within LOD_NEAR metres
// of it (its bounding sphere), else boxed. Both meshes share one set of instance matrices and colours.
const LOD_NEAR = 5;
const lodPairs = []; // [hi, lo] InstancedMeshes, switched by updateLod

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

// Stage-set walls (other-optimizations branch, C5): bricks and flagstones are drawn as flat cards, just
// the face you see (2 triangles instead of 300), laid exactly where the 3D pieces were with the same
// colours, so the courses, joints and colours stay and only the relief goes. ?walls=3d brings the real
// 3D pieces back (with the distance boxes below).
const WALLS = new URLSearchParams(globalThis.location?.search ?? '').get('walls');
export const CARD_WALLS = WALLS !== '3d';
function card(w, h, depth, face) {
  const g = new THREE.PlaneGeometry(w, h);
  if (face === 'top') { g.rotateX(-Math.PI / 2); g.translate(0, depth / 2, 0); } else g.translate(0, 0, depth / 2);
  return g;
}

class Part {
  constructor(geometry, material, { castShadow = true, receiveShadow = true, card = null, userData = null } = {}) {
    // a card casts no shadow of its own: the wall's mortar backing behind it does, and a lone face has
    // nothing to add to the shadow map but draw calls
    if (card && CARD_WALLS) { geometry = card; this.isCard = true; castShadow = false; }
    this.userData = userData; // copied onto every mesh it builds (e.g. noStrokes)
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
    const out = [];
    groups.forEach((ids, g) => {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, ids.length);
      ids.forEach((id, i) => {
        mesh.setMatrixAt(i, this.matrices[id]);
        mesh.setColorAt(i, this.colors[id]);
      });
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
      mesh.computeBoundingSphere(); // of its instances: what the renderer culls it by
      if (this.userData) Object.assign(mesh.userData, this.userData);
      out.push(mesh);
      // a square (not the leftovers spread over the whole street) of rounded pieces gets a boxed twin
      const square = g < groups.length - (rest.length ? 1 : 0);
      const lo = square && this.lowGeometry();
      if (lo) {
        const twin = new THREE.InstancedMesh(lo, this.material, ids.length);
        twin.instanceMatrix = mesh.instanceMatrix;
        twin.instanceColor = mesh.instanceColor;
        twin.castShadow = this.castShadow;
        twin.receiveShadow = this.receiveShadow;
        twin.boundingSphere = mesh.boundingSphere.clone();
        twin.visible = false; // until updateLod says the square is far
        if (this.userData) Object.assign(twin.userData, this.userData);
        lodPairs.push([mesh, twin]);
        out.push(twin);
      }
    });
    return out;
  }
  // a plain box the size of a rounded one (null: this part is not rounded)
  lowGeometry() {
    if (this.lo !== undefined) return this.lo;
    const p = this.geometry.type === 'RoundedBoxGeometry' ? this.geometry.parameters : null;
    this.lo = p ? new THREE.BoxGeometry(p.width, p.height, p.depth) : null;
    return this.lo;
  }
}

// Rounded near the camera, boxed further off (see LOD_NEAR). Call once a frame before drawing.
// Only squares that change switch, so a still camera changes nothing (the painter sees no new frame).
const _cam = new THREE.Vector3(), _ctr = new THREE.Vector3();
export function updateLod(camera) {
  camera.getWorldPosition(_cam);
  for (const [hi, lo] of lodPairs) {
    if (!hi.parent) continue;
    _ctr.copy(hi.boundingSphere.center).applyMatrix4(hi.matrixWorld);
    const near = _cam.distanceTo(_ctr) - hi.boundingSphere.radius < LOD_NEAR;
    if (hi.visible !== near) { hi.visible = near; lo.visible = !near; }
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
    brick: new Part(new RoundedBoxGeometry(BRICK.len, BRICK.row - BRICK.gap, BRICK.depth, 2, 0.035), white(), { card: card(BRICK.len, BRICK.row - BRICK.gap, BRICK.depth, 'front') }),
    block: new Part(new RoundedBoxGeometry(1, 1, 1, 1, 0.06), white()), // generic stone/wood block, scaled freely
    // the decor record sleeves (interior.js): no strokes pinned to them, and Oil paint's under-coat keeps their
    // own colours (materials.js ownColour), since a dab is wider than a spine
    sleeve: new Part(new RoundedBoxGeometry(1, 1, 1, 1, 0.06), ownColour(white()), { userData: { noStrokes: true } }),
    flag: new Part(new RoundedBoxGeometry(1, 0.12, 1, 2, 0.05), white(), { castShadow: false, card: WALLS === 'bricks' ? null : card(1, 1, 0.12, 'top') }),
    tile: new Part(halfPipe(), toon('#ffffff', { side: THREE.DoubleSide })),
    slat: new Part(new THREE.BoxGeometry(1, 1, 1), white()),
    rod: new Part(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), white()), // iron bars, pipes, poles (unit, scaled)
    // thin rods (details.js rod, radius up to THIN_ROD: railings and their balusters, lamp and plant cords,
    // wires): flagged ownColour like the sleeves. Thinner than a dab and often thinner than Oil paint's
    // downsampled depth, so dabs from the wall behind laid over them and only bits of each rod showed, the
    // bits sliding as the camera moved (Lajoon, 2026-11-13). Now each pixel of one keeps its own colour.
    wire: new Part(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), ownColour(white())),
    // chain links (details.js chain: the hanging plants' brass chains), an oval ring in the xy plane scaled to
    // size; thin like the wires, so flagged ownColour the same way
    link: new Part(new THREE.TorusGeometry(LINK.r, LINK.tube, 3, 8), ownColour(white()), { castShadow: false }),
    ball: new Part(new THREE.IcosahedronGeometry(0.5, 1), white()), // fruit, flowers, leaves (scaled)
    leaf: new Part(new THREE.SphereGeometry(0.5, 7, 5), white()),
    // small many-of pieces (string-of-pearls beads, fern leaflets, bougainvillea): 20 triangles, not a leaf's 60
    bead: new Part(new THREE.IcosahedronGeometry(0.5, 0), white()),
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
