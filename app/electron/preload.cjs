// The only bridge between the shop (renderer) and YouTube Music (main process). Also the mini window's
// preload (mini.cjs starts it with --sienna-mini), which gets window.siennaMini as well. Sandboxed: it can
// require nothing but 'electron', so both live in this one file. The main process answers only Sienna's own
// pages in Sienna's own windows (security.cjs), whatever a page does with this.
const { contextBridge, ipcRenderer } = require('electron');

const isDev = process.argv.includes('--sienna-dev');
// Subscribe the page to a channel. Nothing is handed back: ipcRenderer.on() returns ipcRenderer itself,
// and that must never cross the bridge into the page.
const on = (channel) => (cb) => { ipcRenderer.on(channel, (_e, ...args) => cb(...args)); };

contextBridge.exposeInMainWorld('sienna', {
  isDev,
  platform: process.platform,
  home: (next) => ipcRenderer.invoke('ytm:home', next),
  library: () => ipcRenderer.invoke('ytm:library'),
  search: (q, filter) => ipcRenderer.invoke('ytm:search', q, filter),
  artistSongs: (browseId) => ipcRenderer.invoke('ytm:artistSongs', browseId),
  playlistArt: (play) => ipcRenderer.invoke('ytm:playlistArt', play),
  albumSongs: (play) => ipcRenderer.invoke('ytm:albumSongs', play),
  lyrics: (videoId) => ipcRenderer.invoke('ytm:lyrics', videoId),
  queue: () => ipcRenderer.invoke('ytm:queue'),
  play: (endpoint) => ipcRenderer.invoke('ytm:play', endpoint),
  prepare: (endpoint) => ipcRenderer.invoke('ytm:prepare', endpoint),
  startPrepared: (endpoint) => ipcRenderer.invoke('ytm:startPrepared', endpoint),
  command: (name, arg) => ipcRenderer.invoke('ytm:command', name, arg),
  signIn: () => ipcRenderer.invoke('ytm:signIn'),
  retry: () => ipcRenderer.invoke('ytm:retry'),
  status: () => ipcRenderer.invoke('ytm:status'),
  volumeMode: (mode) => ipcRenderer.invoke('ytm:volumeMode', mode),
  // Settings > Account
  account: () => ipcRenderer.invoke('ytm:account'),
  accounts: () => ipcRenderer.invoke('ytm:accounts'),
  switchAccount: (i) => ipcRenderer.invoke('ytm:switchAccount', i),
  addAccount: () => ipcRenderer.invoke('ytm:addAccount'),
  signOut: () => ipcRenderer.invoke('ytm:signOut'),
  onState: on('ytm:state'),
  onAccount: on('ytm:account'),
  onStatus: on('ytm:status'),
  // the brush strokes baked at build time (app/strokes/shop.bin.gz)
  shippedStrokes: () => ipcRenderer.invoke('strokes:shipped'),
  // how warm the computer is, and battery (electron/power.cjs)
  power: {
    get: () => ipcRenderer.invoke('power:get'),
    onChange: on('power:state'),
  },
  // keyboard shortcuts (electron/shortcuts.cjs)
  keys: {
    get: () => ipcRenderer.invoke('keys:get'),
    set: (name, accel) => ipcRenderer.invoke('keys:set', name, accel),
    reset: () => ipcRenderer.invoke('keys:reset'),
    pause: (paused) => ipcRenderer.send('keys:pause', paused),
    onChange: on('keys:changed'),
    onUsed: on('keys:used'),
  },
  // app-level controls (login item, Discord RPC, manual update check, diagnostics, app menu actions)
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    loginItem: (on) => ipcRenderer.invoke('app:loginItem', on),
    discordRpc: (on) => ipcRenderer.invoke('app:discordRpc', on),
    checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
    openRelease: (url) => ipcRenderer.invoke('app:openRelease', url),
    diagnostics: () => ipcRenderer.invoke('app:diagnostics'),
    onMenu: on('app:menu'),
  },
});

if (process.argv.includes('--sienna-mini')) {
  contextBridge.exposeInMainWorld('siennaMini', {
    onOpen: on('mini:open'),
    onClose: on('mini:close'),
    closing: () => ipcRenderer.send('mini:closing'),
    closed: () => ipcRenderer.send('mini:closed'),
  });
}
