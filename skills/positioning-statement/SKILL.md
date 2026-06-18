---
name: positioning-statement
description: >-
  Use when the user wants to write, sharpen, or pressure-test a positioning
  statement, value proposition, or core messaging for a product or company.
  Also use when the user mentions positioning, messaging, value prop, "what do
  we do / who is it for", category, differentiation, or competitive alternative.
  Produces a defensible positioning statement, supporting proof points, and a
  one-line value proposition, with variants by audience lens.
license: MIT
metadata:
  publisher: AAJ
  slug: positioning-statement
  category: Strategy & Positioning
  phase: Design
  difficulty: Starter
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: Target customer, the problem/need, product category, key benefit, primary competitive alternative, and the differentiator (plus any proof)
  outputs: A positioning statement, 3 proof points, a one-line value proposition, and audience-lens variants
  related_aaj:
    - https://aajconsult.com/tools/positioning-statement-generator
  tags: [positioning, messaging, value-proposition, differentiation, brand-strategy]
---

# Positioning Statement

Write positioning that is **specific, differentiated, and defensible** — a clear statement of who the product is for, what unique value it delivers, and why it beats the alternative. Vague positioning ("the leading platform for modern teams") is the default failure mode; the job is to make it concrete and provable.

## When to use

The user is defining or refining how a product is described — a positioning statement, value proposition, homepage hero, or category narrative.

## Before you start

1. **Read the brand/product context first.** If `.agents/product-marketing.md` or `.agents/aaj-brand.md` exists, use it for product, audience, and competitors. Otherwise gather the inputs below.
2. **Gather the six inputs:** target customer (be narrow), the problem or need, the product category, the single most important benefit, the primary competitive alternative (including "do nothing" / spreadsheets), and the differentiator. Ask for proof for each claim.

## Method

Strong positioning answers four questions without hedging: **for whom, in what category, what unique value, versus what alternative.** Specificity wins — a narrow "for whom" and a concrete differentiator beat broad superlatives. Every claim must be defensible with proof; if it isn't, cut it or soften it. See `resources/positioning-template.md` for the frameworks, a worked example, and the pressure-test.

## Workflow

1. **Draft the core statement** using the classic frame: *"For [target] who [need], [product] is a [category] that [key benefit]. Unlike [alternative], [product] [differentiator]."*
2. **Pressure-test it** against the checklist in the template (specific? differentiated? defensible? true? single-minded?). Rewrite anything that fails.
3. **Derive supporting assets:** three proof points that substantiate the benefit and differentiator, and a one-line value proposition for a homepage hero.
4. **Produce audience-lens variants.** The same positioning reads differently to an economic buyer (outcome, ROI), an end user (workflow, ease), and a technical evaluator (capability, integration). Tailor emphasis without changing the core.
5. **Flag gaps.** Note any claim that lacks proof, any "for whom" that's still too broad, or any differentiator a competitor could equally claim.

## Present the result

Use the output format in `resources/positioning-template.md`: the core statement, the three proof points, the one-line value proposition, the three audience-lens variants, and the list of claims needing proof.

## Guardrails & common mistakes

- **Narrow the target.** "For everyone" positions for no one. A specific segment can always be expanded later.
- **Differentiate on something a competitor can't equally claim.** "Easy to use" and "powerful" are not differentiation.
- **Don't claim what you can't prove.** Unprovable superlatives erode trust; concrete, verifiable claims build it.
- **Single-minded benefit.** Lead with the one thing that matters most, not a list.
- **Avoid category jargon.** If the target wouldn't use the phrase, neither should the positioning.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/positioning-statement-generator

## Related skills

`customer-research` and `persona-builder` (sharpen the "for whom") · `competitor-profiling` (sharpen the "versus what") · `copywriting` (turn positioning into page copy).

## Credits

Original AAJ skill. The Agent Skills format and the marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written. See the repository README for the full reference list.
