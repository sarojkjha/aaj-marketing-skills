# Brief template, intent mapping & worked example

Reference for the `seo-content-brief` skill.

---

## 1. Intent → format

Classify from the SERP, not the keyword. Whatever dominates the top ten *is* the answer to "what does this query mean."

| Intent | SERP signals | Format that ranks | Business role |
|---|---|---|---|
| **Informational** | Guides, definitions, PAA boxes, featured snippet | Guide, explainer, definition | Top of funnel — build authority, capture email |
| **Commercial investigation** | Listicles, "best/vs/alternatives", reviews | Comparison, listicle, buyer's guide | Mid funnel — this is where buyers decide |
| **Transactional** | Product pages, pricing, ads above fold | Landing page, pricing, service page | Bottom funnel — route to the offer |
| **Navigational** | One brand dominates | Don't compete unless it's your brand | None |

**Mixed SERPs** — where the top ten contain two formats — mean the engine hasn't settled the intent. Pick the format that matches your business outcome and expect a longer climb.

**The tell for a wasted brief:** if every result is a tool and you're planning a 2,000-word essay, you will not rank. Build the tool or pick another query.

---

## 2. The cannibalisation check

Run this before writing anything. Two pages targeting one intent split authority and frequently both slide.

1. List existing pages that mention the topic.
2. For each, ask: **does it target the same intent** — not the same keyword, the same *intent*?
3. If yes, the decision is almost always to improve the existing page, not publish a second one.
4. If genuinely different intents (e.g. "what is X" vs "X vs Y"), proceed — and cross-link them explicitly so the distinction is legible to both readers and crawlers.

Worth stating plainly: a briefing skill that never says "don't write this" isn't doing its job. The most valuable output is sometimes "improve the post you already have."

---

## 3. The answer block

40–60 words, placed within the first ~100 words of the page. Direct, no preamble, no "in this article we'll explore."

This single element does more work than any other: it is what answer engines lift for a featured snippet and what AI engines quote when citing. Content that buries its answer forfeits both.

**Test:** could this paragraph stand alone as a complete answer if someone read nothing else? If not, rewrite it.

```
Query:  "what is a good NRR for SaaS"
Answer: "For B2B SaaS, net revenue retention above 100% means the existing
         base grows without new logos. Roughly 110% is strong and 120%+
         is best-in-class. Below 100%, new sales are replacing churn
         rather than adding to it. Read NRR alongside GRR — a high NRR
         can mask a leaky base."
```

---

## 4. Coverage — entities, not word count

List what the page must address to read as complete on the topic. Sources: what the ranking pages all cover, the People Also Ask box, and the questions a real buyer asks.

Completeness against the topic is the target. Length is a byproduct — briefing "2,000 words" produces padding, and padding makes a page worse on every dimension that matters.

---

## 5. Citability

What makes this page worth *citing* rather than summarising. Research on generative-engine optimisation found citations, quotations and statistics produced the largest visibility gains — roughly 30–40% over baseline. Brief for these deliberately:

- **Named sources per claim** — specify which. "Include a statistic" produces a fabricated statistic.
- **Precise statistics** — real numbers with attribution.
- **Original data or a real example** — the thing nobody else can copy.
- **Terminology precision** — use the exact terms practitioners use.

---

## 6. The template

```markdown
# Brief: [Working title]

## Target & intent
- Query: [primary]
- Secondary: [2-4 close variants — same intent only]
- Intent: [informational / commercial / transactional]
- Evidence: [what the SERP actually shows]
- Format required: [guide / comparison / tool / listicle]

## Audience
- Who: [role, stage, company type]
- Awareness state: [unaware → most aware]
- What they already believe:
- What they need to see to act:

## Business outcome
- This page exists to: [the one next action]
- Routes to: [offer / tool / template / service page]
- Success = [ranking / citation / conversion target]

## Cannibalisation check
- Existing pages on this topic: [list]
- Decision: [new page / improve existing] — [why]

## The answer block  (first ~100 words, 40-60 words)
> [Write it here. If you can't, the topic isn't clear enough to brief.]

## Structure
H1: [title — the promise, not the keyword]
  [Answer block]
H2: [question form]
  → answer in first 2 sentences, then elaborate
H2: [question form]
H2: [question form]
H2: FAQ
  - [PAA question]
  - [PAA question]

## Must cover  (entities & subtopics)
- [ ] [entity/subtopic]
- [ ] [entity/subtopic]

## Citability requirements
- Sources to cite: [named — not "a study"]
- Statistics required: [which, from where]
- Original element: [data, example, or framework only we have]

## Internal links
- Links in from: [existing pages]
- Links out to: [next step in the funnel]

## Technical
- URL: /[slug]
- Title tag: [≤60 chars]
- Meta description: [≤155 chars, ends on a complete phrase]
- Schema: [Article / FAQPage / HowTo]

## Do not
- [common mistake for this topic]
```

---

## 7. Worked example

**Query:** "how much should a startup spend on marketing"

```markdown
# Brief: How Much Should a Startup Spend on Marketing?

## Target & intent
- Query: how much should a startup spend on marketing
- Secondary: startup marketing budget, marketing budget percentage revenue
- Intent: Informational, with commercial-investigation overlap — searchers
  are budgeting now and several will hire help
- Evidence: SERP is benchmark guides plus two calculators. Mixed intent —
  the calculator results signal people want a number applied to their own case
- Format required: Guide with an embedded calculation, linking to the tool

## Audience
- Who: Seed–Series B founders and first marketing hires setting a budget
- Awareness state: Problem-aware — they know they need a number, not which
- What they already believe: "there's a standard percentage"
- What they need to see: that the percentage depends on stage and motion,
  and a way to compute their own

## Business outcome
- This page exists to: get the free Marketing Budget Planner downloaded
- Routes to: /resources/marketing-budget-planner, then /services
- Success = ranks top 5, cited by AI engines for the benchmark question,
  and drives template downloads

## Cannibalisation check
- Existing pages: none targeting this intent directly
- Decision: new page

## The answer block
> Most Seed-to-Series-B startups spend 10-20% of revenue on marketing, but
> the percentage is a poor guide on its own. Pre-revenue companies budget
> from runway, not revenue. The defensible method is working backwards from
> a customer target: CAC × customers needed, checked against payback period
> and LTV:CAC.

## Structure
H1: How Much Should a Startup Spend on Marketing?
  [Answer block]
H2: What percentage of revenue do startups spend on marketing?
H2: Why the percentage benchmark breaks down pre-revenue
H2: How do you calculate a marketing budget from a customer target?
H2: How should the budget split across channels?
H2: What CAC payback period is healthy?
H2: FAQ

## Must cover
- [ ] Percentage-of-revenue benchmarks by stage, with source
- [ ] Why pre-revenue companies budget from runway
- [ ] The backwards calculation: target customers × CAC
- [ ] CAC payback and why it constrains spend
- [ ] LTV:CAC as the sanity check
- [ ] Channel allocation logic
- [ ] B2B vs B2C differences

## Citability requirements
- Sources to cite: Gartner CMO Spend Survey, and one SaaS benchmark source
  — named, with the year
- Statistics required: the benchmark percentage range, with attribution
- Original element: the worked calculation from customer target to budget

## Internal links
- Links in from: /tools/marketing-budget-calculator, /blog (budget cluster)
- Links out to: /resources/marketing-budget-planner (primary CTA)

## Technical
- URL: /blog/how-much-should-a-startup-spend-on-marketing
- Title tag: How Much Should a Startup Spend on Marketing? (2026 Benchmarks)
- Meta description: Startup marketing budgets typically run 10-20% of
  revenue — but the percentage is the wrong starting point. Here's the
  method that holds up.
- Schema: Article + FAQPage

## Do not
- Do not give a single number as the answer. The honest answer is a method
- Do not invent benchmark figures. Cite the survey and the year, or omit
```

---

## 8. Quality bar

Before handing a brief to a writer:

- [ ] Intent classified from an actual SERP, not inferred from the keyword
- [ ] Cannibalisation checked against existing pages
- [ ] Answer block written — 40–60 words, standalone
- [ ] H2s phrased as real questions
- [ ] Entities listed; no word-count target
- [ ] Every required statistic has a named source
- [ ] One original element specified
- [ ] Internal links both directions
- [ ] Business outcome and next action named
- [ ] Short enough that a writer will actually read it
