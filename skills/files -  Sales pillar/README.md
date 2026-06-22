# AAJ Sales Pillar — Wave 2

Seven skills that take AAJ from marketing-only to **full-funnel Sales + Marketing** — the clearest differentiator for the library. Every skill is written to the **AAJ Skill Authoring Spec** (`aaj-skill-spec.md`) and composes onto the `brand-product-context` foundation.

## What's inside

A new category, **`sales-pipeline`** (Sales & Pipeline), and seven skills:

| Skill | Phase | Engine | What it does |
|---|---|---|---|
| `win-loss-analysis` | Diagnose | — | Turns deal outcomes into win/loss patterns and prioritized fixes. |
| `sales-process-design` | Design | — | Defines pipeline stages with verifiable exit criteria + qualification. |
| `target-account-list` | Design | ⚙ `score-accounts.js` | Fit-scores and tiers accounts (A/B/C) against the ICP. |
| `cold-email-sequence` | Execute | — | A 4–6 touch outbound sequence grounded in the prospect's pain. |
| `discovery-call-framework` | Execute | — | A discovery call flow + prioritized question bank that qualifies. |
| `objection-handling` | Design | — | Objection responses + honest competitor battlecards. |
| `pipeline-and-forecast` | Execute | ⚙ `forecast.js` | Weighted forecast, coverage ratio, gap, and new pipeline needed. |

The two engines are pure Node, dependency-free, deterministic, and verified (`node --check` + a sanity run).

## How the skills connect

They reference each other and the foundation, so the agent can chain them:
`win-loss-analysis` → `sales-process-design` + `objection-handling`; `brand-product-context` → `target-account-list` → `cold-email-sequence`; `sales-process-design` → `pipeline-and-forecast`. Every `related` slug resolves to a skill that exists (these seven, plus `brand-product-context`, `positioning-statement`, `persona-builder`, `unit-economics`, `marketing-budget-planning`).

## Install / deploy

1. **Add the category** — run `add-sales-category.sql` in Supabase (adjust column names to your `categories` table).
2. **Drop the skills in** — copy each folder under `skills/` into your repo's `skills/` directory:
   ```
   skills/win-loss-analysis/
   skills/sales-process-design/
   skills/target-account-list/        (+ resources/score-accounts.js)
   skills/cold-email-sequence/
   skills/discovery-call-framework/
   skills/objection-handling/
   skills/pipeline-and-forecast/       (+ resources/forecast.js)
   ```
3. **Sync to Supabase** — run your `sync-skills.mjs` so the seven skills appear on the site under Sales & Pipeline.
4. **Verify the engines** (optional):
   ```bash
   node skills/target-account-list/resources/score-accounts.js
   node skills/pipeline-and-forecast/resources/forecast.js
   ```
5. **Confirm the catalog prerenders** the new category and skills (the standing curl / View-Source check).

## Note on the taxonomy

`sales-pipeline` is the 9th category. Decide where it sits in the catalog order and whether any of the existing `growth-retention-revops` scope (it mentions "prospecting / sales enablement") should move under it now that Sales is its own pillar.
