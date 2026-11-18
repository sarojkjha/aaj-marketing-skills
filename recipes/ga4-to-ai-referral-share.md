# Recipe: GA4 traffic sources into `ai-referral-share`

Google's Analytics MCP server reads your sessions and key events by source from GA4. The `ai-referral-share` engine separates the visits AI assistants sent (ChatGPT, Perplexity, Gemini, Copilot, Claude, DeepSeek and Grok), reports each one's share of sessions and key events, and says whether those visits really convert differently from the rest or the data is too thin to tell. GA4 brings the data and the engine brings the verdict, so the agent never estimates a number it could compute: it passes GA4's counts as they are.

**You need:** a GA4 property you can read, an AI client that runs local MCP servers, and the AAJ engines, installed or as the hosted connector.

## 1. Connect the Google Analytics MCP server

Google publishes it as the "Google Analytics MCP Server (Experimental)", PyPI package `analytics-mcp`. It runs on your machine and reads with the `analytics.readonly` scope. Its one write tool, which adds a note to a property, is off unless you start the server with `--allow-write`. This recipe leaves it off.

1. Enable the Google Analytics Admin API and the Google Analytics Data API in a Google Cloud project, and install `pipx`.
2. Sign in with Application Default Credentials:
   ```
   gcloud auth application-default login --scopes https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/cloud-platform --client-id-file=YOUR_CLIENT_JSON_FILE
   ```
3. Add the server to Claude Code:
   ```
   claude mcp add analytics-mcp --scope user -e "GOOGLE_APPLICATION_CREDENTIALS=PATH_TO_CREDENTIALS_JSON" -e "GOOGLE_PROJECT_ID=YOUR_PROJECT_ID" -- pipx run analytics-mcp
   ```

Google's docs cover Gemini CLI, Gemini Code Assist and Claude Code. Other clients that run local MCP servers can use the same `pipx run analytics-mcp` command, but Google does not document them.

**No connection?** In GA4, open the Traffic acquisition report, set the first column to Session source / medium, and export the CSV. Paste it into the [AI Referral Share Reader](https://aajconsult.com/tools/ai-referral-share-reader), which runs the same engine in your browser and uploads nothing.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://mcp.aajconsult.com/mcp` as a custom connector. The engine is `ai-referral-share`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill ai-referral-share`.

## 3. Give your agent this prompt

```
Use the Google Analytics MCP server and the AAJ ai-referral-share engine to
show how much of my traffic AI assistants send. GA4 property: [property ID].
Dates: [start date] to [end date].

1. Use run_report with dimensions sessionSource and sessionMedium, and metrics
   sessions, keyEvents and engagedSessions (add totalRevenue if I sell online).
   No filters. Get every row; if the report was cut short, tell me.
2. Build one row for each row GA4 returns: source, medium, sessions, keyEvents,
   engagedSessions (and revenue). Pass the numbers as GA4 returns them: do not
   add, group, round or drop rows, and do not decide which sources are AI
   assistants. The engine does that.
3. Call run_engine with engine "ai-referral-share" and input { "rows": [ ... ] }.
4. Report the engine's output as printed. Do not recompute or round it.
```

## 4. How GA4's fields map to the engine

| Engine input | From GA4 | Note |
|---|---|---|
| `rows[].source` | `sessionSource` | "The source that initiated a session on your website or app" |
| `rows[].medium` | `sessionMedium` | A row with medium `ai-assistant` and a source the engine does not know counts as "Other AI assistant" |
| `rows[].sessions` | `sessions` | "The number of sessions that began on your site or app" |
| `rows[].keyEvents` | `keyEvents` | "The count of key events." Every event you marked as key, added together |
| `rows[].engagedSessions` | `engagedSessions` | Optional |
| `rows[].revenue` | `totalRevenue` | Optional |
| `extra` | You | Optional. More assistants to count, each with a name and a web address |

How the engine reads the rows:

- **An assistant is recognised by its web address.** The engine matches each source against the addresses each assistant's maker publishes, and prints them with their sources in the output.
- **The comparison is the engine's choice of test.** It compares key events per session for an assistant against the rest of the site, as a ratio with an exact interval. It says "higher" or "lower" only when the interval excludes 1, and "not enough data to tell" otherwise.

The input the engine receives looks like this (Example Co. is fictional):

```json
{
  "rows": [
    { "source": "google", "medium": "organic", "sessions": 5200, "keyEvents": 150, "engagedSessions": 3100 },
    { "source": "(direct)", "medium": "(none)", "sessions": 2400, "keyEvents": 88, "engagedSessions": 1300 },
    { "source": "linkedin.com", "medium": "referral", "sessions": 640, "keyEvents": 21, "engagedSessions": 380 },
    { "source": "chatgpt.com", "medium": "referral", "sessions": 310, "keyEvents": 19, "engagedSessions": 220 },
    { "source": "perplexity.ai", "medium": "referral", "sessions": 95, "keyEvents": 4, "engagedSessions": 61 }
  ]
}
```

For that input the engine reports that AI assistants sent 405 of 8,645 sessions (4.7%) and 23 of 282 key events (8.2%). ChatGPT's visits produce more key events per session than the rest; for Perplexity there is not enough data to tell.

## 5. Before you trust it

- **It counts only what GA4 attributed to an assistant.** Visits from apps that pass no referrer, or links copied out of an answer, usually arrive as direct traffic. They are not in these numbers.
- **Google's AI Overviews and AI Mode are not here.** Those clicks are reported as Google search, so they cannot be separated from organic search.
- **Key events can repeat in a session.** That makes the interval somewhat too narrow, and the engine says so. The export route in the AI Referral Share Reader can compare sessions with a key event instead, when the export includes Session key event rate.
- **Use all your traffic.** The engine works out the site total from the rows. A filtered or cut-short report makes every share wrong.
- **Check the key events.** GA4 adds every key event together. If one of them is a page view, the comparison is about page views.
- **Small assistants rarely get a verdict.** That is the engine working as intended. A longer date range gives it more to work with.

## Sources

Checked on November 18, 2026.

- [Google Analytics MCP server](https://github.com/googleanalytics/google-analytics-mcp) (GitHub): tools, setup, scopes, the write tool
- [Analytics Data API dimensions and metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema) (Google): `sessionSource`, `sessionMedium`, `sessions`, `keyEvents`, `engagedSessions`, `totalRevenue`
- [Default channel group](https://support.google.com/analytics/answer/9756891) (Analytics Help): the AI assistant channel, and that it excludes AI Overviews and AI Mode
- Engine spec: [ai-referral-share](../docs/engines/ai-referral-share.md), which lists the source for each assistant's web address
