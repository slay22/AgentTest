# AGENTS.md

This is a [Flue](https://flueframework.com) project: agents are TypeScript functions.

## Layout

- `src/agents/` — agent modules. A module whose first line is the `'use agent'` directive exports agents: every exported capitalized function is one, and the function name is its durable identity.
- `src/db.ts` — the persistence adapter for durable conversations.
- `src/skills/<name>/SKILL.md` — Agent Skills format. Frontmatter `name` must match the directory name; other files in the directory become supporting files the agent reads on demand. Mounted with `useSkill(import ...)` in the agent module — static imports only.
- `src/tools/` — `defineTool` definitions. Tools that need agent state (e.g. `approve-draft.ts`, `publish-post.ts`) are factories taking the state setter or a predicate, since `usePersistentState` is render-scoped.
- `src/tools/drafts.ts` — path confinement plus the publish logic, shared so both publish-path tools normalize a draft path identically.

## Commands

- `npx flue run src/agents/blogger-agent.ts --message "Hi"` — run an agent locally, no server.
- `npm run check:types` — typecheck.
- `npx flue docs search <query>` — search the Flue docs from the terminal (then `flue docs read <path>`).
- `npx flue add` — list blueprints for adding channels, sandboxes, and databases.

## Repository privacy

This repository is **public**. Keep credentials out of it: no Cloudflare API tokens, no account
id, no `PUBLISH_TOKEN`, no provider API keys. `site/.dev.vars` and the root `.env` are gitignored
and are the only places local secrets belong; CI reads its credentials from repository secrets.

`site/wrangler.jsonc` intentionally commits the D1 `database_id` and the site's public URL —
identifiers CI needs, not credentials.
