'use agent';
import {
	useInitialData,
	useModel,
	usePersistentState,
	useSandbox,
	useSkill,
	useTool,
	setProvider,
} from '@flue/runtime';
import * as v from 'valibot';
import { postMessage, telegramInitialData } from '../channels/telegram-reply.ts';
import { local } from '@flue/runtime/node';
import { createProvider, envApiKeyAuth } from '@earendil-works/pi-ai';
import * as openaiCompletions from '@earendil-works/pi-ai/api/openai-completions';
import { approveDraft, type Approval } from '../tools/approve-draft.ts';
import { previewDraft } from '../tools/preview-draft.ts';
import { draftsRoot } from '../tools/drafts.ts';
import { publishPost } from '../tools/publish-post.ts';
import { verifyClaimsTool } from '../tools/verify-claims.ts';
import { webSearch } from '../tools/web-search.ts';
import factCheck from '../skills/fact-check/SKILL.md';
import houseVoice from '../skills/house-voice/SKILL.md';
import dataVisuals from '../skills/data-visuals/SKILL.md';
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
				// True, and it matters. This was `false`, which is untrue for a thinking
				// model: the flag only controls whether Flue *forwards* a thinking level,
				// not whether the model reasons. Declared false, the level was dropped
				// and the model reasoned anyway — measured at 46,692 characters of
				// reasoning against 1,952 of answer on one run, which was its whole
				// 25 minutes.
				reasoning: true,
				// How Flue's portable thinking levels reach this server. Its
				// OpenAI-compatible endpoint takes `reasoning_effort`, and 'none' is the
				// only value it honours: 'low' left reasoning unchanged at 1,542
				// characters, 'none' took it to zero. Without this map, `thinkingLevel:
				// 'off'` is sent as `reasoning_effort: 'off'`, which the server rejects.
				//
				// The other seam is chatTemplateKwargs with
				// `{ $var: 'thinking.enabled', omitWhenOff: true }`, which sends
				// `chat_template_kwargs`. Both work; this one is declarative.
				thinkingLevelMap: { off: 'none' },
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
	// Thinking off, for two measured reasons on this local model: it generated 24x
	// more reasoning than answer, which was the entire 25-minute runtime, and its
	// turns were truncated — one probe hit the token cap with 333 characters of
	// answer, while the same prompt with thinking off produced 2,132 in fewer
	// tokens. Reasoning was crowding out the answer, not improving it.
	//
	// This is a local-model setting. A hosted model at 100+ tokens/second may reason
	// and still finish sooner, so measure there before copying this over.
	useModel('lemonade/Qwen3.8-27B-GGUF', { thinkingLevel: 'off' });
	useSandbox(local({}));

	// Present only when Telegram created this conversation. The agent is also run
	// directly (`flue run`, no creation data), so everything Telegram-related is
	// conditional: no data means no reply tool and no Telegram instructions.
	const telegram = useInitialData<v.InferOutput<typeof telegramInitialData>>();
	if (telegram) useTool(postMessage(telegram));

	// Publication is gated on durable state rather than on an instruction the
	// model could talk itself past. `publish_post` is not in the tool list at all
	// until an approval exists, the specific path must be present, and the draft's
	// current content must still hash to what was approved.
	//
	// The state key changed shape (a path list became a map of path -> approval),
	// so it is renamed rather than migrated: an old conversation simply has no
	// approvals yet, which fails closed.
	const [approvals, setApprovals] = usePersistentState<Record<string, Approval>>('approvals', {});

	// Skills are progressively disclosed: each costs one catalog line here, and
	// its instructions load only when the model activates it.
	useSkill(postMetadata);
	useSkill(houseVoice);
	useSkill(factCheck);
	useSkill(dataVisuals);

	useTool(webSearch);
	useTool(verifyClaimsTool);
	// Saves the draft to the blog so it can be read rendered, rather than as
	// markdown in a chat window. The site owns rendering and access control.
	useTool(previewDraft());
	useTool(
		approveDraft((absDraftPath, approval) => {
			setApprovals((previous) => ({ ...previous, [absDraftPath]: approval }));
		}),
	);

	const draftsDir = draftsRoot();
	// Telegram caps a message at 4096 characters, so a chat reply is a summary and a
	// link, never the post itself. This only applies in a Telegram conversation.
	const telegramNote = telegram
		? `

This conversation is on Telegram, so reply with post_telegram_message rather than plain text. Keep each reply short: Telegram rejects messages over 4096 characters, so never paste a draft or post into chat. Summarise what changed and link to the draft preview instead, and ask for approval in words.`
		: '';

	const canPublish = Object.keys(approvals).length > 0;
	if (canPublish) {
		useTool(publishPost((absDraftPath) => approvals[absDraftPath] ?? null));
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
- data-visuals — before adding any chart or graphic, and when a draft compares three or more figures.

Workflow:
1. Research. When the topic needs facts, dates, names, or recent news, research it with web_search. Search per specific claim rather than once per topic.
2. Draft. Activate post-metadata, write the draft into ${draftsDir}/, then activate house-voice and revise against it. Treat that directory as your working area: revise files there whenever the user asks for changes. Call preview_draft as soon as there is something worth reading, and again after every revision.

   Never send a file path to the user. A path like ${draftsDir}/my-post.md is not something they can open, and Telegram turns it into a link to a site that does not exist. Always send the URL preview_draft returns. If a preview could not be saved, say so and describe the draft without naming the file.
3. Fact-check. Activate fact-check, extract every checkable claim as a self-contained sentence, and pass them to verify_claims in one call. It returns a machine-verified verdict table whose source URLs are copied from real search results. Correct or cut every claim listed in mustFix, then re-verify. A draft is not ready while mustFix is non-empty.
${publishStep}
5. After publishing, report three things literally as the tool returned them: the destination path, whether an existing post was replaced, and the draftFlag value (only "flipped" means the draft flag was actually changed). Also report the blog.updated field: if it is false the post did NOT reach the live site, and you must say so plainly and pass on the reason rather than implying it is live.

Approval rules. Call approve_draft only when the user has said, in their own words, to publish this specific post now. A finished draft is not approval. Praise is not approval. Approving one post is never approval for another. When in doubt, ask before approving.${telegramNote}`;
}

// Declared as optional so both entry points validate: a Telegram dispatch always
// supplies creation data and is checked against the variant, while `flue run`
// supplies none and is accepted rather than rejected at instance creation.
BloggerAgent.initialData = v.optional(telegramInitialData);
