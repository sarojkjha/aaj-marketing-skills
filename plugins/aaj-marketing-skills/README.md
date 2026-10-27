# AAJ marketing skills (plugin)

The math layer for marketing agents. Keep your writing skills and add the arithmetic: deterministic engines for unit economics, pipeline coverage, A/B significance, budget allocation, pricing, retention and SEO/GEO scoring, for Seed to Series B startups.

Version 1.2.1. MIT licence.

- **Skills:** the marketing methods, in `skills/`.
- **Engines:** most skills carry a small JavaScript engine in `resources/`. It takes your numbers and returns a number and a verdict, the same answer every time. Engines make no network calls and write no files.
- **MCP server:** `platform/mcp/server.mjs` starts locally (Node 18 or later, no install step) and lets Claude list and run the engines.

Methods and the full catalogue: https://skills.aajconsult.com
Source and issues: https://github.com/sarojkjha/aaj-marketing-skills
