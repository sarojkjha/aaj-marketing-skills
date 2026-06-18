# AAJ Marketing Skills — Authoring Guide

The standard every skill in this repo follows. The goal: skills that are **self-contained, agent-runnable, on-brand, and defensible** — grounded in AAJ's tested methodology, not generic advice.

## What a skill is

A markdown file (`SKILL.md`) that gives an AI agent specialized knowledge and a workflow for one marketing task. When installed, the agent recognizes a matching task and applies the right framework. Skills are self-contained: a skill works in an agent with **no companion blog or playbook required**. Linking to AAJ content is an enhancement, not a prerequisite.

## Folder structure

```
skills/<slug>/
  SKILL.md              # required — frontmatter + instructions
  resources/            # optional — bundled files the SKILL.md references
    <script>.js         #   runnable engines/calculators (Node, no deps)
    <data>.md           #   benchmarks, templates, reference data
    output-format.md    #   the presentation format, when useful
```

- `<slug>` is kebab-case and matches the `name` field exactly.
- Keep `SKILL.md` lean. Push large data, tables, and code into `resources/` and reference them by relative path. Agents load resources on demand, so a heavy SKILL.md just slows the trigger.

## Frontmatter

Required by the Agent Skills spec:
- **`name`** — kebab-case, ≤ 64 chars, matches the folder.
- **`description`** — the trigger. Write it as *"Use when the user wants to X, or Y. Also use when the user mentions [keywords] or '[natural phrase]'. Produces [output]."* This is the single most important line: it decides whether the agent loads the skill. Keep it ≤ ~90 words and keyword-rich without keyword-stuffing.

AAJ additions (under `metadata:`, read by the catalog sync — this is the **single source of truth**, so the platform never re-types it):
- `publisher` (AAJ), `slug`, `category` (one of the eight), `phase` (Diagnose/Design/Execute), `difficulty`, `version` (semver), `agents`, `inputs`, `outputs`, `tags`.
- `related_aaj` — playbook/tool URLs. **Nullable**: omit or leave empty when no content exists yet; add the link when AAJ publishes it. Skills ship without it.

`license: MIT` on every skill.

## Body sections (in order)

Title → When to use → Before you start → Method → Workflow → (Math/Framework) → (Run the tool) → Reference → Present the result → Guardrails & common mistakes → Related AAJ resources → Related skills → Credits.

Omit the optional sections (Math, Run the tool) when they don't apply. Use the eight-section minimum (everything except the two optional blocks) for every skill.

## Voice & quality bar

- **Agent-directed and imperative.** "Compute X. Present Y." Not marketing prose.
- **Opinionated and grounded.** State AAJ's point of view (outcomes over vanity metrics, "decisions you can defend"). Prefer concrete numbers, formulas, and checklists over vague guidance.
- **Honest by construction.** Build in the guardrails that keep the output defensible (e.g. paid-media vs fully-loaded CAC, attribution lag, learning budgets). A skill that produces confident-but-wrong output is worse than none.
- **Self-checking.** Where a skill computes something, bundle a runnable script in `resources/` so the agent gets exact numbers instead of approximating. Verify the script against known cases before shipping (run it, confirm the outputs).

## The shared-context pattern

Every skill should check for a brand/product context file first (`.agents/product-marketing.md` or `.agents/aaj-brand.md`) and use it for product, audience, pricing, and positioning before acting. This keeps the whole library consistent for a given user. The forthcoming **brand-product-context** foundation skill creates that file; until it exists, skills fall back to asking the user.

## Cross-references

List related skills in the **Related skills** section so the catalog can build the dependency map (e.g. `paid-media-budget-allocation` ↔ `unit-economics` ↔ `ab-testing`). Reference by slug.

## Credits & licensing

This repo is MIT. The Agent Skills spec and Corey Haines' `coreyhaines31/marketingskills` (MIT) are credited in the repo README as references for structure and coverage. We do **not** copy his skill files — every AAJ skill is independently written. If any third-party text is ever reused, preserve its license notice.

## Pre-ship checklist

- [ ] `name` matches the folder; `description` is trigger-focused with keywords.
- [ ] `metadata` complete (category, phase, difficulty, version, agents, inputs, outputs, tags); `related_aaj` set or intentionally empty.
- [ ] Body has all required sections; large data/code lives in `resources/`.
- [ ] Any bundled script runs cleanly (`node resources/<script>.js --help`) and matches known test cases.
- [ ] Voice is agent-directed, opinionated, and includes guardrails.
- [ ] Related skills cross-referenced; credits present.
- [ ] Frontmatter is valid YAML (parses without error).
