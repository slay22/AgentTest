import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { tavilyApiKey } from './tavily.ts';

// Read a URL the user (or the model) points at.
//
// Tavily rather than a bare fetch, because a fetch returns markup: one Wikipedia
// page came back as 44,129 characters of navigation and boilerplate, most of it
// useless. Tavily's extract returns readable text, which is both cheaper in
// context and easier for a model to reason over.
//
// Mounted on the researcher subagent, not the parent. Everything extracted here
// lands in whichever context calls it, and that context is re-read on every later
// turn — measured as the dominant cost of a long run. Delegating is what keeps a
// 40,000-character page out of the parent.

export const MAX_CONTENT_CHARS = 30_000;

export const fetchUrl = defineTool({
	name: 'fetch_url',
	description:
		'Read one web page and return its text content. Use it when the user gives you a link, or when a specific document matters — a report, a paper, a policy page, an article. For open questions where you do not know the source yet, use web_search instead. Input: url (the page to read), max_chars (optional cap on returned length).',
	input: v.object({
		url: v.pipe(v.string(), v.url('must be a full URL, including https://')),
		max_chars: v.optional(v.number()),
	}),
	async run({ data, signal, log }) {
		const limit = Math.min(data.max_chars ?? MAX_CONTENT_CHARS, MAX_CONTENT_CHARS);
		log.info('fetching', { url: data.url });

		const response = await fetch('https://api.tavily.com/extract', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${tavilyApiKey()}`,
			},
			body: JSON.stringify({ urls: [data.url] }),
			signal,
		});

		if (!response.ok) {
			throw new Error(
				`Could not read ${data.url}: Tavily returned ${response.status} ${(await response.text()).slice(0, 200)}`,
			);
		}

		const body = (await response.json()) as {
			results?: { url?: string; raw_content?: string }[];
			failed_results?: { url?: string; error?: string }[];
		};

		const result = body.results?.[0];
		if (!result?.raw_content) {
			const failure = body.failed_results?.[0]?.error;
			throw new Error(
				`Could not read ${data.url}${failure ? `: ${failure}` : ' — no content was returned.'}`,
			);
		}

		const full = result.raw_content;
		const content = full.slice(0, limit);

		return {
			output: {
				url: result.url ?? data.url,
				content,
				// Say so plainly rather than silently handing back a partial document,
				// so the model can ask for a narrower question or another source.
				truncated: full.length > limit,
				totalChars: full.length,
			},
		};
	},
});
