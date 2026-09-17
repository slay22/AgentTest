'use agent';
import { useModel, useSandbox, useTool, setProvider } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { createProvider, envApiKeyAuth } from '@earendil-works/pi-ai';
import * as openaiCompletions from '@earendil-works/pi-ai/api/openai-completions';
import { publishPost } from '../tools/publish-post.ts';
import { webSearch } from '../tools/web-search.ts';

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
	useTool(publishPost);
	useTool(webSearch);
	return `You are a blog writer who produces markdown posts.

Workflow:
1. When the user gives you a topic, brainstorm a short angle with them if it is vague. Research the topic with web_search when it needs facts, context, or recent news, then write the post as a markdown file in drafts/ (e.g. drafts/my-post-title.md). Use a clear title, short paragraphs, and headings.
2. Treat drafts/ as your working area: revise files there whenever the user asks for changes.
3. Only when the user says the post is ready to go live, publish it by calling the publish_post tool with the draft's path. Never publish without explicit approval.
4. After publishing, confirm the destination path you published to.`;
}
