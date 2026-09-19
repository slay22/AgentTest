# agenttest-posts

The public blog that renders posts the `BloggerAgent` in the parent directory writes.

A single Cloudflare Worker, following the same conventions as the sibling `receiptScanner`
project: no server framework, native `fetch` handler, D1 for storage, zod for validation, an
`ASSETS` binding for static files, `x-deploy-version` on every response, and a kill switch on
the write path.

## Production

| | |
| --- | --- |
| Worker | `agenttest-posts` |
| URL | **https://blog.fliagutierrez.com** |
| Also served at | https://agenttest-posts.leonardomgutierrez.workers.dev |
| D1 database | `agenttest-posts` (`64e4d1fc-0c9d-4feb-b7f2-fa06248ad3e5`) |
| Publishing | **disabled** — no write surface, as intended |

`SITE_ORIGIN` is the custom domain, which is what canonical links, `/sitemap.xml` and
`/robots.txt` are built from. Both hostnames serve the same Worker, so pointing `SITE_ORIGIN`
at the `workers.dev` host would publish a second, competing origin — which is exactly what
happened before this was set, and why search engines were being offered two identical sites.

The Worker name, the D1 `database_id` and `SITE_ORIGIN` are committed on purpose: the first two
are identifiers rather than credentials, and CI needs all three to deploy. The Cloudflare
**account id** is deliberately *not* in any file — it lives in the `CLOUDFLARE_ACCOUNT_ID`
repository secret.

This repository is **public**, so keep it that way: no API tokens, no account id, no
`PUBLISH_TOKEN` in tracked files. `site/.dev.vars` is gitignored and is the only place a local
secret should live.

To redeploy by hand rather than through CI:

```sh
npm run deploy
```

CI deploys too, on every push to `main`, and **fails** if `CLOUDFLARE_API_TOKEN` is missing
rather than skipping quietly — a green deploy job that deployed nothing is worse than a red one.
## Why a Worker and not Pages

Cloudflare's own [compatibility matrix](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
settles it, and the deciding row is Durable Objects:

| | Workers | Pages |
| --- | --- | --- |
| Durable Objects | ✅ | 🟡 workaround only |
| Cron Triggers | ✅ | ❌ |
| Workers Logs / Logpush / Tail Workers | ✅ | ❌ |
| Cloudflare Vite plugin | ✅ | ❌ |
| Static asset requests | free | free |

Pages can host this blog today. But **the agent is going to move to Cloudflare**, and Flue's
Cloudflare target runs each agent conversation in a Durable Object class — which Pages does not
properly support. One platform for both means the site and the agent can share a repository,
a D1 database, and eventually a deployment. Pages would mean migrating later.

## Why D1

This is not a preference, it falls out of the Cloudflare architecture:

1. Flue's Cloudflare target **rejects `db.ts`** and gives each agent a Durable Object. The
   default sandbox is in-memory and has **no durable filesystem**, so the agent's
   `publish_post` cannot copy a file the way it does locally.
2. So published posts need durable storage the agent can write to: D1, R2, or KV. Posts are
   small text documents with metadata that wants querying (tags, ordering, pagination) — that
   is D1's shape. R2 is for blobs (images later), and KV is eventually consistent, which is
   wrong for "I just published it, show me".

Posts are stored with **both** the markdown source and the HTML rendered at publish time. The
markdown source is the thing a human edits; the HTML is what gets served.

## Free-plan constraints that shaped the design

The Workers free plan allows **10 ms of CPU per request** (paid: 5 minutes). Cloudflare's own
docs note that server-side rendering "typically uses 10-20 ms" — so parsing markdown on every
page view would sit at or over the limit. Two consequences:

- **Markdown is rendered once, at publish time**, and the HTML is stored. The read path is a
  single D1 query plus string concatenation.
- **D1 query time is not counted as CPU time** ("waiting on network requests... or database
  queries does not count"), so reading from D1 on every page view is cheap.

Other free-tier numbers this design respects: 50 D1 queries per invocation (every page here
uses one or two), 500 MB per database, 5 GB per account, 100,000 requests/day.

## Setup

```sh
npm install
npx wrangler types --include-runtime=false
npm run typecheck
npm test
```

Create the D1 database and put its id in `wrangler.jsonc`:

```sh
npx wrangler d1 create agenttest-posts
# copy the printed database_id into wrangler.jsonc, replacing the placeholder
npm run db:migrate:local     # or db:migrate:remote for production
```

Local secrets live in `.dev.vars` (gitignored — copy `.dev.vars.example`):

```sh
openssl rand -hex 32   # use the output as PUBLISH_TOKEN
```

Then:

```sh
npm run dev            # http://127.0.0.1:8787
npm run seed           # pulls posts/ from the parent repo through the publish API
```

Deploy:

```sh
npx wrangler secret put PUBLISH_TOKEN   # never in wrangler.jsonc
npm run deploy
```

**Do not set `PUBLISH_ENABLED` in production.** Leaving it unset is the correct production
posture: the blog is public, so it should have no write surface. See "The publishing model"
below for why, and for how the private agent writes posts instead.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /` | Post index |
| `GET /posts/:slug` | One post |
| `GET /tags/:tag` | Posts carrying a tag |
| `GET /feed.xml` | RSS |
| `GET /sitemap.xml` | Sitemap, for a public blog to be indexable |
| `GET /robots.txt` | Allows crawling, points at the sitemap |
| `GET /api/health` | `{ ok, version, posts }` — also the deploy gate |
| `GET /api/tags` | Tag list with counts |
| `POST /api/posts` | Publish or update one post |
| `DELETE /api/posts/:slug` | Remove a post |

Static files (`/style.css`, `/404.html`) are served through the `ASSETS` binding.

## Publishing

`POST /api/posts` takes JSON and renders the markdown server-side, so the caller never needs a
markdown renderer:

```jsonc
{
  "slug": "local-llms",              // the filename, per post-metadata/SKILL.md
  "title": "Local LLMs Just Grew Up",
  "description": "Running a model on your own hardware is now a real option.",
  "published_at": "2026-09-19",
  "body_md": "# Local LLMs Just Grew Up\n\n...",
  "tags": ["local-llms", "hardware"],
  "approved_quote": "ship it",        // optional audit trail from the approval gate
  "sources": ["https://..."]          // optional, from verify_claims
}
```

Requires `Authorization: Bearer $PUBLISH_TOKEN` **and** `PUBLISH_ENABLED=true`. The two are
deliberately independent: the route can be killed without rotating the token, the same
`MCP_ENABLE` pattern used in `receiptScanner`. With publishing disabled, writes return `403`
and reads are unaffected. A misconfigured deployment fails closed — no token configured means
nothing is authorized.

This endpoint exists for `npm run seed` and local work. **Production runs with it disabled**, so
there is no public write path — see "The publishing model" below.

### Seeding a deployment

Because production has no write surface, content reaches it through `wrangler d1 execute`
rather than over HTTP:

```sh
npm run seed:sql
npx wrangler d1 execute agenttest-posts --remote --file=seed.sql
```

`scripts/export-sql.ts` reads `posts/`, parses frontmatter, renders markdown through the **same
pipeline the Worker uses**, and emits upsert statements to `site/seed.sql` (gitignored, since it
is a build artifact of the repo content). A post seeded this way is byte-identical to one
published over the API.

Rerunnable — every statement upserts, and tags are replaced rather than merged so a tag removed
from the frontmatter actually disappears. This is also why it beats temporarily turning the
publish endpoint on: no window where a public write surface exists.

Drafts never go to production. `posts/` only, unless you explicitly pass `--drafts`.

Validation errors name the offending field (`"tags.0 must be lowercase alphanumeric with
hyphens"`) because the caller is a language model, and a specific complaint is what lets it
correct the request instead of guessing.

### The publishing model: public blog, private agent

Decided: **the blog is public on purpose, the agent is private on purpose.** That split is what
determines the whole auth story, and it means the production blog should expose **no write
surface at all.**

The reason is that **Cloudflare Access is per-hostname, not per-path.** A Worker-level Access
application covers every path on a hostname, so it cannot gate `/api/*` while leaving the blog
public — and it cannot be put in front of the blog without making the blog private. So Access
is the *wrong tool* on this hostname, which rules out the `receiptScanner` pattern (Access over
everything) here.

What that means in practice:

- **Production runs with publishing disabled.** `PUBLISH_ENABLED` unset or `false`, so
  `POST /api/posts` and `DELETE /api/posts/:slug` return `403` and no public write endpoint
  exists. Reads and the sitemap are unaffected.
- **The publish API is a development and seeding tool**, not the production path. `npm run seed`
  uses it against `wrangler dev`; that is its purpose.
- **The agent publishes by writing D1 directly.** It is a private Worker with no public route,
  so it can hold a `DB` binding to this database and insert through `repository.ts`. No HTTP, no
  token, nothing to leak. Multiple Workers binding one D1 database is normal.
- **`PUBLISH_TOKEN` therefore only ever protects a non-production surface.** If it has been
  somewhere it should not have been, rotate it; but do not let its existence imply the
  production blog accepts writes.

This is stronger than a token on a public endpoint: there is nothing to attack because there is
nothing listening.

### Drafts should live in a different database

The private/public split should extend to storage. The public Worker holds a binding to the
posts database; if drafts lived in the same database, that binding *could* read unreviewed
work even with no route exposing it.

Putting drafts in a second D1 database — bound only by the agent — makes the separation
structural rather than a matter of route discipline: **the public Worker physically cannot read
a draft.** D1 allows 10 databases on the free plan, so this costs nothing.

Publishing then becomes a copy with rendering: read the draft, render markdown, write the post
to the public database. Which is the step the agent already owns.

## Continuous integration

`.github/workflows/ci.yml` at the repo root covers **both** projects in this repository.

| Job | Runs on | What it does |
| --- | --- | --- |
| `agent` | every push and PR | `check:types`, then the claim-verification regression tests |
| `site` | every push and PR | `wrangler types`, `typecheck`, `vitest`, `wrangler deploy --dry-run` |
| `deploy` | pushes to `main` only | deploys the Worker, then runs the post-deploy gate |

The deploy job is skipped with a warning (not a failure) until the Cloudflare secrets exist, so
CI is green from the first push.

### Required repository secrets

Set both under Settings → Secrets and variables → Actions:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → the **Edit Cloudflare Workers** template |
| `CLOUDFLARE_ACCOUNT_ID` | any Cloudflare dashboard URL, or the Workers overview page |

### Provisioning (already done for this deployment)

```sh
npx wrangler d1 create agenttest-posts   # paste the printed id into wrangler.jsonc
npm run db:migrate:remote                # apply migrations to production
npm run seed:sql && npx wrangler d1 execute agenttest-posts --remote --file=seed.sql
```

CI has one guard that fails with instructions rather than letting Wrangler emit something
confusing. It checks that `wrangler.jsonc` has no placeholders left, so a fork of this repo gets
a clear message instead of a deploy error.

Also set `SITE_ORIGIN` in `wrangler.jsonc` to the deployed URL. CI reads it from there for the
post-deploy gate — one source of truth, no extra repository variable.

`.dev.vars` overrides `vars` from `wrangler.jsonc` during local development, which is why
`SITE_ORIGIN` is localhost in `.dev.vars.example` but the production URL in `wrangler.jsonc`.

### Migrations are deliberately not automated

CI never applies migrations. A schema change should be a reviewed step, not a side effect of a
push, so `npm run db:migrate:remote` is run by hand **before** deploying code that depends on it.

### What the post-deploy gate asserts

The blog is public, so the gate is the inverse of `receiptScanner`'s (which asserts `302` to
prove Access is still up). It asserts:

- `GET /` returns `200` — the blog is up and public
- the `x-deploy-version` header is present on the root response
- `/api/health` reports `ok: true`
- `/sitemap.xml`, `/feed.xml` and `/robots.txt` all return `200` — a public blog needs to be
  discoverable
- **`POST /api/posts` returns `403`** — production must expose no write surface

That last check is the one that earns its place. It fails the build if `PUBLISH_ENABLED` is ever
set on the deployment, if the kill switch is lost, or if the route is refactored in a way that
skips the guard — all of which would quietly open a public write endpoint on a public blog.

### Node version

Both jobs pin **22.19**. That is a floor, not a preference: it is the first release with
TypeScript type-stripping on by default, which the agent job's `node
tests/verify-claims.check.ts` depends on, and it is also Flue's minimum supported version.

## Content safety

Post bodies derive from web search results, so a search passage containing `<script>` can end up
inside a draft. Markdown is rendered with **raw HTML escaped and unsafe link protocols dropped**,
which is why `[x](javascript:...)` renders as plain text and `<script>` renders as visible
characters. This is the same escape-first contract as `public/js/markdown.mjs` in
`receiptScanner`, and `tests/markdown.test.ts` guards it.

## Layout

```
src/
  index.ts        Worker entry: routes, version stamping, ASSETS fallback
  router.ts       Minimal path matcher (no framework)
  repository.ts   All D1 access
  markdown.ts     Publish-time markdown -> HTML, escape-first
  views.ts        HTML assembly
  validation.ts   zod schema for the publish payload
  frontmatter.ts  Frontmatter reader, used only by scripts/seed.ts
  env.d.ts        Secret bindings Wrangler cannot infer
  version.ts      Generated by scripts/write-version.mjs
public/           Static assets (style.css, 404.html)
migrations/       Append-only D1 migrations
tests/            Vitest
```

## Planned: moving the agent here

Not done yet. Notes from researching it, including what `receiptScanner` already solved:

- The agent Worker is **private**: no public route, so there is nothing to authenticate. Flue
  agents need no mount — a registered agent is addressable by `dispatch()` and schedules without
  one (`Routing` → "Dispatch-only agents").
- It writes posts by holding a `DB` binding to **this** database and calling `repository.ts`,
  and keeps drafts in its **own** database (see "Drafts should live in a different database").
  It therefore needs `markdown.ts` and `repository.ts`; both live here and can be imported
  across, or moved to a shared module if a third consumer appears.
- Flue's Cloudflare target needs `vite.config.ts` with `flue()` + `@cloudflare/vite-plugin`,
  a `wrangler.jsonc` with `nodejs_compat` and a Durable Object migration per agent, and the
  removal of `src/db.ts` (rejected at build time on this target).
- `useSandbox(local({}))` must go — there is no host filesystem. Flue's default in-memory
  sandbox works for tools and structured results; Cloudflare Computer gives a durable workspace;
  Cloudflare Sandbox gives a full Linux environment.
- **Workers AI is not viable for this agent on the free plan**: 10,000 neurons/day. Confirms the
  plan to route to an external provider.
- `receiptScanner` already implements the provider chain this needs — Workers AI free →
  Mistral free (paced) → OpenCode Go BYOK with a daily cap. Reuse its shape:
  `MISTRAL_API_KEY`, `OPENCODE_GO_ENDPOINT` / `OPENCODE_GO_KEY` / `OPENCODE_GO_MODEL`, plus the
  free-tier pacing rule (`mistral-small` is capped at 1 request/second, 20k tokens/min, so
  requests are paced ≥1.2s apart and a 429 is retried once after `retry-after`).
- Registering a custom provider in Flue goes through `setProvider()` in the agent module
  (not `app.ts`, since `flue run` loads only the agent module) — the current Lemonade
  registration is already the working example of this.
