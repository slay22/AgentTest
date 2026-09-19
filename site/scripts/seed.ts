// Imports the markdown already in the repo into the site's D1 database.
//
// It publishes over HTTP through POST /api/posts rather than writing SQL, so the
// seed goes through exactly the path production uses: the same validation, the
// same server-side markdown rendering, the same bound parameters. Nothing here
// needs SQL escaping or a database client.
//
// Usage (with `npm run dev` running in another terminal):
//   npm run seed
//   npm run seed -- --drafts     # also import drafts/, for previewing them
//
// Against a deployment:
//   SITE_URL=https://your-worker.workers.dev PUBLISH_TOKEN=... npm run seed

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  deriveDescription,
  deriveTitle,
  parseFrontmatter,
  parseTags,
  slugFromFilename,
} from '../src/frontmatter.ts';

const SITE_URL = process.env.SITE_URL ?? 'http://127.0.0.1:8787';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

// drafts/ is opt-in. A draft and a published post often share a filename, so
// seeding both silently overwrites the published post with the working copy —
// and importing drafts by default would put unreviewed work on a public site.
const includeDrafts = process.argv.includes('--drafts') || process.env.SEED_DRAFTS === '1';
const SOURCES = [
  { dir: join(REPO_ROOT, 'posts'), label: 'published' },
  ...(includeDrafts ? [{ dir: join(REPO_ROOT, 'drafts'), label: 'draft' }] : []),
];

// Reads PUBLISH_TOKEN from .dev.vars so a local seed needs no extra setup.
async function resolveToken(): Promise<string> {
  if (process.env.PUBLISH_TOKEN) return process.env.PUBLISH_TOKEN;
  try {
    const vars = await readFile(join(REPO_ROOT, 'site/.dev.vars'), 'utf8');
    const match = /^PUBLISH_TOKEN\s*=\s*"?([^"\n]+)"?/m.exec(vars);
    if (match) return match[1].trim();
  } catch {
    // No .dev.vars: fall through to the error below.
  }
  throw new Error(
    'No PUBLISH_TOKEN found. Set it in site/.dev.vars (see .dev.vars.example) or export it.',
  );
}

async function main(): Promise<void> {
  const token = await resolveToken();
  let published = 0;
  let failed = 0;

  if (!includeDrafts) {
    console.log('importing posts/ only (pass --drafts to include drafts/)');
  }

  for (const source of SOURCES) {
    let files: string[];
    try {
      files = (await readdir(source.dir)).filter((file) => file.endsWith('.md'));
    } catch {
      console.log(`skip ${source.label}: no ${source.dir}`);
      continue;
    }

    for (const file of files) {
      const raw = await readFile(join(source.dir, file), 'utf8');
      const { fields, body } = parseFrontmatter(raw);
      const slug = slugFromFilename(file);

      const response = await fetch(`${SITE_URL}/api/posts`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slug,
          title: fields.title ?? deriveTitle(body, slug),
          description: fields.description ?? deriveDescription(body),
          published_at: fields.date ?? new Date().toISOString().slice(0, 10),
          body_md: body,
          tags: parseTags(fields.tags),
        }),
      });

      const result = (await response.json()) as { error?: string; slug?: string };
      if (response.ok) {
        published++;
        console.log(`ok    ${source.label}/${file} -> /posts/${result.slug}`);
      } else {
        failed++;
        console.log(`FAIL  ${source.label}/${file} -> ${response.status} ${result.error ?? ''}`);
      }
    }
  }

  console.log(`\n${published} published, ${failed} failed against ${SITE_URL}`);
  if (failed > 0) process.exit(1);
}

await main();
