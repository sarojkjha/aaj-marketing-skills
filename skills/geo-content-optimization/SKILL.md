---
name: geo-content-optimization
description: >-
  Use when the user wants to optimize content so it gets cited by AI engines
  (ChatGPT, Perplexity, Claude, Google AI Overviews) and wins answer-engine
  snippets — i.e. GEO (generative engine optimization) and AEO (answer engine
  optimization). Also use when the user mentions AI citations, getting quoted by
  LLMs, llms.txt, answer-first content, featured snippets, or "make this content
  rank in AI answers." Rewrites/augments a page to maximize citation likelihood.
license: MIT
metadata:
  publisher: AAJ
  slug: geo-content-optimization
  category: SEO, GEO & AEO
  phase: Execute
  difficulty: Intermediate
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: A piece of content (draft or published URL/text) and its target question/topic
  outputs: A GEO/AEO-optimized version with answer-first passages, statistics, citations, quotations, precise terminology, and the schema/llms.txt to add
  related_aaj:
    - https://aajconsult.com/blog/how-to-allocate-paid-ads-budget
  tags: [geo, aeo, ai-search, content-optimization, llms-txt, citations, schema]
---

# GEO Content Optimization

Rewrite content so generative engines **cite it** and answer engines **feature it**. Classic SEO gets you ranked; GEO gets you quoted in the AI answer. The two are different jobs, and most content does neither for AI because it reads like undifferentiated prose with no extractable facts.

## When to use

The user wants a page to be cited by LLMs / appear in AI Overviews / win featured snippets, or wants a draft written to do so from the start.

## Method

Apply the moves the Princeton "GEO" study found to measurably raise citation likelihood, plus the answer-engine structure that wins snippets. Don't keyword-stuff — these are quality signals that make a passage the most useful, quotable unit on the topic.

GEO levers (with approximate measured citation lifts):
- **Statistics** — add concrete numbers and data points (~+30%).
- **Inline citations** — attribute claims to named, authoritative sources (~+30%).
- **Quotations** — include attributed quotations (~+40%).
- **Precise terminology** — use the exact domain terms a buyer or model would use (~+25–30%).

AEO structure:
- **Answer-first passage** of 40–60 words directly answering the page's core question, near the top.
- **Question-first H2s** matching how people actually ask.
- **FAQPage schema** whose Q&A mirror visible text.
- **Scannable lists/tables** that give answer engines clean extractable blocks.

## Workflow

1. **Identify the core question** the page should win, plus 3–6 sub-questions for H2s.
2. **Add an answer-first passage** (40–60 words) up top that fully answers the core question on its own.
3. **Inject the GEO levers** through the body: add real statistics, attribute claims to named sources with inline citations, add at least one attributed quotation, and replace vague phrasing with precise terminology. Every added fact must be true and sourced — invented stats destroy trust and citability.
4. **Restructure for AEO:** convert H2s to questions, ensure each section is self-contained and quotable, add a comparison table or list where it fits.
5. **Specify the schema and llms.txt:** provide FAQPage (and Article) JSON-LD mirroring the visible FAQ, and an `llms.txt` entry for the page.
6. **Verify rendering matters:** note that none of this is visible to AI engines if the page is an un-prerendered SPA — if so, flag SSR/prerender as the prerequisite (see the `seo-geo-aeo-audit` skill).

See `resources/geo-checklist.md` for the full checklist and an example transformation.

## Present the result

Deliver the optimized content (or a marked-up diff of what to change), the answer-first passage, the FAQ + schema to add, the llms.txt entry, and a short list of the specific GEO levers applied and why.

## Guardrails & common mistakes

- **Never fabricate statistics, sources, or quotes.** Sourced and true, or cut. Fake citations are worse than none.
- **Schema must mirror visible text**, or it's a liability.
- **Rendering gates everything.** On a client-side SPA, GEO work is invisible until SSR/prerender ships.
- **Optimize the answer, not the keyword.** The goal is to be the most useful, quotable passage — density of value, not density of terms.

## Related AAJ resources

- Method context: https://aajconsult.com/blog/how-to-allocate-paid-ads-budget (an example of GEO/AEO-built content)

## Related skills

`seo-geo-aeo-audit` (find the gaps first) · `schema` (structured data) · `copywriting` (the prose) · `content-strategy` (where this fits in the calendar).

## Credits

Original AAJ skill, grounded in AAJ's GEO methodology. The Agent Skills format and Corey Haines' `coreyhaines31/marketingskills` (MIT) were references for structure and coverage; this skill is independently written. See the repository README.
