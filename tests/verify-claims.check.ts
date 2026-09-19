// Regression tests for the claim-verification rules.
//
// Run with `npm run check:verify-claims`. No test framework: the interesting
// behavior here is pure and deterministic once the search and the model are
// injected, so a plain script with a non-zero exit code is enough.
//
// The most important assertion is `adversarial choice value cannot become a
// source`: it is the test that keeps a hallucinated citation impossible.

import {
	buildRequest,
	toResults,
	verifyClaims,
	type SystemOneFn,
} from '../src/tools/verify-claims.ts';

const candidate = (url: string, content: string) => ({
	url,
	title: `source ${url}`,
	content,
});

/** A System One stub keyed by question id, so every relation is under our control. */
function fakeSystemOne(
	replies: Record<string, { choice: string; confidence: number }>,
): SystemOneFn {
	return async () => ({ answers: replies });
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
	console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
	if (!ok) failures++;
}

// --- verdict aggregation -------------------------------------------------
{
	const claims = [
		{ id: 'c1', text: 'supported', candidates: [candidate('https://a/1', 'yes'), candidate('https://a/2', '')] },
		{ id: 'c2', text: 'contradicted', candidates: [candidate('https://b/1', 'no')] },
		{ id: 'c3', text: 'conflict', candidates: [candidate('https://c/1', 'yes'), candidate('https://c/2', 'no')] },
		{ id: 'c4', text: 'partial only', candidates: [candidate('https://d/1', 'half')] },
		{ id: 'c5', text: 'nothing', candidates: [candidate('https://e/1', 'unrelated')] },
		{ id: 'c6', text: 'weak', candidates: [candidate('https://f/1', 'maybe')] },
		{ id: 'c7', text: 'no candidates', candidates: [] },
	];
	const { index } = buildRequest(claims);
	const results = toResults(
		claims,
		{
			c0_p0: { choice: 'supports', confidence: 0.95 },
			c1_p0: { choice: 'contradicts', confidence: 0.9 },
			c2_p0: { choice: 'supports', confidence: 0.9 },
			c2_p1: { choice: 'contradicts', confidence: 0.85 },
			c3_p0: { choice: 'partial', confidence: 0.9 },
			c4_p0: { choice: 'says_nothing', confidence: 0.88 },
			c5_p0: { choice: 'supports', confidence: 0.4 },
		},
		index,
	);
	const byId = Object.fromEntries(results.map((r) => [r.id, r]));

	check('supports -> verified', byId.c1.verdict === 'verified');
	check('copies the supporting source url', byId.c1.source?.url === 'https://a/1');
	check('contradicts -> contradicted', byId.c2.verdict === 'contradicted');
	check('supports + contradicts -> conflicted + review', byId.c3.verdict === 'conflicted' && byId.c3.needsReview);
	check('partial -> partial + review, not unsupported', byId.c4.verdict === 'partial' && byId.c4.needsReview, byId.c4.verdict);
	check('all says_nothing -> unsupported + review', byId.c5.verdict === 'unsupported' && byId.c5.needsReview);
	check('below threshold -> unsupported + review', byId.c6.verdict === 'unsupported' && byId.c6.needsReview);
	check('no candidates -> unsupported + review', byId.c7.verdict === 'unsupported' && byId.c7.needsReview);
	check('single source is flagged as needing review', byId.c1.needsReview && byId.c1.corroboration === 1);
}

// --- corroboration -------------------------------------------------------
{
	const claims = [{ id: 'c1', text: 'x', candidates: [candidate('https://a/1', 'p'), candidate('https://a/2', 'p')] }];
	const { index } = buildRequest(claims);
	const results = toResults(
		claims,
		{ c0_p0: { choice: 'supports', confidence: 0.9 }, c0_p1: { choice: 'supports', confidence: 0.95 } },
		index,
	);
	check('two sources -> corroboration 2, no review flag', results[0].corroboration === 2 && !results[0].needsReview);
}

// --- the structural guarantee -------------------------------------------
{
	const claims = [{ id: 'c1', text: 'x', candidates: [candidate('https://real/1', 'supports it')] }];
	const { index } = buildRequest(claims);
	const results = toResults(
		claims,
		{
			// Neither value is in the criteria we supplied, so neither may be used.
			c0_p0: { choice: 'https://evil.example/invented', confidence: 0.99 },
			c0_p1: { choice: 'supports', confidence: 0.99 },
		},
		index,
	);
	check('a model answer cannot become a source', results[0].source === null);
	check('no invented url anywhere in the result', !JSON.stringify(results).includes('evil.example'));
}

// --- caps are reported, never silent ------------------------------------
{
	const claims = Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, text: `claim ${i}` }));
	const out = await verifyClaims(claims, {
		systemOne: fakeSystemOne({}),
		search: async () => [],
	});
	check('claim cap keeps 10', out.results.length === 10, String(out.results.length));
	check('overflow reported in droppedClaims', out.droppedClaims.length === 2 && out.droppedClaims[0].reason.includes('cap'));
}

// --- a failed search is not a false claim -------------------------------
{
	const out = await verifyClaims([{ id: 'c1', text: 'x' }], {
		systemOne: fakeSystemOne({}),
		search: async () => {
			throw new Error('Tavily API error 429');
		},
	});
	const result = out.results[0];
	check('search failure -> unchecked, not unsupported', result.verdict === 'unchecked', result.verdict);
	check('reason warns against treating it as false', result.reason.includes('do not treat this as a false claim'));
	check('unchecked surfaces in mustFix', out.mustFix.includes('c1'));
	check('search failure recorded in droppedClaims', out.droppedClaims.some((d) => d.reason.includes('429')));
}

// --- batching ------------------------------------------------------------
{
	const claims = [
		{ id: 'c1', text: 'a' },
		{ id: 'c2', text: 'b' },
		{ id: 'c3', text: 'c' },
	];
	let calls = 0;
	const counting: SystemOneFn = async () => {
		calls++;
		return { answers: {} };
	};
	await verifyClaims(claims, {
		systemOne: counting,
		search: async () => [candidate('https://x/1', 'p')],
	});
	check('every claim batched into one request', calls === 1, String(calls));
}

// --- the request we actually send ---------------------------------------
{
	const { state, questions } = buildRequest([
		{ id: 'c1', text: 'the claim', candidates: [candidate('https://a/1', 'the passage')] },
	]);
	const question = questions.c0_p0;
	const encoded = JSON.stringify(state);
	check('state carries the claim and passage', encoded.includes('the claim') && encoded.includes('the passage'));
	check('instructions reference the state by path', question.instructions.includes('`claims[0].text`'));
	check('criteria include a partial option', 'partial' in question.criteria);
	check('source url is never sent as an option', !JSON.stringify(question.criteria).includes('https://'));
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
