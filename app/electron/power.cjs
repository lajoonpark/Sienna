// How warm the computer is and whether it runs on battery, for the shop's auto cool-down (src/quality.js).
// macOS reports a thermal state (nominal, fair, serious, critical) as the machine heats up; other systems
// say 'unknown' and the shop then goes by its own frame times only. Sent to the shop window as
// 'power:state' { thermal, battery } whenever either changes; 'power:get' answers the same on request.
//   SIENNA_THERMAL=serious (or fair, critical) pretends the machine is that warm, to try the cool-down.
const { powerMonitor, ipcMain } = require('electron');

function createPower({ send, guarded }) {
  const thermal = () => process.env.SIENNA_THERMAL || (typeof powerMonitor.getCurrentThermalState === 'function' ? powerMonitor.getCurrentThermalState() : 'unknown');
  const battery = () => { try { return powerMonitor.isOnBatteryPower(); } catch { return false; } };
  const state = () => ({ thermal: thermal(), battery: battery() });
  const push = () => send(state());
  powerMonitor.on('thermal-state-change', push);
  powerMonitor.on('on-battery', push);
  powerMonitor.on('on-ac', push);
  ipcMain.handle('power:get', guarded(() => state()));
  return { state };
}

module.exports = { createPower };
