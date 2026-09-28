---
name: marketing-budget-planning
description: >-
  Use when the user wants to set or sanity-check a total marketing budget — how
  much to spend overall, as a percentage of revenue, by company stage and
  business model — and split it across brand, demand gen, content, and tooling.
  Also use when the user mentions marketing budget, % of revenue on marketing,
  how much should we spend on marketing, or budget allocation across functions.
  Produces a budget from AAJ's stage bands (labelled as AAJ's own estimates),
  published reference points (Gartner, SaaS Capital) and a function-level split.
license: MIT
metadata:
  publisher: AAJ
  slug: marketing-budget-planning
  category: Paid Media & Budgeting
  phase: Design
  difficulty: Starter
  card: >-
    Sizes a marketing budget by stage, shows where each figure comes from, and
    splits it by function.
  version: 1.1.0
  sprint: unit-economics-retention
  topic: analytics-budget
  secondary_topics: [paid-media]
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: Business model, company stage, the right base for that stage (quarterly burn, funding raised, or annual revenue), and growth ambition
  outputs: A planned marketing budget (share of the base, per period and per month), where the figure comes from, published reference points, and a split across functions
  related_aaj:
    - https://aajconsult.com/tools/marketing-budget-calculator
    - https://aajconsult.com/resources/marketing-budget-planner
    - https://aajconsult.com/blog/how-much-should-a-startup-spend-on-marketing
  related: [unit-economics, paid-media-budget-allocation]
  tags: [marketing-budget, budget-planning, percent-of-revenue, saas, stage]
---

# Marketing Budget Planning

Decide **how much** to spend on marketing overall — the question that comes before how to split it across channels. The answer is set by stage, model, growth ambition, and cash runway, expressed as a percentage of revenue and then divided across functions.

## When to use

The user needs a total marketing budget or wants to check whether their current spend level is reasonable for their stage and model.

## Before you start

1. **Read the brand/product context** (`.agents/product-marketing.md` / `.agents/aaj-brand.md`) for model and stage, if present.
2. **Gather:** business model (B2B SaaS / ecommerce / services / marketplace), stage (pre-seed → mature), annual revenue (ARR or revenue), and growth ambition (conservative / balanced / aggressive).
3. **Have unit economics handy.** A budget is only affordable if the implied CAC clears LTV:CAC — run the `unit-economics` skill if unsure.

## Method

For **B2B SaaS**, the engine uses AAJ's stage bands — AAJ's own estimates from client engagements (2023–2026), not third-party research — and says so in every output:

| Stage | AAJ band | Sized against |
|---|---|---|
| Pre-seed | 30–60% | quarterly burn (revenue isn't a useful base yet) |
| Seed | 10–20% | funding raised |
| Series A | 20–30% | ARR |
| Series B | 12–20% | revenue |
| Growth (post-Series B) | 15–25% | revenue |
| Mature | 5–7% | revenue, marketing only |

Growth ambition picks the low end, midpoint or high end of the band; runway caps it. Every run also prints the published reference points: Gartner's 2026 CMO Spend Survey (budgets averaged **7.8% of company revenue**, mostly companies above $1B revenue), SaaS Capital's 2026 survey (median private B2B SaaS marketing spend **8% of ARR**), and Gartner's 2026 category shares (paid media **31.4%**, martech **19.4%** of the average budget).

For **ecommerce, services and marketplaces** there is no sourced stage band. Pass your own `pctOfRevenue`; without it, the engine sizes the budget at Gartner's 7.8% and labels it as a large-company average, not a target.

The function split is AAJ's default assumption, not a benchmark — pass your own `split` to replace it. Affordability is confirmed against unit economics.

## Run the engine

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/marketing-budget-planning/resources/…` instead.

```bash
node .agents/skills/marketing-budget-planning/resources/budget-planner.js  # demo (B2B SaaS, Series A, $3M)
node .agents/skills/marketing-budget-planning/resources/budget-planner.js '{"model":"b2b_saas","stage":"seed","fundingRaised":3000000,"runwayMonths":18,"growthTarget":"aggressive"}'
node .agents/skills/marketing-budget-planning/resources/budget-planner.js '{"model":"ecommerce","stage":"growth","annualRevenue":8000000,"pctOfRevenue":12}'
node .agents/skills/marketing-budget-planning/resources/budget-planner.js --help
```

It returns the planned share and where it comes from, the budget per period and per month, the reference points, and a split across functions (demand gen, content/SEO, brand, etc.), plus JSON with the sources.

## Interpret & connect

- Treat the band as **AAJ's starting estimate**, not an industry benchmark, then adjust for runway, payback tolerance, and how much demand actually exists to capture. Always say which basis the engine used.
- The **demand-gen / paid slice flows straight into the `paid-media-budget-allocation` skill** for the channel split.
- If LTV:CAC won't support the implied spend, fix economics or lower the budget before scaling.

## Present the result

Lead with the headline budget (share of the base, per period, per month) and its basis — AAJ band, your own figure, or the Gartner average — then the function split, then the affordability check against unit economics and the handoff to channel allocation.

## Guardrails & common mistakes

- **Bands and averages aren't targets.** AAJ's bands are estimates and the published figures are averages across very different companies — demand and economics decide.
- **Never present an AAJ band as third-party research.** Name it as AAJ's estimate, and cite the published figures by organisation and year.
- **Runway caps ambition.** Aggressive % with thin runway is a fast way to run out of money.
- **Spend follows ability to absorb it.** Doubling budget overnight wastes money if the funnel and team can't scale with it.
- **Total budget ≠ paid budget.** This sizes all marketing; only the demand-gen slice is paid media.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/marketing-budget-calculator
- Guide: https://aajconsult.com/blog/how-much-should-a-startup-spend-on-marketing

## Related skills

`unit-economics` (affordability) · `paid-media-budget-allocation` (split the paid slice) · `campaign-orchestrator` (the strategy the budget funds).

## Credits

Original AAJ skill. The Agent Skills format and Corey Haines' `coreyhaines31/marketingskills` (MIT) were references for structure and coverage; this skill is independently written. See the repository README.
