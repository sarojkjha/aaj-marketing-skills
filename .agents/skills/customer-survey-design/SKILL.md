---
name: customer-survey-design
description: >-
  Use when the user wants to design a customer or market survey — choosing the
  questions, structure, scales, and sample size to get unbiased, decision-useful
  answers. Also use when the user mentions survey, questionnaire, NPS, customer
  feedback, market research survey, product-market fit survey, sample size,
  margin of error, "how many responses do I need," or "what should I ask my
  customers." Produces a structured survey with unbiased questions mapped to
  decisions, plus computed sample-size, invite, and segment-readability numbers
  from a runnable engine.
license: MIT
metadata:
  publisher: AAJ
  slug: customer-survey-design
  category: Research & Personas
  phase: Diagnose
  difficulty: Starter
  version: 1.1.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: The decision the survey should inform, who you'll ask, audience size and expected response rate if known, and the segment cuts you plan to report
  outputs: A structured survey — questions, types, scales, and order — designed to avoid bias, plus required completes, invites, and a per-segment readability verdict from the engine
  related_aaj:
    - https://aajconsult.com/tools/survey-studio
  related: [persona-builder, positioning-statement, ab-test-significance]
  tags: [survey, questionnaire, research, nps, pmf, customer-feedback, sample-size, margin-of-error]
---

# Customer Survey Design

Design surveys that produce **answers you can act on**, not vanity data. The discipline is starting from the decision the survey must inform and writing questions that don't lead the respondent — most surveys fail by asking biased questions that confirm what the author hoped.

The second, quieter failure mode is fielding a survey that can't answer its own question: 60 responses split across five segments, then decisions made on ±13-point noise. This skill computes what a readable survey actually requires **before** anything is sent — and refuses to bless segment cuts the sample can't support.

## When to use

The user is about to field a survey and needs the questions, structure, and sample plan to be right before it goes out.

## Before you start

1. **Name the decision.** What will you do differently based on the results? If a question doesn't inform a decision, cut it.
2. **Identify the respondents** and how you'll reach them (existing customers, churned users, prospects, market panel) — this shapes wording and length. Get the reachable audience size and a realistic response rate if known.
3. **List the cuts you'll report.** If the readout says "by segment," the sample must be sized for the smallest cell, not the total.
4. **Pick the survey type** to match: PMF ("how would you feel if you could no longer use this?"), NPS + why, onboarding/CSAT, churn reason, or discovery.

## Method

The engine (`resources/survey-design.js`, Node, stdlib only) computes:

- **Required completes** — n₀ = z²·p(1−p)/e², with finite-population correction n = n₀/(1+(n₀−1)/N) when the audience is finite. Worked check: ±5pp at 95% (z=1.96, p=0.5) → n₀ = 384.16 → **385**; corrected for N=2,000 → **323**.
- **Invites** — completes ÷ response rate, with a feasibility verdict against the audience size (loosen the margin, lift response, or run a census and report the achieved ±).
- **Segment readability** — worst-case margin per cell, e = z·√(0.25/n_cell), labelled READ (≤±5pp), CAUTION (±5–8pp, directional), DON'T READ (wider). Thresholds are working labels, not laws.

Modes: `sample '<json>'` and `segments '<json>'`. `--demo` runs both worked examples with no arguments; `--help` prints the schema.

## Workflow

1. **Size the survey first** — run `node resources/survey-design.js sample '<json>'` with the margin, confidence, audience, and response rate. If it's not feasible, fix the plan before writing a single question.
2. **Check the cuts** — run `segments` mode with planned segment shares. Merge or oversample any DON'T READ cell now, not after fielding.
3. **Map questions to decisions** — list the decisions, then write the minimum questions that inform each.
4. **Choose question types and scales** using `resources/survey-template.md` (open-ended for discovery, closed/scale for measurement; consistent scale direction).
5. **Write unbiased wording** — neutral, one idea per question, no leading or loaded phrasing, balanced options.
6. **Order for flow and low drop-off** — easy/engaging first, sensitive/demographic last, group by topic, keep it short.
7. **Add the key open-ended "why"** after rating questions — that's where the actionable insight lives.

## Present the result

Lead with the sample plan (completes, invites, feasibility, and the segment-readability table from the engine), then the survey in order (question, type, scale/options) with the decision each informs, an estimated completion time, and the recommended channel/timing.

## Guardrails & common mistakes

- **Don't promise segment reads the sample can't support.** If a cell says DON'T READ, either resize or drop the cut from the readout.
- **No leading questions.** "How much did you love our amazing onboarding?" yields noise. Ask neutrally.
- **One idea per question.** Double-barreled questions ("Was it fast and easy?") can't be answered cleanly.
- **Keep it short.** Every extra question lowers completion and data quality.
- **Balance the scale.** Offer as many negative as positive options; include a neutral where appropriate.
- **Pilot first.** Test with a few people to catch confusing wording before fielding.
- **Survey sampling ≠ experiment significance.** Testing whether variant B beat variant A belongs in `ab-test-significance`; this engine sizes *reads*, not experiments.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/survey-studio

## Related skills

`persona-builder` (turn answers into personas) · `positioning-statement` (questions that test messaging) · `lifecycle-and-retention` (churn-reason surveys feed the retention diagnosis) · `ab-test-significance` (experiments, not survey reads).

## Credits

Original AAJ skill. The Agent Skills format and Corey Haines' `coreyhaines31/marketingskills` (MIT) were references for structure and coverage; this skill is independently written. See the repository README.
