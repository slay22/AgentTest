---
title: Jev Decides Instead of Talking
description: Every frontier model on the market still answers by writing a sentence. On September 15, TypeSafe shipped one that doesn't.
date: 2026-09-21
tags: [typesafe, system-one-models, ai-inference, automation]
draft: true
---

# Jev Decides Instead of Talking

Every frontier model on the market still answers by writing a sentence. On September 15, TypeSafe shipped one that doesn't.

## It can't write a sentence (that's the point)

TypeSafe AI is a San Francisco frontier lab that emerged from stealth in September 2026 with $40 million in seed funding led by DCVC. It's run by Diogo Almeida, who co-invented RLHF and InstructGPT — the methods behind ChatGPT — alongside CTO Erik Gafni and Sasha Sheng. Their first release, Jev, is what the team calls a System One model — the name for the fast, intuitive half of the brain, borrowed from Kahneman's *Thinking, Fast and Slow* (Jev itself is named for the economist William Stanley Jevons).

The architectural break is that Jev is non-autoregressive. It doesn't predict the next token, one word at a time, to build a paragraph. You hand it the state of your program plus a list of allowed actions, and it returns a typed decision in a single pass — a choice, a score, or a probability, each carrying a calibrated confidence number. TypeSafe frames it as a frontier-intelligence function call: unstructured state in, typed probabilistic decisions out. Because it gives up string generation entirely, the company says it can't hallucinate.

## The math is absurd

TypeSafe describes Jev as running roughly two orders of magnitude faster and more efficiently than comparable frontier models, with end-to-end response times reported at 70 to 500 milliseconds. LangChain, working from the same launch data, puts the gap at up to 200x faster inference and 400x lower cost on classification tasks. Pricing is the sharpest part: $0.042 per million input tokens, with output free, against the $0.20 to $10 per million that conversational models charge.

The mechanism behind the speed is a parallel sampler. Every question in a request is evaluated at once, so asking about ten fields of a support ticket costs only the tokens for those extra questions and barely moves the response time. TypeSafe's own workflow benchmark puts Jev at 67.8 percent — the same score as Sonnet 5 — at about $0.0004 per case, in roughly 0.4 seconds per task versus 78 seconds for Sonnet 5.

## Where you'd actually point it

Jev isn't built to be your chatbot, so the interesting question is what it *replaces*. TypeSafe sketches four jobs. The first is the "smart if-statement": structured outputs that slot into ordinary code as fuzzy decision rules to classify, route, score, extract, or branch where hand-written logic is too brittle. The second is map-reducing over big data — turning petabytes of records into features and signals at a cost that stays a line item instead of a rounding error.

The third is real-time applications, where sub-second, millisecond-scale latency means AI stops being the thing users can feel the app waiting on. The fourth is verification and guardrails: scoring, judging, and detecting jailbreaks across the prompts, reasoning traces, and outputs that larger LLMs already produce. The through-line is that Jev sits inside the workflow as a control layer — deciding, cheaply and fast, when software should act on its own and when to hand a decision up to a bigger model.

## It's not a smaller generalist

None of this makes Jev a cheaper GPT. It can't draft an email, write a story, or explain itself in prose, and its choice space tops out at a cardinality of 255. TypeSafe is candid that the headline pricing may be subsidized and that it still has to prove the economics hold up over time. Jev is in early access behind a waitlist at typesafe.ai, reachable through a `jev-latest` model route with Python and JavaScript SDKs.

The real claim isn't that Jev is smarter than a frontier LLM. It's that most of the decisions inside your software never needed a language model at all — they needed a fast, typed yes.
