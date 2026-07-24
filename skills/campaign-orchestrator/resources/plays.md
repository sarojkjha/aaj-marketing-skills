# The Plays

Reference for the `campaign-orchestrator` skill. Seven named sequences, each a full Diagnose → Design → Execute cycle for one class of problem.

---

## 1. Symptom → Play routing

Route on what's actually leaking, not on what was asked for.

| What they say | Usually means | Play |
|---|---|---|
| "Nobody signs up" | Traffic arrives, doesn't convert | **Fix the funnel** |
| "We get traffic but no leads" | Same | **Fix the funnel** |
| "Signups don't become customers" | Activation, not acquisition | **Stop the leak** |
| "Churn is too high" | Retention, upstream of it activation | **Stop the leak** |
| "New sales just replace the ones we lose" | Net retention below 100% | **Stop the leak** |
| "Nobody's heard of us" | Visibility | **Get found** |
| "We don't show up in AI answers" | GEO/AEO, or agent-readiness | **Get found** |
| "We need pipeline now" | Outbound | **Stand up outbound** |
| "Inbound is too slow" | Same | **Stand up outbound** |
| "We're launching in six weeks" | GTM | **Launch** |
| "Is our ad spend working?" | Measurement | **Prove the spend** |
| "The board wants marketing numbers" | Measurement | **Prove the spend** |
| "We can't explain what we do" | Positioning | **Reposition** |
| "Sales says our messaging is wrong" | Positioning | **Reposition** |
| "Everything is underperforming" | Almost always positioning | **Reposition** |

### Discriminating questions

When two Plays both look plausible, these separate them:

**Fix the funnel vs Stop the leak** — *Where exactly do people stop?* Before the account exists → funnel. After → leak. Get the step, not the impression.

**Fix the funnel vs Reposition** — *Would your homepage still read as true with a competitor's logo on it?* If yes, the problem is upstream of the funnel.

**Get found vs Fix the funnel** — *Is traffic low, or is conversion low?* Both feel like "no leads". Look at the numbers before choosing.

**Stand up outbound vs Get found** — *How long can you wait?* Inbound compounds over quarters; outbound produces meetings in weeks and stops when you stop.

**Prove the spend vs anything else** — *Do you have numbers at all?* If not, this Play comes first regardless of what else is wrong. You cannot diagnose without instrumentation.

---

## 2. Fix the funnel

*Traffic arrives and doesn't convert.*

**Diagnose**
1. `website-conversion-audit` — where the funnel leaks, by step
2. `marketing-psychology` — which of the six frictions is blocking the decision
3. `unit-economics` — establish what a conversion is worth, so fixes can be ranked

*Exit when:* the leaking step is named with a number attached.

**Design**
4. `signup-flow-optimizer` — if the leak is at signup
5. `landing-page-brief` — if the leak is before it
6. `copywriting` — the actual words, laddered to the positioning

*Exit when:* the rebuilt flow or page is specified concretely enough to build.

**Execute**
7. Ship it
8. `ab-testing` — prove the change did something

*Exit when:* shipped, instrumented, review date set.

---

## 3. Stop the leak

*Customers arrive and don't stay.*

**Diagnose**
1. `lifecycle-and-retention` — NRR, GRR, churn, cohort curves. A steep early drop means activation; a gradual decline means value delivery
2. `customer-survey-design` — ask lapsed users why, if the data doesn't say

*Exit when:* you can say whether this is an activation problem or a retention problem, from cohort shape.

**Design**
3. `onboarding-activation` — if the drop is early
4. `email-lifecycle-sequence` — the communication layer that supports it
5. `pricing-and-packaging` — if churn concentrates at a tier boundary

*Exit when:* the activation moment is defined from evidence and the fix is specified.

**Execute**
6. Ship the redesigned first run and the sequences
7. `marketing-report` — track NRR and activation by cohort

*Exit when:* activation rate and time-to-activation are instrumented by cohort.

---

## 4. Get found

*Nobody arrives.*

**Diagnose**
1. `seo-geo-aeo-audit` — can search and AI engines see and cite you
2. `agent-readiness-audit` — can agents acting for buyers evaluate and transact
3. Check rendering first in both — if content needs JavaScript, nothing else matters

*Exit when:* you know whether this is a crawlability problem, a content problem, or a demand problem.

**Design**
4. `seo-content-brief` — spec the content that should exist
5. `programmatic-seo` — only if a template-and-data pattern genuinely pays back
6. `geo-content-optimization` — make what exists citable

*Exit when:* briefs exist for the content worth writing, and the technical blockers are specified.

**Execute**
7. `copywriting` — write it
8. `content-repurposing` — extend each piece across channels
9. `marketing-report` — track rankings, citations, and traffic

*Exit when:* published, indexed, and a review date set. Expect quarters, not weeks.

---

## 5. Stand up outbound

*You need pipeline and can't wait for inbound.*

**Diagnose**
1. `pipeline-and-forecast` — how much pipeline is actually needed to hit the number
2. `win-loss-analysis` — who you win, who you lose, and why

*Exit when:* the pipeline gap is quantified and the winning profile is described.

**Design**
3. `target-account-list` — score and tier the accounts to go after
4. `positioning-statement` — if the message doesn't survive the win-loss review
5. `cold-email-sequence` — the outreach itself

*Exit when:* the list is tiered and the sequence is written.

**Execute**
6. Run it
7. `marketing-report` — meetings booked, pipeline created, per tier

*Exit when:* the sequence is live and reply and meeting rates are being tracked.

---

## 6. Launch

*A product, feature, or segment is going live.*

**Diagnose**
1. `brand-product-context` — for a new product, this is a fresh definition, not a reuse
2. `positioning-statement` — who it's for and against what alternative
3. `unit-economics` — what a customer is worth, which sets the acquisition ceiling

*Exit when:* the segment and the competitive alternative are named.

**Design**
4. `marketing-budget-planning` — what the launch can spend
5. `paid-media-budget-allocation` — where it goes
6. `seo-content-brief` — the content that should exist at launch
7. `email-lifecycle-sequence` — the sequences that catch launch traffic

*Exit when:* the plan has owners, dates, and a budget.

**Execute**
8. `copywriting` — the launch assets
9. `content-repurposing` — the distribution
10. `marketing-report` — instrumented before launch day, not after

*Exit when:* shipped with measurement already in place.

---

## 7. Prove the spend

*You're spending and can't defend it.*

This Play jumps the queue when there are no numbers at all — everything else is guesswork without it.

**Diagnose**
1. `marketing-report` — build the funnel view that should already exist
2. `unit-economics` — CAC, LTV, payback
3. `incrementality-and-mmm` — whether attributed conversions are actually incremental

*Exit when:* you can state CAC and payback, and you know which channels are attributed but not incremental.

**Design**
4. `paid-media-budget-allocation` — reallocate on incremental performance, not attributed
5. `ab-testing` — the tests that resolve the remaining unknowns

*Exit when:* the reallocation is specified with the reasoning attached.

**Execute**
6. Shift the budget
7. `marketing-report` — the recurring board view
8. Re-run incrementality periodically — results decay

*Exit when:* reporting is on a cadence and the next test is scheduled.

---

## 8. Reposition

*The message is wrong, so everything downstream underperforms.*

The Play people resist and most often need. Run it when several other Plays all seem to apply at once.

**Diagnose**
1. `positioning-statement` — pressure-test what exists
2. `win-loss-analysis` — what buyers actually say
3. `customer-survey-design` — what your best customers value, in their words

*Exit when:* the gap between what you say and why people actually buy is documented.

**Design**
4. `positioning-statement` — rebuild it, with the reasoning behind each clause
5. `brand-product-context` — update the source of truth every other skill reads
6. `marketing-psychology` — which friction the new message must remove

*Exit when:* the positioning statement and messaging hierarchy are written and the context file is updated.

**Execute**
7. `copywriting` — homepage, sales one-liner, deck
8. `content-repurposing` — roll it through existing assets
9. `geo-content-optimization` — make the new message citable

*Exit when:* every customer-facing surface says the same thing, and the context file matches.

---

## 9. Worked routing examples

**"Can you write me some ad copy?"**
> Two questions first. What happens to the traffic those ads would send — what percentage converts today? And where do people stop?
>
> If conversion is healthy, this is genuinely an Execute task: `copywriting`, and get on with it.
> If conversion is 1%, ads make it worse — more spend reaching a page that doesn't work. That's **Fix the funnel**, starting at Diagnose.

**"Growth has stalled. We've tried everything."**
> "Everything" usually means several Execute-phase tactics with no diagnosis. Ask for the numbers: traffic trend, conversion rate, NRR.
>
> Traffic flat → **Get found**. Traffic fine, conversion falling → **Fix the funnel**. Both fine but NRR under 100% → **Stop the leak**. All three weak → **Reposition**, because one message problem is generating three symptoms.

**"We're launching in six weeks and need a plan."**
> **Launch**, starting at Diagnose — but compressed. Six weeks means positioning and budget get days, not weeks.
>
> The thing to insist on: instrumentation before launch day. Adding it after means the launch itself is unmeasurable, and launches are the single best natural experiment most companies get.

**"The board wants to know if marketing is working."**
> **Prove the spend**. If the honest answer is that the numbers don't exist, that's the finding — and building the measurement layer is the first deliverable, not a prerequisite to be apologised for.

---

## 10. Phase gate checklist

Before advancing, confirm:

**Diagnose → Design**
- [ ] The problem is named specifically, not by category
- [ ] There's a number attached
- [ ] You could defend the diagnosis to someone sceptical
- [ ] Alternative explanations were considered and ruled out

**Design → Execute**
- [ ] The intervention is specified concretely enough to build
- [ ] It addresses the diagnosed problem, not an adjacent one
- [ ] Owners and dates exist
- [ ] The success metric is named before anything ships

**Execute → done**
- [ ] Shipped
- [ ] Instrumented
- [ ] Review date set
- [ ] Documented well enough to repeat without you
