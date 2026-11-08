// `npm run dev`: start the vite dev server, then open the Electron app pointed at it.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const electronPath = createRequire(import.meta.url)('electron'); // path to the electron binary
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
