// Secrets cannot be inferred from wrangler.jsonc, so the secret bindings are
// declared here alongside the generated worker-configuration.d.ts.
//
// `wrangler types --include-runtime=false` regenerates the DB/ASSETS half; this
// file carries the half Wrangler cannot see.
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SITE_TITLE: string;
  SITE_DESCRIPTION: string;
  SITE_ORIGIN: string;

  // Publish API. Off unless PUBLISH_ENABLED is exactly "true", the same
  // kill-switch pattern as the receiptScanner MCP Worker: the route exists in
  // the deployed Worker but refuses traffic until the secret is flipped.
  // See README "Publishing" for why this is a token and not Cloudflare Access.
  PUBLISH_ENABLED?: string;
  PUBLISH_TOKEN?: string;
}
