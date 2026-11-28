const test = require('node:test');
const assert = require('node:assert');

function fakeDoc() {
  const ctx = { setTransform() {} };
  const el = {
    className: '',
    style: { cssText: '', display: '', width: '', height: '', transform: '' },
    width: 0,
    height: 0,
    setAttribute() {},
    getContext() { return ctx; },
  };
  return {
    el,
    createElement() { return el; },
    body: { appendChild() {} },
  };
}

function makeTag(THREE, x, y) {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.13), new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, -1.1);
  scene.add(mesh);
  let bare = false;
  return {
    mesh,
    rev: 1,
    canvasW: 640,
    canvasH: 190,
    get bare() { return bare; },
    paintInk() {},
    setBare(on) {
      if (on === bare) return false;
      bare = on;
      return true;
    },
  };
}

test('tagsharp: stands aside when a hovered tag overlaps an occluder (e.g. the suitcase)', async () => {
  const THREE = await import('three');
  const prevW = globalThis.innerWidth;
  const prevH = globalThis.innerHeight;
  const prevDpr = globalThis.devicePixelRatio;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 800;
  globalThis.devicePixelRatio = 1;
  try {
    const { createSharpTag } = await import('../src/tagsharp.js');
    const doc = fakeDoc();
    const sharp = createSharpTag(doc);
    const cam = new THREE.PerspectiveCamera(45, 1280 / 800, 0.1, 100);

    // Tag in bottom-left behind the suitcase area (~x: -0.45, y: -0.25 at z = -1.1)
    const tag = makeTag(THREE, -0.45, -0.25);

    // Clear of occluders: sharpTag takes over and blanks the 3D lettering
    assert.strictEqual(sharp.update(cam, [tag], []), true);
    assert.strictEqual(doc.el.style.display, 'block');
    assert.strictEqual(tag.bare, true);

    // Suitcase box overlaps the tag: sharpTag hides and restores 3D lettering so the suitcase occludes it
    const suitcaseBox = { left: 40, right: 390, top: 480, bottom: 760 };
    assert.strictEqual(sharp.update(cam, [tag], () => [suitcaseBox]), true);
    assert.strictEqual(doc.el.style.display, 'none');
    assert.strictEqual(tag.bare, false);

    // Subsequent frame still occluded: no redundant redraw
    assert.strictEqual(sharp.update(cam, [tag], () => [suitcaseBox]), false);
    assert.strictEqual(doc.el.style.display, 'none');

    // Occluder moves clear of the tag: sharpTag takes over again
    const clearBox = { left: 40, right: 200, top: 700, bottom: 780 };
    assert.strictEqual(sharp.update(cam, [tag], () => [clearBox]), true);
    assert.strictEqual(doc.el.style.display, 'block');
    assert.strictEqual(tag.bare, true);
  } finally {
    globalThis.innerWidth = prevW;
    globalThis.innerHeight = prevH;
    globalThis.devicePixelRatio = prevDpr;
  }
});
