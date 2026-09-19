// Shared Tavily client. Both the `web_search` tool and `verify_claims` need
// candidate evidence, and they must agree on what a search returns.

export type TavilyResult = {
	title: string;
	url: string;
	content: string;
};

export type TavilySearchOptions = {
	maxResults?: number;
	searchDepth?: 'basic' | 'advanced';
	signal?: AbortSignal;
};

export function tavilyApiKey(): string {
	const key = process.env.TAVILY_API_KEY;
	if (!key) {
		throw new Error('TAVILY_API_KEY is not set. Ask the user to add it to .env.');
	}
	return key;
}

export async function searchTavily(
	query: string,
	options: TavilySearchOptions = {},
): Promise<TavilyResult[]> {
	const res = await fetch('https://api.tavily.com/search', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${tavilyApiKey()}`,
		},
		body: JSON.stringify({
			query,
			max_results: options.maxResults ?? 5,
			search_depth: options.searchDepth ?? 'basic',
		}),
		signal: options.signal,
	});
	if (!res.ok) {
		throw new Error(`Tavily API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
	}
	const body = (await res.json()) as {
		results?: { title?: string; url?: string; content?: string }[];
	};
	return (body.results ?? []).map((result) => ({
		title: result.title ?? '',
		url: result.url ?? '',
		content: result.content ?? '',
	}));
}
