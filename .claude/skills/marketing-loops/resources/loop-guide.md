# Marketing Loops — Reference Guide

Companion to the `marketing-loops` skill. Covers the loop model, how to map a loop as stages, the math behind k and amplification, and how to read the projection honestly.

## Contents

1. [Loops versus funnels](#1-loops-versus-funnels)
2. [The four loop archetypes](#2-the-four-loop-archetypes)
3. [Mapping a loop as stages](#3-mapping-a-loop-as-stages)
4. [The math](#4-the-math)
5. [Input schema](#5-input-schema)
6. [Reading the output](#6-reading-the-output)
7. [The sub-viral truth](#7-the-sub-viral-truth)
8. [Worked example](#8-worked-example)

---

## 1. Loops versus funnels

A **funnel** is linear: stranger → visitor → signup → customer. Work flows one way, and the job is to widen each stage and plug leaks. When the customer at the bottom does nothing to produce the stranger at the top, it's a funnel — and it needs a constant external supply of strangers.

A **loop** closes: the output of one turn becomes the input of the next. A referred user refers users. A reader becomes a writer whose writing pulls in readers. The defining test is not the shape of the diagram — you can draw any funnel as a circle — it's whether the last step *causally produces* the first. If it does, growth can compound. If it doesn't, joining the ends is cosmetic.

This distinction matters because the two models are optimized differently and measured differently. A funnel is measured by stage conversion and throughput. A loop is measured by k — whether it produces more than it consumes — and no amount of funnel metrics answers that question.

## 2. The four loop archetypes

| Type | Mechanic | k driven by |
|---|---|---|
| **Viral / referral** | Users invite users | invites sent × acceptance rate |
| **Content** | Users create content that attracts users who create content | content per user × reach per piece × conversion |
| **Paid recycling** | Revenue funds acquisition that produces revenue | bounded by LTV:CAC — the loop closes only if LTV > CAC |
| **Network effects** | Each user raises product value, lifting the next user's conversion | conversion rate rises with install base |

The engine's `loopType` field is a label only — it doesn't change the math. It's there to keep the conversation anchored to which mechanic is being modeled, because the levers differ: a viral loop is improved at the invite step, a content loop at reach, a paid loop at margin.

## 3. Mapping a loop as stages

The hard part is drawing *one turn* correctly. Map the cycle, not the funnel.

For a referral loop:

```
user sends invites   (rate: fraction of users who send, or 1.0 if all are prompted)
  → invite opened    (rate: open rate)
  → clicks through   (rate: click rate)
  → signs up         (rate: signup rate)
  → [now a user who sends invites — the loop closes]
```

The **branching factor** is the output per completed turn — invites sent per sending user. It's separate from the stage rates and it's what can lift k above the rate product. A loop where every user sends 4 invites has four times the k of one where they send 1, all else equal.

Two modeling cautions:

- **Put the "who even starts the loop" rate in as the first stage.** If only 20% of users ever send an invite, that 0.2 belongs in the chain. Omitting it is the most common way k gets overstated.
- **One turn, not many.** k describes a single cycle. The compounding across cycles is what `project` computes — don't try to bake multiple turns into the stage list.

## 4. The math

**Loop factor.** k = (product of all stage rates) × branches. Every rate is in [0,1]; branches is a positive number. Example: rates 1.0, 0.45, 0.35, 0.40 with 4 branches → 1.0 × 0.45 × 0.35 × 0.40 × 4 = 0.252.

**Amplification.** For k < 1, a seed cohort of N produces N + Nk + Nk² + … = N / (1 − k) total users over the loop's life. This geometric sum is why a decaying loop still multiplies:

| k | Amplification (1/(1−k)) |
|---|---|
| 0.2 | 1.25× |
| 0.5 | 2× |
| 0.6 | 2.5× |
| 0.8 | 5× |
| 0.9 | 10× |
| ≥ 1 | ∞ (model saturation instead) |

**Effective CAC.** If you pay to acquire a user and each seeded user spins a loop of factor k, effective CAC = paid CAC × (1 − k). At k=0.6 an $80 paid CAC is a $32 effective CAC — the loop covers 60% of acquisition. This is the number that belongs in `unit-economics`, not the gross paid CAC.

**The throttle.** Because k is a product, the smallest stage rate constrains it most. Raising the lowest rate by a fixed amount lifts k more than raising any other. The engine flags the lowest-rate stage as the throttle for exactly this reason.

## 5. Input schema

### score

```json
{
  "loopType": "viral",
  "stages": [
    { "name": "user sends invites", "rate": 1.0 },
    { "name": "invite opened",      "rate": 0.45 },
    { "name": "clicks through",     "rate": 0.35 },
    { "name": "signs up",           "rate": 0.40 }
  ],
  "branches": 4,
  "paidCac": 80
}
```

`paidCac` is optional; supply it to get effective CAC. Every `rate` must be in [0,1]; `branches` must be positive.

### project

```json
{
  "k": 0.6,
  "seed": 1000,
  "paidPerPeriod": 500,
  "periods": 12
}
```

A "period" is one loop cycle — a referral generation, a content-publishing round. Match the real cycle time; k=0.6 per week and k=0.6 per quarter are very different growth curves.

## 6. Reading the output

**Verdict bands** — VIRAL (k≥1), STRONG SUB-VIRAL (0.5–1), CONTRIBUTING (0.2–0.5), WEAK (0–0.2), BROKEN (0). The bands exist to stop two misreadings: treating a strong sub-viral loop as a failure, and treating a weak loop as an engine.

**Amplification and effective CAC** are what k *buys*. A k on its own is abstract; "every acquisition worth 2.5× and effective CAC of $32" is a decision input.

**The throttle** is the action. It's the one stage where effort has the highest return on k.

**The projection's decomposition** — total versus paid-alone — is the argument for the loop's existence. If the total barely exceeds paid-alone, the loop isn't earning its complexity.

## 7. The sub-viral truth

The most important thing this skill communicates is that **k < 1 is the normal, workable case, and k ≥ 1 is usually the wrong goal.**

Sustained virality — k ≥ 1 forever — would mean unbounded growth from a single cohort. Real loops don't do this for long: they saturate as the addressable network fills, and a k above 1 is almost always a temporary launch spike, not a steady state. Building a growth plan that *requires* k ≥ 1 is building on a number that reverts.

The durable engine is a sub-viral loop feeding on paid. At k=0.7, every dollar of paid acquisition does the work of $3.33 (amplification 3.33×), and effective CAC is a third of gross. That's not a consolation prize for missing virality — it's the mechanism behind most companies known for "viral" growth, which on inspection run sub-viral loops with large paid feeds.

So when the engine returns k=0.6, the correct response is not "we need to get to 1." It's "fund the paid feed and fix the throttle, because this loop is already multiplying every dollar 2.5×."

## 8. Worked example

`node loop-model.js --demo` runs both modes.

**Score** models a referral loop: everyone is prompted to invite (1.0), 45% of invites open, 35% click, 40% sign up, 4 invites per user. That yields k = 0.252 — CONTRIBUTING. The throttle is the 35% click-through, the lowest rate, so a click-through improvement lifts k more than anything else. With an $80 paid CAC, effective CAC is $59.84: the loop covers a quarter of acquisition. The honest read: a real assist, not an engine — bank the lower CAC, plan growth around paid.

**Project** takes a stronger loop (k=0.6), seeds 1,000 users, feeds 500 paid per period, and runs 12 periods. It ends at 15,626 users. The decomposition is the point: paid-plus-seed alone would be 7,000, so the loop added 8,626 — a 2.23× multiplier on paid. That gap is the compounding a funnel model would miss entirely, and it's the whole reason to treat the channel as a loop.
