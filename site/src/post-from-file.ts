// One markdown file -> one post row.
//
// This mapping has two callers and they must not drift:
//   - scripts/export-sql.ts, which seeds a deployment through `wrangler d1 execute`
//   - the agent's publish tool, which writes straight to D1 over the REST API
//
// If they diverged, a post seeded by hand and a post published by the agent would
// render differently on the same blog.

import {
  deriveDescription,
  deriveTitle,
  parseFrontmatter,
  parseTags,
  slugFromFilename,
} from './frontmatter.ts';
import { countWords, renderMarkdown } from './markdown.ts';

export interface PostFields {
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

export interface PostFromMarkdownOptions {
  /** Fallback publication date (`YYYY-MM-DD`) when the frontmatter has no `date`. */
  today: string;
  approved_quote?: string | null;
  sources?: string[] | null;
}

/**
 * Build the post row for one markdown file.
 *
 * A file with no frontmatter is valid: the title comes from the first `#` heading
 * and the description from the opening paragraph, so the drafts that predate the
 * frontmatter convention still publish.
 */
export function postFromMarkdown(
  filename: string,
  source: string,
  options: PostFromMarkdownOptions,
): PostFields {
  const { fields, body } = parseFrontmatter(source);
  const slug = slugFromFilename(filename);

  return {
    slug,
    title: fields.title ?? deriveTitle(body, slug),
    description: fields.description ?? deriveDescription(body),
    published_at: fields.date ?? options.today,
    body_md: body,
    body_html: renderMarkdown(body),
    word_count: countWords(body),
    tags: parseTags(fields.tags),
    approved_quote: options.approved_quote ?? null,
    sources: options.sources ?? null,
  };
}
