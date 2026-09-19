import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';

// Filesystem helpers shared by the approve/publish tools. Kept out of the tool
// definitions so the path rules live in exactly one place: both tools must
// normalize a draft path identically, because approval is keyed on the result.

export function draftsRoot(): string {
	return resolve(process.env.BLOG_DRAFTS_DIR ?? 'drafts');
}

export function publishRoot(): string {
	const dir = process.env.BLOG_PUBLISH_DIR;
	if (!dir) {
		throw new Error(
			'BLOG_PUBLISH_DIR is not set. Ask the user to add it to .env with the path where published posts go.',
		);
	}
	return resolve(dir);
}

/**
 * Resolve a model-supplied draft path to an absolute path inside the drafts
 * directory. Throws — with the list of drafts that do exist — for anything
 * outside it, non-markdown, or missing.
 */
export async function resolveDraft(draftPath: string): Promise<string> {
	const root = draftsRoot();
	const abs = resolve(draftPath);

	// Containment: the draft must live inside draftsRoot. Without this the model
	// could name any .md file on the host, and publish_post would copy it.
	if (abs !== root && !abs.startsWith(root + sep)) {
		throw new Error(
			`Draft paths must be inside ${root}. Got: ${draftPath}. Available drafts: ${await listDrafts()}`,
		);
	}
	if (!abs.endsWith('.md')) {
		throw new Error(`Only .md files can be published. Got: ${draftPath}`);
	}

	let info;
	try {
		info = await stat(abs);
	} catch {
		throw new Error(`No such draft: ${draftPath}. Available drafts: ${await listDrafts()}`);
	}
	if (!info.isFile()) {
		throw new Error(`Not a file: ${draftPath}. Available drafts: ${await listDrafts()}`);
	}

	return abs;
}

export async function listDrafts(): Promise<string> {
	try {
		const entries = await readdir(draftsRoot(), { withFileTypes: true });
		const names = entries
			.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
			.map((entry) => entry.name);
		return names.length > 0 ? names.join(', ') : '(none)';
	} catch {
		return '(none)';
	}
}

export type PublishResult = {
	destination: string;
	replaced: boolean;
	/** What happened to the frontmatter's `draft` flag. See `applyDraftFlag`. */
	draftFlag: DraftFlagOutcome;
};

/**
 * What happened when we looked for a `draft` flag to flip.
 *
 * This is an outcome rather than a boolean on purpose. The previous
 * implementation used a regex that silently did nothing on any frontmatter shape
 * it did not match — `draft: "true"`, `draft: True`, `draft: yes`, `draft: true #
 * comment`, and more — so the post published still marked as a draft while the
 * agent reported success. An explicit outcome makes "we could not tell"
 * unrepresentable.
 */
export type DraftFlagOutcome =
	| 'flipped'
	| 'already-published'
	| 'no-draft-field'
	| 'no-frontmatter';

// The delimiter scan stays a regex: a line containing exactly `---` at column 0
// genuinely ends the block, because a block scalar's content is indented. Parsing
// the block itself is the part that must not be done by regex.
const FRONTMATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---)(\r?\n|$)/;

/**
 * Set `draft: false` in a markdown document's frontmatter.
 *
 * Uses a real YAML parser, which preserves comments, key order, block scalars and
 * value types. It deliberately does not reformat the frontmatter — a flip should
 * change one value, not rewrite the author's file.
 *
 * Throws on frontmatter that is not valid YAML, rather than publishing something a
 * static site will then fail to parse.
 */
export function applyDraftFlag(source: string): {
	content: string;
	outcome: DraftFlagOutcome;
} {
	const match = FRONTMATTER.exec(source);
	if (!match) return { content: source, outcome: 'no-frontmatter' };

	const document = parseDocument(match[2]);
	if (document.errors.length > 0) {
		throw new Error(
			`Frontmatter is not valid YAML, so the draft flag cannot be set: ${document.errors[0].message}`,
		);
	}

	if (!document.has('draft')) return { content: source, outcome: 'no-draft-field' };
	if (document.get('draft') === false) {
		return { content: source, outcome: 'already-published' };
	}

	document.set('draft', false);
	return {
		content: `---\n${String(document)}---\n${source.slice(match[0].length)}`,
		outcome: 'flipped',
	};
}

/**
 * The exact bytes that publication would write for this source.
 *
 * Approval hashes these rather than the raw draft, so the hash covers precisely
 * what would go live — including the `draft: false` flip. Without that, a change
 * to the flip logic would silently invalidate (or fail to invalidate) approvals.
 */
export function publishedBytes(source: string): string {
	return applyDraftFlag(source).content;
}

/**
 * SHA-256 of a string, hex encoded.
 *
 * Web Crypto rather than `node:crypto` so this works unchanged on the Cloudflare
 * target, where the agent will eventually run.
 */
export async function contentHash(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Copy one approved draft into the publish directory, flipping `draft: true` to
 * `draft: false` in the frontmatter.
 */
export async function publishDraft(absDraftPath: string): Promise<PublishResult> {
	const destination = join(publishRoot(), basename(absDraftPath));
	const source = await readFile(absDraftPath, 'utf8');
	const { content, outcome } = applyDraftFlag(source);

	let replaced = false;
	try {
		await stat(destination);
		replaced = true;
	} catch {
		// Not there yet: a first publish.
	}

	await mkdir(publishRoot(), { recursive: true });
	await writeFile(destination, content, 'utf8');
	return { destination, replaced, draftFlag: outcome };
}
