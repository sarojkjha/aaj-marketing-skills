---
name: unit-economics
description: >-
  Use when the user wants to calculate or sanity-check unit economics — LTV,
  CAC, the LTV:CAC ratio, and CAC payback — for a subscription, ecommerce, or
  services business. Also use when the user mentions lifetime value, customer
  acquisition cost, payback period, churn, contribution margin, or "are our
  unit economics healthy / can we afford to spend more." Produces the metrics
  plus a verdict against healthy benchmarks and what to fix.
license: MIT
metadata:
  publisher: AAJ
  slug: unit-economics
  category: Analytics & Experimentation
  phase: Diagnose
  difficulty: Starter
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: Business model, revenue per customer (ARPA/ACV/AOV), gross margin, retention or churn, and CAC (or ad spend + customers)
  outputs: LTV, CAC, LTV:CAC, CAC payback, and a verdict against the 3:1 and payback benchmarks
  related_aaj:
    - https://aajconsult.com/tools/unit-economics-calculator
  related: [paid-media-budget-allocation, marketing-budget-planning]
  tags: [unit-economics, ltv, cac, ltv-cac, payback, churn, saas-metrics]
---

# Unit Economics & LTV:CAC

Establish whether a business can profitably acquire customers — the foundation under every budget and growth decision. Get **LTV**, **LTV:CAC**, and **CAC payback**, then judge them against healthy ranges. This is usually the first thing to run before any paid-media or budget work.

## When to use

The user needs to compute or validate unit economics, set a CAC ceiling, or answer "can we afford to spend more?"

## Before you start

1. **Read the brand/product context first** (`.agents/product-marketing.md` / `.agents/aaj-brand.md`) for model and pricing, if present.
2. **Gather inputs for the model:**
   - **Subscription:** monthly revenue per account (ARPA), gross margin %, monthly churn % (or average lifetime in months), and CAC.
   - **Ecommerce:** average order value, gross margin %, orders per year, retention in years, and CAC.
   - **Services / contract:** average contract value, gross margin %, retention in years, and CAC.
   - If CAC isn't known, supply ad spend and customers acquired to derive blended CAC.

## The math

```
Subscription:  LTV = (ARPA_monthly × grossMargin%) ÷ monthlyChurn%
               CAC payback (months) = CAC ÷ (ARPA_monthly × grossMargin%)
Ecommerce:     LTV = AOV × grossMargin% × ordersPerYear × retentionYears
Services:      LTV = ACV × grossMargin% × retentionYears
Everywhere:    LTV:CAC = LTV ÷ CAC
```

Always use **gross-margin** LTV (revenue × margin), not revenue LTV — revenue you don't keep can't pay back acquisition.

## Run the engine

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/unit-economics/resources/…` instead.

```bash
node .agents/skills/unit-economics/resources/unit-economics.js  # demo (subscription)
node .agents/skills/unit-economics/resources/unit-economics.js '{"model":"ecommerce","aov":80,"grossMargin":60,"ordersPerYear":3,"retentionYears":2,"cac":40}'
node .agents/skills/unit-economics/resources/unit-economics.js --help
```

It prints LTV, LTV:CAC, payback, and a verdict, plus a JSON block.

## Interpret the result

- **LTV:CAC ≥ 3:1** is the healthy floor. Below 3:1, acquisition is inefficient — fix economics before scaling spend. **At 5:1+ you may be under-investing** — if demand exists, you can likely spend more to grow faster.
- **CAC payback:** under ~12 months is the common B2B guideline; under ~6 months for ecommerce. Longer payback ties up cash — watch burn.
- The biggest LTV levers are usually **retention/churn and margin**, not ARPA. A small churn improvement compounds through LTV.

## Present the result

Lead with the three numbers (LTV, LTV:CAC, payback), then the verdict, then the one or two highest-leverage fixes. State that LTV is gross-margin based.

## Guardrails & common mistakes

- **Use gross-margin LTV**, never revenue LTV.
- **Be honest about churn.** Early-stage churn estimates are often optimistic; if unsure, model a range.
- **Blended vs paid CAC.** Blended CAC (all new customers ÷ all S&M) flatters paid efficiency; for channel decisions use paid CAC. Say which you used.
- **Don't over-trust a single ratio.** A healthy LTV:CAC with 24-month payback can still strain a cash-tight business.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/unit-economics-calculator

## Related skills

`paid-media-budget-allocation` (uses the CAC ceiling this produces) · `marketing-budget-planning` · `churn-prevention` (the biggest LTV lever).

## Credits

Original AAJ skill. The Agent Skills format and the marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written. See the repository README for the full reference list.
