---
name: paid-media-budget-allocation
description: >-
  Use when the user wants to plan, split, or optimize a paid advertising budget
  across channels (Google, Microsoft, LinkedIn, Meta, TikTok, YouTube, Amazon,
  Capterra/G2, and more) to hit a CAC target or a customer goal. Also use when
  the user mentions ad budget allocation, channel mix, media plan, paid spend
  split, CAC target, marginal CAC, diminishing returns, or "how should I split
  my ad spend." Produces a defensible per-channel allocation with projected
  customers, blended CAC, LTV:CAC, payback, and pacing.
license: MIT
metadata:
  publisher: AAJ
  slug: paid-media-budget-allocation
  category: Paid Media & Budgeting
  phase: Design
  difficulty: Intermediate
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: Business model, monthly budget OR CAC target OR customer goal, LTV, and per-channel CPC / click-to-lead % / lead-to-customer % (or cost-per-lead for directories)
  outputs: A per-channel budget split with projected customers, blended CAC, LTV:CAC, ROAS, payback, and weekly/daily pacing
  related_aaj:
    - https://aajconsult.com/tools/paid-media-budget-allocator
    - https://aajconsult.com/blog/how-to-allocate-paid-ads-budget
  related: [unit-economics, marketing-budget-planning, ab-test-significance]
  tags: [paid-media, ppc, budget, cac, channel-mix, media-planning, ltv-cac]
---

# Paid Media Budget Allocation

Allocate a paid advertising budget across channels by **cost per customer**, not gut feel — funding each channel until the cost of its *next* customer reaches the target, so the marginal cost of a customer is roughly equal everywhere. This is the most customers a given budget can buy.

## Before you start

1. **Read the brand/product context first.** If a context file exists (e.g. `.agents/product-marketing.md`, `.agents/aaj-brand.md`, or similar), read it for the product, audience, pricing, and positioning. If none exists, ask the user for the essentials below before allocating.
2. **Establish the unit economics.** You need: business model (B2B SaaS / ecommerce / local-services / marketplace), average contract or order value, gross margin, and gross-margin **LTV** per customer. If LTV is unknown, help the user estimate it (or invoke the `unit-economics` skill) before continuing.
3. **Confirm the objective** — one of: a fixed **monthly budget**, a **CAC target**, or a **customer goal**.

## Method

1. **Set the CAC ceiling from LTV.** A healthy LTV:CAC ratio is **≥ 3:1**. Work backwards: ceiling ≈ LTV ÷ 3. This is the most you should pay per customer from ads (blended). Note this is *paid-media* CAC; fully-loaded CAC is higher.
2. **Pick the channel set for the model.** Don't run every channel — pick the 3–5 where the buyer actually researches and purchases. See `resources/channel-benchmarks.md` for the default set per model.
3. **Get a base CAC per channel** from the funnel inputs (formula below). This is the cost per customer at efficient, modest spend.
4. **Allocate against diminishing returns.** Each channel gets more expensive as you scale (you exhaust the best-matched audience), so the cheapest channel is *not* where all the budget goes. Fund each channel until the cost of its next customer hits the target, then stop. Channels whose first customer already costs more than the target drop out — correctly.
5. **Present the split** with projected customers, blended CAC, LTV:CAC, ROAS, payback, and pacing, plus guardrails.

## The math

For each channel:

```
Cost per lead (CPL)   = CPC ÷ (click→lead %)
Base CAC              = CPL ÷ (lead→customer %)
  · Pay-per-lead channels (Capterra/G2): CPL is a direct input, so Base CAC = CPL ÷ (lead→customer %)

Saturation (diminishing returns), with cap = scale headroom, DR = aggressiveness:
  customers(spend)    = (cap / (BaseCAC · DR)) · ln(1 + DR · spend / cap)
  marginalCAC(spend)  = BaseCAC · (1 + DR · spend / cap)        # cost of the NEXT customer
  spendForMarginal(λ) = 0 if λ ≤ BaseCAC, else (cap / DR) · (λ / BaseCAC − 1)
```

Allocation by objective:
- **Budget:** binary-search a single marginal-CAC level λ so the sum of `spendForMarginal(λ)` across channels equals the budget (water-filling).
- **CAC target T:** set each channel's spend to `spendForMarginal(T)`.
- **Customer goal G:** binary-search λ so total customers equal G.

DR presets: **gentle 0.4 · moderate 0.8 (default) · aggressive 1.5.**

## Run the engine (preferred in a coding agent)

Don't approximate the water-filling by hand — run the bundled engine for exact numbers.

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/paid-media-budget-allocation/resources/…` instead.

```bash
# Demo: B2B SaaS, $30k budget
node .agents/skills/paid-media-budget-allocation/resources/allocation-engine.js

# Custom — pass a JSON config
node .agents/skills/paid-media-budget-allocation/resources/allocation-engine.js '{"model":"saas","mode":"budget","budget":30000,"diminishingReturns":"moderate","channels":[{"key":"capterra","model":"cpl","cpl":90,"l2c":22,"cap":8000}]}'

# Schema and channel keys
node .agents/skills/paid-media-budget-allocation/resources/allocation-engine.js --help
```

The engine prints a per-channel table plus a JSON block you can parse. Always seed the per-channel inputs with the user's own account data where they have it; the benchmarks are only a starting point.

## Channel benchmarks

Starting CPC / conversion / close-rate defaults and the default channel set per business model are in `resources/channel-benchmarks.md`. Treat them as calibration, not truth — a client's real numbers move the answer far more than any benchmark.

## Present the result

Use the format in `resources/output-format.md`: the split (channel, $, %, customers, CAC), the blended summary (customers, CAC, LTV:CAC, ROAS, payback), weekly/daily pacing, and a short "what this means" with guardrails.

## Guardrails & common mistakes

- **Optimize on customers/revenue, not cost-per-lead.** Cheap leads that never close are the most expensive thing in paid media.
- **Don't pour everything into the cheapest channel** — average CAC hides diminishing returns; the next customer there may already cost more than elsewhere.
- **Right-size the channel count.** Three to five channels funded above their learning minimums beat many channels starved of budget. If two or more channels would get under ~$1,500/mo, recommend consolidating (the engine flags this).
- **Mind attribution and lag.** In B2B, deals close weeks after the click — track ROAS to 90 days and year one, not month one.
- **Rebalance monthly, not daily.** Large budget swings reset platform learning; give a change two to four weeks.
- **Be explicit that this is paid-media CAC.** Fully-loaded CAC (salaries, tools, content) is higher, so LTV:CAC and payback here reflect ad efficiency only.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/paid-media-budget-allocator
- Full method (the "why"): https://aajconsult.com/blog/how-to-allocate-paid-ads-budget

## Related skills

`unit-economics` (LTV and the CAC ceiling) · `marketing-budget-planning` (how much to spend in total) · `ab-test-significance` (prove a channel's lift before scaling) · `analytics-tracking` (measure customers, not form fills).

## Credits

Original AAJ skill. The Agent Skills format and the broader marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written and grounded in AAJ's own tool and methodology. See the repository README for the full reference list.
