// Runs before `npm run dev` / `npm run web` (predev/preweb in package.json): if a pull added or
// changed packages, run `npm install` first, so a new import never fails with "Failed to resolve".
// Node built-ins only, because node_modules itself may be what is missing.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = deps.filter((d) => !existsSync(join(root, 'node_modules', d, 'package.json')));
// npm writes node_modules/.package-lock.json on every install; a newer package-lock.json means a
// pull changed versions since then
const mtime = (f) => { try { return statSync(join(root, f)).mtimeMs; } catch { return 0; } };
const stale = mtime('package-lock.json') > mtime('node_modules/.package-lock.json') + 1000;

if (missing.length || stale) {
  console.log(missing.length ? `Installing new packages: ${missing.join(', ')}` : 'package-lock.json changed, running npm install');
  execSync('npm install', { cwd: root, stdio: 'inherit' });
}
