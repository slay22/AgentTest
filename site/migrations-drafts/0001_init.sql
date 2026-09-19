-- Drafts, in their own database.
--
-- Deliberately separate from the posts database: the public routes are only ever
-- constructed with the posts binding, so no public code path can read unpublished
-- work even by mistake. A `status` column on `posts` would have made that a WHERE
-- clause to remember.
--
-- The markdown source and the rendered HTML are both stored, for the same reason
-- as posts: the Workers free plan allows 10 ms of CPU per request, and previews
-- should not pay to re-render markdown on every refresh.

CREATE TABLE IF NOT EXISTS drafts (
  slug         TEXT PRIMARY KEY NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  body_md      TEXT NOT NULL,
  body_html    TEXT NOT NULL,
  word_count   INTEGER NOT NULL DEFAULT 0,
  -- SHA-256 of the bytes publication would write. Carried here so the site can
  -- show what was approved and when, and so an approval that no longer matches
  -- the draft is visible rather than merely invalid.
  content_hash TEXT,
  -- The user's exact words granting approval, once they have. NULL means the
  -- draft has never been approved.
  approved_quote TEXT,
  approved_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts(updated_at DESC);

CREATE TABLE IF NOT EXISTS draft_tags (
  slug TEXT NOT NULL REFERENCES drafts(slug) ON DELETE CASCADE,
  tag  TEXT NOT NULL,
  PRIMARY KEY (slug, tag)
);
