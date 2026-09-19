import { countWords, renderMarkdown } from './markdown.ts';
import {
  countPosts,
  deletePost,
  getPost,
  listPosts,
  listTags,
  upsertPost,
} from './repository.ts';
import { draftStatus, registerDraftRoutes } from './drafts.ts';
import { createRouter, type RouteContext } from './router.ts';
import { parsePublishPost } from './validation.ts';
import { VERSION } from './version.ts';
import {
  feed,
  indexPage,
  notFoundPage,
  postPage,
  sitemap,
  terminalPage,
  type SiteConfig,
} from './views.ts';

// The Worker is the whole server: no framework, matching the receiptScanner
// convention. Static files are served through the ASSETS binding, so the fetch
// handler decides what is a route and what is a file.

const router = createRouter();

function siteConfig(env: Env): SiteConfig {
  return {
    title: env.SITE_TITLE,
    description: env.SITE_DESCRIPTION,
    origin: env.SITE_ORIGIN,
  };
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Content only changes on publish. This keeps repeat views off both D1 and
      // the free plan's 10 ms CPU budget.
      'cache-control': 'public, max-age=60, s-maxage=300',
    },
  });
}

router.get('/', async ({ env }: RouteContext) => {
  const posts = await listPosts(env.DB);
  return html(indexPage(siteConfig(env), posts));
});

router.get('/terminal', async ({ env }: RouteContext) => {
  const posts = await listPosts(env.DB);
  return html(terminalPage(siteConfig(env), posts));
});

router.get('/tags/:tag', async ({ env, params }: RouteContext) => {
  const tag = params.tag.toLowerCase();
  const posts = await listPosts(env.DB, { tag });
  return html(indexPage(siteConfig(env), posts, { tag }));
});

router.get('/posts/:slug', async ({ env, params }: RouteContext) => {
  const post = await getPost(env.DB, params.slug);
  if (!post) return html(notFoundPage(siteConfig(env)), 404);
  return html(postPage(siteConfig(env), post));
});

router.get('/feed.xml', async ({ env }: RouteContext) => {
  const posts = await listPosts(env.DB, { limit: 20 });
  return new Response(feed(siteConfig(env), posts), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
});

// A public blog wants to be indexable. Served from the Worker rather than a
// static file so the origin comes from SITE_ORIGIN instead of being hand-edited.
router.get('/robots.txt', ({ env }: RouteContext) =>
  new Response(
    `User-agent: *\nAllow: /\n\nDisallow: /api/\n\nSitemap: ${env.SITE_ORIGIN}/sitemap.xml\n`,
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  ),
);

router.get('/sitemap.xml', async ({ env }: RouteContext) => {
  const posts = await listPosts(env.DB);
  return new Response(sitemap(siteConfig(env), posts), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
});

// Also the deploy gate: the version proves which build is live.
router.get('/api/health', async ({ env }: RouteContext) =>
  Response.json({
    ok: true,
    version: VERSION,
    posts: await countPosts(env.DB),
    // Reported so the post-deploy gate can assert the draft surface is not public.
    // No draft content, and no draft count when drafts are switched off.
    drafts: await draftStatus(env),
  }),
);

router.get('/api/tags', async ({ env }: RouteContext) =>
  Response.json({ tags: await listTags(env.DB) }),
);

// Publish or update one post.
//
// Markdown is rendered here rather than by the caller, so rendering happens once
// per publish instead of once per page view, and the agent never needs a
// markdown renderer of its own.
router.post('/api/posts', async ({ request, env }: RouteContext) => {
  // Kill switch: deployed but inert until PUBLISH_ENABLED is flipped. The same
  // pattern as receiptScanner's MCP_ENABLE.
  if (env.PUBLISH_ENABLED !== 'true') {
    return Response.json({ error: 'publishing is disabled on this deployment' }, { status: 403 });
  }
  if (!authorized(request.headers.get('authorization'), env.PUBLISH_TOKEN)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }

  const parsed = parsePublishPost(payload);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 422 });

  const post = parsed.value;
  await upsertPost(env.DB, {
    slug: post.slug,
    title: post.title,
    description: post.description,
    published_at: post.published_at,
    body_md: post.body_md,
    body_html: renderMarkdown(post.body_md),
    word_count: countWords(post.body_md),
    tags: post.tags,
    approved_quote: post.approved_quote ?? null,
    sources: post.sources ?? null,
  });

  return Response.json(
    { published: true, slug: post.slug, url: `${env.SITE_ORIGIN}/posts/${post.slug}` },
    { status: 201 },
  );
});

router.delete('/api/posts/:slug', async ({ request, env, params }: RouteContext) => {
  if (env.PUBLISH_ENABLED !== 'true') {
    return Response.json({ error: 'publishing is disabled on this deployment' }, { status: 403 });
  }
  if (!authorized(request.headers.get('authorization'), env.PUBLISH_TOKEN)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const removed = await deletePost(env.DB, params.slug);
  return removed
    ? Response.json({ deleted: true })
    : Response.json({ error: 'not found' }, { status: 404 });
});

// Draft routes live in their own module, which is the only place the DRAFTS
// binding is read.
registerDraftRoutes(router);

function authorized(header: string | null, expected: string | undefined): boolean {
  // No token configured means refuse, not allow: a misconfigured deployment must
  // fail closed.
  if (!expected) return false;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  return token === expected;
}

/**
 * Stamp every response with the deploy version.
 *
 * Headers are copied into a fresh Response rather than mutated: responses served
 * through the ASSETS binding have immutable headers, and mutating them in place
 * throws `TypeError: Can't modify immutable headers` at runtime.
 */
function withVersion(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-deploy-version', VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const routed = await router.handle(request, env);
    if (routed) return withVersion(routed);

    // Not a route: fall back to static assets. `run_worker_first` is on so that
    // routes are always evaluated, which means this fallback is what actually
    // serves style.css and friends.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return withVersion(asset);

    return withVersion(html(notFoundPage(siteConfig(env)), 404));
  },
};
