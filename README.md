# The math layer for marketing agents

[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/sarojkjha/aaj-marketing-skills)

<!-- aaj:n skills -->74<!-- aaj:/n --> marketing skills for AI agents, and **<!-- aaj:n engines -->63<!-- aaj:/n --> of them run real engines**. Each engine is a dependency-free Node script. It takes your numbers and returns a number and a verdict: LTV:CAC and payback, pipeline coverage, A/B significance, budget splits, price ladders, NRR, market size, inference cost.

Most marketing skills are writing instructions. They help an agent draft a page, an email or a plan, so keep them. These add the arithmetic underneath. The agent that drafts your pricing page can check whether the price still covers inference cost. The agent that writes the board update can compute the forecast instead of estimating it. Same input, same output, and code you can read.

Works with Claude Code, OpenAI Codex, Cursor, Windsurf, Cline and any agent that supports the [Agent Skills spec](https://agentskills.io). Free, [MIT](LICENSE), no API key, and the engines make no network calls.

Built by [Saroj Jha](https://github.com/sarojkjha) / [AAJ](https://aajconsult.com). Browsable library at [skills.aajconsult.com](https://skills.aajconsult.com).

**If an engine saves you a spreadsheet, [star the repo](https://github.com/sarojkjha/aaj-marketing-skills/stargazers).** Stars are how other founders, and the directories agents search, find it. Questions and engine requests go in [Discussions](https://github.com/sarojkjha/aaj-marketing-skills/discussions).

> **Renamed on Oct 11, 2026.** `copywriting`, `marketing-psychology`, `programmatic-seo`, `marketing-loops` and `sales-enablement` are now `aaj-copywriting`, `aaj-marketing-psychology`, `aaj-programmatic-seo`, `aaj-marketing-loops` and `aaj-sales-enablement`. Another popular library publishes skills under the same five names, so with the prefix both install side by side. The hosted MCP server still answers to the old names.

---

## Contents

- [Quick start](#quick-start)
- [Install as a Claude Code or Codex plugin](#install-as-a-claude-code-or-codex-plugin)
- [Use it from an MCP client](#use-it-from-an-mcp-client)
- [Recipes: vendor data in, a verdict out](#recipes-vendor-data-in-a-verdict-out)
- [What a runnable engine means](#what-a-runnable-engine-means)
- [The catalog](#the-catalog)
<!-- aaj:begin catalog-contents -->
  - [Strategy & Positioning](#strategy-positioning) — 12 skills, 9 engines
  - [Research & Personas](#research-personas) — 4 skills, 3 engines
  - [SEO, GEO & AEO](#seo-geo-aeo) — 9 skills, 8 engines
  - [Content & Copy](#content-copy) — 11 skills, 10 engines
  - [Conversion & Web](#conversion-web) — 5 skills, 4 engines
  - [Paid Media & Budgeting](#paid-media-budgeting) — 5 skills, 5 engines
  - [Analytics & Experimentation](#analytics-experimentation) — 4 skills, 4 engines
  - [Sales & Pipeline](#sales-pipeline) — 12 skills, 9 engines
  - [Retention & Lifecycle](#retention-lifecycle) — 3 skills, 2 engines
  - [Growth, Retention & RevOps](#growth-retention-revops) — 9 skills, 9 engines
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

Step-by-step instructions for every agent, Windows, Mac and Linux, and the hosted server: [docs/install.md](docs/install.md).

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

## Install as a Claude Code or Codex plugin

**Claude Code.** In Claude Code 2.1.275 or later, one line adds the marketplace and opens the plugin:

```
/plugin install aaj-marketing-skills --marketplace sarojkjha/aaj-marketing-skills
```

On earlier versions, run two commands:

```
/plugin marketplace add sarojkjha/aaj-marketing-skills
/plugin install aaj-marketing-skills@aaj
```

The skills then appear as `/aaj-marketing-skills:<skill>`. The plugin also starts the local AAJ engines MCP server (`platform/mcp/server.mjs`, Node 18+), so Claude can call `run_engine` directly. It runs on your machine and AAJ receives nothing. Updates arrive when you run `/plugin marketplace update aaj`.

**OpenAI Codex.** Add the marketplace, then install the plugin (or browse it with `/plugins` inside Codex):

```
codex plugin marketplace add sarojkjha/aaj-marketing-skills
codex plugin add aaj-marketing-skills@aaj
```

`codex plugin marketplace upgrade aaj` picks up new skills. Codex reads `.agents/plugins/marketplace.json`, and both clients load every skill in `skills/`.

---

## Use it from an MCP client

Instead of installing the skills into a project, you can expose all <!-- aaj:n skills -->74<!-- aaj:/n --> skills and
all <!-- aaj:n engines -->63<!-- aaj:/n --> engines to any MCP client — Claude Desktop, Claude Code, Cursor, Windsurf —
as five tools:

| Tool | What it does |
|---|---|
| `list_engines` | Every runnable engine, grouped by category |
| `describe_engine` | One engine's input schema, units and worked example |
| `run_engine` | Runs it on your numbers, or the demo if you pass none |
| `search_skills` | Finds a skill by the problem, not the name |
| `get_skill` | The full method for one skill |

**Hosted, no install.** Add this URL as a custom connector (a remote MCP server) in Claude, ChatGPT or any MCP client:

```
https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp
```

No sign-in. The server runs the engines in memory and keeps no copy of what you send ([what happens to your data](#what-happens-to-your-data)). In Claude: Settings → Connectors → Add custom connector. Then ask, for example, "Use the AAJ engines to check my unit economics: CAC $1,200, ARPA $300 a month, 80% gross margin, 3% monthly churn."

**Local.** Clone the repo and point your client at one file. Node 18+, no dependencies,
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
numbers, rather than estimating. Run locally, AAJ receives nothing; your agent's
model provider still sees what you give the agent.

### What happens to your data

The engines are deterministic scripts. They make no network calls, write no files and take no actions in your tools; they compute and return text and JSON. Where your numbers travel depends on how you run them:

| How you run it | Where your inputs go |
|---|---|
| Skill installed in your agent, or the local MCP server | The engine runs on your machine and AAJ receives nothing. Your AI agent still sends what you give it to its model provider (Anthropic, OpenAI and so on), under your own account's terms. |
| Hosted MCP server | Your agent's model provider, as above, plus AAJ's server on Cloudflare, which receives the engine inputs over HTTPS, runs them in memory and keeps no copy. Cloudflare keeps error logs (no inputs) for up to 7 days. |

Don't pass customer names, emails or other personal data to an engine; none of them needs it.

Setup for each client, troubleshooting, and the smoke test:
[`platform/mcp/README.md`](platform/mcp/README.md).

---

## Recipes: vendor data in, a verdict out

Vendor MCP servers bring the data; the engines turn it into a verdict. Each recipe is a prompt to paste, a field-by-field mapping and the checks to make before you trust the result:

- [HubSpot deals into `pipeline-and-forecast`](recipes/hubspot-to-pipeline-forecast.md): weighted forecast, coverage against your win rate, and the lever to pull.
- [GA4 results into `ab-test-significance`](recipes/ga4-to-ab-test-significance.md): sample size before the test, a verdict after it.
- [Ahrefs or Semrush keyword data into `aaj-programmatic-seo`](recipes/keyword-data-to-programmatic-seo.md): whether a template-page build pays back.
- [Stripe export into `unit-economics`](recipes/stripe-to-unit-economics.md): gross-margin LTV, CAC payback, and whether your economics support growth.

---

## What a runnable engine means

Most agent skills are instructions. These are too — but <!-- aaj:n engines -->63<!-- aaj:/n --> of them also ship a dependency-free Node script that does the arithmetic and returns a judgement.

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
| **E** | [`aaj-marketing-psychology`](skills/aaj-marketing-psychology) | Diagnoses which decision friction blocks the buyer, with a line between persuasion and manipulation. | Design |
| **E** | [`ai-inference-pricing`](skills/ai-inference-pricing) | Checks that an AI plan's price still covers inference when usage spikes. | Design |
|  | [`brand-product-context`](skills/brand-product-context) | Builds the shared brand brief every other skill reads first. | Diagnose |
| **E** | [`campaign-orchestrator`](skills/campaign-orchestrator) | Diagnoses which play applies, then sequences the other skills in order. | Diagnose |
| **E** | [`competitor-messaging-matrix`](skills/competitor-messaging-matrix) | Reads rival homepages side by side and says which claims are crowded, which are open, and whether your headline blends in. | Diagnose |
| **E** | [`market-sizing`](skills/market-sizing) | Sizes TAM, SAM and SOM bottom-up, with SOM set by capacity rather than a share of the market. | Diagnose |
| **E** | [`marketing-maturity-assessment`](skills/marketing-maturity-assessment) | Scores marketing as a system across six dimensions, and names the weak links to fix first for your stage. | Diagnose |
|  | [`messaging-framework`](skills/messaging-framework) | Structures the message hierarchy beneath the positioning. | Design |
| **E** | [`positioning-statement`](skills/positioning-statement) | Produces a positioning statement pressure-tested against the competitive alternative. | Design |
| **E** | [`pricing-and-packaging`](skills/pricing-and-packaging) | Designs tiers with an anchor check and a willingness-to-pay read. | Design |
| **E** | [`pricing-page-teardown`](skills/pricing-page-teardown) | Scores a pricing page on 21 buyer checks, and says whether a price test can answer the question at your traffic. | Diagnose |
|  | [`value-proposition`](skills/value-proposition) | Sharpens the value proposition into something defensible. | Design |

### Research & Personas

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`customer-interview-synthesis`](skills/customer-interview-synthesis) | Turns coded interview notes into ranked patterns and anecdotes, and says whether you can stop interviewing. | Diagnose |
| **E** | [`customer-survey-design`](skills/customer-survey-design) | Designs surveys that produce usable answers, with sample sizing and segments. | Diagnose |
|  | [`persona-builder`](skills/persona-builder) | Builds personas from evidence rather than imagination. | Design |
| **E** | [`review-mining`](skills/review-mining) | Codes pasted reviews of you and your rivals into themes, switching reasons, feature asks and buyer language. | Diagnose |

### SEO, GEO & AEO

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`aaj-programmatic-seo`](skills/aaj-programmatic-seo) | Models whether a template-page build pays back before anything gets written. | Design |
| **E** | [`agent-readiness-audit`](skills/agent-readiness-audit) | Scores whether an AI agent buying for a customer can find, evaluate and transact with you. | Diagnose |
| **E** | [`content-decay`](skills/content-decay) | Sorts a Search Console export into decaying, demand-drop, snippet-loss, rising and stable pages, and ranks what to refresh by clicks lost. | Diagnose |
| **E** | [`geo-citation-tracker`](skills/geo-citation-tracker) | Measures whether AI engines name and cite you, and refuses to report noise as movement. | Execute |
|  | [`geo-content-optimization`](skills/geo-content-optimization) | Rewrites a page to maximise the chance an AI engine cites it. | Execute |
| **E** | [`search-demand-reader`](skills/search-demand-reader) | Reads a Search Console Queries export by intent and topic, and names the demand you already appear for but do not yet win. | Diagnose |
| **E** | [`seo-content-brief`](skills/seo-content-brief) | Produces a writer-ready brief: intent, answer block, entities, internal links. | Design |
| **E** | [`seo-geo-aeo-audit`](skills/seo-geo-aeo-audit) | Scores a page 0-100 across SEO, GEO and AEO, with fixes in priority order. | Diagnose |
| **E** | [`structured-data-for-ai-search`](skills/structured-data-for-ai-search) | Maps schema types to pages, then checks each page's JSON-LD against Google's docs and the visible text. | Execute |

### Content & Copy

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`aaj-copywriting`](skills/aaj-copywriting) | Rewrites page copy to ladder to the positioning, scored on claim-defensibility. | Execute |
| **E** | [`ai-marketing-governance`](skills/ai-marketing-governance) | Scores whether a team's AI use is governed, and refuses citations that cannot be checked. | Execute |
| **E** | [`brand-voice-definition`](skills/brand-voice-definition) | Derives the measurable half of a voice guide from writing you agree sounds right, as a checkable profile. | Design |
| **E** | [`brand-voice-governance`](skills/brand-voice-governance) | Checks content block by block against your own voice rules, with a pass/revise verdict. | Execute |
| **E** | [`case-study-and-proof`](skills/case-study-and-proof) | Scores whether proof would convince a sceptic, and whether you may publish it at all. | Execute |
| **E** | [`claims-and-proof-check`](skills/claims-and-proof-check) | Flags every claim in your copy that needs proof or consent, sentence by sentence, with the regulator's own guidance. | Execute |
| **E** | [`comparison-pages`](skills/comparison-pages) | Builds vs and alternatives pages with sourced, dated rival facts, and checks they admit where the rival wins. | Execute |
| **E** | [`content-calendar-planning`](skills/content-calendar-planning) | Costs a content plan in hours against real capacity, and names what to cut. | Execute |
|  | [`content-repurposing`](skills/content-repurposing) | Turns one pillar asset into channel-adapted derivatives, reusing only what it says. | Execute |
| **E** | [`founder-led-content`](skills/founder-led-content) | Scores a founder's channel setup, and checks a post against the themes only they can write. | Execute |
| **E** | [`pr-and-earned-media`](skills/pr-and-earned-media) | Scores a story before it is pitched, and aims it at twenty of the right people. | Execute |

### Conversion & Web

| | Skill | What it does | Phase |
|---|---|---|---|
|  | [`landing-page-brief`](skills/landing-page-brief) | Specs a landing page before anyone designs it. | Execute |
| **E** | [`lead-magnet-and-free-tool-design`](skills/lead-magnet-and-free-tool-design) | Scores lead-magnet and free-tool ideas on the job they do against build effort, and judges live ones on qualified leads. | Design |
| **E** | [`plg-upgrade-prompts`](skills/plg-upgrade-prompts) | Reads each upgrade prompt's funnel with honest intervals and names the prompt and stage to fix first. | Diagnose |
| **E** | [`signup-flow-optimizer`](skills/signup-flow-optimizer) | Scores signup friction and ranks what to remove by what it's worth. | Execute |
| **E** | [`website-conversion-audit`](skills/website-conversion-audit) | Audits a page for conversion friction and grades it. | Diagnose |

### Paid Media & Budgeting

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`ad-creative-testing`](skills/ad-creative-testing) | Sizes a creative test before it runs, and refuses to name a winner the data cannot back. | Execute |
| **E** | [`channel-selection-and-testing`](skills/channel-selection-and-testing) | Says how much to spend, and for how long, before judging a channel - and when to stop early. | Design |
| **E** | [`marketing-budget-planning`](skills/marketing-budget-planning) | Sizes a marketing budget by stage, shows where each figure comes from, and splits it by function. | Design |
| **E** | [`paid-media-budget-allocation`](skills/paid-media-budget-allocation) | Splits spend across channels to hit a CAC target, with diminishing returns modelled. | Design |
| **E** | [`paid-search-account-audit`](skills/paid-search-account-audit) | Audits a search account against its own target: tracking, waste, starved winners, pages. Fixes ranked by spend. | Diagnose |

### Analytics & Experimentation

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`ab-test-significance`](skills/ab-test-significance) | Checks whether an A/B result is significant, or sizes a test before you run it. | Execute |
| **E** | [`incrementality-and-mmm`](skills/incrementality-and-mmm) | Designs and reads holdout tests honestly, including whether they could ever have answered. | Diagnose |
| **E** | [`marketing-report`](skills/marketing-report) | Turns funnel, spend and pipeline numbers into a board-ready narrative. | Execute |
| **E** | [`unit-economics`](skills/unit-economics) | Computes LTV, CAC, payback and the ratio, then returns a verdict against named reference points. | Diagnose |

### Sales & Pipeline

| | Skill | What it does | Phase |
|---|---|---|---|
| **E** | [`aaj-sales-enablement`](skills/aaj-sales-enablement) | Audits sales assets against what each deal stage needs, and ranks what to build by the revenue being lost. | Execute |
| **E** | [`abm-program-design`](skills/abm-program-design) | Checks whether the team can run the account list and whether the list hits the number. | Design |
| **E** | [`buying-committee-map`](skills/buying-committee-map) | Maps who must say yes, what each must believe, and who you cannot reach, then orders the next conversations. | Design |
|  | [`cold-email-sequence`](skills/cold-email-sequence) | Writes outbound sequences that survive a reply-rate audit. | Execute |
|  | [`discovery-call-framework`](skills/discovery-call-framework) | Structures discovery so the call qualifies rather than pitches. | Execute |
| **E** | [`lead-handoff-sla`](skills/lead-handoff-sla) | Checks whether MQLs get worked on time, whether sales takes them, and whether the threshold is in the right place. | Execute |
| **E** | [`objection-handling`](skills/objection-handling) | Builds responses to the objections that lose deals, and checks the battlecard before reps use it. | Design |
| **E** | [`pilot-to-contract`](skills/pilot-to-contract) | Plans a pilot backwards from the buyer's budget date, so a pilot that works becomes a contract. | Design |
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
| **E** | [`aaj-marketing-loops`](skills/aaj-marketing-loops) | Computes the loop factor, finds the throttling stage, projects users over time. | Design |
| **E** | [`community-and-dark-social`](skills/community-and-dark-social) | Maps where buyers already talk, decides whether to open your own community, and measures dark social by asking. | Execute |
| **E** | [`creator-partnerships`](skills/creator-partnerships) | Pays creators for the buyers they reach, not their follower count, and judges the result on what it sold. | Execute |
| **E** | [`first-marketing-hire`](skills/first-marketing-hire) | Writes the first marketer's scorecard, then scores the panel's evidence and calls hire, no-hire or more evidence. | Design |
| **E** | [`marketing-leadership-model`](skills/marketing-leadership-model) | Prices in-house, fractional and agency with ramp, search time and your own hours, and says which shape fits. | Diagnose |
| **E** | [`partnerships-and-co-marketing`](skills/partnerships-and-co-marketing) | Scores partners on audience overlap rather than fame, and judges the result on pipeline. | Execute |
| **E** | [`product-launch`](skills/product-launch) | Tiers a launch, scores readiness on a twelve-item gate, and builds the dated work-back plan. | Execute |
| **E** | [`referral-program-design`](skills/referral-program-design) | Designs who to ask and what to reward, then prices referral against the CAC it replaces. | Design |
| **E** | [`webinar-and-event-programs`](skills/webinar-and-event-programs) | Sizes a webinar backwards from the pipeline it must create, and judges it on meetings and pipeline against cost. | Execute |
<!-- aaj:end catalog -->

---

## Engines at a glance

Every runnable engine, and the command to try it:

<!-- aaj:begin engines -->
| Skill | Command |
|---|---|
| `aaj-copywriting` | `node .agents/skills/aaj-copywriting/resources/copy-scorer.js --demo` |
| `aaj-marketing-loops` | `node .agents/skills/aaj-marketing-loops/resources/loop-model.js --demo` |
| `aaj-marketing-psychology` | `node .agents/skills/aaj-marketing-psychology/resources/pattern-check.js --demo` |
| `aaj-programmatic-seo` | `node .agents/skills/aaj-programmatic-seo/resources/pseo-model.js --demo` |
| `aaj-sales-enablement` | `node .agents/skills/aaj-sales-enablement/resources/enablement-audit.js --demo` |
| `ab-test-significance` | `node .agents/skills/ab-test-significance/resources/significance.js --demo` |
| `abm-program-design` | `node .agents/skills/abm-program-design/resources/abm-design.js --demo` |
| `ad-creative-testing` | `node .agents/skills/ad-creative-testing/resources/creative-test.js --demo` |
| `agent-readiness-audit` | `node .agents/skills/agent-readiness-audit/resources/agent-readiness.js --demo` |
| `ai-inference-pricing` | `node .agents/skills/ai-inference-pricing/resources/inference-pricing.js --demo` |
| `ai-marketing-governance` | `node .agents/skills/ai-marketing-governance/resources/ai-governance.js --demo` |
| `brand-voice-definition` | `node .agents/skills/brand-voice-definition/resources/voice-derive.js --demo` |
| `brand-voice-governance` | `node .agents/skills/brand-voice-governance/resources/voice-check.js --demo` |
| `buying-committee-map` | `node .agents/skills/buying-committee-map/resources/buying-committee.js --demo` |
| `campaign-orchestrator` | `node .agents/skills/campaign-orchestrator/resources/decision-guides.js --demo` |
| `case-study-and-proof` | `node .agents/skills/case-study-and-proof/resources/proof-check.js --demo` |
| `channel-selection-and-testing` | `node .agents/skills/channel-selection-and-testing/resources/channel-test.js --demo` |
| `claims-and-proof-check` | `node .agents/skills/claims-and-proof-check/resources/claims-check.js --demo` |
| `community-and-dark-social` | `node .agents/skills/community-and-dark-social/resources/dark-social-read.js --demo` |
| `comparison-pages` | `node .agents/skills/comparison-pages/resources/comparison-check.js --demo` |
| `competitor-messaging-matrix` | `node .agents/skills/competitor-messaging-matrix/resources/messaging-matrix.js --demo` |
| `content-calendar-planning` | `node .agents/skills/content-calendar-planning/resources/calendar-engine.js --demo` |
| `content-decay` | `node .agents/skills/content-decay/resources/content-decay.js --demo` |
| `creator-partnerships` | `node .agents/skills/creator-partnerships/resources/creator-fit.js --demo` |
| `customer-interview-synthesis` | `node .agents/skills/customer-interview-synthesis/resources/interview-synthesis.js --demo` |
| `customer-survey-design` | `node .agents/skills/customer-survey-design/resources/survey-design.js --demo` |
| `email-lifecycle-sequence` | `node .agents/skills/email-lifecycle-sequence/resources/lifecycle-audit.js --demo` |
| `first-marketing-hire` | `node .agents/skills/first-marketing-hire/resources/hire-scorecard.js --demo` |
| `founder-led-content` | `node .agents/skills/founder-led-content/resources/founder-channel.js --demo` |
| `geo-citation-tracker` | `node .agents/skills/geo-citation-tracker/resources/citation-tracker.js --demo` |
| `incrementality-and-mmm` | `node .agents/skills/incrementality-and-mmm/resources/incrementality.js --demo` |
| `lead-handoff-sla` | `node .agents/skills/lead-handoff-sla/resources/handoff-sla.js --demo` |
| `lead-magnet-and-free-tool-design` | `node .agents/skills/lead-magnet-and-free-tool-design/resources/lead-magnet-fit.js --demo` |
| `lifecycle-and-retention` | `node .agents/skills/lifecycle-and-retention/resources/retention.js --demo` |
| `market-sizing` | `node .agents/skills/market-sizing/resources/market-size.js --demo` |
| `marketing-budget-planning` | `node .agents/skills/marketing-budget-planning/resources/budget-planner.js --demo` |
| `marketing-leadership-model` | `node .agents/skills/marketing-leadership-model/resources/leadership-model.js --demo` |
| `marketing-maturity-assessment` | `node .agents/skills/marketing-maturity-assessment/resources/maturity-assessment.js --demo` |
| `marketing-report` | `node .agents/skills/marketing-report/resources/marketing-report.js --demo` |
| `objection-handling` | `node .agents/skills/objection-handling/resources/battlecard.js --demo` |
| `paid-media-budget-allocation` | `node .agents/skills/paid-media-budget-allocation/resources/allocation-engine.js --demo` |
| `paid-search-account-audit` | `node .agents/skills/paid-search-account-audit/resources/search-audit.js --demo` |
| `partnerships-and-co-marketing` | `node .agents/skills/partnerships-and-co-marketing/resources/partner-fit.js --demo` |
| `pilot-to-contract` | `node .agents/skills/pilot-to-contract/resources/pilot-plan.js --demo` |
| `pipeline-and-forecast` | `node .agents/skills/pipeline-and-forecast/resources/forecast.js --demo` |
| `plg-upgrade-prompts` | `node .agents/skills/plg-upgrade-prompts/resources/upgrade-funnel.js --demo` |
| `positioning-statement` | `node .agents/skills/positioning-statement/resources/positioning.js --demo` |
| `pr-and-earned-media` | `node .agents/skills/pr-and-earned-media/resources/newsworthiness.js --demo` |
| `pricing-and-packaging` | `node .agents/skills/pricing-and-packaging/resources/price-packaging.js --demo` |
| `pricing-page-teardown` | `node .agents/skills/pricing-page-teardown/resources/pricing-teardown.js --demo` |
| `product-launch` | `node .agents/skills/product-launch/resources/launch.js --demo` |
| `referral-program-design` | `node .agents/skills/referral-program-design/resources/referral-economics.js --demo` |
| `review-mining` | `node .agents/skills/review-mining/resources/review-miner.js --demo` |
| `search-demand-reader` | `node .agents/skills/search-demand-reader/resources/search-demand.js --demo` |
| `seo-content-brief` | `node .agents/skills/seo-content-brief/resources/brief-check.js --demo` |
| `seo-geo-aeo-audit` | `node .agents/skills/seo-geo-aeo-audit/resources/score.js --demo` |
| `signup-flow-optimizer` | `node .agents/skills/signup-flow-optimizer/resources/friction-score.js --demo` |
| `structured-data-for-ai-search` | `node .agents/skills/structured-data-for-ai-search/resources/schema-check.js --demo` |
| `target-account-list` | `node .agents/skills/target-account-list/resources/score-accounts.js --demo` |
| `unit-economics` | `node .agents/skills/unit-economics/resources/unit-economics.js --demo` |
| `webinar-and-event-programs` | `node .agents/skills/webinar-and-event-programs/resources/event-program.js --demo` |
| `website-conversion-audit` | `node .agents/skills/website-conversion-audit/resources/score.js --demo` |
| `win-loss-analysis` | `node .agents/skills/win-loss-analysis/resources/win-loss.js --demo` |
<!-- aaj:end engines -->

---

## Methodology

Every skill is tagged to a phase, and the ordering is deliberate — the catalog refuses to let you execute before you have diagnosed.

- **Diagnose** (<!-- aaj:n phase-diagnose -->20<!-- aaj:/n --> skills) — find out what is actually broken before choosing a fix.
- **Design** (<!-- aaj:n phase-design -->24<!-- aaj:/n --> skills) — decide the approach, with the trade-offs stated.
- **Execute** (<!-- aaj:n phase-execute -->30<!-- aaj:/n --> skills) — build and ship it.

If you do not know where to start, `campaign-orchestrator` diagnoses which play applies and sequences the rest for you.

New to the catalog? Run `brand-product-context` first. It builds the shared brief every other skill reads.

---

## Authoring & contributing

See [AUTHORING_GUIDE.md](AUTHORING_GUIDE.md) for the standard every skill follows, and [SKILL_TEMPLATE.md](SKILL_TEMPLATE.md) to start a new one.

---

## Credits & license

[MIT](LICENSE) — use freely, commercially or otherwise.

Built by Saroj Jha / [AAJ](https://aajconsult.com), a marketing consultancy for Seed–Series B startups. The [Agent Skills spec](https://agentskills.io) and Corey Haines' [`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills) (MIT) were references for structure and topic coverage; all AAJ skills are independently written and grounded in AAJ's own tools and methodology.

