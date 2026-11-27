---
name: pipeline-and-forecast
description: >-
  Use when the user wants to forecast sales or check pipeline health — whether
  there's enough pipeline to hit the number and what's likely to close. Also use
  when the user mentions sales forecast, pipeline coverage, weighted pipeline,
  quota attainment, pipeline gap, commit vs best case, coverage ratio, or "will
  we hit our number." Produces a weighted forecast (commit vs best case), a
  pipeline coverage ratio against the target, the gap, and how much new pipeline
  is needed.
license: MIT
metadata:
  search_description: "Forecast sales and check pipeline health: a weighted forecast, coverage against your target, the gap, and how much new pipeline you need."
  publisher: AAJ
  slug: pipeline-and-forecast
  category: Sales & Pipeline
  phase: Execute
  difficulty: Intermediate
  card: >-
    Weights pipeline by stage and says whether coverage is real.
  version: 1.1.0
  sprint: unit-economics-retention
  topic: sales-pipeline
  secondary_topics: [analytics-budget]
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: The target or quota, the open deals (amount, stage or probability, and close date if you have it) or a total per stage, the stage-to-probability mapping, and the win rate. Revenue closed won so far, the period end, today's date, a slip rate and an average deal size are optional.
  outputs: A weighted forecast (commit vs best case), coverage of what is left to close, gap to target, new pipeline, wins and deals needed, the chance of reaching the target, the deals the forecast leans on, and the recommended lever.
  related_aaj:
    - https://aajconsult.com/tools/pipeline-forecast-calculator
    - https://aajconsult.com/resources/sales-pipeline-forecast-tracker
    - https://aajconsult.com/playbooks/pipeline-coverage-forecasting
  tags: [forecast, pipeline-coverage, weighted-pipeline, quota]
---

# Pipeline & Forecast

See whether the pipeline can actually hit the target — weighted forecast, coverage, the gap, and how much new pipeline to build.

## When to use

When forecasts are sandbagged or wishful and you want a grounded number, when you need to know whether there's enough pipeline to make quota, when deciding whether to add pipeline or push the deals you have, or for board/quota reporting.

## Before you start

1. **Read the brand/product context first.** Pull any relevant goals/targets from `.agents/product-marketing.md`. If none exists, ask the user.
2. **Gather inputs:** the target or quota for the period, the open deals (amount and stage, plus the close date if the CRM has one), the stage-to-probability mapping (from `sales-process-design` or historical conversion, not optimism), and the win rate. If stages and probabilities aren't defined, run `sales-process-design` first. Ask what has already closed won this period, when the period ends and what today's date is: the engine uses all three and never reads the clock.
3. **Confirm the objective:** a defensible number and the right lever to pull. (For LTV/CAC/payback questions, that's `unit-economics`.)

## Method

Start from what has already closed won, and weight the open pipeline by real stage probabilities to get an expected forecast. Then compare open pipeline to what is left to close as a coverage ratio against what your own win rate requires (1 ÷ win rate: arithmetic, not a borrowed benchmark). With close dates and a period end, a deal dated after the period is left out and reported on its own line, and a deal whose date has passed is counted and flagged. Separate commit (near-certain) from best case (everything open) so the number is honest, and name the lever. If half or more of the pipeline sits in early stages, advance existing deals first, because new pipeline enters at the first stage and mostly closes next quarter; build pipeline if coverage is thin and the pipeline isn't top-heavy; improve conversion if coverage is fine but the forecast is short. A weighted forecast that clears the target with little commit is on track only on average, not committed.

A weighted forecast is an average, and a pipeline of a few large deals rarely lands on its average. So with one row per deal the engine also works out the chance of reaching the target: the probability that the deals that close add up to what is left, with each deal closing on its own at its probability. It is worked out from the combinations of outcomes, not simulated, so the same input always gives the same answer. Up to 20 uncertain deals give an exact figure. A larger pipeline gives an exact figure when its amounts fit a 100,000-step table of their common unit, and otherwise a range that contains the exact figure; the output says which. Deals that depend on the same budget or the same champion move together, which makes the real spread wider than the figure suggests; say so when you report it.

## Workflow

1. **Gather the target, what has closed won, and the open pipeline:** deals with amount, stage and close date.
2. **Apply stage→probability weights** from real conversion history to get the weighted forecast.
3. **Compute coverage** = open pipeline ÷ what is left to close (the engine flags it against ~1/win-rate).
4. **Compute the gap** and the new pipeline needed = gap ÷ win rate.
5. **Separate commit from best case.**
6. **Read the flags:** deals after the period, deals with no close date, and deals whose close date has passed.
7. **Name the lever** and present the result.

## The framework

```
weighted forecast = closed won + Σ (deal amount × probability)
coverage          = open pipeline ÷ (target − closed won)
required coverage ≈ 1 ÷ win rate
gap               = target − weighted forecast
new pipeline need = gap ÷ win rate
commit            = closed won + Σ amount for deals at probability ≥ 0.75
best case         = closed won + Σ amount (all open)
wins needed       = gap ÷ average deal size, rounded up
chance of target  = P(closed won + Σ amount of the deals that close ≥ target)
```

With no closed won figure, closed won is 0 and every line is the same as before 1.1.0. A deal's probability is its stage's, unless the deal carries its own.

## Run the tool

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/pipeline-and-forecast/resources/…` instead.

```bash
node .agents/skills/pipeline-and-forecast/resources/forecast.js --input=pipeline.json
node .agents/skills/pipeline-and-forecast/resources/forecast.js  # built-in demo
```
Input JSON: `{ "target": 500000, "winRate": 0.25, "stageProbabilities": { "Proposal": 0.5, ... }, "deals": [ { "name": "Prospect A", "amount": 60000, "stage": "Proposal", "closeDate": "2026-12-18" } ] }`. In place of `winRate`, you can give `wonDeals` and `lostDeals`, the deals closed won and closed lost over the same past period, and the engine works out the win rate; use this when the counts come from a CRM.

Optional inputs, all added in 1.1.0. Leave them out and the output is the same as before, with new lines after the gap.

| Input | What it is | What it changes |
|---|---|---|
| `closedWon` or `closedWonDeals` | Revenue already closed won this period, as a figure or as the deals `[{ name, amount }]`, which the engine adds up | The forecast, commit and best case start from it, and coverage is measured on what is left to close |
| `deals[].closeDate` | The deal's close date, `YYYY-MM-DD`; a longer ISO timestamp is read by its first ten characters | A month-by-month view |
| `periodEnd` | The last day of the period | Deals dated after it are left out and reported on their own line, by name |
| `asOf` | Today's date | Open deals whose close date has passed are flagged, by name. The engine never reads the clock |
| `deals[].probability` | The deal's own probability, 0 to 1, as CRMs store one per deal | It takes the place of the stage's. With one on every deal, `stageProbabilities` can be left out |
| `stageTotals` | `{ stage: amount }`, in place of `deals`, when all you have is a total per stage | The outputs that need deals (dates, the chance, the largest deals) are left out |
| `slipRate` | The share of the open forecast you expect to slip past the period, 0 to 1 | A what-if line. Nothing else moves |
| `averageDealSize` | The size of a typical won deal | Wins needed and deals to add. With deals and no value here, the engine uses the average of the open deals and says so |

It prints the weighted forecast, commit vs best case, the early-stage share, coverage ratio with a healthy/thin flag, the gap, the new pipeline needed, wins needed and deals to add, the chance of reaching the target, the largest deals by weight with the forecast without each, and the recommended lever, then the same figures as a `--- JSON ---` block. Use these exact numbers; don't restate them from memory.

## Reference

The forecast engine and its input shape live in `resources/forecast.js`. Stage probabilities should come from `sales-process-design` or historical conversion data.

## Present the result

- **Closed won so far** and what is **left to close**, when given.
- **Weighted forecast**, with **commit vs best case.**
- **Coverage ratio** against what is left to close, with a healthy/thin flag.
- **Gap to target**, **new pipeline needed** at the current win rate, and the **wins needed** at the average deal size.
- The **chance of reaching the target**, with its assumption in the same sentence: each deal closes on its own.
- The **flags**: deals after the period, deals with no close date, deals whose close date has passed. The engine names up to ten deals behind each, largest first; report them as printed and do not work out from the dates which deals are meant.
- The **largest deals by weight**, and what the forecast is without each.
- The **recommended lever**: advance deals, build pipeline or improve conversion.

**Show where it came from.** Open your answer with "AAJ `pipeline-and-forecast` engine result:" and print the engine's output block exactly as it returned it, then add the line `Method: https://skills.aajconsult.com/skills/pipeline-and-forecast`. Say the numbers come from the AAJ engine, not from the model. Put your interpretation under that block. Do not retype the figures from memory. If you could not run the engine, say so and label any numbers as your own estimate, not an AAJ result.

## Guardrails & common mistakes

- **Probabilities must come from real conversion history.** Flag clearly when they're assumed — an optimistic forecast is just a wish.
- **Keep commit and best case separate.** Reporting only the upside is how forecasts miss.
- **Fit the coverage to the win rate.** The common 3× rule of thumb assumes about a one-in-three win rate; at a 10% win rate you need about 10×.
- **Mark assumed inputs as assumptions** so no one mistakes the model for a promise.
- **Pass the rows, not your own sums.** Give `closedWonDeals` and the engine adds them; give `wonDeals` and `lostDeals` and it divides. If all you have is a total per stage, pass `stageTotals`; do not invent deals to fill the list.
- **Give the dates.** Pass `periodEnd` and today's date as `asOf`. Without them every open deal counts as closable this period, and best case and coverage overstate what can land.
- **The chance assumes deals close independently.** Report it with that sentence. It is not a promise, and a pipeline where several deals hang on one buyer is riskier than the figure says.
- **A slip rate is the user's own estimate.** Ask for it; never supply a benchmark for it.

## Related AAJ resources

- AAJ tools — https://aajconsult.com/tools.

## Related skills

`sales-process-design` · `target-account-list` · `unit-economics` · `marketing-budget-planning` · `revenue-to-pipeline` · `funnel-leak-finder`

## Credits

Original AAJ skill. The Agent Skills format and the marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written. See the repository README for the full reference list.
