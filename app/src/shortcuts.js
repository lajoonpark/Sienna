// Keyboard shortcuts on the page side. The main process owns them (electron/shortcuts.cjs); this keeps a copy
// in step, matches key presses against the in-window one (search), turns a key press into an accelerator
// (Settings > Shortcuts records new ones) and writes them for people ('Control + Option + J').
// Without the Electron bridge (lab pages, shots in a plain browser) the defaults apply.
//
//   import { shortcuts } from './shortcuts.js';
//   shortcuts.matches('search', e)     -> true if keydown e is the search shortcut
//   shortcuts.label('mini')            -> 'Control + Option + K'
//   shortcuts.on(fn)                   -> fn(state) whenever they change
const DEFAULTS = { search: 'Control+Alt+J', app: 'Control+Alt+L', mini: 'Control+Alt+K' };   // as in shortcuts.cjs
export const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || globalThis.navigator?.userAgent || '');

const bridge = globalThis.sienna?.keys;
let state = { ...DEFAULTS, failed: [], defaults: DEFAULTS };
const listeners = new Set();
function update(s) { if (s) { state = s; for (const fn of listeners) fn(state); } }
bridge?.get().then(update).catch(() => {});
bridge?.onChange(update);

// KeyboardEvent.code -> accelerator key name. Option changes e.key on a Mac, so codes are used throughout.
const NAMED = {
  Space: 'Space', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
};
function codeToKey(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  return NAMED[code] ?? null;
}
const MOD_ALIASES = {
  control: 'Control', ctrl: 'Control', alt: 'Alt', option: 'Alt', shift: 'Shift',
  command: 'Command', cmd: 'Command', super: 'Super', meta: 'Super',
  commandorcontrol: 'CmdOrCtrl', cmdorctrl: 'CmdOrCtrl',
};
function parse(accel) {
  const mods = new Set();
  let key = null;
  for (const part of String(accel).split('+')) {
    const m = MOD_ALIASES[part.toLowerCase()];
    if (m === 'CmdOrCtrl') mods.add(isMac ? 'Command' : 'Control');
    else if (m === 'Super') mods.add('Command');   // the Windows / Command key: e.metaKey either way
    else if (m) mods.add(m);
    else key = part.length === 1 ? part.toUpperCase() : part;
  }
  return { mods, key };
}

// The accelerator for a keydown, or null if it is not a usable shortcut yet (just modifiers, or no
// Control/Option/Command held: a bare letter would stop you typing it anywhere; F-keys may stand alone).
export function fromEvent(e) {
  const key = codeToKey(e.code);
  if (!key) return null;
  if (!(e.ctrlKey || e.altKey || e.metaKey) && !/^F\d/.test(key)) return null;
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push(isMac ? 'Command' : 'Super');
  parts.push(key);
  return parts.join('+');
}

// 'Control+Alt+J' -> 'Control + Option + J' on a Mac, 'Ctrl + Alt + J' elsewhere
export function format(accel) {
  const { mods, key } = parse(accel);
  const order = ['Control', 'Alt', 'Shift', 'Command'];
  const names = isMac
    ? { Control: 'Control', Alt: 'Option', Shift: 'Shift', Command: 'Command' }
    : { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Command: 'Win' };
  const keyName = { Up: '↑', Down: '↓', Left: '←', Right: '→', Return: 'Return' }[key] ?? key;
  return [...order.filter((m) => mods.has(m)).map((m) => names[m]), keyName].join(' + ');
}

export const shortcuts = {
  get: (name) => state[name],
  failed: (name) => state.failed?.includes(name),
  label: (name) => format(state[name]),
  matches(name, e) {
    const { mods, key } = parse(state[name]);
    return codeToKey(e.code) === key && e.ctrlKey === mods.has('Control') && e.altKey === mods.has('Alt')
      && e.shiftKey === mods.has('Shift') && e.metaKey === mods.has('Command');
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // Settings: change one ({ ok, error }), put all back, and let go of the global ones while recording.
  set: (name, accel) => bridge ? bridge.set(name, accel) : (update({ ...state, [name]: accel }), Promise.resolve({ ok: true })),
  reset: () => bridge ? bridge.reset().then(update) : (update({ ...DEFAULTS, failed: [], defaults: DEFAULTS }), Promise.resolve()),
  pause: (on) => bridge?.pause(on),
  // set while recording, so the search bar does not open on its own shortcut being pressed
  recording: false,
};
