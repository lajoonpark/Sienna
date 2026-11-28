// The small window: its global shortcut (Control+Option+K by default, set in Settings > Shortcuts, see
// shortcuts.cjs) pops up a frameless, transparent, always-on-top window at the cursor with the suitcase
// on a paper card (mini.html).
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');
const { lockNavigation, isAppUrl, devServerUrl, devEnv, isPackaged } = require('./security.cjs');

const SIZE = { width: 540, height: 620 };    // matches W x H in src/mini.js
const RELEASE_MS = (Number(devEnv('SIENNA_MINI_RELEASE_S')) || 5 * 60) * 1000;
// The page shuts the lid, fades the card and says 'mini:closed' (about a second). If it never does (it
// hung), the window is put away anyway after this long, rather than left on screen for good.
const CLOSE_MS = 4000;

function createMini({ onVisible, trusted = () => false } = {}) {
  let win = null;
  let state = 'hidden';                       // hidden | open | closing
  let shownAt = 0;
  let releaseTimer = null;
  let closeTimer = null;
  // Sienna is quitting: no window is made from here on. A window made while the others close keeps the
  // app from ever finishing its quit (it is "still open"), until something closes that one too.
  let quitting = false;
  app.on('before-quit', () => { quitting = true; clearTimeout(releaseTimer); clearTimeout(closeTimer); });

  function releaseLater() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { if (win && state === 'hidden') win.destroy(); }, RELEASE_MS);
  }

  function create() {
    const mac = process.platform === 'darwin';
    const extraArgs = ['--sienna-mini'];
    if (!isPackaged()) extraArgs.push('--sienna-dev');
    const w = win = new BrowserWindow({
      ...SIZE,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      ...(mac ? { type: 'panel' } : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        sandbox: true,
        webviewTag: false,
        backgroundThrottling: false,
        preload: path.join(__dirname, 'preload.cjs'),
        additionalArguments: extraArgs,
      },
    });
    w.setAlwaysOnTop(true, 'pop-up-menu');
    if (mac) w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    lockNavigation(w.webContents, isAppUrl);
    const dev = devServerUrl();
    const loading = dev ? w.loadURL(new URL('mini.html', dev).href) : w.loadFile(path.join(__dirname, '..', 'dist', 'mini.html'));
    loading.catch((e) => console.warn('[sienna] the mini window did not load:', e.message));
    w.on('blur', () => { if (state === 'open' && Date.now() - shownAt > 400) close(); });
    // (only for the window that is the mini window now: one that crashed has been replaced by then)
    const gone = () => {
      if (win !== w) return;
      clearTimeout(closeTimer);
      win = null; state = 'hidden'; sentKey = null;
      onVisible?.();
    };
    w.on('closed', gone);
    w.webContents.on('did-finish-load', () => { sentKey = null; if (lastState) playerState(lastState); });
    w.webContents.on('render-process-gone', () => {
      if (!w.isDestroyed()) w.destroy();
      gone();
    });
  }

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

  function place() {
    const pt = screen.getCursorScreenPoint();
    const a = screen.getDisplayNearestPoint(pt).workArea;
    const x = Math.min(Math.max(Math.round(pt.x - SIZE.width / 2), a.x), a.x + a.width - SIZE.width);
    const y = Math.min(Math.max(Math.round(pt.y - SIZE.height / 2), a.y), a.y + a.height - SIZE.height);
    win.setBounds({ x, y, ...SIZE });
  }

  function open() {
    if (quitting) return;
    clearTimeout(releaseTimer);
    clearTimeout(closeTimer);
    if (!win) create();
    if (state === 'hidden') {
      place();
      shownAt = Date.now();
      win.show();
    }
    state = 'open';
    onVisible?.();
    // (shut again before its page had loaded: it is not opened behind the hidden window's back)
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => { if (state === 'open') send('mini:open'); });
    else { if (lastState) send('ytm:state', lastState); send('mini:open'); }
  }

  // Out of sight, and let go of altogether if it is not asked for again for a while.
  function hide() {
    clearTimeout(closeTimer);
    state = 'hidden';
    if (win && !win.isDestroyed()) win.hide();
    onVisible?.();
    releaseLater();
  }

  // The page is closing (it shuts the lid and fades first): hidden when it says so, or after CLOSE_MS.
  function closing() {
    state = 'closing';
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (state === 'closing') hide(); }, CLOSE_MS);
  }

  function close() {
    if (state !== 'open') return;
    // a page still loading has drawn nothing and is not listening yet: there is nothing to wait for
    if (!win || win.isDestroyed() || win.webContents.isLoading()) { hide(); return; }
    closing();
    send('mini:close');
  }

  function toggle() {
    if (state === 'open') close();
    else open();
  }

  ipcMain.on('mini:closing', (e) => {
    if (win && e.sender === win.webContents && trusted(e) && state === 'open') closing();
  });

  ipcMain.on('mini:closed', (e) => {
    if (!win || e.sender !== win.webContents || !trusted(e)) return;
    if (state === 'closing' || state === 'open') hide();
  });

  return {
    isOpen: () => state !== 'hidden',
    prewarm() { if (!win && !quitting) { create(); releaseLater(); } },
    send,
    state: playerState,
    toggle, open, close,
    get phase() { return state; },
    get window() { return win; },
  };
}

module.exports = { createMini };
