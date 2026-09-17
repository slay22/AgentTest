import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { copyFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

export const publishPost = defineTool({
	name: 'publish_post',
	description:
		'Publish one finished draft: copies a markdown file into the blog publish directory (BLOG_PUBLISH_DIR env var). Input: draftPath — the path to the markdown draft to publish (e.g. "drafts/my-post.md"). Call only after the user explicitly approves the post.',
	input: v.object({
		draftPath: v.string(),
	}),
	async run({ data }) {
		const destDir = process.env.BLOG_PUBLISH_DIR;
		if (!destDir) {
			throw new Error('BLOG_PUBLISH_DIR is not set. Ask the user to add it to .env with the path where published posts go.');
		}
		const src = resolve(data.draftPath);
		if (!src.endsWith('.md')) {
			throw new Error(`Refusing to publish ${src}: only .md files can be published.`);
		}
		const dest = join(resolve(destDir), basename(src));
		await mkdir(dirname(dest), { recursive: true });
		await copyFile(src, dest);
		return { output: { published: true, destination: dest } };
	},
});
