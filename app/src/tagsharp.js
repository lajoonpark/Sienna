// The lettering of the hovered record's name tag, drawn at the screen's own resolution. The shop is drawn
// with fewer pixels than the screen has below Full sharpness (quality.js) and then stretched, which is fine
// for paint and not for small lettering. So a see-through canvas is laid over the 3D tag (racks/common.js
// createTag), its words painted at the size they have on screen and bent onto the tag's four corners every
// frame, while the tag itself shows as blank paper. The paper stays 3D, so the shop's light still falls on it.
//   const sharp = createSharpTag();
//   sharp.update(camera, tags)   before each drawn frame: letters the first tag in the list that is on screen.
//                                An empty list stands it aside (something has to pass in front of the tag),
//                                and the tag shows its own lettering. True: a tag was redrawn, so the
//                                picture has to be painted again.
import * as THREE from 'three';
import { quadTransform } from './quad.js';

const MIN_PX = 40;       // narrower than this on screen (a tag still growing, or not settled): not worth drawing
const REDRAW = 0.03;     // repaint when the size on screen is this far from the canvas's own
const MAX_W = 1280;      // device px

const _v = new THREE.Vector3();

function onStage(mesh) {
  let o = mesh;
  for (; o; o = o.parent) {
    if (!o.visible) return false;
    if (o.isScene) return true;
  }
  return false;
}

// the tag's corners in CSS px (top left, top right, bottom right, bottom left); null if not all in front
function corners(tag, camera) {
  const mesh = tag.mesh;
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const out = [];
  for (const [x, y] of [[min.x, max.y], [max.x, max.y], [max.x, min.y], [min.x, min.y]]) {
    _v.set(x, y, 0).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    if (_v.z > -camera.near) return null;
    _v.applyMatrix4(camera.projectionMatrix);
    out.push([((_v.x + 1) / 2) * innerWidth, ((1 - _v.y) / 2) * innerHeight]);
  }
  return out;
}

export function createSharpTag(doc = document) {
  const el = doc.createElement('canvas');
  el.className = 'sharp-tag';
  el.setAttribute('aria-hidden', 'true');
  // under every caption, menu and sheet
  el.style.cssText = 'position:fixed;left:0;top:0;transform-origin:0 0;pointer-events:none;display:none;z-index:calc(var(--sienna-z-caption, 10) - 5)';
  doc.body.appendChild(el);
  const g = el.getContext('2d');
  let drawn = null;      // what is on the canvas: { tag, rev, w }
  let transform = '';
  let shown = false;
  let lettered = null;   // the tag left blank because its words are here
  const show = (on) => { if (on !== shown) { shown = on; el.style.display = on ? 'block' : 'none'; } };
  // blank this tag, and give the last one its words back; true if either was redrawn
  const take = (tag) => {
    let redrawn = false;
    if (lettered && lettered !== tag) redrawn = lettered.setBare(false);
    lettered = tag;
    return (tag?.setBare(true) ?? false) || redrawn;
  };

  return {
    el,
    update(camera, tags) {
      camera.updateWorldMatrix(true, false);
      for (const tag of tags) {
        if (!tag?.rev || !onStage(tag.mesh)) continue;
        const q = corners(tag, camera);
        if (!q) continue;
        const across = (a, b) => Math.hypot(q[b][0] - q[a][0], q[b][1] - q[a][1]);
        const cssW = (across(0, 1) + across(3, 2)) / 2;
        if (cssW < MIN_PX) continue;
        const dpr = devicePixelRatio || 1;
        const bw = Math.min(MAX_W, Math.round(cssW * dpr));
        if (!drawn || drawn.tag !== tag || drawn.rev !== tag.rev || Math.abs(bw / drawn.w - 1) > REDRAW) {
          const k = bw / tag.canvasW;
          el.width = bw;
          el.height = Math.round(tag.canvasH * k);
          g.setTransform(k, 0, 0, el.height / tag.canvasH, 0, 0);
          tag.paintInk(g);
          el.style.width = `${el.width / dpr}px`;
          el.style.height = `${el.height / dpr}px`;
          drawn = { tag, rev: tag.rev, w: bw };
          transform = '';
        }
        const next = quadTransform(el.width / dpr, el.height / dpr, q);
        if (!next) continue;
        if (next !== transform) el.style.transform = transform = next;
        show(true);
        return take(tag);
      }
      show(false);
      return take(null);
    },
  };
}
