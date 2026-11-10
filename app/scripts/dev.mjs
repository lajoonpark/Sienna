// `npm run dev`: start the vite dev server, then open the Electron app pointed at it.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const electronPath = createRequire(import.meta.url)('electron'); // path to the electron binary

// Linux: Chromium's sandbox needs either unprivileged user namespaces or a setuid-root helper next to
// the Electron binary. npm cannot install the helper setuid, so say how, rather than turning the sandbox off.
if (process.platform === 'linux') {
  const helper = join(dirname(electronPath), 'chrome-sandbox');
  try {
    const st = statSync(helper);
    if (!(st.uid === 0 && st.mode & 0o4000)) {
      console.log(`If Electron stops with a sandbox error, give its sandbox helper the rights it needs (once per npm install):
  sudo chown root:root ${helper} && sudo chmod 4755 ${helper}`);
    }
  } catch { /* no helper: nothing to say */ }
}
const server = await createServer();
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';
console.log(`Sienna dev server: ${url}`);

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, SIENNA_DEV_URL: url },
});
const stop = async (code = 0) => { await server.close(); process.exit(code); };
child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => { child.kill(); });
process.on('SIGTERM', () => { child.kill(); });
