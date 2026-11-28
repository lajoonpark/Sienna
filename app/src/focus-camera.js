// The camera swings round the record you are on (the shop window; main.js calls this every frame).
// At a rack, the moment a record lifts, the camera orbits about that record (turns and moves together,
// pivoting on it) about a third of the way toward facing it head-on. No waiting for the cursor to rest:
// the turn runs on a critically damped spring, so it starts gently, never overshoots, and a new record
// mid-turn just bends the motion instead of restarting it. Pivoting on the
// record keeps it on the same spot on screen, so it stays under the cursor; only the room around it
// swings. The camera never slides left / right / up / down on its own, except to bring the held-up record
// clear of the window's edges and buttons (steerClear), and then never off the cursor.
// Only the cursor changes what is hovered: whenever the camera starts a swing (toward a record, or back
// when you leave the records), the hover is frozen until the cursor actually moves. Otherwise the swing
// moves a neighbouring record under a still cursor, the camera swings to that one, and so on.
// The pivot is taken once per record (where it sits when the swing starts), not chased every frame.
// Zoom: the camera moves in toward the hovered record along the line to it (so the record stays under
// the cursor and just grows, its words readable), to about zoomTo metres from it, but never more than
// zoomMax of the way (far racks like the tall bookshelf get the most; the close trough barely moves).
// zoomRate: how quickly it gets there.
// Clear of the edges and buttons (steerClear): once the record is up, the camera also slides sideways /
// up / down (pan, in its own frame, panRate) so the record and its name tag sit inside the window (edge px
// in from it, floor = NDC y of the tucked suitcase) and off the buttons (pad px round them), as far as it
// takes, short of the cursor leaving the cover (it stays keep px inside its edges). Only what that cannot
// clear makes the zoom give up (cut: 0 = full zoom, 1 = none, cutRate per second), and only side words
// still in the way after that step aside (menu.update's hold). All of that happens while the camera
// comes round to the record: once it is at rest there (framed) the framing holds until the next record, so
// nothing the record does later (side words stepping aside, the cursor moving on it) sends the camera off again.
//
//   const focusCam = createFocusCamera({ camera, rig, tilt, nav, racks, pointerPx, blockers, isPinned, hoverForced });
//   focusCam.update(dt, rack, pointer) -> the rack's hit under the cursor (or null), for rack.update
//   focusCam.place()                   poses the camera in its rig (swing, zoom, slide and the cursor tilt)
//   focusCam.pickCamera()              the camera as it would be without the slide: racks pick rest spots with it
//   focusCam.held = rack.screenBox()   the held-up record's box on screen, measured after the racks' update
//   focusCam.focus                     its state (yaw, pitch, framed, freeze...): read by the frame and the checks
//     blockers(): boxes on screen ({ l, t, r, b } px, or null) the held-up record keeps clear of
//     isPinned(): a ?cam pose holds the camera;  hoverForced(): ?hover / setHover holds a record up
import * as THREE from 'three';
import { AT_HOME } from './nav.js';
import { focusHover, framedAtRest, hoverPanBounds, lockHover, zoomCutNeeded } from './racks/hover.js';

export function createFocusCamera({ camera, rig, tilt, nav, racks, pointerPx, blockers, isPinned, hoverForced }) {
  const FOCUS = { dwell: 0.03, share: 0.35, maxYaw: 0.14, maxPitch: 0.09, omega: 11, rate: 6, settle: 2, release: 0.35, unfreezePx: 4,
    zoomTo: 1.6, zoomMax: 0.5, zoomRate: 4,
    edge: 18, floor: -0.82, pad: 10, keep: 10, panRate: 5, cutRate: 2.5, restPx: 1.5, restZoom: 0.004, restSwing: 0.002 };
  const focus = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, vyaw: 0, vpitch: 0, key: -1, aimed: -1, rack: -1, on: 0, off: 0, freeze: null, px: -1, py: -1, still: 0,
    pan: new THREE.Vector2(), cut: 0, stuck: false, framed: false, panLeft: Infinity,
    pivot: new THREE.Vector3(), // rig-local point the camera orbits about
    // the camera's pose in the rig without the cursor tilt; each frame's step of the swing is applied to it
    // as a rotation about the pivot, so the pivot stays put on screen even when it changes mid-swing
    offP: new THREE.Vector3(), offQ: new THREE.Quaternion() };
  const _fp = new THREE.Vector3();
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const orbitQ = (yaw, pitch, out) => out.setFromEuler(_e.set(pitch, yaw, 0));
  // exact critically damped spring step toward target (stable at any frame time); returns [x, v]
  function spring(x, v, target, w, dt) {
    const d = x - target, c = v + w * d, e = Math.exp(-w * dt);
    return [target + (d + c * dt) * e, (v - w * c * dt) * e];
  }
  function aimAt(yaw, pitch, key, pointer) {
    // freeze the hover first, even when the swing target does not move: a record aimed dead-ahead
    // (or at the same angle as the last one) would never freeze otherwise, and steerClear's pan can
    // then slide the record's rest spot off the still cursor and hand the hover to the next record
    lockHover(focus, pointer, pointerPx, key);
    if (Math.abs(yaw - focus.tyaw) + Math.abs(pitch - focus.tpitch) < 0.01) return;
    focus.tyaw = yaw; focus.tpitch = pitch;
  }
  function updateFocus(dt, rack, pointer) {
    const at = nav.settled && nav.at !== AT_HOME && !isPinned() ? nav.at : -1;
    if (at !== focus.rack) {
      focus.rack = at; focus.key = focus.aimed = -1; focus.tyaw = focus.tpitch = 0; focus.vyaw = focus.vpitch = 0; focus.freeze = null; focus.still = 0;
    }
    const live = at >= 0 && rack?.root.visible && !hoverForced() && !rack.turning ? pointer : null;
    let hit = null;
    const hov = focusHover(focus, live, pointerPx, FOCUS.unfreezePx, () => {
      // Hit-test before this frame's focus motion; the rack uses the same hit for its lift.
      updateRackCamera();
      hit = rack.pickHover(live, camera, rackPickCamera());
      return hit < 1000 ? hit : -1;
    });
    // a couple of frames on a record is enough (brushing past one for a single frame does not count)
    if (hov !== focus.key) { focus.key = hov; focus.on = 0; }
    else if (hov >= 0) focus.on += dt;
    if (hov >= 0) focus.off = 0; else focus.off += dt;
    if (hov >= 0 && hov !== focus.aimed && focus.on >= FOCUS.dwell && rack.focusPoint(hov, _fp)) {
      // the record's direction from the rig (the camera before tilt and focus)
      rig.worldToLocal(_fp);
      const yaw = Math.atan2(-_fp.x, -_fp.z), pitch = Math.atan2(_fp.y, Math.hypot(_fp.x, _fp.z));
      focus.aimed = hov;
      // swing the sightline to the record back toward straight ahead (the rack faces the station view):
      // the camera turns away from the record while moving round in front of it
      const ty = THREE.MathUtils.clamp(-yaw * FOCUS.share, -FOCUS.maxYaw, FOCUS.maxYaw);
      const tp = THREE.MathUtils.clamp(-pitch * FOCUS.share, -FOCUS.maxPitch, FOCUS.maxPitch);
      focus.pivot.copy(_fp); // swings go step by step about the pivot, so a new pivot never jumps
      focus.cut = 0; focus.stuck = false; focus.framed = false; focus.panLeft = Infinity;
      aimAt(ty, tp, hov, live);
    } else if (hov < 0 && focus.off > FOCUS.release && focus.aimed !== -1) {
      focus.aimed = -1;
      aimAt(0, 0, -1, live);
    }
    // the aimed record hovered again after a >4px move dropped the freeze, without needing a new
    // aim: re-arm the freeze once the cursor has really stopped (inside a 4px disc for a beat, so
    // a slow drag keeps the hover free), or a still cursor would hover unfrozen, letting
    // steerClear's pan slide its rest spot out from under it and hand the hover to the next record
    const still = live && Math.hypot(pointerPx.x - focus.px, pointerPx.y - focus.py) <= FOCUS.unfreezePx;
    focus.still = still ? focus.still + dt : 0;
    if (!still) { focus.px = pointerPx.x; focus.py = pointerPx.y; }
    if (hov >= 0 && hov === focus.aimed && !focus.freeze && focus.still > 0.2) lockHover(focus, live, pointerPx, hov);
    const k = 1 - Math.exp(-dt * FOCUS.rate);
    if (focus.aimed === -1) {
      // no record to keep under the cursor: ease straight home (undoes any drift between pivots)
      [focus.yaw, focus.vyaw] = spring(focus.yaw, focus.vyaw, 0, FOCUS.omega, dt);
      [focus.pitch, focus.vpitch] = spring(focus.pitch, focus.vpitch, 0, FOCUS.omega, dt);
      focus.offP.multiplyScalar(1 - k);
      focus.offQ.slerp(_qa.identity(), k);
      focus.pan.multiplyScalar(1 - k);
      focus.cut = 0; focus.stuck = false; focus.framed = false; focus.panLeft = Infinity;
      finishFocus(rack);
      return hit;
    }
    steerClear(dt);
    // this frame's step of the swing, as a rotation about the pivot
    orbitQ(focus.yaw, focus.pitch, _qa).invert();
    [focus.yaw, focus.vyaw] = spring(focus.yaw, focus.vyaw, focus.tyaw, FOCUS.omega, dt);
    [focus.pitch, focus.vpitch] = spring(focus.pitch, focus.vpitch, focus.tpitch, FOCUS.omega, dt);
    orbitQ(focus.yaw, focus.pitch, _qb).multiply(_qa); // step = R(new) * R(old)^-1
    focus.offP.sub(focus.pivot).applyQuaternion(_qb).add(focus.pivot);
    focus.offQ.premultiply(_qb);
    // Steps about different pivots do not cancel out: going record to record, each pair left a little
    // shift, mostly along the sightline, so the camera crept further back the longer you hovered (1.8 m
    // after 30 records). The settled pose for this pivot and angle is p = pivot - R * pivot (same distance
    // to the record as the rig has). Keep the distance to the pivot exact (sliding along the line to the
    // pivot does not move it on screen) and ease the small sideways rest toward that pose.
    // Zoomed in, the settled pose is the same turn but nearer: p = pivot - R * pivot * near. The
    // distance to the pivot eases toward that (a new record mid-zoom bends it instead of jumping).
    const k2 = 1 - Math.exp(-dt * FOCUS.settle), kz = 1 - Math.exp(-dt * FOCUS.zoomRate);
    const near0 = THREE.MathUtils.clamp(FOCUS.zoomTo / focus.pivot.length(), 1 - FOCUS.zoomMax, 1);
    const near = near0 + (1 - near0) * focus.cut;
    orbitQ(focus.yaw, focus.pitch, _qa);
    _fp.copy(focus.pivot).applyQuaternion(_qa).multiplyScalar(-near).add(focus.pivot);
    const dist = focus.offP.distanceTo(focus.pivot);
    focus.offP.lerp(_fp, k2);
    focus.offQ.slerp(_qa, k2);
    focus.offP.sub(focus.pivot).setLength(dist + (focus.pivot.length() * near - dist) * kz).add(focus.pivot);
    focus.framed ||= framedAtRest({
      settled: !!held?.settled,
      panLeft: focus.panLeft * innerWidth / 2,
      zoomLeft: Math.abs(focus.offP.distanceTo(focus.pivot) / (focus.pivot.length() * near) - 1),
      swingLeft: Math.abs(focus.yaw - focus.tyaw) + Math.abs(focus.pitch - focus.tpitch),
    }, FOCUS);
    finishFocus(rack);
    return hit;
  }
  // The held-up record's box on screen (rack.screenBox, measured after the racks' last update) and the boxes
  // it must keep clear of (NDC [left, right, bottom, top]). Pans the camera toward the smallest move that
  // puts the record and its tag inside the window and off the buttons with the cursor still on the cover;
  // with no such move the zoom gives up a little more each frame (focus.stuck).
  let held = null;
  // the camera as it would be without steerClear's slide: racks pick the lifted record's rest spot with it
  const pickCam = new THREE.PerspectiveCamera();
  pickCam.matrixAutoUpdate = pickCam.matrixWorldAutoUpdate = false;
  function updatePickCam() {
    pickCam.projectionMatrix.copy(camera.projectionMatrix);
    pickCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    pickCam.matrix.compose(focus.offP, camera.quaternion, camera.scale);
    pickCam.matrixWorld.multiplyMatrices(rig.matrixWorld, pickCam.matrix);
    pickCam.matrixWorldInverse.copy(pickCam.matrixWorld).invert();
  }
  const rackPickCamera = () => focus.pan.lengthSq() > 1e-8 ? pickCam : camera;
  function updateRackCamera() {
    const k = nav.tilt;
    camera.position.copy(focus.offP).add(_fp.set(focus.pan.x, focus.pan.y, 0).applyQuaternion(focus.offQ));
    camera.quaternion.copy(focus.offQ).multiply(_qa.setFromEuler(_e.set(-tilt.y * 0.09 * k, -tilt.x * 0.2 * k, 0)));
    rig.updateMatrixWorld();
    updatePickCam();
  }
  const clampTo = (v, [lo, hi]) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const within = (v, [lo, hi]) => lo > hi || (v >= lo - 1e-4 && v <= hi + 1e-4);
  function steerClear(dt) {
    const h = held;
    if (!h || focus.framed) return;
    const p = camera.projectionMatrix.elements, ex = (2 * FOCUS.edge) / innerWidth, ey = (2 * FOCUS.edge) / innerHeight;
    const [l, r, b, t] = h.all;
    const keep = [(2 * FOCUS.keep) / innerWidth, (2 * FOCUS.keep) / innerHeight];
    const cur = hoverPanBounds(h, keep[0], keep[1]);
    const safe = [[-1 + ex, 1 - ex], [FOCUS.floor, 1 - ey]];
    const fit = [[safe[0][0] - l, safe[0][1] - r], [safe[1][0] - b, safe[1][1] - t]];
    // the move that would take the pan back out, where it is not needed
    const back = [(focus.pan.x * p[0]) / h.z, (focus.pan.y * p[5]) / h.z];
    const d = [0, 1].map((i) => clampTo(clampTo(back[i], fit[i]), cur[i]));
    const px = (x) => (2 * x) / innerWidth - 1, py = (y) => 1 - (2 * y) / innerHeight;
    const boxes = blockers().filter(Boolean)
      .map((o) => [px(o.l - FOCUS.pad), px(o.r + FOCUS.pad), py(o.b + FOCUS.pad), py(o.t - FOCUS.pad)]);
    // how much of cover + tag, moved by [dx, dy], still lies over the buttons (NDC area)
    const over = ([dx, dy]) => boxes.reduce((a, o) => a + Math.max(0, Math.min(r + dx, o[1]) - Math.max(l + dx, o[0]) - 1e-5)
      * Math.max(0, Math.min(t + dy, o[3]) - Math.max(b + dy, o[2]) - 1e-5), 0);
    // Every move that lines an edge of cover + tag up with an edge of a button (on either axis, so a
    // corner of buttons can be cleared in one go), kept to the moves allowed: the cursor stays on the
    // cover and, where it can, cover + tag inside the window. The one least in the way wins, then the
    // nearest; so the camera slides as far as it has to (and no further) before anything is hidden
    const ok = (v, i) => within(v, cur[i]) && (within(v, fit[i]) || v === d[i]);
    // (the furthest moves allowed too, for buttons that cannot be cleared, only got out of the way of)
    const ends = (i) => [...cur[i], ...fit[i]].map((v) => clampTo(clampTo(v, fit[i]), cur[i]));
    const xs = [d[0], ...ends(0), ...boxes.flatMap((o) => [o[0] - r, o[1] - l])].filter((v) => ok(v, 0));
    const ys = [d[1], ...ends(1), ...boxes.flatMap((o) => [o[2] - t, o[3] - b])].filter((v) => ok(v, 1));
    let best = d, bestO = over(d), bestD = 0;
    if (bestO > 0) {
      for (const x of xs) for (const y of ys) {
        const c = [x, y], o = over(c), dd = Math.hypot(x - d[0], y - d[1]);
        if (o < bestO - 1e-9 || (Math.abs(o - bestO) <= 1e-9 && dd < bestD)) { best = c; bestO = o; bestD = dd; }
      }
    }
    [d[0], d[1]] = best;
    focus.panLeft = Math.hypot(d[0], d[1]);
    focus.stuck = zoomCutNeeded(h, d, safe, keep, boxes, bestO);
    if (focus.stuck && h.settled) focus.cut = Math.min(1, focus.cut + dt * FOCUS.cutRate);
    // camera right = picture left
    const k = 1 - Math.exp(-dt * FOCUS.panRate);
    focus.pan.x -= ((d[0] * h.z) / p[0]) * k;
    focus.pan.y -= ((d[1] * h.z) / p[5]) * k;
  }
  function finishFocus(rack) {
    if (!hoverForced()) for (const r of racks) if (r) r.forceHover = r === rack && focus.freeze && !r.turning ? focus.freeze.key : null;
  }

  return {
    focus,
    update: updateFocus,
    place: updateRackCamera,
    pickCamera: rackPickCamera,
    get held() { return held; },
    set held(box) { held = box; },
  };
}
