# Recipes: vendor data in, a verdict out

Vendor MCP servers give your agent data: deals, sessions, search volumes. They don't tell you what the numbers mean. AAJ's engines do that part, and they compute it the same way every time, so the agent doesn't have to estimate. Each recipe connects one vendor server to one engine. It gives you a prompt to paste, shows which vendor field goes into which engine input, and lists what to check before you trust the result.

| Recipe | Vendor data | Engine | What you get |
|---|---|---|---|
| [HubSpot deals into the forecast](hubspot-to-pipeline-forecast.md) | HubSpot MCP server: open deals, stages, win probabilities | `pipeline-and-forecast` | Weighted forecast, commit against best case, coverage against your win rate, the gap and the one lever to pull |
| [GA4 results into significance](ga4-to-ab-test-significance.md) | Google Analytics MCP server: sessions and key events by variant | `ab-test-significance` | Sample size before the test; lift, p-value, confidence interval and a verdict after it |
| [Keyword data into a pSEO decision](keyword-data-to-programmatic-seo.md) | Ahrefs or Semrush MCP server: volume and difficulty for your target queries | `aaj-programmatic-seo` | Whether a template-page build pays back, through an indexation and ranking funnel | recipe/gsc-to-content-decay
| [Search Console export into content decay](search-console-to-content-decay.md) | Google Search Console export or MCP server: clicks, impressions and average position across two periods | `content-decay` | Which pages are decaying, losing snippets or hitting seasonal drops; refresh priorities ranked by clicks lost; and page-one CTR tests |
| [Stripe export into unit economics](stripe-to-unit-economics.md) | Stripe MCP server or export: active subscriptions, MRR, churn | `unit-economics` | Gross-margin LTV, CAC payback, LTV:CAC ratio, and a verdict against David Skok and Bessemer reference points |main

All four run with the engines either installed (`npx skills add sarojkjha/aaj-marketing-skills`) or hosted (`https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp`, no install). The engines make no network calls, and the hosted server keeps no copy of what you send it; your agent's model provider still sees the numbers you give the agent ([details](../README.md#what-happens-to-your-data)).

Nothing here ranks or endorses a vendor. If you use another CRM, analytics or keyword tool, the same mapping tables apply. Only the connection steps change.
