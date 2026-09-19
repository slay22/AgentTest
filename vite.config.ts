import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

// Node target: `vite dev` serves app.ts on port 5173, `vite build` produces
// dist/server.mjs. The plugin is also what makes the 'use agent' scan run, so
// without this file there is no application — only `flue run` for one module.
export default defineConfig({
  plugins: [flue()],
});
