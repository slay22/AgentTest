---
name: data-visuals
description: Add a chart or table to a post to make a comparison readable. Use when a draft compares several numbers (cost, speed, size, benchmarks), when prose lists three or more figures, or when the user asks for a graphic.
---

# Data visuals

Activate when a draft has numbers worth comparing, and whenever the user asks for a chart,
graphic, or diagram.

The blog renders a chart **from data, not from markup** — you write a small JSON spec in a fenced
`chart` block and code generates the SVG. You therefore never write SVG or HTML, and a chart
cannot be malformed in a way that breaks the page.

## When a chart earns its place

A chart is an argument about relative size. If it does not change what the reader concludes, it is
decoration and should not be there.

| Use | When |
| --- | --- |
| **Bar chart** (`chart` block) | Comparing a small number of values on one measure — cost per call, latency, model size. Two to six items. |
| **Markdown table** | Comparing items across *several* measures, or when the exact figures matter more than the shape. |
| **Prose** | One or two numbers. "A 13× difference" is a sentence, not a chart. |

Never a chart for a single value. Never two charts where one comparison would do.

## The spec

A fenced block whose language is `chart`, containing JSON:

````
```chart
{
  "type": "bar",
  "title": "Cost per 1,000 decisions",
  "unit": "USD",
  "source": "https://typesafe.ai/pricing, retrieved 2026-09-21",
  "items": [
    { "label": "Standard LLM call", "value": 12.40 },
    { "label": "Jev (System One)", "value": 0.90 }
  ]
}
```
````

| Field | Rule |
| --- | --- |
| `type` | `"bar"`. Only bar charts exist today. |
| `title` | What the comparison shows, ≤60 characters. A claim, per `house-voice`. |
| `unit` | What the numbers *are*. Not just `USD` — `USD per 1,000 decisions`. A bare currency symbol hides the basis of the comparison. |
| `source` | **Required.** Where every figure came from, with a retrieval date. |
| `items` | 2–8 entries. `label` ≤40 characters, `value` a finite number. |
| `note` | Optional, per item, when one figure has a different basis from the others. |
| `scale` | `"linear"` (default) or `"log"`. See below. |

Bars are scaled to the largest value, so the relative sizes are honest. Do not put a figure in the
spec that is not also stated in the prose — a chart is not a place to hide a number from review.

### When the spread needs a log scale

If the largest value is more than roughly twenty times the smallest, a linear chart is not honest:
the small bars collapse into the same indistinguishable sliver, so a 5× difference looks like no
difference. Set `"scale": "log"` and say so in the prose, because the reader is entitled to know
the axis is not linear.

```json
{ "scale": "log", "items": [ { "label": "Jev", "value": 0.042 }, { "label": "Frontier", "value": 10 } ] }
```

The axis is labelled by decade, the caption says "log scale", and every value must be greater than
zero — a zero or negative value is refused rather than silently dropped. Use `linear` for anything
close in magnitude; a log chart of two similar numbers is harder to read than a linear one.

## Sources are not optional

**A chart makes a number more convincing, not more true.** A wrong figure in a bar chart reads as
authority in a way a wrong figure in a sentence does not.

So: research the numbers with `web_search` and verify them with `verify_claims` **before** writing
the spec, exactly as you would for a claim in prose. Put the verified figures in the prose, then
build the chart from those same numbers. If a figure cannot be sourced, it does not go in a chart —
and if the comparison only works with the unsourced figure, say that you could not source it
rather than charting it anyway.

## What not to do

- **Do not write raw HTML, SVG, or a mermaid diagram.** Post bodies are escaped deliberately:
  they derive from web search results, so markup in a post would be an injection path. A `chart`
  spec is data and is the only way to produce a graphic.
- **Do not fabricate a plausible-looking figure.** A chart of the agent's own recollection is the
  single most damaging thing this skill could produce.
- **Do not chart unlike things.** If one value is per-call and another per-token, either convert
  them to a common basis and say so in `unit`, or use a table and explain the difference. A chart
  that compares different units on one axis is a false comparison.
- **Do not rely on the chart alone.** State the comparison in prose too. Charts are not accessible
  to every reader and a post should stand without them.

## Images

There is no image pipeline. `![alt](url)` renders, but hotlinking third-party images is not
allowed — provenance and copyright are unresolved, and external images leak readers' requests to
whoever hosts them. Do not add images from other sites. If a post needs a photograph or a
screenshot, tell the user it needs an image source first.
