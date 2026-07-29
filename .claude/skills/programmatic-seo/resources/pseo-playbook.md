# Programmatic SEO playbook

Reference for the `programmatic-seo` skill.

---

## 1. Patterns that work — and what each needs

The pattern isn't the hard part. The **unique data per page** is what decides whether it works.

| Pattern | Example | What each page must have that's yours |
|---|---|---|
| **Comparison** | `{Tool A} vs {Tool B}` | A real opinion, real feature testing, or usage data — not a spec table scraped from both sites |
| **Integration** | `{Product} + {Tool} integration` | Actual setup steps, real screenshots, genuine limitations |
| **Calculator / computed** | `{Metric} calculator for {segment}` | The computation itself — this is the strongest pattern, because output is generated per input |
| **Location** | `{Service} in {City}` | Real local presence, local pricing, local case data. Weakest pattern without it — and the most abused |
| **Use case** | `{Product} for {Role}` | Role-specific workflows, real customer language from that segment |
| **Directory / listing** | `Best {category} in {niche}` | Genuine evaluation criteria and first-hand assessment |
| **Data-driven** | `{Benchmark} for {industry}` | Proprietary data. Strongest pattern when you own the dataset |

**The test:** could a competitor reproduce this page in an afternoon with public information and an LLM? If yes, it will not rank and shouldn't be built.

---

## 2. The funnel — why projections fail

The standard projection:

```
10,000 pages × 50 searches/mo × 3% CTR = 15,000 visits/mo
```

What actually happens:

```
10,000 pages built
  × ~60% indexed            →  6,000 indexed
  × ~30% reach page 1       →  1,800 ranking
  × 50 searches × 3.5% CTR  →  3,150 visits/mo
  × ~85% (AI Overviews)     →  2,679 visits/mo
```

Roughly a fifth of the naive projection — and both rates are optimistic for a template-generated set with weak per-page data. Indexation rates well under half are common at large page counts.

Model it explicitly. `resources/pseo-model.js` does this, and every rate is overridable once you have real data.

---

## 3. Template anatomy

```
FIXED         Same on every page — nav, footer, brand, schema shape
VARIABLE      Injected from the dataset — entity names, values, attributes
UNIQUE        Genuinely different per page — the part that earns the ranking
GENERATED     Computed from the data — comparisons, rankings, calculations
```

A safe rule: **at least 40–50% of visible body content should be UNIQUE or GENERATED**. If FIXED and VARIABLE dominate, you've built near-duplicates with the nouns swapped.

**Every page also needs:**
- A 40–60 word answer block near the top (the AEO/GEO requirement — see `seo-content-brief`)
- A distinct title tag and meta description, not a formula that produces near-identical strings
- Internal links to the hub and to 3–5 sibling pages
- Schema appropriate to the type
- A genuine reason for a human to stay

---

## 4. Indexation plan

Getting pages indexed is a separate problem from getting them written, and it's where most builds quietly fail.

- **Internal links from real pages.** A sitemap entry is a suggestion; an internal link is a path. Orphaned pages largely don't get indexed.
- **Hub pages.** Group pages into browsable categories with genuine navigational value.
- **Crawl budget.** Large sets on a small site compete with pages that already earn revenue. Watch crawl stats in Search Console.
- **Staged submission.** Publish in batches so you can observe indexation rate per batch rather than guessing.
- **Prune.** Pages that get no impressions after a fair window should be consolidated or removed. A large set of dead pages is a site-wide signal, not a neutral one.

**Measure indexation directly.** `site:` operators are unreliable — use Search Console's Pages report and compare indexed against submitted.

---

## 5. Quality bar — the ship gate

A page doesn't publish unless it passes. Write this down before building and enforce it in the pipeline.

- [ ] Contains data or content a competitor couldn't regenerate in an afternoon
- [ ] Answer block present in the first ~100 words
- [ ] At least 40% of body content is unique or generated, not template
- [ ] Title and meta description are meaningfully distinct from siblings
- [ ] Internal links: to hub, to 3–5 siblings, out to a conversion path
- [ ] Targets a query with verified real search volume
- [ ] Would be worth keeping if search traffic went to zero
- [ ] No fabricated statistics, reviews, or ratings

That last one matters more than it sounds. Generated pages with invented review counts or made-up data are the fastest route to a manual action — and they break the honesty standard regardless of SEO consequence.

---

## 6. Rollout

| Stage | Pages | Purpose | Gate to proceed |
|---|---|---|---|
| **Pilot** | 50 | Measure real indexation, ranking and conversion | ≥50% indexed within 4 weeks; some ranking movement |
| **Batch 1** | 500 | Confirm the pattern holds at scale | Indexation rate holds; no crawl or quality warnings |
| **Full** | Remainder | Scale what's proven | Model re-run with observed data still shows payback |
| **Prune** | ongoing | Remove pages with no impressions after ~6 months | — |

Re-run `pseo-model.js` at each gate with measured rates. The pilot exists specifically to replace assumptions with data.

**Kill criteria — decide now, honour later:** if under 30% of pilot pages index within 6 weeks, or none rank in the top 20 within 3 months, stop. Scaling a pattern that failed at 50 pages just produces the same failure 200 times over.

---

## 7. Worked example

**Pattern:** `Marketing budget benchmarks for {industry}` — built on AAJ's own benchmark data.

**Why it passes gate 2:** the benchmark figures are AAJ's own analysis. A competitor can cite the same public surveys but can't reproduce the segmented cuts, and each page computes a suggested range from the visitor's inputs.

### Attempt 1 — 40 industries

```bash
node resources/pseo-model.js \
  --pages 40 --volume 70 --conv 4 --value 600 \
  --unique-data strong --fixed-cost 6000 --cost-per-page 40
```

```
MARGINAL — Payback in 21 months.
  Reaching page 1  × 30%      7
  [MEDIUM] Only ~7 pages are projected to rank. Below about 20, this isn't
           a programme — it's a handful of pages you could write by hand, better.
```

Good data, good economics, and it still fails — because 40 pages through the funnel leaves only seven earning anything, against a fixed build cost. **The honest answer at this size is to hand-write the best ten pages**, which will be better than any template output.

This is the most common way a promising pSEO idea dies, and it's invisible without the funnel.

### Attempt 2 — expand the pattern

The fix isn't better copy, it's more surface: split each industry by company stage — `{industry} at {stage}` — giving 40 × 6 = 240 pages. Tail volume per page drops (60 rather than 70), but conversion value rises, because a visitor searching a stage-specific benchmark is closer to needing help.

```bash
node resources/pseo-model.js \
  --pages 240 --volume 60 --conv 4 --value 800 \
  --unique-data strong --fixed-cost 6000 --cost-per-page 35
```

```
BUILD — Payback in 6 months. Strong case — pilot 50 pages first.
  Reaching page 1  × 30%      43
  Sessions                    77/mo
  Investment                  $14,400
  Year 1 net                  $15,211
  No risks flagged.
```

Forty-three ranking pages is a programme. Same data, same quality bar — the pattern just needed enough surface to survive the funnel.

**Template:**
- FIXED — nav, method explainer, footer
- VARIABLE — industry, stage, benchmark range, sample size
- UNIQUE — AAJ's analysis for that industry-stage cut, and its specific caveats
- GENERATED — a computed budget range from the visitor's revenue input

**Indexation** — linked from a `/benchmarks` hub, cross-linked to sibling stages within the industry and to the same stage across adjacent industries, and referenced from the budget blog cluster.

**Conversion path** — every page routes to the Marketing Budget Planner template, then to `/services`.

**Contrast:** 10,000 location pages at 8 searches each with no unique data returns three HIGH risks and DON'T BUILD. Same tool, opposite verdict — which is the point.

---

## 8. The honest recommendation

Most programmatic SEO proposals should be declined. The pattern works when:

- You own data others don't
- Query volume in the tail is real, not tool-estimated noise
- Value per conversion is high enough that a modest number of ranking pages pays back
- The site has the authority and structure to get pages indexed

When those don't hold, the better advice is 20 genuinely good pages rather than 2,000 template ones — and saying so is more valuable to the client than building what they asked for.
