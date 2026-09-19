'use agent';
import { useModel, usePersistentState, useSandbox, useSkill, useTool, setProvider } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { createProvider, envApiKeyAuth } from '@earendil-works/pi-ai';
import * as openaiCompletions from '@earendil-works/pi-ai/api/openai-completions';
import { approveDraft } from '../tools/approve-draft.ts';
import { draftsRoot } from '../tools/drafts.ts';
import { publishPost } from '../tools/publish-post.ts';
import { verifyClaimsTool } from '../tools/verify-claims.ts';
import { webSearch } from '../tools/web-search.ts';
import factCheck from '../skills/fact-check/SKILL.md';
import houseVoice from '../skills/house-voice/SKILL.md';
import postMetadata from '../skills/post-metadata/SKILL.md';

// Register a local Lemonade server (OpenAI-compatible) so this agent can run
// against `localhost:13305` without needing a hosted provider key.
// `flue run` loads only the agent module, so the registration must live here,
// not in app.ts. `setProvider` replaces any prior provider with the same id.
const LEMONADE_BASE_URL = process.env.LEMONADE_BASE_URL ?? 'http://localhost:13305/v1';

setProvider(
	createProvider({
		id: 'lemonade',
		name: 'Lemonade (local OpenAI-compatible)',
		baseUrl: LEMONADE_BASE_URL,
		// Lemonade usually has no auth; we point it at a single env var so
		// the runtime considers the provider "configured". Lemonade ignores
		// the value, so the placeholder is fine.
		auth: { apiKey: envApiKeyAuth('lemonade', ['LEMONADE_API_KEY']) },
		models: [
			{
				id: 'Qwen3.8-27B-GGUF',
				name: 'Qwen3.8 27B GGUF (local)',
				api: 'openai-completions',
				provider: 'lemonade',
				baseUrl: LEMONADE_BASE_URL,
				reasoning: false,
				input: ['text'],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 262144,
				maxTokens: 8192,
			},
		],
		api: openaiCompletions,
	}),
);

export function BloggerAgent() {
	useModel('lemonade/Qwen3.8-27B-GGUF');
	useSandbox(local({}));

	// Publication is gated on durable state rather than on an instruction the
	// model could talk itself past. `publish_post` is not in the tool list at
	// all until at least one draft has been approved, and it re-checks the
	// specific path at call time.
	const [approvedDrafts, setApprovedDrafts] = usePersistentState<string[]>('approvedDrafts', []);

	// Skills are progressively disclosed: each costs one catalog line here, and
	// its instructions load only when the model activates it.
	useSkill(postMetadata);
	useSkill(houseVoice);
	useSkill(factCheck);

	useTool(webSearch);
	useTool(verifyClaimsTool);
	useTool(
		approveDraft((absDraftPath, userQuote) => {
			setApprovedDrafts((previous) =>
				previous.includes(absDraftPath) ? previous : [...previous, absDraftPath],
			);
		}),
	);

	const draftsDir = draftsRoot();
	const canPublish = approvedDrafts.length > 0;
	if (canPublish) {
		useTool(publishPost((absDraftPath) => approvedDrafts.includes(absDraftPath)));
	}

	// Keep the instructions truthful about the tool set: before any approval,
	// publish_post genuinely is not mounted, and telling the model to call it
	// would be describing a tool it cannot see.
	const publishStep = canPublish
		? `4. Publish. publish_post is available. Call approve_draft with the draft path and the user's exact approving words, then call publish_post with that same path, in the same turn.
   If publish_post reports the draft is not approved, tell the user and ask them — do not retry.`
		: `4. Publishing is locked. publish_post does not exist yet, so do not plan around it or claim you will use it. When the user tells you to publish a specific post, call approve_draft with that draft's path and their exact approving words; if you cannot quote their exact words, ask them for them. approve_draft unlocks publish_post, which you then call in the same turn.`;

	return `You are a blog writer who produces markdown posts for this blog.

Workspace:
- Drafts live in ${draftsDir}/ — one markdown file per post. The filename is the post's URL slug.
- You have read, write, edit, bash, grep, and glob tools over this workspace.

Skills: call activate_skill to load these before doing the relevant work. Do not guess at what they contain.
- post-metadata — before creating a draft, or for any question about a title, filename, headings, or frontmatter.
- house-voice — before writing or revising prose, and whenever the user says a draft sounds generic or flat.
- fact-check — before telling the user a draft is ready, and before any publish. It is not optional: you must call verify_claims.

Workflow:
1. Research. When the topic needs facts, dates, names, or recent news, research it with web_search. Search per specific claim rather than once per topic.
2. Draft. Activate post-metadata, write the draft into ${draftsDir}/, then activate house-voice and revise against it. Treat that directory as your working area: revise files there whenever the user asks for changes.
3. Fact-check. Activate fact-check, extract every checkable claim as a self-contained sentence, and pass them to verify_claims in one call. It returns a machine-verified verdict table whose source URLs are copied from real search results. Correct or cut every claim listed in mustFix, then re-verify. A draft is not ready while mustFix is non-empty.
${publishStep}
5. After publishing, report the destination path, whether an existing post was replaced, and whether the frontmatter's draft flag was updated.

Approval rules. Call approve_draft only when the user has said, in their own words, to publish this specific post now. A finished draft is not approval. Praise is not approval. Approving one post is never approval for another. When in doubt, ask before approving.`;
}
