import { countDrafts, deleteDraft, getDraft, listDrafts, upsertDraft } from './repository.ts';
import type { Router } from './router.ts';
import { parseDraftInput } from './validation.ts';
import { draftIndexPage, draftPage, notFoundPage, type SiteConfig } from './views.ts';
import { countWords, renderMarkdown } from './markdown.ts';

// Draft previews.
//
// This is the only module that touches `env.DRAFTS`. Keeping it separate is the
// whole point of putting drafts in their own database: the public routes are
// written against `env.DB` and the drafts binding is not in scope for them, so
// unpublished work cannot reach a public page by way of a forgotten filter.
//
// Access is decided in one place, `draftAccess`, and the routes refuse to serve
// anything unless it resolves to a real protection mode. The default on a fresh
// deployment is `off`, so shipping this changes nothing until someone opts in.

export type DraftAccessMode = 'off' | 'token' | 'access';

export interface DraftAccess {
  mode: DraftAccessMode;
  /** True when draft pages are reachable from a browser session. */
  browsable: boolean;
}

/**
 * How drafts are protected on this deployment.
 *
 * - `off`    — nothing is served. The default, and the safe state to deploy in.
 * - `token`  — requires `Authorization: Bearer $PUBLISH_TOKEN`. Usable by the
 *              agent over HTTP, but not by a browser address bar, so previews are
 *              not browsable in this mode.
 * - `access` — assumes a Cloudflare Access application covers `/drafts*`, which
 *              blocks unauthenticated requests at the edge before this Worker
 *              runs. This is the mode that makes previews openable in a browser.
 *
 * `access` is opt-in by name because getting it wrong means drafts are public.
 * The CI post-deploy gate checks that an unauthenticated request to /drafts is
 * not 200, which catches exactly that mistake.
 */
export function draftAccess(env: Env): DraftAccess {
  if (env.DRAFTS_ENABLED !== 'true') return { mode: 'off', browsable: false };
  if (env.DRAFTS_TRUST_ACCESS === 'true') return { mode: 'access', browsable: true };
  return { mode: 'token', browsable: false };
}

function siteConfig(env: Env): SiteConfig {
  return {
    title: env.SITE_TITLE,
    description: env.SITE_DESCRIPTION,
    origin: env.SITE_ORIGIN,
  };
}

/** Never cached: a stale preview could be approved while the agent has moved on. */
const NO_STORE = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store, must-revalidate',
  // Belt and braces with Access: drafts should not end up in a search index even
  // if the protection is misconfigured.
  'x-robots-tag': 'noindex, nofollow',
} as const;

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: NO_STORE });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function unauthorized(access: DraftAccess): Response {
  if (access.mode === 'off') {
    return json(
      { error: 'drafts are disabled on this deployment', hint: 'set DRAFTS_ENABLED=true to enable them' },
      403,
    );
  }
  return json(
    {
      error: 'unauthorized',
      hint: 'Drafts need either a bearer token or a Cloudflare Access application covering /drafts*. Browsing previews requires Access; a token cannot be sent from an address bar.',
    },
    401,
  );
}

function tokenMatches(header: string | null, env: Env): boolean {
  // Fail closed: no token configured means nothing is authorized.
  if (!env.PUBLISH_TOKEN) return false;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  return token === env.PUBLISH_TOKEN;
}

export function registerDraftRoutes(router: Router): void {
  /** Gate every draft surface through one check. */
  function allow(request: Request, env: Env): DraftAccess | null {
    const access = draftAccess(env);
    if (access.mode === 'off') return null;
    if (access.mode === 'access') return access;
    return tokenMatches(request.headers.get('authorization'), env) ? access : null;
  }

  /** Agent-facing: write a draft and get back the URL to review it. */
  router.post('/api/drafts', async ({ request, env }) => {
    const access = allow(request, env);
    if (!access) return unauthorized(draftAccess(env));

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'body must be JSON' }, 400);
    }

    const parsed = parseDraftInput(payload);
    if (!parsed.ok) return json({ error: parsed.error }, 422);

    const draft = parsed.value;
    await upsertDraft(env.DRAFTS, {
      slug: draft.slug,
      title: draft.title,
      description: draft.description,
      body_md: draft.body_md,
      body_html: renderMarkdown(draft.body_md),
      word_count: countWords(draft.body_md),
      tags: draft.tags,
      content_hash: draft.content_hash ?? null,
    });

    return json(
      { saved: true, slug: draft.slug, preview: `${env.SITE_ORIGIN}/drafts/${draft.slug}` },
      201,
    );
  });

  router.delete('/api/drafts/:slug', async ({ request, env, params }) => {
    const access = allow(request, env);
    if (!access) return unauthorized(draftAccess(env));
    const removed = await deleteDraft(env.DRAFTS, params.slug);
    return removed ? json({ deleted: true }) : json({ error: 'not found' }, 404);
  });

  /** Metadata for tooling and the deploy gate. */
  router.get('/api/drafts', async ({ request, env }) => {
    const access = allow(request, env);
    if (!access) return unauthorized(draftAccess(env));
    return json({ mode: access.mode, drafts: await listDrafts(env.DRAFTS) });
  });

  router.get('/drafts', async ({ request, env }) => {
    const access = allow(request, env);
    if (!access) return unauthorized(draftAccess(env));
    return html(draftIndexPage(siteConfig(env), await listDrafts(env.DRAFTS)));
  });

  router.get('/drafts/:slug', async ({ request, env, params }) => {
    const access = allow(request, env);
    if (!access) return unauthorized(draftAccess(env));
    const draft = await getDraft(env.DRAFTS, params.slug);
    if (!draft) return html(notFoundPage(siteConfig(env)), 404);
    return html(draftPage(siteConfig(env), draft));
  });
}

export async function draftStatus(env: Env): Promise<{ mode: DraftAccessMode; browsable: boolean; count: number }> {
  const access = draftAccess(env);
  return {
    mode: access.mode,
    browsable: access.browsable,
    count: access.mode === 'off' ? 0 : await countDrafts(env.DRAFTS),
  };
}
