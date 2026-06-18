# SEO / GEO / AEO scoring rubric

27 checks across 5 weighted categories, mirroring the AAJ SEO & GEO Readiness Scorer. For each check, record `pass`, `partial`, or `fail`, then run `score.js`. Score = Σ (category pass-rate × category weight). Grade bands: **A ≥ 90 · B 75–89 · C 60–74 · D 45–59 · F < 45.**

Check IDs below are exactly the keys `score.js` expects.

## Technical & Crawlability — weight 25
The make-or-break layer. If crawlers and AI engines can't get rendered HTML, nothing else matters.
- `ssr_prerender` — **the critical one.** Does the initial HTML response contain the real content (title, meta, body, JSON-LD), or an empty SPA shell hydrated later? Test with `curl -A "GPTBot" <url>`. Empty shell = fail.
- `ai_crawlers_allowed` — does `robots.txt` allow GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended?
- `sitemap_present` — a valid `sitemap.xml` exists and lists the page.
- `canonical_correct` — canonical, og:url, sitemap loc, and internal links are the identical string (incl. trailing-slash convention).
- `https` — served over HTTPS, no mixed content.
- `mobile_responsive` — usable and legible on mobile.
- `core_web_vitals` — LCP, CLS, INP in reasonable ranges (no obvious layout shift / slow load).
- `structured_data_present` — at least one valid JSON-LD block.

## On-Page SEO — weight 20
- `title_tag` — unique, descriptive, ≤ ~60 chars.
- `meta_description` — present, compelling, ~150–160 chars.
- `single_h1` — exactly one H1 that states the page topic.
- `heading_hierarchy` — logical H2/H3 structure; question-first H2s are a plus.
- `internal_links` — meaningful internal links to related pages.
- `image_alt` — images have descriptive alt text.

## AEO (Answer Readiness) — weight 20
Winning the direct answer / featured snippet.
- `answer_first_passage` — a 40–60-word passage that directly answers the page's core question, near the top.
- `question_first_h2s` — H2s phrased as the questions users actually ask.
- `faqpage_schema` — FAQPage JSON-LD whose Q&A mirror visible on-page text.
- `scannable_lists_tables` — lists/tables that give answer engines clean extractable blocks.

## GEO (AI Citation Readiness) — weight 20
Getting cited by generative engines. Anchored to the measured lifts from the Princeton GEO study.
- `statistics_present` — concrete numbers and data points (lift ~+30% citation likelihood).
- `inline_citations` — claims cite named, authoritative sources (~+30%).
- `quotations` — attributed quotations included (~+40%).
- `precise_terminology` — exact domain terms a buyer/model would use (~+25–30%).
- `llms_txt` — `llms.txt` and/or `llms-full.txt` present and current.
- `freshness` — visible updated date and `dateModified` in schema.

## Authority & Trust — weight 15
- `author_publisher_schema` — Organization/Person/author schema identifying who published it.
- `outbound_citations` — links out to credible primary sources.
- `original_data` — proprietary data, research, or a tool that others would cite.

## Scoring values
`pass` = 1.0 · `partial` = 0.5 · `fail` = 0. Omitted checks are treated as fail. A category's score = (sum earned ÷ number of checks) × its weight.
