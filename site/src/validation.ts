import { z } from 'zod';

// The publish payload is validated with zod, matching the MCP tool layer in
// receiptScanner. Messages are written for the caller, which is a language
// model: a specific complaint is what lets it correct the request instead of
// guessing at what it got wrong.

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase words separated by single hyphens, e.g. "local-llms"');

const tag = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'must be lowercase alphanumeric with hyphens');

export const publishPostSchema = z.object({
  slug,
  title: z.string().min(1, 'is required'),
  description: z.string().min(1, 'is required'),
  published_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'must be an ISO date, e.g. "2026-09-19"'),
  body_md: z.string().min(1, 'is required'),
  tags: z.array(tag).default([]),
  // Carried over from the agent's approval gate: the user's exact words.
  approved_quote: z.string().optional(),
  // Source URLs the verification step accepted.
  sources: z.array(z.string().url('must be a URL')).optional(),
});

export type PublishPostInput = z.infer<typeof publishPostSchema>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Flatten zod issues into one line the model can act on. Field paths are kept
 * because "tags.2: must be lowercase" is actionable and "invalid request" is not.
 */
export function parsePublishPost(payload: unknown): Parsed<PublishPostInput> {
  const result = publishPostSchema.safeParse(payload);
  if (result.success) return { ok: true, value: result.data };

  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path} ${issue.message}` : issue.message;
    })
    .join('; ');
  return { ok: false, error: details };
}

// Draft input is deliberately looser than a publish payload: a draft is working
// material, so it may be missing a description or a date, and it carries the
// content hash the approval gate will later re-check.
export const draftInputSchema = z.object({
  slug,
  title: z.string().min(1, 'is required'),
  description: z.string().default(''),
  body_md: z.string().min(1, 'is required'),
  tags: z.array(tag).default([]),
  content_hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'must be a lowercase hex SHA-256')
    .optional(),
});

export type DraftInput = z.infer<typeof draftInputSchema>;

export function parseDraftInput(payload: unknown): Parsed<DraftInput> {
  const result = draftInputSchema.safeParse(payload);
  if (result.success) return { ok: true, value: result.data };
  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path} ${issue.message}` : issue.message;
    })
    .join('; ');
  return { ok: false, error: details };
}
