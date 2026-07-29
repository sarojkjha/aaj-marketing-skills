---
name: content-calendar-planning
description: >-
  Use when the user wants to plan a content calendar or editorial strategy —
  topic clusters, cadence, formats, and a repurposing plan across channels.
  Also use when the user mentions content calendar, editorial calendar, content
  strategy, topic clusters, pillar content, content cadence, or "what should we
  publish and when." Produces a structured calendar with clusters, schedule, and
  a repurposing flow.
license: MIT
metadata:
  publisher: AAJ
  slug: content-calendar-planning
  category: Content & Copy
  phase: Execute
  difficulty: Starter
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: Audience/personas, business goals, target topics or keywords, publishing capacity, and channels
  outputs: A topic-cluster plan, a dated publishing schedule, and a repurposing flow from each core asset to social
  related_aaj:
    - https://aajconsult.com/tools/content-calendar-template
  related: [persona-builder, geo-content-optimization]
  tags: [content-calendar, editorial, content-strategy, topic-clusters, repurposing, seo]
---

# Content Calendar Planning

Plan content as a **system that compounds**, not a list of one-off posts. The leverage is in topic clusters (a pillar plus supporting pieces that interlink), a sustainable cadence, and a repurposing flow that turns one core asset into many — so each piece builds authority and feeds the next.

## When to use

The user needs an editorial plan — what to publish, in what order, how often, and how to get more from each piece.

## Before you start

1. **Read the brand/product context** (`.agents/product-marketing.md` / `.agents/aaj-brand.md`) and reuse personas if present; otherwise pull from the `persona-builder` skill.
2. **Anchor to goals.** Tie content to outcomes (rank for X, generate leads via Y), not output volume.
3. **Be honest about capacity.** A cadence you can sustain beats an ambitious one you'll abandon.

## Workflow

1. **Define topic clusters.** For each priority theme, a **pillar** (comprehensive, the thing you want to rank/be cited for) plus 3–6 **cluster pieces** that go deep on sub-questions and link to the pillar. Map clusters to personas and funnel stage.
2. **Set the cadence** that fits capacity (e.g., one pillar + two cluster pieces a month), and sequence clusters by priority.
3. **Lay out the calendar** using `resources/calendar-template.md`: date, cluster, title, format, persona, funnel stage, primary keyword/question, and CTA.
4. **Build the repurposing flow** for each core asset — AAJ's pattern is **core asset → companion guide → social (carousel, thread, posts, newsletter)** — so one pillar becomes a week of distribution.
5. **Layer SEO/GEO/AEO** on each piece (answer-first intro, question-first H2s, internal links to the pillar); hand to `geo-content-optimization` for the citation work.

## Present the result

Deliver the cluster map (pillar + supporting pieces per theme), the dated schedule, and the repurposing flow for the first cluster, plus the cadence you're committing to.

## Guardrails & common mistakes

- **Clusters over scattershot.** Random topics don't compound; interlinked clusters build topical authority.
- **One pillar, many derivatives.** Don't create everything from scratch — repurpose the core asset.
- **Cadence you can keep.** Consistency beats bursts; under-commit and over-deliver.
- **Tie each piece to a goal and a persona.** Content with no job is the first thing to cut.
- **Interlink deliberately.** Cluster pieces link up to the pillar and across to each other.

## Related AAJ resources

- Interactive tool: https://aajconsult.com/tools/content-calendar-template

## Related skills

`persona-builder` (who it's for) · `geo-content-optimization` (make it citable) · `copywriting` (write it) · `social` (the repurposed distribution).

## Credits

Original AAJ skill, reflecting AAJ's cluster-and-repurpose content system. The Agent Skills format and Corey Haines' `coreyhaines31/marketingskills` (MIT) were references for structure and coverage; this skill is independently written. See the repository README.
