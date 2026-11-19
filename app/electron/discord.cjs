// Opt-in Discord Rich Presence over Discord's local IPC socket (zero npm dependencies, off by default).
// Connects only to the local machine's Discord desktop client; never contacts any remote server.
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');

// Public Discord application client ID (overridable via SIENNA_DISCORD_CLIENT_ID if self-hosting).
const DEFAULT_CLIENT_ID = '1339711044318859284';

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

function encodeFrame(op, data) {
  const payload = Buffer.from(JSON.stringify(data), 'utf8');
  const buf = Buffer.alloc(8 + payload.length);
  buf.writeInt32LE(op, 0);
  buf.writeInt32LE(payload.length, 4);
  payload.copy(buf, 8);
  return buf;
}

function ipcPath(i) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${i}`;
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return path.join(dir, `discord-ipc-${i}`);
}

function createDiscordRpc({ clientId = process.env.SIENNA_DISCORD_CLIENT_ID || DEFAULT_CLIENT_ID } = {}) {
  let enabled = false;
  let sock = null;
  let ready = false;
  let connecting = false;
  let retryTimer = null;
  let lastState = null;
  let lastKey = '';
  let rxBuf = Buffer.alloc(0);

  function disconnect() {
    clearTimeout(retryTimer);
    retryTimer = null;
    ready = false;
    connecting = false;
    lastKey = '';
    if (sock) {
      try { sock.end(); sock.destroy(); } catch { /* ignore */ }
      sock = null;
    }
    rxBuf = Buffer.alloc(0);
  }

  function scheduleRetry() {
    if (!enabled || retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, 15000);
  }

  function sendFrame(op, payload) {
    if (!sock || sock.destroyed) return false;
    try { sock.write(encodeFrame(op, payload)); return true; } catch { return false; }
  }

  function handleData(chunk) {
    rxBuf = Buffer.concat([rxBuf, chunk]);
    while (rxBuf.length >= 8) {
      const op = rxBuf.readInt32LE(0);
      const len = rxBuf.readInt32LE(4);
      if (len < 0 || len > 1024 * 1024) { disconnect(); scheduleRetry(); return; }
      if (rxBuf.length < 8 + len) return;
      const body = rxBuf.subarray(8, 8 + len).toString('utf8');
      rxBuf = rxBuf.subarray(8 + len);
      let msg = null;
      try { msg = JSON.parse(body); } catch { /* ignore malformed */ }
      if (op === OP_PING) sendFrame(OP_PONG, msg || {});
      else if (op === OP_CLOSE) { disconnect(); scheduleRetry(); return; }
      else if (op === OP_FRAME && msg?.evt === 'READY') {
        ready = true;
        lastKey = '';
        if (lastState) push(lastState);
      }
    }
  }

  function connect(slot = 0) {
    if (!enabled || sock || connecting) return;
    if (slot > 9) { scheduleRetry(); return; }
    connecting = true;
    const s = net.createConnection(ipcPath(slot));
    const fail = () => {
      s.destroy();
      if (sock === s) sock = null;
      connecting = false;
      ready = false;
      if (enabled) connect(slot + 1);
    };
    s.once('error', fail);
    s.once('connect', () => {
      s.removeListener('error', fail);
      sock = s;
      connecting = false;
      s.on('data', handleData);
      s.on('close', () => { if (sock === s) { disconnect(); scheduleRetry(); } });
      s.on('error', () => { if (sock === s) { disconnect(); scheduleRetry(); } });
      sendFrame(OP_HANDSHAKE, { v: 1, client_id: clientId });
    });
  }

  function clearActivity() {
    if (!ready) return;
    sendFrame(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: null },
      nonce: crypto.randomUUID(),
    });
  }

  function push(s) {
    lastState = s;
    if (!enabled || !ready) return;
    const active = !!s && !s.adPlaying && !!s.title && s.playerState === 1;
    if (!active) {
      if (lastKey !== 'idle') { lastKey = 'idle'; clearActivity(); }
      return;
    }
    const details = String(s.title).slice(0, 128);
    const artist = [s.artist, s.album].filter(Boolean).join(' — ').slice(0, 128) || 'YouTube Music';
    const startSec = Math.floor(Date.now() / 1000 - (s.position || 0));
    const endSec = s.duration > 0 ? Math.floor(startSec + s.duration) : null;
    // Key ignores small drift (< 4s) so normal 250ms polls do not spam Discord IPC.
    const bucket = Math.floor(startSec / 4);
    const key = `${details}|${artist}|${endSec ? Math.floor(endSec / 4) : 0}|${bucket}|${s.art || ''}`;
    if (key === lastKey) return;
    lastKey = key;
    const activity = {
      type: 2, // Listening
      details,
      state: artist,
      timestamps: endSec ? { start: startSec, end: endSec } : { start: startSec },
      assets: {
        ...(s.art ? { large_image: s.art } : {}),
        large_text: (s.album || 'Sienna — Tuscan Record Shop').slice(0, 128),
      },
      instance: false,
    };
    sendFrame(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: crypto.randomUUID(),
    });
  }

  return {
    setEnabled(on) {
      const next = !!on;
      if (next === enabled) return;
      enabled = next;
      if (enabled) connect(0);
      else { clearActivity(); disconnect(); }
    },
    isEnabled: () => enabled,
    update: push,
    close: () => { enabled = false; clearActivity(); disconnect(); },
  };
}

module.exports = { createDiscordRpc, encodeFrame };
