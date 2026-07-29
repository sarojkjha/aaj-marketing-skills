---
name: lifecycle-and-retention
description: >-
  Use when the user wants to reduce churn, improve retention, or grow net
  revenue retention (NRR) through onboarding, lifecycle communication, and
  account expansion. Also use when the user mentions churn, retention, NRR/GRR,
  net dollar retention, activation, onboarding, customer lifecycle,
  upsell/expansion, or "why are customers leaving / how do we keep them."
  Produces churn, NRR, GRR, quick-ratio and lifetime math plus a diagnosis and a
  prioritized retention plan across onboarding, churn drivers, and expansion.
license: MIT
metadata:
  publisher: AAJ
  slug: lifecycle-and-retention
  category: Retention & Lifecycle
  phase: Design
  difficulty: Intermediate
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: One period of revenue movement (starting recurring revenue, new, expansion, contraction, churned), customer counts, and where available the top churn reasons, the activation milestone, and the current onboarding steps
  outputs: NRR, GRR, revenue & logo churn, quick ratio, average lifetime, the LTV impact of a churn change, and a prioritized retention plan across onboarding, churn drivers, and expansion
  related_aaj:
    - https://aajconsult.com/tools/churn-nrr-calculator
  related: [unit-economics, pricing-and-packaging, customer-survey-design]
  tags: [retention, churn, nrr, grr, net-revenue-retention, onboarding, lifecycle, expansion, saas-metrics]
---

# Lifecycle & Retention

Keep and grow the customers you already have — the highest-leverage, most overlooked part of early-stage growth. Because lifetime value is proportional to `1 / churn`, retention usually moves LTV more than pricing or acquisition. Measure **NRR**, **GRR**, churn and the **quick ratio**, diagnose where the base leaks, then design the onboarding, lifecycle, and expansion motions that make the base compound.

## When to use

The user needs to cut churn, lift net revenue retention, design onboarding/activation, build an expansion (upsell) motion, or answer "why are customers leaving and how do we keep them?" Run this after `unit-economics` — retention is the biggest lever inside that LTV.

## Before you start

1. **Read the brand/product context first** (`.agents/product-marketing.md` / `.agents/aaj-brand.md`) for model, pricing, and ICP, if present.
2. **Gather inputs:**
   - **Movement for one period** (monthly for month-to-month or usage products; annual for annual contracts): starting recurring revenue, and the period's **new**, **expansion**, **contraction**, and **churned** revenue.
   - **Customer counts** at start and lost in the period (for logo churn and lifetime).
   - Where available: the **top churn reasons**, the product's **activation milestone** ("aha" / first value), and the current **onboarding steps**. These turn the numbers into a plan.

## The math

```
Gross revenue churn = (contraction + churned) / startingRevenue
Net revenue churn   = (contraction + churned − expansion) / startingRevenue
GRR = 1 − gross revenue churn          (never exceeds 100%)
NRR = 1 − net revenue churn            (exceeds 100% when expansion > churn)
Logo churn = customers lost / customers at start
Quick ratio = (new + expansion) / (contraction + churned)
Avg lifetime (periods) = 1 / churn     → LTV is proportional to 1 / churn
```

Measure NRR and GRR on the **existing base only** — exclude new business (it belongs to acquisition, and only inflates the quick ratio). Use logo churn for customer lifetime; use revenue churn for revenue retention.

## Run the engine

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/lifecycle-and-retention/resources/…` instead.

```bash
node .agents/skills/lifecycle-and-retention/resources/retention.js  # demo
node .agents/skills/lifecycle-and-retention/resources/retention.js '{"period":"monthly","startMRR":100000,"newMRR":12000,"expansionMRR":8000,"contractionMRR":3000,"churnedMRR":6000,"startCustomers":200,"churnedCustomers":9}'
node .agents/skills/lifecycle-and-retention/resources/retention.js '{"period":"annual","startMRR":1000000,"expansionMRR":50000,"contractionMRR":120000,"churnedMRR":180000}'
node .agents/skills/lifecycle-and-retention/resources/retention.js --help
```

It prints NRR, GRR, revenue & logo churn, quick ratio, average lifetime, and the LTV impact of a churn change, plus a JSON block.

## Interpret the result

Benchmarks are thresholds, not medians — read yours against your **own segment** (SMB retention runs lower; enterprise higher) and the latest published survey:

- **NRR** above **100%** grows the base without a single new logo; roughly **120%+** is best-in-class (Bessemer cloud benchmarks). Below 100%, new sales run just to stand still.
- **GRR** of **90%+** is strong; below ~80% is a leaky base that no amount of acquisition fixes cheaply.
- **Quick ratio ≥ 4** signals efficient growth (the SaaS Quick Ratio popularized by Social Capital / Mamoon Hamid).
- **Retention is the biggest LTV lever.** Since `LTV ∝ 1/churn`, halving churn roughly doubles lifetime and LTV — usually a bigger move than a price or ARPA change.

Watch a trap: **high NRR can hide heavy logo churn** masked by a few big expansions. Always read GRR and logo churn alongside NRR.

Sources for the thresholds above: Bessemer Venture Partners (State of the Cloud / cloud benchmarks), KeyBanc Capital Markets (KBCM SaaS Survey), SaaS Capital retention research, Social Capital (SaaS Quick Ratio), and ChartMogul/Recurly churn benchmarks for segment ranges. Cite the current year's figures when presenting to a client.

## Design the fixes

Turn the diagnosis into a prioritized plan across three levers:

- **Onboarding & activation.** Define first value and the activation milestone, then remove time-to-value friction. Poor activation is the root of most early churn — customers who never reach value never stay.
- **Churn drivers.** Split **voluntary** (value/fit/price) from **involuntary** (failed payments — often 20–40% of churn and the cheapest to fix with dunning and card-update flows). Use exit surveys to rank reasons (`customer-survey-design` helps design them).
- **Lifecycle communication.** Map the sequence — welcome → activation nudge → habit/value reinforcement → renewal → win-back — and trigger on behavior, not just time.
- **Expansion.** Build the motion that pushes NRR above 100%: usage-based upgrades, seat expansion, cross-sell, and packaging that leaves room to grow (`pricing-and-packaging`).

## Present the result

Lead with the three numbers (NRR, GRR, quick ratio) and the verdict, then the **one or two highest-leverage retention moves** — usually activation or involuntary-churn first, expansion second. Show the LTV impact of the churn improvement so the prize is sized before any investment.

## Guardrails & common mistakes

- **Measure on the existing base.** Excluding new business is what makes NRR/GRR meaningful.
- **Don't confuse revenue and logo churn.** A product can retain dollars (via expansion) while bleeding logos — read both.
- **High NRR ≠ healthy** if GRR is weak. Expansion can paper over a leaky base.
- **Fix involuntary churn first.** Failed payments are often the largest, cheapest win.
- **Retention before acquisition** when the base leaks — pouring traffic into a leaky funnel just raises CAC.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/churn-nrr-calculator

## Related skills

`unit-economics` (the LTV this retention drives) · `pricing-and-packaging` (expansion and packaging for NRR) · `customer-survey-design` (churn-reason and activation research).

## Credits

Original AAJ skill. The Agent Skills format and the marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written. See the repository README for the full reference list.
