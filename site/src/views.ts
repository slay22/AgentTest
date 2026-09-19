import { escapeHtml, readingMinutes } from './markdown.ts';
import type { Draft, DraftSummary, Post, PostSummary } from './repository.ts';

// HTML assembled as strings. No template engine: building a few hundred bytes of
// markup is the cheapest thing a Worker can do, which matters under the free
// plan's 10 ms CPU budget.

export interface SiteConfig {
  title: string;
  description: string;
  origin: string;
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function tagLinks(tags: string[]): string {
  return tags
    .map((tag) => `<a class="tag" href="/tags/${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`)
    .join(' ');
}

function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function terminalPath(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function layout(
  config: SiteConfig,
  options: { title: string; description: string; body: string; canonical?: string },
): string {
  const pageTitle =
    options.title === config.title ? config.title : `${options.title} — ${config.title}`;
  const path = terminalPath(config.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(options.description)}">
${options.canonical ? `<link rel="canonical" href="${escapeHtml(options.canonical)}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)}" href="/feed.xml">
</head>
<body>
<header class="site">
  <div class="terminal-chrome" aria-hidden="true">
    <span class="terminal-lights"><i></i><i></i><i></i></span>
    <span class="terminal-path">~ / sites / ${escapeHtml(path)}</span>
    <span class="terminal-state">online</span>
  </div>
  <div class="site-bar">
    <a class="site-title" data-text="${escapeHtml(config.title)}" href="/">${escapeHtml(config.title)}</a>
    <nav class="site-nav" aria-label="Primary navigation">
      <a href="/">Posts</a>
      <a href="/feed.xml">RSS</a>
    </nav>
  </div>
  <p class="site-description">${escapeHtml(config.description)}</p>
</header>
<main>
${options.body}
</main>
<footer class="site">
  <p>${escapeHtml(config.title)} · Built with <a href="https://flueframework.com">Flue</a> and running on Cloudflare.</p>
  <p class="terminal-invite">Open console: <a href="/terminal"><code>$ ssh brave-new-code</code></a></p>
</footer>
</body>
</html>
`;
}

export function indexPage(
  config: SiteConfig,
  posts: PostSummary[],
  options: { tag?: string } = {},
): string {
  const heading = options.tag
    ? `Posts tagged <span class="tag">${escapeHtml(options.tag)}</span>`
    : 'Recent notes';
  const kicker = options.tag ? 'Topic index' : 'Transmission log';

  const list =
    posts.length === 0
      ? '<p class="empty">Nothing published yet.</p>'
      : `<ul class="post-list">
${posts
  .map(
    (post) => `  <li>
    <a class="post-link" href="/posts/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a>
    <p class="post-description">${escapeHtml(post.description)}</p>
    <p class="post-meta"><time datetime="${escapeHtml(post.published_at)}">${formatDate(post.published_at)}</time><span aria-hidden="true">·</span><span>${readingMinutes(post.word_count)} min read</span>${post.tags.length ? `<span aria-hidden="true">·</span><span class="tag-list">${tagLinks(post.tags)}</span>` : ''}</p>
  </li>`,
  )
  .join('\n')}
</ul>`;

  return layout(config, {
    title: options.tag ? `Posts tagged ${options.tag}` : config.title,
    description: config.description,
    body: `<p class="section-kicker">${kicker}</p>\n<h1>${heading}</h1>\n${list}\n`,
  });
}

export function terminalPage(config: SiteConfig, posts: PostSummary[]): string {
  const path = terminalPath(config.title);
  const postList = posts.length
    ? posts
        .map(
          (post, index) => `<li class="terminal-post">
  <span class="terminal-post-number">${String(index + 1).padStart(2, '0')}</span>
  <a data-post-link data-description="${escapeHtml(post.description)}" href="/posts/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a>
  <span class="terminal-post-meta">${escapeHtml(post.tags.join(' · ') || 'untagged')}</span>
</li>`,
        )
        .join('\n')
    : '<li class="terminal-empty">No posts mounted.</li>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Console — ${escapeHtml(config.title)}</title>
<meta name="description" content="Read ${escapeHtml(config.title)} through the terminal interface.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
</head>
<body class="terminal-page">
<main class="terminal-app">
  <section class="terminal-window" data-terminal aria-label="${escapeHtml(config.title)} terminal">
    <div class="terminal-chrome" aria-hidden="true">
      <span class="terminal-lights"><i></i><i></i><i></i></span>
      <span class="terminal-path">~ / sites / ${escapeHtml(path)} / console</span>
      <span class="terminal-state">connected</span>
    </div>
    <div class="terminal-screen">
      <div class="terminal-output" data-terminal-output role="log" aria-live="polite">
        <p><span class="terminal-prompt">guest@brave-new-code:~$</span> ssh brave-new-code</p>
        <p class="terminal-success">connection established</p>
        <p class="terminal-muted">Read-only session. Type <code>help</code> for available commands.</p>
      </div>
      <div class="terminal-directory">
        <div class="terminal-directory-heading"><span>mounted: /posts</span><span>${posts.length} entr${posts.length === 1 ? 'y' : 'ies'}</span></div>
        <ol class="terminal-post-list" data-post-list>
${postList}
        </ol>
      </div>
      <noscript><p class="terminal-noscript">JavaScript is disabled. Use the post links above or <a href="/">return to the editorial site</a>.</p></noscript>
      <form class="terminal-form" data-terminal-form>
        <label class="sr-only" for="terminal-command">Terminal command</label>
        <span class="terminal-prompt" aria-hidden="true">guest@brave-new-code:~$</span>
        <input id="terminal-command" name="command" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="terminal-help">
      </form>
      <p id="terminal-help" class="terminal-help">help · list · open 1 · tags · about · clear · exit</p>
    </div>
  </section>
  <p class="terminal-exit"><a href="/">← Return to the editorial site</a></p>
</main>
<script src="/terminal.js" defer></script>
</body>
</html>
`;
}

export function postPage(config: SiteConfig, post: Post): string {
  // body_html was rendered and HTML-escaped at publish time, so it is the one
  // place output is intentionally not escaped again here.
  const sources = post.sources?.length
    ? `<section class="sources">
  <h2>Sources</h2>
  <ul>${post.sources
    .map(
      (url) =>
        `<li><a href="${escapeHtml(url)}" title="${escapeHtml(url)}" rel="nofollow noopener">${escapeHtml(sourceLabel(url))}</a></li>`,
    )
    .join('')}</ul>
</section>`
    : '';

  const body = `<article>
  <p class="section-kicker">Long-form note</p>
  <h1>${escapeHtml(post.title)}</h1>
  <p class="article-dek">${escapeHtml(post.description)}</p>
  <p class="post-meta">
    <time datetime="${escapeHtml(post.published_at)}">${formatDate(post.published_at)}</time>
    <span aria-hidden="true">·</span>
    <span>${readingMinutes(post.word_count)} min read</span>
    ${post.tags.length ? `<span aria-hidden="true">·</span><span class="tag-list">${tagLinks(post.tags)}</span>` : ''}
  </p>
  <div class="prose">
${post.body_html}
  </div>
${sources}
</article>
<p class="back"><a href="/">← All posts</a></p>
`;

  return layout(config, {
    title: post.title,
    description: post.description,
    body,
    canonical: `${config.origin}/posts/${post.slug}`,
  });
}

export function notFoundPage(config: SiteConfig): string {
  return layout(config, {
    title: 'Not found',
    description: 'No such page.',
    body: '<h1>Not found</h1><p>That page does not exist.</p><p class="back"><a href="/">← All posts</a></p>',
  });
}

export function feed(config: SiteConfig, posts: PostSummary[]): string {
  const items = posts
    .map(
      (post) => `  <item>
    <title>${escapeHtml(post.title)}</title>
    <link>${config.origin}/posts/${encodeURIComponent(post.slug)}</link>
    <guid isPermaLink="true">${config.origin}/posts/${encodeURIComponent(post.slug)}</guid>
    <description>${escapeHtml(post.description)}</description>
    <pubDate>${new Date(post.published_at).toUTCString()}</pubDate>
  </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeHtml(config.title)}</title>
  <link>${config.origin}</link>
  <description>${escapeHtml(config.description)}</description>
${items}
</channel>
</rss>
`;
}

/** A public blog wants to be indexable, so the sitemap lists every post. */
export function sitemap(config: SiteConfig, posts: PostSummary[]): string {
  const urls = posts
    .map(
      (post) => `  <url>
    <loc>${config.origin}/posts/${encodeURIComponent(post.slug)}</loc>
    <lastmod>${escapeHtml(post.published_at.slice(0, 10))}</lastmod>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${config.origin}/</loc>
  </url>
${urls}
</urlset>
`;
}

// ---------------------------------------------------------------------------
// Draft previews
//
// These pages are built from the drafts database and are never public: the route
// requires Cloudflare Access in front, or the publish token. They must also never
// be cached — a reviewer looking at a stale draft could approve text that the
// agent has already replaced.
// ---------------------------------------------------------------------------

function draftBanner(draft: Draft): string {
  const approval = draft.approved_at
    ? `<span class="draft-badge draft-badge--approved">approved ${escapeHtml(formatDate(draft.approved_at))}</span>`
    : '<span class="draft-badge">not approved</span>';
  const quote = draft.approved_quote
    ? `<p class="draft-quote">Approved with: “${escapeHtml(draft.approved_quote)}”</p>`
    : '';
  return `<div class="draft-banner">
  <span class="draft-badge draft-badge--draft">draft</span>
  ${approval}
  <span class="draft-hash">${draft.content_hash ? `sha256 ${escapeHtml(draft.content_hash.slice(0, 12))}` : 'not hashed yet'}</span>
</div>
${quote}`;
}

export function draftIndexPage(config: SiteConfig, drafts: DraftSummary[]): string {
  const list =
    drafts.length === 0
      ? '<p class="empty">No drafts. The agent has not written anything yet.</p>'
      : `<ul class="post-list">
${drafts
  .map(
    (draft) => `  <li>
    <a class="post-link" href="/drafts/${encodeURIComponent(draft.slug)}">${escapeHtml(draft.title)}</a>
    <p class="post-description">${escapeHtml(draft.description)}</p>
    <p class="post-meta"><time datetime="${escapeHtml(draft.updated_at)}">${formatDate(draft.updated_at)}</time> · ${readingMinutes(draft.word_count)} min read · <span class="draft-badge${draft.approved ? ' draft-badge--approved' : ''}">${draft.approved ? 'approved' : 'draft'}</span></p>
  </li>`,
  )
  .join('\n')}
</ul>`;

  return layout(config, {
    title: 'Drafts',
    description: 'Unpublished drafts awaiting review.',
    body: `<h1>Drafts</h1>
<p class="draft-note">Private. These pages are not published and are not indexable.</p>
${list}
`,
  });
}

export function draftPage(config: SiteConfig, draft: Draft): string {
  const body = `<article>
  ${draftBanner(draft)}
  <p class="section-kicker">Draft preview</p>
  <h1>${escapeHtml(draft.title)}</h1>
  <p class="article-dek">${escapeHtml(draft.description)}</p>
  <p class="post-meta">
    <span>edited ${formatDate(draft.updated_at)}</span>
    <span aria-hidden="true">·</span>
    <span>${readingMinutes(draft.word_count)} min read</span>
    ${draft.tags.length ? `<span aria-hidden="true">·</span><span class="tag-list">${tagLinks(draft.tags)}</span>` : ''}
  </p>
  <div class="prose">
${draft.body_html}
  </div>
</article>
<p class="back"><a href="/drafts">← All drafts</a></p>
`;

  return layout(config, {
    title: `Draft: ${draft.title}`,
    description: draft.description,
    body,
  });
}
