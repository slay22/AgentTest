# Ideas

Possible directions for this project, ordered by how much they'd help. Everything here is
grounded in something found while working on the repo — file paths and evidence are included
so a future session can pick an item up without re-deriving it.

---

## Known defects

Not ideas. These are things that are wrong now.

### 1. ~~`publish_post` flips the draft flag with a regex~~ — FIXED

`src/tools/drafts.ts` parsed frontmatter with `/^(---\r?\n)([\s\S]*?)(\r?\n---)/` and flipped
`draft: true` with `/^draft:\s*true\s*$/m` — a regex impersonating a YAML parser. Measured
against realistic variants, **6 of 11 silently no-op'd**: the post published with `draft: true`
still in it while the agent reported success.

| Frontmatter | Old behaviour |
| --- | --- |
| `draft: true` | flipped |
| `draft: "true"` / `'true'` | **silent no-op** |
| `draft: True` | **silent no-op** |
| `draft: yes` (YAML 1.1) | **silent no-op** |
| `draft: true # comment` | **silent no-op** |
| nested `meta:\n  draft: true` | **silent no-op** |
| `meta: {draft: true}` | **silent no-op** |

**Fixed** by parsing with the `yaml` package's `Document` API, which preserves comments, key
order, block scalars and value types — it changes one value rather than rewriting the author's
file. `js-yaml` was rejected: it coerces `2026-09-19` to a `Date`, so re-serialising would have
corrupted the date field.

The second half of the fix matters as much as the first: the result is now an explicit outcome
(`flipped` | `already-published` | `no-draft-field` | `no-frontmatter`) instead of a boolean, and
invalid YAML throws rather than publishing something a static site cannot parse. A silent no-op
is no longer representable. 27 regression checks in `tests/drafts.check.ts`.

Worth noting as a pattern: this is the one place in the project where reaching for AI would have
been the wrong instinct. It is deterministic parsing.

### 2. `posts/local-llms.md` has no frontmatter

The only published post has none, so the conventions in
`src/skills/post-metadata/FRONTMATTER.md` (and the `date`, `tags`, `description` fields the
site would need) are aspirational, not real. Anything built on them — tag reuse, publish-time
validation — depends on this first.

### 3. The current draft has 4 unverified claims

`verify_claims` on `drafts/local-llms.md` returns `mustFix` for four claims: the DS4 "May"
date, "NPUs … standard in laptops and phones", "100B+ parameter models onto a single
high-end consumer GPU", and the RTX 5090 "one to three months" figure. The tool's suggested
narrowings looked reasonable. The content needs a pass, not just the code.

### 4. Verification sources are not reproducible

Verdicts are stable across runs; the source URLs are not — the web search is not deterministic.
Re-verifying can return a different URL for the same verdict. If a published post cites a
source, pin the URL at publish time rather than re-deriving it later.

### 5. `TYPESAFE_API_KEY` is readable by the agent

`useSandbox(local({}))` gives the agent host shell access, so anything in `.env` is reachable
by model-directed code. Same for `TAVILY_API_KEY`. A scoped key with a spend cap is the
pragmatic mitigation; a real fix is moving publishing (and maybe verification) out of the
agent's sandbox.

---

## Decided

Architecture choices already made, with the evidence, so they are not re-debated.

### The blog is a Cloudflare Worker, not Pages

`site/` is a Worker. Cloudflare's own [compatibility
matrix](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
settles it: Durable Objects are workaround-only on Pages, and Cron Triggers, Workers Logs,
Logpush and Tail Workers are unsupported outright. Pages could host the blog today, but Flue's
Cloudflare target runs each agent conversation in a Durable Object — so Pages would mean
migrating later. Static asset requests are free on both, so this costs nothing.

### Posts live in D1

This falls out of the platform rather than being a preference. Flue's Cloudflare target
**rejects `src/db.ts` at build time** and its default sandbox is in-memory with no durable
filesystem, so `publish_post` cannot copy a file the way it does locally. Posts need durable
storage the agent can reach: D1 for queryable text, R2 for blobs (images later), never KV
(eventually consistent, wrong for "I just published it, show me").

### Markdown is rendered at publish time, not per view

The Workers free plan allows **10 ms of CPU per request**, and Cloudflare's docs say SSR
"typically uses 10-20 ms". So `body_html` is rendered once at publish and stored next to
`body_md`. D1 query time is *not* counted as CPU time, which is what makes the read path safe.

### The publish API is a token, and production should not have one at all

**Decided: the blog is public on purpose, the agent is private on purpose.** That split drives
the auth story.

**Cloudflare Access is per-hostname, not per-path**, so it cannot gate `/api/*` on a hostname
whose blog must stay public — and it cannot front the blog without making the blog private. So
Access is the wrong tool here, which rules out the `receiptScanner` pattern. The publish API is
protected by a bearer token plus the `PUBLISH_ENABLED` kill switch, and that token only ever
guards a **development and seeding** surface.

**Production runs with `PUBLISH_ENABLED` unset**, so no public write endpoint exists at all. The
private agent publishes by holding a `DB` binding to the posts database and inserting directly
through `site/src/repository.ts` — no HTTP, no token, nothing to attack. A private Worker with
no public route has nothing to authenticate.

### Drafts belong in a second D1 database

The public Worker holds a binding to the posts database. If drafts lived in that same database,
the binding could read unreviewed work even with no route exposing it. Putting drafts in a
second database — bound only by the agent — makes the separation structural rather than a
matter of route discipline: the public Worker *physically cannot* read a draft. 10 databases are
free, so this costs nothing.

Publishing then becomes: read the draft, render markdown, write the post. Which is the step the
agent already owns.

### Workers AI is not viable for this agent on the free plan

**10,000 neurons/day.** Not enough for a writing agent that runs multi-turn research. This
confirms routing the hosted agent to an external provider; `receiptScanner` already implements
the chain to copy (Workers AI free → Mistral free, paced → OpenCode Go BYOK with a daily cap),
including the free-tier pacing rule for `mistral-small` (1 request/second, 20k tokens/min).

---

## Next up

### 6. Verify the approval quote before recording it

`src/tools/approve-draft.ts:18` validates `userQuote` with `v.minLength(1)`. One character
passes. The entire judgment that the quote constitutes approval — and approves *this* post —
rests on the tool description at line 15.

The failure modes are specific and enumerable, which makes this a clean TypeSafe fit:

- Choice: `approves_this_draft` / `approves_a_different_draft` / `praise_only` / `no_approval`
- Noul: *"Are these the words of the user, not of the assistant?"* — `userQuote` is
  model-supplied text, so it could paste its own words

Threshold should be high (`> 0.9`) since publishing is irreversible. Guards the one
irreversible action in the project, and the API shape is now proven against this account.

### 7. Stop the agent from naming values code can enumerate

Wherever the agent produces a *name* as generated text, code can enumerate the legal values and
make it a constrained choice. The model then selects rather than generates, and cannot invent
something that does not exist. Same structural trick that makes citations trustworthy.

| Spot | Today | With a constrained choice |
| --- | --- | --- |
| Which draft? — "publish the LLM one" | model globs and guesses a path | options *are* the filenames `listDrafts()` returned, plus a `none` hatch |
| Tag reuse — `post-metadata/SKILL.md` says "check `posts/`" | unenforced prose; invites `llm`/`llms`/`local-llm` drift | options *are* the tags actually in `posts/`, plus `new_tag` |

The first is a real bug risk: approval is keyed on the *resolved path*, so selecting the wrong
draft approves the wrong draft.

### 8. Score voice instead of looping on "make it better"

`house-voice/SKILL.md` has five rules and a banned list, and the revision loop is unbounded —
revise until it sounds right, with no measurement.

Split into Score questions per [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring):
claim-shaped headings, specificity (named entities vs. categories), paragraph discipline,
ending strength. Code weights them and thresholds. Then track the numbers over time.

The banned-word list should stay a regex — that part is mechanical.

### 9. Ask before overwriting a published post

`src/tools/drafts.ts:96-102` overwrites an existing published post and reports `replaced: true`.
It never asks whether the new draft is a *revision* of that post or a *different* post that
happens to share a slug. The second case is silent data loss. A Noul routes it to a confirm.

---

## Bigger bets

### 10. Evals

`src/evals/*.eval.ts` on a separate Vitest config, per the
[Flue evals guide](https://flueframework.com/docs/guide/evals/). Assert the behavioural
contract rather than exact output: never publishes unapproved, always calls `verify_claims`
before publishing, always narrows on `partial`, never cites a URL the tool did not return.

The highest-value item on this list for a writing agent — it's what keeps the guardrails
honest as the prompt evolves. There is currently one plain-script regression test
(`tests/verify-claims.check.ts`) and no coverage of agent behaviour.

### 11. Subagents

`useSubagent()` for researcher / fact-checker / editor in fresh contexts. Matters most because
the local model runs at `maxTokens: 8192` — research dumps currently land in the same window
as the draft. `GeneralSubagent` is available for ad-hoc fan-out.

Also worth considering: routing the editor to a hosted model while drafting stays local, via
per-delegate `model`.

### 12. A UI on the site

`site/` is the public blog (`site/README.md`). The next step there is not a chat UI but wiring
the agent to publish into it, per the "Decided" section above.

A drafting UI is still worth having separately, and it is where a button-press approval
belongs — a UI press is a genuine human signal in a way no in-band approval tool can be.
`createAgentRouter(BloggerAgent)` plus `@flue/react`'s `useFlueAgent({ url })` in the Flue app,
with authentication and a conversation-ownership check, since mounting is the *exposure*
decision.

### 13. Observability

`observe()` in `app.ts` for `turn` events (token usage and cost per post), `tool` events, and
`submission_settled` outcomes. Then `flue add tooling opentelemetry` for a backend. With a
local model, cost is zero but latency is not, and verification adds a Tavily + TypeSafe round
trip per draft.

### 14. Durable publishing

`publish_post` is a single `copyFile`, so it does not need `durable: true` today. The moment
publishing becomes git-commit → push → build-hook, it does: declare it a durable tool and put
each effect in `step.do(name, fn)` so a crash mid-publish replays instead of double-committing.

### 15. A schedule

`croner` in `app.ts` + `dispatch(BloggerAgent, { id, message: { kind: 'signal', … } })` for a
weekly draft on a topic. Fixed id keeps one continuing conversation with memory of past posts;
per-fire id (`weekly-2026-07-24`) bounds the context.

### 16. A GitHub channel

`flue add channel github` — a signal on `issue_comment.created` or a PR review, dispatched into
the conversation, with a `reply_in_pr` tool whose repo and PR are bound in trusted code rather
than chosen by the model. Pairs naturally with the polished `posts/` directory being the same
repo.

---

## Parked

Considered and deliberately not doing — recorded so it does not get re-litigated.

- **Intent routing through TypeSafe** (new post / revise / publish / question). The agent
  already reasons well about this. Putting a classifier in front of an LLM that is already
  deciding adds a failure mode without removing one.
- **TypeSafe for the frontmatter flip.** Deterministic parsing. Use YAML.
- **`search_depth: 'advanced'` everywhere in `web_search`** (`src/tools/web-search.ts`). Costs
  more per query for a marginal recall gain on the fact-check path, which already over-finds
  and filters by judgment. Revisit only if `unsupported` verdicts look like recall failures
  rather than genuine absence of evidence.

---

## Model configuration worth revisiting

Not defects, but current choices that may not be deliberate:

- `reasoning: false` in the Lemonade provider means any `thinkingLevel` is **silently dropped**
  (per the [models guide](https://flueframework.com/docs/guide/models/)). Default is `medium`.
- One model, no fallback if Lemonade is down. Escalation is possible via
  `useModel(escalated ? 'anthropic/…' : 'lemonade/…')` + `usePersistentState` — and model choice
  is submission-scoped, so it latches on the next message, not mid-run.
- `compaction` is unset, so it is model-aware default. Worth setting `compaction.model` to a
  cheaper model explicitly.
- `web_search`'s `search_depth: 'basic'` is hardcoded rather than a tool argument.
