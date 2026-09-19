---
name: fact-check
description: Verify every checkable claim in a draft before it is published. Use when a draft contains dates, version numbers, company names, funding, benchmarks, or quoted figures, and before any publish.
---

# Fact check

Activate before presenting a draft as ready, and whenever the user questions whether
something in a draft is true. This blog states specific, dated, named facts; an unverified
one is worse than a vague one.

The checking itself is done by the `verify_claims` tool, which searches live sources and
returns a machine-verified verdict table. Your job is the part it cannot do: finding the
claims, and acting on what it returns.

## Step 1 — Extract the claims

Scan the draft and pull out every checkable assertion. Do not skip a category because the
claim "sounds right".

| Category | Example from a draft | What must be verified |
| --- | --- | --- |
| Dated events | "joined Hugging Face in February" | The event happened, and in that month/year |
| Version / model names | "DS4", "DeepSeek V4 Flash" | Exact spelling and casing |
| Attribution | "antirez (of Redis fame) shipped DS4" | The person, their credential, and the act |
| Numbers | "one to three months of moderate API usage" | The figure, and which report it came from |
| Benchmarks | "push 100B+ parameter models onto a single GPU" | The claim and its hardware qualifier |
| Vendor capabilities | "Ollama, LM Studio, vLLM, and SGLang" | Each named tool actually does the thing claimed |

Write each claim as **one self-contained sentence that includes the specific detail**, not
a pointer to it. `"llama.cpp's team joined Hugging Face in February 2026"` is checkable.
`"the Hugging Face thing"` is not. Give each claim a short id you choose (`c1`, `c2`, …).

At most 10 claims are checked per call. If a draft has more, split it across calls — and if
the tool reports `droppedClaims`, those claims were **not** checked, so say so.

## Step 2 — Call the tool

Pass the whole claim list in one `verify_claims` call. One call is cheaper and faster than
one call per claim.

## Step 3 — Act on the verdicts

The tool returns one verdict per claim, and every `source.url` is copied from its own search
results — so the source is real and you must not substitute or "improve" a URL.

| Verdict | What it means | What you do |
| --- | --- | --- |
| `verified` | A confident source supports it, including its date/number/name | Leave the claim as written. If it is also flagged `needsReview`, it is **single-sourced** — say so rather than presenting it as settled |
| `partial` | A source confirms part of the claim but not a material specific | **Narrow** the claim to what the source supports (usually drop the unconfirmed date, number, or name). Do not delete the whole claim |
| `contradicted` | A source says the opposite | Correct the draft to match the source and tell the user what changed |
| `conflicted` | Sources disagree with each other | Do not pick a side. Tell the user both sources and ask |
| `unsupported` | No source clearly supports it | Remove the specific detail, or narrow the claim until what remains is supportable |
| `unchecked` | The search itself failed | Nothing was learned about this claim. Retry before drawing any conclusion — do **not** cut it |

`mustFix` lists the ids that are not verified. **A draft is not ready while `mustFix` is
non-empty.** Resolve every entry, then call `verify_claims` again on the corrected draft to
confirm — do not assume your correction verified itself.

`needsReview` marks answers the model was not confident about, **or a `verified` claim backed
by only one source**. Mention those to the user as weaker evidence rather than presenting them
as settled.

One caveat to pass on when the user cares: re-running verification can return a *different
source URL* for the same verdict, because the underlying web search is not deterministic. The
verdict is stable; the specific citation is not. Cite what the tool returned for the run you
actually verified against.

## Step 4 — Report

Where trust in the posts or the model matters, report the tool's table as-is, not a
paraphrase of it, plus a line per correction you made.

| Claim | Verdict | Source |
| --- | --- | --- |
| llama.cpp team joined Hugging Face in February | verified | <url from the tool> |

Do not paste source text back to the user. Do report anything in `droppedClaims`.

## Never

- Never mark a claim verified because it is plausible, widely repeated, or was in a previous
  draft. Previously published does not mean previously verified.
- Never write or edit a source URL by hand. If the tool did not return one, the claim is
  unsupported — that is the answer.
- Never soften an unverified number into a range to keep it. Cut it.
- Never present a verdict table you did not get from the tool.
