# <!-- aaj:n skills -->47<!-- aaj:/n --> Marketing Skills for AI agents. <!-- aaj:n engines -->33<!-- aaj:/n --> run real engines.

Agent skills for marketing work — grounded in AAJ's tested tools and methodology, not generic advice. **<!-- aaj:n engines -->33<!-- aaj:/n --> of the <!-- aaj:n skills -->47<!-- aaj:/n --> ship a runnable engine**: a Node script you execute directly that takes your numbers and returns a verdict, not a template to fill in.

Works with Claude Code, Cursor, OpenAI Codex, Windsurf, and any agent supporting the [Agent Skills spec](https://agentskills.io). Free, [MIT](LICENSE), no signup, nothing routed through a server.

Built by [Saroj Jha](https://github.com/sarojkjha) / [AAJ](https://aajconsult.com). Browsable library at [skills.aajconsult.com](https://skills.aajconsult.com).

---

## Contents

- [Quick start](#quick-start)
- [Use it from an MCP client](#use-it-from-an-mcp-client)
- [What a runnable engine means](#what-a-runnable-engine-means)
- [The catalog](#the-catalog)
<!-- aaj:begin catalog-contents -->
  - [Strategy & Positioning](#strategy-positioning) — 8 skills, 3 engines
  - [Research & Personas](#research-personas) — 2 skills, 1 engine
  - [SEO, GEO & AEO](#seo-geo-aeo) — 6 skills, 4 engines
  - [Content & Copy](#content-copy) — 8 skills, 7 engines
  - [Conversion & Web](#conversion-web) — 3 skills, 2 engines
  - [Paid Media & Budgeting](#paid-media-budgeting) — 2 skills, 2 engines
  - [Analytics & Experimentation](#analytics-experimentation) — 4 skills, 4 engines
  - [Sales & Pipeline](#sales-pipeline) — 8 skills, 5 engines
  - [Retention & Lifecycle](#retention-lifecycle) — 3 skills, 2 engines
  - [Growth, Retention & RevOps](#growth-retention-revops) — 3 skills, 3 engines
<!-- aaj:end catalog-contents -->
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

## Use it from an MCP client

Instead of installing the skills into a project, you can expose all 43 skills and
all 28 engines to any MCP client — Claude Desktop, Claude Code, Cursor, Windsurf —
as five tools:

| Tool | What it does |
|---|---|
| `list_engines` | Every runnable engine, grouped by category |
| `describe_engine` | One engine's input schema, units and worked example |
| `run_engine` | Runs it on your numbers, or the demo if you pass none |
| `search_skills` | Finds a skill by the problem, not the name |
| `get_skill` | The full method for one skill |

Clone the repo and point your client at one file. Node 18+, no dependencies,
no build step:

```json
{
  "mcpServers": {
    "aaj-engines": {
      "command": "node",
      "args": ["/absolute/path/to/aaj-marketing-skills/platform/mcp/server.mjs"]
    }
  }
}
```

Your agent can then find the right method for a problem and run the math on your
numbers, rather than estimating. Nothing leaves your machine — the engines are
local, deterministic, and make no network calls.

Setup for each client, troubleshooting, and the smoke test:
[`platform/mcp/README.md`](platform/mcp/README.md).

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

<!-- aaj:begin catalog -->
### Strategy & Positioning

| | Skill | What it does | Phase |
|---|---|---|---|
|  | [`brand-product-context`](skills/brand-product-context) | Builds the shared brand brief every other skill reads first. | Diagnose |
|  | [`campaign-orchestrator`](skills/campaign-orchestrator) | Diagnoses which play applies, then sequences the other skills in order. | Diagnose |
| **E** | [`market-sizing`](skills/market-sizing) | Sizes TAM, SAM and SOM bottom-up, with SOM set by capacity rather than a share of the market. | Diagnose |
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
| **E** | [`ai-marketing-governance`](skills/ai-marketing-governance) | Scores whether a team's AI use is governed, and refuses citations that cannot be checked. | Execute |
| **E** | [`brand-voice-governance`](skills/brand-voice-governance) | Checks content block by block against your own voice rules, with a pass/revise verdict. | Execute |
| **E** | [`case-study-and-proof`](skills/case-study-and-proof) | Scores whether proof would convince a sceptic, and whether you may publish it at all. | Execute |
| **E** | [`content-calendar-planning`](skills/content-calendar-planning) | Costs a content plan in hours against real capacity, and names what to cut. | Execute |
|  | [`content-repurposing`](skills/content-repurposing) | Turns one pillar asset into channel-adapted derivatives, reusing only what it says. | Execute |
| **E** | [`copywriting`](skills/copywriting) | Rewrites page copy to ladder to the positioning, scored on claim-defensibility. | Execute |
| **E** | [`founder-led-content`](skills/founder-led-content) | Scores a founder's channel setup, and checks a post against the themes only they can write. | Execute |
| **E** | [`pr-and-earned-media`](skills/pr-and-earned-media) | Scores a story before it is pitched, and aims it at twenty of the right people. | Execute |

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
| **E** | [`abm-program-design`](skills/abm-program-design) | Checks whether the team can run the account list and whether the list hits the number. | Design |
|  | [`cold-email-sequence`](skills/cold-email-sequence) | Writes outbound sequences that survive a reply-rate audit. | Execute |
|  | [`discovery-call-framework`](skills/discovery-call-framework) | Structures discovery so the call qualifies rather than pitches. | Execute |
| **E** | [`objection-handling`](skills/objection-handling) | Builds responses to the objections that lose deals, and checks the battlecard before reps use it. | Design |
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
| **E** | [`partnerships-and-co-marketing`](skills/partnerships-and-co-marketing) | Scores partners on audience overlap rather than fame, and judges the result on pipeline. | Execute |
| **E** | [`product-launch`](skills/product-launch) | Tiers a launch, scores readiness on a twelve-item gate, and builds the dated work-back plan. | Execute |
<!-- aaj:end catalog -->

---

## Engines at a glance

Every runnable engine, and the command to try it:

<!-- aaj:begin engines -->
| Skill | Command |
|---|---|
| `ab-test-significance` | `node .agents/skills/ab-test-significance/resources/significance.js --demo` |
| `abm-program-design` | `node .agents/skills/abm-program-design/resources/abm-design.js --demo` |
| `agent-readiness-audit` | `node .agents/skills/agent-readiness-audit/resources/agent-readiness.js --demo` |
| `ai-marketing-governance` | `node .agents/skills/ai-marketing-governance/resources/ai-governance.js --demo` |
| `brand-voice-governance` | `node .agents/skills/brand-voice-governance/resources/voice-check.js --demo` |
| `case-study-and-proof` | `node .agents/skills/case-study-and-proof/resources/proof-check.js --demo` |
| `content-calendar-planning` | `node .agents/skills/content-calendar-planning/resources/calendar-engine.js --demo` |
| `copywriting` | `node .agents/skills/copywriting/resources/copy-scorer.js --demo` |
| `customer-survey-design` | `node .agents/skills/customer-survey-design/resources/survey-design.js --demo` |
| `email-lifecycle-sequence` | `node .agents/skills/email-lifecycle-sequence/resources/lifecycle-audit.js --demo` |
| `founder-led-content` | `node .agents/skills/founder-led-content/resources/founder-channel.js --demo` |
| `geo-citation-tracker` | `node .agents/skills/geo-citation-tracker/resources/citation-tracker.js --demo` |
| `incrementality-and-mmm` | `node .agents/skills/incrementality-and-mmm/resources/incrementality.js --demo` |
| `lifecycle-and-retention` | `node .agents/skills/lifecycle-and-retention/resources/retention.js --demo` |
| `market-sizing` | `node .agents/skills/market-sizing/resources/market-size.js --demo` |
| `marketing-budget-planning` | `node .agents/skills/marketing-budget-planning/resources/budget-planner.js --demo` |
| `marketing-loops` | `node .agents/skills/marketing-loops/resources/loop-model.js --demo` |
| `marketing-psychology` | `node .agents/skills/marketing-psychology/resources/pattern-check.js --demo` |
| `marketing-report` | `node .agents/skills/marketing-report/resources/marketing-report.js --demo` |
| `objection-handling` | `node .agents/skills/objection-handling/resources/battlecard.js --demo` |
| `paid-media-budget-allocation` | `node .agents/skills/paid-media-budget-allocation/resources/allocation-engine.js --demo` |
| `partnerships-and-co-marketing` | `node .agents/skills/partnerships-and-co-marketing/resources/partner-fit.js --demo` |
| `pipeline-and-forecast` | `node .agents/skills/pipeline-and-forecast/resources/forecast.js --demo` |
| `pr-and-earned-media` | `node .agents/skills/pr-and-earned-media/resources/newsworthiness.js --demo` |
| `pricing-and-packaging` | `node .agents/skills/pricing-and-packaging/resources/price-packaging.js --demo` |
| `product-launch` | `node .agents/skills/product-launch/resources/launch.js --demo` |
| `programmatic-seo` | `node .agents/skills/programmatic-seo/resources/pseo-model.js --demo` |
| `seo-geo-aeo-audit` | `node .agents/skills/seo-geo-aeo-audit/resources/score.js --demo` |
| `signup-flow-optimizer` | `node .agents/skills/signup-flow-optimizer/resources/friction-score.js --demo` |
| `target-account-list` | `node .agents/skills/target-account-list/resources/score-accounts.js --demo` |
| `unit-economics` | `node .agents/skills/unit-economics/resources/unit-economics.js --demo` |
| `website-conversion-audit` | `node .agents/skills/website-conversion-audit/resources/score.js --demo` |
| `win-loss-analysis` | `node .agents/skills/win-loss-analysis/resources/win-loss.js --demo` |
<!-- aaj:end engines -->

---

## Methodology

Every skill is tagged to a phase, and the ordering is deliberate — the catalog refuses to let you execute before you have diagnosed.

- **Diagnose** (<!-- aaj:n phase-diagnose -->10<!-- aaj:/n --> skills) — find out what is actually broken before choosing a fix.
- **Design** (<!-- aaj:n phase-design -->16<!-- aaj:/n --> skills) — decide the approach, with the trade-offs stated.
- **Execute** (<!-- aaj:n phase-execute -->21<!-- aaj:/n --> skills) — build and ship it.

If you do not know where to start, `campaign-orchestrator` diagnoses which play applies and sequences the rest for you.

New to the catalog? Run `brand-product-context` first. It builds the shared brief every other skill reads.

---

## Authoring & contributing

See [AUTHORING_GUIDE.md](AUTHORING_GUIDE.md) for the standard every skill follows, and [SKILL_TEMPLATE.md](SKILL_TEMPLATE.md) to start a new one.

---

## Credits & license

[MIT](LICENSE) — use freely, commercially or otherwise.

Built by Saroj Jha / [AAJ](https://aajconsult.com), a marketing consultancy for Seed–Series B startups. The [Agent Skills spec](https://agentskills.io) and Corey Haines' [`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills) (MIT) were references for structure and topic coverage; all AAJ skills are independently written and grounded in AAJ's own tools and methodology.

