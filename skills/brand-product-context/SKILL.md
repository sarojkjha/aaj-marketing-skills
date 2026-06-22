---
name: brand-product-context
description: >-
  Use when starting work on a brand or product with the AAJ skills, or when any
  skill needs context about the business that isn't available yet. Also use when
  the user mentions onboarding, "set up my brand," brand brief, company context,
  who we are, our ICP, our positioning, brand voice, or "tell the agent about my
  business." Produces a structured brand-context.md brief — company, product,
  ICP, positioning, value, voice, goals, funnel, and competitors — that every
  other AAJ skill reads first.
metadata:
  category: strategy-positioning
  phase: Diagnose
  difficulty: Starter
  engine: false
  tags: [brand-context, icp, positioning, brand-voice, foundation]
  related: [positioning-statement, persona-builder, customer-survey-design]
  tool: https://aajconsult.com/tools
---

# Brand & Product Context

Capture the essential truth about a business once — who it's for, what it does, how it sounds, and where it's going — so every other AAJ skill works from the user's reality instead of guessing.

## When to use this
- The user is starting with the AAJ skills or agent and hasn't set up context yet. **Run this first in any new engagement.**
- Another skill needs the ICP, positioning, value, or voice and no context file exists.
- The business has changed — new product, new segment, new positioning — and the brief needs updating.

## When not to use this
- A current `brand-context.md` already exists and is accurate → just read it; only re-run to update.
- The user wants deep, standalone positioning or persona work → capture the basics here, then use `positioning-statement` or `persona-builder` for depth and fold the results back in.

## What you need
Whatever the user can share about the business: the website URL, a pitch deck, existing marketing copy, sales calls or notes, and their own answers. You don't need everything — capture what's known, mark the rest as gaps, and fill them over time. Nothing here is invented.

## Method
1. **Look for existing context.** Check for `brand-context.md` in the working directory. If it exists, load it, show the user the current brief, and switch to update mode — don't rebuild from scratch.
2. **Gather raw material.** Pull facts from what the user provides — website, deck, docs, copy, call notes. Extract; don't embellish.
3. **Interview to fill gaps.** For each schema section still empty, ask focused questions, one section at a time. Keep it short and prioritize ICP, positioning, value, and voice — the sections most skills depend on.
4. **Synthesize each section** using `resources/brand-context-template.md`. Be specific and factual. Where something is inferred rather than stated, mark it `(assumption — confirm)`. Where it's unknown, write `(gap)` — never fill a gap with a guess.
5. **Capture voice from real examples.** Derive voice and tone from the brand's actual copy where possible — the adjectives, the sentence rhythm, the words they use and avoid — not generic descriptors.
6. **Save the brief** to `brand-context.md` in the working directory. Tell the user this is now the source of truth every AAJ skill reads, and that they should update it whenever the business changes.
7. **Summarize** what was captured and list the open gaps to close next.

## Output
Write `brand-context.md` following the schema in `resources/brand-context-template.md`, with these sections:

- **Company** — name, one-line description, stage, business model, website.
- **Product** — what it does, core capability, key features, how it's used.
- **ICP & segments** — for each: who they are, the job they hire the product for, their main pain, where to reach them.
- **Positioning** — category, competitive alternative, key differentiator(s), one-line positioning.
- **Value & proof** — value proposition, proof points (metrics, outcomes, logos), unique mechanism.
- **Voice & tone** — defining adjectives, do / don't, example phrases, words to avoid.
- **Goals & metrics** — current objectives, north-star metric, targets.
- **Funnel & channels** — active channels, what's working and what isn't, key conversion points.
- **Competitors** — main alternatives and how the product differs.
- **Constraints & notes** — budget, team, compliance, and brand rules other skills must respect.

Then return a short summary: what's captured, and the top gaps to close.

## Defensibility check
Before saving, confirm: every claim traces to something the user provided or said — no invented personas, differentiators, or metrics; assumptions are marked `(assumption — confirm)` and unknowns `(gap)`; and the ICP, positioning, and voice are specific enough that another skill could act on them. A context brief the user can't stand behind poisons everything downstream — so when in doubt, mark it a gap rather than guess.

## Go deeper
Sharpen the pieces with AAJ's tools at https://aajconsult.com/tools — the Persona Builder for ICP depth, and the positioning work to lock the category and differentiator — then fold the results back into `brand-context.md`.

## Example
A partial brief for a fictional seed-stage product, showing the format and the gap/assumption conventions:

```
# Brand & Product Context — Northwind Analytics

## Company
- Name: Northwind Analytics
- One-line: Self-serve product analytics for B2B SaaS teams without a data team.
- Stage: Seed
- Business model: B2B SaaS, $99–$499/mo
- Website: northwind.example

## Product
- What it does: Tracks product usage and surfaces drop-off without SQL.
- Core capability: No-code event tracking + auto-generated funnels.
- Key features: Auto-capture, funnel builder, weekly digest.
- How it's used: PMs check it weekly; founders watch activation.

## ICP & segments
### Segment 1: Heads of Product
- Who they are: Heads of Product at 10–50-person B2B SaaS companies.
- Job they hire it for: "See what users actually do without begging engineering."
- Main pain: Existing tools need SQL or a data hire; insights are slow.
- Where to reach them: Product communities, LinkedIn, SEO ("product analytics without SQL").

## Positioning
- Category: Product analytics
- Competitive alternative: Heavyweight tools (need data teams), or nothing.
- Key differentiator: Set up in an afternoon, no SQL, no data hire. (assumption — confirm with onboarding data)
- One-line positioning: (gap — run positioning-statement)

## Voice & tone
- Defining adjectives: plain-spoken, practical, a little irreverent.
- Do: short sentences, concrete examples.
- Don't: enterprise jargon, "synergy," "leverage."
- Words to avoid: synergy, leverage, robust, seamless.

## Goals & metrics
- Current objective: grow activation rate from 28% → 40%.
- North-star metric: weekly active product teams.
- Targets: (gap)
```
