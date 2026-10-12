# Recipe: HubSpot deals into `pipeline-and-forecast`

HubSpot's MCP server supplies the deals. The `pipeline-and-forecast` engine does the arithmetic: a weighted forecast, commit against best case, coverage against what your own win rate requires, the gap, and the one lever to pull. The vendor brings the data and the engine brings the verdict, so the agent never estimates a number it could compute.

**You need:** a HubSpot account you can sign in to, an AI client that supports remote MCP servers, and the AAJ engines, either installed or as the hosted connector.

## 1. Connect HubSpot

HubSpot's remote MCP server is at `https://mcp.hubspot.com`. You sign in with OAuth, and every action runs with your own HubSpot permissions.

- **Claude:** Settings → Connectors → HubSpot → Connect (a paid Claude plan).
- **ChatGPT:** Settings → Apps → HubSpot. A HubSpot Super Admin approves it first.
- **Other clients:** create an MCP connector in HubSpot (Development → MCP Connectors) and use its client ID and secret in any client that supports OAuth with PKCE.

The server can also write to your CRM; HubSpot asks you to confirm each write. This recipe only reads.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp` as a custom connector. The engine is `pipeline-and-forecast`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill pipeline-and-forecast`.

## 3. Give your agent this prompt

```
Use HubSpot to build this quarter's forecast with the AAJ pipeline-and-forecast engine.

1. With search_crm_objects (or query_crm_data), pull every open deal in the
   [pipeline name] pipeline whose closedate falls in [quarter dates]. For each deal
   I need: dealname, amount, dealstage. Leave out closed-won and closed-lost stages.
2. Get the win probability of every stage in that pipeline. If you cannot read the
   pipeline's stage settings, stop and ask me for them; do not guess.
3. Win rate: of the deals in this pipeline that closed in the last four quarters,
   the number closed-won divided by the number closed (won plus lost).
4. Target: [your quarter target in dollars].
5. Call run_engine with engine "pipeline-and-forecast" and input
   { target, winRate, stageProbabilities, deals }. Use the stage IDs exactly as
   HubSpot returns them, as the keys of stageProbabilities and as each deal's stage.
6. Report the engine's numbers as printed. Do not recompute or round them.
```

## 4. How HubSpot's fields map to the engine

| Engine input | From HubSpot | Note |
|---|---|---|
| `deals[].name` | `dealname` | Any label; it only appears in the output |
| `deals[].amount` | `amount` | HubSpot returns it as text; the engine reads numeric text. A deal with no amount stops the run and is named, so leave those out and list them separately |
| `deals[].stage` | `dealstage` | HubSpot returns the stage's internal ID, not its label. Use the same ID as the key in `stageProbabilities` |
| `stageProbabilities` | Each stage's win probability in the pipeline's settings | 0 to 1. Read through the MCP server if your connector exposes pipelines; otherwise copy them from the pipeline settings |
| `winRate` | Closed-won ÷ (closed-won + closed-lost), last four quarters | A count, not a value, unless you decide otherwise and say so |
| `target` | You | The engine never invents a target |

The input the engine receives looks like this (stage names here are placeholders for your IDs):

```json
{
  "target": 400000,
  "winRate": 0.25,
  "stageProbabilities": { "Discovery": 0.2, "Proposal": 0.6, "Contract sent": 0.9 },
  "deals": [
    { "name": "Example Co. renewal", "amount": 60000, "stage": "Proposal" },
    { "name": "Example Co. expansion", "amount": 120000, "stage": "Discovery" }
  ]
}
```

## 5. Before you trust it

- **Stage probabilities are the assumption that matters most.** HubSpot's defaults are someone else's numbers. Before quoting the forecast, replace them with your own historical stage-to-close rates (`sales-process-design` covers how).
- **Close dates drift.** A deal with a close date in the quarter is not a deal that will close in the quarter. The engine reports commit (deals at 75% or more) separately for that reason.
- **One pipeline at a time.** Stage IDs differ between pipelines, so run each pipeline separately.

## Sources

Checked on October 11, 2026.

- [Integrate with the remote HubSpot MCP server](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server) (HubSpot developer docs)
- [Set up and use the HubSpot connector for Claude](https://knowledge.hubspot.com/integrations/set-up-and-use-the-hubspot-connector-for-claude)
- [Connect your HubSpot account to ChatGPT](https://knowledge.hubspot.com/integrations/connect-your-hubspot-account-to-chatgpt)
- [HubSpot's default deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties)
- [CRM Pipelines API guide](https://developers.hubspot.com/docs/api-reference/2026-03/crm/pipelines/guide), where each stage's probability is `metadata.probability`
