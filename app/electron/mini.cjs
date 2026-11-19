// The small window: its global shortcut (Control+Option+K by default, set in Settings > Shortcuts, see
// shortcuts.cjs) pops up a frameless, transparent, always-on-top window at the cursor with the suitcase
// on a paper card (mini.html).
const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');
const { lockNavigation, isAppUrl, devServerUrl, devEnv, isPackaged } = require('./security.cjs');

const SIZE = { width: 540, height: 620 };    // matches W x H in src/mini.js
const RELEASE_MS = (Number(devEnv('SIENNA_MINI_RELEASE_S')) || 5 * 60) * 1000;

function createMini({ onVisible, trusted = () => false } = {}) {
  let win = null;
  let state = 'hidden';                       // hidden | open | closing
  let shownAt = 0;
  let releaseTimer = null;

  function releaseLater() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { if (win && state === 'hidden') win.destroy(); }, RELEASE_MS);
  }

  function create() {
    const mac = process.platform === 'darwin';
    const extraArgs = ['--sienna-mini'];
    if (!isPackaged()) extraArgs.push('--sienna-dev');
    win = new BrowserWindow({
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
        preload: path.join(__dirname, 'preload.cjs'),
        additionalArguments: extraArgs,
      },
    });
    win.setAlwaysOnTop(true, 'pop-up-menu');
    if (mac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    lockNavigation(win.webContents, isAppUrl);
    const dev = devServerUrl();
    if (dev) win.loadURL(new URL('mini.html', dev).href);
    else win.loadFile(path.join(__dirname, '..', 'dist', 'mini.html'));
    win.on('blur', () => { if (state === 'open' && Date.now() - shownAt > 400) close(); });
    win.on('closed', () => { win = null; state = 'hidden'; sentKey = null; onVisible?.(); });
    win.webContents.on('did-finish-load', () => { sentKey = null; if (lastState) playerState(lastState); });
    win.webContents.on('render-process-gone', () => {
      if (win && !win.isDestroyed()) win.destroy();
      win = null; state = 'hidden'; sentKey = null; onVisible?.();
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
    clearTimeout(releaseTimer);
    if (!win) create();
    if (state === 'hidden') {
      place();
      shownAt = Date.now();
      win.show();
    }
    state = 'open';
    onVisible?.();
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => send('mini:open'));
    else { if (lastState) send('ytm:state', lastState); send('mini:open'); }
  }

  function close() {
    if (state !== 'open') return;
    state = 'closing';
    send('mini:close');
  }

  function toggle() {
    if (state === 'open') close();
    else open();
  }

  ipcMain.on('mini:closing', (e) => {
    if (win && e.sender === win.webContents && trusted(e) && state === 'open') state = 'closing';
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
    prewarm() { if (!win) { create(); releaseLater(); } },
    send,
    state: playerState,
    toggle, open, close,
    get phase() { return state; },
    get window() { return win; },
  };
}

module.exports = { createMini };
