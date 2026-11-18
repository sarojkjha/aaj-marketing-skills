# Recipe: Google Ads data into `paid-search-account-audit`

Google's Google Ads MCP server supplies the account data: campaigns, search terms and landing pages for one period. The `paid-search-account-audit` engine does the judging: account, brand and non-brand CPA, the spend that produced nothing, starved winners, the terms to negate and the winners to add, and one fix list ranked blocking-first. The vendor brings the data and the engine brings the verdict, so the agent never estimates a number it could compute.

**You need:** a Google Ads account you can sign in to, a Google Cloud project with the Google Ads API enabled, an AI client that supports MCP servers, the AAJ engines (installed or as the hosted connector), and your target cost per conversion.

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

**No API access yet?** Download the campaign, search terms and landing page reports and drop them on the [Google Ads Account Audit](https://aajconsult.com/tools/google-ads-account-audit). It runs the same engine in your browser and uploads nothing.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://mcp.aajconsult.com/mcp` as a custom connector. The engine is `paid-search-account-audit`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill paid-search-account-audit`.

## 3. Give your agent this prompt

```
Use the Google Ads MCP server to audit account [customer ID] with the AAJ
paid-search-account-audit engine. Read only; change nothing in the account.

1. With the search tool, run these three queries for the same period,
   LAST_30_DAYS. If a field is refused, check it with get_resource_metadata
   and tell me; do not swap in another field.

   Campaigns:
   SELECT campaign.name, campaign.advertising_channel_type,
     campaign.bidding_strategy_type, campaign.network_settings.target_search_network,
     campaign.network_settings.target_content_network,
     campaign.geo_target_type_setting.positive_geo_target_type,
     metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions,
     metrics.search_budget_lost_impression_share,
     metrics.search_rank_lost_impression_share
   FROM campaign
   WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'

   Search terms (the 500 with the most spend):
   SELECT search_term_view.search_term, search_term_view.status,
     metrics.cost_micros, metrics.clicks, metrics.conversions
   FROM search_term_view
   WHERE segments.date DURING LAST_30_DAYS
   ORDER BY metrics.cost_micros DESC LIMIT 500

   Landing pages:
   SELECT landing_page_view.unexpanded_final_url,
     metrics.cost_micros, metrics.clicks, metrics.conversions
   FROM landing_page_view
   WHERE segments.date DURING LAST_30_DAYS

2. Divide every cost_micros by 1,000,000. Add up rows that share a search term
   or a landing page URL.
3. Show me the Search campaigns and ask which are brand, which are competitor,
   and which mix brand and non-brand terms. Do not guess from the names.
4. Ask me for: my target cost per conversion, in the account's currency; any
   regex patterns for terms that can never convert for me; and which setup items
   I have checked in the account. Leave out any item nobody has checked.
5. Build the input with the mapping in this recipe and call run_engine with
   engine "paid-search-account-audit".
6. Report the engine's numbers as printed. Do not recompute or round them.
   List any campaigns you left out and why.
```

## 4. How Google Ads fields map to the engine

**Campaigns**

| Engine input | From Google Ads | Note |
|---|---|---|
| `campaigns[].name` | `campaign.name` | Any label; it only appears in the output |
| `campaigns[].type` | You, for `SEARCH` campaigns; `advertising_channel_type` for the rest | `SEARCH` becomes `brand`, `competitor`, `non-brand` or `mixed`, as you say. `PERFORMANCE_MAX` becomes `pmax`, `DISPLAY` becomes `display`, `SHOPPING` becomes `shopping`. Leave other types out (video, Demand Gen, app and so on) and list them |
| `campaigns[].brandExcluded` | You, for each `pmax` campaign | `true` only if brand exclusions are set. Without it the engine asks whether Performance Max is claiming brand searches |
| `campaigns[].spend` | `metrics.cost_micros` ÷ 1,000,000 | In the account's currency, the same as your target |
| `campaigns[].clicks`, `.impressions` | `metrics.clicks`, `metrics.impressions` | |
| `campaigns[].conversions` | `metrics.conversions` | Only conversion actions included in the Conversions column. Can be fractional |
| `campaigns[].bidStrategy` | `campaign.bidding_strategy_type` | `MANUAL_CPC` → `manual`, `TARGET_SPEND` (Maximize clicks) → `maximize-clicks`, `MAXIMIZE_CONVERSIONS` → `maximize-conversions`, `TARGET_CPA` → `target-cpa`, `TARGET_ROAS` → `target-roas`. Pass `MAXIMIZE_CONVERSION_VALUE` as `maximize-conversions` so the same data check applies. Any other strategy: pass its name in lower case; the engine prints it and applies no bidding check |
| `campaigns[].lostToBudget` | `metrics.search_budget_lost_impression_share` | A share from 0 to 0.9, passed as is. Google reports anything above 90% as 0.9001. Leave it out where Google returns none |
| `campaigns[].lostToRank` | `metrics.search_rank_lost_impression_share` | As above |

**Search terms**

| Engine input | From Google Ads | Note |
|---|---|---|
| `searchTerms[].term` | `search_term_view.search_term` | One row per term, summed across ad groups |
| `searchTerms[].spend`, `.clicks`, `.conversions` | `metrics.cost_micros` ÷ 1,000,000, `metrics.clicks`, `metrics.conversions` | |
| `searchTerms[].isKeyword` | `search_term_view.status` | `true` for `ADDED` or `ADDED_EXCLUDED` |
| `searchTerms[].negated` | `search_term_view.status` | `true` for `EXCLUDED` or `ADDED_EXCLUDED`, so a term you already blocked is not flagged again |
| `irrelevantPatterns` | You | Regexes for terms that can never convert for you. The engine never invents them |

**Landing pages**

| Engine input | From Google Ads | Note |
|---|---|---|
| `landingPages[].url` | `landing_page_view.unexpanded_final_url` | The final URL as you entered it |
| `landingPages[].spend`, `.clicks`, `.conversions` | `metrics.cost_micros` ÷ 1,000,000, `metrics.clicks`, `metrics.conversions` | |
| `landingPages[].messageMatch`, `.mobileOk` | You | Only if someone has looked at the page. Leave them out otherwise |

**Setup**

| Engine input | From Google Ads | Note |
|---|---|---|
| `setup.searchPartnersReviewed` | `campaign.network_settings.target_search_network` | `true` if it is off on every Search campaign. If it is on, `true` only if you have compared partner results with Google search |
| `setup.displayExpansionOff` | `campaign.network_settings.target_content_network` | `true` if it is off on every Search campaign; on a Search campaign it is Display Expansion |
| `setup.geoPresenceOnly` | `campaign.geo_target_type_setting.positive_geo_target_type` | `true` if every campaign is `PRESENCE`; `false` if any is `PRESENCE_OR_INTEREST` or `SEARCH_INTEREST` |
| `setup.brandSeparated` | You | `true` if no campaign mixes brand and non-brand terms |
| `setup.conversionTrackingVerified`, `.offlineConversionsImported`, `.sharedNegativeLists`, `.autoApplyOff`, `.assetsComplete` | You | Only what you have checked in the account. An item left out counts as not done |
| `targetCpa` | You | From your unit economics, in the account's currency. The engine never invents a target |

The input the engine receives looks like this (Example Co. is fictional):

```json
{
  "targetCpa": 250,
  "setup": { "conversionTrackingVerified": true, "brandSeparated": true, "searchPartnersReviewed": true, "displayExpansionOff": true, "geoPresenceOnly": false },
  "campaigns": [
    { "name": "Example Co. brand", "type": "brand", "spend": 900, "clicks": 1500, "impressions": 5000, "conversions": 60, "bidStrategy": "manual", "lostToBudget": 0.02, "lostToRank": 0.05 },
    { "name": "Scheduling software", "type": "non-brand", "spend": 4200, "clicks": 700, "impressions": 21000, "conversions": 21, "bidStrategy": "target-cpa", "lostToBudget": 0.35, "lostToRank": 0.2 }
  ],
  "searchTerms": [
    { "term": "free scheduling app", "spend": 610, "clicks": 150, "conversions": 0, "isKeyword": false, "negated": false },
    { "term": "plumbing dispatch app", "spend": 420, "clicks": 70, "conversions": 4, "isKeyword": false, "negated": false }
  ],
  "irrelevantPatterns": ["free", "jobs?", "salary"],
  "landingPages": [
    { "url": "https://example.com/field-service-scheduling", "spend": 4200, "clicks": 1300, "conversions": 51 }
  ]
}
```

## 5. Before you trust it

- **Conversions are only as good as the tracking.** `metrics.conversions` counts the conversion actions included in the Conversions column. If one of them is a page view, every CPA in the output is wrong. Check this first; until it is checked, the engine's verdict is "foundations".
- **The target is yours.** The engine judges the account against your target CPA only. Without one it cannot name a starved winner or a campaign far over target.
- **The thresholds are the engine's rules, not benchmarks.** Ten clicks before a term or page is judged, 30 conversions before automated bidding is trusted, and 20% of impressions lost to budget for a starved winner.
- **One period of attributed conversions.** The engine cannot tell whether brand spend is incremental; `incrementality-and-mmm` covers that.
- **The search terms are the top 500 by spend.** Terms below that are not in the audit. Raise the limit if your agent can carry more.
- **Review before acting.** Whoever runs the account checks the findings in Google Ads before adding negatives or moving budget.

## Sources

Checked on November 17, 2026.

- [Google Ads MCP server](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server) (Google Ads API docs): tools, what the server cannot change, read-only `tools_config.yaml`, API access levels, the developer token change, Claude and ChatGPT setup
- [googleads/google-ads-mcp](https://github.com/googleads/google-ads-mcp) (GitHub): install command, environment variables, OAuth scope, license
- [Campaign fields](https://developers.google.com/google-ads/api/fields/v26/campaign) and [search term view fields](https://developers.google.com/google-ads/api/fields/v26/search_term_view) (Google Ads API reference)
- [Metrics](https://developers.google.com/google-ads/api/reference/rpc/v25/Metrics): what `conversions` includes, and impression share lost reported from 0 to 0.9, with 0.9001 for anything above
- [Money](https://developers.google.com/google-ads/api/reference/rpc/v21/Money): "One million is equivalent to one unit"
- [LandingPageView](https://developers.google.com/google-ads/api/reference/rpc/v25/LandingPageView): `unexpanded_final_url` is "the advertiser-specified final URL"
- [AdvertisingChannelType](https://developers.google.com/google-ads/api/reference/rpc/v25/AdvertisingChannelTypeEnum.AdvertisingChannelType) and [BiddingStrategyType](https://developers.google.com/google-ads/api/reference/rpc/v25/BiddingStrategyTypeEnum.BiddingStrategyType): `TARGET_SPEND` "sets your bids to help get as many clicks as possible within your budget"
- [Campaign.NetworkSettings](https://developers.google.com/google-ads/api/reference/rpc/v25/Campaign.NetworkSettings): `target_search_network` is the Search Partners setting
- [PositiveGeoTargetType](https://developers.google.com/google-ads/api/reference/rpc/v25/PositiveGeoTargetTypeEnum.PositiveGeoTargetType)
- [Optional components of Search](https://developers.google.com/google-ads/scripts/docs/campaigns/search/optional-components) (Google Ads scripts docs): Display Expansion is `targetContentNetwork` on a Search campaign
- Engine spec: [paid-search-account-audit](../docs/engines/paid-search-account-audit.md)
