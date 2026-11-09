// Electron shell: the shop window, a hidden YouTube Music player (ytm.cjs) and a menu-bar (tray)
// icon with an "Open Sienna" button.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('node:path');
const { createYtm } = require('./ytm.cjs');
const { createMini } = require('./mini.cjs');
const { createShortcuts } = require('./shortcuts.cjs');
const fs = require('node:fs');

// The app was called Cadence until 2026-11-08 (package name cadence-app). Its data folder holds the
// YouTube Music sign-in, settings and caches; move it to the new name once so nothing is lost.
// Must run before anything touches userData (the single-instance lock lives there).
function moveOldData() {
  try {
    const dir = app.getPath('userData');
    const old = path.join(path.dirname(dir), 'cadence-app');
    if (old === dir || !fs.existsSync(old)) return;
    // Electron makes an empty userData folder at startup, so "new" means nothing worth keeping in it.
    const kept = ['Partitions', 'Local Storage', 'Cookies', 'Preferences'];
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => kept.includes(f))) return;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(old, dir);
  } catch (e) { console.warn('[sienna] could not move the old Cadence data folder', e.message); }
}
moveOldData();

// Music starts when you pick a record, without a click inside the YouTube Music page itself.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
let tray = null;
let ytm = null;
let mini = null;   // the small window (Control+Option+K by default), see mini.cjs

function startPlayer() {
  ytm = createYtm({
    onState: (s) => { win?.webContents.send('ytm:state', s); mini?.send('ytm:state', s); },   // both windows show the player
    onSignedIn: () => { win?.webContents.send('ytm:signedIn'); mini?.send('ytm:signedIn'); },
  });
  ipcMain.handle('ytm:home', (_e, next) => ytm.home(next));
  ipcMain.handle('ytm:play', (_e, endpoint) => ytm.play(endpoint));
  ipcMain.handle('ytm:command', (_e, name, arg) => ytm.command(name, arg));
  ipcMain.handle('ytm:signIn', () => ytm.signIn(win));
  for (const [name, fn] of Object.entries(ytm.ipc)) ipcMain.handle(`ytm:${name}`, (_e, ...args) => fn(...args)); // ytm:search, ytm:playlistArt, ytm:albumSongs
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(__dirname, 'icon.png'),   // taskbar/window icon on Windows and Linux
    width: 1280,
    height: 800,
    backgroundColor: '#1b1410',
    title: 'Sienna',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  const dev = process.env.SIENNA_DEV_URL;
  // SIENNA_QUERY='wc=3&hour=17' passes page options (look strength, time of day...) to the window
  const query = process.env.SIENNA_QUERY || '';
  if (dev) win.loadURL(query ? `${dev}${dev.includes('?') ? '&' : '?'}${query}` : dev);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), query ? { search: query } : {});
  // The player polls fast only while a window is on screen (see ytm.setActive).
  for (const ev of ['show', 'hide', 'minimize', 'restore', 'focus']) win.on(ev, updateActive);
  win.on('closed', () => {
    win = null;
    updateActive();
    // The hidden player keeps the app alive, so quit explicitly where closing the window means quit.
    if (process.platform !== 'darwin') app.quit();
  });
}

// Is any Sienna window on screen? Then the hidden player is polled 4x a second, else rarely.
function updateActive() {
  const shop = !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized();
  ytm?.setActive(shop || !!mini?.isOpen());
}

// Show the window, creating it again if it was closed.
function openSienna() {
  if (!win) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Sienna');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Sienna', click: openSienna },
    { type: 'separator' },
    { label: 'Quit Sienna', role: 'quit' },
  ]));
  // Windows/Linux: a plain click opens the app too (macOS shows the menu on click).
  tray.on('click', openSienna);
}

// A second launch just brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openSienna);
  app.whenReady().then(() => {
    // Unpackaged runs show Electron's own Dock icon; swap in Sienna's (icons/app-icon.svg, see scripts/make-icons.mjs).
    if (process.platform === 'darwin') app.dock?.setIcon(path.join(__dirname, 'icon.png'));
    startPlayer();
    createWindow();   // open on start
    createTray();
    mini = createMini({ onVisible: updateActive });
    // global shortcuts (Settings > Shortcuts): mini player, and the full app (also closes the mini player)
    createShortcuts({ mini: () => mini.toggle(), app: () => { mini.close(); openSienna(); } }).register();
    setTimeout(() => mini.prewarm(), 4000);
    if (process.env.SIENNA_TEST) global.__siennaMini = mini;   // lets scripts/e2e drive it without pressing keys
    app.on('activate', openSienna);
  });
  // Stay alive in the menu bar after the window is closed on macOS (the music keeps playing).
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
