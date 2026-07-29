---
name: target-account-list
description: >-
  Use when the user wants to build or prioritize a target account list — which
  accounts to go after, scored by fit. Also use when the user mentions target
  accounts, ICP fit scoring, account prioritization, ABM list, named accounts,
  tiering accounts, lead scoring by firmographics, or "who should we sell to
  first." Produces a fit-scored, tiered account list (A/B/C) with the scoring
  rationale and the signals each account matched.
license: MIT
metadata:
  publisher: AAJ
  slug: target-account-list
  category: Sales & Pipeline
  phase: Design
  difficulty: Intermediate
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: The ICP and its predictive signals, plus a list of candidate accounts carrying those attributes.
  outputs: A fit-scored, tiered (A/B/C) account list with matched signals and the weighting used.
  related_aaj:
    - https://aajconsult.com/tools
  tags: [target-accounts, icp-scoring, abm, account-tiering]
---

# Target Account List

Score and tier accounts by how well they fit the ICP, so the team spends its time on the deals most likely to close.

## When to use

When building an outbound or ABM list, when there are far more possible accounts than time to work them, or when reps are chasing logos at random instead of by fit.

## Before you start

1. **Read the brand/product context first.** Pull the ICP and its predictive signals — the firmographic, technographic, and intent signals that separate good deals from bad — from `.agents/product-marketing.md`. If the ICP isn't defined, run `brand-product-context` (and `persona-builder` for depth) first; this scores *against* the ICP, it doesn't invent it.
2. **Gather inputs:** a list of candidate accounts carrying those attributes.
3. **Confirm the objective:** a prioritized list the team can work top-down.

## Method

Turn the ICP's fit criteria into weighted, checkable signals, weight each by how strongly it predicts a good deal (use win-loss evidence where you have it, not gut), then score every account. Calibrate against known-good customers: if great-fit logos don't score as A-tier, the weights are wrong.

## Workflow

1. **Turn ICP criteria into weighted signals** (industry match, employee-count band, uses a complementary tool, recent funding, hiring for a relevant role).
2. **Weight by predictiveness**, using `win-loss-analysis` evidence if available.
3. **Score with the engine** (see Run the tool) — it returns a 0–100 fit score and an A/B/C tier per account.
4. **Calibrate against known-good customers**; fix the weights and re-run if they score low.
5. **Route A-tier to outbound first;** for B-tier, note the single missing signal worth verifying, and present the list.

## The framework

```
fit score = (sum of weights for matched signals / sum of all weights) × 100
tier: A ≥ 70   ·   B 40–69   ·   C < 40
weights should reflect predictiveness of a good deal (win-loss evidence > gut)
```

## Run the tool

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/target-account-list/resources/…` instead.

```bash
node .agents/skills/target-account-list/resources/score-accounts.js --input=accounts.json
node .agents/skills/target-account-list/resources/score-accounts.js  # built-in demo
```
Input JSON: `{ "weights": { "industryMatch": 30, ... }, "accounts": [ { "name": "Acme", "signals": { "industryMatch": true, ... } } ] }`. It prints each account's fit score, tier, and matched signals, plus the A/B/C tally. Use these exact scores and tiers — don't restate them from memory.

## Reference

The scoring engine and its input shape live in `resources/score-accounts.js`. Account attributes and the ICP signal set come from `.agents/product-marketing.md` and the user's data.

## Present the result

- The **scored, ranked account list** with tier (A/B/C) and the signals each account matched.
- The **weighting used**, so the list is auditable.
- The **A-tier count** and a one-line note on what separates B from A.

## Guardrails & common mistakes

- **Justify the weights.** Ideally from win-loss evidence, not a hunch — unjustified weights produce a confident but wrong list.
- **Calibrate against reality.** If your best existing customers don't land in A-tier, the model is wrong; recalibrate before shipping.
- **Every score must trace to matched signals** — no black-box numbers.
- **Don't invent account data.** Score only on attributes you actually have; mark unknowns rather than assuming.

## Related AAJ resources

- AAJ tools — https://aajconsult.com/tools.

## Related skills

`brand-product-context` · `sales-process-design` · `cold-email-sequence` · `persona-builder`

## Credits

Original AAJ skill. The Agent Skills format and the marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written. See the repository README for the full reference list.
