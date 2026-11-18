# Recipe: HubSpot contacts into `funnel-leak-finder`

HubSpot's MCP server supplies the contacts and the date each one entered a lifecycle stage. The `funnel-leak-finder` engine counts the funnel for two periods and names the stage that cost the most wins against the earlier period, with a check for whether the change may be noise. The vendor brings the data and the engine brings the verdict, so the agent never estimates a number it could compute: it passes HubSpot's dates as they are, and the engine does the counting.

**You need:** a HubSpot account you can sign in to, an AI client that supports remote MCP servers, the AAJ engines (installed or as the hosted connector), and two periods of the same length that have both ended.

## 1. Connect HubSpot

HubSpot's remote MCP server is at `https://mcp.hubspot.com`. You sign in with OAuth, and every action runs with your own HubSpot permissions.

- **Claude:** Settings → Connectors → Browse → HubSpot → Connect. It needs a paid Claude plan (Pro, Max, Team or Enterprise).
- **ChatGPT:** Settings → Apps → HubSpot → Connect.
- **Other clients:** create an MCP connector in HubSpot and use its client ID and secret in a client that supports OAuth with PKCE.

Super Admins, and users with App Marketplace Access, can connect straight away. Anyone else needs a Super Admin to approve the connector first.

The server can also create and update records. This recipe only reads, so set the connector's write tools to need approval and decline any write.

**No connection?** Export your contacts from HubSpot as CSV with the "Date entered" properties and drop the file on the [Funnel Leak Finder](https://aajconsult.com/tools/funnel-leak-finder). It counts the same way, in your browser, and uploads nothing.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://mcp.aajconsult.com/mcp` as a custom connector. The engine is `funnel-leak-finder`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill funnel-leak-finder`.

## 3. Give your agent this prompt

```
Use HubSpot to find where my funnel leaked, with the AAJ funnel-leak-finder
engine. Read only; change nothing in HubSpot.

This period: [start date] to [end date]. Previous period: [start date] to
[end date], the same length.

1. With search_properties, find the internal names of the contact properties
   "Date entered" for these lifecycle stages: Lead, Marketing Qualified Lead,
   Sales Qualified Lead, Opportunity and Customer.
2. With search_crm_objects, get every contact where any of those five dates is
   on or after the previous period's start date. For each contact I need only
   those five dates. Page through all results; if HubSpot stops before the
   end, tell me.
3. Build one object per contact: leads, mqls, sqls, opps and wins, each set to
   the date HubSpot returned for that stage, or null. Pass the dates exactly as
   returned. Do not count contacts, compare dates or drop anyone.
4. Ask me for website sessions for both periods if I want the funnel to start
   at sessions, and for revenue per win if I want the loss in money.
5. Call run_engine with engine "funnel-leak-finder" and input
   { contacts, dates: {from, to}, priorDates: {from, to} }, plus sessions,
   priorSessions and revenuePerWin if I gave them.
6. Report the engine's output as printed. Do not recompute or round it.
```

## 4. How HubSpot's fields map to the engine

| Engine input | From HubSpot | Note |
|---|---|---|
| `contacts[].leads` | Date entered "Lead" | "The date and time when the contact or company entered the stage." The engine uses the date as written |
| `contacts[].mqls` | Date entered "Marketing Qualified Lead" | |
| `contacts[].sqls` | Date entered "Sales Qualified Lead" | |
| `contacts[].opps` | Date entered "Opportunity" | |
| `contacts[].wins` | Date entered "Customer" | |
| `dates` | You | This period, as `YYYY-MM-DD`, both days included |
| `priorDates` | You | The period before, the same length. It becomes the baseline |
| `sessions`, `priorSessions` | You, from analytics | Optional. Sessions are not in HubSpot. Give both or neither |
| `revenuePerWin` | You | Optional. New revenue per win, to show the loss in money |

How the engine counts. This is the engine's method, the same one the Funnel Leak Finder uses for a HubSpot file:

- A contact belongs to a period if its **first** stage date falls in it.
- It counts for a stage if it entered that stage, or a later one, on or before the period's last day. A skipped stage counts as passed.
- So both periods get the same time to progress, and no stage is larger than the one before it.
- A contact with none of the five dates is left out, and the output says how many.

The input the engine receives has this shape (Example Co. is fictional). Three contacts are shown to keep it short; on their own they are too few for the engine to judge, and it says so:

```json
{
  "contacts": [
    { "leads": "2026-07-03T14:22:05Z", "mqls": "2026-07-20T09:10:00Z", "sqls": null, "opps": null, "wins": null },
    { "leads": "2026-07-08T11:02:41Z", "mqls": "2026-07-15T16:30:12Z", "sqls": "2026-08-01T10:00:00Z", "opps": "2026-08-12T13:45:00Z", "wins": "2026-09-02T15:20:00Z" },
    { "leads": "2026-04-11T08:15:00Z", "mqls": null, "sqls": null, "opps": null, "wins": null }
  ],
  "dates": { "from": "2026-07-01", "to": "2026-09-30" },
  "priorDates": { "from": "2026-04-01", "to": "2026-06-30" },
  "revenuePerWin": 18000
}
```

## 5. Before you trust it

- **Use periods that have ended.** A period still running has had less time to progress than the one before it, so every later stage looks like a leak.
- **Short sales cycles only fit short periods.** If a deal takes longer to close than the period lasts, few wins fall inside either period and the last stages are too thin to judge. The engine says when a change may be noise.
- **Default stages only.** The recipe reads HubSpot's default lifecycle stages. Custom stages are not counted; map them to the nearest default stage yourself, or leave them out.
- **Stage dates must exist.** HubSpot's "Date entered" properties are calculated and are kept when a contact moves back a stage. The older "Became a ... date" properties are cleared on a move back, so this recipe does not use them.
- **Large accounts.** Every contact goes through the agent. If that is too much for your client, use shorter periods or the file route above.
- **A leak is a place to look, not a cause.** The engine names the stage that cost the most wins against the earlier period. Why it fell is for whoever owns that stage to find.

## Sources

Checked on November 18, 2026.

- [Integrate with the remote HubSpot MCP server](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server) (HubSpot developer docs): server URL, OAuth with PKCE, the tool list (`search_crm_objects`, `search_properties`), and read and write access by object
- [Set up and use the HubSpot connector for Claude](https://knowledge.hubspot.com/integrations/set-up-and-use-the-hubspot-connector-for-claude): plans, approval, connection steps, write confirmation
- [Connect your HubSpot account to ChatGPT](https://knowledge.hubspot.com/integrations/connect-your-hubspot-account-to-chatgpt)
- [Use lifecycle stages](https://knowledge.hubspot.com/records/use-lifecycle-stages) (HubSpot Knowledge Base): the default stages, the "Date entered" properties, and what happens when a stage moves backward
- Engine spec: [funnel-leak-finder](../docs/engines/funnel-leak-finder.md)
