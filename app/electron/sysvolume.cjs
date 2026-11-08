// The Mac's own output volume (the one in the menu bar), via osascript. Sienna's knob and scroll
// drive this rather than the YouTube player's volume, because the player's 100% is only as loud as
// the system volume already is: you could turn the knob down but never past where the Mac was set.
// Other platforms return null and the app keeps using the player's volume.
const { execFile } = require('node:child_process');

const run = (...lines) => new Promise((res) => {
  execFile('osascript', lines.flatMap((l) => ['-e', l]), { timeout: 3000 }, (err, out) => res(err ? null : String(out).trim()));
});

function createSystemVolume() {
  if (process.platform !== 'darwin') return null;
  let current = null;
  let pending = null;   // newest value asked for while a set was running (scrolling sends many)
  let busy = false;

  async function flush() {
    if (busy) return;
    busy = true;
    while (pending !== null) {
      const v = pending;
      pending = null;
      // turning it up should also unmute, the way the volume keys do
      await run(`set volume output volume ${v}`, ...(v > 0 ? ['set volume without output muted'] : []));
    }
    busy = false;
  }

  return {
    get: () => current,
    set(v) {
      current = pending = Math.round(Math.min(100, Math.max(0, Number(v) || 0)));
      flush();
    },
    // pick up changes made with the keyboard volume keys
    async refresh() {
      if (busy || pending !== null) return;
      const out = await run('output volume of (get volume settings)');
      const v = Number(out);
      if (out !== null && Number.isFinite(v) && !busy && pending === null) current = v;
    },
  };
}

module.exports = { createSystemVolume };
