---
name: house-voice
description: Write or revise prose in this blog's house voice. Use when drafting a new post, rewriting a section, or when the user says a draft sounds generic, flat, stiff, or "like AI wrote it".
---

# House voice

Activate this skill before writing or substantially rewriting prose, and again when the user
criticizes the *sound* of a draft rather than its content.

Read `EXAMPLES.md` for rewritten before/after pairs taken from published posts. Match those,
not this description — the examples are the actual standard.

## The five rules

1. **Headings make claims, not labels.**
   Not "Tooling" — "The tooling got boring (in a good way)".
   Every `##` should be a sentence someone could disagree with.

2. **Name the specific thing.**
   `llama.cpp and its GGUF quantizations`, not "inference frameworks".
   `antirez (of Redis fame) shipped DS4 in May`, not "a notable developer released a new engine".
   If a claim has a version, a date, a vendor, or a person, include it.

3. **Two-to-four sentence paragraphs.** One idea each. No paragraph that restates the one
   before it in different words.

4. **Attribute numbers instead of asserting them.**
   "One report puts the break-even point at..." — not "the break-even point is...".
   Hedge with the source, never with vagueness ("some say", "it's widely believed").

5. **End on a claim, not a summary.** No "In conclusion", no "Overall", no restating the
   thesis. The last line should land a position.

## Sound

The voice is relaxed and human, with a dry edge. It reads like someone who knows the subject
telling you about it, not like a company describing it.

- **Contractions, always.** "it's", "doesn't", "that's". Uncontracted prose is the single
  loudest machine tell there is.
- **Vary the rhythm.** Short sentence, then a longer one that takes its time. Uniform sentence
  length is what makes text feel generated, more than any single word choice.
- **Fragments are fine.** Occasionally.
- **Talk to the reader, not at them.** "That's the whole shift" beats "this represents a
  significant shift".
- **Be dry, not jokey.** The humour is understatement and a raised eyebrow, not punchlines.
  "(in a good way)" does more work than a joke would.
- **Concede something.** Give the other side its best line before you take it apart. Writers who
  never concede read as salespeople.

### Sarcasm has a target, and it is not the reader

Aim the dryness at **claims, hype, and institutions** — the breathless press release, the
benchmark that measures the wrong thing, the vendor pricing page that disagrees with the vendor
docs. That is fair, and it is where the blog is funny.

Never aim it at the reader, at people who hold a different view, or at someone who lost their
job. And do not be dry on every line: it works *because* it is occasional. If every paragraph
has a raised eyebrow, none of them do. A serious passage played straight is what makes the dry
one land.

## Banned

- Opening with a definition ("X is a Y that Z...") or a question ("Have you ever wondered...?")
- "In today's fast-paced world", "game-changer", "revolutionize", "unlock", "delve",
  "landscape", "testament to", "it's not just X, it's Y"
- Three-item lists where the third item is filler
- Em-dash-free prose: asides belong in em-dashes or parentheses
- The word "arguably"
- **Stiff connectives**: "Furthermore", "Moreover", "Additionally", "It is worth noting that",
  "It should be noted". Start a new sentence instead; the link is usually implied.
- **Performing the tone**: sarcasm on every line, exclamation marks, "I'm just saying", winking
  asides, or a joke where the subject does not deserve one. See the boundary example in
  `EXAMPLES.md`.
- **Perfectly parallel triads** used as rhythm rather than because there are three things.

## Revision pass

When revising a draft, do not rewrite wholesale. List each sentence that breaks a rule
above, name the rule, and propose the replacement. Keep the author's structure and their
jokes; you are removing genericness, not leaving your own fingerprints.
