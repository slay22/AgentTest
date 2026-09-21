import { describe, expect, it } from 'vitest';
import {
  deriveDescription,
  deriveTitle,
  parseFrontmatter,
  parseTags,
  slugFromFilename,
} from '../src/frontmatter';

describe('parseFrontmatter', () => {
  it('reads scalar fields and returns the body', () => {
    const { fields, body, hadFrontmatter } = parseFrontmatter(
      '---\ntitle: Hello\ndate: 2026-09-19\n---\n\n# Heading\n\nBody.',
    );
    expect(hadFrontmatter).toBe(true);
    expect(fields.title).toBe('Hello');
    expect(fields.date).toBe('2026-09-19');
    expect(body.trimStart().startsWith('# Heading')).toBe(true);
  });

  it('unquotes values', () => {
    expect(parseFrontmatter('---\ntitle: "Quoted: value"\n---\n').fields.title).toBe(
      'Quoted: value',
    );
    expect(parseFrontmatter("---\ntitle: 'single'\n---\n").fields.title).toBe('single');
  });

  it('reads a quoted colon inside a value', () => {
    expect(parseFrontmatter('---\ndescription: "a: b: c"\n---\n').fields.description).toBe('a: b: c');
  });

  it('rejects an unquoted colon inside a value, which is genuinely invalid YAML', () => {
    // The line-based parser this replaced accepted this. YAML does not — a plain
    // scalar cannot contain ": " — so the writer has to quote it. Rejecting it here
    // matches what applyDraftFlag does on the agent side, so the two agree.
    expect(() => parseFrontmatter('---\ndescription: a: b: c\n---\n')).toThrow(/not valid YAML/);
  });

  it('treats a file without frontmatter as all body', () => {
    const { fields, body, hadFrontmatter } = parseFrontmatter('# Just a heading\n\nText.');
    expect(hadFrontmatter).toBe(false);
    expect(fields).toEqual({});
    expect(body).toBe('# Just a heading\n\nText.');
  });

  it('does not treat a mid-document --- as frontmatter', () => {
    const { hadFrontmatter, body } = parseFrontmatter('# Heading\n\n---\n\nMore.');
    expect(hadFrontmatter).toBe(false);
    expect(body).toContain('# Heading');
  });

  it('folds a continuation line into the previous value, as YAML does', () => {
    // This is what a long description looks like after the agent's YAML
    // re-serialisation, and the reason this parser must not be line-based.
    const { fields } = parseFrontmatter('---\ntitle: ok\n  just a stray line\n---\n');
    expect(fields.title).toBe('ok just a stray line');
  });

  it('throws on genuinely invalid YAML rather than importing bad metadata', () => {
    expect(() => parseFrontmatter('---\ntitle: [unclosed\n---\n')).toThrow(/not valid YAML/);
  });

  it('reads a description wrapped across lines by the YAML serialiser', () => {
    const { fields } = parseFrontmatter(
      '---\ntitle: T\ndescription: Every model answers by writing a\n  sentence. Then it does not.\n---\n',
    );
    expect(fields.description).toBe('Every model answers by writing a sentence. Then it does not.');
  });

  it('stringifies a real list so parseTags still reads it', () => {
    const { fields } = parseFrontmatter('---\ntags: [typesafe, system-one-models]\n---\n');
    expect(fields.tags).toBe('typesafe,system-one-models');
    expect(parseTags(fields.tags)).toEqual(['typesafe', 'system-one-models']);
  });
});

describe('parseTags', () => {
  it('reads flow-style lists', () => {
    expect(parseTags('[local-llms, hardware]')).toEqual(['local-llms', 'hardware']);
  });

  it('reads comma-separated scalars', () => {
    expect(parseTags('a, B')).toEqual(['a', 'b']);
  });

  it('handles empty and missing values', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
    expect(parseTags('[]')).toEqual([]);
  });
});

describe('slugFromFilename', () => {
  it('strips the extension', () => {
    expect(slugFromFilename('local-llms.md')).toBe('local-llms');
  });
});

describe('deriveTitle', () => {
  it('prefers the first h1', () => {
    expect(deriveTitle('# Local LLMs Just Grew Up\n\nText.', 'fallback')).toBe(
      'Local LLMs Just Grew Up',
    );
  });

  it('falls back when there is no heading', () => {
    expect(deriveTitle('No heading here.', 'fallback')).toBe('fallback');
  });
});

describe('deriveDescription', () => {
  it('takes the first paragraph after the heading', () => {
    expect(
      deriveDescription('# Title\n\nRunning a model used to be a hobbyist flex.\n\n## Next'),
    ).toBe('Running a model used to be a hobbyist flex.');
  });

  it('truncates to 160 characters', () => {
    const description = deriveDescription(`# Title\n\n${'word '.repeat(60)}`);
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
