// The main-process pieces that hold state across windows, run against a pretend Electron: the mini
// window's life (electron/mini.cjs) and the global shortcuts (electron/shortcuts.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---- a pretend Electron: just enough for the two modules ----
const fake = {
  app: Object.assign(new EventEmitter(), { isPackaged: false, getPath: () => fake.userData }),
  ipcMain: Object.assign(new EventEmitter(), { handlers: new Map(), handle(ch, fn) { this.handlers.set(ch, fn); } }),
  windows: [],
  registered: new Map(),
  userData: fs.mkdtempSync(path.join(os.tmpdir(), 'sienna-main-test-')),
};
class FakeContents extends EventEmitter {
  constructor() { super(); this.sent = []; this.loading = true; }
  send(channel, ...args) { this.sent.push([channel, ...args]); }
  isLoading() { return this.loading; }
  isDestroyed() { return !!this.gone; }
  setWindowOpenHandler() {}
  finishLoad() { this.loading = false; this.emit('did-finish-load'); }
}
class FakeWindow extends EventEmitter {
  constructor() { super(); this.webContents = new FakeContents(); this.visible = false; this.destroyed = false; fake.windows.push(this); }
  loadFile() { return Promise.resolve(); }
  loadURL() { return Promise.resolve(); }
  setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setBounds() {}
  show() { this.visible = true; }
  hide() { this.visible = false; }
  isDestroyed() { return this.destroyed; }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.visible = false; this.webContents.gone = true; this.emit('closed'); }
}
const electron = {
  app: fake.app,
  ipcMain: fake.ipcMain,
  BrowserWindow: FakeWindow,
  session: { defaultSession: {}, fromPartition: () => ({}) },
  screen: {
    getCursorScreenPoint: () => ({ x: 400, y: 300 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
  },
  globalShortcut: {
    register(accel, fn) { if (accel === 'Control+Alt+T') return false; fake.registered.set(accel, fn); return true; },
    unregisterAll() { fake.registered.clear(); },
  },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  return request === 'electron' ? electron : origLoad.call(this, request, parent, isMain);
};
const { createMini } = require('../electron/mini.cjs');
const { createShortcuts } = require('../electron/shortcuts.cjs');
Module._load = origLoad;

test.after(() => fs.rmSync(fake.userData, { recursive: true, force: true }));

// Each test gets its own listeners: nothing a past test registered answers again.
function reset() {
  fake.app.removeAllListeners();
  fake.ipcMain.removeAllListeners();
  fake.ipcMain.handlers.clear();
  fake.windows.length = 0;
  fake.registered.clear();
  fs.rmSync(path.join(fake.userData, 'shortcuts.json'), { force: true });
}
const trusted = () => true;
const fromPage = (w) => ({ sender: w.webContents });

// ---- the mini window ----
test('mini: opens at once when its page is up, and hides when the page says it has closed', () => {
  reset();
  let seen = 0;
  const mini = createMini({ onVisible: () => { seen++; }, trusted });
  mini.prewarm();
  const [w] = fake.windows;
  assert.equal(mini.isOpen(), false);
  w.webContents.finishLoad();
  mini.open();
  assert.equal(mini.phase, 'open');
  assert.equal(w.visible, true);
  assert.deepEqual(w.webContents.sent.at(-1), ['mini:open']);
  mini.close();
  assert.equal(mini.phase, 'closing');
  assert.deepEqual(w.webContents.sent.at(-1), ['mini:close']);
  assert.equal(w.visible, true, 'the lid shuts on screen first');
  fake.ipcMain.emit('mini:closed', fromPage(w));
  assert.equal(mini.phase, 'hidden');
  assert.equal(w.visible, false);
  assert.ok(seen >= 2, 'the main process is told it showed and hid');
  fake.app.emit('before-quit');   // (lets go of its timers)
});

test('mini: a page that never answers is put away anyway', (t) => {
  reset();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mini = createMini({ trusted });
  mini.prewarm();
  const [w] = fake.windows;
  w.webContents.finishLoad();
  mini.open();
  mini.close();
  t.mock.timers.tick(3999);
  assert.equal(mini.phase, 'closing');
  t.mock.timers.tick(2);
  assert.equal(mini.phase, 'hidden');
  assert.equal(w.visible, false);
});

test('mini: shut before its page has loaded, it hides at once and is not opened behind your back', () => {
  reset();
  const mini = createMini({ trusted });
  mini.open();
  const [w] = fake.windows;
  assert.equal(w.visible, true);
  mini.close();
  assert.equal(mini.phase, 'hidden');
  assert.equal(w.visible, false);
  w.webContents.finishLoad();
  assert.ok(!w.webContents.sent.some(([ch]) => ch === 'mini:open'), 'no mini:open for a hidden window');
  fake.app.emit('before-quit');
});

test('mini: no window is made once Sienna is quitting', () => {
  reset();
  const mini = createMini({ trusted });
  fake.app.emit('before-quit');
  mini.prewarm();
  mini.open();
  mini.toggle();
  assert.equal(fake.windows.length, 0);
  assert.equal(mini.isOpen(), false);
});

test('mini: a window that is gone is forgotten, and a late event from it never drops its replacement', () => {
  reset();
  const mini = createMini({ trusted });
  mini.prewarm();
  const [first] = fake.windows;
  first.webContents.emit('render-process-gone');
  assert.equal(first.destroyed, true);
  assert.equal(mini.window, null);
  mini.prewarm();
  const second = fake.windows[1];
  assert.equal(mini.window, second);
  first.emit('closed');   // the old window says so again
  assert.equal(mini.window, second);
  fake.app.emit('before-quit');
});

test('mini: the hidden window is let go after a while, and kept if it is opened again in time', (t) => {
  reset();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mini = createMini({ trusted });
  mini.prewarm();
  const [w] = fake.windows;
  w.webContents.finishLoad();
  t.mock.timers.tick(4 * 60 * 1000);
  mini.open();
  t.mock.timers.tick(10 * 60 * 1000);
  assert.equal(w.destroyed, false, 'not while it is open');
  mini.close();
  fake.ipcMain.emit('mini:closed', fromPage(w));
  t.mock.timers.tick(5 * 60 * 1000 + 1);
  assert.equal(w.destroyed, true);
  assert.equal(mini.window, null);
});

// ---- the shortcuts ----
const GLOBALS = ['Control+Alt+K', 'Control+Alt+L'];
const MEDIA = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop'];
const held = () => [...fake.registered.keys()].sort();

function shortcuts() {
  const used = [];
  const pages = [new FakeContents(), new FakeContents()];
  const sc = createShortcuts(
    { mini: () => used.push('mini'), app: () => used.push('app') },
    { trusted, windows: () => pages, media: { toggle: () => used.push('toggle') } },
  );
  sc.register();
  return { sc, used, pages };
}

test('shortcuts: the two global ones and the media keys are registered, and each tells the pages it was used', () => {
  reset();
  const { used, pages } = shortcuts();
  assert.deepEqual(held(), [...GLOBALS, ...MEDIA].sort());
  fake.registered.get('Control+Alt+K')();
  fake.registered.get('MediaPlayPause')();
  assert.deepEqual(used, ['mini', 'toggle']);
  assert.deepEqual(pages[0].sent, [['keys:used', 'mini']]);
});

test('shortcuts: let go while a page records one, and back when it says it is done', () => {
  reset();
  const { pages } = shortcuts();
  fake.ipcMain.emit('keys:pause', { sender: pages[0] }, true);
  assert.deepEqual(held(), []);
  fake.ipcMain.emit('keys:pause', { sender: pages[0] }, false);
  assert.deepEqual(held(), [...GLOBALS, ...MEDIA].sort());
});

for (const ev of ['destroyed', 'render-process-gone', 'did-navigate']) {
  test(`shortcuts: a page that goes away mid-recording (${ev}) gives them back`, () => {
    reset();
    const { pages } = shortcuts();
    fake.ipcMain.emit('keys:pause', { sender: pages[0] }, true);
    assert.deepEqual(held(), []);
    pages[0].emit(ev);
    assert.deepEqual(held(), [...GLOBALS, ...MEDIA].sort());
  });
}

test('shortcuts: only the page that is recording gives them back by going away', () => {
  reset();
  const { pages } = shortcuts();
  fake.ipcMain.emit('keys:pause', { sender: pages[0] }, true);
  fake.ipcMain.emit('keys:pause', { sender: pages[0] }, false);
  fake.ipcMain.emit('keys:pause', { sender: pages[1] }, true);   // the other window records now
  pages[0].emit('destroyed');
  assert.deepEqual(held(), [], 'the first page leaving is none of its business');
  pages[1].emit('destroyed');
  assert.deepEqual(held(), [...GLOBALS, ...MEDIA].sort());
});

test('shortcuts: a new one is saved and registered; a clash or one the system keeps is refused and the old one stays', () => {
  reset();
  const { sc, pages } = shortcuts();
  const set = fake.ipcMain.handlers.get('keys:set');
  assert.deepEqual(set({ sender: pages[0] }, 'mini', 'Control+Alt+M'), { ok: true });
  assert.ok(fake.registered.has('Control+Alt+M') && !fake.registered.has('Control+Alt+K'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(fake.userData, 'shortcuts.json'), 'utf8')).mini, 'Control+Alt+M');
  assert.deepEqual(set({ sender: pages[0] }, 'app', 'control+alt+m'), { ok: false, error: 'clash', with: 'mini' });
  assert.deepEqual(set({ sender: pages[0] }, 'app', 'Control+Alt+T'), { ok: false, error: 'taken' });
  assert.equal(sc.keys.app, 'Control+Alt+L');
  assert.ok(fake.registered.has('Control+Alt+L'));
  assert.deepEqual(set({ sender: pages[0] }, 'nope', 'Control+Alt+X'), { ok: false, error: 'bad' });
});

test('shortcuts: a refused change while recording still gives the global ones back', () => {
  reset();
  const { pages } = shortcuts();
  fake.ipcMain.emit('keys:pause', { sender: pages[0] }, true);
  const set = fake.ipcMain.handlers.get('keys:set');
  assert.equal(set({ sender: pages[0] }, 'search', 'Control+Alt+K').error, 'clash');
  assert.deepEqual(held(), [...GLOBALS, ...MEDIA].sort());
});

test('shortcuts: an untrusted page is refused', () => {
  reset();
  const pages = [new FakeContents()];
  createShortcuts({ mini() {}, app() {} }, { trusted: () => false, windows: () => pages }).register();
  assert.throws(() => fake.ipcMain.handlers.get('keys:get')({ sender: pages[0] }), /untrusted/);
  fake.ipcMain.emit('keys:pause', { sender: pages[0] }, true);
  assert.deepEqual(held(), GLOBALS, 'and cannot let the shortcuts go');
});
