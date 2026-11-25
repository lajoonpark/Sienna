const WHEEL_LINE = 40;
const RATE = 14;

export function wheelPixels(delta, mode, page) {
  return delta * (mode === 1 ? WHEEL_LINE : mode === 2 ? page : 1);
}

export function scrollStep(position, target, elapsed, epsilon) {
  const next = position + (target - position) * -Math.expm1(-RATE * elapsed / 1000);
  return Math.abs(target - next) <= epsilon ? target : next;
}

export function followScroll({ read, write, epsilon, onIdle }) {
  let frame = 0, at = 0, position, target;

  function stop() {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
    onIdle?.();
  }

  function tick(now) {
    const currentFrame = frame;
    const next = scrollStep(position, target, Math.max(0, now - at), epsilon);
    position = next;
    at = now;
    write(next);
    if (frame !== currentFrame) return;
    if (position === target) stop();
    else frame = requestAnimationFrame(tick);
  }

  function to(next) {
    target = next;
    if (frame) return;
    position = read();
    at = performance.now();
    frame = requestAnimationFrame(tick);
  }

  return { to, stop, get target() { return frame ? target : null; } };
}

export function smoothWheel(scroller) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let lastTop, snapStyle;
  const motion = followScroll({
    read: () => scroller.scrollTop,
    write: top => {
      if (calm.matches || !scroller.isConnected || !scroller.clientHeight || scroller.scrollTop !== lastTop) {
        motion.stop();
        return;
      }
      scroller.scrollTop = top;
      lastTop = scroller.scrollTop;
    },
    epsilon: 0.5,
    onIdle: () => {
      if (snapStyle == null) return;
      scroller.style.scrollSnapType = snapStyle;
      snapStyle = null;
    },
  });
  const stop = motion.stop;
  scroller.addEventListener('wheel', e => {
    const mode = e.deltaMode;
    if (calm.matches) { stop(); return; }
    if (!e.cancelable || e.defaultPrevented || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;
    const height = scroller.clientHeight;
    const max = scroller.scrollHeight - height;
    if (max <= 0 || !height) return;
    const css = getComputedStyle(scroller);
    if (scroller !== document.scrollingElement && !['auto', 'scroll', 'overlay'].includes(css.overflowY)) return;
    if (motion.target != null && scroller.scrollTop !== lastTop) stop();
    const from = motion.target ?? scroller.scrollTop;
    const to = Math.min(max, Math.max(0, from + wheelPixels(e.deltaY, mode, height)));
    if (to === from && motion.target == null) {
      if (css.overscrollBehaviorY !== 'auto') e.preventDefault();
      return;
    }
    e.preventDefault();
    if (motion.target == null) {
      lastTop = scroller.scrollTop;
      if (css.scrollSnapType !== 'none') {
        snapStyle = scroller.style.scrollSnapType;
        scroller.style.scrollSnapType = 'none';
      }
    }
    motion.to(to);
  }, { passive: false });
  for (const event of ['pointerdown', 'focusin', 'keydown']) scroller.addEventListener(event, stop);
  return stop;
}
