# Frontmatter template

Copy this exactly, filling the fields. Do not add fields.

```yaml
---
title: Local LLMs Just Grew Up
description: Running a large language model on your own hardware used to be a hobbyist flex. In 2026, it's a legitimate infrastructure decision.
date: 2026-07-24
tags: [local-llms, hardware, inference]
draft: true
---
```

## Field rules

| Field | Rule |
| --- | --- |
| `title` | Same string as the `#` heading, minus any markdown. |
| `description` | The first paragraph verbatim, or a 1-sentence compression of it. Max 160 chars for search results; go over only if the sentence cannot be cut without losing the claim. |
| `date` | ISO `YYYY-MM-DD`. The intended publication date, not the draft creation date. |
| `tags` | Lowercase, hyphenated, 3 to 5. Reuse an existing tag from a published post when one fits — check `posts/` before inventing a new tag. |
| `draft` | `true` while in `drafts/`. Flipped to `false` at publish time. |

## Notes

- Never put the slug in frontmatter — the filename is the slug.
- Never put a canonical URL, an author, or an `updated` field in frontmatter; the site
  template supplies those.
- If the description would need to be longer than 160 characters to stay accurate, that is a
  signal the opening paragraph is doing too much. Shorten the paragraph instead.
