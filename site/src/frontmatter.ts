// Frontmatter reader for the seed script, which imports the markdown files that
// already live in the repo. The Worker never parses frontmatter: the agent
// publishes structured JSON over the publish API.
//
// Deliberately NOT a general YAML parser. It handles the subset these posts use
// (scalar `key: value` lines and flow-style `[a, b]` lists) and throws on
// anything else. If the repo adopts richer frontmatter, use a real YAML library
// rather than extending these regexes — see todo.md item 1.

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface ParsedFrontmatter {
  fields: Record<string, string>;
  body: string;
  hadFrontmatter: boolean;
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const match = FRONTMATTER.exec(source);
  if (!match) return { fields: {}, body: source, hadFrontmatter: false };

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new Error(`Unsupported frontmatter line (expected "key: value"): ${line}`);
    }
    const raw = line.slice(separator + 1).trim();
    const unquoted =
      (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw;
    fields[line.slice(0, separator).trim()] = unquoted;
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
