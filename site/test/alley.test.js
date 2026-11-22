import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { sunAt } from '../src/alley/sun.js';

// Match the site's resolution of Three.js even when only site/ has been installed.
const vite = await createServer({ server: { middlewareMode: true, ws: false } });
let path, buildShop;
try {
  path = await vite.ssrLoadModule('/src/alley/path.js');
  ({ buildShop } = await vite.ssrLoadModule('../app/src/shop.js'));
} finally {
  await vite.close();
}
const { cameraAt, DOOR_OPEN, clockAt, T, HOME } = path;

test('the preview keeps the hall and lounge but builds fewer instances than the full shop', (t) => {
  const context = {
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { delete globalThis.document; });

  const preview = buildShop({ preview: true });
  const full = buildShop();
  assert.ok(preview.getObjectByName('hall'));
  assert.deepEqual(Object.keys(preview.userData.stationFurniture), ['gallery', 'cubby', 'lounge']);
  for (const id of ['stacks', 'libPlaylists', 'libAlbums', 'courtyard']) {
    assert.ok(full.userData.stationFurniture[id], `the full shop still has ${id}`);
  }
  const instances = (root) => {
    let count = 0;
    root.traverseVisible((o) => { if (o.isInstancedMesh) count += o.count; });
    return count;
  };
  assert.ok(instances(preview) < instances(full) * 0.7, 'omitted rooms are not allocated for the web preview');
});

test('the walk starts in the alley behind the stall and ends inside the shop', () => {
  const a = cameraAt(0).pos;
  assert.ok(a.z > 20 && a.y < 1, `starts low in the alley (${a.z.toFixed(1)}, ${a.y.toFixed(2)})`);
  const b = cameraAt(0.9).pos;
  assert.ok(b.distanceTo(HOME.pos) < 0.05, 'reaches the spot just inside the door');
  assert.ok(cameraAt(1).pos.z < -0.55, 'and stays inside the hall');
});

test('scrolling only ever walks forward, and never through the walls of the alley', () => {
  let lastZ = Infinity;
  for (let p = 0; p <= 1.0001; p += 0.005) {
    const { pos } = cameraAt(p);
    assert.ok(pos.z <= lastZ + 1e-6, `goes back at ${p.toFixed(3)}`);
    lastZ = pos.z;
    const half = pos.z > 4.6 ? 3.4 : 5.4;
    assert.ok(Math.abs(pos.x) < half - 0.3 && pos.y > 0.3 && pos.y < 4.0, `out of bounds at ${p.toFixed(3)}`);
    // through the doorway only between the jambs, and only once the doors are open
    if (pos.z < 0.2 && pos.z > -0.6) assert.ok(Math.abs(pos.x) < 0.8 && DOOR_OPEN(p) > 0.6, `walks into the door at ${p.toFixed(3)}`);
  }
});

test('the doors open on the app\'s beat, before the camera gets there', () => {
  assert.equal(DOOR_OPEN(0), 0);
  assert.equal(DOOR_OPEN(1), 1);
  assert.ok(Math.abs(clockAt(0.9) - T.enter) < 1e-9);
  let opened = false;
  for (let p = 0; p <= 1; p += 0.01) if (DOOR_OPEN(p) > 0.99) { opened = true; assert.ok(cameraAt(p).pos.z > -0.3); break; }
  assert.ok(opened);
});

test('the sun is up at noon and down at midnight, all year round', () => {
  for (const month of [0, 3, 6, 9]) {
    const d = new Date(2026, month, 15);
    assert.ok(sunAt(13, d).e > 15, `noon in month ${month}`);
    assert.ok(sunAt(0.5, d).e < -10, `midnight in month ${month}`);
  }
});
