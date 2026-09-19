// All D1 access. Kept in one module so the query count per request stays
// visible: the Workers free plan allows 50 D1 queries per invocation, and every
// page here uses one or two.

export interface PostSummary {
  slug: string;
  title: string;
  description: string;
  published_at: string;
  word_count: number;
  tags: string[];
}

export interface Post extends PostSummary {
  body_md: string;
  body_html: string;
  updated_at: string | null;
  approved_quote: string | null;
  sources: string[] | null;
}

type Row = Record<string, unknown>;

// Tags are aggregated in SQL via a correlated subquery, so the index page does
// not need a second round trip per post.
const SUMMARY_COLUMNS = `
  p.slug, p.title, p.description, p.published_at, p.word_count,
  COALESCE(
    (SELECT json_group_array(tag) FROM post_tags WHERE slug = p.slug ORDER BY tag),
    '[]'
  ) AS tags
`;

export async function listPosts(
  db: D1Database,
  options: { tag?: string; limit?: number } = {},
): Promise<PostSummary[]> {
  const limit = options.limit ?? 100;
  const where = options.tag
    ? 'WHERE p.slug IN (SELECT slug FROM post_tags WHERE tag = ?)'
    : '';
  const statement = db.prepare(
    `SELECT ${SUMMARY_COLUMNS}
     FROM posts p
     ${where}
     ORDER BY p.published_at DESC
     LIMIT ?`,
  );
  const { results } = await (options.tag
    ? statement.bind(options.tag, limit)
    : statement.bind(limit)
  ).all<Row>();
  return results.map(toSummary);
}

export async function getPost(db: D1Database, slug: string): Promise<Post | null> {
  const row = await db
    .prepare(
      `SELECT body_md, body_html, updated_at, approved_quote, sources, ${SUMMARY_COLUMNS}
       FROM posts p WHERE p.slug = ?`,
    )
    .bind(slug)
    .first<Row>();
  if (!row) return null;
  return {
    ...toSummary(row),
    body_md: String(row.body_md ?? ''),
    body_html: String(row.body_html ?? ''),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    approved_quote: row.approved_quote ? String(row.approved_quote) : null,
    sources: row.sources ? (JSON.parse(String(row.sources)) as string[]) : null,
  };
}

export async function listTags(
  db: D1Database,
): Promise<{ tag: string; count: number }[]> {
  const { results } = await db
    .prepare('SELECT tag, COUNT(*) AS count FROM post_tags GROUP BY tag ORDER BY count DESC, tag')
    .all<{ tag: string; count: number }>();
  return results;
}

export async function countPosts(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM posts')
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export interface UpsertPost {
  slug: string;
  title: string;
  description: string;
  published_at: string;
  body_md: string;
  body_html: string;
  word_count: number;
  tags: string[];
  approved_quote?: string | null;
  sources?: string[] | null;
}

// Everything is bound, never interpolated, so a post body can contain quotes,
// semicolons, or SQL without an escaping step of our own.
export async function upsertPost(db: D1Database, post: UpsertPost): Promise<void> {
  const statements = [
    db
      .prepare(
        `INSERT INTO posts
           (slug, title, description, published_at, updated_at, body_md, body_html, word_count, approved_quote, sources)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           published_at = excluded.published_at,
           updated_at = datetime('now'),
           body_md = excluded.body_md,
           body_html = excluded.body_html,
           word_count = excluded.word_count,
           approved_quote = excluded.approved_quote,
           sources = excluded.sources`,
      )
      .bind(
        post.slug,
        post.title,
        post.description,
        post.published_at,
        post.body_md,
        post.body_html,
        post.word_count,
        post.approved_quote ?? null,
        post.sources ? JSON.stringify(post.sources) : null,
      ),
    db.prepare('DELETE FROM post_tags WHERE slug = ?').bind(post.slug),
    ...post.tags.map((tag) =>
      db
        .prepare('INSERT OR IGNORE INTO post_tags (slug, tag) VALUES (?, ?)')
        .bind(post.slug, tag),
    ),
  ];

  // Batched into one D1 round trip and atomic: a half-written post with no tags
  // would be worse than no post at all.
  await db.batch(statements);
}

export async function deletePost(db: D1Database, slug: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM posts WHERE slug = ?').bind(slug).run();
  return (result.meta.changes ?? 0) > 0;
}

function toSummary(row: Row): PostSummary {
  let tags: string[] = [];
  try {
    tags = JSON.parse(String(row.tags ?? '[]')) as string[];
  } catch {
    tags = [];
  }
  return {
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description),
    published_at: String(row.published_at),
    word_count: Number(row.word_count ?? 0),
    tags,
  };
}
