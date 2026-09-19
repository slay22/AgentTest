-- Posts are stored with their markdown source AND the HTML rendered at publish
-- time. The Workers free plan allows 10 ms of CPU per request, and parsing
-- markdown per page view would spend most of that budget; serving a stored
-- string costs almost none. D1 read time is not counted as CPU time, so the read
-- path is a single query plus string concatenation.
--
-- Migrations are append-only. Never edit or delete an applied migration; add a
-- new numbered file for schema changes.

CREATE TABLE IF NOT EXISTS posts (
  slug         TEXT PRIMARY KEY NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  published_at TEXT NOT NULL,
  updated_at   TEXT,
  body_md      TEXT NOT NULL,
  body_html    TEXT NOT NULL,
  word_count   INTEGER NOT NULL DEFAULT 0,
  -- Audit trail carried over from the agent's approval gate: the user's exact
  -- words granting publication.
  approved_quote TEXT,
  -- JSON array of source URLs the verification step accepted, so a published
  -- post can be traced back to its evidence.
  sources      TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at DESC);

-- Tags in their own table so "all posts tagged X" is an indexed lookup rather
-- than a scan over JSON.
CREATE TABLE IF NOT EXISTS post_tags (
  slug TEXT NOT NULL REFERENCES posts(slug) ON DELETE CASCADE,
  tag  TEXT NOT NULL,
  PRIMARY KEY (slug, tag)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag);
