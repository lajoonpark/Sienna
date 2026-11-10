// Shared by the check scripts: where they write, and whether Electron's sandbox stays on.
import { mkdirSync, mkdtempSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The output folder for a script. Given one, it is used if it is a real folder (not a symlink) that you own;
// with none, a fresh private folder with a random name is made in the temp dir (never a fixed /tmp/<name>,
// which another account on the machine could create first and fill with symlinks).
export function outDir(given, name) {
  if (!given) {
    const dir = mkdtempSync(join(tmpdir(), `${name}-`));
    console.log(`[${name}] writing to ${dir}`);
    return dir;
  }
  const dir = resolve(given);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`${dir} is not a plain folder`);
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) throw new Error(`${dir} belongs to another user`);
  return dir;
}

// Electron flags that switch Chromium's sandbox off: only where it cannot work at all (running as root,
// as in CI containers) or when asked for with SIENNA_NO_SANDBOX=1.
export function sandboxArgs() {
  const root = typeof process.getuid === 'function' && process.getuid() === 0;
  return root || process.env.SIENNA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [];
}
