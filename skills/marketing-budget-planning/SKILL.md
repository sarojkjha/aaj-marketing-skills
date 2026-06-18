---
name: marketing-budget-planning
description: >-
  Use when the user wants to set or sanity-check a total marketing budget — how
  much to spend overall, as a percentage of revenue, by company stage and
  business model — and split it across brand, demand gen, content, and tooling.
  Also use when the user mentions marketing budget, % of revenue on marketing,
  how much should we spend on marketing, or budget allocation across functions.
  Produces a recommended budget and a function-level split.
license: MIT
metadata:
  publisher: AAJ
  slug: marketing-budget-planning
  category: Paid Media & Budgeting
  phase: Design
  difficulty: Starter
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: Business model, company stage, annual revenue, and growth ambition
  outputs: A recommended marketing budget (% of revenue, annual, monthly) and a split across functions
  related_aaj:
    - https://aajconsult.com/tools/marketing-budget-calculator
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

Marketing spend as a share of revenue is **highest early and falls as you scale** (you're buying growth and learning), and varies by model (SaaS and marketplaces spend more than services). Growth ambition flexes it up or down; runway caps it. This produces a budget; affordability is confirmed against unit economics.

## Run the engine

```bash
node resources/budget-planner.js                  # demo (B2B SaaS, Series A, $3M)
node resources/budget-planner.js '{"model":"ecommerce","stage":"growth","annualRevenue":8000000,"growthTarget":"aggressive"}'
node resources/budget-planner.js --help
```

It returns the recommended % of revenue, the annual and monthly budget, and a split across functions (demand gen, content/SEO, brand, etc.), plus JSON.

## Interpret & connect

- Treat the % as a **starting benchmark**, then adjust for runway, payback tolerance, and how much demand actually exists to capture.
- The **demand-gen / paid slice flows straight into the `paid-media-budget-allocation` skill** for the channel split.
- If LTV:CAC won't support the implied spend, fix economics or lower the budget before scaling.

## Present the result

Lead with the headline budget (% of revenue, $/yr, $/mo), then the function split, then the affordability check against unit economics and the handoff to channel allocation.

## Guardrails & common mistakes

- **Benchmarks aren't targets.** A % of revenue is a sanity check, not a mandate — demand and economics decide.
- **Runway caps ambition.** Aggressive % with thin runway is a fast way to run out of money.
- **Spend follows ability to absorb it.** Doubling budget overnight wastes money if the funnel and team can't scale with it.
- **Total budget ≠ paid budget.** This sizes all marketing; only the demand-gen slice is paid media.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/marketing-budget-calculator
- Guide: https://aajconsult.com/blog/how-much-should-a-startup-spend-on-marketing

## Related skills

`unit-economics` (affordability) · `paid-media-budget-allocation` (split the paid slice) · `marketing-plan` (the strategy the budget funds).

## Credits

Original AAJ skill. The Agent Skills format and Corey Haines' `coreyhaines31/marketingskills` (MIT) were references for structure and coverage; this skill is independently written. See the repository README.
