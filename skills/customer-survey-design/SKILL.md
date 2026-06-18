---
name: customer-survey-design
description: >-
  Use when the user wants to design a customer or market survey — choosing the
  questions, structure, and scales to get unbiased, decision-useful answers.
  Also use when the user mentions survey, questionnaire, NPS, customer feedback,
  market research survey, product-market fit survey, or "what should I ask my
  customers." Produces a structured survey with unbiased questions mapped to the
  decisions it should inform.
license: MIT
metadata:
  publisher: AAJ
  slug: customer-survey-design
  category: Research & Personas
  phase: Diagnose
  difficulty: Starter
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: The decision the survey should inform, who you'll ask, and any specific topics to cover
  outputs: A structured survey — questions, types, scales, and order — designed to avoid bias, with the decision each question informs
  related_aaj:
    - https://aajconsult.com/tools/survey-studio
  tags: [survey, questionnaire, research, nps, pmf, customer-feedback]
---

# Customer Survey Design

Design surveys that produce **answers you can act on**, not vanity data. The discipline is starting from the decision the survey must inform and writing questions that don't lead the respondent — most surveys fail by asking biased questions that confirm what the author hoped.

## When to use

The user is about to field a survey and needs the questions and structure to be right before it goes out.

## Before you start

1. **Name the decision.** What will you do differently based on the results? If a question doesn't inform a decision, cut it.
2. **Identify the respondents** and how you'll reach them (existing customers, churned users, prospects, market panel) — this shapes wording and length.
3. **Pick the survey type** to match: PMF ("how would you feel if you could no longer use this?"), NPS + why, onboarding/CSAT, churn reason, or discovery.

## Workflow

1. **Map questions to decisions** — list the decisions, then write the minimum questions that inform each.
2. **Choose question types and scales** using `resources/survey-template.md` (open-ended for discovery, closed/scale for measurement; consistent scale direction).
3. **Write unbiased wording** — neutral, one idea per question, no leading or loaded phrasing, balanced options.
4. **Order for flow and low drop-off** — easy/engaging first, sensitive/demographic last, group by topic, keep it short.
5. **Add the key open-ended "why"** after rating questions — that's where the actionable insight lives.

## Present the result

Deliver the survey in order (question, type, scale/options) with a note on the decision each informs, plus an estimated completion time and the recommended channel/timing.

## Guardrails & common mistakes

- **No leading questions.** "How much did you love our amazing onboarding?" yields noise. Ask neutrally.
- **One idea per question.** Double-barreled questions ("Was it fast and easy?") can't be answered cleanly.
- **Keep it short.** Every extra question lowers completion and data quality.
- **Balance the scale.** Offer as many negative as positive options; include a neutral where appropriate.
- **Open-ended "why" is gold** — but limit them; too many tank completion.
- **Pilot first.** Test with a few people to catch confusing wording before fielding.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/survey-studio

## Related skills

`persona-builder` and `customer-research` (turn answers into insight) · `positioning-statement` (questions that test messaging) · `churn-prevention` (churn-reason surveys).

## Credits

Original AAJ skill. The Agent Skills format and Corey Haines' `coreyhaines31/marketingskills` (MIT) were references for structure and coverage; this skill is independently written. See the repository README.
