---
name: objection-handling
description: >-
  Use when the user wants to handle sales objections or build objection and
  competitor battlecards — structured responses to the pushback that stalls
  deals. Also use when the user mentions objections, objection handling, "it's
  too expensive," competitor comparison, battlecards, rebuttals, deal blockers,
  status quo, or "how do I respond when they say X." Produces an
  objection-handling framework and competitor battlecards — the top objections
  with grounded, non-defensive responses and honest competitive comparisons.
license: MIT
metadata:
  publisher: AAJ
  slug: objection-handling
  category: Sales & Pipeline
  phase: Design
  difficulty: Starter
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: The real objections, the differentiator and proof, and the main competitors.
  outputs: An objection-handling framework and competitor battlecards, plus disqualify signals.
  related_aaj:
    - https://aajconsult.com/tools
  tags: [objections, battlecards, rebuttals, competitive]
---

# Objection Handling

Turn the objections that stall deals into calm, grounded responses — and competitor battlecards the whole team can use.

## When to use

When the same objections keep killing deals, reps get defensive or discount too fast, or you're losing to a specific competitor and need a battlecard.

## Before you start

1. **Read the brand/product context first.** Pull the differentiator, proof, and main competitors from `.agents/product-marketing.md`. If none exists, ask the user.
2. **Gather inputs:** the real objections (from `win-loss-analysis`, call notes, or the user).
3. **Confirm the objective:** responses the team can use. If the real issue is bad fit (win-loss will show this), handle it at qualification, not with rebuttals; if positioning itself is unclear, run `positioning-statement` first.

## Method

Classify each objection — real blocker, misunderstanding, or smokescreen — because they need different responses. Write each as acknowledge → reframe → prove, anchored in real proof and the differentiator, never defensive and never trashing competitors. Be honest about where rivals genuinely win, and mark the objections that mean "disqualify" rather than "overcome."

## Workflow

1. **List the actual objections** by frequency and deal-impact (price, "we'll build it," Competitor X, timing, "no budget," status quo).
2. **Classify each** — real blocker, misunderstanding, or smokescreen.
3. **Write each response as acknowledge → reframe → prove** — no defensiveness.
4. **Anchor in proof and the differentiator**, not opinion.
5. **Build competitor battlecards** — where you win, where they win (honestly), and the reframing question.
6. **Mark the disqualifiers** and present the framework.

## Reference

This skill bundles no data files. Pull the differentiator, proof, and competitor set from `.agents/product-marketing.md`; pull the live objections from `win-loss-analysis` or the user.

## Present the result

- **Top objections**, each with: type, the response (acknowledge → reframe → prove), and the proof it leans on.
- **Competitor battlecards** — honest strengths and weaknesses, plus the reframing question.
- **Disqualify signals** — objections you shouldn't try to overcome.

## Guardrails & common mistakes

- **Acknowledge honestly first.** A response that dismisses the concern reads as defensive and loses trust.
- **Never disparage competitors or overclaim.** Honesty about where a rival wins is more persuasive than spin.
- **Ground every response in real proof** from context — a clever rebuttal with no substance erodes trust.
- **Know when to walk.** Some objections mean disqualify; trying to "overcome" bad fit wastes everyone's time.

## Related AAJ resources

- AAJ tools — https://aajconsult.com/tools (positioning and messaging).

## Related skills

`win-loss-analysis` · `discovery-call-framework` · `sales-process-design` · `positioning-statement`

## Credits

Original AAJ skill. The Agent Skills format and the marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written. See the repository README for the full reference list.
