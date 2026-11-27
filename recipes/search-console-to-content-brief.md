# Recipe: Google Search Console pages into `seo-content-brief`

Before you brief a page for a query, find out which of your pages Google already answers that query with. Search Console knows: filter the Performance report to one query and it lists the pages it showed, with their clicks, impressions and average position. The `seo-content-brief` engine reads those rows as part of the brief. A page of yours that already holds the query on page one stops the brief until you say what happens to that page: this brief rewrites it, or it serves another intent. Search Console brings the data and the engine brings the verdict, so the agent never estimates a number it could compute: it passes Google's counts as they are.

**You need:** access to the Search Console property, the target query, and the AAJ engines, installed or as the hosted connector.

## 1. Get the data from Search Console

There are two routes.

**Live, through the Search Analytics API.** This recipe does not name a connector: use any MCP server or integration that calls Google's Search Analytics API (`searchanalytics.query`) with your own Google sign-in. Read access is enough: the `webmasters.readonly` scope. The agent runs two queries.

The first finds the query as Search Console spells it, because the exact-match filter is case-sensitive:

| Request field | Value | Note |
|---|---|---|
| `startDate`, `endDate` | At least three months, as `YYYY-MM-DD` | The same dates in both queries |
| `dimensions` | `["query"]` | One row per query |
| `dimensionFilterGroups` | One filter: `dimension` `query`, `operator` `contains`, `expression` the target query | `contains` is not case-sensitive |

The second lists the pages shown for that one query:

| Request field | Value | Note |
|---|---|---|
| `dimensions` | `["page"]` | One row per page |
| `dimensionFilterGroups` | One filter: `dimension` `query`, `operator` `equals`, `expression` the query exactly as the first query returned it | `equals` is case-sensitive for queries |
| `rowLimit` | Leave out | The default is 1,000, which is also the most rows the engine takes |
| `dataState` | Leave out, or `final` | Finalised data only. Recent days are still changing |

Each row comes back with `keys` (the page URL), `clicks`, `impressions`, `ctr` and `position`.

**From an export, no connection.** Google's help page for the Performance report gives the steps under "See pages shown for a specific query": open the Queries tab, click the query so the whole report is filtered to it, then open the Pages tab. Choose **Export**. Give the Pages table to your agent, or drop the download into the [Content Brief Builder](https://aajconsult.com/tools/content-brief-builder), which runs the same engine in your browser and uploads nothing.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://mcp.aajconsult.com/mcp` as a custom connector. The engine is `seo-content-brief`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill seo-content-brief`.

## 3. Give your agent this prompt

```
Use Search Console and the AAJ seo-content-brief engine to check which of my
pages Google already shows for "[target query]" on [site], before I brief a
page for it. Read only.

1. Query the Search Analytics API with dimensions ["query"] and a filter
   "query contains [target query]", finalised data only, from [start date] to
   [end date] (at least three months). Show me the queries it returns and use
   the one that is my target query, spelled exactly as Google returns it. If
   none matches, tell me: no page of mine appeared for it.
2. Query again with dimensions ["page"] and a filter "query equals" that exact
   query, for the same dates.
3. Build one row for each row Google returns: page, clicks, impressions and
   position. Pass the numbers as Google returns them: do not round, add, group
   or drop anything.
4. Ask me whether this brief is for a new page or rewrites one I already have,
   and for anything else the brief needs. Do not guess the intent of my pages.
5. Call run_engine with engine "seo-content-brief" and an input that includes
   "pages": [ ... ], "pagesFor": the exact query from step 2, and "updates":
   the page I said the brief rewrites, if any.
6. Report the engine's output as printed. Do not recompute or round it. If you
   proposed any titles, headings, entities or sources yourself and I have not
   checked them, list each one under "drafts".
```

## 4. How Search Console's fields map to the engine

| Engine input | From the API | Note |
|---|---|---|
| `pages[].page` | `keys[0]` | The page URL as Google reports it |
| `pages[].clicks` | `clicks` | The clicks counted for that page |
| `pages[].impressions` | `impressions` | The impressions counted for that page: how often it appeared for the query, not how often people searched |
| `pages[].position` | `position` | The page's average position in the results for that query |
| `pagesFor` | The `expression` of the `equals` filter | Required with `pages`. The engine compares it with `query` and leaves the rows out when they are for another query |
| `updates` | You | The page this brief rewrites, as a path or a link. Leave it out for a new page |
| `existing` | You | Your pages on the topic, each with the intent it serves after a dash |

How the engine reads the rows. Every threshold is the engine's rule, not a benchmark:

- **A page holds the query** when it has 20% or more of the query's impressions.
- **Page one** is an average position of 10 or better.
- **Rows that differ only after a `#`** are one page. Their counts are added and their positions averaged by impressions.
- **A page that holds the query on page one is a blocker**, unless the brief rewrites it (`updates`) or you list it under `existing` with another intent. In that second case the engine asks for the two pages to be linked.
- **A page that holds the query lower down is a smaller gap**: say what happens to it.

The Search Console part of the input looks like this (Example Co. is fictional):

```json
{
  "query": "how to send invoice reminders that get paid",
  "intent": "informational",
  "existing": ["/templates/invoice-reminder-emails - transactional"],
  "pagesFor": "how to send invoice reminders that get paid",
  "pages": [
    { "page": "https://example.com/blog/invoice-reminders", "clicks": 21, "impressions": 620, "position": 8.7 },
    { "page": "https://example.com/templates/invoice-reminder-emails", "clicks": 9, "impressions": 240, "position": 12.4 },
    { "page": "https://example.com/blog/late-payment-fees", "clicks": 0, "impressions": 60, "position": 31 },
    { "page": "https://example.com/blog/invoice-reminders#when-to-send", "clicks": 2, "impressions": 40, "position": 6.1 }
  ]
}
```

For those rows the engine reports 3 pages and 960 impressions. The blog post and its jump link count as one page with 660 of the 960 impressions at position 8.5, so it holds the query on page one: a blocker. The templates page holds it too, with 240 impressions at position 12.4, but it is listed with another intent and sits lower down, so the engine raises nothing for it. The third page has 60 impressions, under 20%. Add `"updates": "/blog/invoice-reminders"` and the blocker goes: the brief is a rewrite of the page that already ranks.

## 5. Before you trust it

- **It only sees searches where a page of yours appeared.** No rows means none of your pages appeared for that exact query in those dates. It does not mean nobody searched.
- **One query at a time.** Search Console treats each spelling as its own query. In AAJ's view it is worth running the check for the two or three closest variants before deciding a page is new.
- **The API returns top rows, not every row.** Google's reference says the query may return the top rows rather than all of them.
- **A handful of impressions can cross a line.** A page with 3 impressions at position 6 holds the query by the engine's rule. The engine prints the counts beside each page so you can see when that is the case.
- **Position is an average.** A page at an average of 9.4 was not on page one for every search.
- **The engine trusts the query you name.** It cannot tell whether the rows were filtered to it. Rows from an unfiltered report list every page on the site, and most of them will look as if they hold the query.

## Sources

Checked on November 27, 2026.

- [Search Analytics: query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) (Search Console API reference): filters and their operators, case sensitivity, row limits, `dataState`, response fields, scopes, and the top-rows limit
- [Performance report (Search results): Common tasks and use cases](https://support.google.com/webmasters/answer/17010961) (Search Console Help): the steps to see the pages shown for one query
- [Performance report (Search results)](https://support.google.com/webmasters/answer/7576553) (Search Console Help): how average position is worked out, and that data grouped by page is added up page by page
- [Export data directly from a Search Console report](https://support.google.com/webmasters/answer/12919797) (Search Console Help): what an export holds, and its limit of 1,000 rows
- Engine spec: [seo-content-brief](../docs/engines/seo-content-brief.md)
