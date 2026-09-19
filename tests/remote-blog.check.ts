// Regression tests for the D1 push that puts a published post on the live blog.
//
// The interesting risks here are (a) the batch's shape, because the D1 REST API
// takes string params only, and (b) that every failure mode reports honestly
// instead of throwing or, worse, looking like success.
//
// Run with `npm run check:remote`.

import { missingRemoteEnv, postBatch, pushPostToBlog, remoteBlogConfig } from '../src/tools/remote-blog.ts';
import type { PostFields } from '../site/src/post-from-file.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
  if (!ok) failures++;
}

const post: PostFields = {
  slug: 'test-post',
  title: 'Test Post',
  description: 'A description.',
  published_at: '2026-09-19',
  body_md: '# Test Post\n\nBody.',
  body_html: '<h1>Test Post</h1>\n<p>Body.</p>\n',
  word_count: 2,
  tags: ['alpha', 'beta'],
  approved_quote: 'ship it',
  sources: ['https://example.com/a'],
};

// --- configuration ------------------------------------------------------
{
  const configured = remoteBlogConfig({
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    CLOUDFLARE_D1_DATABASE_ID: 'db',
    CLOUDFLARE_API_TOKEN: 'tok',
  } as NodeJS.ProcessEnv);
  check('configured when all three vars are present', configured?.databaseId === 'db');

  const partial = remoteBlogConfig({ CLOUDFLARE_ACCOUNT_ID: 'acct' } as NodeJS.ProcessEnv);
  check('null when incomplete', partial === null);
  check(
    'missing list names the unset vars',
    missingRemoteEnv({ CLOUDFLARE_ACCOUNT_ID: 'acct' } as NodeJS.ProcessEnv).join(',') ===
      'databaseId,apiToken',
    missingRemoteEnv({ CLOUDFLARE_ACCOUNT_ID: 'acct' } as NodeJS.ProcessEnv).join(','),
  );
}

// --- batch shape --------------------------------------------------------
{
  const batch = postBatch(post);
  check('one upsert, one tag delete, one insert per tag', batch.length === 4, String(batch.length));
  check('upsert is first', batch[0].sql.includes('INSERT INTO posts'));
  check('upsert is an upsert', batch[0].sql.includes('ON CONFLICT(slug) DO UPDATE'));
  check('tag delete is second', batch[1].sql.startsWith('DELETE FROM post_tags'));
  check('each tag gets its own insert', batch.slice(2).every((s) => s.sql.includes('INSERT OR IGNORE INTO post_tags')));
  // Nine placeholders, not ten: updated_at is the SQL literal NULL in the VALUES
  // clause rather than a bound parameter, so it has no corresponding param.
  check('nine params on the upsert', batch[0].params.length === 9, String(batch[0].params.length));
  check(
    'every param is a string, as the REST API requires',
    batch.every((s) => s.params.every((p) => typeof p === 'string')),
  );
  check('word_count is stringified', batch[0].params[6] === '2');
  check('sources are JSON encoded', batch[0].params[8] === '["https://example.com/a"]');
  check('placeholder count matches param count', (batch[0].sql.match(/\?/g) ?? []).length === batch[0].params.length);
}

// --- nullable columns ---------------------------------------------------
{
  const batch = postBatch({ ...post, approved_quote: null, sources: null });
  // Sending the string 'null' would store those four characters as the value. The
  // SQL turns an empty param back into a real NULL instead.
  check(
    'nullable columns use NULLIF so an empty param becomes SQL NULL',
    (batch[0].sql.match(/NULLIF\(\?, ''\)/g) ?? []).length === 2,
  );
  check('absent optional values are sent as empty strings', batch[0].params[7] === '' && batch[0].params[8] === '');
}

// --- a post with no tags still produces a valid batch -------------------
{
  const batch = postBatch({ ...post, tags: [] });
  check('no tags -> two statements', batch.length === 2, String(batch.length));
}

// --- the HTTP call ------------------------------------------------------
{
  const config = { accountId: 'acct', databaseId: 'db', apiToken: 'secret-token' };
  let seen: { url: string; init: RequestInit } | null = null;
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
  }) as typeof fetch;

  const outcome = await pushPostToBlog(post, { config, fetchImpl: fakeFetch });
  check('returns pushed:true on success', outcome.pushed === true);
  check(
    'posts to the documented endpoint',
    seen!.url === 'https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db/query',
    seen!.url,
  );
  check('uses POST', seen!.init.method === 'POST');
  check(
    'sends the bearer token',
    (seen!.init.headers as Record<string, string>).Authorization === 'Bearer secret-token',
  );
  const sent = JSON.parse(String(seen!.init.body)) as { batch: unknown[]; sql?: string };
  check('body is a batch, not a single query', Array.isArray(sent.batch) && sent.sql === undefined);
  check('batch carries all four statements', sent.batch.length === 4);
}

// --- unconfigured: a clear outcome, never a throw -----------------------
{
  const outcome = await pushPostToBlog(post, { config: null });
  check('unconfigured -> not-configured', outcome.pushed === false && outcome.reason === 'not-configured');
  check(
    'unconfigured names the missing vars',
    outcome.pushed === false && outcome.reason === 'not-configured' && outcome.missing.length === 3,
  );
}

// --- API error surface --------------------------------------------------
{
  const failing = (async () =>
    new Response(JSON.stringify({ success: false, errors: [{ message: 'no such table' }] }), {
      status: 400,
    })) as typeof fetch;
  const outcome = await pushPostToBlog(post, {
    config: { accountId: 'a', databaseId: 'd', apiToken: 't' },
    fetchImpl: failing,
  });
  check('reports the API error message', outcome.pushed === false && outcome.reason === 'failed' && outcome.error.includes('no such table'));
}

// --- non-JSON error body ------------------------------------------------
{
  const html = (async () => new Response('<html>gateway error</html>', { status: 502 })) as typeof fetch;
  const outcome = await pushPostToBlog(post, {
    config: { accountId: 'a', databaseId: 'd', apiToken: 't' },
    fetchImpl: html,
  });
  check('survives a non-JSON error body', outcome.pushed === false && outcome.reason === 'failed');
}

// --- network failure is reported, not thrown ---------------------------
{
  const boom = (async () => {
    throw new Error('ENOTFOUND');
  }) as typeof fetch;
  const outcome = await pushPostToBlog(post, {
    config: { accountId: 'a', databaseId: 'd', apiToken: 't' },
    fetchImpl: boom,
  });
  check('network failure is a failed outcome, not an exception', outcome.pushed === false && outcome.reason === 'failed');
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
