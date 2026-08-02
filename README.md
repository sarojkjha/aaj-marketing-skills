# 39 Marketing Skills for AI agents. 24 run real engines.

Agent skills for marketing work — grounded in AAJ's tested tools and methodology, not generic advice. **24 of the 39 ship a runnable engine**: a Node script you execute directly that takes your numbers and returns a verdict, not a template to fill in.

Works with Claude Code, Cursor, OpenAI Codex, Windsurf, and any agent supporting the [Agent Skills spec](https://agentskills.io). Free, [MIT](LICENSE), no signup, nothing routed through a server.

Built by [Saroj Jha](https://github.com/sarojkjha) / [AAJ](https://aajconsult.com). Browsable library at [skills.aajconsult.com](https://skills.aajconsult.com).

---

## Contents

- [Quick start](#quick-start)
- [What a runnable engine means](#what-a-runnable-engine-means)
- [The catalog](#the-catalog)
  - [Strategy & Positioning](#strategy-positioning) — 7 skills, 2 engines
  - [Research & Personas](#research-personas) — 2 skills, 1 engine
  - [SEO, GEO & AEO](#seo-geo-aeo) — 6 skills, 4 engines
  - [Content & Copy](#content-copy) — 4 skills, 3 engines
  - [Conversion & Web](#conversion-web) — 3 skills, 2 engines
  - [Paid Media & Budgeting](#paid-media-budgeting) — 2 skills, 2 engines
  - [Analytics & Experimentation](#analytics-experimentation) — 4 skills, 4 engines
  - [Sales & Pipeline](#sales-pipeline) — 7 skills, 3 engines
  - [Retention & Lifecycle](#retention-lifecycle) — 3 skills, 2 engines
  - [Growth, Retention & RevOps](#growth-retention-revops) — 1 skill, 1 engine
- [Engines at a glance](#engines-at-a-glance)
- [Methodology](#methodology)
- [Authoring & contributing](#authoring-contributing)
- [Credits & license](#credits-license)

---

## Quick start

```bash
# everything
npx skills add sarojkjha/aaj-marketing-skills

# one skill
npx skills add sarojkjha/aaj-marketing-skills --skill unit-economics

# see what's available
npx skills add sarojkjha/aaj-marketing-skills --list
```

Installs to `.agents/skills/`, and symlinks into `.claude/skills/` for Claude Code.

Then run any engine with no configuration at all:

```bash
node .agents/skills/unit-economics/resources/unit-economics.js --demo
```

```
AAJ Unit Economics -- subscription
------------------------------------------------------
Gross-margin LTV        $13,333   (3.0% monthly churn (~33.3 mo lifetime))
CAC                     $3,000
LTV : CAC               4.4:1
CAC payback             7.5 mo

[OK] LTV:CAC 4.4:1 is at or above the 3:1 floor.
[OK] CAC payback 7.5 mo is within the ~12-month guideline for subscription.
```

Swap the demo values for your own and it works the same way.

> From a clone of this repo, paths are `skills/<slug>/resources/…` instead of `.agents/skills/<slug>/resources/…`.

---

## What a runnable engine means

Most agent skills are instructions. These are too — but 24 of them also ship a dependency-free Node script that does the arithmetic and returns a judgement.

| | Instruction-only skill | Skill with an engine |
|---|---|---|
| Output | Guidance the agent paraphrases | Deterministic numbers |
| Reproducible | No | Yes — same input, same output |
| Verifiable | You trust the model | You read the code |
| Runs without an agent | No | Yes, `node …` |

Every engine accepts `--demo` (a worked example, no config), `--help` (the input schema), and a JSON payload for your own numbers. Engines validate input and fail loudly rather than returning a confident wrong answer.

---

## The catalog

**E** marks a skill with a runnable engine. Phase refers to AAJ's Diagnose → Design → Execute method.

### Strategy & Positioning

| | Skill | What it does | Phase |
|---|---|---|---|
|  | [`brand-product-context`](skills/brand-product-context) | Builds the shared brand brief every other skill reads first. | Diagnose |
|  | [`campaign-orchestrator`](skills/campaign-orchestrator) | Diagnoses which play applies, then sequences the other skills in order. | Diagnose |
| **E** | [`marketing-psychology`](skills/marketing-psychology) | Diagnoses which decision friction blocks the buyer, with a line between persuasion and manipulation. | Design |
|  | [`messaging-framework`](skills/messaging-framework) | Structures the message hierarchy beneath the positioning. | Design |
|  | [`positioning-statement`](skills/positioning-statement) | Produces a positioning statement pressure-tested against the competitive alternative. | Design |
| **E** | [`pricing-and-packaging`](skills/pricing-and-packaging) | Designs tiers with an anchor check and a willingness-to-pay read. | Design |
|  | [`value-proposition`](skills/value-proposition) | Sharpens the value proposition into something defensible. | Design |

### Research & Personas

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`customer-survey-design`](skills/customer-survey-design) | Designs surveys that produce usable answers, with sample sizing and segments. | Diagnose |
|  | [`persona-builder`](skills/persona-builder) | Builds personas from evidence rather than imagination. | Design |

### SEO, GEO & AEO

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`agent-readiness-audit`](skills/agent-readiness-audit) | Scores whether an AI agent buying for a customer can find, evaluate and transact with you. | Diagnose |
| **E** | [`geo-citation-tracker`](skills/geo-citation-tracker) | Measures whether AI engines name and cite you, and refuses to report noise as movement. | Execute |
|  | [`geo-content-optimization`](skills/geo-content-optimization) | Rewrites a page to maximise the chance an AI engine cites it. | Execute |
| **E** | [`programmatic-seo`](skills/programmatic-seo) | Models whether a template-page build pays back before anything gets written. | Design |
|  | [`seo-content-brief`](skills/seo-content-brief) | Produces a writer-ready brief: intent, answer block, entities, internal links. | Design |
| **E** | [`seo-geo-aeo-audit`](skills/seo-geo-aeo-audit) | Scores a page 0-100 across SEO, GEO and AEO, with fixes in priority order. | Diagnose |

### Content & Copy

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`brand-voice-governance`](skills/brand-voice-governance) | Checks content block by block against your own voice rules, with a pass/revise verdict. | Execute |
| **E** | [`content-calendar-planning`](skills/content-calendar-planning) | Costs a content plan in hours against real capacity, and names what to cut. | Execute |
|  | [`content-repurposing`](skills/content-repurposing) | Turns one pillar asset into channel-adapted derivatives, reusing only what it says. | Execute |
| **E** | [`copywriting`](skills/copywriting) | Rewrites page copy to ladder to the positioning, scored on claim-defensibility. | Execute |

### Conversion & Web

| | Skill | What it does | Phase |
|---|---|---|---|
|  | [`landing-page-brief`](skills/landing-page-brief) | Specs a landing page before anyone designs it. | Execute |
| **E** | [`signup-flow-optimizer`](skills/signup-flow-optimizer) | Scores signup friction and ranks what to remove by what it's worth. | Execute |
| **E** | [`website-conversion-audit`](skills/website-conversion-audit) | Audits a page for conversion friction and grades it. | Diagnose |

### Paid Media & Budgeting

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`marketing-budget-planning`](skills/marketing-budget-planning) | Plans a budget from a CAC target rather than a percentage of revenue. | Design |
| **E** | [`paid-media-budget-allocation`](skills/paid-media-budget-allocation) | Splits spend across channels to hit a CAC target, with diminishing returns modelled. | Design |

### Analytics & Experimentation

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`ab-test-significance`](skills/ab-test-significance) | Checks whether an A/B result is significant, or sizes a test before you run it. | Execute |
| **E** | [`incrementality-and-mmm`](skills/incrementality-and-mmm) | Designs and reads holdout tests honestly, including whether they could ever have answered. | Diagnose |
| **E** | [`marketing-report`](skills/marketing-report) | Turns funnel, spend and pipeline numbers into a board-ready narrative. | Execute |
| **E** | [`unit-economics`](skills/unit-economics) | Computes LTV, CAC, payback and the ratio, then returns a verdict against benchmarks. | Diagnose |

### Sales & Pipeline

| | Skill | What it does | Phase |
|---|---|---|---|
|  | [`cold-email-sequence`](skills/cold-email-sequence) | Writes outbound sequences that survive a reply-rate audit. | Execute |
|  | [`discovery-call-framework`](skills/discovery-call-framework) | Structures discovery so the call qualifies rather than pitches. | Execute |
|  | [`objection-handling`](skills/objection-handling) | Builds responses to the objections that actually lose deals. | Design |
| **E** | [`pipeline-and-forecast`](skills/pipeline-and-forecast) | Weights pipeline by stage and says whether coverage is real. | Execute |
|  | [`sales-process-design`](skills/sales-process-design) | Designs the stages and exit criteria a forecast can rely on. | Design |
| **E** | [`target-account-list`](skills/target-account-list) | Scores and tiers accounts by ICP fit, showing the signals each matched. | Design |
| **E** | [`win-loss-analysis`](skills/win-loss-analysis) | Finds the Pareto of why deals are actually lost, by revenue. | Diagnose |

### Retention & Lifecycle

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`email-lifecycle-sequence`](skills/email-lifecycle-sequence) | Maps which lifecycle sequences exist, checks send load, writes the missing ones. | Execute |
| **E** | [`lifecycle-and-retention`](skills/lifecycle-and-retention) | Computes churn, NRR, GRR and quick ratio, then diagnoses which one to fix. | Design |
|  | [`onboarding-activation`](skills/onboarding-activation) | Defines the activation moment from data and finds where new users stall. | Execute |

### Growth, Retention & RevOps

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`marketing-loops`](skills/marketing-loops) | Computes the loop factor, finds the throttling stage, projects users over time. | Design |

---

## Engines at a glance

Every runnable engine, and the command to try it:

| Skill | Command |
|---|---|
| `ab-test-significance` | `node .agents/skills/ab-test-significance/resources/significance.js --demo` |
| `agent-readiness-audit` | `node .agents/skills/agent-readiness-audit/resources/agent-readiness.js --demo` |
| `brand-voice-governance` | `node .agents/skills/brand-voice-governance/resources/voice-check.js --demo` |
| `content-calendar-planning` | `node .agents/skills/content-calendar-planning/resources/calendar-engine.js --demo` |
| `copywriting` | `node .agents/skills/copywriting/resources/copy-scorer.js --demo` |
| `customer-survey-design` | `node .agents/skills/customer-survey-design/resources/survey-design.js --demo` |
| `email-lifecycle-sequence` | `node .agents/skills/email-lifecycle-sequence/resources/lifecycle-audit.js --demo` |
| `geo-citation-tracker` | `node .agents/skills/geo-citation-tracker/resources/citation-tracker.js --demo` |
| `incrementality-and-mmm` | `node .agents/skills/incrementality-and-mmm/resources/incrementality.js --demo` |
| `lifecycle-and-retention` | `node .agents/skills/lifecycle-and-retention/resources/retention.js --demo` |
| `marketing-budget-planning` | `node .agents/skills/marketing-budget-planning/resources/budget-planner.js --demo` |
| `marketing-loops` | `node .agents/skills/marketing-loops/resources/loop-model.js --demo` |
| `marketing-psychology` | `node .agents/skills/marketing-psychology/resources/pattern-check.js --demo` |
| `marketing-report` | `node .agents/skills/marketing-report/resources/marketing-report.js --demo` |
| `paid-media-budget-allocation` | `node .agents/skills/paid-media-budget-allocation/resources/allocation-engine.js --demo` |
| `pipeline-and-forecast` | `node .agents/skills/pipeline-and-forecast/resources/forecast.js --demo` |
| `pricing-and-packaging` | `node .agents/skills/pricing-and-packaging/resources/price-packaging.js --demo` |
| `programmatic-seo` | `node .agents/skills/programmatic-seo/resources/pseo-model.js --demo` |
| `seo-geo-aeo-audit` | `node .agents/skills/seo-geo-aeo-audit/resources/score.js --demo` |
| `signup-flow-optimizer` | `node .agents/skills/signup-flow-optimizer/resources/friction-score.js --demo` |
| `target-account-list` | `node .agents/skills/target-account-list/resources/score-accounts.js --demo` |
| `unit-economics` | `node .agents/skills/unit-economics/resources/unit-economics.js --demo` |
| `website-conversion-audit` | `node .agents/skills/website-conversion-audit/resources/score.js --demo` |
| `win-loss-analysis` | `node .agents/skills/win-loss-analysis/resources/win-loss.js --demo` |

---

## Methodology

Every skill is tagged to a phase, and the ordering is deliberate — the catalog refuses to let you execute before you have diagnosed.

- **Diagnose** (9 skills) — find out what is actually broken before choosing a fix.
- **Design** (15 skills) — decide the approach, with the trade-offs stated.
- **Execute** (15 skills) — build and ship it.

If you do not know where to start, `campaign-orchestrator` diagnoses which play applies and sequences the rest for you.

New to the catalog? Run `brand-product-context` first. It builds the shared brief every other skill reads.

---

## Authoring & contributing

See [AUTHORING_GUIDE.md](AUTHORING_GUIDE.md) for the standard every skill follows, and [SKILL_TEMPLATE.md](SKILL_TEMPLATE.md) to start a new one.

---

## Credits & license

[MIT](LICENSE) — use freely, commercially or otherwise.

Built by Saroj Jha / [AAJ](https://aajconsult.com), a marketing consultancy for Seed–Series B startups. The [Agent Skills spec](https://agentskills.io) and Corey Haines' [`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills) (MIT) were references for structure and topic coverage; all AAJ skills are independently written and grounded in AAJ's own tools and methodology.

