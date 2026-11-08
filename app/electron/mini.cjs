// The small window: Ctrl+Alt+Space anywhere (Control+Option+Space on macOS) pops up a frameless,
// transparent, always-on-top window at the cursor with the suitcase on a paper card (mini.html).
// The lid is flicked open by the page; Esc, a click outside (the window losing focus) or the
// shortcut again shuts the lid, and only then is the window hidden (the page tells us, 'mini:closed').
const { BrowserWindow, globalShortcut, screen, ipcMain, app } = require('electron');
const path = require('node:path');

const SHORTCUT = 'Control+Alt+Space';
const SIZE = { width: 540, height: 620 };    // matches W x H in src/mini.js

function createMini({ onVisible } = {}) {
  let win = null;
  let state = 'hidden';                       // hidden | open | closing
  let shownAt = 0;
  let registered = false;

  function create() {
    const mac = process.platform === 'darwin';
    win = new BrowserWindow({
      ...SIZE,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,                       // the page paints its own soft shadow
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      // macOS: an NSPanel takes keyboard focus without activating the app, so the frontmost app stays
      // frontmost and the main window is not dragged forward
      ...(mac ? { type: 'panel' } : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,                       // the preload loads the shop's preload (see mini-preload.cjs)
        preload: path.join(__dirname, 'mini-preload.cjs'),
      },
    });
    win.setAlwaysOnTop(true, 'pop-up-menu');   // above full-screen windows and menus
    // Over full-screen apps and on every desktop. skipTransformProcessType: the default would turn the
    // app into a menu-bar agent and back, which hides the Dock icon for a moment.
    if (mac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    const dev = process.env.SIENNA_DEV_URL;
    if (dev) win.loadURL(new URL('mini.html', dev).href);
    else win.loadFile(path.join(__dirname, '..', 'dist', 'mini.html'));
    // clicking outside: the window loses focus, so shut the lid (not in the first moments, while focus is settling)
    win.on('blur', () => { if (state === 'open' && Date.now() - shownAt > 400) close(); });
    win.on('closed', () => { win = null; state = 'hidden'; onVisible?.(); });
  }

  function send(channel, ...args) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
  }

  // The window sits centred on the cursor, kept inside the screen it is on.
  function place() {
    const pt = screen.getCursorScreenPoint();
    const a = screen.getDisplayNearestPoint(pt).workArea;
    const x = Math.min(Math.max(Math.round(pt.x - SIZE.width / 2), a.x), a.x + a.width - SIZE.width);
    const y = Math.min(Math.max(Math.round(pt.y - SIZE.height / 2), a.y), a.y + a.height - SIZE.height);
    win.setBounds({ x, y, ...SIZE });
  }

  function open() {
    if (!win) create();
    if (state === 'hidden') {
      place();
      shownAt = Date.now();
      win.show();                              // the page is still invisible: it fades in as the lid is released
    }
    state = 'open';
    onVisible?.();
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => send('mini:open'));
    else send('mini:open');
  }

  function close() {
    if (state !== 'open') return;
    state = 'closing';
    send('mini:close');
  }

  // The shortcut: open it; open -> shut the lid; shutting -> carry the lid back over the top.
  function toggle() {
    if (state === 'open') close();
    else open();
  }

  // Esc or a click on the card's margin: the page shuts the lid by itself; keep our state in step, so the
  // shortcut during the closing swing carries the lid back over the top instead of doing nothing.
  ipcMain.on('mini:closing', (e) => {
    if (win && e.sender === win.webContents && state === 'open') state = 'closing';
  });

  ipcMain.on('mini:closed', (e) => {
    if (!win || e.sender !== win.webContents) return;
    if (state === 'closing' || state === 'open') {
      state = 'hidden';
      win.hide();
      onVisible?.();
    }
  });

  return {
    // Registers the shortcut. Returns false if the system refused it (another app owns it, or no X11 on Linux).
    register() {
      registered = globalShortcut.register(SHORTCUT, toggle);
      if (!registered) console.warn(`Sienna: could not register ${SHORTCUT}`);
      app.once('will-quit', () => this.dispose());
      return registered;
    },
    dispose() {
      if (registered) globalShortcut.unregister(SHORTCUT);
      registered = false;
    },
    isOpen: () => state !== 'hidden',
    prewarm() { if (!win) create(); },         // load the page ahead of the first summon, so the lid does not stutter
    send,
    toggle, open, close,
    get state() { return state; },
    get window() { return win; },
    get registered() { return registered; },
  };
}

module.exports = { createMini, SHORTCUT };
