# Recipe: Google Search Console data into `content-decay`

Search Console holds how search traffic changed across two periods: clicks, impressions and average position for each page. The `content-decay` engine sorts every page by what happened to it (decaying, snippet loss, demand drop, rising, stable or new), ranks the refresh candidates by clicks lost, and finds page-one pages sitting below your site's own CTR median. Search Console brings the data and the engine brings the verdict, so the agent never estimates a number it could compute: it passes Google's counts as they are.

**You need:** access to the Search Console property, two periods of the same length to compare, and the AAJ engines, installed or as the hosted connector.

## 1. Get the data from Search Console

There are two routes. Both give the engine the same fields.

**Live, through the Search Analytics API.** This recipe does not name a connector: use any MCP server or integration that calls Google's Search Analytics API (`searchanalytics.query`) with your own Google sign-in. Read access is enough: the `webmasters.readonly` scope. The agent runs the same query twice, once per period:

| Request field | Value | Note |
|---|---|---|
| `startDate`, `endDate` | The period, as `YYYY-MM-DD` | Both dates are included, in Pacific time |
| `dimensions` | `["page"]` | One row per page |
| `rowLimit` | `25000` | The default is 1,000. For more rows, page with `startRow` |
| `dataState` | Leave out, or `final` | Finalised data only. Recent days are still changing |

Each row comes back with `keys` (the page URL), `clicks`, `impressions`, `ctr` and `position`.

**From an export, no connection.** In Search Console, open **Performance**, then **Search results**. In the date filter choose **Compare** and pick two periods of the same length. Then **Export** and download the CSV. Give the Pages file to your agent, or drop it on the [Content Decay Finder](https://aajconsult.com/tools/content-decay-finder), which runs the same engine in your browser and uploads nothing.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://mcp.aajconsult.com/mcp` as a custom connector. The engine is `content-decay`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill content-decay`.

## 3. Give your agent this prompt

```
Use Search Console and the AAJ content-decay engine to find which pages are
decaying on [site] and what to refresh first. Read only.

1. Query the Search Analytics API twice with dimensions ["page"] and rowLimit
   25000, finalised data only:
   - recent period: [start date] to [end date]
   - previous period: [start date] to [end date], the same number of days
   (Or read the Pages comparison export I attach.)
2. Build one row per page URL: clicks, impressions and position from the recent
   period; clicksPrev, impressionsPrev and positionPrev from the previous
   period. A page missing from one period gets 0 clicks and 0 impressions there
   and no position. Pass the numbers as Google returns them: do not round, add
   or rescale anything.
3. If you see URLs that look like the same page (http and https, with and
   without a trailing slash, an old and a new path), list them for me. Leave
   the rows as they are; do not add them together.
4. Call run_engine with engine "content-decay" and input
   { "periodDays": [days in each period], "pages": [ ... ] }.
5. Report the engine's output as printed. Do not recompute or round it.
```

## 4. How Search Console's fields map to the engine

| Engine input | From the API | From the export | Note |
|---|---|---|---|
| `pages[].page` | `keys[0]` | The page column | The URL as Google gives it |
| `pages[].clicks` | `clicks`, recent period | Clicks, recent period | "Click count for the row" |
| `pages[].clicksPrev` | `clicks`, previous period | Clicks, previous period | A page with under 20 clicks in both periods is not judged; that is an engine rule |
| `pages[].impressions` | `impressions`, recent period | Impressions, recent period | "Impression count for the row" |
| `pages[].impressionsPrev` | `impressions`, previous period | Impressions, previous period | Without impressions the engine cannot tell decay from a demand drop |
| `pages[].position` | `position`, recent period | Position, recent period | "Average position in search results." Optional |
| `pages[].positionPrev` | `position`, previous period | Position, previous period | Optional. Leave it out, or `null`, for a page with no previous data |
| `periodDays` | The days in each period | The days in each period | Optional. It labels the report |

How the engine sorts each page. Every threshold is the engine's rule, not a benchmark:

- **Decaying:** clicks fell 20% or more with impressions roughly flat. If average position worsened by 1.0 or more, it is a ranking loss.
- **Snippet loss:** impressions rose 20% or more while clicks fell 20% or more. The page shows more and gets chosen less.
- **Demand drop:** impressions fell 20% or more along with clicks. Fewer people searched.
- **Rising or stable:** clicks rose 20% or more, or stayed within 20%.
- **Too small:** under 20 clicks in both periods.
- **New:** no clicks in the previous period.

The input the engine receives looks like this (Example Co. is fictional):

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

## 5. Before you trust it

- **Equal periods.** If one period is longer, flat traffic looks like decay. Use the same number of days in both.
- **Seasonality.** The engine sees two periods only. If your demand is seasonal, compare with the same period last year, not the period just before.
- **Moved and duplicate URLs.** Search Console counts each URL separately. After a migration the old URL shows a total loss and the new one looks new. Fix this in the data you give the engine, not by having the agent add rows.
- **The API returns top rows, not every row.** Google says the API "does not guarantee to return all data rows but rather top ones," sorted by clicks. On a large site, low-traffic pages are missing. They would be too small for the engine to judge anyway.
- **Use the whole site.** The engine works out your own CTR medians, for positions 1 to 3 and 4 to 10, from pages with 500 or more impressions. A filtered view shifts that baseline.
- **Total growth hides decay.** New pages can lift total clicks while older pages lose them. The engine checks for this and says so.
- **Average position blends queries.** For a page, it is one average across all the searches the page appeared in. A page that starts showing for new, low-ranked queries gets a worse average even if its main query held. In AAJ's view, check the top refresh candidates in the Queries tab before rewriting anything.
- **Twenty clicks is a counting rule, not a business rule.** A contact page that fell from 19 clicks to 3 is too small to be judged. Check low-volume, high-value pages by hand.

## Sources

Checked on November 18, 2026.

- [Search Analytics: query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) (Search Console API reference): request fields, row limits, `dataState`, response fields, scopes, and the top-rows limit
- [Query your Google Search data](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data) (Search Console API guide): grouping by page and paging with `startRow`
- [Performance report (Search results)](https://support.google.com/webmasters/answer/7576553) (Search Console Help): the report, average position, export, and that "the newest data can be preliminary"
- [Performance report: Advanced filtering and comparison](https://support.google.com/webmasters/answer/17011165) (Search Console Help): comparing two date ranges
- Engine spec: [content-decay](../docs/engines/content-decay.md)
