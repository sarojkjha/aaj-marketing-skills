# GEO / AEO optimization checklist

Work top to bottom. Each item is a citation or snippet signal — apply the ones that fit, never fake the inputs.

## Answer-first (AEO)
- [ ] A 40–60-word passage at the top that fully answers the page's core question on its own.
- [ ] H2s phrased as the exact questions users ask ("How much…", "How do I…", "Which…").
- [ ] Every section is self-contained — readable and quotable without the rest of the page.
- [ ] At least one comparison table or clean list for extractable blocks.

## Citation signals (GEO — Princeton-measured lifts)
- [ ] **Statistics** (~+30%): concrete numbers, percentages, data points — sourced.
- [ ] **Inline citations** (~+30%): claims attributed to named, authoritative sources.
- [ ] **Quotations** (~+40%): at least one attributed quotation.
- [ ] **Precise terminology** (~+25–30%): exact domain terms, not vague synonyms.
- [ ] Clear definitions ("X is …") for the key concepts.

## Structured data & discovery
- [ ] FAQPage JSON-LD whose Q&A mirror the visible FAQ verbatim.
- [ ] Article/BlogPosting schema with `dateModified`.
- [ ] An `llms.txt` (and `llms-full.txt`) entry: title, URL, one-line description.
- [ ] Visible "Updated [date]".

## Prerequisite
- [ ] Page serves rendered HTML to bots (`curl -A "GPTBot" <url>` shows the content). If it's an empty SPA shell, **stop** — fix SSR/prerender first; nothing here is visible otherwise.

## Example transformation

**Before (not citable):**
> Allocating your ad budget well is important. You should think about your goals and spread your spend across the channels that make sense for your business.

**After (citable):**
> **How should you split a paid ad budget?** Allocate by cost per customer, not gut feel: fund each channel until the cost of its next customer reaches your CAC target, so marginal cost is roughly equal everywhere. A healthy LTV:CAC floor is 3:1.<sup>[source]</sup> In one B2B SaaS model, a $30k budget split this way yields ~50 customers at a ~$600 blended CAC.

What changed: an answer-first passage, a question-first H2, a concrete statistic, an inline citation, a worked data point, and precise terms ("cost per customer," "marginal," "CAC target," "LTV:CAC").
