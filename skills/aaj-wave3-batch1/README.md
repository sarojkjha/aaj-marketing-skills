# AAJ Wave 3 — Batch 1 (Design depth)

The first three Wave 3 skills, written to the AAJ Skill Authoring Spec. Wave 3 fills the "decide the play" middle of the funnel — the thinnest gap now that Diagnose and Sales are covered.

| Skill | Phase | Category | Engine |
|---|---|---|---|
| `value-proposition` | Design | strategy-positioning | — |
| `messaging-framework` | Design | strategy-positioning | — |
| `pricing-and-packaging` | Design | strategy-positioning | ⚙ `price-packaging.js` |

- All three live in the existing `strategy-positioning` category — **no new category needed**, so they auto-appear after sync (no Lovable work).
- `pricing-and-packaging` ships a dependency-free, verified Node engine (blended ARPU, revenue mix, price ladder, sanity flags).
- `value-proposition` is the skill promoted from the spec's worked example.
- All `related` slugs resolve (these three, plus `positioning-statement`, `unit-economics`, `marketing-budget-planning`, `brand-product-context`).

## Deploy
Follow `aaj-skills-deploy-runbook.md`: drop these folders into `skills/`, run `sync-skills.mjs`, push, and verify the pages prerender. No category SQL and no Lovable prompt required for this batch.

## Still to come in Wave 3
`brand-voice-guide`, `channel-and-gtm-plan`, `campaign-brief`, `offer-and-lead-magnet-design`, `email-lifecycle-design`, and the research trio (`jobs-to-be-done`, `voice-of-customer-mining`, `competitor-teardown`).
