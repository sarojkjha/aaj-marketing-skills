---
name: pricing-and-packaging
description: >-
  Use when the user wants to design or sanity-check pricing and packaging — the
  tiers, what's in each, and the price points. Also use when the user mentions
  pricing, packaging, tiers, plans, price points, good-better-best, pricing
  model, value metric, ARPU, or "how should we price this." Produces a packaging
  structure (tiers and what's in each), price points with rationale, and a
  modeled blended ARPU and revenue mix.
metadata:
  category: strategy-positioning
  phase: Design
  difficulty: Advanced
  engine: resources/price-packaging.js
  tags: [pricing, packaging, tiers, arpu, monetization]
  related: [value-proposition, unit-economics, marketing-budget-planning, brand-product-context]
  tool: https://aajconsult.com/tools
---

# Pricing & Packaging

Design tiers that price to value and make the upgrade path obvious — then model the ARPU so the structure is something you can defend.

## When to use this
- Setting prices for a new product, or revisiting tiers that grew by accident.
- Packaging is unclear — buyers can't tell which plan is for them.
- The team is discounting constantly, or leaving money on the table.

## When not to use this
- The question is really unit economics (can we afford our CAC?) → use `unit-economics`.
- Positioning/value isn't settled → run `positioning-statement` and `value-proposition` first; price follows value.

## What you need
Pull from `brand-product-context`: the ICP/segments and what each values, the differentiator, and the proof. You'll also need a rough sense of willingness to pay and what competitors charge (mark these `(assumption — confirm)` if estimated). Price to value, never to cost.

## Method
1. **Anchor on value, not cost.** Start from what the outcome is worth to the buyer and what they'd pay; cost sets a floor, not the price.
2. **Pick the value metric** — the thing that scales with the customer's value (seats, usage, outcomes, revenue). Packaging follows the metric.
3. **Design good-better-best tiers.** Put the most-wanted features behind the tiers that drive upgrades; give the top tier a reason to exist so it anchors the others.
4. **Set price points** with a sensible ladder, then **model it with the engine** — blended ARPU, revenue mix, and the price ladder.
5. **Cross-check the economics.** Run the ARPU against `unit-economics` — does it support your CAC and payback? If not, the packaging or the price is wrong.
6. **Pressure-test.** Is the upgrade path obvious? Does the top tier anchor? Is there a clear reason to move up a tier? Fix whatever fails.

## Run the engine
```bash
node resources/price-packaging.js --input=tiers.json
```
Runs a built-in demo if `--input` is omitted. It prints each tier's price, mix, revenue share, and price ladder, plus the **blended ARPU** and sanity flags (does mix sum to 100, does the top tier anchor). Use these exact numbers in the Output — and mark the mix as an assumption, since it's an estimate.

## Output
- The **value metric** the pricing scales on.
- The **tiers** — name, who each is for, what's in it, and price.
- **Blended ARPU and revenue mix** (from the engine), with the mix flagged as an estimate.
- The **upgrade logic** — why a buyer moves from one tier to the next.
- **Flags** — anything the model or the pressure-test surfaced.

## Defensibility check
Confirm pricing is anchored to value (not cost), the value metric scales with what the customer gets, the modeled ARPU supports the economics (cross-checked against `unit-economics`), and the customer-mix is clearly marked as an assumption. Pricing built from cost-plus or an ARPU that doesn't cover CAC won't survive contact with the market — flag it.

## Go deeper
AAJ pricing and strategy tools at https://aajconsult.com/tools. Pair with `value-proposition` (price follows value) and `unit-economics` (can the ARPU carry the model).
