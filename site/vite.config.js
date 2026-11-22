import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The app's scene builders are shared source; the site resolves Three.js from its own install.
export default defineConfig({
  resolve: { dedupe: ['three'] },
  server: { fs: { allow: [
    fileURLToPath(new URL('.', import.meta.url)),
    fileURLToPath(new URL('../app/src', import.meta.url)),
  ] } },
});
