import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { readFile } from 'node:fs/promises';
import { contentHash, publishedBytes, resolveDraft } from './drafts.ts';

/**
 * One recorded approval.
 *
 * `hash` is the point of the record. Approval is bound to the *text* the user was
 * shown, not to the file path, because a path-keyed approval survives an edit —
 * the agent could get approval and then change the draft before publishing, and
 * the gate would still pass. The hash makes "approved" mean "approved this draft
 * as it stands".
 */
export interface Approval {
	/** SHA-256 of the bytes publication would write. */
	hash: string;
	/** The user's exact words, kept as the audit record. */
	quote: string;
	/** ISO timestamp, so a stale approval is visible rather than merely valid. */
	approvedAt: string;
}

/**
 * Records that the user approved one specific draft for publication.
 *
 * The key is the *resolved* path, so `publish_post` looks up exactly the same
 * string, and the value carries the hash it must re-verify.
 */
export function approveDraft(
	record: (absDraftPath: string, approval: Approval) => void,
	options: { now?: () => Date } = {},
) {
	const now = options.now ?? (() => new Date());

	return defineTool({
		name: 'approve_draft',
		description:
			'Record the user\'s explicit approval to publish one draft. Call this ONLY AFTER the user has, in their own words, told you that this specific post is ready to go live — for example "ship it", "publish it", "this is ready". Never call it because you think the draft is finished, because the user praised it, or because the user approved a different draft. Approval is tied to the draft content at this moment: if you edit the draft afterwards, the approval is void and you must ask again. On approval you MUST call publish_post in the same turn to carry it out; approving and then stopping leaves the post unpublished. Input: draftPath (the draft being approved, e.g. "drafts/my-post.md"), userQuote (paste the user\'s exact words granting approval — this becomes the durable audit record, and a paraphrase is not acceptable).',
		input: v.object({
			draftPath: v.string(),
			userQuote: v.pipe(
				v.string(),
				v.minLength(1, 'Include the user\'s exact words granting approval.'),
			),
		}),
		async run({ data }) {
			const abs = await resolveDraft(data.draftPath);
			const hash = await contentHash(publishedBytes(await readFile(abs, 'utf8')));
			record(abs, { hash, quote: data.userQuote, approvedAt: now().toISOString() });

			return {
				output: {
					approved: true,
					draftPath: data.draftPath,
					approvedWords: data.userQuote,
					next: 'Call publish_post with this same draftPath to publish it now, without editing the draft first.',
				},
			};
		},
	});
}
