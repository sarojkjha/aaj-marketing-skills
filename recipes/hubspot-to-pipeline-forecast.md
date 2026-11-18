# Recipe: HubSpot deals into `pipeline-and-forecast`

HubSpot's MCP server supplies the deals. The `pipeline-and-forecast` engine does the arithmetic: a weighted forecast, commit against best case, coverage against what your own win rate requires, the gap, and the one lever to pull. The vendor brings the data and the engine brings the verdict, so the agent never estimates a number it could compute: it passes HubSpot's own counts and probabilities, and the engine does every division.

**You need:** a HubSpot account you can sign in to, an AI client that supports remote MCP servers, the AAJ engines (installed or as the hosted connector), and your target for the quarter.

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
2. With search_crm_objects, get every open deal in the [pipeline name] pipeline
   whose close date falls in [quarter dates]. For each deal I need the name,
   amount, deal stage and deal probability. Leave out closed won and closed lost
   deals. Page through all results.
3. Stage probabilities: take each stage's Deal probability from those deals. If
   deals in one stage show different probabilities, stop and show me; do not
   pick one.
4. Win rate counts, same pipeline, deals with a close date in the last four
   complete quarters: the number closed won and the number closed lost. Use the
   total HubSpot reports for each search (or a COUNT with query_crm_data). Do
   not count rows yourself and do not divide.
5. Target: [your quarter target].
6. Call run_engine with engine "pipeline-and-forecast" and input
   { target, wonDeals, lostDeals, stageProbabilities, deals }. Use the stage
   values exactly as HubSpot returns them, as the keys of stageProbabilities and
   as each deal's stage.
7. Report the engine's numbers as printed. Do not recompute or round them.
   List any deals you left out and why.
```

## 4. How HubSpot's fields map to the engine

| Engine input | From HubSpot | Note |
|---|---|---|
| `deals[].name` | Deal name | Any label; it only appears in the output |
| `deals[].amount` | Amount | "The total value of the deal in the deal's currency." HubSpot returns it as text; the engine reads numeric text. A deal with no amount stops the run and is named, so leave those out and list them separately |
| `deals[].stage` | Deal stage | HubSpot returns the stage's internal ID, not its label. Use the same ID as the key in `stageProbabilities` |
| `stageProbabilities` | Deal probability, by stage | "The probability that the deal will close." Pass it as a number from 0 to 1, the range HubSpot uses for a stage's probability. Every deal in a stage should carry the same value; if they differ, you decide which to use |
| `wonDeals` | Is Closed Won = true, closed in the last four quarters | HubSpot's count. The engine works out the win rate as won ÷ (won + lost) |
| `lostDeals` | Is closed lost = true, same period | HubSpot's count. A count, not a value: a few large wins do not move it |
| `target` | You | The engine never invents a target |

The input the engine receives looks like this (Example Co. is fictional; stage names here stand in for HubSpot's stage IDs):

```json
{
  "target": 200000,
  "wonDeals": 12,
  "lostDeals": 36,
  "stageProbabilities": { "Discovery": 0.1, "Proposal": 0.5, "Negotiation": 0.75 },
  "deals": [
    { "name": "Example Co. renewal", "amount": "60000", "stage": "Proposal" },
    { "name": "Example Co. expansion", "amount": 120000, "stage": "Discovery" },
    { "name": "Example Co. new site", "amount": 90000, "stage": "Negotiation" }
  ]
}
```

For that input the engine reports a 25% win rate (12 won of 48 closed), a weighted forecast of $109,500 against the $200,000 target, and coverage of 1.4x where the win rate needs about 4.0x.

## 5. Before you trust it

- **Stage probabilities are the assumption that matters most.** HubSpot's defaults are someone else's numbers. Before quoting the forecast, replace them with your own historical stage-to-close rates (`sales-process-design` covers how).
- **Close dates drift.** A deal with a close date in the quarter is not a deal that will close in the quarter. The engine reports commit (deals at 75% or more) separately for that reason.
- **The win rate counts deals, not dollars.** Four quarters of closed deals is the window this recipe uses; a short window with few closed deals swings the win rate, and the engine stops if nothing was won.
- **One pipeline at a time.** Stage IDs differ between pipelines, so run each pipeline separately.

## Sources

Checked on November 18, 2026.

- [Integrate with the remote HubSpot MCP server](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server) (HubSpot developer docs): server URL, OAuth with PKCE, the tool list (`search_crm_objects`, `query_crm_data`, `search_properties`), and read and write access by object
- [Set up and use the HubSpot connector for Claude](https://knowledge.hubspot.com/integrations/set-up-and-use-the-hubspot-connector-for-claude): plans, approval, connection steps, write confirmation
- [Connect your HubSpot account to ChatGPT](https://knowledge.hubspot.com/integrations/connect-your-hubspot-account-to-chatgpt)
- [HubSpot's default deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties): Amount, Deal stage, Close date, Deal probability, Is Closed Won, Is closed lost
- [CRM Pipelines API guide](https://developers.hubspot.com/docs/api-reference/2026-03/crm/pipelines/guide): a stage's `probability` is "a value between `0.0` and `1.0`"
- Engine spec: [pipeline-and-forecast](../docs/engines/pipeline-and-forecast.md)
