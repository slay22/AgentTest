import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

// Node target: `vite dev` serves app.ts on port 5173, `vite build` produces
// dist/server.mjs. The plugin is also what makes the 'use agent' scan run, so
// without this file there is no application — only `flue run` for one module.
//
// Hosts a tunnel may use to reach the dev server. Vite refuses requests whose
// Host header it does not recognise (DNS-rebinding protection), so a tunnel host
// missing from this list gets `403 Blocked request. This host is not allowed.` —
// which is indistinguishable from a webhook fault, and sends you debugging
// Telegram when the problem is Vite.
//
// Override with DEV_TUNNEL_HOSTS (comma-separated) for a different hostname.
const tunnelHosts = (
  process.env.DEV_TUNNEL_HOSTS ?? 'agent-post.fliagutierrez.com,.trycloudflare.com'
)
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [flue()],

  server: {
    // Scoped to the tunnel hosts rather than `allowedHosts: true`, which would
    // disable the protection outright.
    allowedHosts: tunnelHosts,
  },
});
