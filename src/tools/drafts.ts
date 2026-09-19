import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';

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
	frontmatterUpdated: boolean;
};

/**
 * Copy one approved draft into the publish directory, flipping `draft: true` to
 * `draft: false` in the frontmatter if it is present.
 */
export async function publishDraft(absDraftPath: string): Promise<PublishResult> {
	const destination = join(publishRoot(), basename(absDraftPath));
	const source = await readFile(absDraftPath, 'utf8');

	let content = source;
	let frontmatterUpdated = false;
	const block = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(source);
	if (block) {
		const flipped = block[2].replace(/^draft:\s*true\s*$/m, 'draft: false');
		if (flipped !== block[2]) {
			content = source.slice(0, block.index) + block[1] + flipped + block[3] + source.slice(block.index + block[0].length);
			frontmatterUpdated = true;
		}
	}

	let replaced = false;
	try {
		await stat(destination);
		replaced = true;
	} catch {
		// Not there yet: a first publish.
	}

	await mkdir(publishRoot(), { recursive: true });
	await writeFile(destination, content, 'utf8');
	return { destination, replaced, frontmatterUpdated };
}
