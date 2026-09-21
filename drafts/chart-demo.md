---
title: Chart Rendering Demo
description: A throwaway draft that proves charts render. Safe to delete.
date: 2026-09-21
tags: [demo]
draft: true
---

# Chart Rendering Demo

Numbers are illustrative placeholders, not claims about real products.

```chart
{
  "type": "bar",
  "title": "Cost per 1,000 decisions",
  "unit": "USD per 1,000 decisions",
  "source": "illustrative values for a rendering test, not a real benchmark",
  "items": [
    { "label": "Standard LLM call", "value": 12.4 },
    { "label": "Smaller model", "value": 3.1 },
    { "label": "Jev (System One)", "value": 0.9 }
  ]
}
```

And the same figures in a table, which is the alternative when exact values matter more than shape:

| Approach | USD per 1,000 decisions |
| --- | --- |
| Standard LLM call | 12.40 |
| Smaller model | 3.10 |
| Jev (System One) | 0.90 |

A chart that fails to validate shows the author what is wrong instead of vanishing:

```chart
{ "type": "bar", "title": "Deliberately broken" }
```
