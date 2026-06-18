---
# ── AAJ SKILL TEMPLATE ──────────────────────────────────────────────
# Copy this file to  skills/<slug>/SKILL.md  and fill every [BRACKET].
# Required by the Agent Skills spec: `name` and `description`.
# Everything under `metadata:` powers the skills.aajconsult.com catalog and
# is read by the sync — keep it accurate. Delete these comment lines when done.
# ────────────────────────────────────────────────────────────────────
name: [kebab-case-slug]          # lowercase, hyphens, ≤ 64 chars, matches the folder name
description: >-
  Use when the user wants to [primary task], or [closely related task]. Also use
  when the user mentions [keyword], [keyword], or "[natural phrase a user would type]".
  Produces [the concrete output]. (Keep this tight and trigger-focused — this is
  the text the agent reads to decide whether to load the skill. ≤ ~90 words.)
license: MIT
metadata:
  publisher: AAJ
  slug: [kebab-case-slug]        # same as name
  category: [one of: Strategy & Positioning | Research & Personas | SEO, GEO & AEO | Conversion & Web | Content & Copy | Paid Media & Budgeting | Analytics & Experimentation | Growth, Retention & RevOps]
  phase: [Diagnose | Design | Execute]
  difficulty: [Starter | Intermediate | Advanced]
  version: 1.0.0
  agents: [Claude Code, Cursor, OpenAI Codex, Windsurf, Cline]
  inputs: [one line: what the user/agent must supply]
  outputs: [one line: what the skill produces]
  related_aaj:                   # AAJ playbook/tool URLs — OMIT or leave empty if none yet (nullable)
    - [https://aajconsult.com/...]
  tags: [tag, tag, tag]
---

# [Skill Title]

[One sentence: what this skill does and the principle behind it.]

## When to use

[1–2 lines mirroring the description — the situations that should trigger this skill.]

## Before you start

1. **Read the brand/product context first.** If a context file exists (e.g. `.agents/product-marketing.md` or `.agents/aaj-brand.md`), read it for product, audience, pricing, and positioning. If none exists, ask the user for the essentials before proceeding.
2. **Gather inputs:** [list the specific inputs this skill needs].
3. **Confirm the objective:** [what the user is trying to produce/decide].

## Method

[2–4 sentences on the core approach — the framework or principle. Keep it opinionated and grounded; this is where AAJ's point of view shows.]

## Workflow

1. [Step — imperative, agent-directed.]
2. [Step.]
3. [Step — present the result.]

## [The math / The framework / The checklist]   ← include if the skill has a model or formula

```
[formulas, rules, or a decision tree the agent applies]
```

## Run the tool   ← include only if the skill bundles a runnable script

```bash
node resources/[script].js [args]
node resources/[script].js --help
```

## Reference   ← point to bundled resources

[Benchmarks, templates, or data live in `resources/`. Reference them by relative path; never inline large data into SKILL.md.]

## Present the result

[The output format, or a pointer to `resources/output-format.md`.]

## Guardrails & common mistakes

- [The traps a good operator avoids; how to keep the output honest and defensible.]

## Related AAJ resources

- [Tool/playbook links — or "Companion guide coming soon" if not yet published.]

## Related skills

[`other-skill` · `other-skill` — cross-reference the dependency map.]

## Credits

Original AAJ skill. The Agent Skills format and the marketing-skills catalog by Corey Haines (`coreyhaines31/marketingskills`, MIT) were references for structure and coverage; this skill is independently written. See the repository README for the full reference list.
