# House voice — before / after

Pairs taken from published posts on this blog. The left column is what a generic draft
produces; the right is what shipped.

## Headings

| Generic | Ours |
| --- | --- |
| `## Tooling` | `## The tooling got boring (in a good way)` |
| `## Hardware Trends` | `## Your desk is the new data center` |
| `## Cost Analysis` | `## The math finally works` |
| `## Conclusion` | *(deleted — post ends on a claim)* |

## Specificity

> **Before:** The ecosystem has matured significantly, with several major inference
> frameworks now offering OpenAI-compatible APIs.

> **After:** The stack has matured: llama.cpp and its GGUF quantizations remain the
> foundation — the team even joined Hugging Face in February — while Ollama, LM Studio,
> vLLM, and SGLang handle serving with OpenAI-compatible APIs.

The rewrite adds a named project, a dated event, a parenthetical aside, and four vendor
names. It also replaces "significantly" with a colon.

## Attribution

> **Before:** The break-even point for a high-end GPU build is only one to three months of
> moderate API usage, meaning local inference is now cost-competitive.

> **After:** One report puts the break-even point for an RTX 5090 build at just one to three
> months of moderate API usage. For privacy-sensitive, high-volume, or latency-critical
> workloads, local inference has stopped being a compromise.

Note what changed: the number is now sourced, the GPU is specified, the conclusion is
narrowed to named workloads instead of "now cost-competitive", and "meaning" is gone.

## Structure

The opening of a post, verbatim:

> Running a large language model on your own hardware used to be a hobbyist flex. In 2026,
> it's a legitimate infrastructure decision.

Two sentences. Sentence one is the assumption being overturned; sentence two is the
reversal, dated. No setup, no definition, no question. Every post opens this way — the
first sentence is what the reader already believes, the second is why it's now wrong.

## Endings

Published posts end on the loaded claim, not a recap:

> ...local inference has stopped being a compromise.

If you find yourself writing "In conclusion" or "Ultimately, X represents a shift toward Y",
delete the paragraph and end one sentence earlier.

## Sound

The pairs here are about *tone*. The rules above govern what to say; these govern how it lands.

### Relaxed, not institutional

> **Before:** It is important to note that the performance characteristics of local inference
> have improved substantially, and users now have a number of viable options when evaluating
> whether to self-host.

> **After:** Local inference got fast enough to stop apologising for. The options didn't
> multiply — they stopped being a compromise.

Three moves: one contraction, one sentence that ends early, and "stopped apologising for"
instead of "improved substantially". None of it is a joke.

### Dry, aimed at the claim

> **Before:** The announcement was met with considerable enthusiasm from the community.

> **After:** The announcement met with the usual enthusiasm: nineteen think-pieces inside a
> week, a working demo in none of them.

The sarcasm points at the response, not at anyone in particular. That distinction is the whole
difference between wit and being unpleasant.

### Understatement beats a punchline

> **Before:** The benchmark results were somewhat disappointing.

> **After:** The benchmark numbers are not flattering. That's one way to put it.

### Rhythm: vary the length on purpose

> **Before:** This approach is efficient. It is also considerably simpler to implement than the
> alternative, which requires several additional dependencies.

> **After:** It's faster. It's also about forty lines of code, which is the part that actually
> matters.

Short. Short. Long. Uniform sentence length is the machine tell you cannot fix with word choice.

### Where the dryness stops

This is the boundary, and it matters more than the examples above it.

> **Before:** And of course the team that spent four years on this got laid off the month it
> shipped, because capitalism remains undefeated.

> **After:** The team that built it was let go three months later. There's no joke in that, so
> I won't make one.

The first version is the failure mode: it reaches for a laugh where the subject does not
deserve one, and it makes the writer look like they are performing. Conceding a straight line is
what buys the credibility to be dry elsewhere.

## One line, end to end

The same paragraph, before and after everything above:

> **Before:** In today's rapidly evolving landscape, it is important to note that local
> inference has become a viable alternative for many users. Furthermore, the cost savings can be
> significant, and users should carefully evaluate their specific requirements.

> **After:** Running a model on your own hardware used to be a hobbyist flex. It isn't anymore —
> the break-even is measured in months, not years, and the tooling stopped being the hard part.
> Whether it's *your* right call depends on how much you care about the data leaving the
> building.
