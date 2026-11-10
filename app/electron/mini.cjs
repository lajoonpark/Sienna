// The small window: its global shortcut (Control+Option+K by default, set in Settings > Shortcuts, see
// shortcuts.cjs) pops up a frameless,
// transparent, always-on-top window at the cursor with the suitcase on a paper card (mini.html).
// The lid is flicked open by the page; Esc, a click outside (the window losing focus) or the
// shortcut again shuts the lid, and only then is the window hidden (the page tells us, 'mini:closed').
const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');
const { lockNavigation, isAppUrl } = require('./security.cjs');

const SIZE = { width: 540, height: 620 };    // matches W x H in src/mini.js
// A hidden window is not free: its page and the suitcase's textures and buffers on the GPU stay loaded (about
// 100 MB for its process and 80 MB in the GPU process on a Retina Mac), which was most of what Sienna kept
// while it sat in the menu bar. So once it has been hidden this long it is let go of, and the next summon
// loads it again (a moment slower, that once). SIENNA_MINI_RELEASE_S overrides it (for checks).
const RELEASE_MS = (Number(process.env.SIENNA_MINI_RELEASE_S) || 5 * 60) * 1000;

// trusted(event): did the ipc message come from one of Sienna's own pages? (security.cjs)
function createMini({ onVisible, trusted = () => false } = {}) {
  let win = null;
  let state = 'hidden';                       // hidden | open | closing
  let shownAt = 0;
  let releaseTimer = null;

  // hidden from now on: let the window go if it is not summoned again soon
  function releaseLater() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { if (win && state === 'hidden') win.destroy(); }, RELEASE_MS);
  }

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
        spellcheck: false,
        sandbox: true,
        webviewTag: false,
        preload: path.join(__dirname, 'preload.cjs'),   // the shop's preload; this flag adds window.siennaMini
        additionalArguments: ['--sienna-mini'],
      },
    });
    win.setAlwaysOnTop(true, 'pop-up-menu');   // above full-screen windows and menus
    // Over full-screen apps and on every desktop. skipTransformProcessType: the default would turn the
    // app into a menu-bar agent and back, which hides the Dock icon for a moment.
    if (mac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    lockNavigation(win.webContents, isAppUrl);   // and redirects
    const dev = process.env.SIENNA_DEV_URL;
    if (dev) win.loadURL(new URL('mini.html', dev).href);
    else win.loadFile(path.join(__dirname, '..', 'dist', 'mini.html'));
    // clicking outside: the window loses focus, so shut the lid (not in the first moments, while focus is settling)
    win.on('blur', () => { if (state === 'open' && Date.now() - shownAt > 400) close(); });
    win.on('closed', () => { win = null; state = 'hidden'; sentKey = null; onVisible?.(); });
    // a page that has just loaded (first time, or a reload) has heard nothing yet
    win.webContents.on('did-finish-load', () => { sentKey = null; if (lastState) playerState(lastState); });
  }

  // The player's state, 1 to 4 times a second (ytm.cjs). On screen the page gets every one. Hidden, it
  // draws nothing, so it is told only when something other than the song's position changes (a new song,
  // so its label is painted ahead; play / pause, like, volume): the hidden page then sleeps instead of
  // waking four times a second. The newest state is sent just before it is asked to open.
  let lastState = null, sentKey = null;
  function playerState(s) {
    lastState = s;
    const key = JSON.stringify({ ...s, position: 0 });
    if (state === 'hidden' && key === sentKey) return;
    sentKey = key;
    send('ytm:state', s);
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
    clearTimeout(releaseTimer);
    if (!win) create();
    if (state === 'hidden') {
      place();
      shownAt = Date.now();
      win.show();                              // the page is still invisible: it fades in as the lid is released
    }
    state = 'open';
    onVisible?.();
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => send('mini:open'));
    else { if (lastState) send('ytm:state', lastState); send('mini:open'); }   // where the song is now, then the lid
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
    if (win && e.sender === win.webContents && trusted(e) && state === 'open') state = 'closing';
  });

  // Settings > Lettering changed in the shop: the page reloads to repaint in the new font. Done from here,
  // because the page itself cannot navigate (will-navigate is blocked above, and that blocks reload() too).
  // If the window is on screen meanwhile, the fresh page is told to open the lid again.
  ipcMain.on('mini:reload', (e) => {
    if (!win || e.sender !== win.webContents || !trusted(e)) return;
    win.webContents.once('did-finish-load', () => {
      if (state === 'open') send('mini:open');
      else if (state === 'closing') { state = 'hidden'; win.hide(); onVisible?.(); releaseLater(); }
    });
    win.webContents.reload();
  });

  ipcMain.on('mini:closed', (e) => {
    if (!win || e.sender !== win.webContents || !trusted(e)) return;
    if (state === 'closing' || state === 'open') {
      state = 'hidden';
      win.hide();
      onVisible?.();
      releaseLater();
    }
  });

  return {
    isOpen: () => state !== 'hidden',
    // load the page ahead of the first summon, so the lid does not stutter (let go of again if none comes)
    prewarm() { if (!win) { create(); releaseLater(); } },
    send,
    state: playerState,
    toggle, open, close,
    get phase() { return state; },
    get window() { return win; },
  };
}

module.exports = { createMini };
