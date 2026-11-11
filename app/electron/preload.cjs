// The only bridge between the shop (renderer) and YouTube Music (main process). Also the mini window's
// preload (mini.cjs starts it with --sienna-mini), which gets window.siennaMini as well. Sandboxed: it can
// require nothing but 'electron', so both live in this one file. The main process answers only Sienna's own
// pages in Sienna's own windows (security.cjs), whatever a page does with this.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sienna', {
  home: (next) => ipcRenderer.invoke('ytm:home', next),
  search: (q) => ipcRenderer.invoke('ytm:search', q),
  playlistArt: (play) => ipcRenderer.invoke('ytm:playlistArt', play),
  albumSongs: (play) => ipcRenderer.invoke('ytm:albumSongs', play),
  play: (endpoint) => ipcRenderer.invoke('ytm:play', endpoint),
  prepare: (endpoint) => ipcRenderer.invoke('ytm:prepare', endpoint),
  startPrepared: (endpoint) => ipcRenderer.invoke('ytm:startPrepared', endpoint),
  command: (name, arg) => ipcRenderer.invoke('ytm:command', name, arg),
  signIn: () => ipcRenderer.invoke('ytm:signIn'),
  // Settings > Lettering reloads the shop behind a picture of itself (src/curtain.js): snapshot() has the
  // main process photograph the window; the fresh page finds that picture here (a data URL, or null).
  snapshot: () => ipcRenderer.invoke('shop:snapshot'),
  curtain: process.argv.includes('--sienna-mini') ? null : ipcRenderer.sendSync('shop:curtain'),
  onState: (cb) => ipcRenderer.on('ytm:state', (_e, s) => cb(s)),
  onSignedIn: (cb) => ipcRenderer.on('ytm:signedIn', () => cb()),
  // keyboard shortcuts (electron/shortcuts.cjs): { search, mini, app, failed, defaults }
  keys: {
    get: () => ipcRenderer.invoke('keys:get'),
    set: (name, accel) => ipcRenderer.invoke('keys:set', name, accel),   // -> { ok, error?: 'taken' | 'clash' | 'bad' }
    reset: () => ipcRenderer.invoke('keys:reset'),
    pause: (on) => ipcRenderer.send('keys:pause', on),                   // let go of the global ones while recording
    onChange: (cb) => ipcRenderer.on('keys:changed', (_e, k) => cb(k)),
    onUsed: (cb) => ipcRenderer.on('keys:used', (_e, name) => cb(name)),  // a global one fired (the tour ticks it off)
  },
});

if (process.argv.includes('--sienna-mini')) {
  contextBridge.exposeInMainWorld('siennaMini', {
    onOpen: (cb) => ipcRenderer.on('mini:open', () => cb()),     // flick the lid open
    onClose: (cb) => ipcRenderer.on('mini:close', () => cb()),   // shut it (Esc, blur and the shortcut come through here)
    closing: () => ipcRenderer.send('mini:closing'),              // the page started shutting the lid itself (Esc, a click on the margin)
    closed: () => ipcRenderer.send('mini:closed'),                // the lid has landed and faded: hide the window
    reload: () => ipcRenderer.send('mini:reload'),                // reload the page (Settings > Lettering changed)
  });
}
