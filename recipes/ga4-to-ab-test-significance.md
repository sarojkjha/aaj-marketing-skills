# Recipe: GA4 test results into `ab-test-significance`

Google's Analytics MCP server reads the counts for each variant from GA4. The `ab-test-significance` engine says whether the difference is real: lift, p-value, a confidence interval and a verdict. It can also tell you, before the test starts, how many visitors you need. GA4 brings the data and the engine brings the verdict.

**You need:** read access to the GA4 property, a Google Cloud project, Python 3.10 or later, and the AAJ engines, either installed or as the hosted connector. Your test must record which variant each visitor saw (step 3).

## 1. Connect the Google Analytics MCP server

Google publishes it as the "Google Analytics MCP Server (Experimental)", PyPI package `analytics-mcp`. It runs on your machine, and it is read-only: it asks only for the `analytics.readonly` scope.

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

## 2. Add the AAJ engines

- **Hosted, no install:** add `https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp` as a custom connector. The engine is `ab-test-significance`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill ab-test-significance`.

## 3. Make sure GA4 knows the variant

GA4 can only split results by variant if every visitor's variant is recorded. Google's integration guide sends an `experience_impression` event with a parameter `exp_variant_string` (`TOOL_ID-EXPERIENCE_ID-VARIANT_ID`). Register that parameter as an event-scoped custom dimension in GA4 Admin. It becomes reportable 24 to 48 hours after you register it, so do it before the test starts.

## 4. Size the test before it starts

Ask the engine how many sessions each variant needs, so you read the result once rather than stopping the day it looks good:

```json
{ "plan": true, "baselineRate": 4, "mde": 1, "confidence": 95, "power": 80 }
```

`baselineRate` and `mde` are percentage points: 4 means a 4% conversion rate, and 1 means you want to detect a move to 5%.

## 5. Give your agent this prompt when the test reaches that size

```
Use the Google Analytics MCP server and the AAJ ab-test-significance engine.

1. Call get_custom_dimensions_and_metrics for property [ID] and confirm the variant
   dimension exists (customEvent:exp_variant_string, or the name I gave it).
2. Call run_report for [test start date] to [test end date] with
   dimensions: [the variant dimension]
   metrics: sessions, sessionKeyEventRate:[your key event name]
3. For each variant: visitors = sessions; conversions = sessions × the key event
   rate, rounded to a whole number. If the rate comes back as a percentage
   rather than a fraction, divide it by 100 first.
4. Call run_engine with engine "ab-test-significance" and input
   { "control": {visitors, conversions}, "variant": {visitors, conversions},
     "confidence": 95 }
5. Report the engine's verdict as printed, with the counts you used.
```

## 6. How GA4's report maps to the engine

| Engine input | From GA4 | Note |
|---|---|---|
| `control.visitors`, `variant.visitors` | `sessions` for each value of the variant dimension | Whole numbers. GA4 returns them as text; the engine reads numeric text |
| `control.conversions`, `variant.conversions` | `sessions` × `sessionKeyEventRate:<event>` | A count of converting sessions, rounded. The engine stops if you pass a rate as a count |
| `confidence` | You, before the test | 90, 95 or 99. Decide it before you look |

## 7. Before you trust it

- **Check the counts against your testing tool.** If GA4's sessions per variant differ from the tool's assignment counts by more than a few percent, something is not being recorded. The engine only needs the counts, so use the tool's numbers if they are cleaner.
- **Sessions are not people.** One person can bring several sessions to the same variant. If your testing tool reports users, prefer those counts.
- **Variant on later events.** If the variant parameter is sent only on `experience_impression`, check that GA4 attributes the key event to the same sessions before relying on the split. Google's docs do not settle this for every setup.
- **Thresholding.** GA4 can withhold or round small numbers in reports. If counts look rounded or are missing, take them from the testing tool instead.

## Sources

Checked on October 11, 2026.

- [Google Analytics MCP server](https://github.com/googleanalytics/google-analytics-mcp) (GitHub, Google) and [Google's MCP guide for Analytics](https://developers.google.com/analytics/devguides/MCP)
- [Integrate GA4 with A/B testing tools](https://developers.google.com/analytics/devguides/collection/ga4/integration), where the `experience_impression` event is defined
- [Data API advanced guide](https://developers.google.com/analytics/devguides/reporting/data/v1/advanced) and [API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [Data API changelog](https://developers.google.com/analytics/devguides/reporting/changelog), on key events replacing conversions in 2024
- [Custom dimensions and metrics](https://support.google.com/analytics/answer/14240153) (Analytics Help)
