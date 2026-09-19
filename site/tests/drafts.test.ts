import { describe, expect, it } from 'vitest';
import { draftAccess } from '../src/drafts';
import { parseDraftInput } from '../src/validation';

// Draft previews are the one surface in this project where a misconfiguration
// publishes private material, so the access decision is tested directly rather
// than only through a request.

const env = (values: Record<string, string | undefined>): Env =>
  ({
    SITE_TITLE: 'Test',
    SITE_DESCRIPTION: 'Test',
    SITE_ORIGIN: 'https://example.com',
    DB: {} as D1Database,
    DRAFTS: {} as D1Database,
    ASSETS: {} as Fetcher,
    ...values,
  }) as Env;

describe('draftAccess', () => {
  it('is off on a fresh deployment, so shipping this changes nothing', () => {
    expect(draftAccess(env({})).mode).toBe('off');
    expect(draftAccess(env({})).browsable).toBe(false);
  });

  it('is off unless DRAFTS_ENABLED is exactly "true"', () => {
    for (const value of ['false', '1', 'yes', 'TRUE', '']) {
      expect(draftAccess(env({ DRAFTS_ENABLED: value })).mode).toBe('off');
    }
    expect(draftAccess(env({ DRAFTS_ENABLED: 'true' })).mode).toBe('token');
  });

  it('falls back to token mode, which a browser cannot use', () => {
    const access = draftAccess(env({ DRAFTS_ENABLED: 'true' }));
    expect(access.mode).toBe('token');
    // A bearer token cannot be sent from an address bar, so previews are not
    // browsable in this mode — the docs have to say so.
    expect(access.browsable).toBe(false);
  });

  it('only trusts Access when explicitly told to', () => {
    for (const value of ['false', '1', '', undefined]) {
      expect(
        draftAccess(env({ DRAFTS_ENABLED: 'true', DRAFTS_TRUST_ACCESS: value })).mode,
      ).toBe('token');
    }
    const access = draftAccess(env({ DRAFTS_ENABLED: 'true', DRAFTS_TRUST_ACCESS: 'true' }));
    expect(access.mode).toBe('access');
    expect(access.browsable).toBe(true);
  });

  it('does not trust Access unless drafts are enabled at all', () => {
    expect(draftAccess(env({ DRAFTS_TRUST_ACCESS: 'true' })).mode).toBe('off');
  });
});

describe('parseDraftInput', () => {
  it('accepts a minimal draft, since working material is incomplete', () => {
    const result = parseDraftInput({ slug: 'a-post', title: 'T', body_md: 'Body' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.description).toBe('');
      expect(result.value.tags).toEqual([]);
    }
  });

  it('rejects a bad slug and says what is expected', () => {
    const result = parseDraftInput({ slug: 'Not A Slug', title: 'T', body_md: 'B' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('lowercase words separated by single hyphens');
  });

  it('requires a body', () => {
    const result = parseDraftInput({ slug: 'a', title: 'T', body_md: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('body_md');
  });

  it('accepts a 64-char hex content hash', () => {
    const result = parseDraftInput({
      slug: 'a',
      title: 'T',
      body_md: 'B',
      content_hash: 'a'.repeat(64),
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed content hash rather than storing a bad approval key', () => {
    for (const bad of ['abc', 'A'.repeat(64), 'z'.repeat(64)]) {
      const result = parseDraftInput({ slug: 'a', title: 'T', body_md: 'B', content_hash: bad });
      expect(result.ok).toBe(false);
    }
  });
});
