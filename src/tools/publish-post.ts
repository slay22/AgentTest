import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Approval } from './approve-draft.ts';
import { contentHash, publishDraft, publishedBytes, resolveDraft } from './drafts.ts';
import { postForRemote, pushPostToBlog } from './remote-blog.ts';

/**
 * Publishes one draft, but only if the user approved *this text*.
 *
 * Three checks, in order of how hard they are to defeat: the tool is only mounted
 * once an approval exists; the specific path must be in the approval map; and the
 * draft's current content must still hash to what was approved. The third is the
 * one that matters most — without it, an approval survives an edit, so approving a
 * draft and then rewriting it would publish text the user never saw.
 */
export function publishPost(
	getApproval: (absDraftPath: string) => Approval | null,
	options: { now?: () => Date } = {},
) {
	const now = options.now ?? (() => new Date());
	return defineTool({
		name: 'publish_post',
		description:
			'Copy one approved draft into the blog\'s publish directory, setting its frontmatter `draft` flag to false, and push it to the live blog. Call this immediately after approve_draft, with the same draftPath, without editing the draft first. If the result says draft_changed_since_approval, you edited the draft after the user approved it: the approval is void, so tell the user what changed and ask them to approve again. If the result says the draft is not approved, the user has not approved it — ask them, and do not retry on your own. Report the draftFlag outcome and whether the live blog was updated, literally as returned. Input: draftPath (e.g. "drafts/my-post.md").',
		input: v.object({
			draftPath: v.string(),
		}),
		async run({ data }) {
			const abs = await resolveDraft(data.draftPath);
			const source = await readFile(abs, 'utf8');

			const approval = getApproval(abs);
			if (!approval) {
				return {
					output: {
						published: false,
						reason: 'not_approved',
						detail: `${data.draftPath} has not been approved for publication by the user. Ask them whether to publish it, then call approve_draft with their exact words.`,
					},
				};
			}

			// The bytes publication would write, hashed the same way approve_draft did.
			const currentHash = await contentHash(publishedBytes(source));
			if (currentHash !== approval.hash) {
				return {
					output: {
						published: false,
						reason: 'draft_changed_since_approval',
						detail:
							`${data.draftPath} has changed since the user approved it, so the approval no longer applies and nothing was published. The user approved different text (their words: "${approval.quote}", approved ${approval.approvedAt}). Tell them what you changed and ask them to approve the current draft again.`,
					},
				};
			}

			const result = await publishDraft(abs);

			// The local copy is written; now make it appear on the deployed blog.
			// Rendering and row-building go through the same mapping the bulk seed
			// script uses, so the two cannot produce different posts.
			const remote = await pushPostToBlog(
				postForRemote(basename(abs), source, {
					today: now().toISOString().slice(0, 10),
					approved_quote: approval.quote,
				}),
			);

			return {
				output: {
					publishedLocally: true,
					...result,
					blog: remote.pushed
						? { updated: true, url: result.destination }
						: remote.reason === 'not-configured'
							? {
									updated: false,
									reason: `The live blog was not updated: ${remote.missing.join(', ')} ${remote.missing.length === 1 ? 'is' : 'are'} not set, so this deployment has no blog configured. The post is written locally only.`,
								}
							: {
									updated: false,
									reason: `The live blog was not updated: ${remote.error}. The local copy was written; tell the user the blog update failed rather than reporting success.`,
								},
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
