// Secrets cannot be inferred from wrangler.jsonc, so the secret bindings are
// declared here alongside the generated worker-configuration.d.ts.
//
// `wrangler types --include-runtime=false` regenerates the DB/ASSETS half; this
// file carries the half Wrangler cannot see.
interface Env {
  DB: D1Database;
  DRAFTS: D1Database;
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

  // Draft previews. Off unless DRAFTS_ENABLED is exactly "true", so a fresh
  // deployment serves nothing until someone opts in. DRAFTS_TRUST_ACCESS says a
  // Cloudflare Access application covers /drafts*, which is the only mode where
  // previews are openable in a browser.
  DRAFTS_ENABLED?: string;
  DRAFTS_TRUST_ACCESS?: string;
}
