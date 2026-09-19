import { escapeHtml, readingMinutes } from './markdown.ts';
import type { Post, PostSummary } from './repository.ts';

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

function layout(
  config: SiteConfig,
  options: { title: string; description: string; body: string; canonical?: string },
): string {
  const pageTitle =
    options.title === config.title ? config.title : `${options.title} — ${config.title}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(options.description)}">
${options.canonical ? `<link rel="canonical" href="${escapeHtml(options.canonical)}">` : ''}
<link rel="stylesheet" href="/style.css">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)}" href="/feed.xml">
</head>
<body>
<header class="site">
  <div class="site-bar">
    <a class="site-title" href="/">${escapeHtml(config.title)}</a>
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
    body: `<h1>${heading}</h1>\n${list}\n`,
  });
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
