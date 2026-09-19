import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { publishDraft, resolveDraft } from './drafts.ts';

/**
 * Publishes one draft, but only if `isApproved` says the user approved it.
 *
 * The tool is only mounted once at least one approval exists, and it re-checks
 * the specific path here, so a draft the user never approved cannot be
 * published even if the mount is reachable.
 */
export function publishPost(isApproved: (absDraftPath: string) => boolean) {
	return defineTool({
		name: 'publish_post',
		description:
			'Copy one approved draft into the blog\'s publish directory, setting its frontmatter `draft` flag to false. Call this immediately after approve_draft, with the same draftPath. If the result says the draft is not approved, the user has not approved it — ask them, and do not retry on your own. Report the draftFlag outcome to the user accurately: only "flipped" means a draft flag was actually changed. Input: draftPath (e.g. "drafts/my-post.md").',
		input: v.object({
			draftPath: v.string(),
		}),
		async run({ data }) {
			const abs = await resolveDraft(data.draftPath);

			if (!isApproved(abs)) {
				return {
					output: {
						published: false,
						reason: 'not_approved',
						detail: `${data.draftPath} has not been approved for publication by the user. Ask them whether to publish it, then call approve_draft with their exact words.`,
					},
				};
			}

			const result = await publishDraft(abs);
			return {
				output: {
					published: true,
					...result,
					draftFlagNote:
						result.draftFlag === 'flipped'
							? 'Frontmatter updated: draft is now false.'
							: result.draftFlag === 'already-published'
								? 'Frontmatter already said draft: false.'
								: result.draftFlag === 'no-draft-field'
									? 'The frontmatter has no draft field, so nothing was flipped. If the site needs one, tell the user to add it.'
									: 'The file has no frontmatter block, so there was no draft flag to flip.',
				},
			};
		},
	});
}
