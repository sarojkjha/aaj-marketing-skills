---
name: ab-test-significance
description: >-
  Use when the user wants to check whether an A/B test result is statistically
  significant, or to size a test before running it. Also use when the user
  mentions A/B test, split test, statistical significance, p-value, confidence
  level, conversion lift, sample size, or "is this result real / can we call
  the test." Produces lift, p-value, a significance verdict, and required
  sample size.
license: MIT
metadata:
  publisher: AAJ
  slug: ab-test-significance
  category: Analytics & Experimentation
  phase: Execute
  difficulty: Starter
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: Visitors and conversions for control and variant (to evaluate) OR baseline rate and minimum detectable effect (to size a test)
  outputs: Conversion rates, relative lift, p-value, significance verdict, confidence interval, and required sample size
  related_aaj:
    - https://aajconsult.com/tools/ab-test-significance-calculator
  related: [website-conversion-audit, paid-media-budget-allocation]
  tags: [ab-testing, significance, p-value, sample-size, cro, experimentation]
---

# A/B Test Design & Significance

Tell the user whether a test result is **real or noise**, and how big a test needs to be before it can answer the question. Most teams call tests too early on too little data; this keeps the decision honest with a proper two-proportion z-test.

## When to use

The user has an A/B test result to evaluate, or wants to size a test before launching it.

## Workflow

**To evaluate a result:** gather visitors and conversions for control and variant, pick a confidence level (usually 95%), and run the engine. **To plan a test:** take the baseline conversion rate and the minimum lift worth detecting (the MDE), and compute the required sample size.

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/ab-test-significance/resources/…` instead.

```bash
node .agents/skills/ab-test-significance/resources/significance.js  # demo (5.0% vs 6.2%)
node .agents/skills/ab-test-significance/resources/significance.js '{"control":{"visitors":4000,"conversions":200},"variant":{"visitors":4050,"conversions":250},"confidence":95}'
node .agents/skills/ab-test-significance/resources/significance.js '{"plan":true,"baselineRate":5,"mde":1,"confidence":95,"power":80}'  # sample size
node .agents/skills/ab-test-significance/resources/significance.js --help
```

It returns rates, relative and absolute lift, z and p, a significance verdict at your confidence level, a confidence interval on the difference, or — in plan mode — the visitors needed per variant.

## Interpret the result

- **Significant** (p < 1 − confidence) means the difference is unlikely to be chance at that level — the winner is real. **Not significant** means keep running or treat as no detected difference; it does **not** prove the variants are equal.
- **Size the test first.** If the required sample (plan mode) is far above your traffic, the test can't realistically resolve that small a lift — pick a bigger change or a longer window.
- A confidence interval that crosses zero means the direction itself isn't settled.

## Guardrails & common mistakes

- **Don't peek and stop early.** Calling a test the moment it crosses significance inflates false positives; decide the sample size up front and run to it.
- **Significance ≠ importance.** A tiny, significant lift may not be worth shipping; weigh the effect size.
- **One metric, pre-declared.** Testing many metrics until one is significant is p-hacking.
- **Mind the cycle.** Run at least one full business cycle (e.g., a week) to avoid day-of-week skew.
- **Conversions, not clicks.** Test toward the real outcome, not a proxy.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/ab-test-significance-calculator

## Related skills

`website-conversion-audit` (find what to test) · `cro` (generate hypotheses) · `analytics-tracking` (measure correctly).

## Credits

Original AAJ skill. The Agent Skills format and Corey Haines' `coreyhaines31/marketingskills` (MIT) were references for structure and coverage; this skill is independently written. See the repository README.
