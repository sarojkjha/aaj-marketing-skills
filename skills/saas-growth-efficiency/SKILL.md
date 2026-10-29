---
name: saas-growth-efficiency
description: >-
  Use when the user wants to know how efficiently a SaaS company turns spend
  into growth - for a board deck, an investor update, a fundraise or a budget
  decision. Also use when the user mentions magic number, burn multiple, Rule
  of 40, CAC payback, sales efficiency, capital efficiency, "what will
  investors ask", or "are we growing efficiently". Computes the four numbers
  from figures the founder already has, reads each against what its
  originator actually wrote with the source linked, and says which to fix
  first.
license: MIT
metadata:
  publisher: AAJ
  slug: saas-growth-efficiency
  category: Analytics & Experimentation
  phase: Diagnose
  difficulty: Intermediate
  card: >-
    Magic number, burn multiple, Rule of 40 and CAC payback, each read against
    its originator's own words.
  version: 1.0.0
  topic: analytics-budget
  secondary_topics: [gtm-growth-planning, pricing-monetization]
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: One quarter's recurring revenue and the quarter before, last quarter's sales and marketing expense, this quarter's net burn and net new ARR, gross margin, and the last 12 months' revenue growth and profit margin; optionally stage and customer segment
  outputs: Magic number, burn multiple, Rule of 40 and CAC payback, each with its originator's reading and a link; which to fix first; which metrics could not be computed and what they need
  related_aaj:
    - https://aajconsult.com/tools/saas-growth-efficiency-calculator
    - https://aajconsult.com/tools/unit-economics-calculator
    - https://aajconsult.com/tools/marketing-kpi-report
  related: [unit-economics, marketing-report, marketing-budget-planning, pipeline-and-forecast, lifecycle-and-retention]
  tags: [magic-number, burn-multiple, rule-of-40, cac-payback, saas-metrics, capital-efficiency, board-reporting]
---

# SaaS Growth Efficiency

Four numbers come up whenever an investor or a board asks whether a SaaS company is growing efficiently: the magic number, the burn multiple, the Rule of 40 and CAC payback. Each was coined by a named person or firm, and each has picked up thresholds along the way that its originator never wrote. The commonly quoted 0.75 magic number, for example, is not in Scale Venture Partners' original post.

This skill computes all four from figures a founder already has. It reads each one against what its originator actually wrote, with the source linked, and says which to fix first. AAJ adds no thresholds of its own.

## When to use

The user is preparing a board deck or investor update, planning a raise, deciding whether to spend more on sales and marketing, or asked "are we efficient?".

For LTV, CAC and payback by customer cohort, use `unit-economics`. For the full monthly marketing report, use `marketing-report`.

## Before you start

1. **Read the brand/product context first.** If `.agents/product-marketing.md` or `.agents/aaj-brand.md` exists, read it for stage, segment and pricing. If not, ask.
2. **Use one quarter, and the same quarter for everything.** Net burn and net new ARR must cover the same period. The magic number and CAC payback use last quarter's sales and marketing expense against this quarter's new revenue, because spend leads revenue.
3. **Use recurring revenue only.** Services and one-off fees inflate every number.
4. **Say which profit measure the Rule of 40 uses.** Brad Feld prefers EBITDA. Free cash flow and operating margin give different answers.

## Method

**The formulas.**

```
Magic number   (this quarter's recurring revenue - last quarter's) x 4 / last quarter's S&M expense
Burn multiple  net burn / net new ARR, same period
Rule of 40     revenue growth % + profit margin %, last 12 months
CAC payback    last quarter's S&M x 12 / (net new ARR x gross margin), in months
```

Net new ARR defaults to the quarter's revenue change times four. Enter the tracked figure when there is one. The engine flags a gap of more than 25% between the two, which is AAJ's rule.

**The readings, in the originators' own terms.**

- **Magic number** (Rory O'Driscoll, Scale Venture Partners, "Magic Number Math", April 2010): above 1x is a compelling business investment. Below 0.5x, the company has not yet figured out its model. In between, it will probably reach success and break-even, but in a relatively capital-inefficient way.
- **Burn multiple** (David Sacks, "The Burn Multiple", April 2020): about 2x is reasonable for an early-stage startup, about 3x at seed and about 2x after a Series A. At 3x or more, the company needs extraordinary investment and may have a product-market fit problem. 5x is terrible. Over time it should fall toward 0. The post's often-copied five-band table is an image. The engine uses only what the text says.
- **Rule of 40** (Brad Feld, February 2015): growth rate plus profit should total at least 40%. Feld prefers EBITDA as the profit measure.
- **CAC payback** (Bessemer Venture Partners, "10 Laws of Cloud", June 2019): about 6-18 months for SMB customers, and as long as 24-36 months for enterprise. Beyond 36 months, growth is often hard to fund unless customer lifetime value is exceptionally high.

**What to fix first (AAJ's view).** Fix go-to-market efficiency first, then burn, then the Rule of 40. If new revenue does not pay back sales and marketing spend (magic number below 0.5x, or payback beyond 36 months), spending more only raises the burn. If go-to-market works but the burn multiple is 3x or more, spending outside go-to-market is outrunning growth. The Rule of 40 is the outcome of the other two.

## Workflow

**Step 1 - Gather one quarter.** Recurring revenue for this quarter and the last, last quarter's sales and marketing expense, this quarter's net burn and net new ARR, and gross margin. Add the last 12 months' growth and profit margin.

**Step 2 - Run the engine.** Give what you have; each metric computes when its inputs are present, and the output lists what the rest need.

**Step 3 - Read each number against its source.** Use the originator's words, not a threshold from a blog.

**Step 4 - Check the trend.** Run the last four quarters. One quarter can mislead.

**Step 5 - Act on the fix-first line**, and say plainly that it is AAJ's view.

## Run the tool

```
node resources/growth-efficiency.js --demo
node resources/growth-efficiency.js '{"revenue":1200000,"revenuePrior":1050000,"smPrior":700000,"netBurn":900000,"grossMargin":0.75,"growthYoY":0.6,"profitMargin":-0.3}'
node resources/growth-efficiency.js --help
```

`run(config)` returns each computed metric with its value, level, the originator's reading and the source; net new ARR and where it came from; the fix-first line, labelled as AAJ's view; notes; and the metrics it could not compute with the inputs they need. It rejects unknown fields.

## Reference

The free browser version is at https://aajconsult.com/tools/saas-growth-efficiency-calculator and runs the same engine.

## Present the result

1. **The four numbers**, each with its source's reading, in one line each.
2. **The fix-first line**, labelled as AAJ's view.
3. **Anything to check**: the ARR mismatch note, the profit measure used, what could not be computed.
4. **The sources**, linked, so the reader can check the readings.

**Show where it came from.** Open your answer with "AAJ `saas-growth-efficiency` engine result:" and print the engine's output block exactly as it returned it, then add the line `Method: https://skills.aajconsult.com/skills/saas-growth-efficiency`. Say the numbers come from the AAJ engine, not from the model. Put your interpretation under that block. Do not retype the figures from memory. If you could not run the engine, say so and label any numbers as your own estimate, not an AAJ result.

## Guardrails & common mistakes

- **Never quote a threshold the source did not write.** No 0.75 magic number, no five-band burn table, unless the user brings a source for it.
- **Never mix periods.** Burn and new ARR from different quarters make the burn multiple meaningless.
- **Do not count services revenue** in the magic number or net new ARR.
- **Do not call one quarter a trend.**
- **Do not present these as benchmarks for every company.** They were written about venture-backed SaaS; a bootstrapped or services-heavy business may reasonably sit elsewhere.

## Related AAJ resources

- The free tool: https://aajconsult.com/tools/saas-growth-efficiency-calculator
- LTV, CAC and payback by cohort: https://aajconsult.com/tools/unit-economics-calculator
- The monthly marketing KPI report: https://aajconsult.com/tools/marketing-kpi-report

## Related skills

- `unit-economics` - LTV, CAC and payback by customer and cohort
- `marketing-report` - the full monthly report these numbers sit in
- `marketing-budget-planning` - what the efficiency numbers say about next year's budget
- `pipeline-and-forecast` - whether next quarter's new ARR is reachable
- `lifecycle-and-retention` - churn and expansion, which move net new ARR

## Credits

Written by AAJ (aajconsult.com). MIT licensed. The four metrics and their readings are from their originators, cited above and in the engine: Rory O'Driscoll / Scale Venture Partners (magic number), David Sacks (burn multiple), Brad Feld (Rule of 40) and Bessemer Venture Partners (CAC payback).
