# Recipe: Ahrefs or Semrush keyword data into `aaj-programmatic-seo`

A keyword tool's MCP server supplies search demand for the queries your template pages would target. The `aaj-programmatic-seo` engine says whether the build pays back. It runs the queries through an indexation and ranking funnel instead of multiplying pages by search volume. The vendor brings the data and the engine brings the verdict.

**You need:** a paid Ahrefs or Semrush plan that includes MCP access (step 1), your list of target queries (one per page you would build), and the AAJ engines.

## 1. Connect one keyword tool

**Ahrefs.** The remote server is `https://api.ahrefs.com/mcp/mcp` (the old `@ahrefs/mcp` npm package is deprecated).

- Claude Code: `claude mcp add ahrefs https://api.ahrefs.com/mcp/mcp -t http`, then `/mcp` → sign in → Allow.
- Claude desktop or web: Connectors → Ahrefs → Connect.
- Plan: Ahrefs says "Lite plan or higher". MCP calls spend the same API units as Ahrefs' API, and each call costs at least 50 units, so a long query list costs more.
- Ahrefs' terms say custom scripts, bridges and standalone clients may not call the MCP endpoint. Let your agent make the calls, as this recipe does. Scripts should use Ahrefs' API.

**Semrush.** The remote server is `https://mcp.semrush.com/v2/mcp`, signed in with OAuth or an `Authorization: Apikey` header.

- Claude Code: `claude mcp add semrush https://mcp.semrush.com/v2/mcp -t http`, then `/mcp` → Authenticate.
- Claude, ChatGPT or Perplexity: the Semrush app → Connect → Approve. Cursor: add the URL under Tools & MCP.
- Plan: Semrush lists MCP API units with Semrush One Starter and Pro+, and SEO Classic Pro and Guru. Check your plan before a large run.
- Keyword data comes through the `keyword_research` tool, then `get_report_schema` and `execute_report`.

## 2. Add the AAJ engines

- **Hosted, no install:** add `https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp` as a custom connector. The engine is `aaj-programmatic-seo`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill aaj-programmatic-seo`.

## 3. Give your agent this prompt

```
Use [Ahrefs | Semrush] and the AAJ aaj-programmatic-seo engine to decide whether
this programmatic build pays back.

1. Here are the target queries, one per page I would build: [paste the list, or
   the template plus the values, e.g. "payroll software for {industry}"].
2. For each query, get the US monthly search volume and keyword difficulty with
   [Ahrefs Keywords Explorer | Semrush keyword_research]. Give me the table.
3. pages = the number of queries in the list. volume = the median monthly volume
   across them (not the mean: a few head terms would inflate it).
4. Call run_engine with engine "aaj-programmatic-seo" and input
   { "pages", "volume", "conv", "value", "costPerPage", "fixedCost", "uniqueData" }
   using the conversion rate, value per conversion and costs I give you:
   conv = [your visitor-to-conversion %], value = [$ per conversion],
   costPerPage = [$], fixedCost = [$], uniqueData = [none | some | strong].
5. Report the engine's verdict, funnel and payback as printed, then list the
   queries with zero volume separately.
```

## 4. How the keyword data maps to the engine

| Engine input | From the keyword tool or from you | Note |
|---|---|---|
| `pages` | The number of target queries | One query per page; drop duplicates first |
| `volume` | Median monthly search volume across those queries | The median resists a few head terms. Say which you used |
| `rankRate` | Your judgement, informed by keyword difficulty | The 0.30 default is an AAJ assumption. If most queries look hard for a site like yours, lower it |
| `position`, `ctr` | Search Console, once you have pages ranking | Until then the engine's CTR curve applies (Backlinko, pre-AI Overviews) |
| `conv`, `value`, `costPerPage`, `fixedCost` | You | The keyword tool does not know these |
| `uniqueData` | You: `none`, `some` or `strong` | Whether each page has something a competitor cannot regenerate. It decides most builds |

An example input for a hypothetical build:

```json
{ "pages": 240, "volume": 30, "conv": 2, "value": 300, "costPerPage": 10, "fixedCost": 6000, "uniqueData": "some" }
```

The engine also accepts these as flags (`--pages 240 --volume 30 …`). An option it does not recognise stops the run instead of falling back to the demo.

## 5. Before you trust it

- **Volume estimates differ between tools.** Ahrefs and Semrush model search volume differently, so do not mix their numbers in one run.
- **Zero-volume queries are not worthless,** but the engine cannot value them. List them, and decide on them separately.
- **The funnel rates are assumptions.** `indexRate` (0.60) and `rankRate` (0.30) are AAJ defaults, not measured rates. Replace them with your own as soon as a first batch of pages has been live for a few months.

## Sources

Checked on October 11, 2026.

- Ahrefs: [MCP introduction](https://docs.ahrefs.com/mcp/docs/introduction), [tool categories](https://docs.ahrefs.com/mcp/docs/tool-categories), [Claude Code setup](https://docs.ahrefs.com/mcp/docs/claude-code), [getting started](https://help.ahrefs.com/en/articles/13913559-getting-started-with-ahrefs-mcp)
- Semrush: [Semrush MCP](https://developer.semrush.com/api/basics/semrush-mcp/), [MCP in the knowledge base](https://www.semrush.com/kb/1618-mcp), [getting started with MCP](https://www.semrush.com/kb/1619-getting-started-with-mcp)
