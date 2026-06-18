---
name: website-conversion-audit
description: >-
  Use when the user wants to audit a landing page, homepage, or website for
  conversion — clarity, calls to action, trust, friction, speed, and tracking.
  Also use when the user mentions CRO, conversion rate, "why isn't this page
  converting", landing page review, page teardown, or improving signups/leads.
  Produces a 0–100 conversion score across 6 weighted categories, a grade, and
  prioritized fixes.
license: MIT
metadata:
  publisher: AAJ
  slug: website-conversion-audit
  category: Conversion & Web
  phase: Diagnose
  difficulty: Starter
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: A URL or page content/screenshot, and what the page is meant to convert (signup, lead, purchase, demo)
  outputs: A 0–100 conversion score across Message, CTA, Trust, Friction, Speed, and Tracking, a grade, and a prioritized fix list
  related_aaj:
    - https://aajconsult.com/tools/website-grader
  tags: [cro, conversion, landing-page, audit, ux, trust, forms]
---

# Website Conversion Audit

Score how well a page turns visitors into action, then return a prioritized fix list. Most pages lose conversions to a handful of predictable leaks — unclear value, weak or competing CTAs, thin proof, and form friction — not to anything exotic.

## When to use

The user wants to know why a page underconverts, or wants a teardown of a landing page / homepage / signup flow.

## Before you start

1. **Read the brand/product context first** (`.agents/product-marketing.md` / `.agents/aaj-brand.md`) for audience and offer, if present.
2. **Establish the conversion goal** — what is this page supposed to make someone do? Score against that single goal.
3. **Get the page** — fetch the URL or work from the provided content/screenshot. Note device (judge mobile too).

## Workflow

1. **Evaluate the checks** in `resources/conversion-rubric.md`, recording `pass` / `partial` / `fail` for each across the six categories.
2. **Score it:**
   ```bash
   node resources/score.js '{"checks":{"clear_value_prop":"pass","primary_cta_visible":"partial", ...}}'
   node resources/score.js --help
   ```
   Returns category scores, a 0–100 total, a grade, and the failing items.
3. **Prioritize fixes** by leverage: clarity and CTA usually move the needle most, then trust and friction, then speed and tracking. A page can't be optimized if it isn't measured — flag missing conversion tracking.
4. **Present** the score, category breakdown, and an ordered fix list with the expected effect of each.

## Scoring model

Six weighted categories: **Message & Clarity 22 · Call to Action 20 · Trust & Proof 18 · Friction & Forms 16 · Speed & Mobile 14 · Conversion Tracking 10.** Each scores by pass-rate × weight. Grades: A ≥ 90, B 75–89, C 60–74, D 45–59, F < 45.

## Present the result

Lead with the score and grade, then the category bars, then the top fixes in priority order — concrete and specific ("the hero headline describes the product, not the outcome; rewrite to lead with the result"), not "improve copy."

## Guardrails & common mistakes

- **Judge against the page's one goal**, not generic best practice. A pricing page and a blog post convert differently.
- **Clarity beats cleverness.** The most common leak is a hero that doesn't say what it is, for whom, and why it's better.
- **One primary action.** Competing CTAs split intent and lower conversion.
- **Proof must be specific.** "Trusted by thousands" converts worse than a named result with a number.
- **Don't optimize blind.** Without conversion tracking you're guessing — fix that first.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/website-grader

## Related skills

`cro` and `signup` (deeper flow optimization) · `copywriting` (fix the message) · `ab-test-significance` (validate the fix) · `seo-geo-aeo-audit` (the visibility side).

## Credits

Original AAJ skill. The Agent Skills format and Corey Haines' `coreyhaines31/marketingskills` (MIT) were references for structure and coverage; this skill is independently written. See the repository README.
