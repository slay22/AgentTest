import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { searchTavily } from './tavily.ts';

export const webSearch = defineTool({
	name: 'web_search',
	description:
		'Search the web via Tavily and return top results as { title, url, content } snippets. Input: query (the search terms), max_results (optional number, default 5). Use it to research facts, background, or recent news before writing or revising a blog post.',
	input: v.object({
		query: v.string(),
		max_results: v.optional(v.number()),
	}),
	async run({ data, signal }) {
		const results = await searchTavily(data.query, {
			maxResults: data.max_results ?? 5,
			signal,
		});
		return { output: { results } };
	},
});
