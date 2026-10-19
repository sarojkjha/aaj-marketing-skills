# Recipe: Google Search Console export into `content-decay`

A Google Search Console comparison export shows how search traffic changed across two periods: clicks, impressions, and average position for each page. The `content-decay` engine sorts every page by what happened to it (decaying, snippet loss, demand drop, rising, or stable), ranks the refresh candidates by clicks lost, and finds page-one pages sitting below your site's own CTR median. Search Console brings the data and the engine brings the verdict.

**You need:** access to Google Search Console for your site (with at least three to six months of performance history), an export or query comparing two equal-length periods, and the AAJ engines, either installed or as the hosted connector.

## 1. Export from Google Search Console

You can export directly from the Search Console web interface without writing code or configuring API credentials:

1. Open **Google Search Console** and select your property.
2. In the left navigation, click **Performance** > **Search results**.
3. Click the **Date** filter pill at the top, switch to the **Compare** tab, and choose **Compare last 3 months to previous period** (or set custom dates of equal length, such as 90 days vs the preceding 90 days).
4. Select the **Pages** tab in the table below the chart.
5. Click **Export** (top right) and choose **Download CSV** (or Google Sheets / Excel).
6. Open the exported `Pages` table. It contains the comparison columns for each URL: Clicks (current and previous period), Impressions (current and previous period), and Average Position (current and previous period).

If your agent connects to Google Search Console via an MCP server or API integration, query the Search Analytics API (`searchanalytics.query`) with dimension `page` over the two matching date ranges.

## 2. Add the AAJ engines

Either setup works:

- **Hosted, no install:** add `https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp` as a custom connector. The engine is `content-decay`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill content-decay`.

## 3. What to check first

Before feeding numbers into the engine, verify three things:

- **Equal date ranges.** The engine evaluates absolute click loss and percentage change. If the two periods are unequal (for example, comparing 90 days against 60 days, or a full quarter against a partial month), flat traffic will register as artificial decay. Ensure both periods span the exact same number of days, and set `periodDays` to that duration.
- **Seasonality.** If your business has seasonal patterns (holiday surges, summer lulls, B2B end-of-year budget pauses), a quarter-over-quarter comparison will mistake a predictable seasonal drop for decaying content. When seasonality applies, compare the current period against the same period of the previous year (e.g. Q4 2026 vs Q4 2025) rather than the preceding quarter.
- **Redirected URLs and migrations.** If you redesigned the site, moved `/posts/` to `/blog/`, updated slug formats, or have duplicate rows caused by trailing slashes or HTTP vs HTTPS variants, Search Console treats each URL as a separate entity. The old URL will show 100% click loss while the new URL looks like a new page. Consolidate redirected and duplicate URLs into the canonical target URL before running the engine.

## 4. Give your agent this prompt

```
Use this Google Search Console export and the AAJ content-decay engine to find which pages are decaying and what to refresh first.

1. Here is the Search Console Pages comparison export covering two equal periods of [e.g. 90 days]:
   [paste CSV rows, markdown table, or attach export file]
2. For each page row, map:
   - page: clean URL path (e.g. /blog/post-name)
   - clicks: clicks in the current/recent period
   - clicksPrev: clicks in the earlier comparison period
   - impressions: impressions in the current/recent period
   - impressionsPrev: impressions in the earlier comparison period
   - position: average position in the recent period (if present)
   - positionPrev: average position in the earlier period (if present)
3. Check for redirected URLs, site migrations, or trailing-slash duplicates and merge them first.
4. Call run_engine with engine "content-decay" and input:
   { "periodDays": 90, "pages": [ ... ] }
5. Report the engine's numbers as printed:
   - The headline verdict and counts by category (decaying, snippet loss, demand drop, rising, stable, too small).
   - The refresh candidates ranked by clicks lost, with the reason and recommended next action for each.
   - Title and snippet test candidates that sit below our site's own CTR median for their position band.
   - Any check warnings (such as masked decay hidden under site-wide growth).
```

## 5. How Search Console's export maps to the engine

| Engine input | From Search Console export | Note |
|---|---|---|
| `pages[].page` | `Top pages` or `Page` column | Clean URL path or full URL. Removing protocol and domain (e.g. `/blog/example` instead of `https://example.com/blog/example`) keeps reports readable |
| `pages[].clicks` | `Clicks` (current / recent period) | Numeric count in the recent period. Whole numbers |
| `pages[].clicksPrev` | `Clicks` (previous comparison period) | Numeric count in the earlier period. Whole numbers. A page needs 20+ clicks in `clicksPrev` to be judged (under 20 is classified as `too-small`) |
| `pages[].impressions` | `Impressions` (current / recent period) | Numeric count. Compares search demand between periods |
| `pages[].impressionsPrev` | `Impressions` (previous comparison period) | Numeric count in earlier period. Flat impressions with falling clicks indicate decay; falling impressions indicate demand drop; rising impressions with falling clicks indicate snippet loss |
| `pages[].position` | `Average Position` (recent period) | Optional average ranking position (e.g. 6.8). Used to separate ranking loss (>= 1.0 drop) from snippet loss, and to identify positions 1–10 for CTR tests |
| `pages[].positionPrev` | `Average Position` (previous period) | Optional average ranking position in earlier period |
| `periodDays` | Comparison duration | Optional integer (e.g. 90 or 28). Labels the report header |

How the engine categorises each page:
- **Decaying:** clicks fell by 20% or more with demand roughly flat (impressions within ±20%). If average position slipped by 1.0 or more, it is a ranking loss; refresh the content and inspect what now ranks above it. If position held flat, check the title and SERP snippet first.
- **Snippet loss:** impressions rose by 20% or more while clicks fell by 20% or more. The page appears more often but is chosen less; a SERP feature, AI Overview, or competitor title is taking the click.
- **Demand drop:** impressions fell by 20% or more alongside clicks. Overall search interest declined. Not the page's fault; verify seasonality before editing.
- **Rising / Stable:** clicks rose by 20% or more (rising) or remained within ±20% (stable).
- **Too small:** fewer than 20 clicks in both periods; too small to judge statistically.

The input the engine receives looks like this:

```json
{
  "periodDays": 90,
  "pages": [
    { "page": "/blog/saas-pricing-models", "clicks": 310, "clicksPrev": 520, "impressions": 14000, "impressionsPrev": 14200, "position": 7.2, "positionPrev": 4.5 },
    { "page": "/blog/customer-retention-strategies", "clicks": 180, "clicksPrev": 290, "impressions": 8500, "impressionsPrev": 8600, "position": 6.1, "positionPrev": 6.0 },
    { "page": "/blog/annual-planning-template", "clicks": 50, "clicksPrev": 240, "impressions": 1500, "impressionsPrev": 7500, "position": 3.8, "positionPrev": 4.0 },
    { "page": "/blog/b2b-sales-funnel", "clicks": 210, "clicksPrev": 300, "impressions": 16000, "impressionsPrev": 11000, "position": 2.8, "positionPrev": 3.0 },
    { "page": "/tools/churn-calculator", "clicks": 820, "clicksPrev": 450, "impressions": 19000, "impressionsPrev": 11500, "position": 3.2, "positionPrev": 5.8 },
    { "page": "/blog/product-led-growth-guide", "clicks": 420, "clicksPrev": 430, "impressions": 15000, "impressionsPrev": 15500, "position": 4.8, "positionPrev": 5.0 },
    { "page": "/blog/developer-marketing-playbook", "clicks": 145, "clicksPrev": 150, "impressions": 18000, "impressionsPrev": 17500, "position": 5.5, "positionPrev": 5.4 },
    { "page": "/blog/product-market-fit-survey", "clicks": 85, "clicksPrev": 80, "impressions": 3500, "impressionsPrev": 3400, "position": 2.9, "positionPrev": 3.1 },
    { "page": "/blog/onboarding-email-teardown", "clicks": 15, "clicksPrev": 18, "impressions": 900, "impressionsPrev": 950, "position": 14.2, "positionPrev": 13.8 },
    { "page": "/blog/marketing-attribution-guide", "clicks": 90, "clicksPrev": 0, "impressions": 4200, "impressionsPrev": 0, "position": 9.1, "positionPrev": null }
  ]
}
```

## 6. Before you trust it

- **Export all pages, not a filtered view.** The engine calculates your site's own CTR medians by position band (positions 1–3 and 4–10) from pages with 500+ impressions. Filtering by subfolder or tag distorts the site baseline.
- **Total traffic growth hides decay.** If total clicks grew (for instance, driven by recent viral or new articles), that overall gain often conceals hundreds of lost clicks on previously core evergreen pages. The engine specifically checks for and flags masked decay.
- **Average position blends queries.** A page that starts ranking for broad, low-CTR queries on position 20+ will show a worsening average position even if its primary target keyword held position 1. Cross-check the top refresh candidates in Search Console's Queries tab.
- **Twenty clicks is a statistical cutoff, not a business cutoff.** A high-intent checkout or contact page that dropped from 19 clicks to 3 won't trigger the decay threshold because under-20 counts are volatile. Inspect high-value low-volume pages manually.
- **Refresh the page, do not rewrite it.** Keep the URL intact, preserve the sections that still win impressions, update outdated screenshots and figures, and cover the specific subtopics competitors ranking above you now address.

## Sources

Checked on October 19, 2026.

- [Google Search Console Help: Performance report (Search)](https://support.google.com/webmasters/answer/7576553)
- [Google Search Console Help: Compare dates](https://support.google.com/webmasters/answer/7576553#compare)
- [Google Search Central: Search Console Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics)
- [AAJ Marketing Skills: Content Decay Engine](https://github.com/sarojkjha/aaj-marketing-skills/tree/main/skills/content-decay)
