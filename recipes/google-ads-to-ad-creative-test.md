# Recipe: Google Ads test results into `ad-creative-testing`

Google's Google Ads MCP server supplies the results of a creative test: impressions, clicks, conversions and cost for each variant. The `ad-creative-testing` engine reads them honestly: the rate for each variant with its interval, the lift, a significance test corrected for the number of variants, and a refusal to name a winner when delivery was uneven or the data is too thin. The vendor brings the data and the engine brings the verdict, so the agent never estimates a number it could compute.

**You need:** a Google Ads account you can sign in to, a Google Cloud project with the Google Ads API enabled, an AI client that supports MCP servers, and the AAJ engines, installed or as the hosted connector.

## Pick the route before you start

How Google split the traffic decides whether the test can be read at all.

- **A Google Ads experiment (best).** An experiment has a control arm and a trial arm, each a campaign, with a traffic split you set. Put the new creative in the trial campaign. Google's docs say "traffic is split between the control and treatment campaigns during the experiment."
- **Ads in one ad group (often unreadable).** Google's ad rotation setting decides how often each ad serves. On "Optimize" it "prioritizes ads that are expected to perform better than other ads within an ad group," and with Smart Bidding Google uses Optimize automatically. The ads then reach different people in different numbers, and the engine refuses to name a winner when one variant got more than twice another's impressions. That refusal is the engine's rule, not a benchmark.

## 1. Connect Google Ads

Google's server is open source ([googleads/google-ads-mcp](https://github.com/googleads/google-ads-mcp), Apache-2.0). It reads the account through the Google Ads API with your own Google sign-in.

- **Local, in a coding agent:** Python 3.10 or later, `pipx` and the `gcloud` CLI. Sign in with Application Default Credentials using the `https://www.googleapis.com/auth/adwords` scope, then run `pipx run --spec git+https://github.com/googleads/google-ads-mcp.git google-ads-mcp`. Set `GOOGLE_ADS_LOGIN_CUSTOMER_ID` if you reach the account through a manager account.
- **Claude or ChatGPT:** deploy the server to Cloud Run, then add a custom connector with the service URL plus `/mcp`, using your OAuth client ID and secret.

Two things stop most first runs:

- **API access level.** Enabling the API gives your Cloud project Test access, which cannot read a live account. Live accounts need Explorer, Basic or Standard access; otherwise every call fails with `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`. Google stopped using developer tokens on September 9, 2026; the Cloud project's access level is what counts now.
- **Write tools.** The server can create assets and manage labels. It cannot change campaigns, ad groups, ads, budgets or bids. This recipe only reads, so turn the write tools off in `tools_config.yaml`:

```yaml
namespaces:
  customers: true
  search: true
  metadata: true
  labels: false
  assets: false
```

Keep the first three lines: when `namespaces` is set, any category it leaves out is turned off.

**No API access yet?** Type the numbers for each variant into the [Ad Creative Test Calculator](https://aajconsult.com/tools/ad-creative-test-calculator). It runs the same engine in your browser and uploads nothing.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://mcp.aajconsult.com/mcp` as a custom connector. The engine is `ad-creative-testing`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill ad-creative-testing`.

## 3. Give your agent this prompt

For an experiment:

```
Use the Google Ads MCP server to read my creative test in account [customer ID]
with the AAJ ad-creative-testing engine. Read only; change nothing.

1. With the search tool, list the experiments and their arms:
   SELECT experiment.name, experiment.status, experiment.start_date,
     experiment.end_date, experiment_arm.name, experiment_arm.control,
     experiment_arm.traffic_split, experiment_arm.campaigns
   FROM experiment_arm
   Show me the list and ask which experiment to read.
2. Get the results for that experiment's arm campaigns, for the experiment's
   own dates:
   SELECT campaign.resource_name, campaign.name, metrics.impressions,
     metrics.clicks, metrics.conversions, metrics.cost_micros
   FROM campaign
   WHERE campaign.resource_name IN ([the arm campaigns])
     AND segments.date BETWEEN '[start date]' AND '[end date]'
   If a field is refused, check it with get_resource_metadata and tell me; do
   not swap in another field.
3. Build one variant per arm, the control arm first: name, impressions, clicks,
   conversions, and spend = cost_micros divided by 1,000,000. Pass the other
   numbers as Google returns them.
4. Ask me what each trial arm changes (one thing), and which metric to judge:
   cpi (conversions per impression), ctr or cvr. Do not guess either.
5. Call run_engine with engine "ad-creative-testing" and input
   { "metric": ..., "read": { "variants": [ ... ] } }.
6. Report the engine's output as printed, with each arm's traffic split. Do not
   recompute or round it, and do not name a winner the engine did not name.
```

For ads in one ad group, replace steps 1 and 2 with this query, and tell me the ad rotation and bid strategy before running the engine:

```
SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
  ad_group.name, ad_group.ad_rotation_mode, campaign.name,
  campaign.ad_serving_optimization_status, campaign.bidding_strategy_type,
  metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros
FROM ad_group_ad
WHERE ad_group.id = [ad group ID] AND ad_group_ad.status = 'ENABLED'
  AND segments.date BETWEEN '[start date]' AND '[end date]'
```

## 4. How Google Ads fields map to the engine

| Engine input | From Google Ads | Note |
|---|---|---|
| `read.variants[]` order | `experiment_arm.control`, or you | The control goes first: "the arm against which the other arms are compared." For ads in an ad group, you say which ad is the control |
| `read.variants[].name` | `experiment_arm.name`, or the ad's name or ID | A label; it only appears in the output |
| `read.variants[].change` | You | The one thing this variant changes. Leave it empty for the control |
| `read.variants[].impressions` | `metrics.impressions` | |
| `read.variants[].clicks` | `metrics.clicks` | |
| `read.variants[].conversions` | `metrics.conversions` | Only conversion actions included in the Conversions column. Can be fractional |
| `read.variants[].spend` | `metrics.cost_micros` ÷ 1,000,000 | Optional. In the account's currency. Used for cost per conversion |
| `metric` | You | `cpi` (conversions per impression, the default), `ctr` or `cvr` |

Two fields are for you to read, not for the engine:

- `experiment_arm.traffic_split`: the share of traffic each arm was set to get, from 1 to 100, adding up to 100 across the arms. A split wider than 2 to 1 trips the engine's uneven delivery rule.
- `ad_group.ad_rotation_mode` and `campaign.ad_serving_optimization_status`: `OPTIMIZE` means Google chose which ad to show more.

The input the engine receives looks like this (Example Co. is fictional):

```json
{
  "metric": "cpi",
  "read": {
    "variants": [
      { "name": "Control: product shot", "change": "", "impressions": 98000, "clicks": 980, "conversions": 196, "spend": 2900 },
      { "name": "Trial: customer quote", "change": "Headline is a customer quote", "impressions": 101000, "clicks": 1160, "conversions": 262, "spend": 3000 }
    ]
  }
}
```

For that input the engine reports 0.200% for the control and 0.259% for the trial, a 30% lift with p = 0.0057, and says the trial beats the control.

## 5. Before you trust it

- **The engine cannot see how the test was set up.** It reads the numbers it is given. Whether the arms differed in one thing only, and ran over the same dates, is for you to check.
- **Uneven delivery stops the read.** When one variant got more than twice another's impressions, the engine says "not a clean read" and names no winner, whatever the p-value. Re-run as an experiment with an even split.
- **Pick the metric before you look.** Choosing the metric after seeing which one a variant wins on is how noise becomes a "winner". In AAJ's view, judge on conversions per impression unless clicks are the goal.
- **Conversions are only as good as the tracking.** `metrics.conversions` counts the conversion actions included in the Conversions column. Google can report fractions of a conversion; the engine's test treats them as counts, so read a narrow result with care.
- **Small numbers are refused.** With fewer than 10 events in any variant, the engine reads nothing. That is its rule.
- **A win is for this audience and this period.** The engine reports what happened in the test. It cannot say the lift will hold when the ad runs longer or reaches other people.

## Sources

Checked on November 18, 2026.

- [Google Ads MCP server](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server) (Google Ads API docs): tools, what the server cannot change, read-only `tools_config.yaml`, API access levels
- [googleads/google-ads-mcp](https://github.com/googleads/google-ads-mcp) (GitHub): install command, environment variables, OAuth scope, license
- [Experiments overview](https://developers.google.com/google-ads/api/docs/experiments/overview) (Google Ads API docs): control and treatment arms, and the traffic split
- [ExperimentArm](https://developers.google.com/google-ads/api/reference/rpc/v25/ExperimentArm) and [Experiment](https://developers.google.com/google-ads/api/reference/rpc/v25/Experiment) (Google Ads API reference): `control`, `traffic_split`, `campaigns`, `start_date`, `end_date`
- [Ad group ad fields](https://developers.google.com/google-ads/api/fields/v26/ad_group_ad) (Google Ads API reference)
- [AdGroupAdRotationMode](https://developers.google.com/google-ads/api/reference/rpc/v25/AdGroupAdRotationModeEnum.AdGroupAdRotationMode) and [AdServingOptimizationStatus](https://developers.google.com/google-ads/api/reference/rpc/v25/AdServingOptimizationStatusEnum.AdServingOptimizationStatus) (Google Ads API reference)
- [Use ad rotation](https://support.google.com/google-ads/answer/112876) (Google Ads Help): what Optimize does, and that Smart Bidding uses it automatically
- [Metrics](https://developers.google.com/google-ads/api/reference/rpc/v25/Metrics) and [Money](https://developers.google.com/google-ads/api/reference/rpc/v21/Money) (Google Ads API reference): what `conversions` includes, and micros
- Engine spec: [ad-creative-testing](../docs/engines/ad-creative-testing.md)
