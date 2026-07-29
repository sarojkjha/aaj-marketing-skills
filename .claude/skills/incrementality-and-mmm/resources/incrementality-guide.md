# Incrementality guide

Reference for the `incrementality-and-mmm` skill.

---

## 1. Why attribution can't answer this

Attribution observes one world: the one where the ad ran. It records which touchpoints preceded a conversion and divides credit between them by a rule you chose. No rule can tell you what would have happened otherwise, because that world was never observed.

The consequence is systematic, not random. Attribution over-credits channels that **intercept existing intent**:

| Channel | Why attributed ≫ incremental |
|---|---|
| **Retargeting** | Shown to people who already visited. Many were returning anyway |
| **Branded search** | They typed your name. They were looking for you |
| **Affiliate / coupon** | Often the last click on a decided purchase |
| **Email to active users** | Sent to your most engaged segment by definition |

And under-credits channels that **create demand**: upper-funnel video, podcasts, PR, organic social. These influence conversions that get attributed elsewhere weeks later.

This isn't a flaw in any particular model. It's the limit of what observational data can establish.

---

## 2. Holdout vs geo test

**Holdout (user-level split)** — randomly withhold the campaign from a share of your audience.
- *Best for:* retargeting, email, paid social with reliable audience exclusion
- *Needs:* clean suppression, sufficient traffic, no cross-contamination between groups
- *Fails when:* the platform can't reliably exclude, or users appear on multiple devices

**Geo test (market-level split)** — run the campaign in some markets, not others.
- *Best for:* channels that can't be split by user — TV, radio, out-of-home, broad-reach video
- *Needs:* comparable markets matched on baseline rate and volume, not just size
- *Fails when:* markets differ structurally, or spillover crosses boundaries

**Matching geos properly matters more than the number of them.** Match on historical conversion rate, volume, and trend. Two markets with equal population and different baseline rates are not a valid pair.

**PSA test** — a variant where the control group sees a public-service ad rather than nothing, holding ad exposure constant and isolating the message. Cleaner, and available on some platforms as a managed product.

---

## 3. Sizing intuition

Sample size scales roughly with `1 / (lift²)` and inversely with the baseline rate. Two consequences worth internalising:

**Halving the lift you want to detect roughly quadruples the sample.** Wanting to catch a 5% lift instead of a 10% one doesn't cost twice as much traffic — it costs about four times.

**Low baselines are brutal.** At a 2% conversion rate, detecting a 10% relative lift needs about 81,000 per group. At 10% baseline it's about 15,000. Same lift, five and a half times the traffic.

For most Seed–Series B companies this means: **you cannot test small effects, so don't try.** Test interventions big enough to produce lifts you can actually detect — turning a channel fully off rather than trimming 20% of its budget.

---

## 4. Reading the three outcomes

| Verdict | What it means | What to do |
|---|---|---|
| **Incremental** | Significant lift. The spend caused conversions | Trust iROAS over attributed ROAS; scale if the economics hold |
| **Not significant, adequately powered** | Real finding. No detectable effect at a lift you'd care about | Treat attributed conversions as suspect. Reallocate |
| **Inconclusive** | Test couldn't detect the effect you specified | Nothing learned. Rerun properly or don't claim a result |

**Only the middle row is evidence against a channel.** The engine separates the second and third explicitly because they are routinely conflated, and the conflation moves real budget.

---

## 5. What to expect by channel

Directional, from the general pattern of published lift studies — treat as a prior to test, not a benchmark to cite:

- **Retargeting** — often the largest gap between attributed and incremental. A frequent first target for testing.
- **Branded search** — incrementality depends heavily on whether competitors bid on your brand. If they do, the defensive spend may be genuinely incremental; if not, much of it is buying clicks you'd get organically.
- **Prospecting / broad targeting** — usually more incremental than attribution suggests, since much of its effect surfaces later under another channel's credit.
- **Upper funnel** — hardest to test, most under-credited. Geo tests are the practical route.

**Don't take these as findings.** They're hypotheses. The value of the test is that it replaces the prior with your number.

---

## 6. MMM-lite — and its honest limits

Media mix modelling regresses outcomes against spend across channels and time to estimate each channel's contribution. It's useful when you can't experiment, and it has real weaknesses:

- **Correlation, not causation.** Channels whose spend moves together are hard to separate; the model attributes to whichever it can fit.
- **Hungry for history.** Meaningful models want two-plus years of weekly data with genuine variation in spend. Most Seed–Series B companies have neither the history nor the variation.
- **Sensitive to specification.** Adstock and saturation assumptions materially change the answer, and are chosen by the analyst.

**The productive relationship between the two:** MMM generates hypotheses about where budget is mis-allocated; incrementality tests the ones worth money. Where they disagree, the experiment wins — it observed the counterfactual and the model inferred it.

A practical MMM-lite for a startup is usually: plot spend against outcome by channel and week, look for periods where one channel moved independently, and use those natural experiments as prior evidence. Then test the biggest suspected gap properly.

---

## 7. Worked example

A B2B SaaS company suspects retargeting is over-credited. Attributed ROAS reads 6.2x.

**Design:**
```bash
node resources/incrementality.js --baseline 2.5 --mde 15 --daily 4000 --value 400
```
```
Sample per group        29,191
Test duration           15 days
Value withheld          ~$300,000
```

That last line stops the conversation. Withholding $300K of pipeline value to validate a channel spending $15K a month is the wrong trade. **The fix is to test a bigger effect:** if retargeting were switched off entirely, a 15% lift is a conservative bar — raising `--mde` shortens the test sharply, and switching off is also the decision actually under consideration.

**Readout after running:**
```bash
node resources/incrementality.js --control-n 50000 --control-conv 1200 \
     --treat-n 50000 --treat-conv 1380 --spend 15000 --value 400
```
```
INCREMENTAL — the lift is real at the chosen confidence level.
  Control       2.40%   Treatment  2.76%   Lift  15.0%
  p-value       0.0003
  Incremental   180 conversions
  iROAS         4.80x   (attributed ROAS was 6.2x)
```

The channel is genuinely incremental — but at 4.8x, not 6.2x. Attribution was over-crediting it by roughly 30%. That's the number to plan with, and it's still a good channel.

**The contrast case** — same lift, a tenth the sample:
```bash
node resources/incrementality.js --control-n 5000 --control-conv 120 \
     --treat-n 5000 --treat-conv 132
```
```
INCONCLUSIVE — the test was never large enough to detect this effect.
  p-value 0.4439
  Smallest lift this test could detect: 35.7%
```

A 10% lift was observed and is invisible to a test this size. Reporting that as "retargeting doesn't work" would be wrong, and it happens constantly.

---

## 8. Test checklist

- [ ] The budget decision that hangs on the result is named
- [ ] Minimum detectable lift set from that decision, before the test
- [ ] Sample size and duration computed, not guessed
- [ ] Holdout cost priced and accepted
- [ ] Groups genuinely comparable (matched geos, or clean random split)
- [ ] Everything else frozen for the window; concurrent activity documented
- [ ] Duration fixed in advance — no early stopping
- [ ] At least one full weekly cycle covered
- [ ] Readout reports the verdict, not just the p-value
- [ ] Inconclusive results reported as inconclusive, never as negative
- [ ] Re-test scheduled — this decays
