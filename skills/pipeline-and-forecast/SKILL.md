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
  publisher: AAJ
  slug: pipeline-and-forecast
  category: Sales & Pipeline
  phase: Execute
  difficulty: Intermediate
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: The target/quota, open deals (amount + stage), the stage-to-probability mapping, and the average win rate.
  outputs: A weighted forecast (commit vs best case), coverage ratio, gap to target, new pipeline needed, and the recommended lever.
  related_aaj:
    - https://aajconsult.com/tools
  tags: [forecast, pipeline-coverage, weighted-pipeline, quota]
---

# Pipeline & Forecast

See whether the pipeline can actually hit the target — weighted forecast, coverage, the gap, and how much new pipeline to build.

## When to use

When forecasts are sandbagged or wishful and you want a grounded number, when you need to know whether there's enough pipeline to make quota, when deciding whether to add pipeline or push the deals you have, or for board/quota reporting.

## Before you start

1. **Read the brand/product context first.** Pull any relevant goals/targets from `.agents/product-marketing.md`. If none exists, ask the user.
2. **Gather inputs:** the target/quota for the period, the open deals (amount + stage), the stage→probability mapping (from `sales-process-design` or historical conversion — not optimism), and the average win rate. If stages and probabilities aren't defined, run `sales-process-design` first.
3. **Confirm the objective:** a defensible number and the right lever to pull. (For LTV/CAC/payback questions, that's `unit-economics`.)

## Method

Weight open pipeline by real stage probabilities to get an expected forecast, then compare open pipeline to the target as a coverage ratio against the ~1/win-rate benchmark. Separate commit (near-certain) from best case (everything open) so the number is honest, and name the lever: build pipeline if coverage is thin, or improve conversion if coverage is fine but the forecast is short.

## Workflow

1. **Gather the target and the open pipeline** — deals with amount and stage.
2. **Apply stage→probability weights** from real conversion history to get the weighted forecast.
3. **Compute coverage** = open pipeline ÷ target (the engine flags it against ~1/win-rate).
4. **Compute the gap** and the new pipeline needed = gap ÷ win rate.
5. **Separate commit from best case.**
6. **Name the lever** and present the result.

## The framework

```
weighted forecast = Σ (deal amount × stage probability)
coverage          = open pipeline ÷ target
required coverage ≈ 1 ÷ win rate
gap               = target − weighted forecast
new pipeline need = gap ÷ win rate
commit = Σ amount for deals at prob ≥ 0.75   ·   best case = Σ amount (all open)
```

## Run the tool

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/pipeline-and-forecast/resources/…` instead.

```bash
node .agents/skills/pipeline-and-forecast/resources/forecast.js --input=pipeline.json
node .agents/skills/pipeline-and-forecast/resources/forecast.js  # built-in demo
```
Input JSON: `{ "target": 500000, "winRate": 0.25, "stageProbabilities": { "Proposal": 0.5, ... }, "deals": [ { "name": "Acme", "amount": 60000, "stage": "Proposal" } ] }`. It prints the weighted forecast, commit vs best case, coverage ratio with a healthy/thin flag, the gap, the new pipeline needed, and the recommended lever. Use these exact numbers — don't restate them from memory.

## Reference

The forecast engine and its input shape live in `resources/forecast.js`. Stage probabilities should come from `sales-process-design` or historical conversion data.

## Present the result

- **Weighted forecast**, with **commit vs best case.**
- **Coverage ratio** against target, with a healthy/thin flag.
- **Gap to target** and **new pipeline needed** at the current win rate.
- The **recommended lever** — build pipeline vs. improve conversion.

## Guardrails & common mistakes

- **Probabilities must come from real conversion history.** Flag clearly when they're assumed — an optimistic forecast is just a wish.
- **Keep commit and best case separate.** Reporting only the upside is how forecasts miss.
- **Fit the benchmark to the win rate.** A 3× coverage rule is wrong at a 10% win rate.
- **Mark assumed inputs as assumptions** so no one mistakes the model for a promise.

## Related AAJ resources

- AAJ tools — https://aajconsult.com/tools.

## Related skills

`sales-process-design` · `target-account-list` · `unit-economics` · `marketing-budget-planning`

## Credits

Original AAJ skill. The Agent Skills format and the marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written. See the repository README for the full reference list.
