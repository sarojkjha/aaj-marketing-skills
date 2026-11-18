# Recipe: Google Search Console queries into `search-demand-reader`

Search Console holds the searches your pages already appear for: clicks, impressions and average position for each query, and which page showed. The `search-demand-reader` engine sorts those queries by intent, groups them into topics, and reports where the demand is: topics you appear for on page two or worse, queries two of your pages compete for, the branded share of your clicks, and the rival-brand searches you show up in. Search Console brings the data and the engine brings the verdict, so the agent never estimates a number it could compute: it passes Google's counts as they are.

**You need:** access to the Search Console property, the words that mark a branded search, and the AAJ engines, installed or as the hosted connector.

## 1. Get the data from Search Console

There are two routes.

**Live, through the Search Analytics API.** This recipe does not name a connector: use any MCP server or integration that calls Google's Search Analytics API (`searchanalytics.query`) with your own Google sign-in. Read access is enough: the `webmasters.readonly` scope. The agent runs one query:

| Request field | Value | Note |
|---|---|---|
| `startDate`, `endDate` | At least three months, as `YYYY-MM-DD` | Both dates are included, in Pacific time |
| `dimensions` | `["query", "page"]` | One row per query and page. The page is what lets the engine find two pages competing for one query |
| `rowLimit` | `25000` | The default is 1,000. For more rows, page with `startRow` |
| `dataState` | Leave out, or `final` | Finalised data only. Recent days are still changing |

Each row comes back with `keys` (the query, then the page URL), `clicks`, `impressions`, `ctr` and `position`.

**From an export, no connection.** In Search Console, open **Performance**, then **Search results**, set the date range to at least three months, and **Export**. Give the Queries file to your agent, or paste it into the [Search Console Query Reader](https://aajconsult.com/tools/search-console-query-reader), which runs the same engine in your browser and uploads nothing. The Queries file has no page column, so this route cannot show queries split across your own pages.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://mcp.aajconsult.com/mcp` as a custom connector. The engine is `search-demand-reader`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill search-demand-reader`.

## 3. Give your agent this prompt

```
Use Search Console and the AAJ search-demand-reader engine to show where the
search demand is for [site]. Read only.

1. Query the Search Analytics API once with dimensions ["query", "page"] and
   rowLimit 25000, finalised data only, from [start date] to [end date] (at
   least three months). If it returns 25,000 rows, page with startRow until a
   response comes back empty.
2. Build one row for each row Google returns: query, page, clicks, impressions
   and position. Pass the numbers as Google returns them: do not round, add,
   group or rescale anything, and do not drop rows.
3. Ask me for my brand words (every way people type the brand, including
   misspellings) and, if I want them, rival brand words. Do not guess them from
   the queries.
4. Call run_engine with engine "search-demand-reader" and input
   { "brand": [...], "rivals": [...], "queries": [ ... ] }.
5. Report the engine's output as printed. Do not recompute or round it.
```

## 4. How Search Console's fields map to the engine

| Engine input | From the API | Note |
|---|---|---|
| `queries[].query` | `keys[0]` | The search as Google reports it |
| `queries[].page` | `keys[1]` | Optional. Without it the engine cannot find queries split across your pages |
| `queries[].clicks` | `clicks` | "Click count for the row" |
| `queries[].impressions` | `impressions` | "Impression count for the row." Impressions are how often you appeared, not how often people searched |
| `queries[].position` | `position` | "Average position in search results" |
| `brand` | You | Words that mark a branded search. Leave one out and those searches count as non-branded demand |
| `rivals` | You | Optional. Rival brand words, to list the rival-brand searches you appear in |

How the engine reads the rows. Every threshold is the engine's rule, not a benchmark:

- **Intent** comes from words in the query: branded, informational, commercial or transactional. A query with none of those words is "unqualified", not guessed.
- **Topics** group queries by their most common word. A topic needs 200 impressions to count.
- **A gap** is a topic whose impression-weighted position is worse than 10: you already appear, on page two or worse.
- **A split** is a query where two or more of your pages each take at least 20% of its impressions.

The input the engine receives looks like this (Example Co. and Rivalsoft are fictional):

```json
{
  "brand": ["example co", "exampleco"],
  "rivals": ["rivalsoft"],
  "queries": [
    { "query": "example co pricing", "clicks": 120, "impressions": 900, "position": 1.2, "page": "https://example.com/pricing" },
    { "query": "field service scheduling software", "clicks": 14, "impressions": 2600, "position": 12.4, "page": "https://example.com/field-service-scheduling" },
    { "query": "field service scheduling software", "clicks": 6, "impressions": 1100, "position": 15.1, "page": "https://example.com/blog/scheduling-guide" },
    { "query": "best scheduling software for plumbers", "clicks": 9, "impressions": 1400, "position": 11.8, "page": "https://example.com/field-service-scheduling" },
    { "query": "how to schedule technicians", "clicks": 40, "impressions": 1800, "position": 5.3, "page": "https://example.com/blog/scheduling-guide" },
    { "query": "rivalsoft alternative", "clicks": 3, "impressions": 450, "position": 9.6, "page": "https://example.com/compare" }
  ]
}
```

For that input the engine reports one gap, the topic "scheduling" with 5,100 impressions at position 12.8, and one query split 70% and 30% across two pages.

## 5. Before you trust it

- **It only sees searches where you appeared.** The engine cannot size a market or show demand you never appeared for. Impressions are not search volume.
- **The API returns top rows, not every row.** Google says the API "does not guarantee to return all data rows but rather top ones," sorted by clicks, and that when grouping by page or query "our system may drop some data." Totals here can be lower than the totals in the Performance report.
- **Counts are per page.** With the page in the query, Google counts each of your pages separately, so a search that showed two of your pages counts once for each.
- **Topics are coarse on purpose.** They group by one word. Read the top queries under a topic before briefing a page.
- **Brand words decide the branded share.** Check the list before quoting that figure.
- **A split is a prompt to look, not a verdict.** In AAJ's view, two pages sharing a query is only a problem when neither ranks well. Open both pages before merging anything.

## Sources

Checked on November 18, 2026.

- [Search Analytics: query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) (Search Console API reference): request fields, row limits, `dataState`, response fields, scopes, and the top-rows limit
- [Query your Google Search data](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data) (Search Console API guide): grouping by page and query, paging with `startRow`, and dropped data
- [Performance report (Search results)](https://support.google.com/webmasters/answer/7576553) (Search Console Help): impressions, average position, and "data grouped by Pages or Search appearance is aggregated by page"
- Engine spec: [search-demand-reader](../docs/engines/search-demand-reader.md)
