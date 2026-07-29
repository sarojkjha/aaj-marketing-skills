# Activation playbook

Reference for the `onboarding-activation` skill.

---

## 1. Defining the activation moment

Not a workshop question. A measurement.

**The method:**
1. List candidate week-one actions — every meaningful thing a user can do.
2. For each, split users into did / didn't.
3. Compare retention at day 30 (or one renewal cycle) between the two groups.
4. The action with the **widest retention gap** is your activation moment.

```
Action (week 1)          Did it   Didn't   Gap
Imported customer list    68%      19%     +49  ← activation moment
Invited a teammate        61%      24%     +37
Ran a report              44%      31%     +13
Completed the tour        38%      35%      +3  ← optimising this is wasted work
```

The tour row is the point. It's the thing most teams instrument, and it predicts almost nothing.

**Two-part definitions are fine** and often better: *"imported a list AND set one alert"*. Beyond two, you're describing a power user rather than an activated one.

**The causation caveat.** A wide gap tells you the action is a strong *indicator*. Whether driving it *causes* retention is a separate question — test it by pushing users toward the action and seeing whether retention moves. If it doesn't, you found a symptom of engagement, not a lever.

---

## 2. Stall patterns

Ranked by how often they're the actual problem.

| Pattern | Looks like | Fix |
|---|---|---|
| **Empty state** | Account created, nothing to do, nothing happens | Sample data, a template, or a guided first object |
| **Data dependency** | Needs a CSV, an API key, or an admin they don't have | Sample data now, real data later; make import optional to reach value |
| **Permission wall** | Needs someone else to approve or connect something | Provide a value path that doesn't require it |
| **Configuration before value** | Six settings before anything works | Sensible defaults; configure after the first outcome |
| **Concept gap** | Doesn't understand what the product is *for* | This is a positioning problem — see `positioning-statement` |
| **Wrong-fit signups** | Activation is fine for one segment, terrible for another | Not an onboarding problem. Fix targeting |

**The empty state is the single most common killer.** A new account with no data and no obvious first move puts the entire burden of imagination on someone who has known your product for ninety seconds.

---

## 3. First-run design patterns

**Do one thing.** The first run should produce **one outcome**, not a survey of capabilities. Pick the shortest path to the activation moment and remove everything else from view.

| Pattern | Use when |
|---|---|
| **Sample data / sandbox** | The product needs data to be useful. Almost always worth building |
| **Templates** | There's a common starting configuration |
| **Guided first object** | Creating one thing well teaches the model better than a tour |
| **Checklist** | Activation genuinely needs 3–5 steps. Show progress; never block |
| **Progressive setup** | Configuration can be deferred behind defaults |
| **Done-with-you** | High ACV, low volume — a human on a call outperforms any flow |

**Anti-patterns:** modal tours, feature tooltips on first load, mandatory multi-step wizards, and video walkthroughs as the primary path. All of them teach; none of them deliver.

---

## 4. Instrumentation

Track per cohort so changes are visible:

- **Activation rate** — % of new users reaching the moment
- **Time-to-activation** — median, not mean; the tail is long and skews it
- **Step-level drop-off** — every step from signup to activation
- **Activation by segment** — role, plan, acquisition channel
- **Retention gap** — recheck periodically that the activation moment still predicts retention as the product changes

Time-to-activation deserves attention alongside rate. The same rate reached in a day rather than a week retains better and costs less to support.

---

## 5. Worked example — Brightlane

**Diagnosis** (from `lifecycle-and-retention`): cohort curves drop from 100% to 88% by month 1 and flatten after — the steepest average drop is M0→M1, which points at activation rather than value delivery over time.

**Defining the moment:**

```
Action (week 1)              Did it   Didn't   Gap
Imported first customer       71%      22%     +49
Configured one stall alert    66%      28%     +38
Both of the above             79%      24%     +55  ← activation moment
Watched the intro video       41%      37%      +4
```

Activation = **imported one customer AND configured one alert**.

**The path as it exists:** signup → verify email → workspace name → invite team → connect CRM → import customers → configure alert. **Seven steps**, with the drop concentrated at "connect CRM" — most users don't have admin access to their own CRM on day one.

**The fix:**

```
BEFORE                          AFTER
signup                          signup
verify email (blocking)         → verify in background, non-blocking
name your workspace             → default it, rename later
invite your team                → moved to after activation
connect your CRM  ← 61% drop    → optional: "add 3 customers manually or
                                   use sample data" — CRM connect offered later
import customers                → guided first import, 3 rows is enough
configure alert                 → pre-configured default alert, user confirms

7 steps → 3
```

**Empty state replaced:** rather than a blank customer list, the account opens with three sample customers already showing a stall alert — so the user sees the product working before doing anything.

**Instrument:** activation rate and median time-to-activation by weekly cohort, split by whether the user used sample data or real data.

**Validate:** the retention gap was measured, not assumed — but re-check after the change that users driven to activation retain like the original activated cohort. If they don't, the moment was an indicator rather than a cause.

---

## 6. Ship checklist

- [ ] Activation moment defined from a measured retention gap, not assumed
- [ ] Causation caveat noted; a validation test planned
- [ ] Every step from signup to activation instrumented
- [ ] Steepest stall identified and addressed first
- [ ] Step count reduced — measurably, not just reorganised
- [ ] Empty states replaced with sample data, templates, or a guided first object
- [ ] Onboarding skippable and resumable; never blocking
- [ ] Activation rate and time-to-activation tracked by cohort
- [ ] Segment differences checked before applying one path to everyone
- [ ] Supporting email sequence aligned to the same activation moment
