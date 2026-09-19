---
name: post-metadata
description: Set the title, slug, filename, headings, and frontmatter for a blog post. Use when creating a new draft, renaming a draft, or when the user asks about a post's title, URL, or SEO.
---

# Post metadata

Activate when creating a draft or when the title, filename, or frontmatter comes up. Read
`FRONTMATTER.md` for the exact template before writing frontmatter into a file.

## Title

- A claim, in title case, max ~60 characters so it survives a browser tab and a search result.
- It must be the same claim as the opening reversal sentence, phrased shorter.
  Title "Local LLMs Just Grew Up" ↔ opening "used to be a hobbyist flex... it's a legitimate
  infrastructure decision."
- No colon-subtitle constructions ("X: Why Y Matters"). No year in the title unless the post
  is a dated roundup.

## Filename

The filename *is* the slug. There is no separate slug field.

- Lowercase, hyphenated, ASCII only. No dates, no `-final`, no `-v2`.
- 3-6 words, derived from the title's claim, not its nouns:
  "Local LLMs Just Grew Up" → `local-llms.md`, not `local-llm-tooling-hardware-economics.md`.
- Once a draft is published, its filename never changes — the URL is permanent. Rename only
  while the file is still in `drafts/`.

## Headings

- `#` once, the title, first line of the file.
- `##` for sections only. No `###` unless a section genuinely has two sub-parts.
- Never skip a level. Never use bold text as a heading.
- 3 to 5 `##` sections for a post of this length. If you have more than 6, you have two posts.

## Opening

Per `house-voice`, but the metadata-specific rule is: the first sentence after the `#` must
be usable as the meta description untouched. Write it as a standalone 1-2 sentence summary.

## Checklist before handing a draft back

- [ ] `#` title is ≤60 chars and is a claim
- [ ] filename is lowercase-hyphenated and matches the claim
- [ ] every `##` is a claim, not a label
- [ ] no skipped heading levels
- [ ] first paragraph reads as a standalone summary
