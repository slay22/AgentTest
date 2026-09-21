import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

// Node target: `vite dev` serves app.ts on port 5173, `vite build` produces
// dist/server.mjs. The plugin is also what makes the 'use agent' scan run, so
// without this file there is no application — only `flue run` for one module.
export default defineConfig({
  plugins: [flue()],

  server: {
    // Vite refuses requests whose Host header it does not recognise, which is what
    // DNS-rebinding protection looks like from the outside. A Cloudflare quick
    // tunnel sends its own random hostname, so without this every tunnel request
    // gets Vite's "Blocked request" 403 — and a Telegram delivery failing with 403
    // is indistinguishable from a webhook problem.
    //
    // Scoped to the tunnel domain rather than `allowedHosts: true`, which would
    // disable the protection entirely.
    allowedHosts: ['.trycloudflare.com'],
  },
});
