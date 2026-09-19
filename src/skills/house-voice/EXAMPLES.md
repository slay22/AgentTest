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
