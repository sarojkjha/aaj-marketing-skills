# AAJ Marketing Skills - 39 skills for AI agents. 23 run real engines.

Agent skills for AI marketing tasks — grounded in AAJ's tested tools and methodology, not generic advice. Works with Claude Code, Cursor, OpenAI Codex, Windsurf, and any agent that supports the [Agent Skills spec](https://agentskills.io).

Built by [Saroj Jha](https://github.com/sarojkjha) / [AAJ](https://aajconsult.com). Where a skill has one, it links to an AAJ playbook or tool for the full method behind it.

## Install

```bash
# All skills
npx skills add sarojkjha/aaj-marketing-skills

# Specific skill(s)
npx skills add sarojkjha/aaj-marketing-skills --skill paid-media-budget-allocation

# List available skills
npx skills add sarojkjha/aaj-marketing-skills --list
```

Installs to `.agents/skills/` (and symlinks into `.claude/skills/` for Claude Code).

## What's inside

Skills span eight categories — Strategy & Positioning, Research & Personas, SEO/GEO/AEO, Conversion & Web, Content & Copy, Paid Media & Budgeting, Analytics & Experimentation, and Growth / Retention / RevOps — each tagged by AAJ's **Diagnose → Design → Execute** phase. The catalog is rolling out in waves; the browsable library lives at [skills.aajconsult.com](https://skills.aajconsult.com).

Some skills bundle **runnable tools**. For example, `paid-media-budget-allocation` ships an allocation engine you can run directly:

```bash
node skills/paid-media-budget-allocation/resources/allocation-engine.js
```

## Authoring / contributing

See [AUTHORING_GUIDE.md](AUTHORING_GUIDE.md) for the standard every skill follows, and [SKILL_TEMPLATE.md](SKILL_TEMPLATE.md) to start a new one.

## Credits & license

[MIT](LICENSE) — use freely. Built by Saroj Jha / AAJ. The [Agent Skills spec](https://agentskills.io) and Corey Haines' [`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills) (MIT) were references for structure and topic coverage; all AAJ skills are independently written and grounded in AAJ's own tools and methodology.
