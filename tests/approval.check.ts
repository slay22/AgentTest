// The approval gate.
//
// The hole these guard against: approval used to be keyed on the draft *path*, so
// it survived an edit. Approve a draft, rewrite it, publish — the gate passed and
// published text the user never saw. Approval now carries a hash of the bytes
// publication would write, and publish re-verifies it.
//
// Run with `npm run check:approval`.

import { contentHash, publishedBytes } from '../src/tools/drafts.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
  if (!ok) failures++;
}

const draft = (frontmatter: string, body = 'Body text.') =>
  `---\n${frontmatter}\n---\n\n# Title\n\n${body}\n`;

/** Mirrors publish_post's check: does the current draft still match the approval? */
async function stillApproved(currentSource: string, approvedHash: string): Promise<boolean> {
  return (await contentHash(publishedBytes(currentSource))) === approvedHash;
}

// --- the hole: editing after approval must void it ----------------------
{
  const approved = draft('title: T\ndraft: true', 'The original body.');
  const hash = await contentHash(publishedBytes(approved));

  check('unmodified draft still passes', await stillApproved(approved, hash));
  check(
    'an edited body voids the approval',
    !(await stillApproved(draft('title: T\ndraft: true', 'A completely different body.'), hash)),
  );
  check(
    'a changed title voids the approval',
    !(await stillApproved(draft('title: Changed\ndraft: true', 'The original body.'), hash)),
  );
  check(
    'adding a section voids the approval',
    !(await stillApproved(`${approved}\n## New section\n\nMore.`, hash)),
  );
  check(
    'even a whitespace-only change voids it',
    !(await stillApproved(draft('title: T\ndraft: true', 'The original body. '), hash)),
  );
}

// --- what the hash covers ----------------------------------------------
{
  // The hash is over the bytes publication writes, not the raw file, so a change
  // to the `draft: false` flip is covered by the same approval.
  const source = draft('title: T\ndraft: true');
  const published = publishedBytes(source);
  check('published bytes have the flag flipped', published.includes('draft: false'));
  check('published bytes differ from the source', published !== source);

  // Two sources that publish to identical bytes must hash identically. This is why
  // the hash is over publishedBytes rather than the file: the flag is bookkeeping,
  // the text is what the user approved.
  const alreadyFalse = draft('title: T\ndraft: false');
  check(
    'a draft whose flag is already false publishes identical bytes',
    publishedBytes(alreadyFalse) === published,
  );
  check(
    'so the two hash the same',
    (await contentHash(publishedBytes(alreadyFalse))) === (await contentHash(published)),
  );
}

// --- hashes are stable and well formed ---------------------------------
{
  const hash = await contentHash('hello');
  check('sha-256 hex is 64 chars', /^[0-9a-f]{64}$/.test(hash), hash);
  check('hashing is deterministic', hash === (await contentHash('hello')));
  check('different input, different hash', hash !== (await contentHash('hello ')));
  check(
    'known vector: sha256("") is the empty-string digest',
    (await contentHash('')) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    await contentHash(''),
  );
}

// --- a draft with no flags at all still hashes deterministically --------
{
  const noFrontmatter = '# Title\n\nNo frontmatter here.\n';
  const hash = await contentHash(publishedBytes(noFrontmatter));
  check('a file with no frontmatter hashes', hash.length === 64);
  check(
    'and an edit to it voids the approval',
    !(await stillApproved('# Title\n\nNo frontmatter HERE.\n', hash)),
  );
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
