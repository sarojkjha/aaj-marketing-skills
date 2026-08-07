# AAJ Skills Launch — Handoff Brief

**For:** Skill Launch Readiness 2
**As of:** 2 August 2026 · **Launch:** Tuesday 8 September 2026, 12:01 AM PT (backup: 15 Sep)

---

## 1. Where things stand

Weeks 1–2 complete. Week 3 partly complete, ahead of schedule. Roughly five weeks to launch.

**The product:** `github.com/sarojkjha/aaj-marketing-skills` — 39 marketing skills for AI agents, **24 with runnable Node engines**. Free, MIT. Browsable at `skills.aajconsult.com`. Consultancy site at `aajconsult.com`.

**Locked tagline:** *39 marketing skills for AI agents. 24 run real engines.*
Longer form: *Agent skills for AI marketing tasks. 39 skills, 24 with runnable engines you can execute directly. MIT. Works with Claude Code, Cursor, Codex, Windsurf.*

**Brand:** always **AAJ**, never "AAJ Consult" as a display name. Navy `#0B182D`, gradient `#FBA800→#F36F01`. Space Grotesk / Hanken Grotesk / JetBrains Mono. `"AAJ Consult"` exists only in schema `alternateName` as a machine alias.

---

## 2. Pricing ladder (live, consistent everywhere)

| Tier | Price | Duration |
|---|---|---|
| Growth Audit | $1,200 | 7 days |
| AI Visibility Sprint | $3,500 | 10 business days |
| Unit Economics & Retention Sprint | $3,500 | 10 business days |
| Positioning & Message Sprint | $3,500 | 10 business days |
| GTM & Pipeline Launch | from $9,500 | 4–8 weeks |
| MMM-Lite Project | $8,500 | 6 weeks |
| Advisory / Fractional Lite / Embedded | $1,800 / $3,800 / from $6,500 per month | — |

**Credit rule, stated once:** 100% of an Audit or Sprint fee credits toward a retainer started within 30 days. One credit per relationship, no stacking.

Anchors on `/pricing`: `#growth-audit`, `#ai-visibility`, `#unit-economics-retention`, `#positioning-message`. Skill pages link cross-domain to these.

---

## 3. Architecture — the parts that bite

**Two Supabase projects.** Content lives in `pwxmqaqrxqomyqrckzty`, hardcoded in `src/integrations/supabase/client.ts`. `process.env.SUPABASE_URL` points at a *different, empty* Lovable-side project. Always use the shared client. This caused a 500 on lead capture that ran undetected for days.

**The crawler-visible site is separate, hand-authored prose.** Answer engines read `cloudflare-worker/route-content.js`, `articleBodies.ts`, and related registries — **not** the React pages. Any content change must be made in both. This is the single most repeated failure mode in this project.

**Cloudflare worker `aaj-seo-worker`** sits in front of the origin, injects SEO content and metadata at the edge, and is deployed by pasting `seo-worker-combined.js` (~1.4 MB) into the dashboard. Before every paste: `node --check` on a `.mjs` copy (it's an ES module), confirm the BUILD_ID, check the byte count.

**Edge caching is currently failing closed.** A cache-store guard rejects responses it can't verify; `x-seo-cache-store` returns `skipped-*` reason codes. Site serves correctly, nothing is cached. Parked deliberately. TTLs at `s-maxage=3600`, to be raised to 86400 once clean.

**Known open bug:** unknown routes return HTTP 200 with homepage content (soft 404). Must be fixed before any new route ships.

---

## 4. Citation baseline — run 1 complete

**Run 1, 7 August 2026.** 30 prompts × 4 engines = 120 queries, scored by hand, `citation-run-1.json` saved.

| Engine | Presence | Citation | Visibility |
|---|---|---|---|
| Perplexity | 16.7% | 16.7% | 14.4 |
| AI Overviews | 16.7% | 16.7% | 16.7 |
| ChatGPT | 10.0% | 6.7% | 10.0 |
| Claude | 3.3% | 3.3% | 3.3 |
| **Overall** | **11.7%** | **10.8%** | **11.1** — EMERGING |

**Findings that matter:**
- **13 of 14 mentions cited the domain.** When an engine finds AAJ, it sources it. The problem is reach, not trust.
- **Zero presence across all category, problem and comparison prompts.** Only branded prompts hit.
- Live-search engines (Perplexity, AI Overviews) find AAJ; priors-heavy engines (ChatGPT, Claude) mostly don't.
- **109 of 125 competitors named by exactly one engine.** No consensus incumbent — good for a new entrant.
- ChatGPT names *nobody* for six problem-band queries where AAJ has a purpose-built engine. Perplexity does name vendors for the same queries, so the category is real and ChatGPT simply hasn't populated it.
- "AAJ skills catalog GitHub" failed on all four engines.

**Method (hold constant across runs):** logged out or fresh account, memory off, web search on, free tier, default model, new conversation per prompt, Band D (branded) run last, same geography. Record model versions.

**Schedule:** run 2 ~21 Aug (add `prior` from run 1), run 3 on 4 Sep, run 4 ~15 Sep.
**Tooling:** `citation-run-template.csv` → `build-citation-run.ps1` → engine readout. Never hand-write the JSON.

---

## 5. Site audit baselines

**`seo-geo-aeo-audit` skill (manual judgement, not measurement):** 31 July = **73/100 C** → after fixes = **82/100 B**. Still failing: `inline_citations`, `quotations`, `original_data`, `outbound_citations` partial.

**`agent-readiness-audit`: 75/100 PARTIAL.** Gaps: no self-serve path (−8), no comparison data (−6), no public API (−6), claims unsourced (−5). The first three are business-model decisions, not markup.

**Against AgentView's independent rubric the site scores ~99/100.** Agent reachability, static rendering, markdown negotiation with `Vary: Accept`, token tax 3.4×, all retrieval bots allowed, grounded schema. Only MCP discovery fails.

---

## 6. Live now

**Two blog posts**, both with real reproducible engine output, Article + FAQPage schema, Sources sections, and crawler-body copies:
- `/blog/ltv-cac-which-number-to-fix` — three plausible fixes all land at 1.7–1.8:1; only combined moves reach 3:1
- `/blog/pipeline-full-nothing-closing` — $1M of new pipeline leaves a $138,500 gap; advancing four deals covers it

**GitHub traffic logging** started 30 July via `log-traffic.ps1`. Weekly, Mondays. 14-day API retention means gaps are unrecoverable. Baseline: 59 views / 1 unique viewer / 153 clones / 65 unique cloners — the clone figure is overwhelmingly bots and must be reported as a trend, never a level.

**Brevo:** lists and attributes created, worked-example transactional email live (template 27) with per-skill demo output, nurture routing done in the capture route rather than a paid automation.

---

## 7. The live problem — free tools credibility

**`seo-geo-readiness-scorer` was shipped with `SCAN_ENDPOINT: ""`** and rendered a hardcoded fixture for a fictional site for every URL. It reported 100/100 for `aajconsult.com`. Now rebuilt on a real `scan-seo-geo` Edge Function with a Reach → Read → Understand funnel, measured-vs-assessed labelling, retrieval-vs-training bot separation, markdown negotiation, token tax, and a v2.0 standard version.

**Rebuild verified, but three issues remain open:**

1. **Markdown check gives a false negative** — scored `aajconsult.com` 0/3 when the site demonstrably serves `text/markdown` with `Vary: Accept`. Untrustworthy in both directions.
2. **Partial credit far too generous.** A site rendering only 345 words client-side scored **8/15 (53%)** on "renders without JavaScript". WARN states award 50–75% where 25–35% is right. Recomputing `taughtful.ai` strictly: 74 → 62.
3. **Reach is 39 points and all three test sites scored 39/39** — 39% of the score handed out identically, compressing the discriminating range to 61 points.

Test scores: aajconsult 97, getagentview 88, taughtful 74. Real spread, but the floor is too high.

**`website-grader` is accurate — verified independently, leave it alone.** Its findings about getagentview.com (no schema, no canonical, no security headers, no analytics) all check out. One thing to clarify: its "deterministic, URL-seeded estimate" disclaimer probably applies only to Core Web Vitals and should be labelled per-category.

---

## 8. Immediate next steps

1. **Fix the scorer's three issues** (§7) and re-test, including one deliberately bad site — if it scores above 45 the floor is still wrong.
2. **Directory submissions** — `mingrath/awesome-claude-skills` accepts individual skills, one PR each, max 150-char descriptions, alphabetical. `travisvn/awesome-claude-skills` requires social proof; wait until post-launch. Also `agentskill.sh`. Copy is in `directory-submissions.md`.
3. **Citation run 2 on ~21 August.**
4. **Fix the soft-404** before sprint pages or new routes ship.
5. **Four more B-band posts** — `agent-readiness-audit`, `marketing-report`, `positioning-statement`, `marketing-budget-planning`, targeting queries where ChatGPT currently names nobody.
6. **LinkedIn extracts** for both live posts, 3–5 days apart, link in first comment.
7. **Turn `CACHE_DEBUG` off** before the Week 6 freeze.
8. **Cold-install rehearsal** before 2 September — fresh directory, `npx skills add`, run the first command from three skill pages exactly as written.

---

## 9. Working practices that earned their keep

- **Verify from a second vantage point.** Two bugs were only caught because the assistant checked from a Chicago PoP while Saroj was on a Bay Area edge.
- **Green checks conceal.** Both serious bugs — a lead-capture 500 and 31,000 words invisible to crawlers — were hidden behind checks that passed for the wrong reason. Test the path users actually take.
- **`verify-deploy.ps1`** runs ten regression checks after every deploy. Every check in it corresponds to a failure that actually happened.
- **Hand over files, not patches.** Patches failed four different ways; direct file downloads worked every time. Save `.ps1` files as ASCII-only — PowerShell 5.1 reads BOM-less UTF-8 as Windows-1252 and em dashes break parsing.
- **PowerShell:** keep `} else {` on one line at the interactive prompt; `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` and `Unblock-File` for local scripts.
- **"patch does not apply" on every file at once** means already applied, not broken.
- **Don't publish a number you can't defend.** This is the project's positioning and the reason the scorer had to be rebuilt rather than quietly recalibrated.
