import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

export const webSearch = defineTool({
	name: 'web_search',
	description:
		'Search the web via Tavily and return top results as { title, url, content } snippets. Input: query (the search terms), max_results (optional number, default 5). Use it to research facts, background, or recent news before writing or revising a blog post.',
	input: v.object({
		query: v.string(),
		max_results: v.optional(v.number()),
	}),
	async run({ data, signal }) {
		const key = process.env.TAVILY_API_KEY;
		if (!key) {
			throw new Error('TAVILY_API_KEY is not set. Ask the user to add it to .env.');
		}
		const res = await fetch('https://api.tavily.com/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
			body: JSON.stringify({
				query: data.query,
				max_results: data.max_results ?? 5,
				search_depth: 'basic',
			}),
			signal,
		});
		if (!res.ok) {
			throw new Error(`Tavily API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
		}
		const body = (await res.json()) as {
			results?: { title?: string; url?: string; content?: string }[];
		};
		const results = (body.results ?? []).map((r) => ({
			title: r.title ?? '',
			url: r.url ?? '',
			content: r.content ?? '',
		}));
		if (results.length === 0) {
			return { output: { results: [] } };
		}
		return { output: { results } };
	},
});
