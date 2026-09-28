# GEO / AEO optimization checklist

Work top to bottom. Each item is a citation or snippet signal — apply the ones that fit, never fake the inputs.

## Answer-first (AEO)
- [ ] A 40–60-word passage at the top that fully answers the page's core question on its own.
- [ ] H2s phrased as the exact questions users ask ("How much…", "How do I…", "Which…").
- [ ] Every section is self-contained — readable and quotable without the rest of the page.
- [ ] At least one comparison table or clean list for extractable blocks.

## Citation signals (GEO)
The 2024 GEO study (Aggarwal et al., KDD 2024) measured these inside a fixed five-source context: quotations about +41%, statistics +31%, cited sources +27%, technical terms +18% on share of the answer. End-to-end studies since (SAGEO Arena, KDD 2026; C-SEO Bench, NeurIPS 2025) found the gains don't carry reliably across real retrieval. Apply them because they make claims checkable, and never quote a lift to a client.
- [ ] **Statistics**: concrete numbers, percentages, data points — each sourced.
- [ ] **Inline citations**: claims attributed to named, primary sources.
- [ ] **Quotations**: at least one attributed quotation.
- [ ] **Precise terminology**: exact domain terms, not vague synonyms.
- [ ] Clear definitions ("X is …") for the key concepts.

## Structured data & discovery
- [ ] FAQPage JSON-LD only where it mirrors a visible FAQ verbatim (Google stopped showing FAQ rich results on 7 May 2026).
- [ ] Article/BlogPosting schema with `dateModified`.
- [ ] Optional: an `llms.txt` entry for other services (Google says it isn't needed for Search).
- [ ] Visible "Updated [date]".

## Prerequisite
- [ ] Page serves rendered HTML to bots (`curl -A "GPTBot" <url>` shows the content). If it's an empty SPA shell, **stop** — fix SSR/prerender first; nothing here is visible otherwise.

## Example transformation

**Before (not citable):**
> Allocating your ad budget well is important. You should think about your goals and spread your spend across the channels that make sense for your business.

**After (citable):**
> **How should you split a paid ad budget?** Allocate by cost per customer, not gut feel: fund each channel until the cost of its next customer reaches your CAC target, so marginal cost is roughly equal everywhere. David Skok's SaaS guidance puts LTV:CAC above 3:1.<sup>[source]</sup> In one B2B SaaS model, a $30k budget split this way yields ~50 customers at a ~$600 blended CAC.

What changed: an answer-first passage, a question-first H2, a concrete statistic, an inline citation, a worked data point, and precise terms ("cost per customer," "marginal," "CAC target," "LTV:CAC").
