import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { resolveDraft } from './drafts.ts';

/**
 * Records that the user approved one specific draft for publication.
 *
 * The approval target is the *resolved* path, so `publish_post` can key its
 * authorization check on exactly the same string.
 */
export function approveDraft(record: (absDraftPath: string, userQuote: string) => void) {
	return defineTool({
		name: 'approve_draft',
		description:
			'Record the user\'s explicit approval to publish one draft. Call this ONLY AFTER the user has, in their own words, told you that this specific post is ready to go live — for example "ship it", "publish it", "this is ready". Never call it because you think the draft is finished, because the user praised it, or because the user approved a different draft. On approval you MUST call publish_post in the same turn to carry it out; approving and then stopping leaves the post unpublished. Input: draftPath (the draft being approved, e.g. "drafts/my-post.md"), userQuote (paste the user\'s exact words granting approval — this becomes the durable audit record, and a paraphrase is not acceptable).',
		input: v.object({
			draftPath: v.string(),
			userQuote: v.pipe(
				v.string(),
				v.minLength(1, 'Include the user\'s exact words granting approval.'),
			),
		}),
		async run({ data }) {
			const abs = await resolveDraft(data.draftPath);
			record(abs, data.userQuote);
			return {
				output: {
					approved: true,
					draftPath: data.draftPath,
					approvedWords: data.userQuote,
					next: 'Call publish_post with this same draftPath to publish it now.',
				},
			};
		},
	});
}
