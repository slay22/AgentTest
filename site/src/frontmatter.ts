// Frontmatter reader for the seed script, which imports the markdown in the repo.
// The Worker itself never parses frontmatter: the agent publishes structured JSON.
//
// This uses the `yaml` package, the same one the agent uses when it flips the draft
// flag. That matters more than it looks: the two used to disagree. The agent's
// YAML re-serialisation folds a long `description` across two lines, and a
// line-based parser here threw on the continuation, so publishing a post made it
// unseedable. One format, one parser.

import { parse as parseYaml } from 'yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface ParsedFrontmatter {
  fields: Record<string, string>;
  body: string;
  hadFrontmatter: boolean;
}

/**
 * Parse a document's frontmatter.
 *
 * Values are returned as strings so callers can treat them uniformly: numbers and
 * booleans are stringified, and a list is comma-joined so `parseTags` still reads
 * both `tags: [a, b]` and `tags: a, b`.
 *
 * Throws on frontmatter that is not valid YAML, rather than silently importing a
 * post with the wrong metadata.
 */
export function parseFrontmatter(source: string): ParsedFrontmatter {
  const match = FRONTMATTER.exec(source);
  if (!match) return { fields: {}, body: source, hadFrontmatter: false };

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch (error) {
    throw new Error(`Frontmatter is not valid YAML: ${(error as Error).message}`);
  }

  const fields: Record<string, string> = {};
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      fields[key] = Array.isArray(value) ? value.join(',') : String(value);
    }
  }

  return { fields, body: source.slice(match[0].length), hadFrontmatter: true };
}

/** Read a flow-style list (`[a, b]`) or a comma-separated scalar. */
export function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  const inner = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  return inner
    .split(',')
    .map((tag) => tag.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .filter(Boolean);
}

/** The filename is the slug, per post-metadata/SKILL.md. */
export function slugFromFilename(file: string): string {
  return file.replace(/\.md$/, '');
}

/** Falls back to the first `# heading`, so unfrontmattered posts still work. */
export function deriveTitle(body: string, fallback: string): string {
  const heading = /^#\s+(.+)$/m.exec(body);
  return heading ? heading[1].trim() : fallback;
}

/** The opening paragraph, which post-metadata requires to stand alone as a summary. */
export function deriveDescription(body: string): string {
  const withoutHeading = body.replace(/^#\s+.+$/m, '').trim();
  const paragraph = withoutHeading.split(/\n\s*\n/).find((block) => !block.startsWith('#'));
  return (paragraph ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
}
