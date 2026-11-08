// The only bridge between the shop (renderer) and YouTube Music (main process).
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
  onState: (cb) => ipcRenderer.on('ytm:state', (_e, s) => cb(s)),
  onSignedIn: (cb) => ipcRenderer.on('ytm:signedIn', () => cb()),
});
