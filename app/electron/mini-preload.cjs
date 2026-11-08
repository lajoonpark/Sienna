// Preload of the small window (mini.html): the same window.sienna API as the shop, plus the messages
// that open and close the lid and reload the page. Not sandboxed, so it can load the shop's preload as it is
// (whatever that exposes, the mini window gets too); it still runs with contextIsolation.
const { contextBridge, ipcRenderer } = require('electron');
require('./preload.cjs');

contextBridge.exposeInMainWorld('siennaMini', {
  onOpen: (cb) => ipcRenderer.on('mini:open', () => cb()),     // flick the lid open
  onClose: (cb) => ipcRenderer.on('mini:close', () => cb()),   // shut it (Esc, blur and the shortcut come through here)
  closing: () => ipcRenderer.send('mini:closing'),              // the page started shutting the lid itself (Esc, a click on the margin)
  closed: () => ipcRenderer.send('mini:closed'),                // the lid has landed and faded: hide the window
  reload: () => ipcRenderer.send('mini:reload'),                // reload the page (Settings > Lettering changed)
});
