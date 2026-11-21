// The record racks. createRack(style, opts) picks the module for a station's style name; styles
// that are not built yet fall back to the trough. Every module exports create<Style>Rack({ onPick })
// returning the rack contract (see the SPEC / common.js).
import { createTroughRack } from './trough.js';
import { createCubbyRack } from './cubby.js';
import { createFloorleanRack } from './floorlean.js';
import { createEaselRack } from './easel.js';
import { createWallRack } from './wall.js';
import { createTallRack } from './tall.js';
import { createSpinnerRack } from './spinner.js';
import { createCratesRack } from './crates.js';

const BUILDERS = {
  trough: createTroughRack,
  cubby: createCubbyRack,
  floorlean: createFloorleanRack,
  easel: createEaselRack,
  wall: createWallRack,
  tall: createTallRack,
  spinner: createSpinnerRack,
  crates: createCratesRack,
};

export function createRack(style, opts) {
  return (BUILDERS[style] ?? createTroughRack)(opts);
}
