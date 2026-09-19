import { defineTool } from '@flue/runtime';
import { TypeSafeClient, choice, type EntryType } from '@typesafe-ai/sdk';
import * as v from 'valibot';
import { searchTavily, type TavilyResult } from './tavily.ts';

// Verify a draft's checkable claims against web evidence.
//
// The division of labour matters here:
//   - The model extracts the claims. Finding "this sentence asserts a dated fact"
//     is semantic, and it is the one part the agent is already good at.
//   - Code finds the candidate evidence, so the set of legal sources is known.
//   - TypeSafe judges one relation per (claim, candidate) pair, and because its
//     answer is constrained to the options we supplied, the chosen source is
//     always a string we produced. A cited URL therefore cannot be invented,
//     only selected.
//   - Code maps relations to verdicts and decides what needs human review.

export const AUTO_ACCEPT = 0.8;
export const MAX_CLAIMS = 10;
export const MAX_CANDIDATES = 5;
export const MAX_PASSAGE_CHARS = 700;
export const MAX_EXCERPT_CHARS = 240;

export type ClaimInput = { id: string; text: string };
export type Verdict =
	| 'verified'
	| 'partial'
	| 'contradicted'
	| 'conflicted'
	| 'unsupported'
	| 'unchecked';

export type Evidence = {
	url: string;
	title: string;
	relation: 'supports' | 'partial' | 'contradicts' | 'says_nothing';
	confidence: number;
	excerpt: string;
};

export type ClaimResult = {
	id: string;
	claim: string;
	verdict: Verdict;
	source: { url: string; title: string } | null;
	confidence: number | null;
	needsReview: boolean;
	reason: string;
	evidence: Evidence[];
	/** How many sources confidently supported the claim. 1 means single-sourced. */
	corroboration: number;
};

/** The minimal shape we need from a System One call, so tests can inject one. */
export type SystemOneFn = (request: {
	state: EntryType;
	questions: Record<
		string,
		{ type: 'choice'; instructions: string; criteria: Record<string, string | null> }
	>;
}) => Promise<{
	answers: Record<string, { choice: string; confidence: number }>;
	usage?: { input_tokens: number; output_tokens: number };
}>;

// A claim like "X happened in February 2026" is only half-answered by a source
// that confirms X but never mentions the month. Without `partial`, the model is
// forced to choose between `supports` and `says_nothing` and lands near 0.5, which
// wastes the confidence signal on exactly the claims that need to be narrowed.
const RELATIONS = {
	supports:
		'The passage states the claim or directly implies that it is true, including every date, number, and name the claim asserts.',
	partial:
		'The passage confirms part of the claim, but leaves a material specific — a date, a number, or a name — unconfirmed.',
	contradicts: 'The passage states the opposite of the claim, or implies that it is false.',
	says_nothing: 'The passage does not address what the claim asserts, either way.',
} as const;

let cachedClient: TypeSafeClient | undefined;

function typeSafeClient(): TypeSafeClient {
	if (!cachedClient) {
		if (!process.env.TYPESAFE_API_KEY) {
			throw new Error(
				'TYPESAFE_API_KEY is not set. Ask the user to add it to .env to enable claim verification.',
			);
		}
		cachedClient = new TypeSafeClient();
	}
	return cachedClient;
}

const defaultSystemOne: SystemOneFn = async (request) => {
	const questions = Object.fromEntries(
		Object.entries(request.questions).map(([id, question]) => [
			id,
			choice(question.instructions, question.criteria),
		]),
	);
	const response = await typeSafeClient().systemOne({
		state: request.state,
		questions,
	});
	const answers: Record<string, { choice: string; confidence: number }> = {};
	for (const [id, answer] of Object.entries(response.answers)) {
		answers[id] = { choice: answer.choice, confidence: answer.confidence };
	}
	return { answers, usage: response.usage };
};

type Candidate = TavilyResult;

/** A claim plus the candidates found for it, or the reason none were found. */
type ClaimWithCandidates = {
	id: string;
	text: string;
	candidates: Candidate[];
	error?: string;
};

/**
 * Build the state and one relation question per (claim, candidate) pair.
 *
 * One batched request: the questions are independent, they run in parallel, and
 * a single round trip keeps the whole check cheap.
 */
export function buildRequest(
	claims: ClaimWithCandidates[],
): {
	state: EntryType;
	questions: Record<
		string,
		{ type: 'choice'; instructions: string; criteria: Record<string, string | null> }
	>;
	index: Map<string, { claimIndex: number; candidateIndex: number }>;
} {
	const state = {
		claims: claims.map((claim) => ({
			id: claim.id,
			text: claim.text,
			passages: claim.candidates.map((candidate) => ({
				url: candidate.url,
				title: candidate.title,
				passage: candidate.content.slice(0, MAX_PASSAGE_CHARS),
			})),
		})),
	};

	const questions: Record<
		string,
		{ type: 'choice'; instructions: string; criteria: Record<string, string | null> }
	> = {};
	const index = new Map<string, { claimIndex: number; candidateIndex: number }>();

	claims.forEach((claim, claimIndex) => {
		claim.candidates.forEach((_, candidateIndex) => {
			const id = `c${claimIndex}_p${candidateIndex}`;
			questions[id] = {
				type: 'choice',
				instructions: `Does the source passage at \`claims[${claimIndex}].passages[${candidateIndex}].passage\` relate to the claim at \`claims[${claimIndex}].text\` by supporting it, contradicting it, or saying nothing about it?`,
				criteria: RELATIONS,
			};
			index.set(id, { claimIndex, candidateIndex });
		});
	});

	return { state, questions, index };
}

/**
 * Fold the per-candidate relations into one verdict per claim.
 *
 * Deliberately conservative: a contradiction outranks a support, and support
 * from one source plus contradiction from another is reported as a conflict
 * rather than resolved. Anything without a confident answer goes to review
 * instead of being called verified.
 */
export function toResults(
	claims: ClaimWithCandidates[],
	answers: Record<string, { choice: string; confidence: number }>,
	index: Map<string, { claimIndex: number; candidateIndex: number }>,
	autoAccept = AUTO_ACCEPT,
): ClaimResult[] {
	const collected: Evidence[][] = claims.map(() => []);

	for (const [questionId, answer] of Object.entries(answers)) {
		const position = index.get(questionId);
		if (!position) continue;
		const candidate = claims[position.claimIndex]?.candidates[position.candidateIndex];
		if (!candidate) continue;
		if (
			answer.choice !== 'supports' &&
			answer.choice !== 'partial' &&
			answer.choice !== 'contradicts' &&
			answer.choice !== 'says_nothing'
		) {
			continue;
		}
		// The url and title are copied from our own candidate list. The model
		// chose an index; it never had the opportunity to write a source.
		collected[position.claimIndex].push({
			url: candidate.url,
			title: candidate.title,
			relation: answer.choice,
			confidence: answer.confidence,
			excerpt: candidate.content.slice(0, MAX_EXCERPT_CHARS),
		});
	}

	return claims.map((claim, claimIndex) => {
		const evidence = collected[claimIndex];
		const base = { id: claim.id, claim: claim.text, evidence, corroboration: 0 };

		// A claim we could not search is not the same as a claim nothing supports.
		// Reporting it as unsupported would push the agent to delete a claim that
		// may well be true.
		if (claim.error) {
			return {
				...base,
				verdict: 'unchecked' as const,
				source: null,
				confidence: null,
				needsReview: true,
				reason: `Not checked: ${claim.error}. Retry, or verify this one by hand — do not treat this as a false claim.`,
			};
		}

		if (claim.candidates.length === 0) {
			return {
				...base,
				verdict: 'unsupported' as const,
				source: null,
				confidence: null,
				needsReview: true,
				reason: 'The web search returned no usable sources for this claim.',
			};
		}

		const confident = evidence.filter((item) => item.confidence >= autoAccept);
		const supporting = confident.filter((item) => item.relation === 'supports');
		const supports = pickStrongest(supporting);
		const contradicts = pickStrongest(
			confident.filter((item) => item.relation === 'contradicts'),
		);
		const partial = pickStrongest(confident.filter((item) => item.relation === 'partial'));

		if (supports && contradicts) {
			return {
				...base,
				corroboration: supporting.length,
				verdict: 'conflicted' as const,
				source: { url: contradicts.url, title: contradicts.title },
				confidence: contradicts.confidence,
				needsReview: true,
				reason: `Sources disagree: ${contradicts.url} contradicts the claim while ${supports.url} supports it. A person has to settle this.`,
			};
		}
		if (contradicts) {
			return {
				...base,
				corroboration: supporting.length,
				verdict: 'contradicted' as const,
				source: { url: contradicts.url, title: contradicts.title },
				confidence: contradicts.confidence,
				needsReview: false,
				reason: `Source contradicts this claim. Correct the draft or remove the claim.`,
			};
		}
		if (supports) {
			// A single confident source is corroboration of one. For a specific
			// figure or date that is thin evidence, and it should not be presented
			// as settled just because nothing else in the result set addressed it.
			const single = supporting.length === 1;
			return {
				...base,
				corroboration: supporting.length,
				verdict: 'verified' as const,
				source: { url: supports.url, title: supports.title },
				confidence: supports.confidence,
				needsReview: single,
				reason: single
					? `Only one source supports this claim (${supports.url}); the others say nothing about it. Treat as single-sourced before publishing a specific figure.`
					: `${supporting.length} sources support this claim.`,
			};
		}
		if (partial) {
			return {
				...base,
				verdict: 'partial' as const,
				source: { url: partial.url, title: partial.title },
				confidence: partial.confidence,
				needsReview: true,
				reason: `A source confirms only part of this claim (${partial.url}). Narrow the claim to what the source supports — usually by dropping the date, number, or name it does not confirm — rather than deleting it.`,
			};
		}

		const strongest = pickStrongest(evidence);
		return {
			...base,
			verdict: 'unsupported' as const,
			source: strongest ? { url: strongest.url, title: strongest.title } : null,
			confidence: strongest?.confidence ?? null,
			needsReview: true,
			reason: strongest
				? `No source clearly supports this claim (strongest relation was "${strongest.relation}" at confidence ${strongest.confidence.toFixed(2)}). Cut the claim or narrow it.`
				: 'No source addressed this claim in any direction.',
		};
	});
}

function pickStrongest(items: Evidence[]): Evidence | undefined {
	return items.reduce<Evidence | undefined>(
		(best, item) => (!best || item.confidence > best.confidence ? item : best),
		undefined,
	);
}

function usableCandidates(results: TavilyResult[]): Candidate[] {
	const seen = new Set<string>();
	const usable: Candidate[] = [];
	for (const result of results) {
		if (!result.url || !result.content.trim()) continue;
		if (seen.has(result.url)) continue;
		seen.add(result.url);
		usable.push(result);
	}
	return usable;
}

export type VerifyClaimsResult = {
	summary: {
		total: number;
		verified: number;
		contradicted: number;
		conflicted: number;
		unsupported: number;
		needsReview: number;
	};
	results: ClaimResult[];
	/** Claim ids that must be fixed before publishing. */
	mustFix: string[];
	/** Explicit record of anything the caps kept out of the check. */
	droppedClaims: { id: string; reason: string }[];
	usage?: { input_tokens: number; output_tokens: number };
};

export async function verifyClaims(
	claims: ClaimInput[],
	options: {
		systemOne?: SystemOneFn;
		search?: (query: string, signal?: AbortSignal) => Promise<TavilyResult[]>;
		signal?: AbortSignal;
		autoAccept?: number;
		maxResultsPerClaim?: number;
	} = {},
): Promise<VerifyClaimsResult> {
	const autoAccept = options.autoAccept ?? AUTO_ACCEPT;
	const search =
		options.search ??
		((query: string, signal?: AbortSignal) =>
			searchTavily(query, {
				maxResults: options.maxResultsPerClaim ?? MAX_CANDIDATES,
				signal,
			}));

	const droppedClaims: { id: string; reason: string }[] = [];
	const kept: ClaimInput[] = [];
	for (const claim of claims) {
		if (kept.length >= MAX_CLAIMS) {
			droppedClaims.push({ id: claim.id, reason: `over the ${MAX_CLAIMS}-claim cap` });
			continue;
		}
		if (!claim.text.trim()) {
			droppedClaims.push({ id: claim.id, reason: 'empty claim text' });
			continue;
		}
		kept.push(claim);
	}

	const withCandidates = await Promise.all(
		kept.map(async (claim) => {
			try {
				const results = await search(claim.text, options.signal);
				return { ...claim, candidates: usableCandidates(results).slice(0, MAX_CANDIDATES) };
			} catch (error) {
				const message = (error as Error).message;
				droppedClaims.push({ id: claim.id, reason: `search failed: ${message}` });
				return { ...claim, candidates: [], error: `the web search failed (${message})` };
			}
		}),
	);

	if (withCandidates.length === 0) {
		return { summary: zeroSummary(0), results: [], mustFix: [], droppedClaims };
	}

	const { state, questions, index } = buildRequest(withCandidates);
	const systemOne = options.systemOne ?? defaultSystemOne;
	const { answers, usage } = await systemOne({ state, questions });
	const results = toResults(withCandidates, answers, index, autoAccept);

	const summary = {
		total: results.length,
		verified: results.filter((r) => r.verdict === 'verified').length,
		partial: results.filter((r) => r.verdict === 'partial').length,
		contradicted: results.filter((r) => r.verdict === 'contradicted').length,
		conflicted: results.filter((r) => r.verdict === 'conflicted').length,
		unsupported: results.filter((r) => r.verdict === 'unsupported').length,
		unchecked: results.filter((r) => r.verdict === 'unchecked').length,
		needsReview: results.filter((r) => r.needsReview).length,
	};

	return {
		summary,
		results,
		mustFix: results.filter((r) => r.verdict !== 'verified').map((r) => r.id),
		droppedClaims,
		usage,
	};
}

function zeroSummary(total: number) {
	return {
		total,
		verified: 0,
		partial: 0,
		contradicted: 0,
		conflicted: 0,
		unsupported: 0,
		unchecked: 0,
		needsReview: 0,
	};
}

export const verifyClaimsTool = defineTool({
	name: 'verify_claims',
	description:
		'Check a draft\'s factual claims against live web sources and return a machine-verified verdict table. Call this before telling the user a draft is ready, and before any publish. Input: claims — one entry per checkable claim in the draft, each with an "id" you choose (e.g. "c1") and "text" containing the claim as a single self-contained sentence, including the specific date, name, number, or version it asserts. Do not pass vague summaries; pass the exact assertion. Every returned source URL is copied from the search results, so the table can be trusted. Claims returned in mustFix are NOT verified — correct the draft or remove them before publishing.',
	input: v.object({
		claims: v.pipe(
			v.array(
				v.object({
					id: v.string(),
					text: v.pipe(v.string(), v.minLength(1)),
				}),
			),
			v.minLength(1, 'Pass at least one claim to check.'),
		),
	}),
	async run({ data, signal, log }) {
		log.info('verifying claims', { count: data.claims.length });
		const result = await verifyClaims(data.claims, { signal });
		log.info('verification complete', {
			verified: result.summary.verified,
			mustFix: result.mustFix.length,
			needsReview: result.summary.needsReview,
		});
		return { output: result };
	},
});
