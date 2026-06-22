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
metadata:
  category: sales-pipeline
  phase: Execute
  difficulty: Intermediate
  engine: resources/forecast.js
  tags: [forecast, pipeline-coverage, weighted-pipeline, quota]
  related: [sales-process-design, target-account-list, unit-economics, marketing-budget-planning]
  tool: https://aajconsult.com/tools
---

# Pipeline & Forecast

See whether the pipeline can actually hit the target — weighted forecast, coverage, the gap, and how much new pipeline to build.

## When to use this
- Forecasts are sandbagged or wishful and you want a grounded number.
- You need to know whether there's enough pipeline to make quota.
- Deciding whether to add pipeline or push the deals you have.
- Board or quota reporting.

## When not to use this
- Stages and probabilities aren't defined → run `sales-process-design` first; forecast quality depends on real stage probabilities.
- It's a unit-economics question (LTV, CAC, payback) → use `unit-economics`.

## What you need
The target/quota for the period, the open deals (amount + stage), the stage→probability mapping (from `sales-process-design` or historical conversion — not optimism), and the average win rate.

## Method
1. **Gather the target and the open pipeline** — deals with amount and stage.
2. **Apply stage→probability weights** from real historical conversion to get the weighted forecast.
3. **Compute coverage** = open pipeline ÷ target; the engine flags it against the ~1/win-rate benchmark.
4. **Compute the gap** = target − weighted forecast, and the **new pipeline needed** = gap ÷ win rate.
5. **Separate commit** (near-certain) from **best case** (everything open) so the number is honest.
6. **Name the lever** — build pipeline (coverage thin) vs. improve conversion (coverage fine but forecast short).

## Run the engine
```bash
node resources/forecast.js --input=pipeline.json
```
Runs a built-in demo if `--input` is omitted. It prints the weighted forecast, commit vs best case, coverage ratio with a healthy/thin flag, the gap to target, the new pipeline needed, and the recommended lever. Use these exact numbers in the Output — do not restate them from memory.

## Output
- **Weighted forecast**, with **commit vs best case.**
- **Coverage ratio** against target, with a healthy/thin flag.
- **Gap to target** and **new pipeline needed** at the current win rate.
- The **recommended lever** — build pipeline vs. improve conversion.

## Defensibility check
Confirm stage probabilities come from real conversion history (flag clearly if they're assumed), commit and best case are kept separate, and the coverage benchmark fits the win rate. A forecast built on optimistic probabilities is just a wish — mark assumed inputs as assumptions.

## Go deeper
AAJ tools at https://aajconsult.com/tools. Pair with `sales-process-design` (where your stage probabilities come from) and `unit-economics` (whether the pipeline is economically worth chasing).
