# GEO Citation Tracking — Reference Guide

Companion to the `geo-citation-tracker` skill. Covers how to build a prompt set that measures something, how to log a run consistently, and how to read the output without overclaiming.

## Contents

1. [Building the prompt set](#1-building-the-prompt-set)
2. [Choosing engines and competitors](#2-choosing-engines-and-competitors)
3. [The logging protocol](#3-the-logging-protocol)
4. [Input schema](#4-input-schema)
5. [Reading the output](#5-reading-the-output)
6. [The noise problem](#6-the-noise-problem)
7. [Cadence and drift](#7-cadence-and-drift)
8. [Worked example](#8-worked-example)

---

## 1. Building the prompt set

The prompt set *is* the measurement instrument. A badly built set produces numbers that look rigorous and mean nothing.

**Four prompt types, roughly balanced:**

| Type | Shape | Example |
|---|---|---|
| **Category** | "best / top X for Y" | "best onboarding tools for B2B SaaS" |
| **Problem** | the pain in the buyer's words | "how do I stop trial users going dormant" |
| **Comparison** | named alternatives | "Appcues vs Userflow for mid-market" |
| **Qualifier** | constrained by segment, price, geography | "onboarding tools under $500/mo for a 10-person team" |

**Exclude brand-name prompts.** Asking an engine about a brand and observing that it mentions the brand measures nothing. If the client insists on tracking these, keep them in a separate set and never let them into the presence-rate calculation — they inflate it toward 100% and mask everything else.

**Write prompts as a buyer would type them**, not as a marketer would phrase a keyword. Answer engines are queried in sentences.

**Size the set with design mode before you build it.** Discovering after three months of tracking that the set was never large enough to detect anything is the expensive version of this mistake.

**Then freeze it.** The whole value of tracking is comparability. A set that grows as someone thinks of new prompts produces a time series where every point measures a different thing.

## 2. Choosing engines and competitors

**Engines.** ChatGPT, Perplexity, Claude, and Google AI Overviews cover most of the current surface. Track them separately — they source differently enough that a pooled average describes none of them. Perplexity cites heavily and visibly; AI Overviews skews toward established domains; results diverge accordingly.

**Competitors.** Three to five real alternatives — the ones that actually appear when you run the prompts, not the ones on the aspirational competitive slide. Run a handful of prompts manually first and take the names that keep coming back. Tracking against a competitor who never appears wastes a slot and flatters the share-of-voice number.

## 3. The logging protocol

For every prompt × engine, record five things:

- **`mentioned`** — is the brand named anywhere in the answer? Boolean.
- **`rank`** — among all brands named, what position is it in, reading order? 1 = first. Only meaningful when mentioned.
- **`cited`** — does the brand's **own domain** appear as a linked source? This is not the same as being mentioned. A brand described in prose with a competitor's blog as the only citation scores `mentioned: true, cited: false`.
- **`framing`** — `recommended` (presented as a good fit), `neutral` (listed), or `negative` (caveated, dismissed, or described as a poor fit).
- **`competitors`** — which tracked competitors appeared in that same answer.

**Consistency between runs matters more than precision within a run.** If two people log runs, write down the rule for ambiguous framing calls and apply it the same way every time. A brand listed in a table with no commentary is `neutral`; a brand listed with "better for enterprise teams" when the prompt asked about small teams is `negative`.

**Use a fresh session per prompt** — no memory, no personalization, logged out where possible. Prior turns contaminate the answer.

**Record the date.** Engine model updates move these numbers independently of anything you did.

## 4. Input schema

### Design mode

```json
{
  "baselinePresence": 0.30,
  "detectAbsoluteLift": 0.15,
  "engines": 4,
  "alpha": 0.05,
  "power": 0.80,
  "cadence": "monthly"
}
```

If there's no baseline yet, run a small pilot (15–20 prompts on one engine) and use its presence rate. Guessing the baseline produces a sample size that's wrong in an unknown direction.

### Readout mode

```json
{
  "brand": "Brightlane",
  "runDate": "2026-07-24",
  "engines": {
    "chatgpt": [
      {
        "prompt": "best onboarding tools for B2B SaaS",
        "mentioned": true,
        "rank": 2,
        "cited": false,
        "framing": "recommended",
        "competitors": ["Userflow", "Appcues"]
      }
    ],
    "perplexity": [],
    "claude": [],
    "ai_overviews": []
  },
  "prior": { "mentioned": 11, "cited": 2, "prompts": 40 }
}
```

`prior` is the pooled total from the previous run. Omit it on the first run — the engine will report the baseline and its noise floor.

## 5. Reading the output

**Presence and citation are separate findings.** Report both. The four combinations:

| Presence | Citation | Reading |
|---|---|---|
| Low | Low | Not in the conversation. Check rendering first — an un-prerendered SPA caps citation near zero. |
| High | Low | Known but not read. Engines describe the brand from training priors; pages aren't extractable. This is the GEO content problem proper. |
| Low | High | Rare and healthy. Pages are citable; the category footprint is small. More coverage on more prompts. |
| High | High | Working. Defend it and watch competitors. |

**Visibility score** separates being listed fourth from being the first recommendation. Two brands with identical presence rates can be in materially different positions.

**Framing is the one qualitative metric here and it overrides volume.** If negative framing outweighs recommended, more content amplifies a message that's already losing. That's a positioning problem, and publishing more against it is expensive.

**Per-engine divergence is often the headline.** Strong on Perplexity and absent from AI Overviews is a specific, fixable diagnosis — usually domain authority and schema rather than content quality.

## 6. The noise problem

AI answers are non-deterministic. The same prompt, same engine, same day returns different brand sets. This is not a flaw in the tracking method; it's a property of the thing being measured, and it sets a floor on what any prompt set can detect.

The engine computes that floor with a two-proportion test and states it in every readout. Some rough intuitions at a 30% baseline, 95% confidence, 80% power:

| Prompts per engine | Smallest reliably detectable change |
|---|---|
| 20 | ~41 points |
| 30 | ~33 points |
| 50 | ~26 points |
| 75 | ~21 points |
| 100 | ~18 points |

At 20 prompts, only enormous swings are real. This is the number most teams are quietly running, and it is why month-to-month GEO dashboards oscillate convincingly while measuring nothing.

**The honest options** when the required set is impractical:

1. Accept a coarser detectable change and say so in every report.
2. Track fewer engines and put the prompts into the ones that matter.
3. Pool several runs into a quarterly figure rather than reporting monthly.
4. Call it directional monitoring, not measurement, and stop attaching decisions to small moves.

Option 4 is legitimate and underused. Watching the direction of a number you can't test is fine; presenting it as a result is not.

## 7. Cadence and drift

**Monthly** suits most brands. Weekly generates noise faster than signal and tempts over-reaction. Quarterly loses the ability to attribute a change to a specific piece of work.

**Two things move these numbers that aren't you:**

- **Model updates.** A new model version can shift presence by double digits overnight. Note releases against the time series before attributing a jump to content.
- **Competitor activity.** Share of voice is zero-sum. Flat presence with falling share means someone else moved.

When a jump is unexplained and large, check for both before writing it up as a win.

## 8. Worked example

`node citation-tracker.js --demo` runs a full example: a fictional B2B SaaS onboarding platform tracked across four engines on 40 prompts, with a prior run to compare against.

The result is instructive. Presence sits at 32.5% and rose 5 points since the last run — a number that would go straight into a deck as progress. The engine refuses it: at n = 40 the noise floor is 29 points, so a 5-point rise is indistinguishable from nothing (p = 0.63).

The real finding is elsewhere. Citation rate is 5% against 32.5% presence — the engines are naming the brand and sourcing competitors. No amount of additional publishing fixes that; the existing pages need to become the extractable, citable source. The readout routes to `geo-content-optimization` accordingly.
