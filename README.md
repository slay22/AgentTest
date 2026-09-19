# agenttest

A [Flue](https://flueframework.com) agent project: one blog-writing agent, running against a
local model, with skills and an approval gate on publication.

## Setup

```sh
npm install
```

Then fill in `.env` (see [Configuration](#configuration)).

## Talk to your agent

```sh
npx flue run src/agents/blogger-agent.ts --message "Write a short post about my weekend hike"
```

Conversations are durable — pass `--id <id>` to continue one:

```sh
npx flue run src/agents/blogger-agent.ts --id local-llms -m "Tighten the second section"
```

## How it works

The agent follows a four-step workflow, defined in the system prompt in
`src/agents/blogger-agent.ts`:

1. **Research** — `web_search` (Tavily) when the topic needs facts or recent news.
2. **Draft** — writes markdown into `drafts/`. The filename is the post's URL slug.
3. **Fact-check** — verifies every checkable claim and reports a verdict table.
4. **Publish** — two tool calls, gated on explicit user approval (below).

### Skills

Expertise lives in `src/skills/<name>/SKILL.md`, following the open
[Agent Skills](https://agentskills.io) format. Skills are progressively disclosed: each costs
one catalog line in the system prompt, and its instructions load only when the model activates
it, so the prompt stays small no matter how many you add.

| Skill | When it activates | Supporting files |
| --- | --- | --- |
| `post-metadata` | Creating a draft; title, filename, heading, or frontmatter questions | `FRONTMATTER.md` |
| `house-voice` | Writing or revising prose; "this sounds generic" | `EXAMPLES.md` |
| `fact-check` | Before presenting a draft as ready, and before any publish | — |

`house-voice/EXAMPLES.md` was derived from existing posts — it is the actual standard, so edit
it when the voice shifts. The frontmatter rules in `post-metadata/FRONTMATTER.md` are a
reasonable default, not a description of any real site template; adjust to match yours.

Supporting files are read-only and served from the bundle, so the agent can read a skill's
reference material but cannot edit its own instructions.

### Claim verification

The agent does not get to grade its own fact-checking. `verify_claims` splits the work so that
the part the model could get wrong is the part it cannot fabricate:

| Step | Who | Why |
| --- | --- | --- |
| Extract the checkable claims from the draft | the model | finding "this sentence asserts a dated fact" is semantic |
| Search each claim, own the candidate set | code | `src/tools/tavily.ts` |
| Judge each (claim, candidate) pair as `supports` / `contradicts` / `says_nothing` | TypeSafe [Jev](https://docs.typesafe.ai) | one batched request, all pairs in parallel |
| Map relations to verdicts, copy the source URL | code | |

Because a TypeSafe answer is constrained to the options supplied, it cannot return a URL —
only an index into candidates we found. A cited source is therefore always copied verbatim
from a real search result, so **a hallucinated citation is impossible rather than merely
discouraged**. A test asserts this directly: an answer of `https://evil.example/invented` is
discarded and the claim is reported unsupported.

Verdicts are conservative. A contradiction outranks a support; confident support from one
source plus confident contradiction from another is reported as `conflicted` for a human
rather than resolved. `partial` exists because "X happened in February 2026" is only half
answered by a source confirming X — without it the model is forced to pick between
`supports` and `says_nothing` and lands near 0.5, wasting the confidence signal on exactly
the claims that need narrowing. Anything whose answer falls below `AUTO_ACCEPT` (0.8) is
flagged `needsReview` instead of being called verified.

A `verified` verdict backed by a single source is also flagged `needsReview`: one source is
corroboration of one, which is thin evidence for publishing a specific figure.

A search failure reports `unchecked`, **not** `unsupported` — otherwise a transient Tavily
error would push the agent to delete a claim that is probably true.

**What this does and does not give you.** Verdicts proved stable across repeated runs on the
same draft; the *sources* did not, because the underlying web search is not deterministic. So
treat a verdict as a stable judgment and the cited URL as true for the run it came from. Re-verifying
can legitimately return a different URL for the same verdict.

`mustFix` lists every claim that is not verified. A draft is not ready while it is non-empty.
`droppedClaims` records anything the caps excluded (10 claims, 5 sources each), so a partial
check never reads as a complete one.

`tests/verify-claims.check.ts` covers the aggregation rules, the caps, the search-failure
path, and the URL guarantee; run it with `npm run check:verify-claims`.

### The approval gate

Publication is gated on durable state, not on an instruction the model could reason past:

- `publish_post` **does not exist** in the tool list until a draft has been approved. An
  unmounted tool cannot be called, which is a stronger guarantee than "do not publish without
  asking".
- `approve_draft` records the resolved path of the approved draft plus the user's **exact
  words** granting approval, as a durable audit record in the conversation.
- `publish_post` re-checks the specific path at call time, so a second, unapproved draft cannot
  be published just because the tool is mounted.

Approval is per-draft: approving post A does not unlock post B.

**What this is not.** It is a structural and auditability gate, not authentication. A model
that decided to call `approve_draft` unprompted could still publish, and with the host-bound
`local()` sandbox the agent can read `.env` — so no in-band secret would be trustworthy either.
Genuine hardening means taking publishing out of the agent's hands: run it as a separate script
a human invokes, or add a UI with `useDataWriter` where a button press is the approval.
See "Sensible next steps" below.

### Publishing

`publish_post` does two things, in order:

1. **Writes the local copy** into `BLOG_PUBLISH_DIR`, setting the frontmatter's `draft` flag to
   false via a real YAML parser. It reports the destination, whether an existing post was
   replaced, and an explicit `draftFlag` outcome (`flipped` | `already-published` |
   `no-draft-field` | `no-frontmatter`) so a no-op cannot be mistaken for a change.
2. **Pushes the post to the live blog** — the deployed D1 database behind `site/` — over the
   Cloudflare REST API, as a parameterized batch. Nothing is interpolated into SQL.

The row is built by `postFromMarkdown` in `site/src/post-from-file.ts`, which the site's bulk
seed script also uses. A post published by the agent and a post seeded by hand are therefore
byte-identical and cannot drift.

If the push cannot happen the tool still reports `publishedLocally: true`, but
`blog.updated: false` with a reason, and the agent is instructed to say so plainly rather than
implying the post is live. Unconfigured credentials are a normal state, not an error: a checkout
with no Cloudflare variables publishes locally only.

Both tools confine paths to the drafts directory. Anything outside it, any non-`.md` file, and
any missing file is refused with a message listing the drafts that do exist. This matters
because the draft path is model-supplied input.

## Configuration

| Variable | Purpose |
| --- | --- |
| `TAVILY_API_KEY` | Web search, used by `web_search` and the candidate search in `verify_claims`. |
| `TYPESAFE_API_KEY` | [TypeSafe](https://docs.typesafe.ai) System One (Jev), used by `verify_claims`. Empty counts as unset. |
| `BLOG_PUBLISH_DIR` | Where `publish_post` copies finished posts. |
| `BLOG_DRAFTS_DIR` | Where working drafts live. Defaults to `./drafts`. |
| `CLOUDFLARE_ACCOUNT_ID` | Account that owns the blog's D1 database. |
| `CLOUDFLARE_D1_DATABASE_ID` | The `agenttest-posts` database id, as in `site/wrangler.jsonc`. |
| `CLOUDFLARE_API_TOKEN` | Token with **D1 Edit on that one database**. Needed only to push to the live blog. |
| `LEMONADE_BASE_URL` | Local OpenAI-compatible server. Defaults to `http://localhost:13305/v1`. |
| `LEMONADE_API_KEY` | Sentinel only — Lemonade ignores the value. |

**Scope the API token narrowly.** `useSandbox(local({}))` gives the agent a shell on this
machine, so anything in `.env` is readable by model-directed code. A token limited to D1 Edit on
the single blog database cannot touch anything else in the account; an account-wide token could.
Leaving the three variables unset is the safest configuration and is fully supported.

## Layout

```
src/
├─ agents/blogger-agent.ts   # the agent: model, sandbox, skills, tools, prompt
├─ skills/<name>/SKILL.md    # progressively disclosed expertise
├─ tools/                    # defineTool definitions
│  ├─ drafts.ts              # path confinement + publish, shared by both tools
│  ├─ approve-draft.ts       # records approval (factory: takes the state setter)
│  ├─ publish-post.ts        # publishes (factory: takes the approval predicate)
│  └─ web-search.ts
└─ db.ts                     # sqlite persistence for conversations
```

## Sensible next steps

- **Evals** — `src/evals/*.eval.ts` on a separate Vitest config, asserting that the agent never
  publishes unapproved and always searches before asserting facts. The highest-value addition:
  it locks in the gate's behavior as the prompt evolves.
- **Subagents** — researcher / fact-checker / editor in fresh contexts, via `useSubagent()`.
  This matters most for a local model with an 8k output cap.
- **`src/app.ts` + `@flue/react`** — a real drafting UI, and the place a button-press approval
  belongs.
- **Observability** — `observe()` in `app.ts` for token usage, tool calls, and settlement
  outcomes; `flue add tooling opentelemetry` for a backend.

## Related

- `site/` — the public Cloudflare Worker blog that publishes this agent's posts. See
  `site/README.md`.
- `.github/workflows/ci.yml` — CI for both projects: the agent checks run on every push, and the
  site is deployed from `main` behind a post-deploy gate.
- `todo.md` — the backlog, including the decisions already made and why.
