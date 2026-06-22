---
name: target-account-list
description: >-
  Use when the user wants to build or prioritize a target account list — which
  accounts to go after, scored by fit. Also use when the user mentions target
  accounts, ICP fit scoring, account prioritization, ABM list, named accounts,
  tiering accounts, lead scoring by firmographics, or "who should we sell to
  first." Produces a fit-scored, tiered account list (A/B/C) with the scoring
  rationale and the signals each account matched.
metadata:
  category: sales-pipeline
  phase: Design
  difficulty: Intermediate
  engine: resources/score-accounts.js
  tags: [target-accounts, icp-scoring, abm, account-tiering]
  related: [brand-product-context, sales-process-design, cold-email-sequence, persona-builder]
  tool: https://aajconsult.com/tools
---

# Target Account List

Score and tier accounts by how well they fit the ICP, so the team spends its time on the deals most likely to close.

## When to use this
- Building an outbound or ABM list.
- There are far more possible accounts than time to work them.
- Reps are chasing logos at random instead of by fit.

## When not to use this
- The ICP itself isn't defined → run `brand-product-context` (and `persona-builder` for depth) first. This scores *against* the ICP; it doesn't invent it.

## What you need
The ICP and its predictive signals from `brand-product-context` — the firmographic, technographic, and intent signals that separate good deals from bad — plus a list of candidate accounts carrying those attributes.

## Method
1. **Turn ICP criteria into weighted, checkable signals** (industry match, employee-count band, uses a complementary tool, recent funding, hiring for a relevant role).
2. **Weight by predictiveness** — how strongly each signal correlates with a good deal. Use `win-loss-analysis` evidence if you have it, not gut.
3. **Score with the engine** — it returns a 0–100 fit score and an A/B/C tier per account.
4. **Calibrate against known-good customers** — if great-fit logos score low, the weights are wrong; fix them and re-run.
5. **Route A-tier to outbound first;** for B-tier, note the single missing signal worth verifying.

## Run the engine
```bash
node resources/score-accounts.js --input=accounts.json
```
Runs a built-in demo set if `--input` is omitted. It prints each account's fit score, tier, and matched signals, plus the A/B/C tally. Use these exact scores and tiers in the Output — do not restate them from memory.

## Output
- The **scored, ranked account list** with tier (A/B/C) and the signals each account matched.
- The **weighting used**, so the list is auditable.
- The **A-tier count** and a one-line note on what separates B from A.

## Defensibility check
Confirm the weights are justified (ideally by win-loss evidence, not a hunch), your known-good customers land in A-tier, and every score traces to matched signals. A list that ranks your best customers low is wrong — recalibrate before shipping it.

## Go deeper
AAJ tools at https://aajconsult.com/tools. Feed A-tier accounts into `cold-email-sequence` and run them through `sales-process-design`.
