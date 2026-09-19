// Regression tests for the frontmatter draft flag.
//
// These are the cases that exposed a real bug: the previous implementation used a
// regex (`/^draft:\s*true\s*$/m`) that matched exactly one of the eleven shapes
// below and silently did nothing on the rest. The post then published still
// marked as a draft, and the agent reported success.
//
// Run with `npm run check:drafts`. Plain script, no framework: the behaviour is
// pure and deterministic once the file contents are supplied.

import { applyDraftFlag } from '../src/tools/drafts.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
	console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
	if (!ok) failures++;
}

/** Wraps frontmatter body text in a document, matching how the drafts look. */
const document = (frontmatter: string): string =>
	`---\n${frontmatter}\n---\n\n# Post title\n\nBody text.\n`;

// The bug was that these were NOT flipped. Every one must now flip, or be
// reported honestly as an outcome rather than silently doing nothing.
const mustFlip: [string, string][] = [
	['plain boolean', 'title: T\ndraft: true'],
	['double quoted', 'title: T\ndraft: "true"'],
	['single quoted', "title: T\ndraft: 'true'"],
	['capitalized YAML 1.1 boolean', 'title: T\ndraft: True'],
	['uppercase YAML 1.1 boolean', 'title: T\ndraft: TRUE'],
	['YAML 1.1 yes', 'title: T\ndraft: yes'],
	['YAML 1.1 on', 'title: T\ndraft: on'],
	['inline comment', 'title: T\ndraft: true # not ready yet'],
	['trailing space', 'title: T\ndraft: true '],
	['draft after other keys', 'title: T\ndate: 2026-09-19\ndraft: true\ntags: [a, b]'],
	['CRLF line endings', 'title: T\r\ndraft: true'],
	['draft is not the first key and is quoted', 'title: T\ndraft: "TRUE"'],
];

for (const [name, frontmatter] of mustFlip) {
	const source = document(frontmatter);
	const { content, outcome } = applyDraftFlag(source);
	const normalised = content.replace(/\r/g, '');
	check(
		`flips: ${name}`,
		outcome === 'flipped' && /^draft: false/m.test(normalised),
		`outcome=${outcome}`,
	);
}

// Nested keys: this must NOT be treated as the top-level draft flag.
{
	const { content, outcome } = applyDraftFlag(document('title: T\nmeta:\n  draft: true'));
	check(
		'a nested draft key is not the top-level flag',
		outcome === 'no-draft-field' && content.includes('draft: true'),
		`outcome=${outcome}`,
	);
}

// Already published: report it rather than claiming a change.
{
	const { outcome } = applyDraftFlag(document('title: T\ndraft: false'));
	check('already false -> already-published', outcome === 'already-published', outcome);
}

// No frontmatter at all: a real outcome, not a silent no-op.
{
	const source = '# Post title\n\nBody only, no frontmatter.\n';
	const { content, outcome } = applyDraftFlag(source);
	check('no frontmatter -> no-frontmatter', outcome === 'no-frontmatter', outcome);
	check('no frontmatter leaves the file untouched', content === source);
}

// Frontmatter with no draft field.
{
	const { outcome } = applyDraftFlag(document('title: T\ndate: 2026-09-19'));
	check('no draft field -> no-draft-field', outcome === 'no-draft-field', outcome);
}

// The body must survive byte for byte.
{
	const source = document('title: T\ndraft: true');
	const { content } = applyDraftFlag(source);
	const bodyOf = (text: string) => text.slice(text.indexOf('\n---\n') + 5);
	check('body is preserved exactly', bodyOf(content) === bodyOf(source));
}

// Comments, key order and block scalars must survive: a flip changes one value,
// it does not rewrite the author's file.
{
	const source = document(
		'title: T\n# a comment that must survive\ndraft: true   # not ready\nsummary: |\n  line one\n  line two\ntags: [a, b]',
	);
	const { content, outcome } = applyDraftFlag(source);
	check('comment survives', content.includes('# a comment that must survive'));
	check('inline comment survives', content.includes('# not ready'));
	check('block scalar survives', content.includes('line one') && content.includes('line two'));
	check('key order survives', content.indexOf('title:') < content.indexOf('draft:'));
	check('date stays a string, not coerced to a Date', applyDraftFlag(document('title: T\ndraft: true\ndate: 2026-09-19')).content.includes('2026-09-19'));
	check('outcome is flipped', outcome === 'flipped');
}

// Invalid YAML must fail loudly rather than publish a post the site cannot parse.
{
	let threw = false;
	try {
		applyDraftFlag(document('title: "unterminated\ndraft: true'));
	} catch (error) {
		threw = String(error).includes('not valid YAML');
	}
	check('invalid YAML throws instead of publishing', threw);
}

// Idempotent: flipping twice does not keep changing the file.
{
	const once = applyDraftFlag(document('title: T\ndraft: true'));
	const twice = applyDraftFlag(once.content);
	check('second pass reports already-published', twice.outcome === 'already-published', twice.outcome);
	check('second pass is a no-op', twice.content === once.content);
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
