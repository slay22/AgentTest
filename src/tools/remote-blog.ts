import { postFromMarkdown, type PostFields } from '../../site/src/post-from-file.ts';

// Pushes one published post to the live blog's D1 database.
//
// The local publish still writes posts/ on disk; this is what makes the post
// actually appear on the deployed site, so the agent no longer needs a manual
// `npm run seed:sql` afterwards.
//
// Two deliberate choices:
//
// 1. Every value is a bound parameter. The D1 REST API accepts a batch of
//    {sql, params}, so nothing is ever interpolated into SQL and there is no
//    escaping step to get wrong. (The bulk seed script has to build literals
//    because wrangler has no parameter support; this path does not.)
//
// 2. postFromMarkdown is shared with the seed script. A post pushed by the agent
//    and a post seeded by hand are byte-identical, so they cannot drift.
//
// Credentials come from the environment and the tool works without them: an
// unconfigured checkout publishes locally and reports that the blog was not
// updated, rather than failing.

export interface RemoteBlogConfig {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export const REMOTE_ENV = {
  accountId: 'CLOUDFLARE_ACCOUNT_ID',
  databaseId: 'CLOUDFLARE_D1_DATABASE_ID',
  apiToken: 'CLOUDFLARE_API_TOKEN',
} as const;

/** Returns null when the environment does not configure a remote blog. */
export function remoteBlogConfig(env: NodeJS.ProcessEnv = process.env): RemoteBlogConfig | null {
  const accountId = env[REMOTE_ENV.accountId];
  const databaseId = env[REMOTE_ENV.databaseId];
  const apiToken = env[REMOTE_ENV.apiToken];
  if (!accountId || !databaseId || !apiToken) return null;
  return { accountId, databaseId, apiToken };
}

export function missingRemoteEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(REMOTE_ENV)
    .filter(([, name]) => !env[name])
    .map(([key]) => key);
}

const ENDPOINT = (config: RemoteBlogConfig): string =>
  `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

interface BatchStatement {
  sql: string;
  params: string[];
}

/**
 * The statements that write one post, as a batch.
 *
 * Exported separately from the network call so the SQL can be asserted on without
 * a live database.
 */
export function postBatch(post: PostFields): BatchStatement[] {
  const statements: BatchStatement[] = [
    {
      sql: `INSERT INTO posts
              (slug, title, description, published_at, updated_at, body_md, body_html, word_count, approved_quote, sources)
            VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''))
            ON CONFLICT(slug) DO UPDATE SET
              title = excluded.title,
              description = excluded.description,
              published_at = excluded.published_at,
              updated_at = datetime('now'),
              body_md = excluded.body_md,
              body_html = excluded.body_html,
              word_count = excluded.word_count,
              approved_quote = excluded.approved_quote,
              sources = excluded.sources;`,
      // The API takes string parameters, so an absent optional value is sent as an
      // empty string and turned back into SQL NULL by NULLIF above. Sending the
      // string 'null' instead would store those four characters as the value.
      params: [
        post.slug,
        post.title,
        post.description,
        post.published_at,
        post.body_md,
        post.body_html,
        String(post.word_count),
        post.approved_quote ?? '',
        post.sources ? JSON.stringify(post.sources) : '',
      ],
    },
    // Replaced rather than merged, so a tag removed from the frontmatter actually
    // disappears instead of lingering on the post.
    { sql: 'DELETE FROM post_tags WHERE slug = ?;', params: [post.slug] },
    ...post.tags.map((tag) => ({
      sql: 'INSERT OR IGNORE INTO post_tags (slug, tag) VALUES (?, ?);',
      params: [post.slug, tag],
    })),
  ];
  return statements;
}

export type PushOutcome =
  | { pushed: true; slug: string }
  | { pushed: false; reason: 'not-configured'; missing: string[] }
  | { pushed: false; reason: 'failed'; error: string };

/**
 * Upsert one post into the live blog.
 *
 * The parameters the API accepts are strings, so NULL-able columns are sent as an
 * empty string and normalised in SQL rather than left as the literal 'null'.
 */
export async function pushPostToBlog(
  post: PostFields,
  options: { config?: RemoteBlogConfig | null; fetchImpl?: typeof fetch } = {},
): Promise<PushOutcome> {
  const config = options.config === undefined ? remoteBlogConfig() : options.config;
  if (!config) {
    return { pushed: false, reason: 'not-configured', missing: missingRemoteEnv() };
  }

  const body = { batch: postBatch(post) };
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(ENDPOINT(config), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { pushed: false, reason: 'failed', error: `could not reach the Cloudflare API: ${(error as Error).message}` };
  }

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; errors?: { message?: string }[] }
    | null;

  if (!response.ok || payload?.success === false) {
    const detail = payload?.errors?.map((entry) => entry.message).filter(Boolean).join('; ');
    return {
      pushed: false,
      reason: 'failed',
      error: detail || `Cloudflare API returned ${response.status}`,
    };
  }

  return { pushed: true, slug: post.slug };
}

/** Build the post row for a markdown file, matching what the seed script emits. */
export function postForRemote(
  filename: string,
  source: string,
  options: { today: string; approved_quote?: string | null; sources?: string[] | null },
): PostFields {
  return postFromMarkdown(filename, source, options);
}

export type { PostFields };
