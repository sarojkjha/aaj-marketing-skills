# Copy frameworks, structures & worked example

Reference for the `copywriting` skill. Frameworks are tools, not scripts — pick the one that fits the asset and the reader's state.

---

## 1. The message hierarchy

Every asset resolves to this shape:

```
ONE PROMISE          the single most important thing the reader gets
├── Support 1        why it's credible  → proof
├── Support 2        why it's credible  → proof
└── Support 3        why it's credible  → proof
OBJECTION            the thing they'd push back on, answered
ONE ACTION           the single next step
```

If you can't fill "proof" for a support, it isn't a support — it's an assertion. Either find the evidence or drop the line.

**The logo-swap test.** Put a competitor's name on the copy. If it still reads as true, the copy describes a category, not a product. Rewrite until it breaks.

---

## 2. Reader state — write to where they are

| State | They believe | Copy must do |
|---|---|---|
| **Unaware** | No problem exists | Name the problem in their words, with a symptom they recognise |
| **Problem-aware** | Something's wrong, cause unknown | Diagnose it — this is where teaching content converts |
| **Solution-aware** | A category of fix exists | Show why this approach beats the alternative |
| **Product-aware** | They know you | Handle the specific objection; give proof |
| **Most aware** | Ready | Get out of the way. Offer, terms, action |

Cold paid traffic is usually problem-aware at best. Retargeting is product-aware. Writing product-aware copy for a cold audience is the single most common mismatch.

---

## 3. Headline patterns that hold up

Ranked roughly by how well they survive a cold audience:

1. **Specific outcome** — the result, quantified. *"Cut onboarding from 3 weeks to 4 days."*
2. **Contrarian truth** — challenge a belief they hold, then resolve it. *"Your NRR is 101%. Your base is still leaking."*
3. **Named problem** — say their symptom out loud. *"Every rep explains the product differently."*
4. **Direct offer** — when the offer is the draw. *"The free Retention & NRR workbook."*
5. **Question** — only when the answer is genuinely non-obvious. Weakest of the five; avoid questions with an obvious yes/no.

**Avoid:** category description ("The platform for modern teams"), unearned superlatives, cleverness that delays comprehension, and anything requiring a second read to parse.

---

## 4. Classic frameworks — when each applies

- **PAS (Problem → Agitate → Solve).** Best for problem-aware readers. Risk: agitation reads as manipulation in B2B. Keep the agitation factual — cost, time, risk — not emotional.
- **AIDA (Attention → Interest → Desire → Action).** A structural checklist more than a formula. Useful for long pages.
- **Before → After → Bridge.** Strong for transformation offers. Requires a concrete "before" the reader recognises.
- **FAB (Feature → Advantage → Benefit).** Use it *reversed* — lead with the benefit, land on the feature that proves it.
- **The 4 Ps (Promise → Picture → Proof → Push).** The most complete for landing pages; maps cleanly to the hierarchy above.

None of these substitute for having something true and specific to say.

---

## 5. Asset structures

### Homepage hero
```
Eyebrow      who it's for (optional, one line)
H1           the promise — specific, falsifiable
Subhead      how it works, in one sentence, plus the differentiator
CTA          one primary action; verb + outcome ("Get the workbook")
Proof strip  logos, a number, or a real quote — only if genuine
```
The reader decides in ~5 seconds. If the H1 and subhead alone don't answer *what is this, who is it for, why should I care*, the hero has failed regardless of what's below it.

### Landing page (lead magnet)
```
H1               restate the ad's promise verbatim — message-match
Subcopy          what it is, what it does, how long it takes
The form         one field for cold traffic. Every extra field costs conversion
What's inside    3–6 concrete items, each a specific outcome not a feature
How it works     3 steps, so the reader can picture using it
Who it's for     let the wrong reader self-select out
FAQ              the 3–4 real objections, answered plainly
Repeat CTA       same offer, same words
```

### Ad copy
```
Hook       one line, one idea, stops the scroll
Body       the specific claim + one proof
CTA        what happens next, literally
```
Match the destination page's headline. Do not promise what the page doesn't deliver.

### Email
```
Subject    specific, no clickbait; the open is a promise you're keeping
Preheader  extends the subject, never repeats it
Opening    the reason you're writing, in one line — no throat-clearing
Body       one idea; short paragraphs
CTA        one link, repeated at most twice
```

### Microcopy (buttons, labels, empty states)
Say what happens next. "Get the workbook" beats "Submit." "Start free — no card" beats "Sign up." Every word in a button is doing conversion work.

---

## 6. Worked example — Brightlane

*Brightlane is the fictional B2B SaaS onboarding platform used across AAJ's templates. Positioning: for Series A B2B SaaS teams whose customers stall during onboarding, Brightlane is an onboarding platform that gets new accounts to first value in days instead of weeks — unlike generic project tools, it instruments the activation path so you can see exactly where accounts stall.*

**Before (scores 25 — REWRITE):**
> Brightlane is the leading customer onboarding platform for modern teams. Our innovative solutions empower organizations to streamline their onboarding workflows and unlock growth. Designed to help you leverage best-in-class capabilities, Brightlane delivers seamless experiences at scale.

Every sentence would survive a logo swap. Nothing is falsifiable.

**After (scores 95 — SHIP):**

> **H1:** Your customers stall on day 4. You find out in week 6.
>
> **Subhead:** Brightlane instruments the onboarding path so you can see exactly where new accounts get stuck — and fix it before renewal is at risk. Teams using it get accounts to first value in days, not weeks.
>
> **CTA:** See the activation map
>
> **Supports:**
> - *Stall detection* — flags an account the day it stops progressing, not at the QBR. → *Proof: alerts fire on a 48-hour inactivity threshold you set.*
> - *Path instrumentation* — shows which onboarding step loses the most accounts. → *Proof: step-level drop-off, same view your PM already reads.*
> - *No rebuild required* — sits on your existing stack. → *Proof: connects to Salesforce, HubSpot and Segment in an afternoon.*
>
> **Objection answered:** "We already have a project tool." — Project tools track *your* tasks. They don't tell you which customer is about to churn quietly.

Note what changed: a symptom the reader recognises replaced the category description, every support carries a mechanism, and the objection is named rather than avoided.

---

## 7. The pressure test

Before shipping, every asset:

- [ ] Survives the logo-swap test
- [ ] Has exactly one job and one primary CTA
- [ ] Leads with a promise the reader can picture and check
- [ ] Carries proof under each support — numbers, mechanisms, or named examples
- [ ] Answers the top objection explicitly
- [ ] Contains no superlative you couldn't defend if challenged
- [ ] Message-matches whatever sent the reader here
- [ ] Reads at grade 8–10 with sentences averaging under 18 words
- [ ] Sounds like the brand voice in `.agents/product-marketing.md`
- [ ] Is 20% shorter than the first draft

---

## 8. Output format

Present results in this order:

```
## The copy
[drafted copy, formatted for its destination, paste-ready]

## Score
Overall NN/100 — [verdict]
Clarity NN · Claim defensibility NN · Concreteness NN

Top fixes:
1. …
2. …

## Claims needing proof
- "[claim]" — needs [what evidence would substantiate it]

## Judgment calls
- Chose [angle] over [alternative] because [reason].
```

Keep "claims needing proof" as its own section. It is the difference between copy that survives scrutiny and copy that gets pulled.
