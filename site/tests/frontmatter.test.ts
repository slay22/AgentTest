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

  it('keeps a colon inside a value', () => {
    expect(parseFrontmatter('---\ndescription: a: b: c\n---\n').fields.description).toBe('a: b: c');
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

  it('throws rather than guessing on an unsupported line', () => {
    expect(() => parseFrontmatter('---\ntitle: ok\n   just a stray line\n---\n')).toThrow(
      /Unsupported frontmatter line/,
    );
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
