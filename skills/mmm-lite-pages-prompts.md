# MMM-Lite — Landing Page + Service Page Prompts

## PREP (before pasting either prompt)
1. **Brevo:** create list **"MMM Kit — Downloads"**, note its numeric ID → replaces [LIST_ID] below.
2. **Attach to the Lovable message:** `aaj-mmm-lite-starter-kit.zip` and `mmm-lite-starter-kit-cover.png`.
3. Ship the **service page prompt first or together** — the kit page, blog, download email and nudge all link to /services/mmm-lite-sprint.
4. **Pricing decision (yours):** the service page has a [PRICE] placeholder. "From $X" anchoring filters tire-kickers and lifts qualified bookings; if you'd rather not show it, replace that line with "Fixed-fee engagement — scoped on the call."

═══════════════════════════════════════════
PROMPT 1 — SERVICE PAGE: /services/mmm-lite-sprint
═══════════════════════════════════════════

Create a productized-service page at /services/mmm-lite-sprint using the site's fonts, colors and dark-hero treatment. This is a service page, not a lead magnet — no email gate; the CTA is booking a call. Add "MMM-Lite Sprint" to the Services nav dropdown. Do not modify other pages beyond that nav item.

### HERO
- Badge: PRODUCTIZED SPRINT · 6 WEEKS
- H1: The MMM-Lite Sprint
- Subcopy: "Privacy-first marketing measurement, built on your data in six weeks. A media-mix model, a live incrementality test, a self-serve dashboard — and the playbook your team runs afterward. You keep everything, including the code."
- Primary CTA button: "Book a scoping call" → [CALCOM_URL]
- Secondary link: "Not ready? Get the free Starter Kit →" → /resources/mmm-lite-starter-kit

### SECTION — "Who it's for"
"Seed–Series B teams spending roughly $15–20K+/month across 3+ channels, with 26–52 weeks of history, who no longer trust last-click attribution — and who want answers, not a vendor dependency. If your spend has barely varied or your history is thinner, start with the free Starter Kit and the Marketing Budget Planner; the sprint will be worth more in two quarters." (Link both.)

### SECTION — "The six weeks" (timeline component; use the site's step/timeline treatment)
- Week 1 — Diagnose: data audit against the schema, gap fixes, promo/launch flagging, unit-economics inputs locked.
- Week 2 — Model v1: adstock + diminishing-returns regression with out-of-sample validation; first mROAS read.
- Week 3 — Design: sensitivity runs, channel deep-dive, reallocation plan (10–25% moves), test selection.
- Week 4 — Test launch: geo-holdout incrementality test, pre-registered and locked before spend moves.
- Week 5 — Dashboard: the self-serve "what happens if I add $1K to…" view, wired to your data.
- Week 6 — Handoff: decision-rules playbook, team walkthrough, monthly refresh procedure. The code is yours.
- Weeks 8–10 — Test readout (included, async): verdict on the live test + final reallocation memo.

### SECTION — "What you get" (deliverables grid)
Model + code (documented, yours) · Live incrementality test with pre-registration · Self-serve dashboard · Reallocation decision rules · Monthly refresh procedure · Test readout memo

### SECTION — "How we keep it honest" (short, 3 items)
Out-of-sample validation only — no flattering fit statistics · The test outranks the model wherever they disagree · Small reversible moves (10–25%) — never zero a channel on model evidence alone

### SECTION — Pricing
"[PRICE] — fixed fee, fixed scope, weekly standups." (or the no-price variant from prep note 4)

### SECTION — FAQ
Q: What if we don't have 26 weeks of clean data? → "Week 1 exists for exactly this — most teams' data needs assembly, not creation. If it's genuinely too thin, we'll tell you on the scoping call and point you to the free kit until it isn't."
Q: Do we keep the model? → "Yes — code, dashboard, playbook, everything. The sprint's goal is that you don't need us afterward."
Q: MMM vs our attribution tool? → "They answer different questions. Attribution credits touchpoints per user and degrades as tracking signal disappears; MMM reads aggregate spend-to-outcome patterns with no user tracking, and answers the budget question directly."
Q: What does the incrementality test require? → "One priority channel, a geo split we design together, and 4–8 weeks of patience. It's pre-registered before launch — no peeking, no goal-moving."

### SEO
- Title: "MMM-Lite Sprint — Marketing Mix Modeling for Startups in 6 Weeks | AAJ"
- Meta description: "A 6-week done-with-you sprint: media-mix model on your data, a live incrementality test, a self-serve dashboard, and the playbook. Privacy-first measurement — you keep the code."
- JSON-LD: Service schema — {"@context":"https://schema.org","@type":"Service","name":"MMM-Lite Sprint","provider":{"@type":"Organization","name":"AAJ","url":"https://aajconsult.com"},"serviceType":"Marketing mix modeling and incrementality testing","areaServed":"Worldwide","description":"Six-week marketing measurement sprint: media-mix model, incrementality test, dashboard and playbook handoff."} plus FAQPage mirroring the four FAQs above.
- Prerendered like other pages.

ACCEPTANCE: page renders desktop+mobile; nav item present; both CTAs resolve; JSON-LD + meta in prerendered HTML.

═══════════════════════════════════════════
PROMPT 2 — KIT LANDING PAGE: /resources/mmm-lite-starter-kit
═══════════════════════════════════════════

Create a lead-magnet landing page at /resources/mmm-lite-starter-kit, modeled structurally on /resources/marketing-budget-planner.

1. EDGE FUNCTION: add to the "subscribe" mapping: "mmm-starter-kit" → list [LIST_ID]. Change nothing else in the function.
2. HOST FILE: place the attached aaj-mmm-lite-starter-kit.zip at public/downloads/aaj-mmm-lite-starter-kit.zip.
3. HERO:
   - Badge: FREE KIT
   - H1: Get the MMM-Lite Starter Kit
   - Subcopy: "Privacy-first measurement on a budget. A ready-to-run media-mix model (Python), the exact weekly data schema, an incrementality-test pre-registration template, and the monthly decision rules — the working parts of the system AAJ builds for Seed–Series B clients."
   - Hero visual: the attached mmm-lite-starter-kit-cover.png with the standard cover-card treatment (no carousel for this one).
   - Email form: standard pattern, source "mmm-starter-kit", button "Get the kit", usual reassurance line, honeypot, success → /thank-you.
4. SECTION — "What's inside" (4 items): The model (adstock, diminishing returns, honest out-of-sample fit checks, mROAS per channel, a reallocation suggestion) · The data schema (fill it, run it) · The test pre-reg template (lock it before launch — no peeking) · The decision rules (10–25% monthly moves; the test outranks the model).
5. SECTION — "Is it for you?": "You'll need 26–52 weeks of weekly data, spend that varied, and someone comfortable running a Python script. No data science team required — the health checks tell you when to trust the outputs and when not to." 
6. SECTION — FAQ (3): What is MMM-Lite? (definition, matching the blog) · How much data? (26–52 weeks weekly, varied spend) · Is the code really free? ("Yes — MIT-style, use it, adapt it. The paid version is the 6-week sprint where we build it on your data with a live test." Link to /services/mmm-lite-sprint.)
7. FINAL CTA: repeat form, heading "Measure without tracking anyone". Below it: "Want it built for you? See the MMM-Lite Sprint →" linking to the service page.
8. SEO: Title "Free MMM-Lite Starter Kit — Media Mix Model for Startups (Python) | AAJ" · Meta description "Free marketing mix modeling starter kit: ready-to-run Python model, weekly data schema, incrementality test template, and decision rules. Privacy-first measurement for startups." · Canonical /resources/mmm-lite-starter-kit · OG image = the cover · WebPage + BreadcrumbList + FAQPage JSON-LD mirroring the three FAQs · prerendered.
9. GALLERY CARD on /resources: image = cover; tag "PYTHON + TEMPLATES · FREE"; title "The MMM-Lite Starter Kit"; description "A ready-to-run media-mix model, the data schema, an incrementality-test template, and monthly decision rules — where does the next $1,000 work hardest?"; link "Get the kit →".

CONSTRAINTS (both prompts): no new dependencies; don't touch other pages/forms/prerender beyond what's listed; mobile clean.
ACCEPTANCE: zip URL downloads; form → 200 → correct list → /thank-you; gallery shows five cards; JSON-LD present.

═══════════════════════════════════════════
AFTER SHIPPING — Brevo (10 minutes)
═══════════════════════════════════════════
1. Duplicate a download automation → trigger = "MMM Kit — Downloads".
2. Email step ← aaj-mmm-kit-download-email.html (no placeholders — sprint link already in).
3. Wait 3 days → replace the generic nudge with aaj-mmm-kit-nudge-email.html (this one sells the SPRINT, not the strategy call — the kit's downloaders are your highest-intent audience).
4. Fresh-email end-to-end test, as always.
