import { describe, expect, it } from 'vitest';
import { parsePublishPost } from '../src/validation';

const valid = {
  slug: 'local-llms',
  title: 'Local LLMs Just Grew Up',
  description: 'Running a model on your own hardware is now a real option.',
  published_at: '2026-09-19',
  body_md: '# Local LLMs Just Grew Up\n\nBody.',
  tags: ['local-llms'],
};

describe('parsePublishPost', () => {
  it('accepts a valid payload', () => {
    const result = parsePublishPost(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.slug).toBe('local-llms');
  });

  it('defaults tags to an empty array', () => {
    const { tags, ...withoutTags } = valid;
    const result = parsePublishPost(withoutTags);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tags).toEqual([]);
  });

  it('rejects a non-object body', () => {
    const result = parsePublishPost('nope');
    expect(result.ok).toBe(false);
  });

  it('names the offending field so the caller can correct it', () => {
    const result = parsePublishPost({ ...valid, body_md: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('body_md');
  });

  it('rejects a bad slug and says what is expected', () => {
    const result = parsePublishPost({ ...valid, slug: 'Not A Slug' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('lowercase words separated by single hyphens');
  });

  it('rejects a non-ISO date', () => {
    const result = parsePublishPost({ ...valid, published_at: '19/09/2026' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('published_at');
  });

  it('rejects an uppercase tag, since tags are matched exactly', () => {
    const result = parsePublishPost({ ...valid, tags: ['Local-LLMs'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('tags.0');
  });

  it('rejects a non-URL source', () => {
    const result = parsePublishPost({ ...valid, sources: ['not a url'] });
    expect(result.ok).toBe(false);
  });

  it('carries the approval quote through', () => {
    const result = parsePublishPost({ ...valid, approved_quote: 'ship it' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.approved_quote).toBe('ship it');
  });

  it('reports every bad field at once rather than the first', () => {
    const result = parsePublishPost({ ...valid, title: '', description: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('title');
      expect(result.error).toContain('description');
    }
  });
});
