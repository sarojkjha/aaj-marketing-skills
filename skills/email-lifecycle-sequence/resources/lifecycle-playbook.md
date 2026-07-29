# Lifecycle sequence playbook

Reference for the `email-lifecycle-sequence` skill. Structures are starting points calibrated for B2B SaaS at Seed–Series B — adjust to your cycle length.

---

## 1. Sequence structures

### Welcome — 3 emails, days 0–7
**Trigger:** signup. **Exit:** activation moment reached.

| # | Timing | Job | CTA |
|---|---|---|---|
| 1 | Immediate | Confirm the decision, set expectations, one action | The single next step |
| 2 | Day 2 | Remove the top objection to that action | Same step |
| 3 | Day 6 | Show what good looks like — a real example | Same step |

The first email is opened more than anything else you will ever send. Do not waste it on a company introduction. Give the one action and get out.

### Onboarding / activation — 5 emails, days 1–21
**Trigger:** signup, then behaviour. **Exit:** activated.

| # | Trigger | Job |
|---|---|---|
| 1 | Day 1 if not started | Reduce the first step to something that takes two minutes |
| 2 | On first action | Reinforce, then name the next step |
| 3 | Day 4 if stalled | Address the specific blocker at the stalled step |
| 4 | Day 8 if not activated | Offer a different path — a call, a template, done-for-you |
| 5 | On activation | Confirm, then point at the habit-forming behaviour |

Branch on behaviour. A user who completed step one and a user who never opened the product need different emails, and sending them the same one tells both you weren't paying attention.

### Engagement / nurture — ~4 per month, ongoing
**Trigger:** activated and active. **Exit:** goes inactive (win-back takes over).

Alternate: useful content · product capability they haven't used · customer story · a question that invites a reply. Replies are the strongest deliverability signal available.

### Expansion — 3 emails, triggered by usage
**Trigger:** hits a threshold that makes the upgrade genuinely rational. **Exit:** upgraded or explicitly declined.

| # | Job |
|---|---|
| 1 | Name the usage pattern — "you've hit X three months running" |
| 2 | Quantify what the tier above is worth *given that pattern* |
| 3 | Remove risk — trial, prorate, easy downgrade |

Trigger on usage, never on tenure. An upgrade prompt to someone who isn't ready reads as a shakedown.

### Win-back — 3 emails, days 30–60 of inactivity
**Trigger:** inactivity threshold. **Exit:** returns, or sequence completes.

| # | Job |
|---|---|
| 1 | What they're missing — specific and account-relevant, not generic |
| 2 | Ask why. A genuine one-question reply request; the answers are worth more than the recoveries |
| 3 | A real reason to return — new capability, restored data, an offer |

Email two is the underrated one. Lapsed users tell you exactly why they left if asked plainly, and that feeds `win-loss-analysis`.

### Sunset / re-permission — 2 emails, day 90+
**Trigger:** long inactivity, no opens or clicks. **Exit:** re-engages, or is suppressed.

One email asking whether they want to keep hearing from you; one confirming removal. Then suppress. This feels like losing list size and is actually protecting inbox placement for everyone who does engage.

---

## 2. Timing and load

**Count sends across sequences.** Welcome (3 in days 0–7) plus onboarding (5 in days 1–21) means roughly six emails in the first fortnight before any product notification. Add a newsletter and a launch announcement and you have a problem no single flow reveals.

Rules that hold up:
- **A global frequency cap** — the number of marketing emails any user can receive in a rolling seven days, enforced across all sequences.
- **Priority order** when sequences collide: transactional beats onboarding beats promotional.
- **Never in two lifecycle sequences at once.** Suppress the lower-priority one.
- **Front-load, then taper.** Attention decays fast after signup; a day-28 email in a welcome flow is talking to someone who has forgotten you.

---

## 3. Subject lines

Lifecycle email is expected, so it doesn't need the cold-email tricks. Specific and plain outperforms clever.

| Pattern | Example |
|---|---|
| The next action | "Your first report takes 4 minutes" |
| Specific to their account | "You've imported 12 contacts — here's what's next" |
| The blocker named | "Stuck on the integration step?" |
| Genuine question | "What made you sign up?" |
| Plain value | "The onboarding template we use with clients" |

**Avoid:** false urgency, fake personalisation ("quick question" when it isn't), all-caps, and clickbait that the body doesn't pay off. See `marketing-psychology` for the boundary between urgency and manufactured urgency.

---

## 4. What to measure

**Not opens.** Apple's Mail Privacy Protection pre-fetches images, inflating open rates for a large and unknowable share of your list. Treat opens as directional at best.

| Sequence | The metric that matters |
|---|---|
| Welcome | First action completed within 7 days |
| Onboarding | Activation rate by day 21 |
| Engagement | Return visits; replies |
| Expansion | Upgrade rate among triggered users |
| Win-back | Reactivation rate; reasons collected |
| Sunset | Deliverability and engagement of the remaining list |

Also watch unsubscribe rate *by sequence* and spam-complaint rate. A rising complaint rate is the earliest signal you have a stacking problem.

---

## 5. Worked example — Brightlane onboarding

*Brightlane: B2B SaaS onboarding platform. Activation moment = first customer account imported and first stall alert configured.*

**Audit first:**

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/email-lifecycle-sequence/resources/…` instead.

```bash
node .agents/skills/email-lifecycle-sequence/resources/lifecycle-audit.js --have welcome --signups 400 --value 900
```

Coverage 1/6. Breakeven says a sequence needs about 0.2 conversions a month to pay back in six — around 0.1% of signups. That settles whether to build it.

**The sequence — 5 emails, exit on activation:**

| # | Trigger | Subject | Job |
|---|---|---|---|
| 1 | Day 1, no import | "Import one customer — takes 3 minutes" | Shrink the first step |
| 2 | On first import | "Your first account is in. Now set one alert" | Reinforce, name next step |
| 3 | Day 4, imported but no alert | "One alert is what makes this useful" | Address the exact stall |
| 4 | Day 8, not activated | "Want us to set it up with you?" | Different path — human help |
| 5 | On activation | "You're set. Here's what week two looks like" | Confirm, point at habit |

**Exit conditions:** activation ends the sequence. Unsubscribe suppresses everything. A user in win-back is never in onboarding.

**Measure:** activation rate by day 21, split by whether the user received email 4.

---

## 6. Ship checklist

- [ ] Audit run; this sequence fills the top-priority gap
- [ ] Send load across all sequences re-checked after adding this one
- [ ] Every email has one job and one CTA
- [ ] Behaviour triggers where possible, not just timing
- [ ] Exit condition set — and a global rule preventing sequence overlap
- [ ] Frequency cap enforced across sequences
- [ ] Unsubscribe visible and working in every email
- [ ] Measured on a downstream action, not opens
- [ ] Claims checked — no unsubstantiated numbers in the copy
- [ ] Renders on mobile; plain-text version reads correctly
