---
name: pricing-and-packaging
description: >-
  Use when the user wants to design or sanity-check pricing and packaging: the
  tiers, what goes in each, and the price points. Also use when the user mentions
  pricing, packaging, tiers, plans, price points, good-better-best, per-seat or
  usage pricing, an annual discount, a price increase, value metric, ARPU, MRR,
  or "how should we price this." Produces a packaging structure (tiers and what
  is in each), price points with rationale, modeled MRR, ARR, blended ARPU and
  revenue mix, and a what-if for a price change.
license: MIT
metadata:
  search_description: "Design pricing and packaging: tiers and what goes in each, price points, modeled MRR, ARPU and revenue mix, and a what-if for a price change."
  publisher: AAJ
  slug: pricing-and-packaging
  category: Strategy & Positioning
  phase: Design
  difficulty: Advanced
  card: >-
    Models tiers with seats, usage and annual billing, then tests a price change.
  version: 1.2.0
  sprint: unit-economics-retention
  topic: pricing-monetization
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: The ICP/segments and what each values, the differentiator, proof, rough willingness to pay, competitor pricing, and for each tier its price and customers, with seats, usage, the share who pay yearly and the cost to serve when you have them.
  outputs: A value metric, good-better-best tiers with prices, modeled MRR, ARR, blended ARPU and revenue mix, the price ladder and anchor check, gross margin when costs are given, a what-if for a price or mix change with its break-even, and the upgrade logic.
  related_aaj:
    - https://aajconsult.com/tools/pricing-arpu-modeler
    - https://aajconsult.com/playbooks/saas-pricing-packaging
  tags: [pricing, packaging, tiers, arpu, monetization]
---

# Pricing & Packaging

Design tiers that price to value and make the upgrade path obvious. Then model the revenue, so the structure is something you can defend, and test a price change before you make it.

## When to use

When setting prices for a new product or revisiting tiers that grew by accident, when packaging is unclear and buyers can't tell which plan is for them, when the team is discounting constantly or leaving money on the table, or when someone asks what a price increase would do.

## Before you start

1. **Read the brand/product context first.** Pull the ICP/segments and what each values, the differentiator, and proof from `.agents/product-marketing.md`. If positioning/value isn't settled, run `positioning-statement` and `value-proposition` first: price follows value.
2. **Gather inputs:** a rough sense of willingness to pay and what competitors charge (mark these `(assumption: confirm)` if estimated).
3. **Gather the numbers for each tier:** its monthly list price and how many customers are on it. When you have them, add the average seats a customer pays for, average usage revenue per customer, the share who pay yearly and the discount they get, and the cost to serve one customer for a month.
4. **Confirm the objective:** a defensible tier structure. (If the question is really "can we afford our CAC?", that's `unit-economics`.)

## Method

Price to value, not cost. Cost sets a floor, not the price. Pick the value metric that scales with the customer's value (seats, usage, outcomes), and let packaging follow it. Build good-better-best tiers where the most-wanted features drive upgrades and the top tier anchors the others. Then model the revenue, test the change you have in mind, and cross-check the ARPU against unit economics.

## Workflow

1. **Anchor on value, not cost.**
2. **Pick the value metric:** what scales with the customer's value.
3. **Design good-better-best tiers.** Put upgrade-driving features behind the right tiers and give the top tier a reason to exist.
4. **Set price points** with a sensible ladder, then **model with the engine** (see Run the tool).
5. **Test the change** with a scenario: the new price, the customers you expect to lose or win, and the customers you expect to change tier. Read the break-even before you decide.
6. **Cross-check the ARPU** against `unit-economics`: does it support CAC and payback?
7. **Pressure-test** the upgrade path and present.

## The framework

```
list price per customer = price x seats                (seats is 1 for a flat price)
revenue per customer    = list price x (1 - annual share x annual discount) + usage
tier MRR                = customers x revenue per customer
MRR                     = the sum of the tiers         ARR = MRR x 12
blended ARPU            = MRR / customers              with a free tier, also MRR / paying customers
revenue mix             = each tier's MRR as a share of the total
price ladder            = each tier's price against the tier below it
anchor                  = top tier / the second-highest tier
gross margin            = 1 - cost to serve / revenue  per tier, and across the tiers
floor for a target      = cost to serve / (1 - margin target)

a price rise breaks even while the tier loses no more than
    customers x (1 - revenue per customer today / revenue per customer after)
a price cut breaks even once the tier adds
    customers x (revenue per customer today / revenue per customer after - 1)
```

Two lines in the read-out are AAJ's rules of thumb, not published benchmarks: the anchor is called weak under 1.5x, and the mix is said to lift revenue when ARPU is 1.6x the entry tier or more. In AAJ's view a list holds together when the top tier anchors the others and most revenue comes from the middle and top, not the entry tier.

## Run the tool

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/pricing-and-packaging/resources/…` instead.

```bash
node .agents/skills/pricing-and-packaging/resources/price-packaging.js --demo              # worked example
node .agents/skills/pricing-and-packaging/resources/price-packaging.js '<json>'            # your input
node .agents/skills/pricing-and-packaging/resources/price-packaging.js --input=tiers.json  # or from a file
node .agents/skills/pricing-and-packaging/resources/price-packaging.js --help              # every field
```

Add `--json` for the result as JSON. The worked example is Example Co., a fictional company with invented numbers.

The smallest input is a name, a monthly price and a customer count for each tier:

```json
{ "tiers": [ { "name": "Starter", "price": 29, "customers": 600 },
             { "name": "Growth",  "price": 99, "customers": 300 } ] }
```

Everything else is optional. Give only what you have:

| Field | Where | What it means |
|---|---|---|
| `seats` | tier | Average seats a customer on the tier pays for. Giving it makes `price` a per-seat price. |
| `usage` | tier | Average usage revenue per customer per month, on top of the plan price. |
| `annualShare` | tier | Percent of the tier's customers who pay yearly. |
| `annualDiscount` | top level, or tier | Percent off the list price for paying yearly. A tier's own value replaces the top-level one. |
| `cost` | tier | Cost to serve one customer for a month. Gives gross margin. |
| `targetMargin` | top level | Your gross margin target. Each tier with a cost gets a floor: the least a customer must bring in. |
| `scenario` | top level | A change to test: new prices, customers who leave or join, and customers who change tier. |

A scenario looks like this. It raises one price, loses 20 customers on that tier, and moves 30 customers up from the tier below:

```json
"scenario": {
  "tiers": [ { "name": "Growth", "price": 119, "customerChange": -20 } ],
  "moves": [ { "from": "Starter", "to": "Growth", "customers": 30 } ]
}
```

Percentages are given as percentages: `20` for 20%, not `0.2`. The engine names every problem with the input in one run and stops. It does not guess.

It prints each tier's price, customers, revenue per customer, MRR, share of revenue and share of customers, then MRR, ARR, blended ARPU, the price ladder, the **anchor check**, gross margin when costs are given, and a read-out in sentences. With a scenario it adds MRR, ARR and ARPU before and after, and for each price change how many customers the tier can lose, or must add, to earn what it earns today. Use these exact numbers.

Designing pricing for a product with **no customers yet**? Enter your estimated mix as counts per 100 (`60` / `30` / `10`) and mark it as an assumption. MRR then reads per 100 customers.

> This is the same model that runs the public **Pricing & ARPU Modeler** (link below), so the agent and the web tool give the same numbers.

## Reference

The model and its input live in `resources/price-packaging.js`; `--help` prints every field. Value, differentiator, and segment willingness to pay come from `.agents/product-marketing.md`.

## Present the result

- The **value metric** the pricing scales on.
- The **tiers:** name, who each is for, what's in it, and price.
- **MRR, blended ARPU, revenue mix, the price ladder, and the anchor check** (from the engine), with the mix flagged as an estimate when it's based on projections.
- **The what-if**, when a change is on the table: MRR before and after, and the break-even for each price change. Say plainly that the customers lost or won are the user's estimate, not the engine's.
- The **upgrade logic:** why a buyer moves from one tier to the next.
- **Flags:** anything the model or the pressure-test surfaced (a weak anchor, revenue stuck in the entry tier, a tier that costs more to serve than it earns, a tier under the margin target).

**Show where it came from.** Open your answer with "AAJ `pricing-and-packaging` engine result:" and print the engine's output block exactly as it returned it, then add the line `Method: https://skills.aajconsult.com/skills/pricing-and-packaging`. Say the numbers come from the AAJ engine, not from the model. Put your interpretation under that block. Do not retype the figures from memory. If you could not run the engine, say so and label any numbers as your own estimate, not an AAJ result.

## Guardrails & common mistakes

- **Price to value, not cost.** Cost-plus pricing leaves money on the table and ignores what the buyer actually pays for. The margin floor is a check on a price, not a way to set one.
- **The value metric must scale with worth.** If it doesn't, customers feel nickel-and-dimed or under-charged.
- **A break-even is not a forecast.** The engine says how many customers a tier can lose before a price rise stops paying. It cannot say how many will leave. That number is yours, and it is the one to test.
- **A what-if treats every customer on a tier as average.** The customers who leave after a price rise may not be average ones, and customers who move tier bring their own seats and usage. Read the result as a first pass.
- **Cross-check ARPU against unit economics.** An ARPU that doesn't cover CAC and payback won't survive the market.
- **Mark the customer mix as an assumption.** When it's a projection, it's an estimate, not a forecast. Don't present modeled revenue as fact.

## Related AAJ resources

- **Pricing & ARPU Modeler** (free interactive tool): https://aajconsult.com/tools/pricing-arpu-modeler
- **SaaS Pricing & Packaging playbook:** https://aajconsult.com/playbooks/saas-pricing-packaging

## Related skills

`value-proposition`, `unit-economics`, `marketing-budget-planning`, `brand-product-context`

## Credits

Original AAJ skill. The Agent Skills format and the marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written. See the repository README for the full reference list.
