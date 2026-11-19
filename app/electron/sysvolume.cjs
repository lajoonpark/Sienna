// The Mac's own output volume (the one in the menu bar), via osascript. Sienna's knob and scroll
// can drive this instead of the YouTube player's volume (Settings > Playback > Volume control).
// Other platforms return null and the app keeps using the player's volume.
const { execFile } = require('node:child_process');

const run = (...lines) => new Promise((res) => {
  execFile('osascript', lines.flatMap((l) => ['-e', l]), { timeout: 3000 }, (err, out) => res(err ? null : String(out).trim()));
});

function createSystemVolume() {
  if (process.platform !== 'darwin') return null;
  let current = null;
  let muted = false;
  let pending = null;   // newest value asked for while a set was running (scrolling sends many)
  let pendingMute = null;
  let busy = false;

  async function flush() {
    if (busy) return;
    busy = true;
    while (pending !== null || pendingMute !== null) {
      if (pending !== null) {
        const v = pending;
        pending = null;
        // turning it up should also unmute, the way the volume keys do
        if (v > 0) muted = false;
        await run(`set volume output volume ${v}`, ...(v > 0 ? ['set volume without output muted'] : []));
      }
      if (pendingMute !== null) {
        const m = pendingMute;
        pendingMute = null;
        await run(m ? 'set volume with output muted' : 'set volume without output muted');
      }
    }
    busy = false;
  }

  return {
    get: () => current,
    isMuted: () => muted,
    set(v) {
      current = pending = Math.round(Math.min(100, Math.max(0, Number(v) || 0)));
      flush();
    },
    setMuted(m) {
      muted = !!m;
      pendingMute = muted;
      flush();
    },
    toggleMute() {
      muted = !muted;
      pendingMute = muted;
      flush();
      return muted;
    },
    // pick up changes made with the keyboard volume keys (reads volume + mute in one subprocess)
    async refresh() {
      if (busy || pending !== null || pendingMute !== null) return;
      const out = await run('set s to get volume settings', 'return (output volume of s as text) & "," & (output muted of s as text)');
      if (out === null || busy || pending !== null || pendingMute !== null) return;
      const [volStr, muteStr] = out.split(',');
      const v = Number(volStr);
      if (Number.isFinite(v)) current = v;
      if (muteStr === 'true' || muteStr === 'false') muted = muteStr === 'true';
    },
  };
}

module.exports = { createSystemVolume };
