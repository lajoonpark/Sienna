// The three keyboard shortcuts, kept in one place and saved to <userData>/shortcuts.json so they are known
// before any page loads. Two are global (they work from any app): `mini` opens/closes the mini player,
// `app` brings the full shop window forward. `search` is not global: each window (shop and mini) listens for
// it while it has focus (src/shortcuts.js). Settings > Shortcuts changes them (src/settings-panel.js).
// Values are Electron accelerators ('Control+Alt+K'); on macOS Alt is Option.
const { globalShortcut, ipcMain, app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  search: 'Control+Alt+J',
  app: 'Control+Alt+L',
  mini: 'Control+Alt+K',
};
const GLOBAL = ['mini', 'app'];

function createShortcuts(actions) {   // actions: { mini: fn, app: fn }
  const file = path.join(app.getPath('userData'), 'shortcuts.json');
  let keys = { ...DEFAULTS };
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const k of Object.keys(DEFAULTS)) if (typeof saved?.[k] === 'string' && saved[k]) keys[k] = saved[k];
  } catch { /* first run, or unreadable: defaults */ }
  const failed = new Set();   // global shortcuts the system refused (another app owns them)
  let paused = false;

  function save() {
    try { fs.writeFileSync(file, JSON.stringify(keys, null, 2)); } catch (e) { console.warn('Sienna: could not save shortcuts', e.message); }
  }
  function unregisterAll() { globalShortcut.unregisterAll(); }
  function registerOne(name) {
    let ok = false;
    try { ok = globalShortcut.register(keys[name], actions[name]); } catch { ok = false; }   // throws on a malformed accelerator
    if (ok) failed.delete(name);
    else { failed.add(name); console.warn(`Sienna: could not register ${keys[name]} (${name})`); }
    return ok;
  }
  function registerAll() {
    unregisterAll();
    for (const name of GLOBAL) registerOne(name);
  }
  const state = () => ({ ...keys, failed: [...failed], defaults: DEFAULTS });
  function broadcast() {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('keys:changed', state());
  }

  // Change one shortcut. A global one must register; if the system refuses it, the old one is kept.
  function set(name, accel) {
    if (!(name in DEFAULTS) || typeof accel !== 'string' || !accel) return { ok: false, error: 'bad' };
    const clash = Object.keys(keys).find((k) => k !== name && keys[k].toLowerCase() === accel.toLowerCase());
    if (clash) { resume(); return { ok: false, error: 'clash', with: clash }; }
    const old = keys[name];
    keys[name] = accel;
    paused = false;
    unregisterAll();
    let ok = true;
    for (const n of GLOBAL) if (!registerOne(n) && n === name) ok = false;
    if (!ok) { keys[name] = old; registerAll(); broadcast(); return { ok: false, error: 'taken' }; }
    save();
    broadcast();
    return { ok: true };
  }
  // While Settings is recording a new shortcut, the global ones are let go, so pressing one reaches the page.
  function pause() { paused = true; unregisterAll(); }
  function resume() { if (paused) { paused = false; registerAll(); } }

  ipcMain.handle('keys:get', () => state());
  ipcMain.handle('keys:set', (_e, name, accel) => set(name, accel));
  ipcMain.handle('keys:reset', () => {
    for (const k of Object.keys(DEFAULTS)) keys[k] = DEFAULTS[k];
    paused = false;
    registerAll(); save(); broadcast();
    return state();
  });
  ipcMain.on('keys:pause', (_e, on) => (on ? pause() : resume()));

  return {
    register() {
      registerAll();
      app.once('will-quit', unregisterAll);
    },
    get keys() { return { ...keys }; },
    get failed() { return [...failed]; },
    set,
  };
}

module.exports = { createShortcuts, DEFAULTS };
