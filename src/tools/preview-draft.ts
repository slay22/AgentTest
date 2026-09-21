import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { contentHash, publishedBytes, resolveDraft } from './drafts.ts';
import { postForRemote } from './remote-blog.ts';

// Save a draft to the blog so it can be read rendered in a browser.
//
// This is the step the review loop depends on: without it the agent writes
// drafts/<slug>.md on this machine and the only way to read the draft is in a
// terminal. The site renders it, shows whether it is approved, and stays
// unreachable to anyone else — see site/README.md → "Draft previews" for how the
// routes are protected.
//
// The site owns rendering, so this sends markdown and the site returns the HTML
// it stored. postForRemote is the same mapping the bulk seed script uses, so a
// previewed draft and a published post are built identically.

export interface BlogTarget {
  origin: string;
  token: string;
}

/** Null when the blog is not configured, so the tool can explain rather than fail. */
export function blogTarget(env: NodeJS.ProcessEnv = process.env): BlogTarget | null {
  const origin = (env.BLOG_API_ORIGIN ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
  const token = env.PUBLISH_TOKEN;
  if (!token) return null;
  return { origin, token };
}

export function previewDraft(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());

  return defineTool({
    name: 'preview_draft',
    description:
      'Save a draft to the blog so the user can read it rendered in a browser, and return the preview URL. Call this whenever you have a draft worth reviewing, before asking for approval, and again after every revision so the link always shows the current text. The URL is private: only the user can open it. Report the URL to the user; do not paste the draft into a message. Input: draftPath (e.g. "drafts/my-post.md").',
    input: v.object({
      draftPath: v.pipe(v.string(), v.minLength(1, 'Provide the draft path.')),
    }),
    async run({ data }) {
      const abs = await resolveDraft(data.draftPath);
      const source = await readFile(abs, 'utf8');
      const post = postForRemote(basename(abs), source, {
        today: now().toISOString().slice(0, 10),
      });

      const target = blogTarget();
      if (!target) {
        return {
          output: {
            saved: false,
            reason: 'not-configured',
            detail:
              'PUBLISH_TOKEN is not set, so there is no blog to save the preview to. Tell the user the draft is in drafts/ on disk and that the preview needs the token.',
          },
        };
      }

      // The same hash the approval gate uses, so the preview and the approval
      // refer to identical bytes.
      const hash = await contentHash(publishedBytes(source));

      let response: Response;
      try {
        response = await fetch(`${target.origin}/api/drafts`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${target.token}`,
          },
          body: JSON.stringify({
            slug: post.slug,
            title: post.title,
            description: post.description,
            body_md: post.body_md,
            tags: post.tags,
            content_hash: hash,
          }),
        });
      } catch (error) {
        return {
          output: {
            saved: false,
            reason: 'unreachable',
            detail: `Could not reach the blog at ${target.origin}: ${(error as Error).message}. The draft is safe in drafts/ on disk; tell the user the preview could not be saved.`,
          },
        };
      }

      const payload = (await response.json().catch(() => null)) as
        | { preview?: string; error?: string }
        | null;

      if (!response.ok) {
        return {
          output: {
            saved: false,
            reason: 'rejected',
            detail: `The blog refused the draft (${response.status}): ${payload?.error ?? 'no detail'}. A 403 means draft previews are switched off on that deployment.`,
          },
        };
      }

      return {
        output: {
          saved: true,
          preview: payload?.preview ?? `${target.origin}/drafts/${post.slug}`,
          note: 'Send this URL to the user. A revision saved without the user opening this link is a revision they have not read.',
        },
      };
    },
  });
}
