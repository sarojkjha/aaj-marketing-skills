# Recipe: HubSpot deals into `pipeline-and-forecast`

HubSpot's MCP server supplies the deals. The `pipeline-and-forecast` engine does the arithmetic: what has closed won, a weighted forecast, commit against best case, coverage of what is left against what your own win rate requires, the gap, the chance of reaching the target, and the one lever to pull. The vendor brings the data and the engine brings the verdict, so the agent never estimates a number it could compute: it passes HubSpot's own rows, counts, probabilities and dates, and the engine does every sum, division and date comparison.

**You need:** a HubSpot account you can sign in to, an AI client that supports remote MCP servers, the AAJ engines (installed or as the hosted connector), your target for the quarter, and the quarter's first and last day.

## 1. Connect HubSpot

HubSpot's remote MCP server is at `https://mcp.hubspot.com`. You sign in with OAuth, and every action runs with your own HubSpot permissions.

- **Claude:** Settings → Connectors → Browse → HubSpot → Connect. It needs a paid Claude plan (Pro, Max, Team or Enterprise).
- **ChatGPT:** Settings → Apps → HubSpot → Connect.
- **Other clients:** create an MCP connector in HubSpot and use its client ID and secret in a client that supports OAuth with PKCE.

Super Admins, and users with App Marketplace Access, can connect straight away. Anyone else needs a Super Admin to approve the connector first.

The server can also create and update records. This recipe only reads, so set the connector's write tools to need approval and decline any write.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://mcp.aajconsult.com/mcp` as a custom connector. The engine is `pipeline-and-forecast`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill pipeline-and-forecast`.

## 3. Give your agent this prompt

```
Use HubSpot to build this quarter's forecast with the AAJ pipeline-and-forecast
engine. Read only; change nothing in HubSpot.

1. With search_properties, find the internal names of the deal properties
   Deal name, Amount, Deal stage, Close date, Pipeline, Deal probability,
   Is Closed Won and Is closed lost.
2. With search_crm_objects, get every open deal in the [pipeline name]
   pipeline, whatever its close date. For each deal I need the name, amount,
   deal stage, deal probability and close date. Leave out closed won and closed
   lost deals. Page through all results. Do not filter by close date yourself:
   the engine does that.
3. Closed won this quarter, same pipeline: every deal with Is Closed Won true
   and a close date from [first day] to [last day of the quarter]. I need the
   name and amount of each. Do not add them up.
4. Win rate counts, same pipeline, deals with a close date in the last four
   complete quarters: the number closed won and the number closed lost. Use the
   total HubSpot reports for each search (or a COUNT with query_crm_data). Do
   not count rows yourself and do not divide.
5. Target: [your quarter target].
6. Call run_engine with engine "pipeline-and-forecast" and input
   { target, wonDeals, lostDeals, periodEnd, asOf, closedWonDeals, deals }.
   periodEnd is [last day of the quarter] and asOf is today's date, both as
   YYYY-MM-DD. Each deal is { name, amount, stage, probability, closeDate },
   with the values exactly as HubSpot returns them. Each closed-won deal is
   { name, amount }.
7. Report the engine's numbers as printed. Do not recompute or round them.
   The engine names the deals behind each flag (after the period, close date
   passed, no close date): report those as printed too. List any deals you
   left out and why.
```

## 4. How HubSpot's fields map to the engine

| Engine input | From HubSpot | Note |
|---|---|---|
| `deals[].name` | Deal name | Any label; it only appears in the output |
| `deals[].amount` | Amount | "The total value of the deal in the deal's currency." HubSpot returns it as text; the engine reads numeric text. A deal with no amount stops the run and is named, so leave those out and list them separately |
| `deals[].stage` | Deal stage | HubSpot returns the stage's internal ID, not its label. With a probability on every deal it is only a label |
| `deals[].probability` | Deal probability | "The probability that the deal will close." HubSpot sets it from the stage's win probability when a deal changes stage, and stops updating it once someone edits it by hand. The engine takes a number from 0 to 1, the range HubSpot gives for a stage's probability, and stops and names the deal if a value is outside it |
| `deals[].closeDate` | Close date | "The day the deal is expected to close, or was closed." HubSpot returns a date and time in UTC; the engine reads the first ten characters as the date |
| `closedWonDeals` | Is Closed Won = true, close date in the quarter | The rows, not a total: the engine adds them. HubSpot sets a deal's close date to the day it moves into a closed-won stage, unless that automation is turned off in the pipeline's settings |
| `periodEnd` | You | The last day of the quarter. Deals dated after it are left out of the forecast and reported on their own line |
| `asOf` | Today's date | The engine never reads the clock. Open deals dated before it are still counted, and flagged |
| `wonDeals` | Is Closed Won = true, closed in the last four quarters | HubSpot's count. The engine works out the win rate as won ÷ (won + lost) |
| `lostDeals` | Is closed lost = true, same period | HubSpot's count. A count, not a value: a few large wins do not move it |
| `target` | You | The engine never invents a target |

The input the engine receives looks like this (Example Co. is fictional and so is every figure; stage names here stand in for HubSpot's stage IDs):

```json
{
  "target": 200000,
  "wonDeals": 12,
  "lostDeals": 36,
  "periodEnd": "2026-12-31",
  "asOf": "2026-11-25",
  "closedWonDeals": [
    { "name": "Example Co. pilot", "amount": "30000" }
  ],
  "deals": [
    { "name": "Example Co. renewal", "amount": "60000", "stage": "Proposal", "probability": "0.5", "closeDate": "2026-12-18T00:00:00.000Z" },
    { "name": "Example Co. expansion", "amount": "120000", "stage": "Discovery", "probability": "0.1", "closeDate": "2027-01-29T00:00:00.000Z" },
    { "name": "Example Co. new site", "amount": "90000", "stage": "Negotiation", "probability": "0.75", "closeDate": "2026-11-20T00:00:00.000Z" }
  ]
}
```

For that input the engine reports a 25% win rate (12 won of 48 closed), $30,000 closed won and $170,000 left to close. It leaves the $120,000 deal dated January out of the forecast, and flags the $90,000 deal whose close date has passed, both by name. The weighted forecast is $127,500 against the $200,000 target, coverage of what is left is 0.9x where the win rate needs about 4.0x, and the chance of reaching the target is 0%: even with both remaining deals won, the total is $20,000 short.

**To use your own stage rates instead of HubSpot's:** leave `probability` off the deals and add `stageProbabilities`, a number from 0 to 1 for each stage, keyed by the stage value HubSpot returns.

## 5. Before you trust it

- **Probabilities are the assumption that matters most.** A deal's probability in HubSpot is its stage's win probability from the pipeline's settings unless someone edited it by hand, and those settings may be the defaults. Before quoting the forecast, replace them with your own historical stage-to-close rates (`sales-process-design` covers how).
- **Close dates drift, and some are defaults.** When a deal is created in an open stage with no close date, HubSpot sets it to the last day of the month, or to the default in your deal settings. So a close date in the quarter is not a promise to close in the quarter. The engine reports commit (deals at 75% or more) separately for that reason, and flags every open deal whose date has passed.
- **Dates near the period end.** HubSpot returns Close date as a date and time in UTC and shows it in the viewer's time zone, so a deal within a day of the period end can land on the other side of it. Check the deals dated on the last day of the quarter and the first day of the next.
- **The chance treats each deal as closing on its own.** Deals that hang on the same budget or the same champion move together, so the real spread is wider than the figure.
- **The win rate counts deals, not dollars.** Four quarters of closed deals is the window this recipe uses; a short window with few closed deals swings the win rate, and the engine stops if nothing was won.
- **One pipeline at a time.** Stage IDs differ between pipelines, so run each pipeline separately.

## Sources

Checked on November 18, 2026. The default deal properties page, the properties API guide and the deal object definition were read again on November 25, 2026.

- [Integrate with the remote HubSpot MCP server](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server) (HubSpot developer docs): server URL, OAuth with PKCE, the tool list (`search_crm_objects`, `query_crm_data`, `search_properties`), and read and write access by object
- [Set up and use the HubSpot connector for Claude](https://knowledge.hubspot.com/integrations/set-up-and-use-the-hubspot-connector-for-claude): plans, approval, connection steps, write confirmation
- [Connect your HubSpot account to ChatGPT](https://knowledge.hubspot.com/integrations/connect-your-hubspot-account-to-chatgpt)
- [HubSpot's default deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties): Amount, Deal stage, Close date and when HubSpot sets it, Deal probability and when HubSpot updates it, Is Closed Won, Is closed lost
- [Deal object definition](https://developers.hubspot.com/docs/api-reference/2026-03/crm/objects/deals/object-definition.md) (HubSpot developer docs): Close date is a `datetime` property and Deal probability is a `number`
- [CRM API: Properties](https://developers.hubspot.com/docs/api-reference/latest/crm/properties/guide) (HubSpot developer docs): date and time values come back in ISO 8601, "All times are represented in UTC", and HubSpot shows a `datetime` in the viewer's time zone
- [CRM Pipelines API guide](https://developers.hubspot.com/docs/api-reference/2026-03/crm/pipelines/guide): a stage's `probability` is "a value between `0.0` and `1.0`"
- Engine spec: [pipeline-and-forecast](../docs/engines/pipeline-and-forecast.md)
