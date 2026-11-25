// Electron shell: the shop window, a hidden YouTube Music player (ytm.cjs), a menu-bar/tray icon,
// custom application menu, media keys, optional Discord Rich Presence, and privacy-first update check.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createYtm } = require('./ytm.cjs');
const { createMini } = require('./mini.cjs');
const { createShortcuts } = require('./shortcuts.cjs');
const { createPower } = require('./power.cjs');
const { createDiscordRpc } = require('./discord.cjs');
const { checkForUpdates, openReleaseUrl } = require('./updater.cjs');
const {
  lockSessions, lockAllContents, lockNavigation,
  isAppUrl, devServerUrl, devEnv, isPackaged,
  makeTrusted, UntrustedSender,
} = require('./security.cjs');

// The app was called Cadence until 2026-11-08 (package name cadence-app). Move its userData once.
function moveOldData() {
  try {
    const dir = app.getPath('userData');
    const old = path.join(path.dirname(dir), 'cadence-app');
    if (old === dir || !fs.existsSync(old)) return;
    const kept = ['Partitions', 'Local Storage', 'Cookies', 'Preferences'];
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => kept.includes(f))) return;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(old, dir);
  } catch (e) { console.warn('[sienna] could not move the old Cadence data folder', e.message); }
}
moveOldData();

// Every renderer runs in Chromium's sandbox (except explicit --no-sandbox in CI containers).
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();
lockAllContents();   // no popups, no <webview>, anywhere

// Music starts when you pick a record, without a click inside the YouTube Music page itself.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
let tray = null;
let ytm = null;
let mini = null;
let discord = null;
let quitting = false;
let lastTrayKey = '';
let lastTrack = null;

const appWebContents = () => [win?.webContents, mini?.window?.webContents];
const trusted = makeTrusted(appWebContents);
const guarded = (fn) => (e, ...args) => {
  if (!trusted(e)) throw new UntrustedSender();
  return fn(...args);
};

function sendShop(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function sendBoth(channel, ...args) {
  sendShop(channel, ...args);
  mini?.send(channel, ...args);
}

function startPlayer() {
  discord = createDiscordRpc();
  ytm = createYtm({
    onState: (s) => {
      sendShop('ytm:state', s);
      mini?.state(s);
      discord?.update(s);
      updateTrayMenu(s);
    },
    onAccount: (signedIn) => { sendBoth('ytm:account', signedIn); },
    onStatus: (st) => { sendBoth('ytm:status', st); },
  });
  ipcMain.handle('ytm:home', guarded((next) => ytm.home(next)));
  ipcMain.handle('ytm:play', guarded((endpoint) => ytm.play(endpoint)));
  ipcMain.handle('ytm:command', guarded((name, arg) => ytm.command(name, arg)));
  ipcMain.handle('ytm:signIn', guarded(() => ytm.signIn(win)));
  ipcMain.handle('ytm:addAccount', guarded(() => ytm.addAccount(win)));
  for (const [name, fn] of Object.entries(ytm.ipc)) ipcMain.handle(`ytm:${name}`, guarded((...args) => fn(...args)));
}

function createWindow() {
  const extraArgs = isPackaged() ? [] : ['--sienna-dev'];
  win = new BrowserWindow({
    icon: path.join(__dirname, 'icon.png'),
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#1b1410',
    title: 'Sienna',
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: extraArgs,
    },
  });
  lockNavigation(win.webContents, isAppUrl);
  const dev = devServerUrl();
  const query = devEnv('SIENNA_QUERY');
  if (dev) {
    const base = dev.href;
    win.loadURL(query ? `${base}${base.includes('?') ? '&' : '?'}${query}` : base);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), query ? { search: query } : {});
  }
  for (const ev of ['show', 'hide', 'minimize', 'restore', 'focus', 'blur']) win.on(ev, updateActive);
  win.webContents.on('render-process-gone', (_e, details) => {
    if (quitting) return;
    console.warn('[sienna] shop renderer crashed:', details?.reason);
    const old = win;
    win = null;
    if (old && !old.isDestroyed()) old.destroy();
    createWindow();
  });
  // Closing the shop window frees GPU memory while Sienna stays alive in the tray/menu bar
  // so music keeps playing across macOS, Windows, and Linux. Quit from the tray or app menu exits.
  win.on('closed', () => {
    win = null;
    updateActive();
    // The shop just released its renderer and GPU memory. That is exactly when the mini player is
    // useful, so warm it here rather than holding a second full renderer all the time.
    mini?.prewarm();
  });
}

function updateActive() {
  const shop = !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized();
  ytm?.setActive(shop || !!mini?.isOpen());
  ytm?.setFocused((shop && win.isFocused()) || !!mini?.isOpen());
}

function openSienna() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// The global 'app' shortcut toggles the shop: a focused shop window closes (Sienna stays in the
// tray, same as the red close button); anything else brings it forward.
function toggleSienna() {
  const open = win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused();
  if (open) { win.close(); return; }
  mini.close();
  openSienna();
}

function buildAppMenu() {
  const mac = process.platform === 'darwin';
  const dev = !isPackaged();
  const sendAction = (action) => {
    openSienna();
    setTimeout(() => sendShop('app:menu', action), 50);
  };
  const template = [
    ...(mac ? [{
      label: 'Sienna',
      submenu: [
        { role: 'about', label: 'About Sienna' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => sendAction('settings') },
        { label: 'Check for Updates…', click: () => sendAction('about') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Sienna' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Sienna' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Sienna', click: openSienna },
        { label: 'Mini Player', click: () => mini?.toggle() },
        { type: 'separator' },
        { label: 'Restock Shelves', accelerator: 'CmdOrCtrl+Shift+R', click: () => sendAction('restock') },
        ...(!mac ? [
          { label: 'Settings…', accelerator: 'Ctrl+,', click: () => sendAction('settings') },
          { type: 'separator' },
          { label: 'Quit Sienna', accelerator: 'Ctrl+Q', click: () => { quitting = true; app.quit(); } },
        ] : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Playback',
      submenu: [
        { label: 'Play / Pause', click: () => ytm?.command('toggle') },
        { label: 'Next Track', click: () => ytm?.command('next') },
        { label: 'Previous Track', click: () => ytm?.command('previous') },
        { type: 'separator' },
        { label: 'Like Track', click: () => ytm?.command('like') },
        { label: 'Mute / Unmute', click: () => ytm?.command('mute') },
        { label: 'Toggle Shuffle', click: () => ytm?.command('shuffle') },
        { label: 'Cycle Repeat', click: () => ytm?.command('repeat') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Shop Entrance', click: () => sendAction('home') },
        { label: 'Library Room', click: () => sendAction('library') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(dev ? [
          { type: 'separator' },
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
        ] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(mac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function updateTrayMenu(s = lastTrack) {
  if (!tray) return;
  lastTrack = s;
  const title = s?.adPlaying ? 'Playing an ad…' : s?.title ? `${s.title}${s.artist ? ` — ${s.artist}` : ''}` : 'Nothing playing';
  const playing = s?.playerState === 1 || s?.playerState === 3;
  const liked = s?.like === 'LIKE';
  const key = `${title}|${playing}|${liked}`;
  if (key === lastTrayKey) return;
  lastTrayKey = key;
  const short = title.length > 48 ? `${title.slice(0, 47)}…` : title;
  tray.setToolTip(s?.title ? `Sienna — ${short}` : 'Sienna');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: short, enabled: false },
    { type: 'separator' },
    { label: playing ? 'Pause' : 'Play', enabled: !!s?.videoId, click: () => ytm?.command('toggle') },
    { label: 'Next', enabled: !!s?.videoId, click: () => ytm?.command('next') },
    { label: 'Previous', enabled: !!s?.videoId, click: () => ytm?.command('previous') },
    { label: liked ? 'Unlike' : 'Like', enabled: !!s?.videoId && !s?.adPlaying, click: () => ytm?.command('like') },
    { type: 'separator' },
    { label: 'Open Mini Player', click: () => mini?.toggle() },
    { label: 'Open Sienna', click: openSienna },
    { type: 'separator' },
    { label: 'Quit Sienna', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'trayTemplate.png'));
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Sienna');
  updateTrayMenu(null);
  if (process.platform !== 'darwin') tray.on('click', openSienna);
}

function registerAppIpc() {
  ipcMain.handle('app:info', guarded(() => ({
    version: app.getVersion(),
    packaged: isPackaged(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    loginItem: app.getLoginItemSettings().openAtLogin,
    discordRpc: discord?.isEnabled() ?? false,
    volumeMode: ytm?.ipc?.volumeMode() ?? 'app',
    supportsSystemVolume: process.platform === 'darwin',
  })));

  ipcMain.handle('app:loginItem', guarded((on) => {
    if (typeof on === 'boolean') {
      try { app.setLoginItemSettings({ openAtLogin: on, openAsHidden: false }); }
      catch (e) { console.warn('[sienna] setLoginItemSettings failed', e.message); }
    }
    return app.getLoginItemSettings().openAtLogin;
  }));

  ipcMain.handle('app:discordRpc', guarded((on) => {
    if (typeof on === 'boolean') discord?.setEnabled(on);
    return discord?.isEnabled() ?? false;
  }));

  ipcMain.handle('app:checkUpdates', guarded(() => checkForUpdates()));
  ipcMain.handle('app:openRelease', guarded((url) => openReleaseUrl(url)));

  ipcMain.handle('app:diagnostics', guarded(async () => {
    let gpu = null;
    try {
      const info = await app.getGPUInfo('basic');
      gpu = (info?.gpuDevice || []).map((d) => ({ vendorId: d.vendorId, deviceId: d.deviceId, active: !!d.active }));
    } catch { /* ignore */ }
    return {
      app: { version: app.getVersion(), packaged: isPackaged() },
      runtime: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node },
      os: { platform: process.platform, arch: process.arch, release: os.release() },
      gpu,
      player: ytm?.getDiagnostics?.() ?? null,
    };
  }));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openSienna);
  app.on('before-quit', () => { quitting = true; discord?.close(); });
  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.setIcon(path.join(__dirname, 'icon.png'));
    lockSessions();
    buildAppMenu();
    startPlayer();
    registerAppIpc();
    createWindow();
    createTray();
    mini = createMini({ onVisible: updateActive, trusted });
    createPower({ send: (s) => sendShop('power:state', s), guarded });
    ipcMain.handle('strokes:shipped', guarded(() => fs.promises.readFile(path.join(__dirname, '..', 'strokes', 'shop.bin.gz')).then((b) => new Uint8Array(b)).catch(() => null)));
    createShortcuts(
      { mini: () => mini.toggle(), app: toggleSienna },
      {
        trusted,
        windows: appWebContents,
        media: {
          toggle: () => ytm?.command('toggle'),
          next: () => ytm?.command('next'),
          previous: () => ytm?.command('previous'),
          pause: () => ytm?.command('pause'),
        },
      },
    ).register();
    setTimeout(() => mini.prewarm(), 4000);
    if (devEnv('SIENNA_TEST')) global.__siennaMini = mini;
    app.on('activate', openSienna);
  });
  // Keep Sienna alive in the menu bar / system tray on all platforms until the user explicitly quits.
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
}
